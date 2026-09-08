import { relative } from "node:path"
import { identity } from "./lib/evidence.mjs"
import {
  exclusiveLog,
  finalizeAttempt,
  readRegular,
  writeExclusive,
  writeJson,
} from "./lib/evidence-store.mjs"
import { sanitizedStream } from "./lib/evidence-process.mjs"

// In addition to the full built-in JSON reporter, persist every body/path as a
// regular file. Never use attachment names or source paths as destination names.
export default class EvidenceReporter {
  constructor({ dir, standalone = false }) {
    this.dir = dir
    this.standalone = standalone
    this.attachments = []
    this.errors = []
    this.counter = 0
    this.log = exclusiveLog(dir, "reporter.log")
    this.output = sanitizedStream((text) => this.log.write(text))
  }
  onStdOut(chunk) {
    this.output.write(chunk)
  }
  onStdErr(chunk) {
    this.output.write(chunk)
  }
  onError(error) {
    this.output.write(`${error.message ?? "Browser runner error"}\n`)
  }
  onTestEnd(test, result) {
    for (const attachment of result.attachments) {
      try {
        const bytes =
          attachment.body !== undefined
            ? Buffer.from(attachment.body)
            : readRegular(process.cwd(), attachment.path)
        const suffix =
          {
            "image/png": ".png",
            "application/json": ".json",
            "application/zip": ".zip",
            "video/webm": ".webm",
            "text/plain": ".txt",
          }[attachment.contentType] ?? ".bin"
        const path = `attachments/${++this.counter}${suffix}`
        writeExclusive(this.dir, path, bytes)
        this.attachments.push({
          testId: test.id,
          title: test.titlePath(),
          retry: result.retry,
          status: result.status,
          name: attachment.name,
          contentType: attachment.contentType,
          path,
          source: attachment.path
            ? relative(process.cwd(), attachment.path)
            : "body",
        })
      } catch (error) {
        this.errors.push(error.message)
      }
    }
  }
  onEnd(result) {
    this.result = {
      ...result,
      status: this.errors.length ? "failed" : result.status,
    }
    writeJson(this.dir, "attachments.json", this.attachments)
    writeJson(this.dir, "reporter-result.json", {
      ...this.result,
      errors: this.errors,
    })
    return { status: this.result.status }
  }
  onExit() {
    this.output.end()
    this.log.close()
    // onExit runs after all reporters' onEnd, including built-in JSON output.
    readRegular(this.dir, "reporter.json")
    if (this.standalone)
      finalizeAttempt(this.dir, {
        ...this.result,
        exact: false,
        after: identity(),
        exitCode: this.result.status === "passed" ? 0 : 1,
      })
  }
}
