#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# SahelFlow — Fast Tauri dev mode
# ════════════════════════════════════════════════════════════════════════════
# Pre-builds the frontend (next build) then runs the production server (next start)
# inside the Tauri webview. This gives:
#   ✅ Desktop app experience (Tauri window, not browser)
#   ✅ Instant page loads (production build, no Turbopack on-demand compilation)
#   ✅ Rust hot reload (Tauri dev mode)
#   ❌ No frontend HMR (changes require re-running this script)
#
# Use this for reviewing the app. Use `bun run tauri:dev` for active frontend
# development (slower page loads but hot reload).
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}═══════════════════════════════════════════════════"
echo -e "  SahelFlow — Fast Tauri Dev"
echo -e "═══════════════════════════════════════════════════${NC}"

# Step 1: Build the frontend (skip if already built recently)
BUILD_DIR=".next/standalone"
if [ ! -d "$BUILD_DIR" ] || [ ! -f ".next/BUILD_COMPLETE" ]; then
  echo -e "\n${YELLOW}── 1. Building frontend (one-time, ~30-60s) ──${NC}"
  bun run build
  touch .next/BUILD_COMPLETE
  echo -e "${GREEN}✅ Frontend built${NC}"
else
  echo -e "\n${GREEN}✅ Frontend already built (skip with: rm -rf .next && bun run tauri:dev:fast)${NC}"
fi

# Step 2: Start the production server in the background
echo -e "\n${YELLOW}── 2. Starting production server (port 3000) ──${NC}"
# Kill any existing server on port 3000
if command -v lsof >/dev/null 2>&1; then
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
elif command -v fuser >/dev/null 2>&1; then
  fuser -k 3000/tcp 2>/dev/null || true
fi

bun run start &
SERVER_PID=$!

# Wait for the server to be ready
echo -e "${YELLOW}   Waiting for server...${NC}"
for i in $(seq 1 30); do
  if curl -s http://localhost:3000 >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Server ready${NC}"
    break
  fi
  sleep 1
  if [ $i -eq 30 ]; then
    echo -e "${YELLOW}⚠️  Server didn't start in 30s, continuing anyway${NC}"
  fi
done

# Step 3: Run Tauri dev (skips beforeDevCommand since server is already running)
echo -e "\n${YELLOW}── 3. Opening Tauri desktop window ──${NC}"
echo -e "${GREEN}   Desktop app opening... (first Rust compile may take 2-5 min)${NC}"
echo -e "${YELLOW}   Subsequent runs are faster (Rust cached)${NC}"
echo ""

# Use --no-before-dev to skip Tauri's beforeDevCommand (we already started the server)
bunx tauri dev --no-before-dev &
TAURI_PID=$!

# Trap exit to clean up the server
trap "kill $SERVER_PID 2>/dev/null; kill $TAURI_PID 2>/dev/null; exit" INT TERM EXIT

# Wait for Tauri to exit
wait $TAURI_PID
