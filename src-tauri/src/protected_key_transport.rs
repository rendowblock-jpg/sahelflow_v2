use crate::key_hierarchy::{
    derive_installation_key, PURPOSE_SECRET_STORE_WRAP, PURPOSE_SHOP_BLIND_INDEX_WRAP,
    PURPOSE_SHOP_DATA_WRAP,
};
use crate::native_crypto::{
    clear_bytes, constant_time_equal, hex_decode_exact, hex_encode, open_raw_aes_256_gcm,
    random_array, seal_raw_aes_256_gcm, sha256,
};
use rusqlite::{params, Connection, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{Error as IoError, ErrorKind};
use std::path::Path;

const AUTHORITY_FORMAT_VERSION: u8 = 1;
const AUTHORITY_ALGORITHM: &str = "sahelflow-protected-value/aes-256-gcm";
const ENVELOPE_FORMAT: &str = "sahelflow-protected-value";
const ENVELOPE_VERSION: u8 = 1;
const ENVELOPE_ALGORITHM: &str = "aes-256-gcm";
const DESCRIPTOR_FORMAT_VERSION: u8 = 1;
const WRAPPING_PURPOSE: &str = "key-wrap";
const WRAPPING_VERSION: u32 = 1;
const AAD_DOMAIN: &[u8] = b"sahelflow.protected-value.aad.v1\0";
const BINDING_DOMAIN: &[u8] = b"sahelflow.protected-value.binding.v1\0";
const KEY_ID_DOMAIN: &[u8] = b"sahelflow.protected-value.key-id.v1\0";
const REQUIRED_PURPOSES: [&str; 3] = ["shop-blind-index", "shop-data", "shop-secret"];

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ExportedShopKey {
    pub(crate) purpose: String,
    pub(crate) format_version: u8,
    pub(crate) algorithm: String,
    pub(crate) key_version: u32,
    pub(crate) key_id: String,
    key_hex: String,
}

#[derive(Debug)]
struct AuthorityRow {
    purpose: String,
    format_version: i64,
    algorithm: String,
    key_version: i64,
    key_id: String,
    wrapping_key_id: String,
    wrapped_key: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProtectedValueKeyDescriptor {
    format_version: u8,
    purpose: String,
    version: u32,
    key_id: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProtectedValueEnvelope {
    format: String,
    version: u8,
    algorithm: String,
    key: ProtectedValueKeyDescriptor,
    binding_sha256: String,
    iv: String,
    ciphertext: String,
    tag: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ShopKeyAuthorityBinding<'a> {
    scope: &'static str,
    workspace_id: &'a str,
    installation_id: &'a str,
    shop_id: &'a str,
    shop_incarnation_id: &'a str,
    protected_purpose: &'a str,
    protected_version: u32,
}

#[derive(Serialize)]
struct ProtectedValueMetadata<'a> {
    format: &'a str,
    version: u8,
    algorithm: &'a str,
    key: &'a ProtectedValueKeyDescriptor,
    #[serde(rename = "bindingSha256")]
    binding_sha256: &'a str,
}

pub(crate) fn export_shop_keys(
    database_path: &Path,
    installation_root: &[u8; 32],
    workspace_id: &str,
    installation_id: &str,
    shop_id: &str,
    shop_incarnation_id: &str,
) -> Result<Vec<ExportedShopKey>, IoError> {
    validate_context(
        workspace_id,
        installation_id,
        shop_id,
        shop_incarnation_id,
    )?;
    validate_database_file(database_path)?;
    let connection = Connection::open(database_path)
        .map_err(|error| IoError::other(format!("protected key database open failed: {error}")))?;
    let rows = read_rows(&connection)?;
    validate_complete_rows(&rows)?;

    let mut exported = Vec::with_capacity(REQUIRED_PURPOSES.len());
    for row in rows {
        let key_version = u32::try_from(row.key_version).map_err(|_| {
            IoError::new(ErrorKind::InvalidData, "protected shop key version is invalid")
        })?;
        validate_row(&row, key_version)?;
        let mut key = open_wrapped_key(
            &row,
            key_version,
            installation_root,
            workspace_id,
            installation_id,
            shop_id,
            shop_incarnation_id,
        )?;
        let observed_key_id = protected_value_key_id(&key, &row.purpose, key_version);
        if observed_key_id != row.key_id {
            clear_bytes(&mut key);
            clear_exported_vec(&mut exported);
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!("protected key authority for {} has a mismatched key ID", row.purpose),
            ));
        }
        exported.push(ExportedShopKey {
            purpose: row.purpose,
            format_version: AUTHORITY_FORMAT_VERSION,
            algorithm: AUTHORITY_ALGORITHM.to_owned(),
            key_version,
            key_id: observed_key_id,
            key_hex: hex_encode(&key),
        });
        clear_bytes(&mut key);
    }
    exported.sort_by(|left, right| left.purpose.cmp(&right.purpose));
    Ok(exported)
}

