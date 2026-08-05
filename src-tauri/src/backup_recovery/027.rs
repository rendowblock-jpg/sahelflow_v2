


pub(crate) fn recover_pending_before_startup(
    app_data_dir: &Path,
) -> Result<Option<InstallationIdentity>, IoError> {
    if !pending_restore_present(app_data_dir) {
        return Ok(None);
    }
    let system = system_dir(app_data_dir);
    let protected_identity = installation_root_key::probe_protected_identity(&system)
        .map_err(|error| IoError::other(error.to_string()))?
        .ok_or_else(|| {
            IoError::new(
                ErrorKind::InvalidData,
                "pending restore has no protected installation-root authority",
            )
        })?;
    let prepared = installation_root_key::prepare_installation_root(
        InstallationRootRequest {
            system_dir: &system,
            legacy_master_key_path: &app_data_dir.join("master.key"),
            identity: protected_identity.clone(),
            existing_authority_present: true,
            provably_fresh: false,
        },
    )
    .map_err(|error| IoError::other(error.to_string()))?;
    apply_pending_restore(
        app_data_dir,
        &prepared.root_key,
        &protected_identity,
    )
}

pub(crate) fn pending_restore_present(app_data_dir: &Path) -> bool {
    pending_restore_path(app_data_dir).is_file()
}