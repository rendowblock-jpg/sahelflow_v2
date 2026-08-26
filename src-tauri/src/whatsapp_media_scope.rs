use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{copy as copy_io, Error as IoError, ErrorKind, Read};
use std::path::{Path, PathBuf};

const MEDIA_ROOT_NAME: &str = "whatsapp-media";
const MEDIA_SCOPE_DOMAIN: &[u8] = b"sahelflow/whatsapp/media-scope/v1\0";
const MEDIA_ARCHIVE_SCOPE_DIGEST_DOMAIN: &[u8] =
    b"sahelflow.whatsapp.media-archive-scope.v1\0";
const MEDIA_OBJECT_MAGIC: &[u8; 4] = b"SFM1";
const MEDIA_OBJECT_FORMAT_VERSION: u8 = 1;
const MEDIA_OBJECT_CHUNK_BYTES: u32 = 1024 * 1024;
const MAX_MEDIA_OBJECT_PLAINTEXT_BYTES: u64 = 64 * 1024 * 1024;
const MAX_MEDIA_OBJECTS: usize = 50_000;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct WhatsAppMediaScopeStats {
    pub(super) object_count: u64,
    pub(super) ciphertext_bytes: u64,
    pub(super) scope_sha256: String,
}

#[derive(Clone, Debug)]
struct MediaScopeEntry {
    object_id: String,
    path: PathBuf,
    bytes: u64,
    sha256: String,
}

pub(super) fn whatsapp_media_scope_path(
    app_data_dir: &Path,
    workspace_id: &str,
    shop_id: &str,
    shop_incarnation_id: &str,
) -> Result<PathBuf, IoError> {
    let encoded = serde_json::to_vec(&[workspace_id, shop_id, shop_incarnation_id]).map_err(
        |error| IoError::other(format!("WhatsApp media scope serialization failed: {error}")),
    )?;
    let mut digest = Sha256::new();
    digest.update(MEDIA_SCOPE_DOMAIN);
    digest.update(encoded);
    Ok(app_data_dir
        .join(MEDIA_ROOT_NAME)
        .join(hex_encode(&digest.finalize())))
}

fn valid_lower_hex_64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn path_is_link(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    false
}

fn reject_symlink_if_present(path: &Path) -> Result<(), IoError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if path_is_link(&metadata) => Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media path must not be redirected",
        )),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn sha256_file(path: &Path) -> Result<String, IoError> {
    let mut file = File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(hex_encode(&digest.finalize()))
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn validate_media_object_file(path: &Path) -> Result<(), IoError> {
    reject_symlink_if_present(path)?;
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() < 42 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media object is not a bounded regular object",
        ));
    }
    let mut reader = std::io::BufReader::new(File::open(path)?);
    let mut header = [0_u8; 9];
    reader.read_exact(&mut header)?;
    if &header[..4] != MEDIA_OBJECT_MAGIC
        || header[4] != MEDIA_OBJECT_FORMAT_VERSION
        || u32::from_le_bytes(header[5..9].try_into().unwrap()) != MEDIA_OBJECT_CHUNK_BYTES
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media object header is invalid",
        ));
    }

    let mut chunk_count = 0_u32;
    let mut plaintext_bytes = 0_u64;
    let mut scratch = vec![0_u8; 64 * 1024];
    loop {
        let mut first = [0_u8; 1];
        let read = reader.read(&mut first)?;
        if read == 0 {
            break;
        }
        let mut prefix = [0_u8; 32];
        prefix[0] = first[0];
        reader.read_exact(&mut prefix[1..])?;
        let chunk_bytes = u32::from_le_bytes(prefix[..4].try_into().unwrap());
        if chunk_bytes == 0 || chunk_bytes > MEDIA_OBJECT_CHUNK_BYTES {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media object chunk dimensions are invalid",
            ));
        }
        plaintext_bytes = plaintext_bytes
            .checked_add(chunk_bytes as u64)
            .ok_or_else(|| IoError::new(ErrorKind::InvalidData, "WhatsApp media size overflow"))?;
        if plaintext_bytes > MAX_MEDIA_OBJECT_PLAINTEXT_BYTES {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media object exceeds the source byte ceiling",
            ));
        }
        let mut remaining = chunk_bytes as usize;
        while remaining > 0 {
            let take = remaining.min(scratch.len());
            reader.read_exact(&mut scratch[..take])?;
            remaining -= take;
        }
        chunk_count = chunk_count.checked_add(1).ok_or_else(|| {
            IoError::new(ErrorKind::InvalidData, "WhatsApp media object has too many chunks")
        })?;
    }
    scratch.fill(0);
    if chunk_count == 0 || plaintext_bytes == 0 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media object contains no authenticated frames",
        ));
    }
    Ok(())
}

