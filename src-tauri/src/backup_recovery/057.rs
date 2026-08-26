

const WHATSAPP_MEDIA_ROOT_NAME: &str = "whatsapp-media";
const WHATSAPP_MEDIA_PACK_MAGIC: &[u8; 8] = b"SFMPK001";
const WHATSAPP_MEDIA_PACK_VERSION: u8 = 1;
const WHATSAPP_MEDIA_PACK_HEADER_BYTES: u64 = 13;
const WHATSAPP_MEDIA_PACK_ENTRY_METADATA_BYTES: u64 = 64 + 64 + 8 + 64;
const WHATSAPP_MEDIA_OBJECT_MAGIC: &[u8; 4] = b"SFM1";
const WHATSAPP_MEDIA_OBJECT_FORMAT_VERSION: u8 = 1;
const WHATSAPP_MEDIA_OBJECT_CHUNK_BYTES: u32 = 1024 * 1024;
const MAX_WHATSAPP_MEDIA_OBJECT_PLAINTEXT_BYTES: u64 = 64 * 1024 * 1024;
const MAX_WHATSAPP_MEDIA_OBJECTS: usize = 50_000;
const WHATSAPP_MEDIA_SCOPE_DOMAIN: &[u8] = b"sahelflow/whatsapp/media-scope/v1\0";
const WHATSAPP_MEDIA_TREE_DIGEST_DOMAIN: &[u8] = b"sahelflow.whatsapp.media-tree.v1\0";
const WHATSAPP_MEDIA_BACKUP_OBJECT_NAME: &str = "whatsapp-media-tree";
const WHATSAPP_MEDIA_BACKUP_OBJECT_FILE: &str = "objects/whatsapp-media.sfo";
const WHATSAPP_MEDIA_BACKUP_OBJECT_KIND: &str = "whatsapp-media-tree";

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct WhatsAppMediaTreeStats {
    object_count: usize,
    ciphertext_bytes: u64,
    tree_sha256: String,
}

#[derive(Clone, Debug)]
struct WhatsAppMediaTreeEntry {
    scope: String,
    object_id: String,
    path: PathBuf,
    bytes: u64,
    sha256: String,
}

#[derive(Clone, Debug)]
struct WhatsAppMediaPackEntry {
    scope: String,
    object_id: String,
    bytes: u64,
    sha256: String,
}

fn valid_lower_hex_64(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn whatsapp_media_scope_hash(
    workspace_id: &str,
    shop_id: &str,
    shop_incarnation_id: &str,
) -> Result<String, IoError> {
    let encoded = serde_json::to_vec(&[workspace_id, shop_id, shop_incarnation_id]).map_err(
        |error| IoError::other(format!("WhatsApp media scope serialization failed: {error}")),
    )?;
    Ok(hex_encode(&sha256(&[
        WHATSAPP_MEDIA_SCOPE_DOMAIN,
        encoded.as_slice(),
    ])))
}

fn whatsapp_media_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join(WHATSAPP_MEDIA_ROOT_NAME)
}

fn expected_whatsapp_media_scopes(
    registry: &ShopRegistry,
) -> Result<BTreeMap<String, String>, IoError> {
    let mut expected = BTreeMap::new();
    for shop in &registry.shops {
        let scope = whatsapp_media_scope_hash(
            &registry.workspace_id,
            &shop.id,
            &shop.incarnation_id,
        )?;
        if expected.insert(scope, shop.id.clone()).is_some() {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media scope identity collided across shops",
            ));
        }
    }
    Ok(expected)
}

fn validate_whatsapp_media_object_file(path: &Path) -> Result<(), IoError> {
    reject_symlink_if_present(path)?;
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() < 42 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media object is not a bounded regular object",
        ));
    }
    let mut reader = BufReader::new(File::open(path)?);
    let mut header = [0_u8; 9];
    reader.read_exact(&mut header)?;
    if &header[..4] != WHATSAPP_MEDIA_OBJECT_MAGIC
        || header[4] != WHATSAPP_MEDIA_OBJECT_FORMAT_VERSION
        || u32::from_le_bytes(header[5..9].try_into().unwrap())
            != WHATSAPP_MEDIA_OBJECT_CHUNK_BYTES
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
        if chunk_bytes == 0 || chunk_bytes > WHATSAPP_MEDIA_OBJECT_CHUNK_BYTES {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media object chunk dimensions are invalid",
            ));
        }
        plaintext_bytes = plaintext_bytes
            .checked_add(chunk_bytes as u64)
            .ok_or_else(|| IoError::new(ErrorKind::InvalidData, "WhatsApp media size overflow"))?;
        if plaintext_bytes > MAX_WHATSAPP_MEDIA_OBJECT_PLAINTEXT_BYTES {
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
    clear_bytes(&mut scratch);
    if chunk_count == 0 || plaintext_bytes == 0 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media object contains no authenticated frames",
        ));
    }
    Ok(())
}

