

fn backup_deletion_receipt_mac(
    installation_root: &[u8; 32],
    unsigned: &BackupDeletionReceiptUnsigned,
) -> Result<String, IoError> {
    let key = derive_installation_key(
        installation_root,
        &unsigned.actor_workspace_id,
        &unsigned.installation_id,
        PURPOSE_MIGRATION_JOURNAL,
        1,
    )?;
    let encoded = serde_json::to_vec(unsigned).map_err(|error| {
        IoError::other(format!("backup deletion receipt serialization failed: {error}"))
    })?;
    Ok(hex_encode(&hmac_sha256(
        &key.key,
        &frame(BACKUP_DELETION_RECEIPT_MAC_DOMAIN, &[&encoded]),
    )))
}

fn write_backup_deletion_receipt(
    app_data_dir: &Path,
    installation_root: &[u8; 32],
    unsigned: &BackupDeletionReceiptUnsigned,
) -> Result<(), IoError> {
    let path = app_data_dir
        .join("recovery-journal")
        .join(BACKUP_DELETION_RECEIPT_FILE);
    write_json_atomic(
        &path,
        &BackupDeletionReceipt {
            unsigned: unsigned.clone(),
            mac_hex: backup_deletion_receipt_mac(installation_root, unsigned)?,
        },
    )
}