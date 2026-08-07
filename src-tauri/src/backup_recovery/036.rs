

fn validate_staged_restore(
    staged: &StagedRestoreManifest,
    journal: &RestoreJournal,
    staging: &Path,
) -> Result<(), IoError> {
    if staged.restore_id != journal.unsigned.restore_id
        || staged.backup_id != journal.unsigned.backup_id
        || !is_identity(&staged.source.workspace_id)
        || !is_identity(&staged.source.source_installation_id)
        || staged.source.workspace_id != journal.unsigned.target_workspace_id
        || staged.source.app_version.trim().is_empty()
        || staged.source.app_version.len() > 128
        || staged.source.runtime_protocol_version == 0
        || staged.source.runtime_protocol_version > SUPPORTED_RUNTIME_PROTOCOL_VERSION
        || staged.source.schema_epoch == 0
        || staged.source.schema_epoch > SUPPORTED_SCHEMA_EPOCH
        || staged.source.migration_set_sha256.len() != 64
        || !staged
            .source
            .migration_set_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
        || staged.source.shop_count == 0
        || staged.source.shop_count > MAX_BACKUP_OBJECTS
        || staged.source.shop_count != staged.staged_objects.len()
        || staged.target_registry_file != "target-registry.json"
        || staged.target_brk_authority_file != "target-backup-recovery-key.json"
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "staged restore manifest disagrees with its journal",
        ));
    }
    let target_registry: ShopRegistry =
        read_json_limited(&staging.join(&staged.target_registry_file), MAX_JSON_BYTES)?;
    validate_target_registry(&target_registry)?;
    if target_registry.workspace_id != journal.unsigned.target_workspace_id
        || target_registry.installation_id != journal.unsigned.installation_id
        || target_registry.shops.len() != staged.staged_objects.len()
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "staged target registry disagrees with the restore journal",
        ));
    }
    let mut shops = BTreeSet::new();
    for object in &staged.staged_objects {
        if !shops.insert(object.shop_id.clone())
            || !valid_shop_id(&object.shop_id)
            || !valid_database_file(&object.database_file)
            || object.staged_file != format!("shops/{}", object.database_file)
            || object.sha256.len() != 64
            || !object.sha256.bytes().all(|byte| byte.is_ascii_hexdigit())
        {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "staged restore object metadata is invalid",
            ));
        }
        let path = safe_relative_path(staging, &object.staged_file)?;
        preflight_database(&path)?;
        if fs::metadata(&path)?.len() != object.bytes || sha256_file(&path)? != object.sha256 {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "staged restore database failed verification",
            ));
        }
    }
    let brk_path = safe_relative_path(staging, &staged.target_brk_authority_file)?;
    if !brk_path.is_file() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "staged backup recovery key authority is missing",
        ));
    }
    Ok(())
}