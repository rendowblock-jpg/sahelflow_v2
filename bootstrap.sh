#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# SahelFlow Agent — Bootstrap Script (v3.0)
# ════════════════════════════════════════════════════════════════════════════
# Rebuilds the entire agent environment from scratch for the v3.0 greenfield workflow.
# This script lives in the `agent-handoff` orphan branch of sahelflow_v2.
#
# What it does (v3.0):
#   1. Checks for GitHub PAT (REQUIRED — for push/PR)
#   2. Checks for Supabase creds (OPTIONAL — v2-legacy reference only)
#   3. Clones/fetches sahelflow_v2 to /tmp/sahelflow_v2
#   4. Configures git identity + credential helper
#   5. Installs v3 dependencies (bun install) + generates Prisma client
#   6. Installs the agent toolkit:
#      - sf-verify (quality gate: tsc + eslint + vitest + prisma)
#      - sf-db     (local Prisma/SQLite CLI)
#      - sf-license (founder's offline license signer)
#      - sf-port   (v2→v3 data porter)
#      - sb-db     (LEGACY — v2 Supabase CLI, only if Supabase creds present)
#   7. Verifies GitHub auth
#   8. Verifies local SQLite DB connection (sf-db test)
#   9. Fetches the latest AGENT_HANDOFF.md
#  10. Prints a status report
#
# Exit codes:
#   0 = fully operational (or operational with degraded v2-legacy access)
#   1 = critical credentials missing (GitHub PAT)
#   2 = partial failure
# ════════════════════════════════════════════════════════════════════════════

set -uo pipefail

REPO_URL="https://github.com/rendowblock-jpg/sahelflow_v2.git"
REPO_DIR="/tmp/sahelflow_v2"
AGENT_TOOLS_DIR="/home/z/my-project/agent-tools"
SECRETS_DIR="$AGENT_TOOLS_DIR/.secrets"
HANDOFF_LOCAL="/home/z/my-project/agent-handoff.md"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Color codes (minimal — avoid escape issues)
GREEN='\033[0;32m'; YELLOW='\033[0;33m'; RED='\033[0;31m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✅ $1${NC}"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; }
err()  { echo -e "  ${RED}❌ $1${NC}"; }
hdr()  { echo -e "\n${BOLD}── $1 ──${NC}"; }

echo -e "${BOLD}═══════════════════════════════════════════════════"
echo -e "  SahelFlow Agent — Bootstrap (v3.0)"
echo -e "═══════════════════════════════════════════════════${NC}"

FAILURES=0

# ── 1. GitHub credentials (REQUIRED) ────────────────────────────────────────
hdr "GitHub Credentials (required)"

GIT_CREDS=""
if [[ -n "${GITHUB_PAT:-}" ]]; then
  umask 077
  mkdir -p "$SECRETS_DIR"
  printf 'https://rendowblock-jpg:%s@github.com\n' "$GITHUB_PAT" > "$SECRETS_DIR/git-credentials"
  chmod 600 "$SECRETS_DIR/git-credentials"
  printf 'https://rendowblock-jpg:%s@github.com\n' "$GITHUB_PAT" > "$HOME/.git-credentials"
  chmod 600 "$HOME/.git-credentials"
  GIT_CREDS="$SECRETS_DIR/git-credentials"
  ok "GitHub PAT loaded from GITHUB_PAT env var"
elif [[ -f "$SECRETS_DIR/git-credentials" ]] && [[ -s "$SECRETS_DIR/git-credentials" ]]; then
  GIT_CREDS="$SECRETS_DIR/git-credentials"
  ok "GitHub credentials found (persistent: $GIT_CREDS)"
elif [[ -f "$HOME/.git-credentials" ]] && [[ -s "$HOME/.git-credentials" ]]; then
  GIT_CREDS="$HOME/.git-credentials"
  mkdir -p "$SECRETS_DIR"
  cp "$GIT_CREDS" "$SECRETS_DIR/git-credentials"
  chmod 600 "$SECRETS_DIR/git-credentials"
  ok "GitHub credentials found (home: → promoted to persistent)"
