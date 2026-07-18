#!/usr/bin/env bash
set -euo pipefail

: "${SF_TEST_ROOT:?SF_TEST_ROOT is required}"
repo_dir="${CONTAINER_WORKSPACE_FOLDER:-$(pwd)}"
bun run --cwd "${repo_dir}" test:sandbox -- "${SF_TEST_ROOT}"
