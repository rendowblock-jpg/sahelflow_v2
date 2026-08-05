

fn open_backup(
    app_data_dir: &Path,
    root: &Path,
    kit_root: &Path,
    installation_root: &[u8; 32],
    authority: &BackupAuthority,
    backup_id: &str,
    recovery_code: Option<&str>,
) -> Result<OpenedBackup, IoError> {
    let path = root.join(format!("{backup_id}{BACKUP_SUFFIX}"));
    let metadata = fs::symlink_metadata(&path)?;
    if path_is_link(&metadata) || !metadata.is_dir() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup container is not a regular contained directory",
        ));
    }
    let descriptor: BackupDescriptor =
        read_json_limited(&path.join(DESCRIPTOR_FILE), MAX_JSON_BYTES)?;
    validate_descriptor(&descriptor)?;
    if descriptor.backup_id != backup_id {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup descriptor identity does not match the requested backup",
        ));
    }

    let brk = if descriptor.workspace_id == authority.workspace_id
        && descriptor.source_installation_id == authority.installation_id
    {
        match load_local_brk(
            app_data_dir,
            installation_root,
            &authority.workspace_id,
            &authority.installation_id,
        )? {
            Some((local, id)) if id == descriptor.brk_id => local,
            _ => load_recovery_brk(kit_root, &descriptor, recovery_code)?,
        }
    } else {
        load_recovery_brk(kit_root, &descriptor, recovery_code)?
    };
    if key_id(brk.as_array()) != descriptor.brk_id {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup recovery key does not match the descriptor",
        ));
    }
    let descriptor_aad = descriptor_aad(
        &descriptor.backup_id,
        descriptor.created_at_unix_ms,
        descriptor.verified_at_unix_ms,
        descriptor.parent_backup_id.as_deref(),
        &descriptor.retention_class,
        descriptor.pinned,
        &descriptor.workspace_id,
        &descriptor.source_installation_id,
        &descriptor.brk_id,
        &descriptor.dek_id,
        &descriptor.app_version,
        descriptor.runtime_protocol_version,
        &descriptor.migration_set_sha256,
        descriptor.shop_count,
        descriptor.plaintext_bytes,
        &descriptor.manifest_sha256,
    );
    let plaintext_dek = open(
        brk.as_array(),
        BACKUP_DEK_WRAP_CONTEXT,
        &descriptor_aad,
        &descriptor.wrapped_dek,
    )?;
    if plaintext_dek.as_slice().len() != 32 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup data key has invalid dimensions",
        ));
    }
    let mut dek_bytes = [0_u8; 32];
    dek_bytes.copy_from_slice(plaintext_dek.as_slice());
    let dek = SecretKey::new(dek_bytes);
    if key_id(dek.as_array()) != descriptor.dek_id {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup data key does not match the descriptor",
        ));
    }

    let manifest_path = path.join(&descriptor.manifest_file);
    let manifest_bytes = read_bytes_limited(&manifest_path, MAX_JSON_BYTES)?;
    if hex_encode(&sha256(&[&manifest_bytes])) != descriptor.manifest_sha256 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "encrypted backup manifest digest does not match",
        ));
    }
    let envelope: NativeAeadEnvelope = serde_json::from_slice(&manifest_bytes).map_err(|error| {
        IoError::new(
            ErrorKind::InvalidData,
            format!("encrypted backup manifest is invalid: {error}"),
        )
    })?;
    let manifest_plaintext = open(
        dek.as_array(),
        BACKUP_MANIFEST_CONTEXT,
        &manifest_aad(
            &descriptor.backup_id,
            descriptor.created_at_unix_ms,
            descriptor.verified_at_unix_ms,
            descriptor.parent_backup_id.as_deref(),
            &descriptor.retention_class,
            descriptor.pinned,
            &descriptor.workspace_id,
            &descriptor.source_installation_id,
            &descriptor.brk_id,
            &descriptor.dek_id,
            &descriptor.migration_set_sha256,
        ),
        &envelope,
    )?;
    let manifest: BackupManifest =
        serde_json::from_slice(manifest_plaintext.as_slice()).map_err(|error| {
            IoError::new(
                ErrorKind::InvalidData,
                format!("authenticated backup manifest is invalid: {error}"),
            )
        })?;
    validate_manifest(&path, &descriptor, &manifest)?;
    Ok(OpenedBackup {
        path,
        descriptor,
        manifest,
        brk,
        dek,
    })
}