

fn load_or_create_local_brk(
    app_data_dir: &Path,
    installation_root: &[u8; 32],
    workspace_id: &str,
    installation_id: &str,
) -> Result<(SecretKey, String), IoError> {
    if let Some(existing) = load_local_brk(
        app_data_dir,
        installation_root,
        workspace_id,
        installation_id,
    )? {
        return Ok(existing);
    }
    let brk = SecretKey::new(random_array::<32>()?);
    let brk_id = key_id(brk.as_array());
    store_local_brk(
        app_data_dir,
        installation_root,
        workspace_id,
        installation_id,
        brk.as_array(),
    )?;
    Ok((brk, brk_id))
}

fn store_local_brk(
    app_data_dir: &Path,
    installation_root: &[u8; 32],
    workspace_id: &str,
    installation_id: &str,
    brk: &[u8; 32],
) -> Result<(), IoError> {
    let path = brk_authority_path(app_data_dir);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
        reject_symlink_if_present(parent)?;
    }
    let wrapping = derive_installation_key(
        installation_root,
        workspace_id,
        installation_id,
        PURPOSE_BACKUP_RECOVERY_WRAP,
        1,
    )?;
    let brk_id = key_id(brk);
    let created_at_unix_ms = now_unix_ms()?;
    let aad = brk_aad(
        workspace_id,
        installation_id,
        &brk_id,
        &wrapping.key_id,
        created_at_unix_ms,
    );
    let wrapped_brk = seal(&wrapping.key, BRK_WRAP_CONTEXT, &aad, brk)?;
    write_json_atomic(
        &path,
        &BrkAuthorityDocument {
            format_version: BRK_AUTHORITY_FORMAT_VERSION,
            algorithm: "aes-256-gcm".to_owned(),
            workspace_id: workspace_id.to_owned(),
            installation_id: installation_id.to_owned(),
            brk_id,
            wrapping_key_id: wrapping.key_id.clone(),
            wrapped_brk,
            created_at_unix_ms,
        },
    )
}