fn whatsapp_media_tree_entries(
    root: &Path,
    registry: &ShopRegistry,
) -> Result<Vec<WhatsAppMediaTreeEntry>, IoError> {
    let expected = expected_whatsapp_media_scopes(registry)?;
    if !root.exists() {
        return Ok(Vec::new());
    }
    reject_symlink_if_present(root)?;
    let root_metadata = fs::metadata(root)?;
    if !root_metadata.is_dir() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media root is not a regular directory",
        ));
    }

    let mut entries = Vec::new();
    for scope_entry in fs::read_dir(root)? {
        let scope_entry = scope_entry?;
        let scope = scope_entry
            .file_name()
            .to_str()
            .ok_or_else(|| IoError::new(ErrorKind::InvalidData, "WhatsApp media scope is not UTF-8"))?
            .to_owned();
        if !expected.contains_key(&scope) {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media root contains an orphan or foreign shop scope",
            ));
        }
        let scope_path = scope_entry.path();
        let scope_metadata = fs::symlink_metadata(&scope_path)?;
        if path_is_link(&scope_metadata) || !scope_metadata.is_dir() {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media scope is not a contained directory",
            ));
        }
        for object_entry in fs::read_dir(&scope_path)? {
            let object_entry = object_entry?;
            let name = object_entry
                .file_name()
                .to_str()
                .ok_or_else(|| IoError::new(ErrorKind::InvalidData, "WhatsApp media object name is not UTF-8"))?
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
            let metadata = fs::symlink_metadata(&path)?;
            if path_is_link(&metadata) || !metadata.is_file() {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    "WhatsApp media object is not a contained regular file",
                ));
            }
            validate_whatsapp_media_object_file(&path)?;
            entries.push(WhatsAppMediaTreeEntry {
                scope: scope.clone(),
                object_id,
                path: path.clone(),
                bytes: metadata.len(),
                sha256: sha256_file(&path)?,
            });
            if entries.len() > MAX_WHATSAPP_MEDIA_OBJECTS {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    "WhatsApp media tree contains too many objects",
                ));
            }
        }
    }
    entries.sort_by(|left, right| {
        left.scope
            .cmp(&right.scope)
            .then_with(|| left.object_id.cmp(&right.object_id))
    });
    Ok(entries)
}

fn whatsapp_media_tree_stats_from_pack_entries(
    entries: &[WhatsAppMediaPackEntry],
) -> Result<WhatsAppMediaTreeStats, IoError> {
    let mut digest = Sha256::new();
    digest.update(WHATSAPP_MEDIA_TREE_DIGEST_DOMAIN);
    digest.update((entries.len() as u64).to_le_bytes());
    let mut ciphertext_bytes = 0_u64;
    for entry in entries {
        ciphertext_bytes = ciphertext_bytes.checked_add(entry.bytes).ok_or_else(|| {
            IoError::new(ErrorKind::InvalidData, "WhatsApp media aggregate size overflowed")
        })?;
        digest.update(entry.scope.as_bytes());
        digest.update(entry.object_id.as_bytes());
        digest.update(entry.bytes.to_le_bytes());
        digest.update(entry.sha256.as_bytes());
    }
    Ok(WhatsAppMediaTreeStats {
        object_count: entries.len(),
        ciphertext_bytes,
        tree_sha256: hex_encode(&digest.finalize()),
    })
}

fn whatsapp_media_tree_stats(
    root: &Path,
    registry: &ShopRegistry,
) -> Result<WhatsAppMediaTreeStats, IoError> {
    let entries = whatsapp_media_tree_entries(root, registry)?;
    let metadata = entries
        .into_iter()
        .map(|entry| WhatsAppMediaPackEntry {
            scope: entry.scope,
            object_id: entry.object_id,
            bytes: entry.bytes,
            sha256: entry.sha256,
        })
        .collect::<Vec<_>>();
    whatsapp_media_tree_stats_from_pack_entries(&metadata)
}

