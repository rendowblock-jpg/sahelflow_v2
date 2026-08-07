

fn valid_timestamped_id(value: &str, prefix: &str) -> bool {
    let Some(remainder) = value.strip_prefix(prefix) else {
        return false;
    };
    let mut parts = remainder.split('-');
    let Some(timestamp) = parts.next() else {
        return false;
    };
    let Some(random) = parts.next() else {
        return false;
    };
    parts.next().is_none()
        && (10..=17).contains(&timestamp.len())
        && timestamp.bytes().all(|byte| byte.is_ascii_digit())
        && random.len() == 16
        && random
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn validate_backup_id(value: &str) -> Result<(), IoError> {
    if !valid_timestamped_id(value, "backup-") {
        return Err(IoError::new(
            ErrorKind::InvalidInput,
            "backup ID is invalid",
        ));
    }
    Ok(())
}

fn validate_kit_id(value: &str) -> Result<(), IoError> {
    if !valid_timestamped_id(value, "kit-") {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "recovery kit ID is invalid",
        ));
    }
    Ok(())
}

fn brk_authority_path(app_data_dir: &Path) -> PathBuf {
    system_dir(app_data_dir).join(BRK_AUTHORITY_FILE)
}

fn brk_aad(
    workspace_id: &str,
    installation_id: &str,
    brk_id: &str,
    wrapping_key_id: &str,
    created_at_unix_ms: u64,
) -> Vec<u8> {
    frame(
        BRK_AAD_DOMAIN,
        &[
            &[BRK_AUTHORITY_FORMAT_VERSION],
            workspace_id.as_bytes(),
            installation_id.as_bytes(),
            brk_id.as_bytes(),
            wrapping_key_id.as_bytes(),
            &created_at_unix_ms.to_le_bytes(),
        ],
    )
}