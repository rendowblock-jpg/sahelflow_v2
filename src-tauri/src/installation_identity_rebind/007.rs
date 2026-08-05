

fn take_field<'a>(
    bytes: &'a [u8],
    cursor: &mut usize,
) -> Result<&'a [u8], InstallationRootError> {
    if bytes.len().saturating_sub(*cursor) < 2 {
        return Err(InstallationRootError::InvalidState(
            "installation-root payload field is truncated".to_owned(),
        ));
    }
    let length = u16::from_le_bytes([bytes[*cursor], bytes[*cursor + 1]]) as usize;
    *cursor += 2;
    if bytes.len().saturating_sub(*cursor) < length {
        return Err(InstallationRootError::InvalidState(
            "installation-root payload field exceeds its boundary".to_owned(),
        ));
    }
    let field = &bytes[*cursor..*cursor + length];
    *cursor += length;
    Ok(field)
}

fn take_exact(
    bytes: &[u8],
    cursor: &mut usize,
    expected: &[u8],
) -> Result<(), InstallationRootError> {
    if bytes.len().saturating_sub(*cursor) < expected.len()
        || &bytes[*cursor..*cursor + expected.len()] != expected
    {
        return Err(InstallationRootError::InvalidState(
            "installation-root payload magic is invalid".to_owned(),
        ));
    }
    *cursor += expected.len();
    Ok(())
}

fn take_byte(bytes: &[u8], cursor: &mut usize) -> Result<u8, InstallationRootError> {
    let value = bytes.get(*cursor).copied().ok_or_else(|| {
        InstallationRootError::InvalidState("installation-root payload is truncated".to_owned())
    })?;
    *cursor += 1;
    Ok(value)
}

fn document_hash(document: &ProtectedDocument, ciphertext: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(OUTER_HASH_DOMAIN);
    digest.update([document.format_version]);
    update_hash_field(&mut digest, document.algorithm.as_bytes());
    update_hash_field(&mut digest, document.purpose.as_bytes());
    update_hash_field(&mut digest, document.workspace_id.as_bytes());
    update_hash_field(&mut digest, document.installation_id.as_bytes());
    update_hash_field(&mut digest, document.key_id.as_bytes());
    update_hash_field(&mut digest, ciphertext);
    hex_encode(&digest.finalize())
}

fn update_hash_field(digest: &mut Sha256, field: &[u8]) {
    digest.update((field.len() as u64).to_le_bytes());
    digest.update(field);
}