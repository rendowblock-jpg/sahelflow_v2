

fn recovery_kit_receipt_path(app_data_dir: &Path, kit_id: &str) -> Result<PathBuf, IoError> {
    validate_kit_id(kit_id)?;
    Ok(system_dir(app_data_dir)
        .join(RECOVERY_KIT_RECEIPTS_DIRECTORY)
        .join(format!("{kit_id}.json")))
}

fn recovery_kit_receipt_key(
    brk: &[u8; 32],
    workspace_id: &str,
    brk_id: &str,
) -> [u8; 32] {
    let salt = sha256(&[
        RECOVERY_KIT_RECEIPT_KEY_SALT_DOMAIN,
        workspace_id.as_bytes(),
        brk_id.as_bytes(),
    ]);
    let info = frame(
        RECOVERY_KIT_RECEIPT_KEY_INFO_DOMAIN,
        &[workspace_id.as_bytes(), brk_id.as_bytes()],
    );
    hkdf_sha256(brk, &salt, &info)
}

fn recovery_kit_receipt_mac(
    brk: &[u8; 32],
    unsigned: &RecoveryKitVerificationReceiptUnsigned,
) -> Result<String, IoError> {
    if key_id(brk) != unsigned.brk_id {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "recovery kit receipt BRK does not match its authority",
        ));
    }
    let mut key = recovery_kit_receipt_key(brk, &unsigned.workspace_id, &unsigned.brk_id);
    let encoded = serde_json::to_vec(unsigned).map_err(|error| {
        IoError::other(format!("recovery kit receipt serialization failed: {error}"))
    })?;
    let mac = hmac_sha256(
        &key,
        &frame(RECOVERY_KIT_RECEIPT_MAC_DOMAIN, &[&encoded]),
    );
    clear_bytes(&mut key);
    Ok(hex_encode(&mac))
}

fn write_recovery_kit_receipt(
    path: &Path,
    brk: &[u8; 32],
    unsigned: &RecoveryKitVerificationReceiptUnsigned,
) -> Result<(), IoError> {
    write_json_atomic(
        path,
        &RecoveryKitVerificationReceipt {
            unsigned: unsigned.clone(),
            mac_hex: recovery_kit_receipt_mac(brk, unsigned)?,
        },
    )
}