else
  err "GitHub credentials MISSING (required for push/PR)"
  echo "    Provide via: GITHUB_PAT=github_pat_xxx bash bootstrap.sh"
  FAILURES=$((FAILURES+1))
fi

# ── 2. Supabase credentials (OPTIONAL — v2-legacy reference only) ───────────
hdr "Supabase Credentials (optional — v2-legacy reference)"

SUPA_CREDS=""
HAS_SUPABASE=false
if [[ -n "${SUPABASE_CONN:-}" ]]; then
  umask 077
  mkdir -p "$SECRETS_DIR"
  # Note: the regex below has a known bug with passwords containing '@'.
  # If the password has '@', the agent should write the JSON file directly
  # (see AGENT_HANDOFF.md "Known issues" section).
  python3 -c "
import json, re, sys
conn = sys.argv[1]
m = re.match(r'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)', conn)
if not m:
    print('ERROR: could not parse connection string', file=sys.stderr)
    sys.exit(1)
user, password, host, port, database = m.groups()
print(json.dumps({'host': host, 'port': int(port), 'user': user, 'password': password, 'database': database, 'ssl': True}))
" "$SUPABASE_CONN" > "$SECRETS_DIR/supabase-credentials"
  chmod 600 "$SECRETS_DIR/supabase-credentials"
  cp "$SECRETS_DIR/supabase-credentials" "$HOME/.supabase-credentials"
  chmod 600 "$HOME/.supabase-credentials"
  SUPA_CREDS="$SECRETS_DIR/supabase-credentials"
  HAS_SUPABASE=true
  ok "Supabase credentials loaded from SUPABASE_CONN env var"
elif [[ -f "$SECRETS_DIR/supabase-credentials" ]] && [[ -s "$SECRETS_DIR/supabase-credentials" ]]; then
  SUPA_CREDS="$SECRETS_DIR/supabase-credentials"
  HAS_SUPABASE=true
  ok "Supabase credentials found (v2-legacy reference access enabled)"
elif [[ -f "$HOME/.supabase-credentials" ]] && [[ -s "$HOME/.supabase-credentials" ]]; then
  SUPA_CREDS="$HOME/.supabase-credentials"
  mkdir -p "$SECRETS_DIR"
  cp "$SUPA_CREDS" "$SECRETS_DIR/supabase-credentials"
  chmod 600 "$SECRETS_DIR/supabase-credentials"
  HAS_SUPABASE=true
  ok "Supabase credentials found (home: → promoted to persistent)"
else
  warn "No Supabase credentials — v2-legacy live DB access disabled"
  echo "    (Optional. Only needed to query the old v2 demo DB for reference.)"
  echo "    Provide via: SUPABASE_CONN='postgresql://...' bash bootstrap.sh"
fi

if [[ $FAILURES -gt 0 ]]; then
  echo ""
  echo -e "${RED}${BOLD}GitHub PAT is required. Cannot proceed.${NC}"
  exit 1
fi

# ── 3. Repository clone ────────────────────────────────────────────────────
hdr "Repository"
if [[ -d "$REPO_DIR/.git" ]]; then
  ok "Clone present at $REPO_DIR"
  git -C "$REPO_DIR" fetch origin --quiet 2>/dev/null
else
  warn "Clone missing — cloning..."
  rm -rf "$REPO_DIR"
  if git clone "$REPO_URL" "$REPO_DIR" >/dev/null 2>&1; then
    ok "Cloned to $REPO_DIR"
  else
    err "Failed to clone repo"
    exit 2
  fi
fi

# Ensure v2-legacy and agent-handoff branches are available locally
git -C "$REPO_DIR" fetch origin v2-legacy --quiet 2>/dev/null && ok "v2-legacy branch fetched" || warn "v2-legacy branch not found on remote"
git -C "$REPO_DIR" fetch origin agent-handoff --quiet 2>/dev/null && ok "agent-handoff branch fetched" || warn "agent-handoff branch not found on remote"

