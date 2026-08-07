

fn read_restore_journal(
    app_data_dir: &Path,
    installation_root: &[u8; 32],
) -> Result<RestoreJournal, IoError> {
    let journal = read_pending_restore_unverified(app_data_dir)?.ok_or_else(|| {
        IoError::new(ErrorKind::NotFound, "pending restore journal is missing")
    })?;
    if journal.unsigned.format_version != RESTORE_JOURNAL_FORMAT_VERSION
        || !is_identity(&journal.unsigned.local_workspace_id)
        || !is_identity(&journal.unsigned.target_workspace_id)
        || !is_identity(&journal.unsigned.installation_id)
        || journal.unsigned.restore_id != journal.unsigned.staging_directory
        || journal.unsigned.restore_id != journal.unsigned.rescue_directory
        || journal.unsigned.manifest_sha256.len() != 64
        || !journal
            .unsigned
            .manifest_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "pending restore journal is malformed",
        ));
    }
    validate_restore_id(&journal.unsigned.restore_id)?;
    validate_backup_id(&journal.unsigned.backup_id)?;
    let supplied = hex_decode_exact::<32>(&journal.mac_hex, "restore journal MAC")?;
    let expected = restore_journal_mac(installation_root, &journal.unsigned)?;
    if !constant_time_equal(&supplied, &expected) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "pending restore journal failed authentication",
        ));
    }
    Ok(journal)
}