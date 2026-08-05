

pub(crate) fn seal_detached(
    key: &[u8; 32],
    context: &[u8],
    aad: &[u8],
    plaintext: &[u8],
) -> Result<([u8; 12], Vec<u8>, [u8; 16]), IoError> {
    let derived = SecretKey::new(derive_aead_key(key, context));
    let nonce = random_array::<NONCE_BYTES>()?;
    let (ciphertext, tag) = aes_256_gcm_encrypt(derived.as_array(), &nonce, aad, plaintext)?;
    Ok((nonce, ciphertext, tag))
}

pub(crate) fn open_detached(
    key: &[u8; 32],
    context: &[u8],
    aad: &[u8],
    nonce: &[u8; 12],
    ciphertext: &[u8],
    tag: &[u8; 16],
) -> Result<SensitiveBytes, IoError> {
    let derived = SecretKey::new(derive_aead_key(key, context));
    aes_256_gcm_decrypt(derived.as_array(), nonce, aad, ciphertext, tag).map(SensitiveBytes)
}

pub(crate) fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

pub(crate) fn hex_decode_exact<const N: usize>(
    value: &str,
    label: &str,
) -> Result<[u8; N], IoError> {
    let decoded = hex_decode(value, label)?;
    if decoded.len() != N {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("{label} must contain exactly {N} bytes"),
        ));
    }
    let mut output = [0_u8; N];
    output.copy_from_slice(&decoded);
    Ok(output)
}

pub(crate) fn hex_decode(value: &str, label: &str) -> Result<Vec<u8>, IoError> {
    if value.len() % 2 != 0 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("{label} hexadecimal value has an odd length"),
        ));
    }
    let mut output = Vec::with_capacity(value.len() / 2);
    for pair in value.as_bytes().chunks_exact(2) {
        output.push((hex_nibble(pair[0], label)? << 4) | hex_nibble(pair[1], label)?);
    }
    Ok(output)
}

fn hex_nibble(value: u8, label: &str) -> Result<u8, IoError> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(value - b'a' + 10),
        _ => Err(IoError::new(
            ErrorKind::InvalidData,
            format!("{label} is not lowercase hexadecimal"),
        )),
    }
}