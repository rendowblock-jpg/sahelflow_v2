# SahelFlow — Research, coding, review and delivery workflow

> **Status:** Active operating contract. Subordinate to explicit Founder decisions and to Product, Experience and Architecture.
> **Execution model:** one active implementation agent at a time (FD-029); audit-first; batch remediation; risk-selected CI.
> **Not here:** the current release, what is installed, what is open (`../system/CURRENT_STATE.md`, `../../AGENTS.md` "Live facts are read, not remembered").

Speed comes from accurate scope, root-cause grouping, targeted fast feedback and one frozen certification head, not from weakening integrity, Arabic/RTL, accessibility, security, recovery, performance or evidence honesty.

## 1. Session sequence

Every session begins from live GitHub truth, not a copied SHA.

```text
resolve protected main + open PRs/issues + latest release
→ read the active authority
→ identify the one current observable outcome
→ if implementation is needed, map affected authority/consumers/tests/data/evidence
→ research only where a material decision is uncertain
→ implement one dependency-correct package, with targeted checks while coding
→ freeze one exact head → risk-selected CI → adversarial review → finding closure
→ expected-head merge → verify the durable tree → reconcile current truth
→ if separately authorized, build/sign/publish only from exact protected main
→ do the installed/human/provider evidence that automation cannot prove
```

Do not restart generic repository reconnaissance when a bounded outcome is known. Do not rerun an unchanged passing head. Do not retry a deterministic failure until it turns green without a found cause.

## 2. Authority and anti-drift

The authority order is in `../../AGENTS.md`. Operational rules:

- protected `main` is integrated source truth; no direct application edits on it; one active writer per product, runtime or release branch;
- `CURRENT_STATE.md` owns the non-claims and the Founder-installed record; this file owns the process;
- no important product or release decision stays only in chat; issues hold evidence and work queues, never authority;
- source, CI, signed publication, Founder-installed, real-phone, live-provider and customer evidence are distinct levels. A subsystem is not closed because commits merged or a test count is high; the defined seller or Founder outcome and every applicable P0/P1 must be proven.

## 3. Complete package audit

Before a major package or a materially uncertain repair, do the smallest audit that makes the change safe. Inspect every applicable caller and route, shared primitive, service authority, permission and trusted-actor boundary, model, query and migration, protected-field and index projection, native or process boundary, provider and outbox path, backup/restore consequence, AR/FR/EN and RTL surface, state and accessibility behavior, hot-path performance, direct tests and release or licensing consequence. For a broad package, freeze one Problem Register first so duplicate manifestations group under root causes and P0/P1 are visible. For one demonstrated defect, the reproduction plus its sibling inventory is the register. The FRC-3 ledger is a finite evidence map, not generic reconnaissance.

## 4. Research rule

Use current primary or official sources before a material choice that depends on changing standards, platform or provider behavior, law, security guidance or external APIs. Compare alternatives on correctness, security and privacy, recovery, Arabic/RTL/accessibility, performance, maintainability and continuity cost. Research is bounded: once a safe SahelFlow-specific decision with measurable acceptance exists, implement. Do not create a new permanent masterplan for each problem.

## 5. Checks while coding, and what CI does

Use the cheapest check that can catch the changed boundary: TypeScript and ESLint; targeted Vitest and database tests; targeted Playwright for changed seller journeys (AR/FR/EN, RTL, keyboard, resize); provider contract tests; Prisma generation and migration checks; Rust format, check and tests; focused measurement for hot paths; `bun run sf-version` and the updater-contract check for release-authority work. Targeted checks are fast feedback, not permission to skip the frozen gate.

**Test sandbox.** Vitest refuses to start without `SF_TEST_ROOT`, `SF_DATA_DIR` and `DATABASE_URL`. `bun run test:sandbox -- <dir>` creates a disposable sandbox and prints all three; export them. CI also sets `SF_MASTER_KEY`. Database-backed tests need the migrations applied to the sandbox database (`bunx prisma migrate deploy` with that `DATABASE_URL`). Do not run tests against real shop data. TypeScript needs a large heap (`NODE_OPTIONS=--max-old-space-size=6144`), and a leftover `.next` folder breaks `tsc`.

