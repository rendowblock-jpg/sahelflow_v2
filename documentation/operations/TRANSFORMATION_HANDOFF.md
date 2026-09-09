# Transformation handoff — resume point

Companion to `TRANSFORMATION_REGISTER.md` (the findings) and
`documentation/product/INTERFACE_SYSTEM.md` (the design authority). This file
answers one question only: **what does the next session do first?**

Branch: `claude/explore-codebase-docs-l0ksvt` · PR **#414**
Last verified: 2026-09-09 at `1a6a00b`

---

## 0. START HERE — the PR is GREEN; W3 (Agents) is the next real work

**Everything in the old sections 0 and 1 is resolved.** They described the
SEC-01 dependency bump and the installed-MSI failure it exposed. Both are closed,
and the history is kept below only so the reasoning is auditable.

### The installed-MSI failure was a runner transient, and that is now proven

The `lifecycle=failure, authenticatedUi=failure, replacementRestore=failure`
chain on `3ed8754` did **not** reproduce. Two full batteries since have run every
installed gate green:

| Head | lifecycle | authenticatedUi | replacementRestore |
| --- | --- | --- | --- |
| `3ed8754` | failure | failure | failure |
| `e7c1e1c` | **success** | **success** | **success** |
| `0e70496` | **success** | **success** | **success** |

The Founder's reading was right: the native authority **fail-closed correctly**,
refusing to rotate an installation root while an unauthorized installed process
(`sahelflow.exe` PID 7560, created ~2.5 min into that same job) was still alive.
That is a reaping property of the run, not of the build. The `next` 16.3.4 bump
is exonerated, not merely demoted — the shutdown hypothesis was falsified by its
own stated test and must not be revived without new evidence.

**`bun audit --production` passes. There is no blocker on this PR.**

### What landed after that

`0e70496` — validated by a complete green battery (Quality Gate, Phase 5,
Phase 6-7, AR/FR/EN accessibility, Windows standalone/launcher, installed-MSI):

- **SYS-05** — 582 substitutions across 137 files; eight radii collapse to
  `rounded-control` / `rounded-surface` / `rounded-full`.
- **DEAD-02** — the "dead" shim was live (2 production importers + a contract
  test pinning its path); the real implementation took the canonical name.
- **SEC-02** — coverage is now an enforced regression ratchet.
- **IA-05** — six re-authentication fields wired, 0 → 6 `aria-describedby`.

`1a6a00b` — **SYS-08**, IconTile scale corrected to its call sites, 16 tiles
converted across 13 files.

### Three decisions the next session must not silently undo

1. **The storefront radius carve-out is deliberate.** `StorefrontRadius`
   (`soft | rounded | sharp`) is a published shop's identity, chosen by the
   seller. Collapsing it onto `control`/`surface` made two of the three options
   render identically and deleted a shipped control. It resolves through
   `--radius-storefront-soft` / `--radius-storefront-round`, and
   INTERFACE_SYSTEM.md §3 was amended in the same change. Do not "finish the
   migration" by folding it back in.
2. **Two prohibition contracts were restated as intent, not tokens.** A codemod
   had rewritten `not.toContain("lg:rounded-xl")` into
   `not.toContain("lg:rounded-surface")` — quietly changing what the contract
   forbids, and in the AI case forbidding what is now legitimate `Panel`
   styling. They are now `/lg:rounded-/` and `/rounded-[\w-]+ border bg-card/`.
   **Watch for this class of bug on every future codemod: a mechanical rewrite
   that touches `__tests__` can weaken a contract while appearing to update it.**
3. **IconTile's scale was corrected because the primitive was wrong, not the
   surfaces.** It shipped with proportions no call site had and was adopted
   zero times. Adopting it as-shipped would have meant 19 unrequested visual
   regressions. Check a primitive against its call sites before adopting it.

### Do this next

**W3 — rebuild Agents from the information architecture up.** IA-01, IA-03,
IA-04, UI-01..UI-05, STR-01 (canvas). This is the headline Founder-facing item
and the one the register has been building toward.

Two things make it harder than it looks, and both are recorded rather than
discovered again:

- **The Founder has rejected this surface twice** (F-06, then F-12 with "top
  tier class AAA redesign"). The scope correction on F-06 was explicit:
  *functional, NOT colors/motion/CSS*. A third repaint is the wrong answer.
- **TEST-01 is the gate.** `ai-workspace-contract.test.ts:25` pins the 1500px
  media query and `:26`/`:28` pin the exact grid strings, so the Agents layout
  is contract-locked — the test named *"uses two panes at common desktop width
  and progressive review evidence"* would pass if the component rendered
  nothing. Those pins must convert to behavioural evidence **in the same
  change** that rebuilds the surface, restating intent rather than deleting the
  contract. Note that `e2e/ai-workspace.spec.ts:127` already verifies the
  3-column layout behaviourally, and the register records that the layout and
  its 1500px breakpoint are **deliberate**, not drift.

---

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

Closed since this list was written: **SEC-01**, **SYS-05**, **SYS-06**,
**SYS-08**, **SEC-02**, **DEAD-01**, **DEAD-02**, **IA-05**, **FN-01**,
**UI-01/UI-02**, **L10N-02**.

1. **W3 — Agents rebuilt.** IA-01, IA-03, IA-04, UI-01..UI-05, STR-01 (canvas).
   See §0 for the two constraints that govern it: the Founder's twice-rejected
   scope correction (*functional, NOT colors/motion/CSS*) and TEST-01's
   contract lock on the layout. Convert the pinning assertions to behaviour in
   the same change.
2. **W4 — Settings rebuilt.** IA-05's remaining surface area on the
   `Row`/`Section`/`Field` grammar. The re-auth fields are wired; what is left
   is the panel geometry, and note IA-05b: the "11 card islands" reading was
   already corrected as wrong, so do not rebuild against it.
3. **W5 — Navigation and page shell.** IA-01 across all 30 routes, IA-02
   restored hierarchy, UI-06 per-page skeletons (24 of 30 loading states are
   one of two identical generic skeletons).
4. **W6 — Copy authority.** L10N-01: 3 JSON locale files at parity plus 39
   inline TypeScript translation modules. Any new user-facing string needs all
   three locales or the parity contract fails.
5. **W7 — Structure.** STR-01 decomposition (`inbox-v3-thread` 2,235 lines,
   `storefront-studio` 1,752, `ai-decision-canvas` 1,727), STR-02 (208
   `as unknown as`, 321 non-null assertions) and STR-03 (28 markers) triaged,
   not blanket-removed.
6. **TEST-01 — the structural one**, converted per surface as surfaces are
   rebuilt rather than as its own pass. 444 vitest files; **136 assert source
   text** via `readFileSync` carrying **3,980 `toContain`**; **3** render a
   component.
7. **W8 — Conformance sweep** against INTERFACE_SYSTEM.md §14.

**SYS-04** (2,099 arbitrary values) stays continuous across the remaining waves,
retired in the surface that owns each one. The three `rounded-full` empty-state
marks left by SYS-08 (`ai-review-evidence`, `ai-work-history`, `feature-gate`)
belong to **UI-07**'s state-primitive consolidation, not to SYS-08.

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
