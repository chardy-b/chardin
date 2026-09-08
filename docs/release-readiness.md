# Wave 1 release evidence (WIL-123)

Status: **implementation prepared; release readiness not yet proven**. No deployment, DNS, Vercel provisioning, publishing, commit, push or release is part of this work. Base: merged WIL-122 (`941a56b`). Evidence from that base is not evidence for a subsequent PR head.

The implementation session was explicitly prohibited from running Next build/start, Playwright, Chromium, any browser or external services. Only focused unit/component tests, formatting, lint and strict type checking were allowed. Accordingly, new browser assertions and measurement code are unexecuted until the parent runs them after the implementing agent exits. Do not turn this document into a release approval without the evidence below.

## Independently reviewable packets

Each reviewer records their identity, exact 40-character head SHA, evidence paths/run URLs, findings, disposition and date. A change after review invalidates that review; rerun affected gates and review the repaired head. These are review instructions, **not independent approvals**.

| Packet                 | Review material                                                                                                                                                                 | Required decision / current gap                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Specification          | Approved foundation plan Task 15; README; `docs/context.md`; engine contracts; this ledger; `docs/performance.md`                                                               | Confirm all Wave 1 clauses, original world/controls/resilience, bounded measurement, and excluded deployment scope. Measured costs and approved budgets pending.                                                                                 |
| Security / provenance  | `.github/workflows/security.yml`, `next.config.ts`, asset loader/manifest, test flag guard, `docs/asset-audit.md`, inventory, full audit JSON and secret scan log               | Exact-head secret detection and CodeQL must actually succeed; verify the two qs remediation records and unresolved licensing. No approval recorded.                                                                                              |
| Code quality           | Diff; `vitest.config.ts`; `scripts/check-engine-coverage.mjs`; JSON/HTML coverage; measurement/probe tests; strict types, format/lint/build logs                                | Check engine membership and independent thresholds, all-pass counters, fixed sample bounds, truthful memory units, artifact/head binding and no weakened checks.                                                                                 |
| Visual / accessibility | Existing strict desktop/mobile/tablet baselines; actual/expected/diff artifacts; accessibility attachments (keyboard pause, mobile guide, unsupported WebGL, target rectangles) | Inspect actual rendered desktop/tablet/mobile results, horizon/Traveler legibility, focus, layout, and live reduced motion. Browser execution and human visual review pending. No snapshot updates are authorized by a failing comparison alone. |

## Gate accounting at the PR head

The quality and security workflows explicitly check out `pull_request.head.sha` (or event SHA outside PRs), rather than the synthetic merge commit. Quality records command, start/end, actual command exits, head/tree before and after, lockfile hash, and a SHA-256 manifest of every retained artifact per attempt; artifacts upload on success or failure. The wrapper rejects dirty trees, untracked files and a missing/mismatched `CHARDIN_PR_HEAD`. Failed attempts are preserved; exit codes are not masked by pipelines. Build stamps bind the ordinary production bundle and hook-boundary smoke test to head and Next build ID. Browser builds deliberately enable hooks, so production smoke/bundle measurement must precede them.

A green collection command is **not** a passed performance budget. Inspect each report's `status`, and separately run strict budget enforcement after cost budgets have been measured and approved. Coverage exports both detailed JSON and JSON summary; every engine source, including unimported files, must appear. Engine aggregate minimums: 85% lines/statements/functions, 75% branches; global minimums remain 70/70/70/60. CPU tests do not execute GLSL or prove GPU behavior.

| Gate                                    | Proof required                                                               | Current status                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Formatting / lint / strict types        | Exact-head wrapper logs or successful CI steps                               | Local working-tree checks only; parent rerun required                                                                                            |
| Coverage-backed tests                   | Full `pnpm test:coverage`, detailed report, thresholds and engine membership | Focused checks only in implementation session                                                                                                    |
| Production build / hooks off            | Ordinary build stamp + production smoke                                      | Not run                                                                                                                                          |
| Browser / visual regression             | Both projects; strict zero-pixel comparisons; inspect intended project skips | Not run on WIL-123                                                                                                                               |
| Desktop / mobile-emulation measurements | Raw 300-sample report, host/browser, all cost summaries and reviewed budgets | Not run; physical device proof remains separate                                                                                                  |
| Dependency audit                        | Complete JSON, process exit and severity counts                              | Both qs advisories remediated locally; high/all-severity audits report zero vulnerabilities for the reviewed lockfile; final-head rerun required |
| Secret scan                             | Full-history TruffleHog result and terminal successful check                 | Not run; local command disables online secret verification, preserves only detector metadata in logs, and still fails on findings                |
| CodeQL                                  | Actual successful JavaScript/TypeScript analysis on checked-out head         | Not run; private-repository `ENABLE_CODEQL` condition may skip it. Skipped/unavailable is a blocker, never a pass                                |
| Provenance and licenses                 | Inventory plus source review and owner decisions                             | Original Wave 1 authorship documented; legacy/repository licensing unresolved                                                                    |
| Independent reviews                     | Four packets approved at same SHA                                            | Prepared, not performed                                                                                                                          |

