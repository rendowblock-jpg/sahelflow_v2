

fn load_local_brk(
    app_data_dir: &Path,
    installation_root: &[u8; 32],
    workspace_id: &str,
    installation_id: &str,
) -> Result<Option<(SecretKey, String)>, IoError> {
    let path = brk_authority_path(app_data_dir);
    if !path.exists() {
        return Ok(None);
    }
    let document: BrkAuthorityDocument = read_json_limited(&path, MAX_JSON_BYTES)?;
    if document.format_version != BRK_AUTHORITY_FORMAT_VERSION
        || document.algorithm != "aes-256-gcm"
        || document.workspace_id != workspace_id
        || document.installation_id != installation_id
        || document.brk_id.len() != 64
        || !document.brk_id.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup recovery key authority belongs to another installation or format",
        ));
    }
    let wrapping = derive_installation_key(
        installation_root,
        workspace_id,
        installation_id,
        PURPOSE_BACKUP_RECOVERY_WRAP,
        1,
    )?;
    if document.wrapping_key_id != wrapping.key_id {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup recovery key authority belongs to another wrapping key",
        ));
    }
    let plaintext = open(
        &wrapping.key,
        BRK_WRAP_CONTEXT,
        &brk_aad(
            workspace_id,
            installation_id,
            &document.brk_id,
            &document.wrapping_key_id,
            document.created_at_unix_ms,
        ),
        &document.wrapped_brk,
    )?;
    if plaintext.as_slice().len() != 32 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup recovery key has invalid dimensions",
        ));
    }
    let mut brk = [0_u8; 32];
    brk.copy_from_slice(plaintext.as_slice());
    if key_id(&brk) != document.brk_id {
        clear_bytes(&mut brk);
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup recovery key ID does not match its protected authority",
        ));
    }
    Ok(Some((SecretKey::new(brk), document.brk_id)))
}