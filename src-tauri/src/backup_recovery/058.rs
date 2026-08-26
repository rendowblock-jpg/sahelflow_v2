const WHATSAPP_MEDIA_ARCHIVE_SCOPE_DIGEST_DOMAIN: &[u8] =
    b"sahelflow.whatsapp.media-archive-scope.v1\0";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct WhatsAppMediaScopeStats {
    pub(crate) object_count: u64,
    pub(crate) ciphertext_bytes: u64,
    pub(crate) scope_sha256: String,
}

#[derive(Clone, Debug)]
struct WhatsAppMediaScopeEntry {
    object_id: String,
    path: PathBuf,
    bytes: u64,
    sha256: String,
}

pub(crate) fn whatsapp_media_scope_path(
    app_data_dir: &Path,
    workspace_id: &str,
    shop_id: &str,
    shop_incarnation_id: &str,
) -> Result<PathBuf, IoError> {
    Ok(whatsapp_media_root(app_data_dir).join(whatsapp_media_scope_hash(
        workspace_id,
        shop_id,
        shop_incarnation_id,
    )?))
}

fn whatsapp_media_scope_entries(
    scope_root: &Path,
) -> Result<Vec<WhatsAppMediaScopeEntry>, IoError> {
    reject_symlink_if_present(scope_root)?;
    let metadata = fs::symlink_metadata(scope_root)?;
    if path_is_link(&metadata) || !metadata.is_dir() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media shop scope is not a contained directory",
        ));
    }

    let mut entries = Vec::new();
    for object_entry in fs::read_dir(scope_root)? {
        let object_entry = object_entry?;
        let name = object_entry
            .file_name()
            .to_str()
            .ok_or_else(|| {
                IoError::new(
                    ErrorKind::InvalidData,
                    "WhatsApp media object name is not UTF-8",
                )
            })?
            .to_owned();
        let object_id = name
            .strip_suffix(".sfmedia")
            .ok_or_else(|| {
                IoError::new(
                    ErrorKind::InvalidData,
                    "WhatsApp media scope contains a temporary or unsupported file",
                )
            })?
            .to_owned();
        if !valid_lower_hex_64(&object_id) {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media object identity is invalid",
            ));
        }
        let path = object_entry.path();
        let object_metadata = fs::symlink_metadata(&path)?;
        if path_is_link(&object_metadata) || !object_metadata.is_file() {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media object is not a contained regular file",
            ));
        }
        validate_whatsapp_media_object_file(&path)?;
        entries.push(WhatsAppMediaScopeEntry {
            object_id,
            path: path.clone(),
            bytes: object_metadata.len(),
            sha256: sha256_file(&path)?,
        });
        if entries.len() > MAX_WHATSAPP_MEDIA_OBJECTS {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media shop scope contains too many objects",
            ));
        }
    }
    entries.sort_by(|left, right| left.object_id.cmp(&right.object_id));
    Ok(entries)
}

fn whatsapp_media_scope_stats_from_entries(
    entries: &[WhatsAppMediaScopeEntry],
) -> Result<WhatsAppMediaScopeStats, IoError> {
    let mut digest = Sha256::new();
    digest.update(WHATSAPP_MEDIA_ARCHIVE_SCOPE_DIGEST_DOMAIN);
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

pub(crate) fn whatsapp_media_scope_stats(
    scope_root: &Path,
) -> Result<WhatsAppMediaScopeStats, IoError> {
    whatsapp_media_scope_stats_from_entries(&whatsapp_media_scope_entries(scope_root)?)
}

pub(crate) fn verify_whatsapp_media_scope(
    scope_root: &Path,
    expected: &WhatsAppMediaScopeStats,
) -> Result<(), IoError> {
    if !scope_root.exists() || whatsapp_media_scope_stats(scope_root)? != *expected {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media shop scope does not match authenticated archive evidence",
        ));
    }
    Ok(())
}

fn copy_whatsapp_media_scope_exact(
    source_scope: &Path,
    target_scope: &Path,
) -> Result<WhatsAppMediaScopeStats, IoError> {
    let entries = whatsapp_media_scope_entries(source_scope)?;
    let expected = whatsapp_media_scope_stats_from_entries(&entries)?;
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
            let target = target_scope.join(format!("{}.sfmedia", entry.object_id));
            copy_file_verified(&entry.path, &target)?;
            validate_whatsapp_media_object_file(&target)?;
        }
        sync_tree(target_scope)
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(target_scope);
        return Err(error);
    }
    verify_whatsapp_media_scope(target_scope, &expected)?;
    Ok(expected)
}

pub(crate) fn snapshot_whatsapp_media_scope(
    source_scope: &Path,
    archive_scope: &Path,
) -> Result<Option<WhatsAppMediaScopeStats>, IoError> {
    if !source_scope.exists() {
        return Ok(None);
    }
    copy_whatsapp_media_scope_exact(source_scope, archive_scope).map(Some)
}

pub(crate) fn restore_whatsapp_media_scope(
    archive_scope: &Path,
    live_scope: &Path,
    expected: &WhatsAppMediaScopeStats,
) -> Result<(), IoError> {
    verify_whatsapp_media_scope(archive_scope, expected)?;
    let restored = copy_whatsapp_media_scope_exact(archive_scope, live_scope)?;
    if restored != *expected {
        let _ = fs::remove_dir_all(live_scope);
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "restored WhatsApp media shop scope changed its archive evidence",
        ));
    }
    Ok(())
}

pub(crate) fn remove_whatsapp_media_scope_if_present(scope_root: &Path) -> Result<(), IoError> {
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
    sync_parent_directory(scope_root)
}

#[cfg(test)]
mod whatsapp_media_shop_scope_tests {
    use super::*;

    fn write_test_object(path: &Path) {
        let mut bytes = Vec::new();
        bytes.extend_from_slice(WHATSAPP_MEDIA_OBJECT_MAGIC);
        bytes.push(WHATSAPP_MEDIA_OBJECT_FORMAT_VERSION);
        bytes.extend_from_slice(&WHATSAPP_MEDIA_OBJECT_CHUNK_BYTES.to_le_bytes());
        let mut frame = [0_u8; 32];
        frame[..4].copy_from_slice(&4_u32.to_le_bytes());
        bytes.extend_from_slice(&frame);
        bytes.extend_from_slice(b"test");
        fs::write(path, bytes).expect("write media object");
    }

    #[test]
    fn shop_scope_snapshot_restore_and_digest_are_exact() {
        let root = std::env::temp_dir().join(format!(
            "sahelflow-media-scope-{}",
            random_hex(8).expect("random test root")
        ));
        let live = root.join("live");
        let archived = root.join("archived");
        let restored = root.join("restored");
        fs::create_dir_all(&live).expect("create live scope");
        write_test_object(&live.join(format!("{}.sfmedia", "a".repeat(64))));

        let expected = snapshot_whatsapp_media_scope(&live, &archived)
            .expect("snapshot scope")
            .expect("scope exists");
        verify_whatsapp_media_scope(&archived, &expected).expect("verify archive");
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
