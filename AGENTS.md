# SahelFlow agent entry point

SahelFlow uses GitHub as durable memory across agents and sessions. The system is intentionally lightweight: prompts guide specializations, Working Memory preserves the current wave, and normal branches and pull requests preserve implementation history and evidence.

## Start here

1. Read `documentation/operations/WORKING_MEMORY.md`.
2. Open the active wave or primary artifact linked there.
3. If the collaboration model is unfamiliar, read `documentation/operations/MAWS_STRUCTURE_AND_WORKFLOW.md`.
4. Read the exact session-resume prompt for the current interface in `documentation/operations/AGENT_PROMPTS.md`.
5. GLM sessions using the `agent-handoff` continuity ref also read `documentation/operations/GLM_CONTINUITY_PROTOCOL.md`; the orphan handoff is a resume checkpoint, not authority.
6. Read `documentation/product/README.md` whenever scope, entitlement, pricing, support or a Founder choice matters.
7. Read `documentation/experience/README.md` whenever work touches a product capability, user journey, state vocabulary, UI/UX, frontend architecture, Arabic/RTL, accessibility, responsive behavior or page completeness.
8. Read `documentation/architecture/README.md` whenever architecture, migration, implementation, provider boundaries, release or evidence matters.
9. Inspect the repository and verify important claims before acting.

A newer explicit Founder decision supersedes an older choice only when it states what changes. Record it in the product authority and Working Memory rather than creating another competing plan.

## How to work

- Work in deep-dive waves and multi-phase plans rather than manufacturing an issue for every action.
- Use the best available method to investigate, challenge, design, implement, test and revise.
- Agent prompts describe strengths, not permission boundaries.
- Use additional agents or parallel workstreams when they materially help.
- Treat ChatGPT as the lead product/experience/architecture/engineering partner, an active implementer for critical work and the independent reviewer of material Codex Cloud changes.
- Treat Codex Cloud as the normal primary builder and executable Linux environment for source inspection, implementation, web/runtime launch, browser checks, TypeScript, ESLint, Prisma, Vitest and other cloud-validatable work.
- Treat Codex Desktop as the installed-Windows laboratory and local-machine executor. It remains the only agent assumed to have full access to the Founder-authorized Windows desktop/runtime and must be used for MSI installation, packaged launch, Windows process behavior, sleep/resume, reboot, SmartScreen, recovery drills and reference-device measurements.
- GitHub Actions remains the clean-checkout and artifact-production authority for the exact commit under test, including Windows artifact builds when configured.
- The Founder workstation is low-end and storage-constrained. Do not require it to retain a full routine development checkout, dependency cache, `.next` output, Rust `target` directory or repeated local build artifacts. Prefer cloud implementation and a prebuilt internal Windows artifact for hands-on launch testing.
- Declare the execution environment before making evidence claims: ChatGPT with GitHub connector, Codex Cloud Linux, Codespace Linux, GitHub Actions Linux/Windows or installed local Windows.
- A Linux/cloud/browser pass cannot prove installed Windows behavior. A prebuilt MSI launched on the Founder workstation can prove only the recorded installed-machine behavior for that exact artifact and machine.
- Keep durable facts, decisions, blockers and the exact next move in GitHub. Routine reasoning can remain in chat.
- Update shared memory at meaningful checkpoints, not after every small action.
- Update an existing authority instead of creating a new status, gap, handoff, experience, capability, journey or planning document.
- Before implementation, identify the governing product clause, scope class, capability, journey/states, experience dimensions, architecture invariants and evidence level.
- Codex Cloud and Codespace sessions must commit and push intended work before ending; never use an unpushed disposable filesystem as cross-session memory.
- GLM implementation or research changes use a normal `agent/<outcome>` branch based on current `main`; never implement product work on `agent-handoff`.

## Shared commands

```bash
bun run sf-audit
bun run sf-verify
bun run sf-verify --fast
bun run glm:bootstrap
```

The source for shared verification and bootstrap commands lives on `main`. Independent copies on continuity or historical refs are obsolete.

## Durable truth and precedence

- A newer explicit numbered Founder decision governs the product choice it expressly changes.
- The product package holds long-lived Founder-approved intent and Stable scope.
- The experience package defines required capability depth, user journeys, operational states and frontend/UI/UX quality for that scope.
- The Engineering Specification and accepted ADRs define the target system and invariants.
- The Current-to-Target Analysis defines the latest source-grounded implementation model.
- The roadmap defines dependency order; the workflow defines review and evidence.
- The active wave and Working Memory hold current progress.
- The `agent-handoff` ref holds GLM continuity only and cannot override any integrated authority.
- `main` is integrated code; branches and pull requests are proposed work.
- Tests and observed behavior are stronger evidence than summaries or claims.
- Historical documents, research and git history are context only unless a current authority explicitly adopts a conclusion.
- A lower layer cannot weaken a higher one. Apparent conflicts must be reconciled in the owning documents before implementation continues.

Do not put credentials, private seller data, signing material or secret values in prompts, documents, commits, issues or pull requests. Apart from real product, experience, data, security and repository constraints, MAWS does not prescribe how an agent must do its work.
