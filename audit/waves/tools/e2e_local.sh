#!/bin/bash
# e2e_local.sh WT PORT JOB   - run ONE GitHub browser job of the PR gate on this machine.
#
#   WT    worktree folder under /opt/agent-sandbox/workspace (wt-w2e) or an absolute path
#   PORT  free TCP port for this run's own `next dev` (never 3000, never another helper's)
#   JOB   p5-auth  = phase5-experience.yml  fresh-auth            "Fresh install + owner login (1366x768)"
#         p5-rep   = phase5-experience.yml  representative-desktop "Representative LTR + Arabic RTL workbenches"
#         p67      = phase6-7-completion.yml browser-evidence      "AR-FR-EN accessibility, reflow and performance"
#
# A run takes minutes and the tool-call limit is ~55 s, so START IT WITH job_start (never a plain bash call):
#   job_start "bash audit/waves/tools/e2e_local.sh wt-w2e 4430 p67"   then job_wait / job_tail.
#
# What it does (same order as the workflow job): takes /tmp/vt.lock for the whole run, waits for load <= 4,
# builds a fresh sandbox /tmp/sahelflow-e2e-WT-JOB (test:sandbox, prisma migrate deploy, seed:rich where the job seeds,
# the phase-7 query-plan check for p67), starts `next dev -p PORT` in its own session, waits for the ready URL,
# runs the EXACT `playwright test` line of the workflow job (read from the yml) with --reporter=list,json,
# re-runs only the failed tests once (RERUN=1, to separate real failures from flakes), prints a summary,
# then stops the dev server by the PID it started (process group of that PID, no pattern kill).
# Outputs: audit/logs/e2e-JOB-WT.txt (playwright list), .prep.txt (setup steps), .server.txt (dev server),
#          .summary.txt (the summary again), and the sandbox itself (error-context.md files) is KEPT under /tmp.
# Env knobs: RERUN=0 (no re-run), LOAD_MAX=4, LOAD_WAIT_S=900, READY_S=180, KEEP=0 (delete sandbox at the end),
#            ONLY="e2e/x.spec.ts" (override the spec list, for a quick probe; not what CI does).
# Exit: 0 all passed (flake = passed on re-run counts as pass but is printed), 1 failures remain, 2 tool/setup error.
# NOT reproduced: Windows, the installed MSI/Tauri app, Rust, CI=1 (webServer/forbidOnly/github reporter), a 4-core
# hosted runner (this machine has 2 cores: cold `next dev` compiles are slower, so timeouts are likelier here).

set -u
WS=${WORKSPACE:-/opt/agent-sandbox/workspace}
WT_ARG=${1:-}; PORT=${2:-}; JOB_ARG=${3:-}
if [ -z "$WT_ARG" ] || [ -z "$PORT" ] || [ -z "$JOB_ARG" ]; then
  sed -n '2,3p' "$0"; echo "jobs: p5-auth | p5-rep | p67"; exit 2
