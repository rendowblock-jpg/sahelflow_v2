# SahelFlow working memory

> **Purpose:** Compact in-progress checkpoint; not product or architecture
> authority
> **Last updated:** 2026-07-25
> **Protected-main executable checkpoint:** PR #157 at
> `3db7e4072f403f39632b7134be841047767a2e6d`
> **Latest signed/installed candidate:** `1.0.0-internal.7`, not accepted
> **Latest Founder-accepted installation:** `1.0.0-internal.5`

## Current outcome

Internal.7 was built and signed from exact protected main by run `30142585934`,
published, and installed in place over Internal.6 with Roaming and Local AppData
preserved. It is release-complete and not Founder-accepted.

Founder T470 SSD evidence:

- safe-startup window visible in about 1.6 seconds;
- migration completed in about 4.6 seconds;
- protected runtime preparation completed in 271 ms, proving the prior
  14-minute recursive staging defect is fixed;
- bundled Bun 1.3.14 exited with `EPERM` while loading the protected
  `C:\Program Files\SahelFlow\standalone\server.js` entrypoint;
- the entrypoint was readable as ordinary data, so the installed content,
  basic read ACL, AppData and disk class were not the cause;
- the desktop discarded child output and waited the full 90-second readiness
  deadline twice instead of observing the immediate exit;
- the blocked app window did not complete normal close acceptance.

The evidence is recorded on PR #157. No AppData, database, registry, migration,
master-key, WhatsApp state or legacy runtime cache was deleted or reset.

## Active work package

Branch:

```text
agent/windows-node-runtime-internal-8
```

PR #158 is open. Last executed head `05fffb0ac0885a8f9d5ef56870b026b744233e7d`
passed complete CI in run `30176167237` and Windows Rust release parity in run
`30176167229`. The CI Windows job proved the staged packaged runtime through
Node, Prisma and authenticated readiness with paths containing spaces. Its MSI
then built and installed in run `30176167233`, and the complete 3,985-file
protected standalone tree matched the build. The real installed launch still
failed: the fixed bootstrap executed, but `require(entry)` reached Node's
CommonJS resolver with an unusable Windows drive path and failed with `EISDIR`
while `lstat` processed `C:`. That head is not mergeable.

This second result narrows the remaining gap. The command-line bootstrap is no
longer the failing boundary, and installer content, runtime identity, migration,
AppData and disk speed remain ruled out. The staged harness uses Bun's spawn
environment, while the installed desktop uses the custom contained
`CreateProcessW` environment block.

The focused source correction now makes the real Windows contained-Node test
canonicalize its spaced script into the same Win32 verbatim path shape exposed
by installed Tauri resources, normalize that already validated local-drive
path into a conventional forward-slash representation, and launch it through
the production fixed bootstrap plus `SF_NODE_ENTRYPOINT` custom environment.
The desktop rejects network, device and drive-relative representations; the
staged harness and source contract use the same representation, and the
bootstrap validates the value after process transport. This correction has no
executable evidence until its exact published PR head passes every named gate.

This is one coherent installed-platform correction. It:

- keeps Bun 1.3.14 as the frozen development/build tool and baseline WhatsApp
  sidecar compiler target;
- replaces Bun only for the packaged Next.js production server with official
  Node.js 22.23.1 LTS, verified by the published archive and executable hashes;
- retains the Node.js license and records exact runtime provenance;
- preserves direct execution from the release-verified MSI installation under
  protected `Program Files`, with no PATH or AppData executable fallback;
- observes contained child exit during readiness so a fast runtime failure is
  reported in seconds rather than after repeated 90-second deadlines;
- gives the protected server a non-executable Local AppData working directory
  instead of using protected `Program Files` as writable process state;
- keeps the absolute protected entrypoint out of the Windows command line and
  supplies it through the launcher's explicit sanitized environment to a fixed
  bootstrap embedded in the signed desktop executable;
- continuously drains server stderr into a fixed-size in-memory buffer,
  classifies only allowlisted runtime failure signatures, and suppresses all
  raw child output before diagnostics, persistence, display or evidence;