**CI (`.github/workflows/ci.yml`).** It runs on pull requests that target `main`, and a new push to the same branch cancels the run in progress. A job named `classify` runs `scripts/classify-pr-risk.ts`, which reads the changed paths and selects lanes: quality, Tauri, Windows standalone, Windows Rust parity and installed-MSI (documentation-only changes are classified separately). The `authority` job always runs `sf-version` and `sf-audit` (the documentation gate, `../MANIFEST.json`, and the release-frontier check). The quality lane runs Prisma generation, `sf-verify`, the full Vitest suite with coverage and `bun audit --production`. Two further workflows add the browser evidence (Phase 5 Experience gate; Phase 6-7 completion gate). **Required checks on `main`:** `Required PR gate` (waits for every selected lane), `Required Phase 5 Experience gate` and `Required Phase 6-7 completion gate`. Draft pull requests skip the heavy and browser jobs, so a draft proves nothing about them.

**An advisory can turn `main` red with no change.** The production dependency audit fails every pull request as soon as a new advisory covers a locked version. The fix is a dependency pull request (override or bump, lockfile regenerated, audit and frozen install checked, behavior smoke-tested), not a re-run.

## 6. Evidence

The gate must surface the complete actionable failure set; do not hide later failures behind a first-failure loop when normal diagnostics can report them. After a coherent package, freeze one exact head, review it adversarially, batch related P0/P1 fixes that share a root, and rerun the selected gates once on the repaired head. Do not bounce through many tiny review-fix-review commits.

**What a signed candidate needs.** Exact frozen and reviewed source binding; clean release compilation; Rust release parity; MSI and updater contract and signature; clean install and in-place upgrade; first launch, authenticated readiness, close and reopen; process containment and cleanup; AppData, registry, database and key preservation; migration interruption and repair; backup, corruption, restore and replacement recovery; the affected UI journeys in AR/FR/EN and RTL with accessibility; permission and shop isolation; applicable reference-hardware or resource evidence; a deterministic evidence manifest. A signed release is built only from exact protected-main authority. Branch-only artifacts are evidence candidates, never release sources.

## 7. UI repair proof

For any material UI repair, prove the changed states, not that a component exists: loading, empty, filtered-empty, permission, offline, degraded, stale, pending, conflict, error and recovery as applicable; AR/FR/EN parity; Arabic joining, typography and reading flow; semantic RTL child order and logical geometry; portaled primitive direction; mixed Arabic/Latin/numeric bidi isolation; keyboard and focus entry, return and trap; accessible names, status and errors; 100–200% zoom, reflow and 1366×768 containment; reduced motion; live resize; low-end render budgets. The shared direction, geometry and bidi contracts are protected: do not return to page-local physical-side patching without a demonstrable exceptional geometry. Analytical chrome follows locale direction; Cartesian chronology and quantitative geometry follow governed analytical semantics.

## 8. Performance and reliability

The budgets of the closed #226 stay as regression criteria. Performance work is measurement-driven: record representative samples and stage evidence, find the largest measured cause, repair that bounded cause, preserve correctness, accessibility and recovery, and rerun the affected metrics on the exact repaired head. Do not raise a threshold to remove red, and do not add a speculative cache, index, virtualization or worker deferral without measured evidence.

## 9. Review and repair

Before merging material work: author self-review; freeze the exact head; one adversarial review across the affected layers; classify findings; repair dependency-correctly as one set; re-review what changed materially; rerun the affected evidence and the final gate.

- **P0:** active data loss or exposure, cross-shop or cross-tenant access, corrupt recovery, irreversible money or stock damage.
- **P1:** a required journey, authority, recovery, provider, major experience, RTL, accessibility or performance defect that blocks the intended checkpoint.
- **P2:** bounded hardening. **P3:** polish.

Do not merge a known applicable P0/P1. A release, package or security P2 can block when it undermines the authority being certified.

## 10. First Revenue Certification workflow

The order, gates and requirements of FRC-1 to FRC-6 are in `../system/ROADMAP.md`; what is proven so far is in `../system/CURRENT_STATE.md`. Process rules:

