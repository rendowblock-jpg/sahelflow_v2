

fn load_recovery_brk(
    kit_root: &Path,
    descriptor: &BackupDescriptor,
    recovery_code: Option<&str>,
) -> Result<SecretKey, IoError> {
    let code = recovery_code.ok_or_else(|| {
        IoError::new(
            ErrorKind::PermissionDenied,
            "this backup requires its independent recovery kit and recovery code",
        )
    })?;
    let code_bytes = SecretKey::new(parse_recovery_code(code)?);
    let mut matches: Vec<SecretKey> = Vec::new();
    for entry in fs::read_dir(kit_root)? {
        let entry = entry?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if !name.ends_with(KIT_SUFFIX) {
            continue;
        }
        let path = entry.path();
        let metadata = fs::symlink_metadata(&path)?;
        if path_is_link(&metadata) || !metadata.is_file() {
            continue;
        }
        let document = match read_json_limited::<RecoveryKitDocument>(&path, MAX_JSON_BYTES) {
            Ok(document) => document,
            Err(_) => continue,
        };
        if validate_recovery_kit_document(&document).is_err()
            || document.workspace_id != descriptor.workspace_id
            || document.brk_id != descriptor.brk_id
            || document.source_installation_id != descriptor.source_installation_id
        {
            continue;
        }
        let mut kit_key = recovery_kit_key(
            code_bytes.as_array(),
            &document.workspace_id,
            &document.brk_id,
        );
        if key_id(&kit_key) != document.recovery_key_id {
            clear_bytes(&mut kit_key);
            continue;
        }
        let opened = open(
            &kit_key,
            RECOVERY_KIT_CONTEXT,
            &kit_aad(
                &document.kit_id,
                document.created_at_unix_ms,
                &document.workspace_id,
                &document.source_installation_id,
                &document.brk_id,
                &document.recovery_key_id,
            ),
            &document.wrapped_brk,
        );
        clear_bytes(&mut kit_key);
        if let Ok(plaintext) = opened {
            if plaintext.as_slice().len() == 32 {
                let mut brk = [0_u8; 32];
                brk.copy_from_slice(plaintext.as_slice());
                if key_id(&brk) == descriptor.brk_id {
                    matches.push(SecretKey::new(brk));
                } else {
                    clear_bytes(&mut brk);
                }
            }
        }
    }
    if matches.len() != 1 {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "no unique recovery kit authenticated the requested backup",
        ));
    }
    Ok(matches.remove(0))
}