- exercises staged Node, Prisma engine and standalone paths containing spaces
  from the same writable-working-directory model;
- caps clean-runner day-to-day authenticated UI readiness at 45 seconds;
- updates clean Windows, installed MSI, process and runtime-manifest evidence;
- fixes dispatcher/observer PR-comment permissions;
- shortens signed delivery by attesting that protected main has the identical
  Git tree and successful required checks of the reviewed PR head, then running
  only the exact-source signed build and installed artifact/UI gates.

No local build, automated test, coverage run, dependency installation or other
heavy validation is authorized on the Founder machine. GitHub Actions provides
all clean-checkout build/test evidence.

## Work in progress

- [x] Merge PR #157 and pass exact-head CI, Windows Rust and installed MSI/UI
  gates.
- [x] Build, sign, publish and install exact-main Internal.7 with AppData
  preserved.
- [x] Record prompt preparation plus Bun `EPERM`/hidden early-exit evidence;
  keep Internal.7 unaccepted.
- [x] Start the Node-runtime/fail-fast/delivery correction on a normal branch.
- [ ] Complete source, tests, installed evidence and active authority updates.
- [x] Assign unique candidate `1.0.0-internal.8` / MSI `1.0.0.8` across
  version authorities.
- [x] Review the initial complete diff, commit and push without local heavy
  runs.
- [x] Open one coherent PR and let GitHub Actions validate the exact heads.
- [x] Close the installed bootstrap/environment regression gap in source with
  fail-closed path normalization and native contained-launcher coverage.
- [ ] Address all actionable review/CI findings and revalidate the exact head.
- [ ] Merge, build/sign from exact protected main, and publish only after every
  automated installed runtime/UI gate passes.
- [ ] Install over Internal.7 with all AppData preserved; prove prompt real
  workspace, normal close and reopen on the Founder T470.

## Exact next execution order

1. Preserve the focused source boundary: the real Windows `ContainedChild`
   test uses `--eval`, the production bootstrap, the custom environment and a
   canonicalized spaced verbatim path; production and staged launch normalize
   only an already validated local-drive entrypoint and reject other authority.
2. Commit and publish this one focused correction to PR #158 without a local
   build, automated test, dependency installation or MSI attempt.
3. Bind all following evidence to the new exact PR head and require clean CI,
   Windows Rust, MSI install, launch/reopen and authenticated visible UI twice.
   Do not weaken or bypass any gate.
4. If any gate fails, use the bounded redacted evidence to correct the proven
   boundary in the same PR; do not stack Phase 1A work or speculate around it.
5. Resolve every review/CI finding on the exact PR head before merge; a server
   exit without its bounded redacted reason is itself a failing diagnostic
   contract.
6. After merge, let the optimized exact-main signed workflow attest the
   reviewed tree/checks, build/sign once, and repeat installed MSI/UI proof.
7. Publish and install that one candidate over Internal.7. Acceptance requires
   preserved AppData, bounded startup, real authenticated workspace, normal
   close and successful reopen.
8. Resume Phase 1A only after Founder acceptance.

## Preservation constraints

- Do not delete Roaming or Local AppData, shop databases, registry, migration
  records, master key, WhatsApp state or legacy runtime caches.
- Do not uninstall or rebuild locally to make the symptom disappear.
- Do not weaken authenticated readiness or permit a fallback/partial workspace.
- Do not put launch credentials, private seller data or raw child output in
  logs, diagnostics, commits, PRs or evidence.
- Temporary installers/diagnostic scripts may be removed only by exact,
  validated path after durable evidence is recorded.

## Phase 1A boundary after startup recovery

The first business-foundation package remains a bounded source-level authority
audit and compatible workspace/shop contract:

- inventory every process-bound, raw, maintenance, provider, backup, migration
  and all-shop database path;
- distinguish runtime authority, explicit maintenance authority and tests;
- retire or constrain authority-free alternate clients;
- define persistent workspace and shop-incarnation identity;
- preserve existing Founder registry/databases through migration and recovery;
- keep implementation behind the dependency order in `ROADMAP.md`.

Do not create another wave, gap, prompt, status or handoff document.