fn estimate_whatsapp_media_pack_plaintext_bytes(
    app_data_dir: &Path,
    registry: &ShopRegistry,
) -> Result<u64, IoError> {
    let entries = whatsapp_media_tree_entries(&whatsapp_media_root(app_data_dir), registry)?;
    if entries.is_empty() {
        return Ok(0);
    }
    entries.iter().try_fold(
        WHATSAPP_MEDIA_PACK_HEADER_BYTES,
        |total, entry| {
            total
                .checked_add(WHATSAPP_MEDIA_PACK_ENTRY_METADATA_BYTES)
                .and_then(|value| value.checked_add(entry.bytes))
                .ok_or_else(|| {
                    IoError::new(ErrorKind::InvalidData, "WhatsApp media pack size overflowed")
                })
        },
    )
}

fn create_whatsapp_media_pack(
    app_data_dir: &Path,
    registry: &ShopRegistry,
    target: &Path,
) -> Result<bool, IoError> {
    let entries = whatsapp_media_tree_entries(&whatsapp_media_root(app_data_dir), registry)?;
    if entries.is_empty() {
        return Ok(false);
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
        reject_symlink_if_present(parent)?;
    }
    let file = OpenOptions::new().write(true).create_new(true).open(target)?;
    let mut writer = BufWriter::new(file);
    let result = (|| -> Result<(), IoError> {
        writer.write_all(WHATSAPP_MEDIA_PACK_MAGIC)?;
        writer.write_all(&[WHATSAPP_MEDIA_PACK_VERSION])?;
        writer.write_all(&(entries.len() as u32).to_le_bytes())?;
        for entry in &entries {
            writer.write_all(entry.scope.as_bytes())?;
            writer.write_all(entry.object_id.as_bytes())?;
            writer.write_all(&entry.bytes.to_le_bytes())?;
            writer.write_all(entry.sha256.as_bytes())?;
            let mut source = File::open(&entry.path)?;
            let copied = copy_io(&mut source, &mut writer)?;
            if copied != entry.bytes
                || fs::metadata(&entry.path)?.len() != entry.bytes
                || sha256_file(&entry.path)? != entry.sha256
            {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    "WhatsApp media object changed while the backup pack was created",
                ));
            }
        }
        writer.flush()?;
        writer.get_ref().sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        drop(writer);
        let _ = fs::remove_file(target);
        return result.map(|_| false);
    }
    drop(writer);
    validate_whatsapp_media_pack(target, registry)?;
    Ok(true)
}

fn read_whatsapp_media_pack_metadata<R: Read>(
    reader: &mut R,
    expected_scopes: &BTreeMap<String, String>,
    seen: &mut BTreeSet<(String, String)>,
    previous: &mut Option<(String, String)>,
) -> Result<WhatsAppMediaPackEntry, IoError> {
    let mut scope_bytes = [0_u8; 64];
    let mut object_bytes = [0_u8; 64];
    let mut size_bytes = [0_u8; 8];
    let mut digest_bytes = [0_u8; 64];
    reader.read_exact(&mut scope_bytes)?;
    reader.read_exact(&mut object_bytes)?;
    reader.read_exact(&mut size_bytes)?;
    reader.read_exact(&mut digest_bytes)?;
    let scope = std::str::from_utf8(&scope_bytes)
        .map_err(|_| IoError::new(ErrorKind::InvalidData, "WhatsApp media pack scope is invalid"))?
        .to_owned();
    let object_id = std::str::from_utf8(&object_bytes)
        .map_err(|_| IoError::new(ErrorKind::InvalidData, "WhatsApp media pack object identity is invalid"))?
        .to_owned();
    let sha256 = std::str::from_utf8(&digest_bytes)
        .map_err(|_| IoError::new(ErrorKind::InvalidData, "WhatsApp media pack digest is invalid"))?
        .to_owned();
    let bytes = u64::from_le_bytes(size_bytes);
    if !expected_scopes.contains_key(&scope)
        || !valid_lower_hex_64(&scope)
        || !valid_lower_hex_64(&object_id)
        || !valid_lower_hex_64(&sha256)
        || bytes < 42
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media pack entry metadata is malformed",
        ));
    }
    let identity = (scope.clone(), object_id.clone());
    if previous.as_ref().is_some_and(|prior| prior >= &identity) || !seen.insert(identity.clone()) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media pack entries are duplicated or not canonical",
        ));
    }
    *previous = Some(identity);
    Ok(WhatsAppMediaPackEntry {
        scope,
        object_id,
        bytes,
        sha256,
    })
}

