# Internal.14 installed replacement handoff — 2026-08-08

> **Purpose:** exact next-session engineering handoff after the Founder-directed session stop.
> **Do not treat this file as product/architecture authority.** `CURRENT_STATE.md`, `ROADMAP.md`, protected source, named issues and live GitHub remain authoritative.

## Hard stop for this session

The final Founder-approved focused installed attempt failed. Engineering stops here for this session.

Do **not** make another product/harness repair, manually retrigger the installed lane, run the full matrix, merge PR #227, or publish Internal.14 from this session. The documentation commit that contains this handoff is documentation-only and is **not** an installed-tested release candidate.

## Live branch / release state at stop

- Repository: `rendowblock-jpg/sahelflow_v2`
- Active PR: #227 — `chore(release): request Internal.14 Phase 5-6 Founder checkpoint`
- Branch: `agent/internal-14-phase6-founder-checkpoint`
- PR state before this documentation reconciliation: open, draft, mergeable
- Protected main before PR #227: `6a9c3e9372e9994428e65dbbc79303cf08160db0`
- Latest application-changing protected merge: PR #223 / `23f1bc3912aecfd2a32c591a18fcca70bf454daa`
- Validated Phase 6/7 source head: `fa0ff6de649421c879f62364383a363b61c71bfc`
- Phase 5 baseline: PR #220 / `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`
- Published executable source remains `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
- Published release remains Internal.13 / app `1.0.0-internal.13` / MSI `1.0.0.13`
- Requested candidate remains Internal.14 / app `1.0.0-internal.14` / MSI `1.0.0.14`
- Founder-installed Internal.13 exists; Founder acceptance remains open; Founder-accepted baseline remains Internal.5
- Phase 6 installed/human exit issue: #221
- Replacement-install recovery evidence issue: #214
- Phase 7 installed performance/reliability issue: #226
- No Beta/Stable claim and no Phase 7 installed certification.

## Last installed-tested code head

`8640ddc2b616aaf5e6d5027f7302e80062673110`

Commit: `fix(windows): restore blocking survivability sockets`

This SHA is the **last code head actually built into an MSI and exercised by the focused installed replacement lane**. Any later documentation-only commit must not be described as installed-tested.

The repair was intentionally narrow: the survivability listener remains nonblocking so shutdown polling is responsive, but each accepted client `TcpStream` is explicitly restored to blocking mode before the framed handshake/request protocol. No licensing, backup semantics, restore semantics, schema, business authority, or release authority changed in that commit.

## Exact-head green evidence at `8640ddc2…`

The following workflow runs completed green on the last installed-tested code head:

- Phase 6-7 Completion Gate — run `31281407605`
- Phase 5 Experience Gate — run `31281407619`
- Phase 4 CI trial issuer smoke — run `31281407662`
- CI / Required PR gate — run `31281407722`
- License Node and authority Windows smoke — run `31281407608`

The normal risk classifier reused already-certified heavy lanes where appropriate. The changed installed Windows boundary was exercised independently by the focused installed run below.

## Final focused installed run — failed and ended the session

- Workflow: `Phase 4 focused installed replacement`
- Run: `31281491280`
- Job: `93163466194`
- Exact checked-out source: `8640ddc2b616aaf5e6d5027f7302e80062673110`
- Artifact: `windows-installed-e2e-31281491280`
- Artifact ID: `9028790269`
- Artifact size: `1182255` bytes
- Artifact ZIP digest: `sha256:9541eb2d8799bbdbb0203415c21c9a3b1b2fd56003fd5de405cecf0064d07ef4`

### What passed in the final installed run

Before the first failure, the exact candidate successfully completed:

- exact checkout;
- Rust setup and `cargo fmt`;
- Founder Windows PowerShell 5.1 installer self-test;
- installed/replacement harness PowerShell 5.1 parsing;
- frozen dependency installation;
- signed local libsodium fixture preparation;
- **Internal.14 MSI build**;
- **installed MSI launch / close / reopen proof**;
- **authenticated hydrated WebView UI proof twice**;
- the source-profile owner/session setup and protected-data setup needed to reach backup/recovery evidence;
- **independent recovery-kit creation**, because execution advanced past the immediately preceding recovery-kit assertion.

### Exact first failure

Artifact `replacement-restore-error.txt` records:

`All-shop source backup was not created.`

PowerShell stack:

- `verify-phase4-replacement-install.licensed.ps1`, line 494
- `scripts/verify-phase4-replacement-install-ci.ps1`, line 186

The harness condition at this boundary is intentionally strict but currently compound:

```powershell
$backup = Invoke-SahelFlowJson -Method POST -BaseUrl $sourceBaseUrl -Path "/api/backup/create" -Session $sourceSession
if ($backup.status -ne 201 -or [int]$backup.body.shopCount -lt 2 -or -not (Test-Path -LiteralPath ([string]$backup.body.location))) {
    throw "All-shop source backup was not created."
}
```

Therefore the evidence currently proves only that **at least one** of these predicates failed:

1. `/api/backup/create` did not return HTTP 201; or
2. its returned `shopCount` was less than 2; or
3. its returned `location` did not exist as a file from the harness process.

The final artifact does not safely preserve the API response/status/body fields needed to distinguish those three predicates. Do **not** guess which one failed and do **not** modify backup/restore product code until the next session decomposes this assertion or captures the safe response fields.

## Why the final failure is progress

The immediately previous installed run was:

- run `31279741140`
- code head `4e10200b7b8149e0666304aa21b258559b2873cf`
- artifact `windows-installed-e2e-31279741140`
- artifact ID `9028291350`
- artifact SHA-256 `ed0d311f71b49c9971bde140304a54f0317d381201b1adc10294c93c46cd2fa3`

That run failed earlier with:

`SURVIVABILITY_REQUEST_WRITE_FAILED`

and reported endpoint PID = source PID = `5596`. The JavaScript client had already connected, read and verified the native handshake, verified authority/PID, generated authorization, and then failed while writing the framed native request.

The `8640ddc2…` Windows socket-mode repair moved the final installed run beyond that transport-write boundary, beyond the bridge probe, and beyond independent recovery-kit creation. The prior raw request-write blocker should therefore be treated as **closed by installed evidence** unless new direct evidence contradicts it.

## Failure progression closed during this session

Do not restart these investigations without contradictory evidence:

1. **CI trial issuer / signing fixture** — healthy; deterministic issuer smoke is green.
2. **Ed25519 Node runtime verification** — focused Windows entitlement/authority smoke is green.
3. **License authority persistence/fsync** — old Windows `EPERM: fsync` was fixed by opening the temporary file writable, writing through that descriptor, fsyncing, closing, then renaming.
4. **Packaged installation-root cache realm loss** — moved from `globalThis` to the actual Node `process`, with Windows regression coverage.
5. **Repeated root/context acquisition within one survivability request** — bridge now snapshots root/context once per request.
6. **App/Node/WebView death** — artifacts repeatedly show the installed app and child processes alive when the previous bridge failure occurred.
7. **Endpoint/PID mismatch** — previous artifact showed endpoint PID and source PID matched.
8. **Raw survivability request write** — final installed run advanced past the previous `SURVIVABILITY_REQUEST_WRITE_FAILED` after `8640ddc2…`.
9. **Independent recovery-kit creation** — final installed run advanced past the recovery-kit assertion.

## Relevant earlier checkpoints

### Earlier fsync blocker

An earlier installed run surfaced:

`LICENSE_RESTORE_EVIDENCE_ACTIVATION_INTERNAL ... EPERM: operation not permitted, fsync.`

The bounded fix changed the license authority atomic write to create/open the temporary file writable, write via the same descriptor, `fsync`, close, then rename. Do not revisit this unless the same concrete error reappears.

### Earlier recovery-kit blocker

Run `31274022840` at head `4872bbdd936a8859656d9a2ffa38838351811350` passed MSI launch/reopen and authenticated WebView but failed with:

`Independent recovery kit was not created.`

Subsequent bridge/root-cache repairs moved execution past that boundary. Do not treat recovery-kit creation as the current blocker.

## Final artifact observations

The final artifact includes, among other evidence:

- `replacement-restore-error.txt`
- `processes.json`
- runtime endpoint / UI readiness / UI diagnostics for installed launches
- install log and installed product inventory
- installation-root last-rotation receipt
- shop registry
- migration current/compatibility/last-recovery evidence
- runtime and Node compile-cache inventories

At final failure collection:

- installed `sahelflow.exe` was alive;
- packaged `node.exe` was alive as a SahelFlow child;
- WebView2 processes were alive;
- WhatsApp sidecar was alive;
- runtime endpoint was `ready` for Internal.14;
- installation-root rotation receipt existed;
- migration journal was `complete` with no failure.

These observations further argue against restarting process-lifetime, basic startup, root-rotation, or migration-journal investigations before diagnosing the actual `/api/backup/create` result.

## Exact next-session entry point

Start here, in this order:

1. Re-read `AGENTS.md`, `CURRENT_STATE.md`, `ROADMAP.md`, `WORKING_MEMORY.md` and this handoff.
2. Re-fetch live protected `main`, PR #227, its live head, open review threads and Actions. Another agent may have moved the branch; do not overwrite concurrent work.
3. Preserve `8640ddc2b616aaf5e6d5027f7302e80062673110` as the **last installed-tested code head** even if docs have advanced the PR head.
4. Re-open final run `31281491280`, job `93163466194`, and artifact `9028790269` if confirmation is needed.
5. **First diagnostic change, before product code:** make the all-shop backup assertion report safe stage-specific evidence for the three predicates separately (HTTP/status code, returned shop count, and whether/which returned location exists without exposing secrets/private seller data). Alternatively reproduce the exact API call in a focused test that exposes the same three facts.
6. Inspect the exact `/api/backup/create` route, its JavaScript/native bridge wrapper, and Rust backup creation implementation only after the failing predicate is known.
7. Build one consolidated problem statement for that exact predicate. Do not reopen licensing, Ed25519, fsync, process cache, handshake, PID, or recovery-kit layers unless new evidence points there.
8. Make **one bounded repair**.
9. Run the smallest source/Windows test that directly validates that repair.
10. Trigger **one focused installed replacement lane only**.
11. If and only if the focused installed replacement lane becomes fully green, freeze that exact code head and run the final required matrix once, then perform exact-head adversarial review, expected-head merge, and protected signed Internal.14 publication.
12. After publication, execute Founder/T470 issue #221. Only after Phase 6 installed exit may issue #226 Phase 7 installed certification begin.

## Release / product non-claims at handoff

- PR #227 is not merged.
- Internal.14 is not published.
- The documentation-only handoff commit is not installed-tested.
- Internal.13 remains the published release.
- Founder has not accepted Internal.14 or closed #221.
- Phase 7 installed certification #226 has not been completed.
- No Beta or Stable release exists.

## Permanent release invariants that remain in force

- `release-on-version-authority.yml` remains the single signed-release dispatcher.
- `dispatch-internal-14.yml` remains observer/reporting only; do not reintroduce a duplicate dispatch.
- ordinary signed release licensing remains HTTPS/protected-environment authority; the loopback issuer is only for the explicit restore-evidence build.
- no production localhost licensing bypass.
- do not merge or publish until exact-head evidence is green.
- do not claim Founder acceptance from automated evidence.