fn scope_entries(scope_root: &Path) -> Result<Vec<MediaScopeEntry>, IoError> {
    reject_symlink_if_present(scope_root)?;
    let metadata = fs::symlink_metadata(scope_root)?;
    if path_is_link(&metadata) || !metadata.is_dir() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media shop scope is not a contained directory",
        ));
    }
    let mut entries = Vec::new();
    for entry in fs::read_dir(scope_root)? {
        let entry = entry?;
        let name = entry.file_name().to_str().ok_or_else(|| {
            IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media object name is not UTF-8",
            )
        })?.to_owned();
        let object_id = name.strip_suffix(".sfmedia").ok_or_else(|| {
            IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media scope contains a temporary or unsupported file",
            )
        })?.to_owned();
        if !valid_lower_hex_64(&object_id) {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media object identity is invalid",
            ));
        }
        let path = entry.path();
        let object_metadata = fs::symlink_metadata(&path)?;
        if path_is_link(&object_metadata) || !object_metadata.is_file() {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media object is not a contained regular file",
            ));
        }
        validate_media_object_file(&path)?;
        entries.push(MediaScopeEntry {
            object_id,
            path: path.clone(),
            bytes: object_metadata.len(),
            sha256: sha256_file(&path)?,
        });
        if entries.len() > MAX_MEDIA_OBJECTS {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media shop scope contains too many objects",
            ));
        }
    }
    entries.sort_by(|left, right| left.object_id.cmp(&right.object_id));
    Ok(entries)
}

fn scope_stats_from_entries(entries: &[MediaScopeEntry]) -> Result<WhatsAppMediaScopeStats, IoError> {
    let mut digest = Sha256::new();
    digest.update(MEDIA_ARCHIVE_SCOPE_DIGEST_DOMAIN);
    digest.update((entries.len() as u64).to_le_bytes());
    let mut ciphertext_bytes = 0_u64;
    for entry in entries {
        ciphertext_bytes = ciphertext_bytes.checked_add(entry.bytes).ok_or_else(|| {
            IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media shop-scope size overflowed",
            )
        })?;
        digest.update(entry.object_id.as_bytes());
        digest.update(entry.bytes.to_le_bytes());
        digest.update(entry.sha256.as_bytes());
    }
    Ok(WhatsAppMediaScopeStats {
        object_count: entries.len() as u64,
        ciphertext_bytes,
        scope_sha256: hex_encode(&digest.finalize()),
    })
}

fn scope_stats(scope_root: &Path) -> Result<WhatsAppMediaScopeStats, IoError> {
    scope_stats_from_entries(&scope_entries(scope_root)?)
}

pub(super) fn verify_whatsapp_media_scope(
    scope_root: &Path,
    expected: &WhatsAppMediaScopeStats,
) -> Result<(), IoError> {
    if !scope_root.exists() || scope_stats(scope_root)? != *expected {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media shop scope does not match authenticated archive evidence",
        ));
    }
    Ok(())
}

fn sync_parent(path: &Path) -> Result<(), IoError> {
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    #[cfg(not(windows))]
    File::open(parent)?.sync_all()?;
    #[cfg(windows)]
    {
        let _ = parent;
    }
    Ok(())
}

fn sync_scope(scope_root: &Path) -> Result<(), IoError> {
    for entry in fs::read_dir(scope_root)? {
        let path = entry?.path();
        if path.is_file() {
            File::open(path)?.sync_all()?;
        }
    }
    #[cfg(not(windows))]
    File::open(scope_root)?.sync_all()?;
    sync_parent(scope_root)
}

fn copy_file_verified(source: &Path, target: &Path) -> Result<(), IoError> {
    if target.exists() {
        return Err(IoError::new(
            ErrorKind::AlreadyExists,
            "WhatsApp media copy target already exists",
        ));
    }
    let expected = sha256_file(source)?;
    let mut input = File::open(source)?;
    let mut output = OpenOptions::new().write(true).create_new(true).open(target)?;
    let result = (|| -> Result<(), IoError> {
        copy_io(&mut input, &mut output)?;
        output.sync_all()?;
        drop(output);
        if sha256_file(target)? != expected {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media copy digest changed",
            ));
        }
        validate_media_object_file(target)
    })();
    if result.is_err() {
        let _ = fs::remove_file(target);
    }
    result
}

