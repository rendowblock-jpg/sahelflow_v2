pub(crate) fn delete_backup(
    app_data_dir: &Path,
    download_dir: &Path,
    document_dir: &Path,
    installation_root: &[u8; 32],
    authority: &BackupAuthority,
    backup_id: &str,
) -> Result<(), IoError> {
    validate_backup_id(backup_id)?;
    let _lock = FileLock::acquire(&system_dir(app_data_dir).join(BACKUP_LOCK_FILE))?;
    if let Some(journal) = read_pending_restore_unverified(app_data_dir)? {
        if journal.unsigned.backup_id == backup_id
            && !matches!(
                journal.unsigned.state,
                RestoreJournalState::Committed | RestoreJournalState::RolledBack
            )
        {
            return Err(IoError::new(
                ErrorKind::WouldBlock,
                "backup is referenced by a pending replacement restore",
            ));
        }
    }
    let root = backup_root(download_dir)?;
    let path = root.join(format!("{backup_id}{BACKUP_SUFFIX}"));
    let metadata = fs::symlink_metadata(&path)
        .map_err(|error| IoError::new(error.kind(), format!("backup is unavailable: {error}")))?;
    if path_is_link(&metadata) || !metadata.is_dir() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup path is not a contained directory",
        ));
    }
    let descriptor_path = path.join(DESCRIPTOR_FILE);
    let descriptor_digest =
        sha256_file(&descriptor_path).unwrap_or_else(|_| "unreadable".to_owned());
    // Deletion must remain available for a corrupt/tampered container, but its
    // durable receipt must not trust attacker-controlled descriptor metadata.
    // Record the backup workspace only after the local BRK authenticates the
    // descriptor, wrapped DEK, encrypted manifest and ciphertext digests.
    let authenticated_workspace = (|| -> Result<String, IoError> {
        let descriptor: BackupDescriptor = read_json_limited(&descriptor_path, MAX_JSON_BYTES)?;
        validate_descriptor(&descriptor)?;
        if descriptor.backup_id != backup_id {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "backup descriptor identity does not match the deletion request",
            ));
        }
        if descriptor.workspace_id != authority.workspace_id
            || descriptor.source_installation_id != authority.installation_id
        {
            return Err(survivability_permission_failure(
                SurvivabilityPermissionReason::ReplacementAuthority,
                "backup requires replacement-install recovery authority",
            ));
        }
        let root = backup_root(download_dir)?;
        let kit_root = recovery_kit_root(document_dir)?;
        let opened = open_backup(
            app_data_dir,
            &root,
            &kit_root,
            installation_root,
            authority,
            backup_id,
            None,
        )?;
        Ok(opened.descriptor.workspace_id.clone())
    })()
    .unwrap_or_default();
    let started_at_unix_ms = now_unix_ms()?;
    let mut unsigned = BackupDeletionReceiptUnsigned {
        format_version: 1,
        state: "prepared".to_owned(),
        backup_id: backup_id.to_owned(),
        backup_workspace_id: authenticated_workspace,
        actor_workspace_id: authority.workspace_id.clone(),
        installation_id: authority.installation_id.clone(),
        descriptor_sha256: descriptor_digest,
        started_at_unix_ms,
        completed_at_unix_ms: None,
    };
    write_backup_deletion_receipt(app_data_dir, installation_root, &unsigned)?;
    fs::remove_dir_all(&path)?;
    sync_directory(&root)?;
    unsigned.state = "deleted".to_owned();
    unsigned.completed_at_unix_ms = Some(now_unix_ms()?);
    write_backup_deletion_receipt(app_data_dir, installation_root, &unsigned)
}
