

#[cfg(windows)]
fn aes_256_gcm_encrypt(
    key: &[u8; 32],
    nonce: &[u8; 12],
    aad: &[u8],
    plaintext: &[u8],
) -> Result<(Vec<u8>, [u8; 16]), IoError> {
    bcrypt_aes_gcm(key, nonce, aad, plaintext, None)
}

#[cfg(windows)]
fn aes_256_gcm_decrypt(
    key: &[u8; 32],
    nonce: &[u8; 12],
    aad: &[u8],
    ciphertext: &[u8],
    tag: &[u8; 16],
) -> Result<Vec<u8>, IoError> {
    bcrypt_aes_gcm(key, nonce, aad, ciphertext, Some(tag)).map(|(plaintext, _)| plaintext)
}

#[cfg(not(windows))]
fn aes_256_gcm_encrypt(
    _key: &[u8; 32],
    _nonce: &[u8; 12],
    _aad: &[u8],
    _plaintext: &[u8],
) -> Result<(Vec<u8>, [u8; 16]), IoError> {
    Err(IoError::new(
        ErrorKind::Unsupported,
        "native AES-GCM is available only on Windows",
    ))
}

#[cfg(not(windows))]
fn aes_256_gcm_decrypt(
    _key: &[u8; 32],
    _nonce: &[u8; 12],
    _aad: &[u8],
    _ciphertext: &[u8],
    _tag: &[u8; 16],
) -> Result<Vec<u8>, IoError> {
    Err(IoError::new(
        ErrorKind::Unsupported,
        "native AES-GCM is available only on Windows",
    ))
}