use getrandom::getrandom;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Error as IoError, ErrorKind};
use std::sync::atomic::{compiler_fence, Ordering};

const HMAC_BLOCK_BYTES: usize = 64;
const KEY_BYTES: usize = 32;
const NONCE_BYTES: usize = 12;
const TAG_BYTES: usize = 16;
const AEAD_FORMAT_VERSION: u8 = 1;
const AEAD_ALGORITHM: &str = "aes-256-gcm";
const AEAD_SALT_DOMAIN: &[u8] = b"sahelflow.native-aead.salt.v1\0";
const AEAD_INFO_DOMAIN: &[u8] = b"sahelflow.native-aead.info.v1\0";
const AEAD_KEY_ID_DOMAIN: &[u8] = b"sahelflow.native-aead.key-id.v1\0";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct NativeAeadEnvelope {
    pub(crate) format_version: u8,
    pub(crate) algorithm: String,
    pub(crate) key_id: String,
    pub(crate) nonce_hex: String,
    pub(crate) ciphertext_hex: String,
    pub(crate) tag_hex: String,
}

pub(crate) struct SecretKey([u8; KEY_BYTES]);

impl SecretKey {
    pub(crate) fn new(value: [u8; KEY_BYTES]) -> Self {
        Self(value)
    }

    pub(crate) fn as_array(&self) -> &[u8; KEY_BYTES] {
        &self.0
    }
}

impl Drop for SecretKey {
    fn drop(&mut self) {
        clear_bytes(&mut self.0);
    }
}

pub(crate) struct SensitiveBytes(pub(crate) Vec<u8>);

impl SensitiveBytes {
    pub(crate) fn as_slice(&self) -> &[u8] {
        &self.0
    }

    pub(crate) fn as_mut_slice(&mut self) -> &mut [u8] {
        &mut self.0
    }
}

impl Drop for SensitiveBytes {
    fn drop(&mut self) {
        clear_bytes(&mut self.0);
    }
}

pub(crate) fn clear_bytes(bytes: &mut [u8]) {
    for byte in bytes.iter_mut() {
        unsafe { std::ptr::write_volatile(byte, 0) };
    }
    compiler_fence(Ordering::SeqCst);
}

pub(crate) fn random_array<const N: usize>() -> Result<[u8; N], IoError> {
    let mut output = [0_u8; N];
    getrandom(&mut output).map_err(|error| {
        IoError::other(format!("secure random generation failed: {error}"))
    })?;
    Ok(output)
}

pub(crate) fn sha256(parts: &[&[u8]]) -> [u8; 32] {
    let mut digest = Sha256::new();
    for part in parts {
        digest.update(part);
    }
    digest.finalize().into()
}