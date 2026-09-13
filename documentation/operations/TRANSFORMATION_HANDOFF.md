# Transformation handoff — resume point

Companion to `TRANSFORMATION_REGISTER.md` (the findings) and
`documentation/product/INTERFACE_SYSTEM.md` (the design authority). This file
answers one question only: **what does the next session do first?**

Branch: docs-only reconcile · PR **#428**
Last verified: 2026-09-12 at `eb0309a`

---

## 0. START HERE — the register's mechanical and page-level rows are closed

Branch is green and the work below is CI-verified. What remains is genuinely
large, not leftover tidying — read §4 before picking anything up.

### Closed since the last handoff

| Row | Outcome |
| --- | --- |
| SEC-01 | dependency chain bumped; `bun audit --production` passes |
| SYS-05 | 8 radii -> 3 tokens, 582 substitutions / 137 files |
| SYS-08 | IconTile scale corrected to its call sites, 16 tiles adopted |
| SEC-02 | coverage is an ENFORCED ratchet (77/76/82/77), no longer decorative |
| DEAD-02 | the "dead" shim was live; real implementation took the canonical name |
| IA-01 | **closed at its root** — see below |
| IA-05 | zero unlabelled inputs in Settings, 8 `aria-describedby` links |
| UI-03/04/05 | shortcut disclosure, one status signal, honest session titles |
| UI-06 | measured; 4 routes were lying about their shape, 11 were already right |
| STR-01 | canvas 1,767 -> 964 across two extractions — **still open**, see §4 |

### IA-01 was not what it looked like

The register framed it as "Agents and Inbox opt out of the page grammar". Both
are now on `PageShell variant="workspace"` with real visible headings. But the
deeper half was that **`PageShell` and `PageHeader` each rendered their own
`<header>` and `<h1>`** — the product had two headings with two type scales, so
migrating routes alone would have moved the split rather than closed it.

`PageHeader` is now the single header implementation and `PageShell` composes
it. PageShell owns the page CONTAINER; PageHeader owns page IDENTITY. Its
heading also joined the type ramp — it had hardcoded `text-xl`/`sm:text-2xl`
with an arbitrary `text-[15px]` description across 21 routes, which meant the
largest text in the product was the text least governed by INTERFACE_SYSTEM.md
§2, and Arabic never got its reading floor there.

### Decisions a future session could undo by accident

1. **The storefront radius carve-out is deliberate** (`--radius-storefront-soft`
   / `-round`). Collapsing it made two of the seller's three theme options
   render identically. Do not "finish the migration".
2. **W4's Card -> Panel migration is CORRECTED, not pending.** Per IA-05b,
   `settings-control-center.module.css` already strips border/radius/background
   from every card and adds hairlines, so Settings ALREADY renders as flat
   sections. Swapping in `Panel` would give them borders and radii and make the
   surface MORE island-like. The valuable Settings work was IA-05, and it is done.
3. **IA-03 / IA-04 are CORRECTED.** The Agents 3-column layout and its 1500px
   breakpoint are deliberate, behaviourally covered at 1600px by
   `e2e/ai-workspace.spec.ts:127`, and contract-locked. Changing them is a design
   decision for the Founder, not a repair.
4. **IconTile's scale follows its call sites**, not the reverse. It shipped with
   proportions no tile had and was adopted zero times.

### The contract-conversion method that made all of this possible

Every pin that blocked a repair was CONVERTED, never deleted or relaxed:
restate the intent, assert it where the guarantee now lives, and keep the
wiring assertions on the file that still decides them.

**Three traps this cost real time to learn:**

- A codemod that touches `__tests__` can weaken a contract while appearing to
  update it. SYS-05 rewrote two `not.toContain(...)` prohibitions into
  prohibitions of *different* strings, one of which had become legitimate system
  styling. Read the test diff separately from the source diff.
