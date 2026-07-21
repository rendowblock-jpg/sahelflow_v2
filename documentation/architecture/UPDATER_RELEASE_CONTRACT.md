# SahelFlow 1.0 — Updater and Release Trust Contract

> **Status:** Active implementation contract under Engineering Specification section 17 and ADR-015  
> **Scope:** Internal, beta and Stable Windows x64 application updates  
> **Source inspection baseline:** `e0d15999cdcafdd94b8fdbd560b0ee890fcc5bc7` (`main`, 2026-07-21)  
> **Evidence boundary for this checkpoint:** ChatGPT with GitHub connector; repository inspection and proposed source changes only. No dependency, build, runtime, signed-artifact, installed-Windows or A→B evidence is claimed.

## 1. Authority and outcome

This contract applies the Founder-approved product package, the experience journey/state authority, Engineering Specification section 17, ADR-015, the Current-to-Target Analysis, the active Proven Canonical Windows Desktop wave and the R4 release-evidence rules.

The required outcome is:

> An installed SahelFlow version accepts only an approved, signed and compatible update from its selected channel; the seller can understand, defer, complete, restart, retry or recover the update; and an installed A→B drill proves that every registered shop, database, setting, credential reference, migration record and recovery artifact remains intact.

This contract does not authorize a public Stable release, select a hosting provider, authorize a signing key, create a release tag, publish update metadata or make an installed-Windows claim.

## 2. Scope classification and governing journey

- **Product scope:** Required — signed update channels, version authority, verified pre-migration backup, compatibility refusal and recovery.
- **Experience depth:** Required — checking, current, available, deferred, downloading, verifying, ready to install, installing, restart required, restarting, completed, offline, rejected, failed and retrying states.
- **Risk class:** R4 — updater signing and release authority affect data survivability and installed executable trust.
- **Primary invariants:** INV-016, INV-022, INV-033, INV-034 and INV-037.
- **Roadmap position:** Phase 0C converging with the implemented source portions of Phase 1A and Phase 1B.

## 3. Inspected current reality

At the source baseline named above:

- `package.json` and `src-tauri/Cargo.toml` contain the Tauri updater and process dependencies.
- the Rust host registers the updater plugin;
- the main-window capability grants updater and process permissions;
- `UpdateChecker` performs automatic and manual checks, displays release notes and progress, calls `downloadAndInstall`, then schedules a relaunch;
- `src-tauri/tauri.conf.json` keeps updater activation and updater artifact creation disabled;
- an endpoint and public-key value are present, but no accepted key ID, custody record or channel authorization binds them to release authority;
- the Windows candidate workflow intentionally uses `--no-sign`, labels its MSI `UNSIGNED`, rejects updater signatures and uploads non-publishable build evidence only;
- the version authority synchronizes app/MSI/runtime protocol versions but does not yet bind updater activation, channel endpoint or signing-key identity;
- no signed update metadata, complete update state machine, installed version A, installed A→B update or failure-injection evidence exists.

Therefore updater plugin presence and historical updater code are reusable implementation, not trusted update capability.

## 4. Trust separation

### 4.1 Key purposes

The following authorities are distinct and must never reuse one private key:

1. **Tauri updater signing key** — signs updater artifacts/metadata accepted by installed clients.
2. **Windows Authenticode code-signing identity** — identifies the Windows executable/installer to Windows and the seller.
3. **Trial signing key** — issues online trial claims.
4. **Permanent-license signing key** — Founder-controlled offline permanent entitlement authority.
5. **Backup/recovery keys** — protect seller recovery material and data.

A successful Tauri updater signature is not an Authenticode signature, and neither one is a license signature.

### 4.2 Private-key boundary

Updater private signing material:

- never enters Git, a pull request, an issue, a prompt, a source fixture, ordinary CI logs, a diagnostic bundle or an uploaded evidence archive;
- is supplied only to the approved signing environment for the bounded signing step;
- is protected by a separately authorized password/custody procedure;
- has an offline backup, named custodian, recovery test, rotation procedure, revocation procedure and key-loss response before activation;
- is exposed to the build process for the shortest feasible duration and removed from the runner environment after signing.

The repository stores only the approved public key and a non-secret key ID. The key ID identifies the custody record and release evidence; it is not derived from an informal filename.

### 4.3 Founder authorization gate

Updater activation remains blocked until the Founder explicitly authorizes:

- the updater public key and key ID;
- private-key generation location, custody, offline backup, rotation and loss response;
- the internal channel host/publishing policy;
- the first installed-candidate Windows lab and procedure;
- whether the first trusted internal candidate must carry approved Authenticode signing immediately or remains a separately authorized lab-only artifact until that gate is met.

No source value inherited from historical commits constitutes this authorization.

## 5. Version and compatibility authority

`sahelflow.version.json` remains the checked-in version authority. It must bind at least:

