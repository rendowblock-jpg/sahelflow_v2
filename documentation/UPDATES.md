# Auto-Updater — Publishing Updates

SahelFlow uses the Tauri updater plugin to deliver signed updates to desktop
users. Updates are hosted on GitHub Releases and verified against an Ed25519
public key embedded in the app.

## How it works for the user

1. User downloads + installs SahelFlow once (.msi on Windows, .dmg on macOS, .AppImage on Linux)
2. On every app launch, it silently checks for updates
3. If an update exists, a dialog appears with release notes
4. User clicks "Télécharger et installer" → update downloads, signature-verified, installed, app relaunches
5. User can also manually check from **Settings → Vérifier les mises à jour**

## How updates are published (the new CI flow)

You no longer need to build locally. Just push a git tag + GitHub Actions builds all platforms + publishes the release automatically.

### Prerequisites (already done)

- ✅ Tauri signing keypair generated
- ✅ Private key stored as GitHub secret `TAURI_SIGNING_PRIVATE_KEY`
- ✅ Empty password stored as GitHub secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- ✅ Public key embedded in `src-tauri/tauri.conf.json`
- ✅ GitHub Actions release workflow at `.github/workflows/release.yml`

### Publishing an update

1. **Bump the version** in `src-tauri/tauri.conf.json` + `package.json`:
   ```json
   // tauri.conf.json
   { "version": "3.1.0" }

   // package.json
   { "version": "3.1.0" }
   ```

2. **Commit + push**:
   ```bash
   git add -A
   git commit -m "release: v3.1.0"
   git push origin main
   ```

3. **Tag the release**:
   ```bash
   git tag v3.1.0
   git push origin v3.1.0
   ```

4. **GitHub Actions builds all platforms automatically**:
   - Windows (.msi) → `windows-latest`
   - macOS (pending — needs Apple Developer cert) (.dmg) → `macos-latest` with `x86_64-apple-darwin`
   - macOS (pending) (.dmg) → `macos-latest` with `aarch64-apple-darwin`
   - Linux (.AppImage) → `ubuntu-22.04`
   - Build time: ~20-40 minutes (parallel across platforms)
   - All builds are signed with the private key from GitHub secrets

5. **Generate + upload `latest.json`**:
   - The `generate-manifest` job runs after all builds complete
   - It collects all platform bundles + signatures
   - Generates `latest.json` with download URLs + signatures
   - Uploads it to the GitHub Release

6. **Publish the release**:
   - The release is created as a **draft** (so users don't see incomplete builds)
   - Go to https://github.com/rendowblock-jpg/sahelflow_v2/releases
   - Find the draft release, review the assets, click "Publish release"
   - Users will see the update on next app launch

### Manual trigger (without a tag)

If you want to build without creating a tag:
1. Go to https://github.com/rendowblock-jpg/sahelflow_v2/actions/workflows/release.yml
2. Click "Run workflow"
3. Enter the version number
4. Click "Run workflow"

### Monitoring the build

- **Build status**: https://github.com/rendowblock-jpg/sahelflow_v2/actions
- **Releases**: https://github.com/rendowblock-jpg/sahelflow_v2/releases
- **Updater endpoint**: https://github.com/rendowblock-jpg/sahelflow_v2/releases/latest/download/latest.json

## Downloading the app (for new users)

Send users to: https://github.com/rendowblock-jpg/sahelflow_v2/releases/latest

They download the file for their platform:
- Windows: `SahelFlow_3.x.x_x64.msi` (or `_x64-setup.exe`)
- macOS: `SahelFlow_3.x.x_aarch64.dmg` (Apple Silicon) or `_x64.dmg` (Intel)
- Linux: `SahelFlow_3.x.x_amd64.AppImage`

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

## Key management

- **Private key**: stored as GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`
  (also backed up at `~/.sahelflow/tauri-updater-private.key` on dev machines)
- **Public key**: embedded in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
- If the private key is lost, updates can't be signed — users would need to
  download a new full install. Keep the private key backed up offline.
- The private key is also at `/home/z/my-project/secrets/tauri-updater-private.key` (chmod 600)

## Troubleshooting

### Build fails on Linux
- Ensure `libwebkit2gtk-4.1-dev` is installed (handled by the workflow)

### Build fails on macOS
- Ensure both targets are installed: `rustup target add aarch64-apple-darwin x86_64-apple-darwin`
- The workflow handles this automatically

### Update not showing
- Check that `latest.json` is uploaded to the release
- Check that the release is published (not draft)
- Check that the version in `latest.json` is higher than the installed version
- Check the updater endpoint: `curl https://github.com/rendowblock-jpg/sahelflow_v2/releases/latest/download/latest.json`

### Signature verification fails
- Ensure the same private key was used to sign the build
- Ensure the public key in `tauri.conf.json` matches the private key
- Re-generate the keypair if needed (but then all existing installs can't update — they'd need a fresh install)