- A `toContain`-only re-anchoring sweep misses **ordering** assertions.
  `f06-page-completion-contract` compares two `indexOf` results; both operands
  moved in STR-01, and with `>=` instead of `>` it would have PASSED while
  asserting nothing.
- "No importers" is not "unreferenced" in a repo where 136 test files read
  source by path.

## 0b. Retained history — the SEC-01 bump and the installed-MSI diagnosis

### (retained) The SEC-01 bump and the installed-MSI gate — RESOLVED, see §0

**Superseded section 1 below.** As of `3ed8754` the dependency bump *was* applied
(`package.json` + `sidecars/whatsapp/package.json` + `bun.lock` together, plus the
`sharp` pin in `windows-release-build-contract.test.ts:221-226` bumped `0.35.3` →
`0.35.4`). `bun audit --production` is expected to pass now.

Applying it also flipped the risk classifier, so the heavy Windows lanes ran for
the first time on this branch — and **`installed-msi` failed all three gates**:

```
lifecycle=failure, authenticatedUi=failure, replacementRestore=failure
```

### Do not read that as three independent failures

Read the chain in order; only the first is a root cause.

1. **`lifecycle`** — `verify-installed-windows-msi.ps1:1174`
   ```
   Native protected installation-root rotation failed with exit code 101,
   argument observed True, stderr categories process-authority-conflict,
   and 1 surviving installed process(es).
   ```
   Exit 101 is a Rust panic. The category maps to the signature at
   `verify-installed-windows-msi.ps1:1124` — *"another SahelFlow desktop or
   installation-root rotation process is active"*. **A previous installed process
   did not exit.**

2. **`authenticatedUi`** — `verify-installed-windows-ui.ps1:329`, after 100 s:
   ```json
   {"endpointMatched":false,"responding":true,"workspaceWindowCount":0,
    "visibleWindows":[{"title":"com.sahelflow.desktop-siw"},{"title":""}]}
   ```
   The server **is** responding, but no workspace window exists and the endpoint
   does not match. That is consistent with launching into the *surviving* instance
   from step 1 (`-siw` = the safe-startup window), i.e. a **cascade**, not a
   second root cause.

3. **`replacementRestore`** — `validated replacement source fixture is missing`.
   Definitively a cascade: that fixture is written at the **end** of the lifecycle
   step's `try` block, which threw in step 1. It never had a chance to exist.

### The shutdown hypothesis was WRONG — evidence read it out

I originally proposed that a `next` 16.2.11 → 16.3.4 shutdown change left the
Node child alive, and set the falsification test explicitly: *"if it is
`node.exe` under the install root, the shutdown hypothesis is confirmed."*

The Founder read `installation-root-rotation-diagnostic.json` from the artifact.
**The survivor is `sahelflow.exe` PID 7560 (parent 4412), created 14:01:50Z and
still alive at the 14:05:51Z rotation attempt** — the Tauri host binary, not the
Node child. My stated test came back negative, so the hypothesis is withdrawn.

What the evidence establishes instead:

- The native authority **fail-closed correctly**. It refused to rotate an
  installation root while an installed process it had not authorized was still
  running. That is the protected boundary working, not breaking.
- The survivor came from **this same job's earlier install phases** (created
  ~2.5 min into the lifecycle script), so this is a reaping/cleanup property of
  the run, not a property of the build.

Independently verified here, and stronger than first claimed: **the entire PR
has zero native delta against `main`** — `git diff origin/main...HEAD --
src-tauri Cargo.lock '*.rs'` is empty. The rotation code, launcher and
process-authority logic are byte-identical to main. Combined with `Windows
database + standalone + contained launcher` passing **green on this exact head**
(that lane exercises the packaged standalone and the contained launcher), the
case for a runner transient is good, and this lane was green on 2026-09-06 in
run `34017582977`.

**The cascade reading still holds and is now better supported.** A surviving
`sahelflow.exe` with single-instance behaviour explains gate 2 exactly: the new
launch attaches to the survivor, producing the `com.sahelflow.desktop-siw`
window, `workspaceWindowCount: 0` and `endpointMatched: false`. Gate 3 remains a
definite cascade.