fi
case "$WT_ARG" in /*) WTDIR=$WT_ARG ;; *) WTDIR=$WS/$WT_ARG ;; esac
WT=$(basename "$WTDIR")
[ -d "$WTDIR/.git" ] || [ -f "$WTDIR/.git" ] || { echo "ERROR: $WTDIR is not a worktree"; exit 2; }
case "$PORT" in ''|*[!0-9]*) echo "ERROR: PORT must be a number"; exit 2 ;; esac
if [ "$PORT" = 3000 ]; then echo "ERROR: port 3000 is reserved for CI-style runs; pick your own port"; exit 2; fi

case "$JOB_ARG" in
  p5-auth|fresh-auth)            JOB=p5-auth; WFILE=phase5-experience.yml;   WKEY=fresh-auth;             SEED=0; AUTHSEC=0; STORAGE=none ;;
  p5-rep|representative-desktop) JOB=p5-rep;  WFILE=phase5-experience.yml;   WKEY=representative-desktop; SEED=1; AUTHSEC=1; STORAGE=inroot ;;
  p67|browser-evidence)          JOB=p67;     WFILE=phase6-7-completion.yml; WKEY=browser-evidence;        SEED=1; AUTHSEC=1; STORAGE=sibling ;;
  *) echo "ERROR: unknown job '$JOB_ARG' (p5-auth | p5-rep | p67)"; exit 2 ;;
esac

LOGDIR=$WS/audit/logs; mkdir -p "$LOGDIR"
PWLOG=$LOGDIR/e2e-$JOB-$WT.txt; PREPLOG=$LOGDIR/e2e-$JOB-$WT.prep.txt
SRVLOG=$LOGDIR/e2e-$JOB-$WT.server.txt; SUMLOG=$LOGDIR/e2e-$JOB-$WT.summary.txt
: >"$PWLOG"; : >"$PREPLOG"; : >"$SRVLOG"; : >"$SUMLOG"
ROOT=/tmp/sahelflow-e2e-$WT-$JOB
OUT=$ROOT/test-results
T0=$(date +%s)
say() { echo "[e2e $JOB $WT +$(( $(date +%s) - T0 ))s] $*"; }

SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    say "stopping dev server pid $SERVER_PID (the one this run started)"
    PGID=$(ps -o pgid= -p "$SERVER_PID" 2>/dev/null | tr -d ' ')
    if [ "$PGID" = "$SERVER_PID" ]; then kill -TERM -- "-$SERVER_PID" 2>/dev/null; else kill -TERM "$SERVER_PID" 2>/dev/null; fi
    for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 "$SERVER_PID" 2>/dev/null || break; sleep 1; done
    if kill -0 "$SERVER_PID" 2>/dev/null; then
      if [ "$PGID" = "$SERVER_PID" ]; then kill -KILL -- "-$SERVER_PID" 2>/dev/null; else kill -KILL "$SERVER_PID" 2>/dev/null; fi
    fi
  fi
  [ -f "$ROOT/server.log" ] && cp "$ROOT/server.log" "$SRVLOG" 2>/dev/null
  if [ "${KEEP:-1}" = 0 ]; then case "$ROOT" in /tmp/sahelflow-e2e-*) rm -rf "$ROOT" "$ROOT.run1" ;; esac; fi
  exec 9>&- 2>/dev/null
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# 1. the lock: held (fd 9) until this script exits. Children get `9>&-` so a stray child can never keep it.
exec 9>/tmp/vt.lock
say "waiting for /tmp/vt.lock"
flock 9
say "lock taken"
LOAD_MAX=${LOAD_MAX:-4}; WAITED=0
while :; do
  L=$(cut -d' ' -f1 /proc/loadavg); L=${L%.*}
  [ "${L:-0}" -le "$LOAD_MAX" ] && break
  [ "$WAITED" -ge "${LOAD_WAIT_S:-900}" ] && { say "load still $L after ${WAITED}s: going on anyway (results may show timeouts)"; break; }
  [ $((WAITED % 60)) = 0 ] && say "load $L > $LOAD_MAX, waiting"
  sleep 15; WAITED=$((WAITED + 15))
done
if ss -ltn 2>/dev/null | grep -q ":$PORT "; then say "ERROR: port $PORT is already in use"; exit 2; fi

# 2. environment of the job (values from the workflow, nothing from .secrets)
cd "$WTDIR" || exit 2
HEAD_SHA=$(git rev-parse --short HEAD); BRANCH=$(git rev-parse --abbrev-ref HEAD)
WF=$WTDIR/.github/workflows/$WFILE
[ -f "$WF" ] || { say "ERROR: $WF missing"; exit 2; }
unset CI AUTH_SECRET SF_PHASE5_OWNER_STORAGE_STATE E2E_BASE_URL E2E_SERVER_READY_URL SF_MASTER_KEY
# SF_MASTER_KEY: the public placeholder after `||` in the workflow env (the repo secret is not available here)
SF_MASTER_KEY=$(grep -m1 -oE "\|\| '[0-9a-f]{64}'" "$WTDIR/.github/workflows/phase5-experience.yml" | grep -oE '[0-9a-f]{64}')
[ -n "$SF_MASTER_KEY" ] || { say "ERROR: no placeholder SF_MASTER_KEY found in the workflow"; exit 2; }
export SF_MASTER_KEY NEXT_TELEMETRY_DISABLED=1 FORCE_COLOR=0 NO_COLOR=1
export SF_TEST_ROOT=$ROOT SF_DATA_DIR=$ROOT/data DATABASE_URL=file:$ROOT/data/shops/test.db
if [ "$AUTHSEC" = 1 ]; then
  AUTH_SECRET=$(grep -m1 -E '^\s+AUTH_SECRET:' "$WF" | sed -E 's/^\s+AUTH_SECRET:\s*//')
  [ -n "$AUTH_SECRET" ] || { say "ERROR: AUTH_SECRET not found in $WFILE"; exit 2; }
  export AUTH_SECRET
