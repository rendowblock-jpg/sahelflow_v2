use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, Metadata, OpenOptions};
use std::io::{Error as IoError, ErrorKind, Read};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const MANIFEST_FILE: &str = "sahelflow-standalone-manifest.json";
const MANIFEST_FORMAT_VERSION: u8 = 1;
const TREE_HASH_DOMAIN: &[u8] = b"sahelflow-standalone-tree-v1\n";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct StandaloneManifest {
    format_version: u8,
    app_version: String,
    tree_sha256: String,
    file_count: u64,
}

pub fn stage_standalone(
    source_root: &Path,
    local_data_root: &Path,
    expected_app_version: &str,
) -> Result<PathBuf, IoError> {
    ensure_directory(source_root, "packaged standalone source")?;
    let (manifest, manifest_bytes) = load_manifest(source_root, expected_app_version)?;

    let cache_root = local_data_root.join("runtime-cache");
    fs::create_dir_all(&cache_root)?;
    ensure_directory(&cache_root, "local runtime cache root")?;
    let final_root = cache_root.join(cache_name(expected_app_version, &manifest.tree_sha256)?);

    if final_root.exists() {
        verify_tree(&final_root, &manifest, &manifest_bytes, false).map_err(|error| {
            IoError::new(
                ErrorKind::InvalidData,
                format!(
                    "cached standalone runtime failed verification at {}: {error}",
                    final_root.display()
                ),
            )
        })?;
        return server_path(&final_root);
    }

    // The packaged source is used only when a cache must be created.
    // Reused caches remain fully hashed on every launch, but the unused
    // Program Files copy is not redundantly hashed as well.
    verify_tree(source_root, &manifest, &manifest_bytes, true)?;

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let staging_root = cache_root.join(format!(".staging-{}-{nonce}", std::process::id()));
    fs::create_dir(&staging_root)?;

    let result = (|| -> Result<(), IoError> {
        copy_tree(source_root, &staging_root, true)?;
        fs::write(staging_root.join(MANIFEST_FILE), &manifest_bytes)?;
        OpenOptions::new()
            .write(true)
            .open(staging_root.join(MANIFEST_FILE))?
            .sync_all()?;
        verify_tree(&staging_root, &manifest, &manifest_bytes, false)?;
        match fs::rename(&staging_root, &final_root) {
            Ok(()) => Ok(()),
            Err(_error) if final_root.exists() => {
                verify_tree(&final_root, &manifest, &manifest_bytes, false)?;
                fs::remove_dir_all(&staging_root)?;
                Ok(())
            }
            Err(error) => Err(error),
        }
    })();

    if let Err(error) = result {
        let _ = fs::remove_dir_all(&staging_root);
        return Err(error);
    }
    // The verified staging directory was atomically renamed; no file
    // contents changed across that operation. Avoid a third full-tree hash.
    server_path(&final_root)
}

fn load_manifest(
    root: &Path,
    expected_app_version: &str,
) -> Result<(StandaloneManifest, Vec<u8>), IoError> {
    let path = root.join(MANIFEST_FILE);
    ensure_file(&path, "standalone manifest")?;
    let bytes = fs::read(&path)?;
    let manifest: StandaloneManifest = serde_json::from_slice(&bytes).map_err(|error| {
        IoError::new(
            ErrorKind::InvalidData,
            format!("could not decode packaged standalone manifest: {error}"),
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
    Ok((manifest, bytes))
}

fn cache_name(version: &str, tree_sha256: &str) -> Result<String, IoError> {
    if version.is_empty()
        || !version
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'.' | b'-' | b'_'))
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "installed app version is unsafe for a runtime-cache path",
        ));
    }
    Ok(format!("{version}-{}", &tree_sha256[..16]))
}