# Configure git identity + credentials
git -C "$REPO_DIR" config user.name "Z.ai Coding Agent" 2>/dev/null
git -C "$REPO_DIR" config user.email "agent@z.ai" 2>/dev/null
git -C "$REPO_DIR" config credential.helper "store --file=$GIT_CREDS" 2>/dev/null
git config --global credential.helper "store --file=$GIT_CREDS" 2>/dev/null
git config --global user.name "Z.ai Coding Agent" 2>/dev/null
git config --global user.email "agent@z.ai" 2>/dev/null
ok "Git identity + credential helper configured"
echo "    branch: $(git -C "$REPO_DIR" branch --show-current 2>/dev/null)"
echo "    head:   $(git -C "$REPO_DIR" log --oneline -1 2>/dev/null)"

# ── 4. v3 dependencies (bun install + prisma generate) ─────────────────────
hdr "v3 Dependencies (Next.js + Prisma + Tauri)"
if [[ -f "$REPO_DIR/package.json" ]]; then
  if [[ ! -d "$REPO_DIR/node_modules" ]]; then
    warn "Installing v3 dependencies (bun install)..."
    (cd "$REPO_DIR" && bun install >/dev/null 2>&1) && ok "Dependencies installed" || { err "bun install failed"; FAILURES=$((FAILURES+1)); }
  else
    ok "node_modules present"
  fi

  if [[ -f "$REPO_DIR/prisma/schema.prisma" ]]; then
    warn "Generating Prisma client..."
    (cd "$REPO_DIR" && bunx prisma generate >/dev/null 2>&1) && ok "Prisma client generated" || { err "prisma generate failed"; FAILURES=$((FAILURES+1)); }
  else
    warn "No prisma/schema.prisma found (expected on main branch)"
  fi
else
  err "No package.json found in $REPO_DIR (not on main branch?)"
  FAILURES=$((FAILURES+1))
fi

# ── 5. Install agent toolkit ────────────────────────────────────────────────
hdr "Agent Toolkit"

