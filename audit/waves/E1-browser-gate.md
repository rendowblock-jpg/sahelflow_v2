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

## Call 37: p67 result on wave/2 head 0ae4e890 (class table)
p67 = phase6-7-completion.yml browser-evidence. job=p67 wt=wt-w2e head=0ae4e890 rc1=1 rc2=1 playwright_s=620 prep_s=15
18 tests: 16 passed, 1 FAILED, 1 skipped (serial describe: the governed-order commit test, phase6-7-completion.spec.ts:811, never ran, so its status is UNKNOWN until the failure below is cleared).

| test | class | cause | proposed fix |
|---|---|---|---|
| phase6-7-completion.spec.ts:765 "Orders governed seller journey > ar review detail keeps governed copy localized and contained" (ar runs at 683x384, the 200% reflow viewport) | B (stale spec after an intended wave-2 change). Same spec as the wave-1 GitHub failure; there it was a regression, here wave 2 changed the queue on purpose | Locator getByRole('row').filter({hasText:'ORD-0057'}) not found (30 s). Re-run of the failed test in the same sandbox failed the same way = deterministic, not a flake. The page snapshot (error-context) shows the queue as cards: listitem > checkbox, link ORD-0057 (/orders/ID), Confirm/Reject buttons, because src/components/orders/confirmation-queue-table.tsx:697 (<DataTable ...>) no longer has layout="table": commit 8466e054 (merge, dropped it for w97's slot map) on top of df0520df (g1 card slots). The fr test (1366 wide, rows) passes. | In e2e/phase6-7-completion.spec.ts lines 739 and 780 change the row locator to page.getByRole("row").or(page.getByRole("listitem")).filter({ hasText: orderNumber }) (the review link .locator('a[href^="/orders/"]').last() is the ORD link in the card too). Product-side alternative (not advised: it reverts the card slots and turns confirmation-queue-layout.render.test.tsx red): put layout="table" back at confirmation-queue-table.tsx:697. After the fix re-run p67 to un-mask :811. |

Other 16 p67 tests green incl. en/fr/ar desktop + 200% reflow sweeps with axe, keyboard/dialog/target-size contracts, Arabic RTL settings, first-run locale, the controlled performance trend (1.6 m).
p5-auth: 2/2 green (see call 24).
p5-rep: started after p67 (see the logs below). If this section has no p5-rep result, the job was still running when the 40-call budget ended: read audit/logs/e2e-p5-rep-wt-w2e.summary.txt (written at the end) or the list audit/logs/e2e-p5-rep-wt-w2e.txt; job id e2e-local-w116-chain-446a190b.

## Re-run
    job_start "cd /opt/agent-sandbox/workspace/wt-w2e && bash audit/waves/tools/e2e_local.sh wt-w2e 4430 p67"     # or p5-auth / p5-rep ; add RERUN=0 to skip the re-run, ONLY='e2e/x.spec.ts' for a probe
Waiting for /tmp/vt.lock is part of the elapsed time (3 other helpers were ahead: ~130 s).

## What the tool cannot reproduce
Windows and the installed MSI/Tauri app; Rust; CI=1 (webServer + forbidOnly + github reporter; CI would start a second dev server on :3000); the repo secret SF_MASTER_KEY (the public placeholder is used); a 4-core hosted runner (this box has 2 cores, so cold dev compiles are slower and timeouts likelier); the Upload-artifact and classify/static jobs; the order of the three jobs on one shared runner image. Dev-server mode (next dev) is what CI runs too.
