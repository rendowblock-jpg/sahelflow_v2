

pub(crate) fn seal(
    root: &[u8; 32],
    context: &[u8],
    aad: &[u8],
    plaintext: &[u8],
) -> Result<NativeAeadEnvelope, IoError> {
    let key = SecretKey::new(derive_aead_key(root, context));
    let nonce = random_array::<NONCE_BYTES>()?;
    let (ciphertext, tag) = aes_256_gcm_encrypt(key.as_array(), &nonce, aad, plaintext)?;
    Ok(NativeAeadEnvelope {
        format_version: AEAD_FORMAT_VERSION,
        algorithm: AEAD_ALGORITHM.to_owned(),
        key_id: key_id(key.as_array()),
        nonce_hex: hex_encode(&nonce),
        ciphertext_hex: hex_encode(&ciphertext),
        tag_hex: hex_encode(&tag),
    })
}

pub(crate) fn open(
    root: &[u8; 32],
    context: &[u8],
    aad: &[u8],
    envelope: &NativeAeadEnvelope,
) -> Result<SensitiveBytes, IoError> {
    if envelope.format_version != AEAD_FORMAT_VERSION
        || envelope.algorithm != AEAD_ALGORITHM
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "native protected envelope format is unsupported",
        ));
    }
    let key = SecretKey::new(derive_aead_key(root, context));
    if envelope.key_id != key_id(key.as_array()) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "native protected envelope belongs to another key",
        ));
    }
    let nonce = hex_decode_exact::<NONCE_BYTES>(&envelope.nonce_hex, "nonce")?;
    let ciphertext = hex_decode(&envelope.ciphertext_hex, "ciphertext")?;
    let tag = hex_decode_exact::<TAG_BYTES>(&envelope.tag_hex, "tag")?;
    aes_256_gcm_decrypt(key.as_array(), &nonce, aad, &ciphertext, &tag).map(SensitiveBytes)
}