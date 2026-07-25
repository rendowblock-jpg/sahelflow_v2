# Runtime bundling

> The signed installer must run on a seller machine without a developer Node,
> Bun or Rust installation and without downloading executable dependencies on
> first launch.

## Decision: Node.js for the installed Next.js server

The installed Next.js standalone server runs on pinned **Node.js 22.23.1
Windows x64**, the production runtime officially supported by Next.js. Bun
1.3.14 remains the frozen package manager, build tool and WhatsApp sidecar
compiler, but it is not the installed Next.js process.

The checksum-pinned Bun baseline executable used to compile the sidecar is
staged only under ignored `.sf-build/tools`, passed explicitly through Bun's
`--compile-executable-path`, and retained as build provenance. It is outside
Tauri resources and never enters the installed application.

The MSI bundles Node.js and the Prisma `libquery_engine` through
`tauri.conf.json` -> `bundle.resources` -> `resources/runtime/**/*`.
`prepare-runtime.ts` downloads the official Node.js release archive, verifies
the published archive and executable SHA-256 values, retains the Node.js
license, and records provenance in `runtime-manifest.json`. It never copies a
runtime selected from the build host.

This supersedes the earlier Bun production-runtime choice. Internal.7 proved
that Bun 1.3.14 could read the protected `server.js` as data on the Founder
machine but its Windows module loader exited with `EPERM` when executing that
entrypoint from `Program Files`. The MSI-installed tree and AppData were intact.

Compiling the complete Next.js server to a Bun single-file executable remains
rejected: the generated standalone server has dynamic module/runtime behavior
and Prisma native engines that must remain explicit release resources.

## Build path

```bash
# Populate src-tauri/resources/runtime with pinned Node.js + Prisma resources.
bun run scripts/prepare-runtime.ts

# Build the Windows MSI. The Tauri beforeBuild hook prepares the runtime again
# from pinned provenance and builds the standalone frontend and sidecar.
bun run tauri:build
```

## Packaged artifacts

| Artifact | Source | Destination |
|---|---|---|
| Node.js binary | `node-v22.23.1-win-x64.zip` with official pinned SHA-256 | `resources/runtime/node.exe` |
| Node.js license | Official Node.js release archive | `resources/runtime/NODE-LICENSE.txt` |
| Prisma query engine | Generated pinned `@prisma/client` engine from `bun.lock` | `resources/runtime/query_engine-windows.dll.node` |
| Next.js standalone server | `bun run build` -> `.next/standalone` | `resources/standalone/**/*` |
| Prisma schema and migrations | `prisma/` | Tauri `prisma/**/*` resource |
| WhatsApp sidecar | `bun build --compile --target=bun-windows-x64-baseline` | Tauri external binary |

## Runtime authority

Packaged startup accepts only `<resource_dir>/runtime/node[.exe]` and the
release-verified standalone tree under the protected MSI installation. If the
runtime is missing, startup blocks with a reinstall diagnostic; there is no
PATH or user-writable executable fallback.

The server runs in a kill-on-close Windows job. Its pre-readiness exit is
observed immediately, so a runtime crash cannot consume the full readiness
deadline. GitHub's Windows gates verify the pinned runtime through the real
contained launcher, install the exact MSI, recompute the complete installed
standalone identity, and prove launch, normal close and reopen.