**One question the diagnostic does not answer.** It names the survivor under the
install-root filter. It does not say whether a `node.exe` child *also* survived
— and `sahelflow.exe` can stay alive waiting on an unreaped child. So the Next
bump is not fully exonerated, only demoted: `processes.json` in the same
artifact carries every `node.exe`/`sahelflow.exe`/`msedgewebview2.exe` with
`ParentProcessId`, and would settle whether PID 7560 was waiting on a child.
Worth one look if the failure recurs; not worth blocking on if the re-run is
green.

**If the rotation refusal reproduces with the same `process-authority-conflict`
category, it is not a transient** and must be investigated as a real defect —
an installed app instance that does not exit is a product bug regardless of what
triggered this run.

### Precedent worth knowing

Main run **#785** landed the *previous* Next.js bump as
*"upgrade Next.js to 16.2.11 — after full CI, Windows Rust release parity, and
installed-MSI launch/close/reopen validation."* **This repo's own precedent is
that a Next.js bump is not done until installed-MSI is green.** It is currently
red. Treat that gate as the acceptance criterion for the bump, not as noise.

Only if the bump is somehow implicated after all: take `next` **16.3.3** (the
minimum that clears the advisory), or hold the `next` bump alone while landing
`sharp`/`js-yaml`/`hono`/`baseline-browser-mapping`. On current evidence none of
that is indicated. Either way, do **not** disable or weaken the installed gate.

---

### (retained) The one thing blocking PR #414 as of `644ec14` — RESOLVED, see §0

**`bun audit --production` — nothing else.**

This was established from the CI logs on head `8ea5a0f`, not inferred. The
`Complete source-quality diagnostics` job prints its own verdict table:

```
TypeScript:        success
ESLint:            success
Vitest:            success
Migration status:  success
Dependency audit:  failure     <-- the only one
```

Two other things look like failures and are not:

| Signal | Why it is not blocking |
| --- | --- |
| `Coverage for lines (77.28%) does not meet global threshold (80%)` | `ci.yml:177` marks the coverage step `continue-on-error: true`. It is informational. Tracked as **SEC-02**. |
| Failures on heads `f42063b` / `9d374de` | Superseded runs. Every lane reports `cancelled`, not `failed` — `concurrency: cancel-in-progress: true` killed them when the next commit landed. Read the conclusion, not the colour. |

### The fix, ready to apply

Confirmed present on the registry (which is reachable from the container):

| Package | Now | Needs | Take | Where |
| --- | --- | --- | --- | --- |
| `next` | 16.2.11 | ≥ 16.3.3 | **16.3.4** | `dependencies` |
| `sharp` | 0.35.3 | ≥ 0.35.4 | **0.35.4** | `dependencies`, `overrides`, sidecar |
| `js-yaml` | 4.3.1 | ≥ 4.3.2 | **4.3.2** | `overrides` (stay on 4.x — 5.x is a major and `eslint` expects 4.x) |
| `hono` | ^4.12.34 | ≥ 4.13.5 | **^4.13.5** | `sidecars/whatsapp/package.json` |
| `baseline-browser-mapping` | transitive | ≥ 2.11.0 | **2.11.21** | new `overrides` pin (arrives via the pinned `browserslist` 4.28.8) |

**Why it was not pushed:** `bun install` could not be completed in this
container. CI runs `bun install --frozen-lockfile`, so bumped manifests
*without* a regenerated `bun.lock` would convert one failing check into a hard
install failure across every lane. The manifest edit was made, verified against
the registry, and then **reverted** — deliberately, not abandoned.

```bash
# next session, in an environment where install works:
bun install
git add package.json sidecars/whatsapp/package.json bun.lock
bun run typecheck && bun audit --production
```

Commit the three files **together**. A `next` minor bump is the real risk in
this set; the Windows standalone and Tauri lanes are the ones that would catch
it.