fn read_whatsapp_media_pack_header<R: Read>(reader: &mut R) -> Result<usize, IoError> {
    let mut magic = [0_u8; 8];
    let mut version = [0_u8; 1];
    let mut count = [0_u8; 4];
    reader.read_exact(&mut magic)?;
    reader.read_exact(&mut version)?;
    reader.read_exact(&mut count)?;
    let count = u32::from_le_bytes(count) as usize;
    if &magic != WHATSAPP_MEDIA_PACK_MAGIC
        || version[0] != WHATSAPP_MEDIA_PACK_VERSION
        || count == 0
        || count > MAX_WHATSAPP_MEDIA_OBJECTS
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media backup pack header is malformed",
        ));
    }
    Ok(count)
}

fn validate_whatsapp_media_pack(
    path: &Path,
    registry: &ShopRegistry,
) -> Result<WhatsAppMediaTreeStats, IoError> {
    reject_symlink_if_present(path)?;
    let mut reader = BufReader::new(File::open(path)?);
    let count = read_whatsapp_media_pack_header(&mut reader)?;
    let expected_scopes = expected_whatsapp_media_scopes(registry)?;
    let mut seen = BTreeSet::new();
    let mut previous = None;
    let mut entries = Vec::with_capacity(count);
    let mut scratch = vec![0_u8; 64 * 1024];
    for _ in 0..count {
        let entry = read_whatsapp_media_pack_metadata(
            &mut reader,
            &expected_scopes,
            &mut seen,
            &mut previous,
        )?;
        let mut hasher = Sha256::new();
        let mut remaining = entry.bytes;
        while remaining > 0 {
            let take = remaining.min(scratch.len() as u64) as usize;
            reader.read_exact(&mut scratch[..take])?;
            hasher.update(&scratch[..take]);
            remaining -= take as u64;
        }
        if hex_encode(&hasher.finalize()) != entry.sha256 {
            clear_bytes(&mut scratch);
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media backup pack object digest does not match",
            ));
        }
        entries.push(entry);
    }
    clear_bytes(&mut scratch);
    let mut trailing = [0_u8; 1];
    if reader.read(&mut trailing)? != 0 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media backup pack has trailing bytes",
        ));
    }
    whatsapp_media_tree_stats_from_pack_entries(&entries)
}

fn extract_whatsapp_media_pack(
    pack: &Path,
    target_root: &Path,
    registry: &ShopRegistry,
) -> Result<WhatsAppMediaTreeStats, IoError> {
    if target_root.exists() {
        reject_symlink_if_present(target_root)?;
        if fs::read_dir(target_root)?.next().is_some() {
            return Err(IoError::new(
                ErrorKind::AlreadyExists,
                "staged WhatsApp media root is not empty",
            ));
        }
    } else {
        fs::create_dir_all(target_root)?;
    }
    let expected_scopes = expected_whatsapp_media_scopes(registry)?;
    let mut reader = BufReader::new(File::open(pack)?);
    let count = read_whatsapp_media_pack_header(&mut reader)?;
    let mut seen = BTreeSet::new();
    let mut previous = None;
    let mut entries = Vec::with_capacity(count);
    let result = (|| -> Result<(), IoError> {
        for _ in 0..count {
            let entry = read_whatsapp_media_pack_metadata(
                &mut reader,
                &expected_scopes,
                &mut seen,
                &mut previous,
            )?;
            let scope_root = target_root.join(&entry.scope);
            fs::create_dir_all(&scope_root)?;
            reject_symlink_if_present(&scope_root)?;
            let target = scope_root.join(format!("{}.sfmedia", entry.object_id));
            let file = OpenOptions::new().write(true).create_new(true).open(&target)?;
            let mut writer = BufWriter::new(file);
            let mut limited = reader.by_ref().take(entry.bytes);
            let copied = copy_io(&mut limited, &mut writer)?;
            writer.flush()?;
            writer.get_ref().sync_all()?;
            drop(writer);
            if copied != entry.bytes || sha256_file(&target)? != entry.sha256 {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    "restored WhatsApp media object failed pack digest verification",
                ));
            }
            validate_whatsapp_media_object_file(&target)?;
            entries.push(entry);
        }
        let mut trailing = [0_u8; 1];
        if reader.read(&mut trailing)? != 0 {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media backup pack has trailing bytes",
            ));
        }
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(target_root);
        return Err(error);
    }
    sync_tree(target_root)?;
    let expected = whatsapp_media_tree_stats_from_pack_entries(&entries)?;
    let observed = whatsapp_media_tree_stats(target_root, registry)?;
    if observed != expected {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "staged WhatsApp media tree disagrees with the authenticated pack",
        ));
    }
    Ok(observed)
}

