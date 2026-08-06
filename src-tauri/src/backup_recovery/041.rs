

fn apply_staged_restore(
    app_data_dir: &Path,
    installation_root: &InstallationRootKey,
    local_identity: &InstallationIdentity,
    target_identity: &InstallationIdentity,
    journal: &RestoreJournal,
    staged: &StagedRestoreManifest,
    staging: &Path,
) -> Result<(), IoError> {
    let target_registry: ShopRegistry =
        read_json_limited(&staging.join(&staged.target_registry_file), MAX_JSON_BYTES)?;
    // Rebind the protected local root before any live database or registry
    // replacement. The restore journal is already durably in `applying`, so a
    // termination after this point can always identify the target-bound root
    // and deterministically roll it back to the rescued local generation.
    installation_identity_rebind::rebind_installation_root_identity(
        &system_dir(app_data_dir),
        local_identity,
        target_identity,
        installation_root,
    )
    .map_err(|error| IoError::other(error.to_string()))?;

    let shops_dir = app_data_dir.join("shops");
    fs::create_dir_all(&shops_dir)?;
    reject_symlink_if_present(&shops_dir)?;

    let mut applied_shop_count = 0_usize;
    for object in &staged.staged_objects {
        let source = safe_relative_path(staging, &object.staged_file)?;
        let target = shops_dir.join(&object.database_file);
        replace_from_verified_source(&source, &target, &object.sha256)?;
        remove_sqlite_sidecars(&target)?;
        preflight_database(&target)?;
        applied_shop_count += 1;
        maybe_interrupt_phase4_restore_after_shop(applied_shop_count);
    }

    let current_files = read_registry_relaxed(app_data_dir)
        .map(|registry| {
            registry
                .shops
                .into_iter()
                .map(|shop| shop.database_file)
                .collect::<BTreeSet<_>>()
        })
        .unwrap_or_default();
    let target_files = target_registry
        .shops
        .iter()
        .map(|shop| shop.database_file.clone())
        .collect::<BTreeSet<_>>();
    for obsolete in current_files.difference(&target_files) {
        remove_sqlite_file_set(&shops_dir.join(obsolete))?;
    }

    write_json_atomic(&app_data_dir.join(REGISTRY_FILE), &target_registry)?;
    replace_from_verified_source(
        &staging.join(&staged.target_brk_authority_file),
        &brk_authority_path(app_data_dir),
        &sha256_file(&staging.join(&staged.target_brk_authority_file))?,
    )?;
    // Identity/device/session authority is installation-local and is never
    // cloned from the source device. The restored PIN/auth secret remains in
    // the shop database, while the next successful PIN proof re-enrolls a new
    // local owner/device authority for the restored workspace.
    remove_file_if_present(&system_dir(app_data_dir).join(IDENTITY_AUTHORITY_FILE))?;
    remove_file_if_present(&system_dir(app_data_dir).join(IDENTITY_MARKER_FILE))?;
    remove_file_if_present(&system_dir(app_data_dir).join("identity-authority.lock"))?;
    let observed = read_registry(app_data_dir)?;
    if observed.workspace_id != target_identity.workspace_id
        || observed.installation_id != target_identity.installation_id
        || observed.shops.len() != staged.staged_objects.len()
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "restored registry failed final identity verification",
        ));
    }
    for object in &staged.staged_objects {
        let path = shops_dir.join(&object.database_file);
        preflight_database(&path)?;
        if sha256_file(&path)? != object.sha256 {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "restored database changed during cutover",
            ));
        }
    }
    let _ = journal;
    sync_directory(&shops_dir)?;
    Ok(())
}