fn copy_tree(source: &Path, destination: &Path, root_level: bool) -> Result<(), IoError> {
    ensure_directory(source, "packaged standalone directory")?;
    let mut entries = fs::read_dir(source)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let source_path = entry.path();
        let name = entry.file_name();
        if root_level
            && (name == std::ffi::OsStr::new(MANIFEST_FILE)
                || name == std::ffi::OsStr::new(".gitkeep"))
        {
            continue;
        }
        let metadata = fs::symlink_metadata(&source_path)?;
        reject_link(&metadata, &source_path)?;
        let destination_path = destination.join(name);
        if metadata.is_dir() {
            fs::create_dir(&destination_path)?;
            copy_tree(&source_path, &destination_path, false)?;
        } else if metadata.is_file() {
            // A complete SHA-256 tree verification follows the copy before
            // atomic promotion. Per-file FlushFileBuffers made low-end
            // Windows first launch take minutes without adding integrity.
            fs::copy(&source_path, &destination_path)?;
        } else {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!(
                    "standalone runtime contains an unsupported file type: {}",
                    source_path.display()
                ),
            ));
        }
    }
    Ok(())
}

fn verify_tree(
    root: &Path,
    manifest: &StandaloneManifest,
    manifest_bytes: &[u8],
    allow_gitkeep: bool,
) -> Result<(), IoError> {
    ensure_directory(root, "standalone runtime root")?;
    ensure_file(&root.join(MANIFEST_FILE), "standalone manifest")?;
    if fs::read(root.join(MANIFEST_FILE))? != manifest_bytes {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "standalone manifest bytes do not match the packaged authority",
        ));
    }
    let identity = tree_identity(root, allow_gitkeep)?;
    if identity.file_count != manifest.file_count || identity.sha256 != manifest.tree_sha256 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "standalone tree mismatch: expected {} files/{}, observed {} files/{}",
                manifest.file_count, manifest.tree_sha256, identity.file_count, identity.sha256
            ),
        ));
    }
    server_path(root).map(|_| ())
}

struct TreeIdentity {
    sha256: String,
    file_count: u64,
}

fn tree_identity(root: &Path, allow_gitkeep: bool) -> Result<TreeIdentity, IoError> {
    let mut files = Vec::new();
    collect_files(root, root, allow_gitkeep, &mut files)?;
    files.sort_by(|left, right| left.0.cmp(&right.0));
    let mut hasher = Sha256::new();
    hasher.update(TREE_HASH_DOMAIN);
    for (relative, path, size) in &files {
        let digest = sha256_file(path)?;
        hasher.update(relative.len().to_string().as_bytes());
        hasher.update(b":");
        hasher.update(relative.as_bytes());
        hasher.update(b"\n");
        hasher.update(size.to_string().as_bytes());
        hasher.update(b":");
        hasher.update(digest.as_bytes());
        hasher.update(b"\n");
    }
    Ok(TreeIdentity {
        sha256: hex_digest(&hasher.finalize()),
        file_count: files.len() as u64,
    })
}

fn collect_files(
    root: &Path,
    directory: &Path,
    allow_gitkeep: bool,
    files: &mut Vec<(String, PathBuf, u64)>,
) -> Result<(), IoError> {
    ensure_directory(directory, "standalone runtime directory")?;
    let mut entries = fs::read_dir(directory)?.collect::<Result<Vec<_>, _>>()?;
    entries.sort_by_key(|entry| entry.file_name());
    for entry in entries {
        let path = entry.path();
        let name = entry.file_name();
        if directory == root
            && (name == std::ffi::OsStr::new(MANIFEST_FILE)
                || (allow_gitkeep && name == std::ffi::OsStr::new(".gitkeep")))
        {
            continue;
        }
        let metadata = fs::symlink_metadata(&path)?;
        reject_link(&metadata, &path)?;
        if metadata.is_dir() {
            collect_files(root, &path, allow_gitkeep, files)?;
        } else if metadata.is_file() {
            let relative = normalized_relative(root, &path)?;
            files.push((relative, path, metadata.len()));
        } else {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!("unsupported standalone file type: {}", path.display()),
            ));
        }
    }
    Ok(())
}

