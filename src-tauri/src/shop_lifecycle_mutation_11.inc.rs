fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut block = [0_u8; 64];
    if key.len() > block.len() {
        block[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        block[..key.len()].copy_from_slice(key);
    }
    let mut inner_pad = [0x36_u8; 64];
    let mut outer_pad = [0x5c_u8; 64];
    for index in 0..block.len() {
        inner_pad[index] ^= block[index];
        outer_pad[index] ^= block[index];
    }
    let mut inner = Sha256::new();
    inner.update(inner_pad);
    inner.update(message);
    let inner_digest = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(outer_pad);
    outer.update(inner_digest);
    let output = outer.finalize().into();
    block.fill(0);
    inner_pad.fill(0);
    outer_pad.fill(0);
    output
}

fn constant_time_hex_matches(supplied_hex: &str, expected: &[u8; 32]) -> bool {
    let Some(supplied) = decode_hex_32(supplied_hex) else {
        return false;
    };
    supplied
        .iter()
        .zip(expected)
        .fold(0_u8, |difference, (left, right)| difference | (*left ^ *right))
        == 0
}

fn decode_hex_32(value: &str) -> Option<[u8; 32]> {
    if !valid_lower_hex(value, 32) {
        return None;
    }
    let mut output = [0_u8; 32];
    for (index, pair) in value.as_bytes().chunks_exact(2).enumerate() {
        output[index] = (hex_nibble(pair[0])? << 4) | hex_nibble(pair[1])?;
    }
    Some(output)
}

fn hex_nibble(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        _ => None,
    }
}

fn valid_lower_hex(value: &str, bytes: usize) -> bool {
    value.len() == bytes * 2
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn random_hex(byte_count: usize) -> Result<String, IoError> {
    let mut bytes = vec![0_u8; byte_count];
    getrandom::getrandom(&mut bytes)
        .map_err(|error| IoError::other(format!("secure OS randomness failed: {error}")))?;
    Ok(hex_digest(&bytes))
}

fn hex_digest(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn push_u64(output: &mut Vec<u8>, value: u64) {
    output.extend_from_slice(&value.to_be_bytes());
}

fn push_string(output: &mut Vec<u8>, value: &str) {
    push_u64(output, value.len() as u64);
    output.extend_from_slice(value.as_bytes());
}

fn push_optional_string(output: &mut Vec<u8>, value: Option<&str>) {
    match value {
        Some(value) => {
            output.push(1);
            push_string(output, value);
        }
        None => output.push(0),
    }
}

fn path_is_link(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    false
}

struct FileLock {
    file: File,
}

impl FileLock {
    fn acquire(path: &Path, label: &str) -> Result<Self, MutationAuthorityError> {
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(path)?;
        file.try_lock_exclusive().map_err(|error| {
            MutationAuthorityError::Busy(format!(
                "another {label} operation owns the lock: {error}"
            ))
        })?;
        Ok(Self { file })
    }
}

impl Drop for FileLock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}

#[derive(Debug)]
pub enum MutationAuthorityError {
    Command(ShopLifecycleCommandError),
    Io(IoError),
    Json(serde_json::Error),
    Sqlite(rusqlite::Error),
    UnsupportedOperation,
    AuthorityMismatch(String),
    InvalidRegistry(String),
    InvalidState(String),
    IncompleteJournal(String),
    Busy(String),
    Entitlement(String),
    Archive(String),
    Migration(String),
    ManualRecoveryRequired(String),
}
