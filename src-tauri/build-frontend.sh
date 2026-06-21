#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# SahelFlow — Tauri production frontend build
# ════════════════════════════════════════════════════════════════════════════
# Run by Tauri's `beforeBuildCommand`. Produces:
#   1. Next.js standalone server (.next/standalone/) + arranges static assets
#   2. Resources bundle (src-tauri/resources/standalone/) for Tauri to package
#   3. Compiled WhatsApp sidecar binary (src-tauri/binaries/sahelflow-whatsapp-<triple>)
#
# Architecture (ADR-010): the app uses Next.js API routes + server components,
# so static export is not viable. Instead we bundle the standalone server and
# spawn it at runtime; the Tauri webview loads http://localhost:3000.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

echo "── 1. Next.js standalone build ──"
bun run build

echo "── 2. Arrange static + public into standalone ──"
# Next.js standalone doesn't include .next/static or public/ by default
cp -r .next/static .next/standalone/.next/static
if [ -d public ]; then
  cp -r public .next/standalone/public
fi

echo "── 3. Copy standalone → src-tauri/resources/standalone ──"
RES_DIR="src-tauri/resources/standalone"
rm -rf "$RES_DIR"
mkdir -p "$RES_DIR"
cp -r .next/standalone/. "$RES_DIR/"

echo "── 4. Compile WhatsApp sidecar (Bun → standalone binary) ──"
# Tauri externalBin expects <name>-<target-triple> with no extension on Unix,
# <name>-<target-triple>.exe on Windows.
TRIPLE="$(rustc -vV 2>/dev/null | sed -n 's/^host: //p' || echo "")"
if [ -z "$TRIPLE" ]; then
  echo "⚠️  Could not detect rustc target triple. Falling back to plain name."
  OUT="src-tauri/binaries/sahelflow-whatsapp"
else
  OUT="src-tauri/binaries/sahelflow-whatsapp-${TRIPLE}"
fi
mkdir -p src-tauri/binaries
# Compile the sidecar to a single self-contained executable.
# Baileys lazy-requires several optional deps (jimp, link-preview-js, sharp,
# qrcode-terminal, etc.) with try/catch fallbacks — marking them external keeps
# the binary small and lets Baileys degrade gracefully (no image processing /
# link previews, which SahelFlow doesn't use).
bun build --compile \
  --external jimp --external link-preview-js --external sharp \
  --external qrcode-terminal --external pino-pretty --external music-metadata \
  --external fluent-ffmpeg --external libphonenumber-js \
  sidecars/whatsapp/index.ts --outfile "$OUT"
chmod +x "$OUT" 2>/dev/null || true
echo "   sidecar → $OUT"

echo "── 5. Install sidecar runtime deps (for `bun run sidecar` dev mode) ──"
# (no-op in production build; sidecar deps are baked into the compiled binary)

echo "✅ Frontend build complete."