Existing TruffleHog action uses a mutable `@main` reference; reproducible supply-chain pinning is a remaining workflow limitation, not a verified pinned scanner claim. Full-history scans can report old findings; assess rather than silently suppress them. Neither `.env` exclusions nor static filename searches substitute for a secret scan.

## Parent execution after the implementation agent exits

Use a fresh, controlled Linux checkout with Python 3 and the pinned Node/pnpm versions, at the reviewed PR head. Obtain the PR head from the PR/API independently; **do not set it to local HEAD merely to bypass the check**. A parent authorized to contact GitHub can use `gh pr view <PR> --json headRefOid,baseRefName,state,url`, then verify that local HEAD matches. This session does not create or push that PR. No commands below deploy anything.

Run each command separately and preserve its exit status. Install the pinned dependencies and matching Chromium only after the agent exits if they are not already installed. Stop other builds/browsers; all browser configs use one worker and refuse server reuse.

```sh
export CHARDIN_PR_HEAD=<verified-full-PR-head-SHA>
git status --porcelain=v1 --untracked-files=all
git rev-parse HEAD
pnpm evidence format
pnpm evidence lint
pnpm evidence types
pnpm evidence coverage
pnpm evidence build
pnpm evidence production
pnpm evidence bundle
pnpm evidence browser
pnpm evidence performance
pnpm evidence audit
pnpm evidence secrets
git diff --check
```

`pnpm evidence build` explicitly sets `NEXT_PUBLIC_E2E_HOOKS=false`; production smoke starts that existing build. Browser/measurement commands each build their own hook-enabled production server. A missing scanner executable is a failed gate, not a clean scan.

### Attempt storage and interruption

Each invocation exclusively creates `.hermes/execution/chardin/release/<SHA>/<gate>-<UUID>/`. Collisions fail; existing directories/files are never reused. Output ancestors and artifact inputs must be contained regular directories/files, without symlinks or hard links. Every attempt reserves and fsyncs `started.json` with `status: incomplete` and empty stdout/stderr logs before spawning a command. Logs stream sanitized complete lines as they arrive (scanner logs contain only detector metadata; incomplete scanner lines are never leaked). Oversized diagnostic lines are explicitly omitted. A command's buffered last line is flushed on handled termination.

After child cleanup, `result.json` records actual exits, signals, timeout/interruption and before/after identity. `manifest.json` inventories all retained files, including started/result records, command logs, browser/performance `playwright/reporter.json`, extracted `playwright/attachments/*`, the attachment index, coverage JSON/HTML and bundle/build-stamp reports. `manifest.sha256` hashes the manifest itself; a manifest cannot contain its own digest. `readAttempt()` in `scripts/lib/evidence-store.mjs` verifies hashes and membership and treats missing completion seals as **incomplete**, even if a partially finalized result says pass. Failed attempts retain their reports and logs. Reruns get new directories automatically; never modify or delete an earlier attempt to obtain a green record.

The package commands `pnpm test:e2e`, `pnpm measure:performance` and `pnpm test:coverage` use the same ownership/storage wrapper for local collection, labeled `exact: false` with actual dirty/head state. `pnpm measure:bundle` still requires exact-head production provenance. Direct Playwright config use also reserves a unique directory and always enables persistent JSON plus attachment extraction in both local and CI modes; its standalone reporter seals the report after all reporters finish. Use the package/wrapper commands for process supervision and command logs. Do not override reporter/output options for evidence collection. Direct development Vitest invocation is not a release-evidence gate.

The Linux supervisor uses Python 3's standard library and a child subreaper, because Playwright can create additional process groups. SIGINT/SIGTERM initiate TERM for the owned group and descendants, followed by bounded KILL escalation; the supervisor adopts/reaps detached or double-forked descendants, including after their leader exits. It also cleans surviving children on ordinary command exit. The wrapper returns 130/143 for interruption and 124 for its timeout, never a cancelling child's zero exit. The supervisor begins KILL at three seconds and the outer group deadline is five seconds. Other operating systems fail before command spawn until equivalent ownership is implemented. General gates have a 15-minute cap; performance retains 780 seconds. These per-gate caps do not guarantee remaining CI-job time; the controller must leave time for finalization/upload.

SIGKILL, power loss or runner destruction cannot finalize the Node record: durable started/partial files remain explicitly incomplete. On Linux, wrapper death also signals the independent supervisor to clean up; killing the supervisor/runner itself still requires the enclosing job/container to destroy all processes. CI uploads the complete attempt tree with `if: always()` and hidden files enabled, but hard job destruction can prevent upload. Export evidence before the 14-day artifact retention expires.

### Clean-tree and ignored-input boundary

