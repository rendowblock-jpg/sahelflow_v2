

pub(crate) fn create_recovery_kit(
    app_data_dir: &Path,
    document_dir: &Path,
    installation_root: &[u8; 32],
    authority: &BackupAuthority,
) -> Result<RecoveryKitResult, IoError> {
    let _lock = FileLock::acquire(&system_dir(app_data_dir).join(BACKUP_LOCK_FILE))?;
    let (brk, brk_id) = load_or_create_local_brk(
        app_data_dir,
        installation_root,
        &authority.workspace_id,
        &authority.installation_id,
    )?;
    let root = recovery_kit_root(document_dir)?;
    let code_bytes = SecretKey::new(random_array::<32>()?);
    let kit_key = SecretKey::new(recovery_kit_key(
        code_bytes.as_array(),
        &authority.workspace_id,
        &brk_id,
    ));
    let kit_id = format!("kit-{}-{}", now_unix_ms()?, random_hex(8)?);
    validate_kit_id(&kit_id)?;
    let created_at_unix_ms = now_unix_ms()?;
    let recovery_key_id = key_id(kit_key.as_array());
    let aad = kit_aad(
        &kit_id,
        created_at_unix_ms,
        &authority.workspace_id,
        &authority.installation_id,
        &brk_id,
        &recovery_key_id,
    );
    let wrapped_brk = seal(
        kit_key.as_array(),
        RECOVERY_KIT_CONTEXT,
        &aad,
        brk.as_array(),
    )?;
    let mut recovery_code = formatted_recovery_code(code_bytes.as_array());
    let file_name = format!(
        "sahelflow-recovery-{}-{}.sfkit",
        &authority.workspace_id[..12],
        created_at_unix_ms
    );
    let path = root.join(file_name);
    let receipt_path = recovery_kit_receipt_path(app_data_dir, &kit_id)?;
    let outcome = (|| -> Result<(), IoError> {
        write_json_atomic(
            &path,
            &RecoveryKitDocument {
                format_version: KIT_FORMAT_VERSION,
                format: KIT_FORMAT.to_owned(),
                kit_id: kit_id.clone(),
                created_at_unix_ms,
                workspace_id: authority.workspace_id.clone(),
                source_installation_id: authority.installation_id.clone(),
                brk_id: brk_id.clone(),
                recovery_key_id: recovery_key_id.clone(),
                wrapped_brk,
            },
        )?;

        // The recovery code is shown only after the exact persisted document
        // authenticates and opens back to the current BRK. This prevents a
        // successful UI response for a truncated, redirected, or changed kit.
        let persisted: RecoveryKitDocument = read_json_limited(&path, MAX_JSON_BYTES)?;
        validate_recovery_kit_document(&persisted)?;
        if persisted.kit_id != kit_id
            || persisted.created_at_unix_ms != created_at_unix_ms
            || persisted.workspace_id != authority.workspace_id
            || persisted.source_installation_id != authority.installation_id
            || persisted.brk_id != brk_id
            || persisted.recovery_key_id != recovery_key_id
        {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "persisted recovery kit authority changed during creation",
            ));
        }
        let opened = open(
            kit_key.as_array(),
            RECOVERY_KIT_CONTEXT,
            &kit_aad(
                &persisted.kit_id,
                persisted.created_at_unix_ms,
                &persisted.workspace_id,
                &persisted.source_installation_id,
                &persisted.brk_id,
                &persisted.recovery_key_id,
            ),
            &persisted.wrapped_brk,
        )?;
        if opened.as_slice().len() != 32
            || !constant_time_equal(opened.as_slice(), brk.as_array())
        {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "persisted recovery kit failed its BRK round-trip",
            ));
        }
        let unsigned = RecoveryKitVerificationReceiptUnsigned {
            format_version: RECOVERY_KIT_RECEIPT_FORMAT_VERSION,
            kit_id: kit_id.clone(),
            workspace_id: authority.workspace_id.clone(),
            source_installation_id: authority.installation_id.clone(),
            brk_id: brk_id.clone(),
            recovery_key_id: recovery_key_id.clone(),
            kit_sha256: sha256_file(&path)?,
            verified_at_unix_ms: now_unix_ms()?,
        };
        write_recovery_kit_receipt(&receipt_path, brk.as_array(), &unsigned)
    })();
    if let Err(error) = outcome {
        let _ = remove_file_if_present(&path);
        let _ = remove_file_if_present(&receipt_path);
        clear_string(&mut recovery_code);
        return Err(error);
    }

    Ok(RecoveryKitResult {
        kit_id,
        path: path.to_string_lossy().into_owned(),
        recovery_code,
        workspace_id: authority.workspace_id.clone(),
        brk_id,
        created_at_unix_ms,
    })
}