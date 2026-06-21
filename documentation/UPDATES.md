# Auto-Updater — Publishing Updates

SahelFlow uses the Tauri updater plugin to deliver signed updates to desktop
users. Updates are hosted on GitHub Releases and verified against an Ed25519
public key embedded in the app.

## How it works

1. The app checks for updates on launch (silently — no UI if no update)
2. If an update is available, a dialog appears with the release notes
3. The user clicks "Télécharger et installer"
4. The update is downloaded, signature-verified, and installed
5. The app relaunches automatically

The user can also manually check from **Settings → Vérifier les mises à jour**.

## Publishing an update

### Prerequisites

- The Tauri signing private key (stored at `~/.sahelflow/tauri-updater-private.key`)
- The GitHub PAT (for creating releases)
- Rust toolchain + Tauri CLI installed locally

### Steps

1. **Bump the version** in `src-tauri/tauri.conf.json` + `package.json`:
   ```bash
   # e.g. 3.0.0 → 3.1.0
   ```

2. **Build the release** (on your machine):
   ```bash
   export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.sahelflow/tauri-updater-private.key)
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""  # empty if no password
   bun run tauri:build
   ```
   This produces:
   - `src-tauri/target/release/bundle/*/SahelFlow_*.{dmg,msi,AppImage}`
   - `src-tauri/target/release/bundle/*/SahelFlow_*.{dmg,msi,AppImage}.sig` (signature)

3. **Generate the `latest.json` manifest**:
   ```bash
   bun run scripts/generate-update-manifest.ts
   ```
   This reads the built artifacts + signatures and produces `latest.json`:
   ```json
   {
     "version": "3.1.0",
     "notes": "Release notes here",
     "pub_date": "2026-06-21T12:00:00Z",
     "platforms": {
       "darwin-aarch64": { "signature": "...", "url": "..." },
       "darwin-x86_64": { "signature": "...", "url": "..." },
       "linux-x86_64": { "signature": "...", "url": "..." },
       "windows-x86_64": { "signature": "...", "url": "..." }
     }
   }
   ```

4. **Create a GitHub Release**:
   - Tag: `v3.1.0`
   - Title: `SahelFlow 3.1.0`
   - Attachments: the `.dmg`, `.msi`, `.AppImage` files + `latest.json`
   - The updater endpoint is: `https://github.com/rendowblock-jpg/sahelflow_v2/releases/latest/download/latest.json`

5. **Verify** — users will see the update dialog on next launch.

## Key management

- **Private key**: `~/.sahelflow/tauri-updater-private.key` (chmod 600, never commit)
- **Public key**: embedded in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
- If the private key is lost, updates can't be signed — users would need to
  download a new full install. Keep the private key backed up offline.

## Configuration

The updater config is in `src-tauri/tauri.conf.json`:
```json
{
  "plugins": {
    "updater": {
      "active": true,
      "endpoints": [
        "https://github.com/rendowblock-jpg/sahelflow_v2/releases/latest/download/latest.json"
      ],
      "pubkey": "<base64-encoded Ed25519 public key>",
      "windows": { "installMode": "passive" }
    }
  }
}
```

- `installMode: "passive"` — shows a progress bar but doesn't require clicks
- `installMode: "basicUi"` — shows a minimal installer UI
- `installMode: "quiet"` — no UI at all (updates silently)

## Security

- Updates are signed with Ed25519. The signature is verified against the pubkey
  embedded in the app before installation.
- If the signature doesn't verify, the update is rejected.
- The pubkey is in the binary, so an attacker can't substitute a different key
  without rebuilding the app.
- GitHub Releases are served over HTTPS, so the transport is also secure.