Identity checks everywhere use `git status --porcelain=v1 --untracked-files=all`, independent of `status.showUntrackedFiles`. This detects tracked edits and untracked source/routes, including nested files. Git-ignored inputs are deliberately outside this assertion: `.env*`, `node_modules`, `.next`, coverage, reports and local execution records are not authenticated by the source-tree SHA. Next loads `.env*` and freezes public build variables. Release collection therefore requires a fresh controlled checkout, a frozen-lockfile install, reviewed explicit environment values and no unreviewed ignored source/configuration or inherited build/cache output. Review `.gitignore`, `.git/info/exclude` and `core.excludesFile` as part of that controlled environment. Record the environment policy without writing secret values. Generate `.next` only in the ordered build/production/bundle procedure. Never describe clean Git status alone as a hermetic build guarantee.

Exclusive files and hashes prevent accidental overwrite and detect later changes; they are not write-once storage or independent attestation. The checkout owner, local tools and output directory remain trusted. No portable filesystem check protects against a hostile same-UID process renaming ancestors between checks; isolate collection from other writers and archive the sealed result.

### Audit evidence and moderate dispositions

`pnpm evidence audit` runs `pnpm audit --audit-level=high --json --ignore-registry-errors=false` and additionally `pnpm audit --audit-level=info --json --ignore-registry-errors=false`. It retains both commands' stdout/stderr and actual exit records plus `audit-high.json`, `audit-all.json` and `audit-dispositions.json`. The high command's nonzero exit remains a failure even if the detailed command succeeds. High/critical findings in either report fail the gate. The all-severity command's exit 1 is classified as an expected finding exit only when valid, complete advisory details and severity counts account for it; that actual 1 remains visible in the command record. Malformed/filtered reports, inconsistent counts, registry errors, signals and other command failures fail collection. No `|| true` or output pipeline masks an exit.

Each moderate advisory includes its ID, affected installed/range versions, every dependency path, patch/fix data and an explicit disposition. Unreviewed findings default to `unresolved` and continue to block release approval even when the high threshold passes. Collection can exit zero with unresolved moderate findings; `moderateStatus: "unresolved"` is still a release-approval blocker. Reviewers add advisory-specific entries to `docs/audit-dispositions.json`, keyed by advisory ID, with `decision` (`unresolved`, `deferred`, `not-affected` or `remediated`), `reason`, `owner`, UTC `reviewedAt` and `lockSha256`. Every stored entry, including an absent advisory's remediation record, must have complete review metadata and match the current lockfile SHA-256. Review and rebind entries after any lockfile change.

`remediated` means the advisory is absent from the complete all-severity report. If it is still present at any severity, evaluation throws and the audit runner records a failed gate with a nonzero exit. An absent remediation never waives a different finding. Unit and runner integration coverage in `tests/unit/engine/evidence-audit.test.mjs` checks these semantics, stale lockfile records, missing metadata, and successful collection after removal.

The retained audit at base `7fcad5da9292785ec6557bf4c10f4a78f558f55a` identified `GHSA-x5fp-wj9c-mxmx` (bracket-key comma parsing array-limit bypass) and `GHSA-4mjr-xmp4-gh2g` (attacker-controlled `isBuffer` denial of service) in `qs@6.15.3` through shadcn's MCP/Express graph. The 2026-09-08 working-tree remediation upgrades shadcn to `4.21.0`, moves this CLI to `devDependencies` after confirming no runtime imports or production script usage, and updates all transitive `qs` resolutions to `6.16.0`. Express and body-parser accept this version in their upstream ranges; no overrides or risk acceptance are used. Both registry audits include development dependencies and report zero advisories. The reviewed lockfile SHA-256 is recorded in `audit-dispositions.json`; detailed local results are retained at `.hermes/execution/chardin/wil123-audit-remediation-result.md`. This is uncommitted working-tree validation based on the recorded head, not new exact-head release evidence. Rerun `pnpm evidence audit` on the final clean, reviewed head before release.

After baseline review, fill numeric cost limits in `docs/performance-budgets.json`, record reviewer/rationale/reference reports in `docs/performance.md`, and rerun on the final PR head:

```sh
CHARDIN_ENFORCE_BUDGETS=true pnpm evidence performance
pnpm evidence build
CHARDIN_ENFORCE_BUDGETS=true pnpm evidence bundle
```

The parent must also obtain terminal GitHub workflow evidence, including CodeQL. Standalone read-only commands (replace placeholders; require the parent's GitHub authorization):

```sh
gh pr checks <PR> --watch --fail-fast
gh run list --commit "$CHARDIN_PR_HEAD" --json databaseId,headSha,status,conclusion,workflowName,url
gh run view <QUALITY-RUN-ID> --json headSha,status,conclusion,jobs,url
gh run view <SECURITY-RUN-ID> --json headSha,status,conclusion,jobs,url
gh run view <SECURITY-RUN-ID> --log
gh run download <QUALITY-RUN-ID> --dir .hermes/execution/chardin/downloaded-evidence
```

PR-triggered workflow metadata can identify the synthetic merge commit even when the source checkout is the PR head. Inspect the recorded checkout SHA and per-command records, PR association and workflow logs; do not infer exact-source proof from the run label alone. CodeQL's conditional skipped state must be resolved by the owner/provider or run through a supported CodeQL installation; it cannot be declared green locally without analysis.