pub(crate) fn rewrap_imported_shop_keys(
    database_path: &Path,
    keys: &[ExportedShopKey],
    installation_root: &[u8; 32],
    workspace_id: &str,
    installation_id: &str,
    shop_id: &str,
    shop_incarnation_id: &str,
) -> Result<(), IoError> {
    validate_context(
        workspace_id,
        installation_id,
        shop_id,
        shop_incarnation_id,
    )?;
    validate_exported_keys(keys)?;
    validate_database_file(database_path)?;
    let mut connection = Connection::open(database_path)
        .map_err(|error| IoError::other(format!("restored key database open failed: {error}")))?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|error| IoError::other(format!("protected key re-wrap transaction failed: {error}")))?;

    let existing_count: i64 = transaction
        .query_row("SELECT COUNT(*) FROM ProtectedKeyAuthority", [], |row| row.get(0))
        .map_err(|error| IoError::other(format!("protected key authority count failed: {error}")))?;
    if existing_count != REQUIRED_PURPOSES.len() as i64 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "restored database has an incomplete or competing protected-key authority",
        ));
    }

    for exported in keys {
        let mut key = decode_key_hex(&exported.key_hex)?;
        let expected_id = protected_value_key_id(&key, &exported.purpose, exported.key_version);
        if expected_id != exported.key_id {
            clear_bytes(&mut key);
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!("imported protected key for {} has a mismatched key ID", exported.purpose),
            ));
        }
        let (wrapping_key, wrapping_key_id) = wrapping_key(
            installation_root,
            workspace_id,
            installation_id,
            &exported.purpose,
        )?;
        let wrapped_key = seal_wrapped_key(
            &key,
            exported.key_version,
            &exported.purpose,
            &wrapping_key,
            &wrapping_key_id,
            workspace_id,
            installation_id,
            shop_id,
            shop_incarnation_id,
        )?;
        clear_bytes(&mut key);

        let changed = transaction
            .execute(
                "UPDATE ProtectedKeyAuthority SET formatVersion = ?1, algorithm = ?2, keyVersion = ?3, keyId = ?4, wrappingKeyId = ?5, wrappedKey = ?6, updatedAt = CURRENT_TIMESTAMP WHERE purpose = ?7",
                params![
                    i64::from(AUTHORITY_FORMAT_VERSION),
                    AUTHORITY_ALGORITHM,
                    i64::from(exported.key_version),
                    exported.key_id,
                    wrapping_key_id,
                    wrapped_key,
                    exported.purpose,
                ],
            )
            .map_err(|error| IoError::other(format!("protected key re-wrap update failed: {error}")))?;
        if changed != 1 {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!("restored database is missing protected key purpose {}", exported.purpose),
            ));
        }
    }

    transaction
        .commit()
        .map_err(|error| IoError::other(format!("protected key re-wrap commit failed: {error}")))
}