If the bump proves impossible, the alternative is **not** silence: SEC-01's
reachability assessment (commit `8ea5a0f`) concluded the honest disposition is
**mitigated, not unaffected**, and recording an accepted VEX disposition in
`documentation/security/phase4-vulnerability-triage.json` belongs to the
Founder, not to an agent on the strength of a source read.

---

## 2. Working environment — read this before "I can't run tests locally"

Vitest **does** run in this container. It needs two setup steps that are easy
to miss, because the config refuses to load without them:

```bash
bun run scripts/prepare-test-sandbox.ts <scratchpad>/sfsandbox > sandbox.env
set -a && . sandbox.env && set +a
bunx prisma migrate deploy      # <-- the step that is easy to forget
# prepare-test-sandbox.ts emits only SF_TEST_ROOT / SF_DATA_DIR / DATABASE_URL.
# It does NOT emit SF_MASTER_KEY, and 11 identity + connected-platform tests
# fail with "SF_MASTER_KEY must be configured" without it. CI supplies it at
# ci.yml:107 and :201; use the same non-secret default locally:
export SF_MASTER_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
node_modules/.bin/vitest run src/components src/app
```

Two more things that look like regressions and are not:

- **`sidecars/whatsapp/*.test.ts` fail to collect** with `Cannot find module
  'libsignal'` when the sidecar's transitive tree is not fully installed. Scope
  a run with `vitest run src` to skip them; they cover nothing under
  `src/lib/**`, so they cannot move the coverage number either.
- **Long error objects in passing output.** Many suites assert error paths and
  log the error they provoked. Read the final counts, not the log volume.

Without `migrate deploy` you get ~950 failures that all read
`no such table: CanonicalRefundReversal`. **That is the empty sandbox, not a
regression.** An earlier run in this session mistook it for one.

Runtime: ~80s for `src/components src/app`, ~230s for the full suite.
`tsc --noEmit` is ~2 min. Both are cheap enough to run before every push, and
doing so is what kept the last several pushes from burning CI cycles.

The `ECONNREFUSED 127.0.0.1:3000` noise in test output is a probe for a dev
server. It is expected and does not fail anything.

---

## 3. What landed, and what it is worth

`SYS-06` (wash-band tints) closed this session:

- **223 substitutions across 72 files**, collapsing **55 distinct alpha values
  to 15 tokens** (`subtle` 4% / `soft` 8% / `strong` 14% × primary, success,
  warning, destructive, info).
- Banded, not per-site: `≤5.5% → subtle`, `6–11% → soft`, `12–19% → strong`.
- Verified **contract-free before editing** — no test, script or e2e spec
  asserted any of the 55 strings. Then `tsc` clean, **880 tests / 132 files
  green**.

**Scope was deliberately bounded** to background fills on semantic colours below
20% alpha. Three bands are still open and the current tokens do **not** cover
them — do not extend the fill scale over them without new tokens:

- **Borders** (`border-primary/25`, `border-destructive/30`, …) — hairlines
  need more alpha than fills; the 3-step fill scale would misrepresent them.
- **Scrims/overlays** on `muted`/`background`/`foreground`/`accent`/`secondary`
  (`bg-muted/50` ×36, `bg-background/80` ×8, …) — a different semantic.
- **Solid alphas ≥ 20%** (`bg-destructive/90`, `bg-primary/55`, …) — opacity on
  a solid, not a wash.

---

## 4. Next targets, in order

Everything mechanical, page-level and accessibility-shaped is closed. What is
left is the expensive half, and each item is a real project rather than a tidy-up.

