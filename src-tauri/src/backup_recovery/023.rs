

pub(crate) fn list_backups(
    app_data_dir: &Path,
    download_dir: &Path,
    document_dir: &Path,
    installation_root: &[u8; 32],
    authority: &BackupAuthority,
) -> Result<Vec<BackupSummary>, IoError> {
    let _lock = FileLock::acquire(&system_dir(app_data_dir).join(BACKUP_LOCK_FILE))?;
    let root = backup_root(download_dir)?;
    let kit_root = recovery_kit_root(document_dir)?;
    remove_stale_staging(&root)?;
    let local_brk = load_local_brk(
        app_data_dir,
        installation_root,
        &authority.workspace_id,
        &authority.installation_id,
    )?;
    let mut summaries = Vec::new();
    for entry in fs::read_dir(&root)? {
        let entry = entry?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !name.ends_with(BACKUP_SUFFIX) || name.starts_with('.') {
            continue;
        }
        let backup_id_from_name = name.trim_end_matches(BACKUP_SUFFIX);
        if validate_backup_id(backup_id_from_name).is_err() {
            continue;
        }
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)?;
        if path_is_link(&metadata) || !metadata.is_dir() {
            continue;
        }
        let descriptor_result = read_json_limited::<BackupDescriptor>(
            &path.join(DESCRIPTOR_FILE),
            MAX_JSON_BYTES,
        )
        .and_then(|descriptor| {
            validate_descriptor(&descriptor)?;
            if name != format!("{}{BACKUP_SUFFIX}", descriptor.backup_id) {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    "backup directory identity does not match its descriptor",
                ));
            }
            Ok(descriptor)
        });
        match descriptor_result {
            Ok(descriptor) => {
                let requires_recovery_kit = local_brk
                    .as_ref()
                    .map_or(true, |(_, local_id)| {
                        descriptor.workspace_id != authority.workspace_id
                            || descriptor.source_installation_id != authority.installation_id
                            || descriptor.brk_id != *local_id
                    });
                // A local backup is listed as verified only after its BRK
                // authenticates the descriptor/wrapped DEK/manifest and every
                // ciphertext object digest. Replacement backups remain opaque
                // until the independent kit is supplied during restore.
                let status = if requires_recovery_kit {
                    "recovery-kit-required"
                } else {
                    match open_backup(
                        app_data_dir,
                        &root,
                        &kit_root,
                        installation_root,
                        authority,
                        &descriptor.backup_id,
                        None,
                    ) {
                        Ok(_) => "verified",
                        Err(_) => "corrupt",
                    }
                };
                let matching_local_brk = local_brk.as_ref().and_then(|(brk, local_id)| {
                    (local_id == &descriptor.brk_id).then_some(brk)
                });
                let independent_recovery_ready = matching_recovery_kit_exists(
                    app_data_dir,
                    &kit_root,
                    matching_local_brk,
                    &descriptor.workspace_id,
                    &descriptor.source_installation_id,
                    &descriptor.brk_id,
                )?;
                summaries.push(BackupSummary {
                    backup_id: descriptor.backup_id,
                    created_at_unix_ms: descriptor.created_at_unix_ms,
                    verified_at_unix_ms: descriptor.verified_at_unix_ms,
                    retention_class: descriptor.retention_class,
                    pinned: descriptor.pinned,
                    workspace_id: descriptor.workspace_id,
                    source_installation_id: descriptor.source_installation_id,
                    shop_count: descriptor.shop_count,
                    plaintext_bytes: descriptor.plaintext_bytes,
                    container_bytes: directory_size(&path)?,
                    status: status.to_owned(),
                    location: path.to_string_lossy().into_owned(),
                    requires_recovery_kit,
                    independent_recovery_ready,
                });
            }
            Err(_) => {
                let backup_id = name.trim_end_matches(BACKUP_SUFFIX).to_owned();
                summaries.push(BackupSummary {
                    backup_id,
                    created_at_unix_ms: 0,
                    verified_at_unix_ms: 0,
                    retention_class: "unknown".to_owned(),
                    pinned: false,
                    workspace_id: String::new(),
                    source_installation_id: String::new(),
                    shop_count: 0,
                    plaintext_bytes: 0,
                    container_bytes: directory_size(&path).unwrap_or(0),
                    status: "corrupt".to_owned(),
                    location: path.to_string_lossy().into_owned(),
                    requires_recovery_kit: true,
                    independent_recovery_ready: false,
                });
            }
        }
    }
    summaries.sort_by(|left, right| {
        right
            .created_at_unix_ms
            .cmp(&left.created_at_unix_ms)
            .then_with(|| right.backup_id.cmp(&left.backup_id))
    });
    Ok(summaries)
}