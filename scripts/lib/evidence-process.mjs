import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"
import { StringDecoder } from "node:string_decoder"
import { stripVTControlCharacters } from "node:util"
import { exclusiveLog, writeJson } from "./evidence-store.mjs"

export function sanitizedStream(write, scanner = false) {
  const decoder = new StringDecoder("utf8")
  let pending = ""
  let dropped = false
  const emit = (line) => {
    if (scanner) {
      try {
        const finding = JSON.parse(line)
        // Do not retain arbitrary scanner fields/diagnostics or credentials.
        write(
          JSON.stringify({
            detector:
              typeof finding.DetectorName === "string" &&
              /^[a-zA-Z0-9 _-]{1,80}$/.test(finding.DetectorName)
                ? finding.DetectorName
                : "diagnostic",
            verified: finding.Verified === true,
          }) + "\n",
        )
      } catch {
        write("[scanner diagnostic omitted]\n")
      }
    } else {
      write(
        stripVTControlCharacters(line).replace(
          /(authorization["']?\s*[:=]\s*["']?\s*(?:bearer\s+)?|(?:token|password|secret)["']?\s*[:=]\s*["']?)[^\s",}]+/gi,
          "$1[REDACTED]",
        ) + "\n",
      )
    }
  }
  const consume = (text) => {
    for (const part of text.split(/(?<=\n)/)) {
      if (!dropped) pending += part
      if (pending.length > 65536) {
        write("[oversized log line omitted]\n")
        pending = ""
        dropped = true
      }
      if (part.endsWith("\n")) {
        if (!dropped) emit(pending.slice(0, -1))
        pending = ""
        dropped = false
      }
    }
  }
  return {
    write: (bytes) => consume(decoder.write(Buffer.from(bytes))),
    end() {
      consume(decoder.end())
      if (pending) emit(pending)
      pending = ""
    },
  }
}