1. **STR-01 remainder — the canvas is CLOSED (324 lines; #416/#418/#419,
   register closed by #420). The first target is now `inbox-v3-thread`**:
   2,238 → 1,668 via merged PR #426 (`inbox-thread-message.tsx`, the verbatim
   bubble module) and → 1,544 via merged PR #427 (`use-inbox-thread-view.ts`,
   the view-state hook that receives `messagesInnerRef` + `copy` and owns no
   JSX; its first hosted run failed on two type errors the OOM-killed local
   tsc had missed — repaired inside the PR with honest exit-code evidence).
   Owed next:
   the **header seam** (avatar/status/search toggle/mark-unread/AI extraction +
   the `ThreadLastActive` cluster — measure the liveness and workspace-contract
   header pins first), then the composer and list seams. The same treatment is
   then owed to `storefront-studio` (1,752), `automation-builder` (1,491) and
   `inbox-v3-queue` (1,325). **Measure the pin exposure before every cut** — the
   method that keeps working: map every `expect(...).toContain(...)` string to
   the block that owns it, and do not forget `indexOf` ordering assertions and
   count assertions (`toHaveLength`).
2. **TEST-01 — the structural one.** 444 vitest files; **136 assert source text**
   via `readFileSync` carrying **3,980 `toContain`**; **3** render a component.
   This is why every repair above had to convert contracts by hand. Convert per
   surface as surfaces are rebuilt; converting in bulk would be a rewrite of the
   suite with no behavioural safety net underneath it.
3. **L10N-01 — copy authority.** 3 JSON locale files at parity plus **39 inline
   TypeScript translation modules totalling ~5k lines**. Any new user-facing
   string needs all three locales or the parity contract fails. Migrating the
   inline modules into JSON is mostly mechanical but very wide.
4. **STR-02 / STR-03 — type-safety and markers.** 208 `as unknown as`, 321
   non-null assertions, 28 TODO/FIXME/ts-ignore outside tests. Triaged
   individually, never blanket-removed — each one is a place the compiler was
   overruled, and some of those overrides are load-bearing.
5. **SYS-04 — arbitrary values**, retired continuously in the surface that owns
   each one rather than as a sweep.
6. **UI-07** — the three `rounded-full` empty-state marks left by SYS-08
   (`ai-review-evidence`, `ai-work-history`, `feature-gate`) belong to the
   state-primitive consolidation, not to IconTile.
7. **W8 — conformance sweep** against INTERFACE_SYSTEM.md §14, last.

## 5. Method notes that were paid for

- **Grep the test suite for every string you are about to change, before you
  change it.** This is what made SYS-06 safe.
- **Deletions:** scan for `readFileSync("…")` path strings, not just `import`
  statements. A test that reads a deleted file fails at collection with
  `ENOENT`, and an import-only scan will not find it.
- **Contract tests are design law here** — when one pins a value you want to
  change, the adaptation goes code-side unless the pin is itself the defect.
  `ai-workspace-contract.test.ts:25-28` pins the Agents layout defects *as
  contract*; that pin is the defect and is TEST-01's territory.
- **A codemod that touches `__tests__` can weaken a contract while appearing to
  update it.** SYS-05's rewrite turned two `not.toContain(...)` prohibitions
  into prohibitions of *different* strings — one of which had become legitimate
  system styling. Always read the test diff of a codemod separately from the
  source diff, and restate a prohibition as intent (a regex over the class of
  defect) rather than letting it track whatever token you just introduced.
- **Check a primitive against its call sites before adopting it.** IconTile was
  adopted zero times because its size/radius pairs matched nothing in the tree.
  Zero adoption of an available primitive is evidence about the primitive.
- **A mechanical migration that flattens a user-facing setting is a functional
  regression wearing a conformance costume.** SYS-05 made two of the seller's
  three storefront radius options render identically. Grep for enums and theme
  values in the blast radius, not just class strings.
- **Never push more than one slice ahead of CI.** `cancel-in-progress: true`
  means a second push discards the first push's evidence, and you learn nothing
  from either.
- **Arabic is not a translated Latin skin.** Any new type step needs a matching
  rule in `arabic-system.css`, or adopting it silently strips Arabic's reading
  floor. The ramp steps `text-caption` / `text-body-sm` / `text-body` already
  have theirs.