fn copy_scope_exact(
    source_scope: &Path,
    target_scope: &Path,
) -> Result<WhatsAppMediaScopeStats, IoError> {
    let entries = scope_entries(source_scope)?;
    let expected = scope_stats_from_entries(&entries)?;
    if target_scope.exists() {
        return Err(IoError::new(
            ErrorKind::AlreadyExists,
            "WhatsApp media shop-scope target already exists",
        ));
    }
    if let Some(parent) = target_scope.parent() {
        fs::create_dir_all(parent)?;
        reject_symlink_if_present(parent)?;
    }
    fs::create_dir(target_scope)?;
    let result = (|| -> Result<(), IoError> {
        for entry in &entries {
            copy_file_verified(
                &entry.path,
                &target_scope.join(format!("{}.sfmedia", entry.object_id)),
            )?;
        }
        sync_scope(target_scope)
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(target_scope);
        return Err(error);
    }
    verify_whatsapp_media_scope(target_scope, &expected)?;
    Ok(expected)
}

pub(super) fn snapshot_whatsapp_media_scope(
    source_scope: &Path,
    archive_scope: &Path,
) -> Result<Option<WhatsAppMediaScopeStats>, IoError> {
    if !source_scope.exists() {
        return Ok(None);
    }
    copy_scope_exact(source_scope, archive_scope).map(Some)
}

pub(super) fn restore_whatsapp_media_scope(
    archive_scope: &Path,
    live_scope: &Path,
    expected: &WhatsAppMediaScopeStats,
) -> Result<(), IoError> {
    verify_whatsapp_media_scope(archive_scope, expected)?;
    let restored = copy_scope_exact(archive_scope, live_scope)?;
    if restored != *expected {
        let _ = fs::remove_dir_all(live_scope);
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "restored WhatsApp media shop scope changed its archive evidence",
        ));
    }
    Ok(())
}

pub(super) fn remove_whatsapp_media_scope_if_present(scope_root: &Path) -> Result<(), IoError> {
    if !scope_root.exists() {
        return Ok(());
    }
    reject_symlink_if_present(scope_root)?;
    let metadata = fs::symlink_metadata(scope_root)?;
    if path_is_link(&metadata) || !metadata.is_dir() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media shop scope removal target is redirected",
        ));
    }
    fs::remove_dir_all(scope_root)?;
    sync_parent(scope_root)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_test_object(path: &Path) {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(MEDIA_OBJECT_MAGIC);
        bytes.push(MEDIA_OBJECT_FORMAT_VERSION);
        bytes.extend_from_slice(&MEDIA_OBJECT_CHUNK_BYTES.to_le_bytes());
        let mut frame = [0_u8; 32];
        frame[..4].copy_from_slice(&4_u32.to_le_bytes());
        bytes.extend_from_slice(&frame);
        bytes.extend_from_slice(b"test");
        fs::write(path, bytes).expect("write media object");
    }

    #[test]
    fn scope_hash_matches_typescript_contract() {
        let root = Path::new("/tmp/source-root");
        let observed = whatsapp_media_scope_path(
            root,
            "workspace-test",
            "shop-test",
            "incarnation-test",
        )
        .expect("scope path");
        assert_eq!(
            observed.file_name().and_then(|value| value.to_str()),
            Some("bd0e9ddacb1f7c6f3121d2694693271397bab1c56a0378c196d8b5acce12623f")
        );
    }

    #[test]
    fn snapshot_restore_and_digest_are_exact() {
        let root = std::env::temp_dir().join(format!(
            "sahelflow-media-scope-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        let live = root.join("live");
        let archived = root.join("archived");
        let restored = root.join("restored");
        fs::create_dir_all(&live).expect("create live scope");
        write_test_object(&live.join(format!("{}.sfmedia", "a".repeat(64))));

        let expected = snapshot_whatsapp_media_scope(&live, &archived)
            .expect("snapshot scope")
            .expect("scope exists");
        restore_whatsapp_media_scope(&archived, &restored, &expected).expect("restore scope");
        verify_whatsapp_media_scope(&restored, &expected).expect("verify restored scope");
        fs::write(
            restored.join(format!("{}.sfmedia", "a".repeat(64))),
            b"tampered",
        )
        .expect("tamper restored object");
        assert!(verify_whatsapp_media_scope(&restored, &expected).is_err());
        let _ = fs::remove_dir_all(root);
    }
}
