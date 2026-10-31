# E1 browser gate (w116) - notes, call 13
Status: reading done, tool not written yet.
Jobs to reproduce (from .github/workflows):
- P5-AUTH  = phase5-experience.yml `fresh-auth` (name "Fresh install + owner login (1366x768)"): env SF_TEST_ROOT/SF_DATA_DIR/DATABASE_URL; steps test:sandbox, prisma migrate deploy, `playwright test --retries=0 e2e/phase5-auth-entry.spec.ts`. No seed, no owner storage state.
- P5-REP   = phase5-experience.yml `representative-desktop` ("Representative LTR + Arabic RTL workbenches"): + AUTH_SECRET, SF_PHASE5_OWNER_STORAGE_STATE, seed:rich, 9 specs (phase5-experience, language-switch, founder-visual-acceptance, rtl-primitive-authority, inbox-workspace, ai-workspace, settings-workspace, storefront-studio, phase5-command-touch).
- P67      = phase6-7-completion.yml `browser-evidence` ("AR-FR-EN accessibility, reflow and performance"): seed:rich, `bun --conditions react-server scripts/verify-phase7-query-plans.ts`, `playwright test --retries=0 --grep-invert "Phase 7 throttled browser performance trend stays bounded" e2e/phase6-7-completion.spec.ts e2e/phase7-performance-trend.spec.ts`; storage state in a sibling dir /tmp/sahelflow-phase67-storage.
- CI sets CI=1 so playwright.config.ts starts `bun run dev` = `next dev -p 3000` (port fixed in package.json). Locally we start our own `next dev -p PORT` by PID and leave CI unset (no webServer) and E2E_BASE_URL=http://localhost:PORT.

## Call 21: tool written, chain started
Tool: audit/waves/tools/e2e_local.sh WT PORT JOB (JOB = p5-auth | p5-rep | p67). Start it ONLY with job_start (a run is minutes; calls die at ~55 s):
    job_start "cd /opt/agent-sandbox/workspace/wt-w2e && bash audit/waves/tools/e2e_local.sh wt-w2e 4430 p67"
It holds /tmp/vt.lock (fd 9, children get 9>&-) for the whole run, waits for load <= 4, builds /tmp/sahelflow-e2e-WT-JOB (test:sandbox, migrate deploy, seed:rich for p5-rep and p67, verify-phase7-query-plans for p67),
reads the exact `bunx playwright test` line of the job from the workflow yml (no copy to drift), starts `next dev -p PORT` via setsid and records its PID, runs playwright --retries=0 --reporter=list,json,
re-runs only the failed tests once (--last-failed; RERUN=0 to skip) to separate FLAKE from FAIL, prints a summary, stops the server group of the PID it started. CI is left unset on purpose (CI=1 would start a second `bun run dev` on port 3000).
Logs: audit/logs/e2e-JOB-WT.txt (list), .prep.txt, .server.txt, .summary.txt; error-context.md files stay under /tmp/sahelflow-e2e-WT-JOB(.run1).
Facts found while reading: e2e/ is UNCHANGED on wave/2 vs origin/main (git diff --stat origin/main...HEAD -- e2e is empty), so every red test is either an app change (A/B) or the environment (C). Env of the three jobs: SF_MASTER_KEY = the public placeholder after `||` in the workflow env; AUTH_SECRET only in p5-rep and p67; p67 keeps the owner storage state in a SIBLING dir (/tmp/sahelflow-phase67-storage in CI).
Queue on /tmp/vt.lock at 00:05Z: 3 sf vt/vitest runs of other helpers ahead of the chain (the lock is the serialiser, as the brief says).

## Call 24: first result, tool committed (the chain is still running)
- p5-auth (fresh-auth, "Fresh install + owner login 1366x768") on wave/2 head 0ae4e890: 2 passed / 0 failed (phase5-auth-entry.spec.ts:28 27.5 s, :60 7.0 s). Playwright 36 s; setup (sandbox, migrate, dev server ready in 6 s) ~10 s; the rest of the 182 s was waiting for /tmp/vt.lock behind three other helpers.
- p67 started 00:04:40Z: 18 tests, one worker; "en complete desktop route sweep" alone takes 1.6 min in `next dev` (cold compiles on 2 cores), so expect 15-25 min for this job.
- Tool checks that passed on the real run: lock taken and held by the script, sandbox created under /tmp, migrate deploy, seed:rich, verify-phase7-query-plans (rc=0, "index contract and SQLite planner evidence passed"), dev server started in its own session and stopped by its PID (no pattern kill), JSON report parsed.
- Known cosmetic: node prints "NO_COLOR ignored because FORCE_COLOR is set" (harmless; fix = drop NO_COLOR in the next commit).
