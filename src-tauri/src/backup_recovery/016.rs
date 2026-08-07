

fn recovery_kit_receipt_matches(
    app_data_dir: &Path,
    brk: &[u8; 32],
    document: &RecoveryKitDocument,
    kit_sha256: &str,
) -> Result<bool, IoError> {
    let path = recovery_kit_receipt_path(app_data_dir, &document.kit_id)?;
    if !path.exists() {
        return Ok(false);
    }
    let receipt: RecoveryKitVerificationReceipt =
        match read_json_limited(&path, MAX_JSON_BYTES) {
            Ok(receipt) => receipt,
            Err(_) => return Ok(false),
        };
    if receipt.unsigned.format_version != RECOVERY_KIT_RECEIPT_FORMAT_VERSION
        || receipt.unsigned.kit_id != document.kit_id
        || receipt.unsigned.workspace_id != document.workspace_id
        || receipt.unsigned.source_installation_id != document.source_installation_id
        || receipt.unsigned.brk_id != document.brk_id
        || receipt.unsigned.recovery_key_id != document.recovery_key_id
        || receipt.unsigned.kit_sha256 != kit_sha256
        || receipt.mac_hex.len() != 64
        || !receipt
            .mac_hex
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Ok(false);
    }
    let expected = recovery_kit_receipt_mac(brk, &receipt.unsigned)?;
    Ok(constant_time_equal(
        expected.as_bytes(),
        receipt.mac_hex.as_bytes(),
    ))
}