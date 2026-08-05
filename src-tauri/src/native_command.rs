use crate::key_hierarchy::{derive_installation_key, PURPOSE_NATIVE_COMMAND_BRIDGE};
use crate::native_crypto::{
    constant_time_equal, frame, hex_decode_exact, hex_encode, hmac_sha256, random_array,
};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::io::{Error as IoError, ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const TOKEN_FORMAT_VERSION: u8 = 1;
const TOKEN_MAC_DOMAIN: &[u8] = b"sahelflow.native-command.authorization.v1\0";
const REPLAY_FORMAT_VERSION: u8 = 1;
const REPLAY_MAC_DOMAIN: &[u8] = b"sahelflow.native-command.replay.v1\0";
const MAX_TOKEN_BYTES: usize = 16 * 1024;
const MAX_REPLAY_BYTES: u64 = 1024 * 1024;
const MAX_CLOCK_SKEW_MS: u64 = 5_000;
const MAX_LIFETIME_MS: u64 = 120_000;

pub(crate) struct NativeCommandReplay {
    path: PathBuf,
    seen: BTreeMap<String, u64>,
    loaded: bool,
}

impl NativeCommandReplay {
    pub(crate) fn new(path: PathBuf) -> Self {
        Self {
            path,
            seen: BTreeMap::new(),
            loaded: false,
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NativeCommandPayload {
    format_version: u8,
    action: String,
    workspace_id: String,
    installation_id: String,
    issued_at_unix_ms: u64,
    expires_at_unix_ms: u64,
    nonce: String,
    resource: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplayUnsigned {
    format_version: u8,
    seen: BTreeMap<String, u64>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplayDocument {
    unsigned: ReplayUnsigned,
    mac_hex: String,
}

pub(crate) fn verify_authorization(
    replay: &Mutex<NativeCommandReplay>,
    installation_root: &[u8; 32],
    workspace_id: &str,
    installation_id: &str,
    expected_action: &str,
    expected_resource: &str,
    token: &str,
) -> Result<(), IoError> {
    if token.len() > MAX_TOKEN_BYTES {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "native command authorization is oversized",
        ));
    }
    let (payload_hex, mac_hex) = token.split_once('.').ok_or_else(|| {
        IoError::new(
            ErrorKind::PermissionDenied,
            "native command authorization format is invalid",
        )
    })?;
    let payload_bytes = crate::native_crypto::hex_decode(
        payload_hex,
        "native command authorization payload",
    )?;
    let supplied_mac = hex_decode_exact::<32>(mac_hex, "native command authorization MAC")?;
    let derived = derive_installation_key(
        installation_root,
        workspace_id,
        installation_id,
        PURPOSE_NATIVE_COMMAND_BRIDGE,
        1,
    )?;
    let actual_mac = hmac_sha256(
        &derived.key,
        &frame(TOKEN_MAC_DOMAIN, &[payload_bytes.as_slice()]),
    );
    if !constant_time_equal(&supplied_mac, &actual_mac) {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "native command authorization failed authentication",
        ));
    }

    let payload: NativeCommandPayload = serde_json::from_slice(&payload_bytes).map_err(|error| {
        IoError::new(
            ErrorKind::PermissionDenied,
            format!("native command authorization payload is invalid: {error}"),
        )
    })?;
    if payload.format_version != TOKEN_FORMAT_VERSION
        || payload.action != expected_action
        || payload.workspace_id != workspace_id
        || payload.installation_id != installation_id
        || payload.resource != expected_resource
        || payload.nonce.len() != 32
        || !payload.nonce.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "native command authorization belongs to another action or authority",
        ));
    }

    let now = now_unix_ms()?;
    if payload.issued_at_unix_ms > now.saturating_add(MAX_CLOCK_SKEW_MS)
        || payload.expires_at_unix_ms <= now
        || payload.expires_at_unix_ms <= payload.issued_at_unix_ms
        || payload
            .expires_at_unix_ms
            .saturating_sub(payload.issued_at_unix_ms)
            > MAX_LIFETIME_MS
    {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "native command authorization is expired or has an invalid lifetime",
        ));
    }

    let mut replay = replay
        .lock()
        .map_err(|_| IoError::other("native command replay authority is poisoned"))?;
    load_replay_if_needed(&mut replay, &derived.key)?;
    replay.seen.retain(|_, expiry| *expiry > now);
    if replay.seen.contains_key(&payload.nonce) {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "native command authorization was already consumed",
        ));
    }
    replay
        .seen
        .insert(payload.nonce, payload.expires_at_unix_ms);
    persist_replay(&replay, &derived.key)?;
    Ok(())
}

