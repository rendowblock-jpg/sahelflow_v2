

/// AES-256-GCM adapter for the canonical TypeScript protected-value envelope.
///
/// Unlike `seal`/`open`, these functions do not derive a second native envelope
/// key. The caller supplies the exact purpose-separated key and canonical AAD
/// already used by `src/lib/crypto/protected-value.ts`.
pub(crate) fn seal_raw_aes_256_gcm(
    key: &[u8; 32],
    aad: &[u8],
    plaintext: &[u8],
) -> Result<([u8; 12], Vec<u8>, [u8; 16]), IoError> {
    let nonce = random_array::<NONCE_BYTES>()?;
    let (ciphertext, tag) = aes_256_gcm_encrypt(key, &nonce, aad, plaintext)?;
    Ok((nonce, ciphertext, tag))
}

pub(crate) fn open_raw_aes_256_gcm(
    key: &[u8; 32],
    aad: &[u8],
    nonce: &[u8; 12],
    ciphertext: &[u8],
    tag: &[u8; 16],
) -> Result<SensitiveBytes, IoError> {
    aes_256_gcm_decrypt(key, nonce, aad, ciphertext, tag).map(SensitiveBytes)
}
