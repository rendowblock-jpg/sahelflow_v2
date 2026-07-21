# SahelFlow working memory

> **Last updated:** 2026-07-21

This is the compact entry point for current work. Update it at meaningful checkpoints and link deeper material rather than turning it into a transcript.

## Founder direction

- Use a lightweight multi-agent system with GitHub-backed shared memory.
- Work through deep-dive waves and multi-phase plans without task-by-task bureaucracy.
- Preserve the complete Founder-approved product contract.
- Preserve the durable Maze Map richness about capabilities, journeys, UI/UX, frontend behavior, Arabic/RTL and accessibility.
- Ground product and architecture work in actual source and evidence.
- Maintain one non-conflicting authority flow before implementation begins.
- Preserve GLM's one-ref cross-session continuity without maintaining a second product, roadmap or tool source.
- Use ChatGPT as the lead product/experience/architecture/engineering partner, active critical implementer, independent reviewer and continuity controller.
- Use Codex Cloud as the normal primary builder and executable Linux environment for implementation, development-app launch, browser inspection, tests, builds and iterative fixes.
- Use Codex Desktop as the installed-Windows laboratory and local-machine executor rather than the routine primary compiler.
- Keep GitHub Actions as clean-checkout and artifact-production authority for the exact commit.
- The Founder PC is low-end and SSD-constrained. Routine work must not require it to retain the full development checkout, dependency caches, `.next`, Rust `target` or repeated build/install caches.
- The preferred hands-on test path is: cloud implementation and validation → GitHub Actions internal Windows artifact → download/install only the exact artifact on the Founder PC → launch SahelFlow locally and record observed behavior.
- The Founder removed heavy caches, build output and development installation because the disk became full and the machine became slow. Do not recreate them unless a bounded Windows-only investigation explicitly requires it.
- Prefer the first routine local installation to contain a proven signed updater. After an installed A→B update drill succeeds, normal testing should use in-app updates rather than source pulls, local builds or repeated manual MSI installation.

## Canonical documentation state

The documentation reset, experience recovery, semantic consistency audit and MAWS cloud-workflow transition are integrated into `main`:

- PR #95 — current-to-target program: `dee78e9c6085b367fb7a533b50624f4389a4cb8d`.
- PR #96 — Maze Map experience authority: `2e5594b9af5bf1cb765f7b84dfbce4b393ba21c5`.
- PR #97 — documentation authority/consistency audit: `7a138695d4075998165cee362436f5201febe4ea`.
- PR #98 — post-audit checkpoint: `7a5e21d94f577db3946ac347fad49533b8625687`.
- Integrated baseline used to start the first implementation wave: `5fe00b5cb85505e5df27499fe46d0fa6050c0788`.
- PR #112 — MAWS Codex Cloud workflow and low-storage Windows launch path: `11e6fa114dc257f8f686c9859d72886a034e1e50`.
- PR #113 — post-merge Working Memory and active-wave checkpoint: `87af8227f4c361b2d99786bed3289a87f17a12f2`.

No application behavior or executable product source changed in the documentation waves above.

### Canonical read order

1. [`../product/README.md`](../product/README.md)
2. [`../experience/README.md`](../experience/README.md)
3. [`../architecture/README.md`](../architecture/README.md)
4. [`../architecture/CURRENT_TO_TARGET_ANALYSIS.md`](../architecture/CURRENT_TO_TARGET_ANALYSIS.md)
5. [`../architecture/IMPLEMENTATION_ROADMAP.md`](../architecture/IMPLEMENTATION_ROADMAP.md)
6. [`../architecture/CODING_WORKFLOW.md`](../architecture/CODING_WORKFLOW.md)

## Confirmed authority model

1. A newer numbered Founder decision governs only the choice it explicitly changes.
2. Product package controls promises, Stable scope, entitlements, exclusions and public truth.
3. Experience package controls required capability depth, journeys/states and frontend/UI/UX quality for included scope.
4. Engineering Specification and accepted ADRs control target system boundaries and invariants.
5. Current-to-Target Analysis controls the source-grounded implementation model.
6. Roadmap, Workflow and Provider Registry control sequence, review/evidence and integration claims.
7. Working Memory and the active wave control current progress only.

A lower layer cannot silently weaken a higher layer. Apparent conflicts are reconciled in the owning documents before coding continues.

## Scope classes

- **Required** — explicit Founder/Launch Scope commitment.
- **Conditional** — named capability public only after certification.
- **Depth requirement** — behavior/state/UX needed to make required scope complete.
- **Candidate** — useful recovered or planned item needing Founder classification before commitment.
- **Excluded** — prohibited for SahelFlow 1.0.

Ambiguous scope defaults to Candidate.

## Active roles and session continuity

- **Founder** — direction, priority, value judgment, sensitive authorization and release approval.
- **ChatGPT** — lead engineering partner, critical implementer, independent reviewer and durable-memory controller.
- **Codex Cloud** — primary cloud builder and Linux source/development/browser executor.
- **Codex Desktop** — installed-Windows laboratory on the authorized local machine.
- **GitHub Actions** — clean-checkout validation and exact artifact production.
- **GLM** — external research and adversarial discovery specialist.

The exact resume prompts for every ChatGPT and Codex Cloud session are in [`AGENT_PROMPTS.md`](AGENT_PROMPTS.md). Both interfaces resume from `AGENTS.md`, this Working Memory, the active wave, the governing authorities and the exact branch/PR rather than depending on chat history.

## GLM continuity state

The old `agent-handoff` orphan ref remains useful, but its current role is narrow:

- compact GLM resume checkpoint;
- thin bootstrap into current `main`;
- no product, experience, engineering, roadmap, source or tool authority;
- no application work directly on the orphan ref.

