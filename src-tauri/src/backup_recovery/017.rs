

fn matching_recovery_kit_exists(
    app_data_dir: &Path,
    kit_root: &Path,
    local_brk: Option<&SecretKey>,
    workspace_id: &str,
    source_installation_id: &str,
    brk_id: &str,
) -> Result<bool, IoError> {
    let Some(local_brk) = local_brk else {
        return Ok(false);
    };
    if key_id(local_brk.as_array()) != brk_id || !kit_root.exists() {
        return Ok(false);
    }
    reject_symlink_if_present(kit_root)?;
    for entry in fs::read_dir(kit_root)? {
        let entry = entry?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !name.ends_with(KIT_SUFFIX) {
            continue;
        }
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)?;
        if path_is_link(&metadata) || !metadata.is_file() {
            continue;
        }
        let document = match read_json_limited::<RecoveryKitDocument>(&path, MAX_JSON_BYTES) {
            Ok(document) => document,
            Err(_) => continue,
        };
        if validate_recovery_kit_document(&document).is_err()
            || document.workspace_id != workspace_id
            || document.source_installation_id != source_installation_id
            || document.brk_id != brk_id
        {
            continue;
        }
        let digest = match sha256_file(&path) {
            Ok(digest) => digest,
            Err(_) => continue,
        };
        if recovery_kit_receipt_matches(
            app_data_dir,
            local_brk.as_array(),
            &document,
            &digest,
        )? {
            return Ok(true);
        }
    }
    Ok(false)
}