// Linux subreaper ownership is required because Playwright creates new groups.
// Other platforms must supply equivalent job ownership before collecting evidence.
export function processOwner({ graceMs = 5000 } = {}) {
  if (process.platform !== "linux")
    throw new Error("Evidence process ownership requires Linux and Python 3")
  let activeStop
  let interrupted = null
  const interrupt = (signal) => {
    interrupted ??= signal
    activeStop?.()
  }
  const onInt = () => interrupt("SIGINT")
  const onTerm = () => interrupt("SIGTERM")
  process.on("SIGINT", onInt)
  process.on("SIGTERM", onTerm)
  return {
    get interrupted() {
      return interrupted
    },
    async run({
      command,
      cwd,
      env,
      dir,
      name,
      timeoutMs,
      scanner = false,
      jsonPath = null,
    }) {
      // All durable files are reserved before spawn, including spawn failures.
      writeJson(dir, `${name}.started.json`, {
        command,
        status: "incomplete",
        start: new Date().toISOString(),
      })
      const stdout = exclusiveLog(dir, `${name}.stdout.log`)
      const stderr = exclusiveLog(dir, `${name}.stderr.log`)
      const rawJson = jsonPath ? exclusiveLog(dir, jsonPath) : null
      const outputs = [stdout, stderr].map((log) =>
        sanitizedStream((text) => {
          log.write(text)
          process.stdout.write(text)
        }, scanner),
      )
      let code = null
      let signal = null
      let spawnError = null
      let primaryResult
      let control = ""
      let outputError = null
      let timedOut = false
      let child
      let cleanup
      let killTimer
      let pollTimer
      let deadline
      let resolveCleanup
      let closed = false
      let resolveClosed
      const closedPromise = new Promise((resolve) => {
        resolveClosed = resolve
      })
      const groupSignal = (sig) => {
        if (!child?.pid) return false
        try {
          process.kill(-child.pid, sig)
          return true
        } catch (error) {
          if (error.code === "ESRCH") return false
          throw error
        }
      }
      const stop = () => {
        if (cleanup) return cleanup
        cleanup = new Promise((resolve) => {
          resolveCleanup = resolve
        })
        if (!groupSignal("SIGTERM")) {
          resolveCleanup()
          return cleanup
        }
        // The leader may close its pipes before an uncooperative grandchild exits.
        // Never cancel escalation merely because the leader emitted close.
        pollTimer = setInterval(() => {
          if (!groupSignal(0)) {
            clearTimeout(killTimer)
            clearInterval(pollTimer)
            resolveCleanup()
          }
        }, 25)
        killTimer = setTimeout(() => {
          groupSignal("SIGKILL")
          clearInterval(pollTimer)
          resolveCleanup()
        }, graceMs)
        return cleanup
      }
      activeStop = stop
      try {
        if (interrupted) {
          signal = interrupted
          closed = true
          resolveClosed()
        } else {
          child = spawn(
            "python3",
            [
              fileURLToPath(
                new URL("./evidence-supervisor.py", import.meta.url),
              ),
              JSON.stringify(command),
              String(graceMs * 0.6),
              String(process.pid),
            ],
            {
              cwd,
              env,
              detached: true,
              stdio: ["ignore", "pipe", "pipe", "pipe"],
            },
          )
          for (const [index, stream] of [
            child.stdout,
            child.stderr,
          ].entries()) {
            stream.on("data", (bytes) => {
              try {
                if (index === 0) rawJson?.write(bytes)
                outputs[index].write(bytes)
              } catch {
                outputError = "Unable to persist command output"
                stop()
              }
            })
          }
          child.stdio[3].on("data", (bytes) => {
            control += bytes.toString()
            const lines = control.split("\n")
            control = lines.pop()
            for (const line of lines) {
              try {
                const message = JSON.parse(line)
                if (Object.hasOwn(message, "code")) primaryResult = message
                else if (message.pid)
                  writeJson(dir, `${name}.child.json`, message)
              } catch {
                outputError = "Invalid supervisor record"
                stop()
              }
            }
          })
          child.on("error", (error) => {
            spawnError = error.code ?? "spawn failed"
          })
          child.on("exit", (exitCode, exitSignal) => {
            code = exitCode
            signal = exitSignal
            stop()
          })
          child.on("close", (exitCode, exitSignal) => {
            code = exitCode
            signal = exitSignal
            closed = true
            stop()
            resolveClosed()
          })
          writeJson(dir, `${name}.process.json`, {
            pid: child.pid ?? null,
            processGroup: child.pid ?? null,
            ownership:
              "Linux child subreaper; detached descendants are adopted and reaped",
          })
          deadline = setTimeout(() => {
            timedOut = true
            stop()
          }, timeoutMs)
        }
        // A group kill closes inherited pipes. Bound even faulty pipe ownership.
        await Promise.race([
          closedPromise,
          new Promise((resolve) => {
            const check = setInterval(() => {
              if (closed || cleanup) {
                clearInterval(check)
                if (cleanup) cleanup.then(resolve)
                else resolve()
              }
            }, 25)
          }),
        ])
        await stop()
        if (!closed) {
          await Promise.race([
            closedPromise,
            new Promise((resolve) => setTimeout(resolve, 250)),
          ])
          child?.stdout.destroy()
          child?.stderr.destroy()
        }
      } finally {
        await stop()
        clearTimeout(deadline)
        clearTimeout(killTimer)
        clearInterval(pollTimer)
        activeStop = undefined
        for (const output of outputs) output.end()
        stdout.close()
        stderr.close()
        rawJson?.close()
      }
      const result = {
        command,
        code: primaryResult ? primaryResult.code : code,
        signal: primaryResult?.signal ?? signal,
        spawnError: primaryResult?.spawnError ?? spawnError,
        outputError,
        supervisorCode: code,
        timedOut,
        interrupted,
        exitCode: interrupted
          ? interrupted === "SIGINT"
            ? 130
            : 143
          : timedOut
            ? 124
            : outputError || !primaryResult || primaryResult.spawnError
              ? 1
              : (primaryResult.code ?? 1),
      }
      writeJson(dir, `${name}.result.json`, result)
      return result
    },
    close() {
      process.off("SIGINT", onInt)
      process.off("SIGTERM", onTerm)
    },
  }
}
