#!/usr/bin/env bash
set -euo pipefail

repo_dir="${CONTAINER_WORKSPACE_FOLDER:-$(pwd)}"
bun_version="$(tr -d '[:space:]' < "${repo_dir}/.bun-version")"

sudo apt-get update
sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
  libwebkit2gtk-4.1-dev \
  libappindicator3-dev \
  librsvg2-dev \
  patchelf \
  libssl-dev

if ! command -v bun >/dev/null 2>&1 || [[ "$(bun --version)" != "${bun_version}" ]]; then
  npm install --global "bun@${bun_version}"
fi

bun install --cwd "${repo_dir}" --frozen-lockfile

host_triple="$(rustc -vV | awk '$1 == "host:" { print $2 }')"
if [[ -z "${host_triple}" ]]; then
  echo "Unable to determine the Rust host target" >&2
  exit 1
fi

install -d "${repo_dir}/src-tauri/binaries"
install -m 0755 /dev/null \
  "${repo_dir}/src-tauri/binaries/sahelflow-whatsapp-${host_triple}"

bash "${repo_dir}/.devcontainer/post-start.sh"