- **FRC-1 (#306):** preserve AppData, registry and install identity, keys and shop databases; keep only redacted provider identifiers, timestamps and non-sensitive screenshots; record the exact failing stage; open one bounded repair only for a reproduced root and its siblings. Source, CI and signed-workflow evidence cannot close this provider step.
- **FRC-2:** freeze the current tool registry and the synthetic or redacted AR/FR/EN/Darija/mixed corpus before execution. Test each tool's typed schema, allowlisted data, permission, current-state and approval authority, and its success, denial, stale, duplicate, partial, timeout, quota, offline and malformed behavior and audit. Prove message extraction through human review to exactly one canonical order, while core and manual operation stay available without AI.
- **FRC-3:** distinguish proven behavior, missing external evidence and demonstrated defects. A missing live-provider credential is not rewritten as a source defect; a code defect is not hidden as external.
- **FRC-4 and FRC-5:** official current documentation plus official development or sandbox credentials, or protected authorized real-account credentials. Certify each action independently. Open-source wrappers inform research only.
- **FRC-6:** no deployment until its exact promised scope is certified and customer access and licensing authority hold. A bounded offline exception or a commercial funding arrangement needs a newer explicit Founder decision and truthful disclosure.

All heavy builds, Rust, MSI and complete suites run in GitHub Actions (or a disposable worker that clones a pushed commit; never put a secret on one). The Founder's machine does lightweight inspection and the installed and provider observations automation cannot prove.

## 11. Release/publication discipline

For any later explicit release authority: establish a new exact version and decision pair in a reviewed release envelope (never infer one from time or from documentation); freeze the exact head; run the selected source, native, Rust, Windows, MSI and install evidence; require exact-head review and `Required PR gate`; merge by expected head; re-fetch `main` and its tree; build, sign and publish only from exact protected `main`; verify signature, install, reopen and hydrated UI, deterministic rewrites, manifest, `latest.json`, tag and publication target; keep Founder-installed acceptance and customer-online or provider evidence separate.

### Release train mechanics

1. A release-authority pull request changes `sahelflow.version.json` and adds or amends one `.github/release-requests/*.json`. It merges only after its full Required battery, including the installed-MSI lane, is green. Documentation or product pull requests must not touch those two paths, because merging them starts a signed build.
2. The merge triggers `Dispatch signed internal version` (`release-on-version-authority.yml`), which dispatches `Build Signed Internal Windows Update` (`release.yml`) with `source_ref` set to the merge commit, using the workflow's own token. The dispatcher can be started by hand from the Actions page; it always takes the current tip of `main`.
3. `release.yml` requires `source_ref` to be the **current tip of `main`** and refuses anything else in its first source step. GitHub refuses to create the draft release at a commit that `main` has already moved past (`403 Resource not accessible by integration`, about 20 minutes into the build); probe workflows showed that the tip of `main`, the branch name and descendants of `main` work, and GitHub's exact rule is not documented. Do not merge to `main` between dispatch and the draft release being created.
4. The train attests that the source tree equals a reviewed merged pull request's head tree and that `Required PR gate` was green there; builds and signs the MSI and the per-machine `SahelFlow-Setup.exe`; creates a draft release; installs the signed MSI and proves launch, reopen and authenticated UI twice; verifies that each `latest.json` entry carries the signature of the file it points at (an entry once pointed at `SahelFlow-Setup.exe` with the MSI's signature); compares the draft's assets byte for byte with the verified candidate; creates the tag; publishes.
5. Publication requires exactly one release for the tag. Remove a stale draft for the same tag first.
6. A failed gate is investigated, never retried blind. Record the failing step's text on the release pull request first. One re-run is allowed only for a failure the diff cannot reach, with the evidence recorded before it; a second identical failure is a defect. Installed-UI evidence lanes have failed on timing assertions (a clock comparison, a shutdown-receipt deadline) with no product change; the repair was to the harness, with the content contract unchanged.
7. After publication, update `../../CHANGELOG.md` and `../system/CURRENT_STATE.md` (the Founder-installed record) in a documentation pull request that does not touch the two release paths.

The one exposure no check closes is `main` moving during the roughly 14-minute build. Closing it needs the draft release to exist before the build (the build action reuses an existing draft), which changes release mechanics and needs a Founder decision (`../system/CURRENT_STATE.md`, section 6).

## 12. External and provider boundaries

- #306 real-phone WhatsApp evidence and #230 customer-online network readiness stay open until their own evidence closes them.
- Public provider support is capability-specific and needs current live certification; adapter, source or mock evidence is insufficient.
- The free Gemini tier is limited to the privacy-safe seller-owned-key contract; synthetic or redacted certification does not authorize silent client-PII processing.
- A `workers.dev` route may support development but is never the sole business-critical customer authority.
- Representative beta, legal, privacy and security review, provider certification, incident and recovery drills and compatibility gates stay distinct before Stable. No Internal checkpoint authorizes Beta or Stable; customer-online licensing is the FD-066 launch authority, and a paid assisted deployment needs its own scope gate under FD-045.

## 13. Hard prohibitions

The permission rules are in `../../AGENTS.md`. In addition: no cross-SHA evidence mixing; no retry-away of deterministic red; no hidden product change inside release-authority work; no destructive reset of the Founder's evidence or state for convenience; no branch-only signed release; no weakening of updater, signing, Rust `--locked` or release-source guards; no claim that automation equals Founder human acceptance.