fn normalized_relative(root: &Path, path: &Path) -> Result<String, IoError> {
    path.strip_prefix(root)
        .map_err(|_| IoError::new(ErrorKind::InvalidData, "runtime file escaped its root"))?
        .components()
        .map(|component| match component {
            Component::Normal(value) => value.to_str().ok_or_else(|| {
                IoError::new(ErrorKind::InvalidData, "runtime path is not valid UTF-8")
            }),
            _ => Err(IoError::new(
                ErrorKind::InvalidData,
                "runtime path is not normalized",
            )),
        })
        .collect::<Result<Vec<_>, _>>()
        .map(|parts| parts.join("/"))
}

fn server_path(root: &Path) -> Result<PathBuf, IoError> {
    let path = root.join("server.js");
    ensure_file(&path, "verified standalone server")?;
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

fn sha256_file(path: &Path) -> Result<String, IoError> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex_digest(&hasher.finalize()))
}

fn hex_digest(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn is_sha256(value: &str) -> bool {
    value.len() == 64 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "sahelflow-runtime-stage-{name}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ))
    }

    fn write(path: &Path, bytes: &[u8]) {
        fs::create_dir_all(path.parent().expect("parent")).expect("create parent");
        let mut file = File::create(path).expect("create file");
        file.write_all(bytes).expect("write file");
        file.sync_all().expect("sync file");
    }

    fn fixture(name: &str) -> (PathBuf, PathBuf) {
        let root = root(name);
        let source = root.join("source");
        let local = root.join("local");
        fs::create_dir_all(source.join(".next/server")).expect("source");
        fs::create_dir_all(&local).expect("local");
        write(&source.join("server.js"), b"console.log('server')\n");
        write(&source.join(".next/server/app.js"), b"module.exports = 1\n");
        let identity = tree_identity(&source, true).expect("identity");
        let manifest = StandaloneManifest {
            format_version: MANIFEST_FORMAT_VERSION,
            app_version: "1.0.0-internal.2".to_string(),
            tree_sha256: identity.sha256,
            file_count: identity.file_count,
        };
        let mut bytes = serde_json::to_vec_pretty(&manifest).expect("manifest");
        bytes.push(b'\n');
        write(&source.join(MANIFEST_FILE), &bytes);
        (source, local)
    }

    #[test]
    fn stages_and_reuses_verified_runtime() {
        let (source, local) = fixture("reuse");
        let first = stage_standalone(&source, &local, "1.0.0-internal.2").expect("stage");
        let second = stage_standalone(&source, &local, "1.0.0-internal.2").expect("reuse");
        assert_eq!(first, second);
        assert_eq!(
            fs::read_to_string(first).expect("server"),
            "console.log('server')\n"
        );
        fs::remove_dir_all(source.parent().expect("root")).expect("cleanup");
    }

    #[test]
    fn rejects_tampered_writable_cache() {
        let (source, local) = fixture("tamper");
        let server = stage_standalone(&source, &local, "1.0.0-internal.2").expect("stage");
        write(&server, b"tampered\n");
        let error = stage_standalone(&source, &local, "1.0.0-internal.2")
            .expect_err("tampered cache must fail");
        assert!(error
            .to_string()
            .contains("cached standalone runtime failed verification"));
        fs::remove_dir_all(source.parent().expect("root")).expect("cleanup");
    }

    #[test]
    fn rejects_packaged_tree_mismatch() {
        let (source, local) = fixture("source-mismatch");
        write(&source.join("server.js"), b"changed\n");
        let error = stage_standalone(&source, &local, "1.0.0-internal.2")
            .expect_err("source mismatch must fail");
        assert!(error.to_string().contains("standalone tree mismatch"));
        fs::remove_dir_all(source.parent().expect("root")).expect("cleanup");
    }
}
