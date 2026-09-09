# Transformation handoff — resume point

Companion to `TRANSFORMATION_REGISTER.md` (the findings) and
`documentation/product/INTERFACE_SYSTEM.md` (the design authority). This file
answers one question only: **what does the next session do first?**

Branch: `claude/explore-codebase-docs-l0ksvt` · PR **#414**
Last verified: 2026-09-09

---

## 0. START HERE — the SEC-01 bump landed and broke the installed-MSI gate

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

### The hypothesis that fits all of it

A `next` 16.2.11 → 16.3.4 change in standalone-server shutdown would leave the
Node child alive after close → "1 surviving installed process" → rotation
`process-authority-conflict` (gate 1) → next launch attaches to the survivor
(gate 2) → fixture never written (gate 3). **One cause, three symptoms.**

This is a hypothesis, not a conclusion. It is **not** yet established that the
bump caused this — the lane was `skipped` on every earlier head of this branch,
so there is no green baseline on this branch to compare against.

### How to settle it — read the evidence artifact, do not re-run blind

The job uploaded everything needed: **`windows-installed-e2e-34357805838-1`**
(13 files, artifact id `10108016524`, 7-day retention). Read in this order:

| File | Answers |
| --- | --- |
| `processes.json` | **The decisive one.** What was still running, its `CommandLine` and `ParentProcessId`. If it is `node.exe` under the install root, the shutdown hypothesis is confirmed. |
| `lifecycle-error.txt` | Full rotation exception with the native stderr. |
| `startup-diagnostic.json`, `runtime-endpoint.json`, `runtime-ui-ready.json` | Why `endpointMatched` was false. |
| `runtime-cache-inventory.json` | Whether the 16.3.4 standalone tree staged correctly. |

### Precedent worth knowing

Main run **#785** landed the *previous* Next.js bump as
*"upgrade Next.js to 16.2.11 — after full CI, Windows Rust release parity, and
installed-MSI launch/close/reopen validation."* **This repo's own precedent is
that a Next.js bump is not done until installed-MSI is green.** It is currently
red. Treat that gate as the acceptance criterion for the bump, not as noise.

If the bump is confirmed as the cause, the options in order of preference are:
take `next` **16.3.3** instead of 16.3.4 (the minimum that clears the advisory —
it may not carry the offending change); fix the shutdown path in the launcher;
or hold the `next` bump alone while landing `sharp`/`js-yaml`/`hono`/
`baseline-browser-mapping`, which reduces the advisory count without touching
the framework. Do **not** disable or weaken the installed gate.

---

## 1. The one thing blocking PR #414 — as of `644ec14`, now superseded

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
node_modules/.bin/vitest run src/components src/app
```

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

1. **SEC-01** — the dependency bump above. Unblocks the PR. Do this first.
2. **SYS-05 — 8 corner radii → 3.** Tokens (`--radius-control` 6px,
   `--radius-surface` 10px, `rounded-full`) already exist and are unused by the
   legacy surfaces. Same method as SYS-06, and it is the last purely mechanical
   token migration.
3. **SYS-08 — 36 hand-rolled icon tiles → `IconTile`.** The primitive exists and
   already resolves through the authorized tints. Per-surface, not mechanical.
4. **IA-05 remainder** — `aria-describedby` hint wiring for the settings panels
   beyond `collaboration-admin-panel`.
5. **SEC-02** — either enforce the 80% floor or lower the declared number.
   Declaring a floor that `continue-on-error` cannot enforce is the actual
   defect; 77.28% is only the symptom.
6. **TEST-01** — the structural one, and the reason several defects survived
   this long. 444 vitest files; **136 assert source text** via `readFileSync` +
   **3,980 `toContain`**; **3** actually render. Convert per surface as surfaces
   are rebuilt.

---

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
- **Never push more than one slice ahead of CI.** `cancel-in-progress: true`
  means a second push discards the first push's evidence, and you learn nothing
  from either.
- **Arabic is not a translated Latin skin.** Any new type step needs a matching
  rule in `arabic-system.css`, or adopting it silently strips Arabic's reading
  floor. The ramp steps `text-caption` / `text-body-sm` / `text-body` already
  have theirs.
