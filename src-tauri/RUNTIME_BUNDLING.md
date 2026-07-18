# Runtime Bundling (T-S5 decision)

> **Ship-blocker T-S5:** the `.msi`/`.dmg` installer previously required Bun
> (or Node) to be installed on the end user's machine. Algerian COD sellers
> are non-developers — they will NOT have Bun/Node installed. Result: blank
> window on first launch. Even with Bun installed, the first `bunx prisma`
> invocation downloads ~50 MB of Prisma engine binaries from npm, which is
> slow and fails when offline.

## Decision: bundle Bun + Prisma engines as Tauri resources (option a)

We bundle a platform-matched **Bun** binary + **Prisma `libquery_engine`**
binary inside the installer via `tauri.conf.json` → `bundle.resources` →
`resources/runtime/**/*`. At runtime, `lib.rs` (`bundled_bun()` helper)
prefers `<resource_dir>/runtime/bun[.exe]` before falling back to PATH
`bun` then PATH `node`. This matches the existing sidecar pattern
(`externalBin: sahelflow-whatsapp`) and is the lowest-risk option.

Option (b) — `bun build --compile` the Next.js server into a single
binary — was rejected because the Next.js standalone server is not a
clean compile target (dynamic requires + ESM/CJS interop) and Prisma
engines would still need bundling regardless.

## How the founder produces a distributable installer

```bash
# 1. (once) populate src-tauri/resources/runtime/ with the platform Bun + Prisma engine
bun run scripts/prepare-runtime.ts

# 2. build the installer (.msi on Windows, .dmg on macOS, .AppImage on Linux)
bun run tauri:build
```

`prepare-runtime.ts` is idempotent (skips present files) and platform-aware.
For a cross-platform release, run it once per target OS (e.g. in CI matrix
jobs — see the Wave 7 macOS CI task T-H4/T-M9).

## What gets bundled

| Artifact | Source | Destination |
|---|---|---|
| Bun binary | `github.com/oven-sh/bun/releases` | `resources/runtime/bun[.exe]` |
| Prisma `libquery_engine` | `binaries.prisma.sh` | `resources/runtime/<engine>` |
| Next.js standalone server | `bun run build` → `.next/standalone` | `resources/standalone/**/*` |
| Prisma schema + migrations | `prisma/` | (already bundled) `../prisma/**/*` |
| Migration coordinator | `src/migration_coordinator.rs` | compiled into the Tauri host |

## Runtime resolution order in `lib.rs`

1. `<resource_dir>/runtime/bun[.exe]` (bundled — production)
2. PATH `bun` (developer machine)
3. PATH `node` (last-resort fallback)

If none are found, `lib.rs` logs a clear error instructing the founder to
run `prepare-runtime.ts` before `tauri:build` — instead of silently
showing a blank window.
