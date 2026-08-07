

fn decode_inner(
    bytes: &[u8],
    identity: &InstallationIdentity,
    outer_key_id: &str,
) -> Result<[u8; 32], InstallationRootError> {
    if bytes.len() < INNER_MAGIC.len() + 1 + 32 + 32 {
        return Err(InstallationRootError::InvalidState(
            "installation-root payload is truncated".to_owned(),
        ));
    }
    let (signed, observed_digest) = bytes.split_at(bytes.len() - 32);
    let mut digest = Sha256::new();
    digest.update(INNER_HASH_DOMAIN);
    digest.update(signed);
    if !constant_time_equal(&digest.finalize(), observed_digest) {
        return Err(InstallationRootError::InvalidState(
            "installation-root payload integrity check failed".to_owned(),
        ));
    }
    let mut cursor = 0_usize;
    take_exact(signed, &mut cursor, INNER_MAGIC)?;
    if take_byte(signed, &mut cursor)? != DOCUMENT_FORMAT_VERSION
        || take_field(signed, &mut cursor)? != CURRENT_PURPOSE.as_bytes()
        || take_field(signed, &mut cursor)? != identity.workspace_id.as_bytes()
        || take_field(signed, &mut cursor)? != identity.installation_id.as_bytes()
        || take_field(signed, &mut cursor)? != outer_key_id.as_bytes()
        || signed.len().saturating_sub(cursor) != 32
    {
        return Err(InstallationRootError::IdentityMismatch(
            "installation-root inner authority binding is invalid".to_owned(),
        ));
    }
    let mut root = [0_u8; 32];
    root.copy_from_slice(&signed[cursor..]);
    Ok(root)
}

fn append_field(target: &mut Vec<u8>, value: &[u8]) -> Result<(), InstallationRootError> {
    let length = u16::try_from(value.len()).map_err(|_| {
        InstallationRootError::InvalidState("installation-root field is too long".to_owned())
    })?;
    target.extend_from_slice(&length.to_le_bytes());
    target.extend_from_slice(value);
    Ok(())
}