pub(crate) fn clear_exported_shop_keys(
    shop_keys: &mut BTreeMap<String, Vec<ExportedShopKey>>,
) {
    for keys in shop_keys.values_mut() {
        clear_exported_vec(keys);
    }
    shop_keys.clear();
}

fn clear_exported_vec(keys: &mut Vec<ExportedShopKey>) {
    for key in keys.iter_mut() {
        clear_string(&mut key.key_hex);
    }
    keys.clear();
}

fn read_rows(connection: &Connection) -> Result<Vec<AuthorityRow>, IoError> {
    let mut statement = connection
        .prepare(
            "SELECT purpose, formatVersion, algorithm, keyVersion, keyId, wrappingKeyId, wrappedKey FROM ProtectedKeyAuthority ORDER BY purpose ASC",
        )
        .map_err(|error| IoError::other(format!("protected key authority query failed: {error}")))?;
    statement
        .query_map([], |row| {
            Ok(AuthorityRow {
                purpose: row.get(0)?,
                format_version: row.get(1)?,
                algorithm: row.get(2)?,
                key_version: row.get(3)?,
                key_id: row.get(4)?,
                wrapping_key_id: row.get(5)?,
                wrapped_key: row.get(6)?,
            })
        })
        .map_err(|error| IoError::other(format!("protected key authority read failed: {error}")))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| IoError::other(format!("protected key authority row failed: {error}")))
}

fn validate_complete_rows(rows: &[AuthorityRow]) -> Result<(), IoError> {
    let purposes = rows
        .iter()
        .map(|row| row.purpose.as_str())
        .collect::<BTreeSet<_>>();
    let required = REQUIRED_PURPOSES.into_iter().collect::<BTreeSet<_>>();
    if rows.len() != required.len() || purposes != required {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "shop database has an incomplete or competing protected-key authority",
        ));
    }
    Ok(())
}

fn validate_exported_keys(keys: &[ExportedShopKey]) -> Result<(), IoError> {
    let purposes = keys
        .iter()
        .map(|key| key.purpose.as_str())
        .collect::<BTreeSet<_>>();
    let required = REQUIRED_PURPOSES.into_iter().collect::<BTreeSet<_>>();
    if keys.len() != required.len() || purposes != required {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup has an incomplete or competing protected-key set",
        ));
    }
    for key in keys {
        if key.format_version != AUTHORITY_FORMAT_VERSION
            || key.algorithm != AUTHORITY_ALGORITHM
            || key.key_version == 0
            || !is_lower_hex(&key.key_id, 64)
            || !is_lower_hex(&key.key_hex, 64)
        {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!("backup protected key for {} is malformed", key.purpose),
            ));
        }
    }
    Ok(())
}

fn validate_row(row: &AuthorityRow, key_version: u32) -> Result<(), IoError> {
    if row.format_version != i64::from(AUTHORITY_FORMAT_VERSION)
        || row.algorithm != AUTHORITY_ALGORITHM
        || key_version == 0
        || !is_lower_hex(&row.key_id, 64)
        || !is_lower_hex(&row.wrapping_key_id, 64)
        || row.wrapped_key.is_empty()
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("protected key authority for {} is malformed", row.purpose),
        ));
    }
    Ok(())
}

