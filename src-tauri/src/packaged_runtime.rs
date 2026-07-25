use serde::{Deserialize, Serialize};
use std::fs::{self, Metadata};
use std::io::{Error as IoError, ErrorKind};
use std::path::{Path, PathBuf};

const MANIFEST_FILE: &str = "sahelflow-standalone-manifest.json";
const MANIFEST_FORMAT_VERSION: u8 = 1;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StandaloneManifest {
    format_version: u8,
    app_version: String,
    tree_sha256: String,
    file_count: u64,
}

/// Resolve the standalone runtime installed by the signed MSI.
///
/// GitHub release gates bind the complete standalone tree and this manifest to
/// the signed artifact before publication. At runtime the MSI-protected copy
/// under Program Files is the authority; duplicating it into user-writable
/// AppData and hashing thousands of files on every launch adds startup delay
/// without strengthening that signed installation boundary.
pub fn resolve_installed_standalone(
    installed_root: &Path,
    expected_app_version: &str,
) -> Result<PathBuf, IoError> {
    ensure_directory(installed_root, "installed standalone runtime")?;
    load_manifest(installed_root, expected_app_version)?;
    server_path(installed_root)
}

fn load_manifest(root: &Path, expected_app_version: &str) -> Result<StandaloneManifest, IoError> {
    let path = root.join(MANIFEST_FILE);
    ensure_file(&path, "standalone manifest")?;
    let manifest: StandaloneManifest =
        serde_json::from_slice(&fs::read(&path)?).map_err(|error| {
            IoError::new(
                ErrorKind::InvalidData,
                format!("could not decode installed standalone manifest: {error}"),
            )
        })?;
    if manifest.format_version != MANIFEST_FORMAT_VERSION {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "unsupported standalone manifest format",
        ));
    }
    if manifest.app_version != expected_app_version {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "standalone manifest version {} does not match installed app {}",
                manifest.app_version, expected_app_version
            ),
        ));
    }
    if manifest.file_count == 0 || !is_sha256(&manifest.tree_sha256) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "standalone manifest tree identity is invalid",
        ));
    }
    Ok(manifest)
}

fn server_path(root: &Path) -> Result<PathBuf, IoError> {
    let path = root.join("server.js");
    ensure_file(&path, "installed standalone server")?;
    Ok(path)
}

fn ensure_directory(path: &Path, label: &str) -> Result<(), IoError> {
    let metadata = fs::symlink_metadata(path)?;
    reject_link(&metadata, path)?;
    if !metadata.is_dir() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("{label} is not a directory: {}", path.display()),
        ));
    }
    Ok(())
}

fn ensure_file(path: &Path, label: &str) -> Result<(), IoError> {
    let metadata = fs::symlink_metadata(path)?;
    reject_link(&metadata, path)?;
    if !metadata.is_file() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("{label} is not a regular file: {}", path.display()),
        ));
    }
    Ok(())
}

fn reject_link(metadata: &Metadata, path: &Path) -> Result<(), IoError> {
    if is_reparse_or_symlink(metadata) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "standalone runtime contains a link or reparse point: {}",
                path.display()
            ),
        ));
    }
    Ok(())
}

fn is_reparse_or_symlink(metadata: &Metadata) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    {
        metadata.file_type().is_symlink()
    }
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    const VERSION: &str = "1.0.0-internal.7";

    fn root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "sahelflow-installed-runtime-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ))
    }

    fn fixture(name: &str) -> PathBuf {
        let root = root(name);
        fs::create_dir_all(root.join(".next/server")).expect("runtime root");
        fs::write(root.join("server.js"), b"console.log('server')\n").expect("server");
        fs::write(root.join(".next/server/app.js"), b"module.exports = 1\n")
            .expect("nested runtime file");
        let manifest = StandaloneManifest {
            format_version: MANIFEST_FORMAT_VERSION,
            app_version: VERSION.to_string(),
            tree_sha256: "a".repeat(64),
            file_count: 2,
        };
        let mut bytes = serde_json::to_vec_pretty(&manifest).expect("manifest");
        bytes.push(b'\n');
        fs::write(root.join(MANIFEST_FILE), bytes).expect("write manifest");
        root
    }

    #[test]
    fn resolves_the_msi_installed_runtime_in_place() {
        let root = fixture("resolve");
        let server = resolve_installed_standalone(&root, VERSION).expect("resolve");
        assert_eq!(server, root.join("server.js"));
        assert!(!root.join("runtime-cache").exists());
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn rejects_a_version_mismatch() {
        let root = fixture("version");
        let error = resolve_installed_standalone(&root, "1.0.0-internal.8")
            .expect_err("version mismatch must fail");
        assert!(error.to_string().contains("does not match installed app"));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn rejects_an_invalid_manifest_identity() {
        let root = fixture("identity");
        let path = root.join(MANIFEST_FILE);
        let mut manifest: StandaloneManifest =
            serde_json::from_slice(&fs::read(&path).expect("read manifest")).expect("manifest");
        manifest.tree_sha256 = "not-a-digest".to_string();
        fs::write(
            &path,
            serde_json::to_vec(&manifest).expect("encode manifest"),
        )
        .expect("replace manifest");
        let error =
            resolve_installed_standalone(&root, VERSION).expect_err("invalid identity must fail");
        assert!(error.to_string().contains("tree identity is invalid"));
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn rejects_a_missing_server_entrypoint() {
        let root = fixture("server");
        fs::remove_file(root.join("server.js")).expect("remove server");
        let error =
            resolve_installed_standalone(&root, VERSION).expect_err("missing server must fail");
        assert_eq!(error.kind(), ErrorKind::NotFound);
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_a_linked_server_entrypoint() {
        use std::os::unix::fs::symlink;

        let root = fixture("linked-server");
        fs::remove_file(root.join("server.js")).expect("remove server");
        symlink(root.join(".next/server/app.js"), root.join("server.js")).expect("create link");
        let error =
            resolve_installed_standalone(&root, VERSION).expect_err("linked server must fail");
        assert!(error.to_string().contains("link or reparse point"));
        fs::remove_dir_all(root).expect("cleanup");
    }
}
