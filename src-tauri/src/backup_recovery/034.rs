

fn write_brk_authority(
    path: &Path,
    installation_root: &[u8; 32],
    workspace_id: &str,
    installation_id: &str,
    brk: &[u8; 32],
) -> Result<(), IoError> {
    let wrapping = derive_installation_key(
        installation_root,
        workspace_id,
        installation_id,
        PURPOSE_BACKUP_RECOVERY_WRAP,
        1,
    )?;
    let brk_id = key_id(brk);
    let created_at_unix_ms = now_unix_ms()?;
    let wrapped_brk = seal(
        &wrapping.key,
        BRK_WRAP_CONTEXT,
        &brk_aad(
            workspace_id,
            installation_id,
            &brk_id,
            &wrapping.key_id,
            created_at_unix_ms,
        ),
        brk,
    )?;
    write_json_atomic(
        path,
        &BrkAuthorityDocument {
            format_version: BRK_AUTHORITY_FORMAT_VERSION,
            algorithm: "aes-256-gcm".to_owned(),
            workspace_id: workspace_id.to_owned(),
            installation_id: installation_id.to_owned(),
            brk_id,
            wrapping_key_id: wrapping.key_id,
            wrapped_brk,
            created_at_unix_ms,
        },
    )
}

fn restore_journal_mac(
    installation_root: &[u8; 32],
    unsigned: &RestoreJournalUnsigned,
) -> Result<[u8; 32], IoError> {
    let derived = derive_installation_key(
        installation_root,
        &unsigned.local_workspace_id,
        &unsigned.installation_id,
        PURPOSE_MIGRATION_JOURNAL,
        1,
    )?;
    let payload = serde_json::to_vec(unsigned).map_err(|error| {
        IoError::other(format!("restore journal serialization failed: {error}"))
    })?;
    Ok(hmac_sha256(
        &derived.key,
        &frame(RESTORE_JOURNAL_MAC_DOMAIN, &[payload.as_slice()]),
    ))
}

fn write_restore_journal(
    app_data_dir: &Path,
    installation_root: &[u8; 32],
    unsigned: RestoreJournalUnsigned,
) -> Result<(), IoError> {
    let mac_hex = hex_encode(&restore_journal_mac(installation_root, &unsigned)?);
    write_json_atomic(
        &pending_restore_path(app_data_dir),
        &RestoreJournal { unsigned, mac_hex },
    )
}

fn read_pending_restore_unverified(
    app_data_dir: &Path,
) -> Result<Option<RestoreJournal>, IoError> {
    let path = pending_restore_path(app_data_dir);
    if !path.exists() {
        return Ok(None);
    }
    read_json_limited(&path, MAX_JSON_BYTES).map(Some)
}