fn open_wrapped_key(
    row: &AuthorityRow,
    key_version: u32,
    installation_root: &[u8; 32],
    workspace_id: &str,
    installation_id: &str,
    shop_id: &str,
    shop_incarnation_id: &str,
) -> Result<[u8; 32], IoError> {
    let (wrapping_key, wrapping_key_id) = wrapping_key(
        installation_root,
        workspace_id,
        installation_id,
        &row.purpose,
    )?;
    if row.wrapping_key_id != wrapping_key_id {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("protected key authority for {} belongs to another installation", row.purpose),
        ));
    }
    let envelope: ProtectedValueEnvelope = serde_json::from_str(&row.wrapped_key)
        .map_err(|error| IoError::new(ErrorKind::InvalidData, format!("protected key envelope is malformed: {error}")))?;
    validate_envelope(&envelope, &wrapping_key_id)?;
    let (binding_json, binding_digest) = binding_material(
        workspace_id,
        installation_id,
        shop_id,
        shop_incarnation_id,
        &row.purpose,
        key_version,
    )?;
    if envelope.binding_sha256 != binding_digest {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "protected key envelope belongs to another shop context",
        ));
    }
    let aad = envelope_aad(&envelope, &binding_json)?;
    let nonce = decode_base64_exact::<12>(&envelope.iv, "protected key IV")?;
    let ciphertext = decode_base64(&envelope.ciphertext, "protected key ciphertext")?;
    let tag = decode_base64_exact::<16>(&envelope.tag, "protected key tag")?;
    let plaintext = open_raw_aes_256_gcm(&wrapping_key, &aad, &nonce, &ciphertext, &tag)?;
    let encoded = std::str::from_utf8(plaintext.as_slice()).map_err(|_| {
        IoError::new(ErrorKind::InvalidData, "protected key plaintext is not UTF-8")
    })?;
    decode_key_hex(encoded)
}

fn seal_wrapped_key(
    key: &[u8; 32],
    key_version: u32,
    purpose: &str,
    wrapping_key: &[u8; 32],
    wrapping_key_id: &str,
    workspace_id: &str,
    installation_id: &str,
    shop_id: &str,
    shop_incarnation_id: &str,
) -> Result<String, IoError> {
    let (binding_json, binding_digest) = binding_material(
        workspace_id,
        installation_id,
        shop_id,
        shop_incarnation_id,
        purpose,
        key_version,
    )?;
    let descriptor = ProtectedValueKeyDescriptor {
        format_version: DESCRIPTOR_FORMAT_VERSION,
        purpose: WRAPPING_PURPOSE.to_owned(),
        version: WRAPPING_VERSION,
        key_id: wrapping_key_id.to_owned(),
    };
    let mut envelope = ProtectedValueEnvelope {
        format: ENVELOPE_FORMAT.to_owned(),
        version: ENVELOPE_VERSION,
        algorithm: ENVELOPE_ALGORITHM.to_owned(),
        key: descriptor,
        binding_sha256: binding_digest,
        iv: String::new(),
        ciphertext: String::new(),
        tag: String::new(),
    };
    let aad = envelope_aad(&envelope, &binding_json)?;
    let plaintext = hex_encode(key);
    let (nonce, ciphertext, tag) =
        seal_raw_aes_256_gcm(wrapping_key, &aad, plaintext.as_bytes())?;
    envelope.iv = base64_encode(&nonce);
    envelope.ciphertext = base64_encode(&ciphertext);
    envelope.tag = base64_encode(&tag);
    serde_json::to_string(&envelope)
        .map_err(|error| IoError::other(format!("protected key envelope serialization failed: {error}")))
}

fn wrapping_key(
    installation_root: &[u8; 32],
    workspace_id: &str,
    installation_id: &str,
    protected_purpose: &str,
) -> Result<([u8; 32], String), IoError> {
    let installation_purpose = match protected_purpose {
        "shop-data" => PURPOSE_SHOP_DATA_WRAP,
        "shop-blind-index" => PURPOSE_SHOP_BLIND_INDEX_WRAP,
        "shop-secret" => PURPOSE_SECRET_STORE_WRAP,
        _ => {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!("unsupported protected key purpose: {protected_purpose}"),
            ))
        }
    };
    let derived = derive_installation_key(
        installation_root,
        workspace_id,
        installation_id,
        installation_purpose,
        1,
    )?;
    let key_id = protected_value_key_id(&derived.key, WRAPPING_PURPOSE, WRAPPING_VERSION);
    Ok((derived.key, key_id))
}

