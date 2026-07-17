#!/usr/bin/env bash

# Backward-compatible entrypoint for the former orphan-branch bootstrap.
# Shared bootstrap behavior now lives on main so GLM, Codex and maintainers use
# the same repository, authority and tooling truth.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/scripts/agents/bootstrap-glm.sh" "$@"