The current protocol is [`GLM_CONTINUITY_PROTOCOL.md`](GLM_CONTINUITY_PROTOCOL.md). Shared commands and their source live on `main`:

```bash
bun run sf-audit
bun run sf-inventory
bun run sf-verify
bun run sf-verify --fast
bun run glm:bootstrap
```

Historical Session-40 handoff/tool content remains in orphan-branch Git history only. GLM reads current `AGENTS.md`, Working Memory, active wave and governing authorities at every resume.

## Active wave

[**Proven Canonical Windows Desktop**](PROVEN_CANONICAL_WINDOWS_DESKTOP_WAVE.md) is active. PR #104 integrated the source checkpoint into `main` at `d33890fe31836d9a982902dd469bcc3960c4c23c`; PR #105 integrated the reproducible remote-development environment at `1a0469bb5384561d85178316d0cd6e94745b44a0`; PR #112 integrated the ChatGPT/Codex Cloud/Codex Desktop workflow at `11e6fa114dc257f8f686c9859d72886a034e1e50`. No Linux/cloud result is installed-Windows evidence.

Required outcome:

> A seller can install one Windows candidate, start it reliably, open only the intended shop, receive a clear recoverable failure instead of silent fallback or partial startup, and move to a newer approved version without rebuilding locally or losing shop data. The repository can prove this from a clean checkout and an installed A→B drill.

Current checkpoint:

- GitHub Actions infrastructure is operational; clean-checkout quality and release-path Rust gates are green for the integrated source baseline.
- The integrated runtime fails closed when mandatory resources or readiness fail, kills timed-out children, starts the degradable sidecar only after readiness and exposes a redacted seller-visible blocked-startup document.
- Packaged startup allocates per-launch loopback endpoints and credentials, binds readiness to exact process/shop/registry/migration authority and uses one bounded restart/crash-loop supervisor.
- Process-bound shop/database authority, an atomic registry, all-shop migration planning, external journal, verified snapshots, OS lock, interrupted restoration and transaction-bound order effects are integrated.
- Local Windows source-testable verification is green, but no installed MSI, migration/failure-injection drill, T470 measurement or 4 GB measurement is claimed yet.
- The previous local HP development machine is an Intel Celeron N3060 with 8 GB RAM and less than 10 GB free disk. It is a Windows/low-end observation device rather than the primary compilation environment.
- Codex Cloud is the selected normal primary cloud builder; its specific SahelFlow environment still needs a first recorded bootstrap/launch/verification checkpoint.
- The Founder removed local dependency, build and installation caches because the SSD became full and the machine became unusably slow. The local goal is not to restore the full development workspace; it is to install and launch an exact prebuilt SahelFlow candidate for hands-on testing.
- The updater dependencies and Tauri plugin are present, but the checked-in configuration currently has updater artifact creation disabled and updater activation disabled. No updater signing-key custody, published update channel, signed metadata, in-app update journey or installed A→B proof is accepted yet.

Exact next executable action — use this sequence in both new ChatGPT and Codex Cloud sessions:

1. **ChatGPT lead pass:** resume from canonical GitHub state; inspect the updater, release, versioning, migration and signing boundaries; define the governing implementation contract and directly control or implement the sensitive trust/signing/release portions.
2. **Codex Cloud bootstrap:** declare Codex Cloud Linux, repository/branch/commit/worktree; prove dependency setup, development-app launch and the appropriate shared gate from current `main` without making an installed-Windows claim.
3. **Updater implementation:** on a normal `agent/<outcome>` branch, enable signed updater artifacts and checking; implement the complete checking/available/downloading/installing/restart/later/failure/retry journey; synchronize versions; create the GitHub Actions publishing path and signed update metadata; add tests and evidence. Do not place private signing material in the repository or prompts.
4. **Independent review:** ChatGPT reviews the complete updater/release diff, security model, data-preservation behavior, failure recovery and UX; Codex Cloud applies corrections and reruns validation.
5. **First installer:** GitHub Actions builds the first updater-enabled internal Windows MSI and updater artifacts for version A. The exact signing key, public key, release channel, artifact digest and procedure must be authorized and recorded.
6. **Local installation:** Codex Desktop downloads and verifies only version A, installs it on the authorized low-storage PC and launches SahelFlow without restoring development caches.
7. **A→B proof:** publish a deliberately small version B through the same signed channel; from the installed version A, check, download, install and restart into B. Prove that shops, databases, settings, credentials, migration history and recovery material remain intact, and exercise offline/download/signature/install/restart failure handling.
8. **Normal future loop:** only after the A→B drill passes, use coherent in-app updates for routine local testing. Manual MSI replacement remains the recovery fallback, not the normal path.

Do not begin Cloudflare, hosted storefront, remote PWA or provider expansion before the foundation and updater/install gates pass.

## Open implementation-lab decisions

- Exact local Windows environment for the first installed candidate; the Founder low-storage PC is the intended hands-on launch machine but must be explicitly named as the authorized lab for evidence claims.
- Exact updater signing-key generation, offline backup, custody, rotation and loss procedure.
- Exact internal update channel and hosting/publishing policy, including whether GitHub Releases is acceptable for the internal phase.
- Exact initial MSI and updater artifact download, digest/signature verification, installation and cleanup procedure.
- Exact 4 GB floor-reference machine/dataset and T470 dataset.
- Persisted shop-incarnation identity before backup restore or future inbox/outbox records may treat a deleted-and-recreated slug as the same shop.
- Which implemented design tokens are retained or changed after the packaged frontend/design-system audit.
- Which courier candidates the Founder selects for the public launch set after live certification evidence.
