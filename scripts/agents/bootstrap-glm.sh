#!/usr/bin/env bash

set -euo pipefail

REPO_URL="${SF_REPO_URL:-https://github.com/rendowblock-jpg/sahelflow_v2.git}"
REPO_DIR="${SF_REPO_DIR:-}"
SKIP_INSTALL=false
SKIP_CHECKS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --repo-dir)
      REPO_DIR="${2:?--repo-dir requires a path}"
      shift 2
      ;;
    --skip-install)
      SKIP_INSTALL=true
      shift
      ;;
    --skip-checks)
      SKIP_CHECKS=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$REPO_DIR" ]]; then
  if git rev-parse --show-toplevel >/dev/null 2>&1; then
    REPO_DIR="$(git rev-parse --show-toplevel)"
  else
    REPO_DIR="/tmp/sahelflow_v2"
  fi
fi

for command_name in git bun; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is missing: $command_name" >&2
    exit 1
  fi
done

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "Cloning SahelFlow into $REPO_DIR"
  rm -rf "$REPO_DIR"
  git clone "$REPO_URL" "$REPO_DIR"
fi

if [[ -n "$(git -C "$REPO_DIR" status --porcelain)" ]]; then
  echo "Checkout has uncommitted changes; refusing to switch or pull main: $REPO_DIR" >&2
  exit 1
fi

echo "Refreshing current main"
git -C "$REPO_DIR" fetch origin main agent-handoff --prune || git -C "$REPO_DIR" fetch origin main --prune
git -C "$REPO_DIR" checkout main
git -C "$REPO_DIR" pull --ff-only origin main

if [[ "$SKIP_INSTALL" == "false" ]]; then
  echo "Installing locked dependencies"
  (cd "$REPO_DIR" && bun install --frozen-lockfile)
  echo "Generating Prisma client"
  (cd "$REPO_DIR" && bun run db:generate)
fi

if [[ "$SKIP_CHECKS" == "false" ]]; then
  echo "Running current authority/link audit"
  (cd "$REPO_DIR" && bun run sf-audit)
  echo "Running fast repository verification"
  (cd "$REPO_DIR" && bun run sf-verify --fast)
fi

MAIN_COMMIT="$(git -C "$REPO_DIR" rev-parse HEAD)"

echo
echo "SahelFlow GLM environment is aligned."
echo "repository: $REPO_DIR"
echo "main commit: $MAIN_COMMIT"
echo
echo "Canonical startup order:"
echo "  1. AGENTS.md"
echo "  2. documentation/operations/WORKING_MEMORY.md"
echo "  3. active wave linked from Working Memory"
echo "  4. relevant product, experience and architecture authorities"
echo "  5. relevant source and evidence"
echo
echo "GLM continuity protocol: documentation/operations/GLM_CONTINUITY_PROTOCOL.md"
echo "Normal work branches: agent/<outcome>"
echo "The agent-handoff ref is continuity only and never overrides main."
