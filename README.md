# SahelFlow

SahelFlow is a **Windows-first, local-first operations system for Algerian cash-on-delivery sellers**. One protected authority model covers orders, customers, products, delivery and returns, COD settlement, a WhatsApp inbox, automations, AI assistance, analytics, multi-shop, a hosted storefront, licensing and recovery. The desktop app is the authority for orders, stock and money; Cloudflare Workers carry only licensing, encrypted backup and relay, and the public storefront.

## Status

Pre-release. Signed builds are published on the internal channel and are not Beta or Stable. For the current build, read [GitHub Releases](https://github.com/rendowblock-jpg/sahelflow_v2/releases) and `sahelflow.version.json`; this file does not repeat version numbers. What has and has not been proven on an installed build, and what is deliberately not claimed, is in [`documentation/system/CURRENT_STATE.md`](documentation/system/CURRENT_STATE.md).

## Repository map

| Path | What it holds |
|---|---|
| `src/` | the Next.js app: routes, API handlers, components, domain logic |
| `src-tauri/` | the Rust desktop shell, native bridge, installer and updater |
| `sidecars/` | the WhatsApp and MCP sidecars |
| `control-plane/` | Cloudflare Workers: licensing, backup, connected relay, storefront |
| `prisma/` | the per-shop database schema and migrations |
| `marketing/` | the public marketing and download site |
| `e2e/`, `tests/` | browser and integration tests; unit tests sit beside their source |
| `scripts/` | build, verification and release tooling |
| `documentation/` | product, architecture, workflow and decision records |

## Build and check

Bun 1.3.14 (see `packageManager` in `package.json`).

```
bun install --frozen-lockfile
bun run typecheck      # tsc --noEmit
bun run lint
bun run test           # vitest; export the three variables printed by the next command first
bun run test:sandbox -- <dir>   # prints SF_TEST_ROOT, SF_DATA_DIR and DATABASE_URL for a disposable sandbox
bun run sf-audit       # documentation gate and release frontier
```

Rust, MSI and installed-app checks run only in GitHub Actions (`.github/workflows/`). A change reaches `main` through a pull request whose required gates pass on its exact head.

## Documentation

Start at [`AGENTS.md`](AGENTS.md) for the rules, then [`documentation/README.md`](documentation/README.md) for the map. Per-release history is in [`CHANGELOG.md`](CHANGELOG.md).
