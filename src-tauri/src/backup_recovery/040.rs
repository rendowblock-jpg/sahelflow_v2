

fn validate_rescue(
    _app_data_dir: &Path,
    rescue: &Path,
    manifest: &RescueManifest,
    journal: &RestoreJournal,
) -> Result<(), IoError> {
    if manifest.local_workspace_id != journal.unsigned.local_workspace_id
        || manifest.installation_id != journal.unsigned.installation_id
        || manifest.databases.is_empty()
        || manifest.databases.len() > MAX_SHOPS
        || manifest.registry_file != "shop-registry.json"
        || sha256_file(&rescue.join(&manifest.registry_file))? != manifest.registry_sha256
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "restore rescue manifest is invalid",
        ));
    }
    let registry: ShopRegistry =
        read_json_limited(&rescue.join(&manifest.registry_file), MAX_JSON_BYTES)?;
    validate_target_registry(&registry)?;
    if registry.workspace_id != manifest.local_workspace_id
        || registry.installation_id != manifest.installation_id
        || registry.shops.len() != manifest.databases.len()
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "rescue registry disagrees with its manifest",
        ));
    }
    for database in &manifest.databases {
        if !valid_database_file(&database.database_file)
            || database.rescue_file != format!("shops/{}", database.database_file)
        {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "rescue database identity is invalid",
            ));
        }
        let path = safe_relative_path(rescue, &database.rescue_file)?;
        preflight_database(&path)?;
        if sha256_file(&path)? != database.sha256 {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "rescue database digest does not match",
            ));
        }
    }
    match (&manifest.brk_authority_file, &manifest.brk_authority_sha256) {
        (Some(file), Some(digest)) if file == "backup-recovery-key.current.json" => {
            if sha256_file(&rescue.join(file))? != *digest {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    "rescue backup recovery key authority digest does not match",
                ));
            }
        }
        (None, None) => {}
        _ => {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "rescue backup recovery key authority metadata is invalid",
            ));
        }
    }
    validate_optional_rescue_authority(
        rescue,
        &manifest.identity_authority_file,
        &manifest.identity_authority_sha256,
        IDENTITY_AUTHORITY_FILE,
    )?;
    validate_optional_rescue_authority(
        rescue,
        &manifest.identity_marker_file,
        &manifest.identity_marker_sha256,
        IDENTITY_MARKER_FILE,
    )?;
    Ok(())
}