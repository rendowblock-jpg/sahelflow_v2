# Runtime resources

This directory holds the platform Bun binary + Prisma `libquery_engine`
binary, downloaded by `scripts/prepare-runtime.ts` before `bun run tauri:build`.
They get bundled into the installer via `tauri.conf.json` → `bundle.resources`
→ `resources/runtime/**/*` so end users don't need Bun/Node installed.

This README is a placeholder so the `resources/runtime/**/*` glob always
matches at least one file (Tauri's build script validates resource globs at
build-script time in BOTH dev and release — an empty glob fails the build).
The real binaries are added alongside it by `prepare-runtime.ts` (production
builds only). This README is harmless in the bundled installer.