- app semantic version;
- Windows MSI version;
- product major;
- release channel;
- runtime protocol version;
- shop registry format version;
- backup format version;
- updater enabled state;
- update metadata format version;
- approved channel endpoint;
- install mode;
- updater signing key ID when enabled.

A generated release manifest for one exact artifact additionally binds:

- source commit and source tree;
- build/run identity and build timestamp;
- target platform/architecture;
- artifact filename, byte size and SHA-256 digest;
- updater signature and updater signing key ID;
- Authenticode status and signer identity where required;
- release notes and publication timestamp;
- channel, rollout state and hold state;
- current-version compatibility range;
- product major;
- runtime protocol range;
- shop registry format range;
- backup format range;
- migration-set digest and supported database/schema range;
- minimum free-disk requirement for download, installation, snapshots and recovery;
- evidence-manifest digest.

Package, Cargo, Tauri configuration, updater behavior, About/support surfaces, workflow metadata and release notes must be derived from or checked against the same authority. A release is rejected when any representation disagrees.

## 6. Channel and publication model

Channels are `internal`, `beta` and `stable`.

Each channel needs:

- an approved HTTPS metadata endpoint;
- immutable versioned artifacts and metadata;
- a separately controlled channel pointer or equivalent promotion mechanism;
- explicit hold, resume and supersede behavior;
- no cross-channel update unless a separately authorized channel-change action occurs;
- no automatic major-version transition;
- audit of publication, promotion, hold and supersession.

GitHub Releases is an implementation candidate for the internal phase, not an accepted channel merely because the current endpoint references it. It is acceptable only after the implementation proves immutable assets, approval-before-pointer-update, hold behavior, access/retention expectations and recovery from an incorrect publication.

A draft release, workflow artifact and published update are different states. A workflow artifact cannot silently become the client update channel.

## 7. Artifact-first build, signing and promotion

The release path uses this order:

1. Select an exact lowercase 40-hex commit reachable from protected `main`.
2. Check out that exact commit in GitHub Actions Windows.
3. Verify synchronized version/update authority and a clean source tree.
4. Run required documentation, TypeScript, ESLint, Vitest, coverage, dependency, migration and Rust gates.
5. Build the real bundled Windows runtime and sidecar.
6. Generate the Windows installer and updater artifacts.
7. Sign updater artifacts using the approved protected updater key.
8. Apply and verify Authenticode when required by the candidate class.
9. Generate signed update metadata and the exact evidence manifest.
10. Independently verify file count, filenames, versions, source commit, hashes, updater signatures, metadata references and signing key ID.
11. Upload immutable candidate artifacts without changing the live channel pointer.
12. Review evidence and approve or reject the candidate.
13. Only after approval, publish/promote the exact metadata for the intended channel.
14. Retain the evidence, release identity, signatures, digests and hold/forward-repair procedure.

The workflow must fail closed. It must not publish, tag, update a channel pointer or describe an artifact as trusted when a gate, signature, digest, metadata check or evidence step fails.

The currently checked-in unsigned workflow remains build evidence only. Enabling the updater requires replacing its unsigned/non-publishable path, not relabeling the same output.

## 8. Installed client state machine

The seller-visible update flow uses explicit states:

| State | Required behavior |
|---|---|
| Idle | No update operation is active. |
| Checking | Show bounded progress for a manual check; automatic checks remain non-disruptive. |
| Current | Identify the installed version and last successful check. |
| Available | Show target version, channel, release notes, expected impact and primary choices. |
| Deferred | Preserve the seller choice and allow a later manual check/install. |
| Downloading | Show determinate progress when size is known and cancellability policy. |
| Verifying | Verify metadata, compatibility, digest and updater signature before installation. |
| Rejected | Name incompatible version, invalid signature, wrong channel, unsupported product major or invalid metadata without offering unsafe bypass. |
| Ready to install | Explain that SahelFlow will enter maintenance and which work must stop. |
| Installing | Prevent new business mutations, preserve diagnostics and do not claim completion early. |
| Restart required | Offer an explicit safe restart action and preserve the state if restart is deferred. |
| Restarting | Close/supervise child processes cleanly and relaunch the exact installed version. |
| Completed | Confirm installed version and post-update health only after startup, migration and readiness gates pass. |
| Offline | Preserve current operation and provide retry guidance; purchased-major local use continues. |
| Failed | Classify download, disk, permission, installer, restart, health or migration failure and preserve recovery actions. |
| Retrying | Retry only safe idempotent stages with bounded behavior. |

The client must not:

- describe auto-update as enabled while the source configuration disables it;
- expose raw plugin/network errors as the only seller guidance;
- silently install an unsigned, incompatible, cross-channel or wrong-major artifact;
- silently restart while business work is pending;
- show `Completed` merely because bytes were downloaded or an installer process exited;
- offer a signature or compatibility bypass.