fn binding_material(
    workspace_id: &str,
    installation_id: &str,
    shop_id: &str,
    shop_incarnation_id: &str,
    purpose: &str,
    key_version: u32,
) -> Result<(Vec<u8>, String), IoError> {
    let workspace = workspace_id.to_ascii_lowercase();
    let installation = installation_id.to_ascii_lowercase();
    let incarnation = shop_incarnation_id.to_ascii_lowercase();
    let binding = ShopKeyAuthorityBinding {
        scope: "shop-key-authority",
        workspace_id: &workspace,
        installation_id: &installation,
        shop_id,
        shop_incarnation_id: &incarnation,
        protected_purpose: purpose,
        protected_version: key_version,
    };
    let bytes = serde_json::to_vec(&binding)
        .map_err(|error| IoError::other(format!("protected key binding serialization failed: {error}")))?;
    let digest = hex_encode(&sha256(&[BINDING_DOMAIN, &bytes]));
    Ok((bytes, digest))
}

fn envelope_aad(
    envelope: &ProtectedValueEnvelope,
    binding_json: &[u8],
) -> Result<Vec<u8>, IoError> {
    let metadata = ProtectedValueMetadata {
        format: &envelope.format,
        version: envelope.version,
        algorithm: &envelope.algorithm,
        key: &envelope.key,
        binding_sha256: &envelope.binding_sha256,
    };
    let metadata_json = serde_json::to_vec(&metadata)
        .map_err(|error| IoError::other(format!("protected key metadata serialization failed: {error}")))?;
    let mut aad = Vec::with_capacity(AAD_DOMAIN.len() + metadata_json.len() + 1 + binding_json.len());
    aad.extend_from_slice(AAD_DOMAIN);
    aad.extend_from_slice(&metadata_json);
    aad.push(0);
    aad.extend_from_slice(binding_json);
    Ok(aad)
}

fn validate_envelope(envelope: &ProtectedValueEnvelope, wrapping_key_id: &str) -> Result<(), IoError> {
    if envelope.format != ENVELOPE_FORMAT
        || envelope.version != ENVELOPE_VERSION
        || envelope.algorithm != ENVELOPE_ALGORITHM
        || envelope.key.format_version != DESCRIPTOR_FORMAT_VERSION
        || envelope.key.purpose != WRAPPING_PURPOSE
        || envelope.key.version != WRAPPING_VERSION
        || envelope.key.key_id != wrapping_key_id
        || !is_lower_hex(&envelope.binding_sha256, 64)
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "protected key envelope format, key, or purpose is invalid",
        ));
    }
    Ok(())
}

fn protected_value_key_id(key: &[u8; 32], purpose: &str, version: u32) -> String {
    let version = version.to_string();
    hex_encode(&sha256(&[
        KEY_ID_DOMAIN,
        purpose.as_bytes(),
        b"\0",
        version.as_bytes(),
        b"\0",
        key,
    ]))
}

fn validate_context(
    workspace_id: &str,
    installation_id: &str,
    shop_id: &str,
    shop_incarnation_id: &str,
) -> Result<(), IoError> {
    if !is_hex_identity(workspace_id)
        || !is_hex_identity(installation_id)
        || !is_hex_identity(shop_incarnation_id)
        || shop_id.is_empty()
        || shop_id.len() > 64
        || shop_id.trim() != shop_id
        || shop_id.chars().any(|character| character.is_control())
    {
        return Err(IoError::new(
            ErrorKind::InvalidInput,
            "protected shop-key transport context is invalid",
        ));
    }
    Ok(())
}

fn validate_database_file(path: &Path) -> Result<(), IoError> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "protected key database is not a regular file",
        ));
    }
    Ok(())
}