fn load_replay_if_needed(replay: &mut NativeCommandReplay, key: &[u8; 32]) -> Result<(), IoError> {
    if replay.loaded {
        return Ok(());
    }
    if !replay.path.exists() {
        replay.loaded = true;
        return Ok(());
    }
    reject_link(&replay.path)?;
    let metadata = fs::metadata(&replay.path)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_REPLAY_BYTES {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "native command replay authority has invalid dimensions",
        ));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    fs::File::open(&replay.path)?
        .take(MAX_REPLAY_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_REPLAY_BYTES {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "native command replay authority exceeds its size limit",
        ));
    }
    let document: ReplayDocument = serde_json::from_slice(&bytes).map_err(|error| {
        IoError::new(
            ErrorKind::InvalidData,
            format!("native command replay authority is malformed: {error}"),
        )
    })?;
    if document.unsigned.format_version != REPLAY_FORMAT_VERSION {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "native command replay authority version is unsupported",
        ));
    }
    let unsigned = serde_json::to_vec(&document.unsigned)
        .map_err(|error| IoError::other(format!("could not encode replay authority: {error}")))?;
    let supplied = hex_decode_exact::<32>(&document.mac_hex, "native replay authority MAC")?;
    let actual = hmac_sha256(key, &frame(REPLAY_MAC_DOMAIN, &[&unsigned]));
    if !constant_time_equal(&supplied, &actual) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "native command replay authority failed authentication",
        ));
    }
    replay.seen = document.unsigned.seen;
    replay.loaded = true;
    Ok(())
}

fn persist_replay(replay: &NativeCommandReplay, key: &[u8; 32]) -> Result<(), IoError> {
    let unsigned = ReplayUnsigned {
        format_version: REPLAY_FORMAT_VERSION,
        seen: replay.seen.clone(),
    };
    let unsigned_bytes = serde_json::to_vec(&unsigned)
        .map_err(|error| IoError::other(format!("could not encode replay authority: {error}")))?;
    let document = ReplayDocument {
        unsigned,
        mac_hex: hex_encode(&hmac_sha256(
            key,
            &frame(REPLAY_MAC_DOMAIN, &[&unsigned_bytes]),
        )),
    };
    let mut bytes = serde_json::to_vec_pretty(&document)
        .map_err(|error| IoError::other(format!("could not encode replay authority: {error}")))?;
    bytes.push(b'\n');
    if bytes.len() as u64 > MAX_REPLAY_BYTES {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "native command replay authority exceeds its size limit",
        ));
    }
    if let Some(parent) = replay.path.parent() {
        fs::create_dir_all(parent)?;
        reject_link(parent)?;
    }
    reject_link(&replay.path)?;
    let temporary = replay.path.with_extension(format!(
        "{}.tmp",
        hex_encode(&random_array::<8>()?),
    ));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    replace_file(&temporary, &replay.path)
}

fn reject_link(path: &Path) -> Result<(), IoError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if path_is_link(&metadata) => Err(IoError::new(
            ErrorKind::InvalidData,
            format!("native command authority path is a link: {}", path.display()),
        )),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
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

#[cfg(windows)]
fn replace_file(source: &Path, target: &Path) -> Result<(), IoError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let source_wide = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target_wide = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    if unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        let error = IoError::last_os_error();
        let _ = fs::remove_file(source);
        return Err(error);
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file(source: &Path, target: &Path) -> Result<(), IoError> {
    fs::rename(source, target)?;
    let parent = target.parent().ok_or_else(|| {
        IoError::new(ErrorKind::InvalidInput, "native command authority has no parent")
    })?;
    fs::File::open(parent)?.sync_all()
}

fn now_unix_ms() -> Result<u64, IoError> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| IoError::other("system clock precedes the Unix epoch"))?;
    u64::try_from(elapsed.as_millis())
        .map_err(|_| IoError::other("system clock is out of range"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn token(
        root: &[u8; 32],
        workspace: &str,
        installation: &str,
        nonce: &str,
    ) -> String {
        let now = now_unix_ms().unwrap();
        let payload = format!(
            "{{\"formatVersion\":1,\"action\":\"survivability-backup:create\",\"workspaceId\":\"{workspace}\",\"installationId\":\"{installation}\",\"issuedAtUnixMs\":{now},\"expiresAtUnixMs\":{},\"nonce\":\"{nonce}\",\"resource\":\"workspace\"}}",
            now + 60_000
        );
        let derived = derive_installation_key(
            root,
            workspace,
            installation,
            PURPOSE_NATIVE_COMMAND_BRIDGE,
            1,
        )
        .unwrap();
        let mac = hmac_sha256(
            &derived.key,
            &frame(TOKEN_MAC_DOMAIN, &[payload.as_bytes()]),
        );
        format!("{}.{}", hex_encode(payload.as_bytes()), hex_encode(&mac))
    }

    fn test_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "sahelflow-native-command-replay-{}-{}.json",
            std::process::id(),
            hex_encode(&random_array::<8>().unwrap())
        ))
    }

    #[test]
    fn authorization_is_single_use_across_replay_reloads() {
        let path = test_path();
        let root = [0x44_u8; 32];
        let workspace = "10".repeat(16);
        let installation = "20".repeat(16);
        let nonce = hex_encode(&random_array::<16>().unwrap());
        let token = token(&root, &workspace, &installation, &nonce);
        let replay = Mutex::new(NativeCommandReplay::new(path.clone()));
        verify_authorization(
            &replay,
            &root,
            &workspace,
            &installation,
            "survivability-backup:create",
            "workspace",
            &token,
        )
        .unwrap();
        let reloaded = Mutex::new(NativeCommandReplay::new(path.clone()));
        assert!(verify_authorization(
            &reloaded,
            &root,
            &workspace,
            &installation,
            "survivability-backup:create",
            "workspace",
            &token,
        )
        .is_err());
        let _ = fs::remove_file(path);
    }
}
