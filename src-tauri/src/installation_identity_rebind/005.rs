

fn read_document(path: &Path) -> Result<ProtectedDocument, InstallationRootError> {
    reject_symlink(path)?;
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_DOCUMENT_BYTES {
        return Err(InstallationRootError::InvalidState(
            "installation-root document size is invalid".to_owned(),
        ));
    }
    let document: ProtectedDocument = serde_json::from_slice(&fs::read(path)?)?;
    if document.format_version != DOCUMENT_FORMAT_VERSION {
        return Err(InstallationRootError::InvalidState(
            "installation-root document version is unsupported".to_owned(),
        ));
    }
    let ciphertext = hex_decode(&document.protected_payload_hex)?;
    if !constant_time_equal(
        document_hash(&document, &ciphertext).as_bytes(),
        document.document_sha256.as_bytes(),
    ) {
        return Err(InstallationRootError::InvalidState(
            "installation-root document integrity check failed".to_owned(),
        ));
    }
    Ok(document)
}

fn encode_inner(
    root: &InstallationRootKey,
    identity: &InstallationIdentity,
) -> Result<SensitiveBytes, InstallationRootError> {
    let mut bytes = Vec::with_capacity(256);
    bytes.extend_from_slice(INNER_MAGIC);
    bytes.push(DOCUMENT_FORMAT_VERSION);
    append_field(&mut bytes, CURRENT_PURPOSE.as_bytes())?;
    append_field(&mut bytes, identity.workspace_id.as_bytes())?;
    append_field(&mut bytes, identity.installation_id.as_bytes())?;
    append_field(&mut bytes, root.key_id().as_bytes())?;
    bytes.extend_from_slice(root.as_bytes());
    let mut digest = Sha256::new();
    digest.update(INNER_HASH_DOMAIN);
    digest.update(&bytes);
    bytes.extend_from_slice(&digest.finalize());
    Ok(SensitiveBytes(bytes))
}