fn is_hex_identity(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn is_lower_hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn decode_key_hex(value: &str) -> Result<[u8; 32], IoError> {
    if !is_lower_hex(value, 64) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "protected key plaintext must be 64 lowercase hexadecimal characters",
        ));
    }
    hex_decode_exact::<32>(value, "protected shop key")
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = chunk.get(1).copied().unwrap_or(0);
        let third = chunk.get(2).copied().unwrap_or(0);
        output.push(TABLE[(first >> 2) as usize] as char);
        output.push(TABLE[(((first & 0x03) << 4) | (second >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(TABLE[(((second & 0x0f) << 2) | (third >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(TABLE[(third & 0x3f) as usize] as char);
        } else {
            output.push('=');
        }
    }
    output
}

fn decode_base64(value: &str, label: &str) -> Result<Vec<u8>, IoError> {
    if value.is_empty() {
        return Ok(Vec::new());
    }
    if value.len() % 4 != 0 {
        return Err(IoError::new(ErrorKind::InvalidData, format!("{label} is not canonical base64")));
    }
    let bytes = value.as_bytes();
    let mut output = Vec::with_capacity(value.len() / 4 * 3);
    for (index, quartet) in bytes.chunks_exact(4).enumerate() {
        let last = index + 1 == bytes.len() / 4;
        let a = base64_value(quartet[0], label)?;
        let b = base64_value(quartet[1], label)?;
        let c_padding = quartet[2] == b'=';
        let d_padding = quartet[3] == b'=';
        if (!last && (c_padding || d_padding)) || (c_padding && !d_padding) {
            return Err(IoError::new(ErrorKind::InvalidData, format!("{label} has invalid padding")));
        }
        let c = if c_padding { 0 } else { base64_value(quartet[2], label)? };
        let d = if d_padding { 0 } else { base64_value(quartet[3], label)? };
        output.push((a << 2) | (b >> 4));
        if !c_padding {
            output.push((b << 4) | (c >> 2));
        }
        if !d_padding {
            output.push((c << 6) | d);
        }
    }
    if base64_encode(&output) != value {
        clear_bytes(&mut output);
        return Err(IoError::new(ErrorKind::InvalidData, format!("{label} is not canonical base64")));
    }
    Ok(output)
}

fn decode_base64_exact<const N: usize>(value: &str, label: &str) -> Result<[u8; N], IoError> {
    let mut decoded = decode_base64(value, label)?;
    if decoded.len() != N {
        clear_bytes(&mut decoded);
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("{label} must contain exactly {N} bytes"),
        ));
    }
    let mut output = [0_u8; N];
    output.copy_from_slice(&decoded);
    clear_bytes(&mut decoded);
    Ok(output)
}

fn base64_value(value: u8, label: &str) -> Result<u8, IoError> {
    match value {
        b'A'..=b'Z' => Ok(value - b'A'),
        b'a'..=b'z' => Ok(value - b'a' + 26),
        b'0'..=b'9' => Ok(value - b'0' + 52),
        b'+' => Ok(62),
        b'/' => Ok(63),
        _ => Err(IoError::new(ErrorKind::InvalidData, format!("{label} is not canonical base64"))),
    }
}

fn clear_string(value: &mut String) {
    unsafe {
        clear_bytes(value.as_bytes_mut());
    }
    value.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64_codec_is_canonical() {
        for value in [b"".as_slice(), b"a", b"ab", b"abc", &[0_u8; 12], &[0xff_u8; 16]] {
            let encoded = base64_encode(value);
            assert_eq!(decode_base64(&encoded, "test").unwrap(), value);
        }
        assert!(decode_base64("YR==", "test").is_err());
        assert!(decode_base64("a===", "test").is_err());
    }

    #[test]
    fn purpose_key_ids_are_separated() {
        let key = [0x42_u8; 32];
        assert_ne!(
            protected_value_key_id(&key, "shop-data", 1),
            protected_value_key_id(&key, "shop-secret", 1)
        );
    }
}
