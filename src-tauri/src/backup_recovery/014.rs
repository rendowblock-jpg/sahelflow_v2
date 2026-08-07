

fn formatted_recovery_code(bytes: &[u8; 32]) -> String {
    let encoded = hex_encode(bytes).to_ascii_uppercase();
    encoded
        .as_bytes()
        .chunks(8)
        .map(|chunk| std::str::from_utf8(chunk).expect("hexadecimal UTF-8"))
        .collect::<Vec<_>>()
        .join("-")
}

fn parse_recovery_code(value: &str) -> Result<[u8; 32], IoError> {
    let normalized = value
        .chars()
        .filter(|character| !character.is_ascii_whitespace() && *character != '-')
        .collect::<String>()
        .to_ascii_lowercase();
    hex_decode_exact::<32>(&normalized, "recovery code")
}

fn recovery_kit_key(code: &[u8; 32], workspace_id: &str, brk_id: &str) -> [u8; 32] {
    let salt = sha256(&[
        RECOVERY_KIT_SALT_DOMAIN,
        workspace_id.as_bytes(),
        brk_id.as_bytes(),
    ]);
    let info = frame(
        RECOVERY_KIT_INFO_DOMAIN,
        &[workspace_id.as_bytes(), brk_id.as_bytes()],
    );
    hkdf_sha256(code, &salt, &info)
}

fn kit_aad(
    kit_id: &str,
    created_at_unix_ms: u64,
    workspace_id: &str,
    source_installation_id: &str,
    brk_id: &str,
    recovery_key_id: &str,
) -> Vec<u8> {
    frame(
        KIT_AAD_DOMAIN,
        &[
            &[KIT_FORMAT_VERSION],
            KIT_FORMAT.as_bytes(),
            kit_id.as_bytes(),
            &created_at_unix_ms.to_le_bytes(),
            workspace_id.as_bytes(),
            source_installation_id.as_bytes(),
            brk_id.as_bytes(),
            recovery_key_id.as_bytes(),
        ],
    )
}

fn validate_recovery_kit_document(document: &RecoveryKitDocument) -> Result<(), IoError> {
    validate_kit_id(&document.kit_id)?;
    if document.format_version != KIT_FORMAT_VERSION
        || document.format != KIT_FORMAT
        || document.created_at_unix_ms == 0
        || !is_identity(&document.workspace_id)
        || !is_identity(&document.source_installation_id)
        || document.brk_id.len() != 64
        || document.recovery_key_id.len() != 64
        || !document
            .brk_id
            .bytes()
            .chain(document.recovery_key_id.bytes())
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "recovery kit authority is invalid",
        ));
    }
    Ok(())
}