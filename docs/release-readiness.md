# Wave 1 release evidence (WIL-123)

Status: **implementation prepared; release readiness not yet proven**. No deployment, DNS, Vercel provisioning, publishing, commit, push or release is part of this work. Base: merged WIL-122 (`941a56b`). Evidence from that base is not evidence for a subsequent PR head.

The implementation session was explicitly prohibited from running Next build/start, Playwright, Chromium, any browser or external services. Only focused unit/component tests, formatting, lint and strict type checking were allowed. Accordingly, new browser assertions and measurement code are unexecuted until the parent runs them after the implementing agent exits. Do not turn this document into a release approval without the evidence below.

## Independently reviewable packets

Each reviewer records their identity, exact 40-character head SHA, evidence paths/run URLs, findings, disposition and date. A change after review invalidates that review; rerun affected gates and review the repaired head. These are review instructions, **not independent approvals**.

| Packet                 | Review material                                                                                                                                                                 | Required decision / current gap                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Specification          | Approved foundation plan Task 15; README; `docs/context.md`; engine contracts; this ledger; `docs/performance.md`                                                               | Confirm all Wave 1 clauses, original world/controls/resilience, bounded measurement, and excluded deployment scope. Measured costs and approved budgets pending.                                                                                 |
| Security / provenance  | `.github/workflows/security.yml`, `next.config.ts`, asset loader/manifest, test flag guard, `docs/asset-audit.md`, inventory, full audit JSON and secret scan log               | Exact-head secret detection and CodeQL must actually succeed; review both moderate advisories and unresolved licensing. No approval recorded.                                                                                                    |
| Code quality           | Diff; `vitest.config.ts`; `scripts/check-engine-coverage.mjs`; JSON/HTML coverage; measurement/probe tests; strict types, format/lint/build logs                                | Check engine membership and independent thresholds, all-pass counters, fixed sample bounds, truthful memory units, artifact/head binding and no weakened checks.                                                                                 |
| Visual / accessibility | Existing strict desktop/mobile/tablet baselines; actual/expected/diff artifacts; accessibility attachments (keyboard pause, mobile guide, unsupported WebGL, target rectangles) | Inspect actual rendered desktop/tablet/mobile results, horizon/Traveler legibility, focus, layout, and live reduced motion. Browser execution and human visual review pending. No snapshot updates are authorized by a failing comparison alone. |

## Gate accounting at the PR head

The quality and security workflows explicitly check out `pull_request.head.sha` (or event SHA outside PRs), rather than the synthetic merge commit. Quality records command, start/end, exit code, head/tree before and after, lockfile hash and log hash per attempt; artifacts upload on success or failure. The wrapper rejects dirty trees, untracked files and a missing/mismatched `CHARDIN_PR_HEAD`. Failed attempts are preserved; exit codes are not masked by pipelines. Build stamps bind the ordinary production bundle and hook-boundary smoke test to head and Next build ID. Browser builds deliberately enable hooks, so production smoke/bundle measurement must precede them.

A green collection command is **not** a passed performance budget. Inspect each report's `status`, and separately run strict budget enforcement after cost budgets have been measured and approved. Coverage exports both detailed JSON and JSON summary; every engine source, including unimported files, must appear. Engine aggregate minimums: 85% lines/statements/functions, 75% branches; global minimums remain 70/70/70/60. CPU tests do not execute GLSL or prove GPU behavior.

| Gate                                    | Proof required                                                               | Current status                                                                                                                    |
| --------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Formatting / lint / strict types        | Exact-head wrapper logs or successful CI steps                               | Local working-tree checks only; parent rerun required                                                                             |
| Coverage-backed tests                   | Full `pnpm test:coverage`, detailed report, thresholds and engine membership | Focused checks only in implementation session                                                                                     |
| Production build / hooks off            | Ordinary build stamp + production smoke                                      | Not run                                                                                                                           |
| Browser / visual regression             | Both projects; strict zero-pixel comparisons; inspect intended project skips | Not run on WIL-123                                                                                                                |
| Desktop / mobile-emulation measurements | Raw 300-sample report, host/browser, all cost summaries and reviewed budgets | Not run; physical device proof remains separate                                                                                   |
| Dependency audit                        | Complete JSON, process exit and severity counts                              | Inherited **two moderate advisories**, not remediated or newly verified; no claim of zero vulnerabilities                         |
| Secret scan                             | Full-history TruffleHog result and terminal successful check                 | Not run; local command disables online secret verification, preserves only detector metadata in logs, and still fails on findings |
| CodeQL                                  | Actual successful JavaScript/TypeScript analysis on checked-out head         | Not run; private-repository `ENABLE_CODEQL` condition may skip it. Skipped/unavailable is a blocker, never a pass                 |
| Provenance and licenses                 | Inventory plus source review and owner decisions                             | Original Wave 1 authorship documented; legacy/repository licensing unresolved                                                     |
| Independent reviews                     | Four packets approved at same SHA                                            | Prepared, not performed                                                                                                           |

Existing TruffleHog action uses a mutable `@main` reference; reproducible supply-chain pinning is a remaining workflow limitation, not a verified pinned scanner claim. Full-history scans can report old findings; assess rather than silently suppress them. Neither `.env` exclusions nor static filename searches substitute for a secret scan.

## Parent execution after the implementation agent exits

Use an already reviewed, clean PR checkout. Obtain the PR head from the PR/API independently; **do not set it to local HEAD merely to bypass the check**. A parent authorized to contact GitHub can use `gh pr view <PR> --json headRefOid,baseRefName,state,url`, then verify that local HEAD matches. This session does not create or push that PR. No commands below deploy anything.

Run each command separately and preserve its exit status. Install the pinned dependencies and matching Chromium only after the agent exits if they are not already installed. Stop other builds/browsers; all browser configs use one worker and refuse server reuse.

```sh
export CHARDIN_PR_HEAD=<verified-full-PR-head-SHA>
git status --short
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

`pnpm evidence build` explicitly sets `NEXT_PUBLIC_E2E_HOOKS=false`; production smoke starts that existing build. Browser/measurement commands each build their own hook-enabled production server and stop it through Playwright ownership. Logs and bundle reports are in `.hermes/execution/chardin/release/<SHA>/`; browser attachments are in `test-results/browser`, measurements in `test-results/performance`, and coverage in `coverage`. Archive before any rerun. A missing scanner executable is a failed gate, not a clean scan.

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