fi
case "$STORAGE" in
  inroot)  export SF_PHASE5_OWNER_STORAGE_STATE=$ROOT/owner-storage-state.json ;;
  sibling) export SF_PHASE5_OWNER_STORAGE_STATE=/tmp/sahelflow-e2e-$WT-$JOB-storage/owner-storage-state.json ;;
esac
export E2E_BASE_URL=http://localhost:$PORT
export E2E_SERVER_READY_URL=$E2E_BASE_URL/icons/sahelflow-mark.png
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-/opt/agent-sandbox/tools/playwright-browsers}
export PLAYWRIGHT_JSON_OUTPUT_NAME=$ROOT/report.json

# 3. the exact playwright arguments of the workflow job
PWLINE=$(awk -v key="  $WKEY:" '$0==key{j=1;next} j&&/^  [A-Za-z0-9_-]+:[[:space:]]*$/{exit} j&&/run: bunx playwright test/{sub(/^.*run: bunx playwright test[[:space:]]*/,"");print;exit}' "$WF")
[ -n "$PWLINE" ] || { say "ERROR: no 'bunx playwright test' line in job $WKEY of $WFILE"; exit 2; }
if printf '%s' "$PWLINE" | grep -qvE '^[A-Za-z0-9_./ "=-]+$'; then say "ERROR: unexpected characters in the workflow command: $PWLINE"; exit 2; fi
eval "set -- $PWLINE"; PW_ARGS=("$@")
if [ -n "${ONLY:-}" ]; then
  KEEP_ARGS=(); for a in "${PW_ARGS[@]}"; do case "$a" in e2e/*) ;; *) KEEP_ARGS+=("$a") ;; esac; done
  PW_ARGS=("${KEEP_ARGS[@]}" $ONLY)
fi
say "head $HEAD_SHA ($BRANCH) port $PORT sandbox $ROOT"
say "playwright args: ${PW_ARGS[*]}"

# 4. fresh sandbox + the job's setup steps
step() { # name cmd...
  local n=$1; shift; local s=$(date +%s)
  say "step: $n"; echo "=== $n ($*)" >>"$PREPLOG"
  "$@" >>"$PREPLOG" 2>&1 9>&-; local rc=$?
  say "step: $n -> rc=$rc in $(( $(date +%s) - s ))s"
  return $rc
}
case "$ROOT" in /tmp/sahelflow-e2e-*) rm -rf "$ROOT" "$ROOT.run1" ;; *) say "ERROR: bad sandbox path"; exit 2 ;; esac
[ "$STORAGE" = sibling ] && rm -rf "$(dirname "$SF_PHASE5_OWNER_STORAGE_STATE")"
step "prepare sandbox" bun run test:sandbox -- "$ROOT" || exit 2
mkdir -p "$SF_DATA_DIR/shops"
step "prisma migrate deploy" bunx prisma migrate deploy || exit 2
[ "$SEED" = 1 ] && { step "seed:rich" bun run seed:rich || exit 2; }
PRESTEP_FAIL=""
if [ "$JOB" = p67 ]; then
  step "phase-7 query plans" bun --conditions react-server scripts/verify-phase7-query-plans.ts || PRESTEP_FAIL="verify-phase7-query-plans.ts failed (in CI the job stops here)"
fi
if ! ls "$PLAYWRIGHT_BROWSERS_PATH" 2>/dev/null | grep -q '^chromium'; then step "install chromium" bunx playwright install chromium || exit 2; fi
T_PREP=$(( $(date +%s) - T0 ))

# 5. dev server, own session, PID recorded
setsid bash -c 'echo $$ >"$0"; exec ./node_modules/.bin/next dev -p "$1"' "$ROOT/server.pid" "$PORT" >"$ROOT/server.log" 2>&1 9>&- &
for _ in 1 2 3 4 5; do [ -s "$ROOT/server.pid" ] && break; sleep 1; done
SERVER_PID=$(cat "$ROOT/server.pid" 2>/dev/null)
[ -n "$SERVER_PID" ] || { say "ERROR: dev server did not start"; exit 2; }
say "dev server pid $SERVER_PID, waiting for $E2E_SERVER_READY_URL"
READY=0
for _ in $(seq 1 "${READY_S:-180}"); do
  kill -0 "$SERVER_PID" 2>/dev/null || { say "ERROR: dev server died"; tail -20 "$ROOT/server.log"; exit 2; }
  if curl -fsS -o /dev/null --max-time 3 "$E2E_SERVER_READY_URL" 2>/dev/null; then READY=1; break; fi
  sleep 1
done
[ "$READY" = 1 ] || { say "ERROR: dev server not ready in ${READY_S:-180}s"; tail -20 "$ROOT/server.log"; exit 2; }
say "dev server ready"
T_PW0=$(date +%s)

# 6. playwright (no retries, like CI) then ONE re-run of the failed tests
run_pw() { # extra args...; list goes to the log file
  bunx playwright test "${PW_ARGS[@]}" --reporter=list,json --output="$OUT" "$@" 9>&- 2>&1 | tee -a "$PWLOG"
  return "${PIPESTATUS[0]}"
}
echo "### RUN 1: playwright test ${PW_ARGS[*]}" >>"$PWLOG"
run_pw; RC1=$?
say "run 1 finished rc=$RC1 in $(( $(date +%s) - T_PW0 ))s"
cp "$ROOT/report.json" "$ROOT/report-run1.json" 2>/dev/null
RC2=""; RERUN_USED=0
if [ "$RC1" != 0 ] && [ "${RERUN:-1}" = 1 ] && [ -f "$ROOT/report-run1.json" ]; then
  rm -rf "$ROOT.run1"; cp -r "$OUT" "$ROOT.run1" 2>/dev/null
  echo "### RUN 2: only the failed tests of run 1 (--last-failed)" >>"$PWLOG"
  T_R2=$(date +%s)
  run_pw --last-failed; RC2=$?; RERUN_USED=1
  say "run 2 (failed tests only) finished rc=$RC2 in $(( $(date +%s) - T_R2 ))s"
  cp "$ROOT/report.json" "$ROOT/report-run2.json" 2>/dev/null
fi
T_PW=$(( $(date +%s) - T_PW0 ))

# 7. summary (names, first error line, error-context path)
cat >"$ROOT/summary.cjs" <<'JS'
const fs = require("fs");
const [, , r1, r2, outDir, run1Dir] = process.argv;
const strip = (s) => String(s || "").replace(/\u001b\[[0-9;]*m/g, "");
function load(p) { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } }
function rows(j, remap) {
  const out = [];
  const walk = (suite, titles) => {
    const t = suite.title && !/\.(spec|setup)\.ts$/.test(suite.title) ? titles.concat(suite.title) : titles;
    for (const sp of suite.specs || []) for (const tst of sp.tests || []) {
      const res = (tst.results || [])[(tst.results || []).length - 1] || {};
      const errs = strip((res.error && res.error.message) || ((res.errors || [])[0] || {}).message || "").split("\n").map((l) => l.trim()).filter(Boolean);
      const att = (res.attachments || []).find((a) => a.name === "error-context" && a.path);
      out.push({
        key: `${tst.projectName}|${sp.file}|${t.concat(sp.title).join(" > ")}`, project: tst.projectName,
        where: `${sp.file}:${sp.line}`, title: t.concat(sp.title).join(" > "), status: tst.status, ms: res.duration || 0,
        err: errs[0] || "", loc: errs.find((l) => /^Locator:|^Expected|^Received/.test(l)) || "",
        ctx: att ? (remap ? att.path.replace(outDir, run1Dir) : att.path) : "",
      });
    }
    for (const s of suite.suites || []) walk(s, t);
  };
  for (const s of (j && j.suites) || []) walk(s, []);
  return out;
}
const j1 = load(r1);
if (!j1) { console.log("NO-JSON-REPORT: playwright wrote no report (setup failed before the first test?) -> read the .txt list"); process.exit(3); }
const a = rows(j1, !!load(r2));
const b = rows(load(r2) || { suites: [] }, false);
const rerun = new Map(b.map((x) => [x.key, x]));
const ok = (x) => x.status === "expected" || x.status === "skipped";
const passed1 = a.filter((x) => x.status === "expected");
const failed1 = a.filter((x) => x.status === "unexpected" || x.status === "flaky");
const skipped = a.filter((x) => x.status === "skipped");
const flaky = [], hard = [];
for (const f of failed1) { const r = rerun.get(f.key); if (r && ok(r)) flaky.push(f); else hard.push({ ...f, rerun: r ? `failed again: ${r.err}` : (b.length ? "not re-run" : "no re-run") }); }
console.log(`TOTAL ${a.length}: passed ${passed1.length}, failed ${failed1.length} (of which passed on re-run ${flaky.length}, failed twice ${hard.length}), skipped ${skipped.length}`);
if (passed1.length <= 40) for (const p of passed1) console.log(`  PASS ${p.project} ${p.where} ${p.title} (${p.ms} ms)`);
else console.log(`  PASS (${passed1.length} names are in the .txt list)`);
for (const f of flaky) console.log(`  FLAKE (red in run 1, green on re-run) ${f.project} ${f.where} ${f.title}\n        run-1 error: ${f.err}${f.ctx ? "\n        context: " + f.ctx : ""}`);
for (const f of hard) console.log(`  FAIL ${f.project} ${f.where} ${f.title}\n        error: ${f.err}${f.loc ? "\n        " + f.loc : ""}\n        context: ${f.ctx || "(none)"}\n        re-run: ${f.rerun}`);
process.exit(hard.length ? 1 : 0);
JS
echo
say "SUMMARY job=$JOB wt=$WT head=$HEAD_SHA port=$PORT  prep ${T_PREP}s, playwright ${T_PW}s, total $(( $(date +%s) - T0 ))s"
[ -n "$PRESTEP_FAIL" ] && say "PRE-STEP FAILURE: $PRESTEP_FAIL (see $PREPLOG)"
if [ "$RERUN_USED" = 1 ]; then node "$ROOT/summary.cjs" "$ROOT/report-run1.json" "$ROOT/report-run2.json" "$OUT" "$ROOT.run1"; else node "$ROOT/summary.cjs" "$ROOT/report-run1.json" /nonexistent "$OUT" "$ROOT.run1"; fi
SRC=$?
{ echo "job=$JOB wt=$WT head=$HEAD_SHA rc1=$RC1 rc2=${RC2:-none} playwright_s=$T_PW prep_s=$T_PREP"; } >"$SUMLOG"
if [ "$RERUN_USED" = 1 ]; then node "$ROOT/summary.cjs" "$ROOT/report-run1.json" "$ROOT/report-run2.json" "$OUT" "$ROOT.run1" >>"$SUMLOG" 2>&1; else node "$ROOT/summary.cjs" "$ROOT/report-run1.json" /nonexistent "$OUT" "$ROOT.run1" >>"$SUMLOG" 2>&1; fi
say "files: list $PWLOG | prep $PREPLOG | server $SRVLOG | summary $SUMLOG | sandbox $ROOT (kept; KEEP=0 deletes)"
[ "$SRC" = 3 ] && exit 2
[ -n "$PRESTEP_FAIL" ] && [ "$SRC" = 0 ] && exit 1
exit "$SRC"
