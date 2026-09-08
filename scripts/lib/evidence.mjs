import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"

export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex")
export function identity(cwd = process.cwd()) {
  const git = (...args) =>
    execFileSync("git", args, { encoding: "utf8", cwd }).trim()
  return {
    head: git("rev-parse", "HEAD"),
    tree: git("rev-parse", "HEAD^{tree}"),
    dirty: git("status", "--porcelain=v1", "--untracked-files=all") !== "",
  }
}
export function requireExactHead(state) {
  if (state.dirty)
    throw new Error(
      "Exact-head evidence requires a clean worktree, including untracked files",
    )
  const expected = process.env.CHARDIN_PR_HEAD
  if (!expected || !/^[a-f0-9]{40}$/.test(expected) || expected !== state.head)
    throw new Error(
      "CHARDIN_PR_HEAD must equal the full independently verified PR head SHA",
    )
}
