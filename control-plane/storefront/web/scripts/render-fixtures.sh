#!/usr/bin/env bash
# Renders the fixture storefronts (every style x language x page) to static HTML for measuring.
# Usage: bash render-fixtures.sh OUTDIR   then   python3 -m http.server PORT --directory OUTDIR
# Needs the repo's esbuild and node >= 22.5 (node:sqlite). No Cloudflare, no network.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../../.." && pwd)
out=${1:?usage: render-fixtures.sh OUTDIR}
mkdir -p "$out"
"$root/node_modules/.bin/esbuild" "$here/render-fixtures.ts" --bundle --platform=node --format=esm \
  --target=node22 --outfile="$out/.render.mjs" --log-level=warning --external:node:sqlite
node --no-warnings "$out/.render.mjs" "$out" "$root"