Arabic, French and English copy, RTL/LTR layout, keyboard/focus behavior, screen-reader announcements, reduced motion, 1366×768 layout and low-end progress behavior are required for applicable states.

## 9. Migration and data-preservation boundary

Downloading and installing application bytes does not itself authorize database mutation.

Before an update that can require migration is installed or activated:

- metadata compatibility is checked against the installed app/product/protocol/registry/backup/schema state;
- every registered shop is enumerated;
- free disk covers the download, installer, required verified snapshots and recovery margin;
- the current migration coordinator reports whether work is required or blocked;
- every affected shop has the required verified compatible snapshot;
- a blocked preflight leaves the current installed application and seller data unchanged.

On first launch of version B:

- startup enters maintenance rather than ready;
- the existing all-shop migration lock, journal, verified snapshots, compatibility report and restoration behavior remain authoritative;
- version B reaches ready only after migration and exact runtime/shop readiness pass;
- a migration failure remains visible and recoverable and does not route to another shop or partial-ready shell;
- recovery uses hold or compatible forward repair, not blind destructive down-migration.

The A→B drill must compare and preserve at least:

- shop registry and active preference;
- every registered shop database and row-count/data-integrity fixtures;
- settings and locale/accessibility preferences;
- encrypted credential references without exposing secret values;
- migration journal/history and compatibility report;
- local recovery/snapshot material;
- runtime protocol and installed-version identity;
- support-readable redacted diagnostics.

## 10. Failure and adversarial matrix

At minimum, source tests plus installed drills cover:

- no update available;
- offline before check and during download;
- metadata unavailable, malformed, stale or wrong channel;
- invalid updater signature;
- digest mismatch;
- wrong product major;
- incompatible current app/protocol/registry/backup/schema range;
- insufficient disk before download, snapshots or install;
- interrupted download and safe resume/retry;
- installer permission/cancellation/failure;
- application/sidecar shutdown race;
- relaunch failure;
- version B startup/runtime readiness failure;
- migration preflight failure;
- migration interruption and restoration;
- corrupt registry or missing shop file after restart;
- channel hold after metadata publication;
- key rotation with old-client compatibility;
- signing-key compromise or loss response;
- accidental publication of an unapproved artifact;
- A→B preservation across at least two shops and one supported prior-version fixture.

No single Linux, GitHub Actions or local-machine pass substitutes for another evidence layer.

## 11. Activation gates

`updater.enabled` may change to `true` only when all of the following are present in one reviewable implementation:

- accepted public key and non-secret signing key ID;
- approved private-key custody and recovery record outside Git;
- approved internal endpoint/channel policy;
- Tauri updater activation and updater artifact creation both enabled;
- release workflow no longer uses `--no-sign` or labels candidate artifacts `UNSIGNED`;
- protected signing environment and bounded secret use;
- generated signed metadata and signed/evidence manifest validation;
- complete client state machine and localized recovery copy;
- compatibility/preflight integration with the existing all-shop coordinator;
- automated negative tests and clean-checkout gates;
- independent ChatGPT review of security, migration, recovery and UX;
- Founder/maintainer approval for release impact.

Activation in source is not release evidence. Normal in-app update use remains blocked until the installed A→B drill passes.

## 12. Exact updater-first execution sequence

1. **ChatGPT lead pass** — establish this contract and source guardrails from current `main`.
2. **Codex Cloud bootstrap** — declare Codex Cloud Linux, repository/ref/commit/worktree; prove frozen dependency setup, the development application and the appropriate shared gate without an installed-Windows claim.
3. **Updater implementation** — continue on a normal `agent/<outcome>` branch; implement activation, signed artifacts/metadata, client states, compatibility/preflight, tests and publishing controls.
4. **Independent review** — ChatGPT reviews the complete diff and evidence; Codex Cloud applies corrections and reruns validation.
5. **Version A production** — GitHub Actions Windows builds the approved updater-enabled internal installer and update artifacts for the exact reviewed commit.
6. **Local A installation** — Codex Desktop verifies and installs only version A on the authorized low-storage Windows lab without restoring development caches.
7. **Version B and installed A→B proof** — publish a deliberately small compatible B through the same approved channel and exercise preservation plus the failure matrix.
8. **Normal future loop** — only after that proof, use in-app updates for routine local testing; manual MSI replacement remains recovery fallback.

## 13. Current blockers and exact next move

The remaining authorization blockers are the updater signing-key custody decision, internal channel/hosting decision, Authenticode/internal-candidate policy and exact authorized Windows lab/procedure.

The next executable action after this lead contract checkpoint is the Codex Cloud bootstrap from current `main`, followed by implementation on the updater outcome branch. No signer, endpoint or installed behavior should be inferred or activated before those decisions and evidence exist.