install_tool() {
  local name="$1"
  local src_dir="$SCRIPT_DIR/$name"
  local dest_dir="$AGENT_TOOLS_DIR/$name"
  local bin_path="/usr/local/bin/$name"

  if [[ ! -d "$src_dir" ]]; then
    err "$name source not found at $src_dir"
    FAILURES=$((FAILURES+1))
    return 1
  fi

  mkdir -p "$dest_dir"
  cp -r "$src_dir"/* "$dest_dir/" 2>/dev/null

  if [[ -f "$dest_dir/package.json" ]]; then
    (cd "$dest_dir" && bun install >/dev/null 2>&1) || warn "$name: bun install had issues (may still work)"
  fi

  cat > "$bin_path" << SYMEOF
#!/bin/sh
exec bun run $dest_dir/index.ts "\$@"
SYMEOF
  chmod +x "$bin_path"
  ok "$name installed on PATH"
}

# Install v3 tools (always)
install_tool "sf-verify"
install_tool "sf-db"
install_tool "sf-license"
install_tool "sf-port"
# Session 20 tools — browser verification, one-command seed, drift detection
install_tool "sf-browser"
install_tool "sf-seed"
install_tool "sf-audit"

# Install sb-db (legacy) only if Supabase creds present
if [[ "$HAS_SUPABASE" == "true" ]]; then
  install_tool "sb-db"
  ok "sb-db (legacy) installed — v2-legacy DB reference access enabled"
else
  warn "sb-db (legacy) NOT installed — no Supabase creds (v2-legacy DB queries unavailable)"
fi

# ── 6. GitHub auth verification ────────────────────────────────────────────
hdr "GitHub Auth"
if TOKEN=$(sed -n 's/.*:\(github_pat_[^@]*\)@.*/\1/p' "$GIT_CREDS" 2>/dev/null) && [[ -n "$TOKEN" ]]; then
  LOGIN=$(curl -s -m 10 -H "Authorization: Bearer $TOKEN" https://api.github.com/user \
          | python3 -c "import json,sys; print(json.load(sys.stdin).get('login',''))" 2>/dev/null || echo "")
  if [[ "$LOGIN" == "rendowblock-jpg" ]]; then
    ok "Authenticated as $LOGIN"
  else
    err "GitHub auth failed (login='$LOGIN'). PAT may be expired/revoked."
    FAILURES=$((FAILURES+1))
  fi
else
  err "Could not extract PAT from credentials file"
  FAILURES=$((FAILURES+1))
fi

# ── 7. Local SQLite DB verification ─────────────────────────────────────────
hdr "Local SQLite DB (v3.0 dev database)"
if command -v sf-db >/dev/null 2>&1; then
  # Ensure the dev DB exists (prisma db push creates it if missing)
  if [[ -f "$REPO_DIR/prisma/schema.prisma" ]]; then
    (cd "$REPO_DIR" && bunx prisma db push --skip-generate >/dev/null 2>&1) && ok "Schema pushed to dev SQLite" || warn "prisma db push had issues"
  fi
  if sf-db test >/dev/null 2>&1; then
    ok "Local SQLite connection verified (sf-db test)"
  else
    warn "sf-db test failed (dev DB may not exist yet — run 'bunx prisma db push' in $REPO_DIR)"
  fi
else
  err "sf-db command not available"
  FAILURES=$((FAILURES+1))
fi

# ── 8. v2-legacy DB verification (optional) ─────────────────────────────────
if [[ "$HAS_SUPABASE" == "true" ]] && command -v sb-db >/dev/null 2>&1; then
  hdr "v2-legacy Supabase DB (optional reference)"
  if sb-db test >/dev/null 2>&1; then
    ok "v2-legacy DB connection verified (read-only reference access)"
  else
    warn "sb-db test failed (v2-legacy DB queries will be unavailable)"
  fi
fi

# ── 9. Fetch the latest handoff doc ────────────────────────────────────────
hdr "Handoff Document"
if [[ -f "$SCRIPT_DIR/AGENT_HANDOFF.md" ]]; then
  cp "$SCRIPT_DIR/AGENT_HANDOFF.md" "$HANDOFF_LOCAL"
  ok "Handoff doc loaded from local branch"
else
  warn "Fetching handoff doc from GitHub agent-handoff branch..."
  TOKEN=$(sed -n 's/.*:\(github_pat_[^@]*\)@.*/\1/p' "$GIT_CREDS" 2>/dev/null)
  curl -sL -H "Authorization: token $TOKEN" \
    "https://raw.githubusercontent.com/rendowblock-jpg/sahelflow_v2/agent-handoff/AGENT_HANDOFF.md" \
    -o "$HANDOFF_LOCAL"
  if [[ -s "$HANDOFF_LOCAL" ]]; then
    ok "Handoff doc fetched from GitHub"
  else
    err "Failed to fetch handoff doc"
    FAILURES=$((FAILURES+1))
  fi
fi

# ── Summary ────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}═══════════════════════════════════════════════════"
if [[ $FAILURES -eq 0 ]]; then
  echo -e "  ${GREEN}${BOLD}✅ Bootstrap complete — agent fully operational${NC}"
  echo -e "  ${GREEN}Toolkit: sf-verify, sf-db, sf-license, sf-port, sf-browser, sf-seed, sf-audit${NC}"
  if [[ "$HAS_SUPABASE" == "true" ]]; then
    echo -e "  ${GREEN}Legacy:  sb-db (v2-legacy DB reference)${NC}"
  fi
  echo -e "  ${GREEN}Next: read $HANDOFF_LOCAL for context.${NC}"
  exit 0
else
  echo -e "  ${YELLOW}${BOLD}⚠️  Bootstrap completed with $FAILURES failure(s)${NC}"
  echo -e "  ${YELLOW}See errors above. Agent can work in degraded mode.${NC}"
  exit 2
fi
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
