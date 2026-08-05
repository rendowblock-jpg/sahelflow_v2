

fn create_rescue(app_data_dir: &Path, journal: &RestoreJournal) -> Result<(), IoError> {
    let rescue_root = restore_rescue_root(app_data_dir);
    fs::create_dir_all(&rescue_root)?;
    reject_symlink_if_present(&rescue_root)?;
    let rescue = rescue_root.join(&journal.unsigned.rescue_directory);
    if rescue.exists() {
        let manifest: RescueManifest = read_json_limited(
            &rescue.join("rescue-manifest.json"),
            MAX_JSON_BYTES,
        )?;
        validate_rescue(app_data_dir, &rescue, &manifest, journal)?;
        return Ok(());
    }
    fs::create_dir(&rescue)?;
    fs::create_dir(rescue.join("shops"))?;
    let registry = read_registry(app_data_dir)?;
    if registry.workspace_id != journal.unsigned.local_workspace_id
        || registry.installation_id != journal.unsigned.installation_id
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "live registry changed before restore rescue was created",
        ));
    }
    let registry_file = "shop-registry.json".to_owned();
    copy_file_verified(
        &app_data_dir.join(REGISTRY_FILE),
        &rescue.join(&registry_file),
    )?;
    let registry_sha256 = sha256_file(&rescue.join(&registry_file))?;
    let mut databases = Vec::with_capacity(registry.shops.len());
    for shop in &registry.shops {
        let rescue_file = format!("shops/{}", shop.database_file);
        let source = app_data_dir.join("shops").join(&shop.database_file);
        let target = rescue.join(&rescue_file);
        create_verified_snapshot(&source, &target)?;
        databases.push(RescueDatabase {
            database_file: shop.database_file.clone(),
            rescue_file,
            sha256: sha256_file(&target)?,
        });
    }
    let (brk_authority_file, brk_authority_sha256) = {
        let source = brk_authority_path(app_data_dir);
        if source.exists() {
            let relative = "backup-recovery-key.current.json".to_owned();
            let target = rescue.join(&relative);
            copy_file_verified(&source, &target)?;
            (Some(relative), Some(sha256_file(&target)?))
        } else {
            (None, None)
        }
    };
    let (identity_authority_file, identity_authority_sha256) =
        copy_optional_rescue_authority(
            &system_dir(app_data_dir).join(IDENTITY_AUTHORITY_FILE),
            &rescue,
            IDENTITY_AUTHORITY_FILE,
        )?;
    let (identity_marker_file, identity_marker_sha256) =
        copy_optional_rescue_authority(
            &system_dir(app_data_dir).join(IDENTITY_MARKER_FILE),
            &rescue,
            IDENTITY_MARKER_FILE,
        )?;
    let manifest = RescueManifest {
        registry_file,
        registry_sha256,
        local_workspace_id: registry.workspace_id,
        installation_id: registry.installation_id,
        brk_authority_file,
        brk_authority_sha256,
        identity_authority_file,
        identity_authority_sha256,
        identity_marker_file,
        identity_marker_sha256,
        databases,
    };
    write_json_atomic(&rescue.join("rescue-manifest.json"), &manifest)?;
    sync_tree(&rescue)
}