fn copy_whatsapp_media_tree(
    source_root: &Path,
    target_root: &Path,
    registry: &ShopRegistry,
) -> Result<WhatsAppMediaTreeStats, IoError> {
    let entries = whatsapp_media_tree_entries(source_root, registry)?;
    if target_root.exists() {
        return Err(IoError::new(
            ErrorKind::AlreadyExists,
            "WhatsApp media copy target already exists",
        ));
    }
    fs::create_dir_all(target_root)?;
    let result = (|| -> Result<(), IoError> {
        for entry in &entries {
            let scope_root = target_root.join(&entry.scope);
            fs::create_dir_all(&scope_root)?;
            let target = scope_root.join(format!("{}.sfmedia", entry.object_id));
            copy_file_verified(&entry.path, &target)?;
            validate_whatsapp_media_object_file(&target)?;
        }
        sync_tree(target_root)
    })();
    if let Err(error) = result {
        let _ = fs::remove_dir_all(target_root);
        return Err(error);
    }
    let source_stats = whatsapp_media_tree_stats(source_root, registry)?;
    let target_stats = whatsapp_media_tree_stats(target_root, registry)?;
    if source_stats != target_stats {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "verified WhatsApp media tree copy changed its source",
        ));
    }
    Ok(target_stats)
}

fn replace_whatsapp_media_tree(
    source_root: &Path,
    live_root: &Path,
    registry: &ShopRegistry,
    expected: &WhatsAppMediaTreeStats,
) -> Result<(), IoError> {
    if whatsapp_media_tree_stats(source_root, registry)? != *expected {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media replacement source digest does not match",
        ));
    }
    let parent = live_root.parent().ok_or_else(|| {
        IoError::new(ErrorKind::InvalidInput, "WhatsApp media root has no parent")
    })?;
    fs::create_dir_all(parent)?;
    reject_symlink_if_present(parent)?;
    let temporary = parent.join(format!(".whatsapp-media.restore-{}", random_hex(8)?));
    let copied = copy_whatsapp_media_tree(source_root, &temporary, registry)?;
    if copied != *expected {
        let _ = fs::remove_dir_all(&temporary);
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "WhatsApp media replacement staging changed its source",
        ));
    }
    if live_root.exists() {
        reject_symlink_if_present(live_root)?;
        fs::remove_dir_all(live_root)?;
    }
    if let Err(error) = fs::rename(&temporary, live_root) {
        let _ = fs::remove_dir_all(&temporary);
        return Err(error);
    }
    sync_parent_directory(live_root)?;
    if whatsapp_media_tree_stats(live_root, registry)? != *expected {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "restored WhatsApp media tree failed final digest verification",
        ));
    }
    Ok(())
}

fn remove_whatsapp_media_tree_if_present(app_data_dir: &Path) -> Result<(), IoError> {
    let root = whatsapp_media_root(app_data_dir);
    if root.exists() {
        reject_symlink_if_present(&root)?;
        fs::remove_dir_all(&root)?;
        sync_parent_directory(&root)?;
    }
    Ok(())
}

#[cfg(test)]
mod whatsapp_media_survivability_tests {
    use super::*;

    #[test]
    fn scope_hash_matches_typescript_contract() {
        let observed = whatsapp_media_scope_hash(
            "workspace-test",
            "shop-test",
            "incarnation-test",
        )
        .expect("scope hash");
        assert_eq!(
            observed,
            "bd0e9ddacb1f7c6f3121d2694693271397bab1c56a0378c196d8b5acce12623f"
        );
    }
}
