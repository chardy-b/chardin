import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeSync,
} from "node:fs"
import { randomUUID } from "node:crypto"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { sha256 } from "./evidence.mjs"

// The checkout and its owner are trusted. Reject static redirects and collisions;
// no portable Node API can defend against a hostile same-UID ancestor rename.
export function contained(root, path) {
  const base = resolve(root)
  const target = resolve(base, path)
  const rel = relative(base, target)
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel))
    throw new Error("Evidence path escapes containment")
  return target
}

export function safeDirectory(path, create = false) {
  const target = resolve(path)
  const parent = dirname(target)
  if (parent !== target) safeDirectory(parent, create)
  if (create) {
    try {
      mkdirSync(target, { mode: 0o700 })
      syncDirectory(parent)
    } catch (error) {
      if (error.code !== "EEXIST") throw error
    }
  }
  if (!lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink())
    throw new Error("Evidence directory must not be a symlink or non-directory")
  return target
}

function syncDirectory(path) {
  const fd = openSync(
    path,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  )
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

export function readRegular(root, path) {
  const target = contained(root, path)
  safeDirectory(dirname(target))
  const stat = lstatSync(target)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw new Error("Evidence input must be a regular, unlinked file")
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const opened = fstatSync(fd)
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.ino !== stat.ino ||
      opened.dev !== stat.dev
    )
      throw new Error("Evidence input changed during open")
    return readFileSync(fd)
  } finally {
    closeSync(fd)
  }
}

export function exclusiveLog(root, path) {
  const target = contained(root, path)
  safeDirectory(dirname(target), true)
  const fd = openSync(
    target,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL |
      constants.O_NOFOLLOW,
    0o600,
  )
  fsyncSync(fd)
  syncDirectory(dirname(target))
  let closed = false
  return {
    write(bytes) {
      if (closed) throw new Error("Evidence log is closed")
      const buffer = Buffer.from(bytes)
      let offset = 0
      while (offset < buffer.length) offset += writeSync(fd, buffer, offset)
      fsyncSync(fd)
    },
    close() {
      if (!closed) {
        fsyncSync(fd)
        closeSync(fd)
        closed = true
      }
    },
  }
}

export function writeExclusive(root, path, bytes) {
  const log = exclusiveLog(root, path)
  try {
    log.write(bytes)
  } finally {
    log.close()
  }
}
export function writeJson(root, path, value) {
  writeExclusive(root, path, JSON.stringify(value, null, 2) + "\n")
}

export function reserveAttempt({
  cwd = process.cwd(),
  head,
  gate,
  id = randomUUID(),
  metadata = {},
}) {
  if (
    !/^[a-f0-9]{40}$/.test(head) ||
    !/^[a-z][a-z0-9-]*$/.test(gate) ||
    !/^[a-zA-Z0-9-]+$/.test(id)
  )
    throw new Error("Invalid evidence identity or attempt name")
  const root = realpathSync(cwd)
  const parent = safeDirectory(
    contained(root, `.hermes/execution/chardin/release/${head}`),
    true,
  )
  const dir = join(parent, `${gate}-${id}`)
  mkdirSync(dir, { mode: 0o700 }) // Exclusive: EEXIST is fatal, never reuse.
  syncDirectory(parent)
  writeJson(dir, "started.json", {
    schema: 2,
    ...metadata,
    head,
    gate,
    id,
    start: new Date().toISOString(),
    status: "incomplete",
  })
  return dir
}

export function inventory(dir) {
  safeDirectory(dir)
  const entries = []
  const walk = (folder) => {
    for (const name of readdirSync(folder).sort()) {
      const path = join(folder, name)
      const stat = lstatSync(path)
      if (stat.isSymbolicLink())
        throw new Error("Symlink in evidence artifacts")
      if (stat.isDirectory()) walk(path)
      else {
        const bytes = readRegular(dir, path)
        entries.push({
          path: relative(dir, path).split(sep).join("/"),
          bytes: bytes.length,
          sha256: sha256(bytes),
        })
      }
    }
  }
  walk(dir)
  return entries
}

export function finalizeAttempt(dir, result) {
  writeJson(dir, "result.json", {
    schema: 2,
    ...result,
    end: new Date().toISOString(),
  })
  const artifacts = inventory(dir)
  writeJson(dir, "manifest.json", { schema: 2, artifacts })
  writeExclusive(
    dir,
    "manifest.sha256",
    sha256(readRegular(dir, "manifest.json")) + "\n",
  )
}

// A terminal result alone is insufficient: interrupted finalization is incomplete.
export function readAttempt(dir) {
  safeDirectory(dir)
  if (!existsSync(join(dir, "started.json")))
    return { status: "incomplete", reason: "Started record was not persisted" }
  let started
  try {
    started = JSON.parse(readRegular(dir, "started.json"))
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error
    return { status: "incomplete", reason: "Started record is partial" }
  }
  if (!existsSync(join(dir, "manifest.sha256")))
    return { ...started, status: "incomplete" }
  const seal = readRegular(dir, "manifest.sha256").toString().trim()
  if (!/^[a-f0-9]{64}$/.test(seal)) return { ...started, status: "incomplete" }
  const bytes = readRegular(dir, "manifest.json")
  if (sha256(bytes) !== seal) throw new Error("Manifest hash mismatch")
  const manifest = JSON.parse(bytes)
  const actual = inventory(dir).filter(
    ({ path }) => !["manifest.json", "manifest.sha256"].includes(path),
  )
  if (JSON.stringify(actual) !== JSON.stringify(manifest.artifacts))
    throw new Error("Artifact hash or membership mismatch")
  return JSON.parse(readRegular(dir, "result.json"))
}
