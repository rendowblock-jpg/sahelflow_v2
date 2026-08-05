

fn make_document(
    root: &InstallationRootKey,
    identity: &InstallationIdentity,
) -> Result<ProtectedDocument, InstallationRootError> {
    let inner = encode_inner(root, identity)?;
    let ciphertext = platform_protect(&inner.0, identity)?;
    let mut document = ProtectedDocument {
        format_version: DOCUMENT_FORMAT_VERSION,
        algorithm: WINDOWS_DPAPI_ALGORITHM.to_owned(),
        purpose: CURRENT_PURPOSE.to_owned(),
        workspace_id: identity.workspace_id.clone(),
        installation_id: identity.installation_id.clone(),
        key_id: root.key_id().to_owned(),
        protected_payload_hex: hex_encode(&ciphertext),
        document_sha256: String::new(),
    };
    document.document_sha256 = document_hash(&document, &ciphertext);
    Ok(document)
}

fn verify_document_root(
    path: &Path,
    identity: &InstallationIdentity,
    expected: &InstallationRootKey,
) -> Result<(), InstallationRootError> {
    let document = read_document(path)?;
    if document.algorithm != WINDOWS_DPAPI_ALGORITHM
        || document.purpose != CURRENT_PURPOSE
        || document.workspace_id != identity.workspace_id
        || document.installation_id != identity.installation_id
        || document.key_id != expected.key_id()
    {
        return Err(InstallationRootError::IdentityMismatch(
            "installation-root document has an unexpected binding".to_owned(),
        ));
    }
    let ciphertext = hex_decode(&document.protected_payload_hex)?;
    let plaintext = platform_unprotect(&ciphertext, identity)?;
    let mut observed = decode_inner(&plaintext.0, identity, &document.key_id)?;
    let matches = constant_time_equal(&observed, expected.as_bytes());
    zero_bytes(&mut observed);
    if !matches {
        return Err(InstallationRootError::InvalidState(
            "rebound installation-root document changed the root key".to_owned(),
        ));
    }
    Ok(())
}