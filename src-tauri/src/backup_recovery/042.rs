

fn rollback_to_rescue(
    app_data_dir: &Path,
    installation_root: &InstallationRootKey,
    local_identity: &InstallationIdentity,
    target_identity: &InstallationIdentity,
    observed_identity: &InstallationIdentity,
    journal: &RestoreJournal,
) -> Result<(), IoError> {
    let rescue = validated_restore_directory(
        &restore_rescue_root(app_data_dir),
        &journal.unsigned.rescue_directory,
        true,
    )?;
    let manifest: RescueManifest =
        read_json_limited(&rescue.join("rescue-manifest.json"), MAX_JSON_BYTES)?;
    validate_rescue(app_data_dir, &rescue, &manifest, journal)?;

    if observed_identity == target_identity {
        installation_identity_rebind::rebind_installation_root_identity(
            &system_dir(app_data_dir),
            target_identity,
            local_identity,
            installation_root,
        )
        .map_err(|error| IoError::other(error.to_string()))?;
    } else if observed_identity != local_identity {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "cannot roll back a restore under an unknown root identity",
        ));
    }

    let shops_dir = app_data_dir.join("shops");
    fs::create_dir_all(&shops_dir)?;
    let rescue_files = manifest
        .databases
        .iter()
        .map(|database| database.database_file.clone())
        .collect::<BTreeSet<_>>();
    if let Ok(current) = read_registry_relaxed(app_data_dir) {
        for shop in current.shops {
            if !rescue_files.contains(&shop.database_file) {
                remove_sqlite_file_set(&shops_dir.join(shop.database_file))?;
            }
        }
    }
    for database in &manifest.databases {
        let source = safe_relative_path(&rescue, &database.rescue_file)?;
        let target = shops_dir.join(&database.database_file);
        replace_from_verified_source(&source, &target, &database.sha256)?;
        remove_sqlite_sidecars(&target)?;
        preflight_database(&target)?;
    }
    replace_from_verified_source(
        &rescue.join(&manifest.registry_file),
        &app_data_dir.join(REGISTRY_FILE),
        &manifest.registry_sha256,
    )?;
    match (&manifest.brk_authority_file, &manifest.brk_authority_sha256) {
        (Some(file), Some(digest)) => replace_from_verified_source(
            &rescue.join(file),
            &brk_authority_path(app_data_dir),
            digest,
        )?,
        (None, None) => remove_file_if_present(&brk_authority_path(app_data_dir))?,
        _ => unreachable!("validated rescue authority metadata"),
    }
    restore_optional_rescue_authority(
        app_data_dir,
        &rescue,
        &manifest.identity_authority_file,
        &manifest.identity_authority_sha256,
        IDENTITY_AUTHORITY_FILE,
    )?;
    restore_optional_rescue_authority(
        app_data_dir,
        &rescue,
        &manifest.identity_marker_file,
        &manifest.identity_marker_sha256,
        IDENTITY_MARKER_FILE,
    )?;
    let registry = read_registry(app_data_dir)?;
    if registry.workspace_id != local_identity.workspace_id
        || registry.installation_id != local_identity.installation_id
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "rollback registry failed identity verification",
        ));
    }
    Ok(())
}