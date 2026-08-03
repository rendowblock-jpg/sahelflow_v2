use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const DEVICE_BINDING_PREFIX: &str = "sfdb1_";
const LEGACY_CLOCK_PAYLOAD_PREFIX: &[u8; 8] = b"SFLC0001";
const LEGACY_COMMERCIAL_PAYLOAD_PREFIX: &[u8; 8] = b"SFLC0002";
const COMMERCIAL_PAYLOAD_PREFIX: &[u8; 8] = b"SFLC0003";
const DPAPI_ENTROPY_DOMAIN: &[u8] = b"sahelflow.license-clock-anchor.dpapi.v1\0";
const COMMAND_KEY_DOMAIN: &[u8] = b"sahelflow.license-native-command.key.v1";
const REQUEST_MAC_DOMAIN: &str = "sahelflow.license-native-revocation.request.v2";
const ACK_MAC_DOMAIN: &str = "sahelflow.license-native-revocation.ack.v2";
const RUNTIME_OBSERVE_INTERVAL: Duration = Duration::from_secs(60);
const COMMAND_POLL_INTERVAL: Duration = Duration::from_millis(100);
const COMMAND_FORMAT_VERSION: u8 = 2;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct CommercialAnchor {
    pub(crate) high_water_ms: u64,
    pub(crate) minimum_revocation_epoch: u64,
    pub(crate) minimum_permanent_recovery_epoch: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RevocationRequest {
    format_version: u8,
    request_id: String,
    minimum_revocation_epoch: u64,
    initialize_permanent_recovery: bool,
    mac: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RevocationAcknowledgement<'a> {
    format_version: u8,
    request_id: &'a str,
    minimum_revocation_epoch: u64,
    high_water_ms: u64,
    minimum_permanent_recovery_epoch: u64,
    mac: String,
}

fn now_unix_ms() -> Result<u64, String> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "system clock precedes the Unix epoch".to_owned())?;
    u64::try_from(elapsed.as_millis()).map_err(|_| "system clock is out of range".to_owned())
}

fn permanent_recovery_challenge() -> Result<u64, String> {
    const RECOVERY_NAMESPACE_BIT: u64 = 1_u64 << 52;
    let mut bytes = [0_u8; 8];
    getrandom::getrandom(&mut bytes)
        .map_err(|error| format!("secure recovery randomness is unavailable: {error}"))?;
    Ok((u64::from_le_bytes(bytes) & (RECOVERY_NAMESPACE_BIT - 1)) | RECOVERY_NAMESPACE_BIT)
}

fn validate_device_binding(device_binding: &str) -> Result<&str, String> {
    let digest = device_binding
        .strip_prefix(DEVICE_BINDING_PREFIX)
        .ok_or_else(|| "native device binding has an invalid prefix".to_owned())?;
    if digest.len() != 64 || !digest.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("native device binding has an invalid digest".to_owned());
    }
    Ok(digest)
}

fn entropy(device_binding: &str) -> [u8; 32] {
    let mut digest = Sha256::new();
    digest.update(DPAPI_ENTROPY_DOMAIN);
    digest.update(device_binding.as_bytes());
    digest.finalize().into()
}

fn clock_payload(anchor: CommercialAnchor) -> [u8; 32] {
    let mut payload = [0_u8; 32];
    payload[..8].copy_from_slice(COMMERCIAL_PAYLOAD_PREFIX);
    payload[8..16].copy_from_slice(&anchor.high_water_ms.to_le_bytes());
    payload[16..24].copy_from_slice(&anchor.minimum_revocation_epoch.to_le_bytes());
    payload[24..].copy_from_slice(&anchor.minimum_permanent_recovery_epoch.to_le_bytes());
    payload
}

fn parse_clock_payload(payload: &[u8]) -> Result<(CommercialAnchor, bool), String> {
    if payload.len() == 16 && &payload[..8] == LEGACY_CLOCK_PAYLOAD_PREFIX {
        let mut encoded = [0_u8; 8];
        encoded.copy_from_slice(&payload[8..]);
        return Ok((
            CommercialAnchor {
                high_water_ms: u64::from_le_bytes(encoded),
                minimum_revocation_epoch: 0,
                minimum_permanent_recovery_epoch: 0,
            },
            true,
        ));
    }
    if payload.len() == 24 && &payload[..8] == LEGACY_COMMERCIAL_PAYLOAD_PREFIX {
        let mut clock = [0_u8; 8];
        clock.copy_from_slice(&payload[8..16]);
        let mut epoch = [0_u8; 8];
        epoch.copy_from_slice(&payload[16..]);
        return Ok((
            CommercialAnchor {
                high_water_ms: u64::from_le_bytes(clock),
                minimum_revocation_epoch: u64::from_le_bytes(epoch),
                minimum_permanent_recovery_epoch: 0,
            },
            true,
        ));
    }
    if payload.len() != 32 || &payload[..8] != COMMERCIAL_PAYLOAD_PREFIX {
        return Err("protected commercial anchor has an invalid format".to_owned());
    }
    let mut clock = [0_u8; 8];
    clock.copy_from_slice(&payload[8..16]);
    let mut epoch = [0_u8; 8];
    epoch.copy_from_slice(&payload[16..24]);
    let mut recovery = [0_u8; 8];
    recovery.copy_from_slice(&payload[24..]);
    Ok((
        CommercialAnchor {
            high_water_ms: u64::from_le_bytes(clock),
            minimum_revocation_epoch: u64::from_le_bytes(epoch),
            minimum_permanent_recovery_epoch: u64::from_le_bytes(recovery),
        },
        false,
    ))
}

pub(crate) fn observe(
    device_binding: &str,
    installation_authority_preexists: bool,
) -> Result<Option<CommercialAnchor>, String> {
    let digest = validate_device_binding(device_binding)?;
    let now = now_unix_ms()?;
    observe_platform(
        device_binding,
        digest,
        installation_authority_preexists,
        now,
    )
}

pub(crate) fn command_key(installation_root: &[u8; 32]) -> [u8; 32] {
    hmac_sha256(installation_root, COMMAND_KEY_DOMAIN)
}

pub(crate) fn start_runtime_observer(
    device_binding: String,
    system_directory: PathBuf,
    command_key: [u8; 32],
) -> Result<(), String> {
    validate_device_binding(&device_binding)?;
    std::thread::Builder::new()
        .name("sahelflow-license-clock".to_owned())
        .spawn(move || {
            let mut last_observation = Instant::now();
            loop {
                if let Err(error) =
                    process_revocation_requests(&device_binding, &system_directory, &command_key)
                {
                    eprintln!("[sahelflow] native revocation request failed: {error}");
                }
                if last_observation.elapsed() >= RUNTIME_OBSERVE_INTERVAL {
                    if let Err(error) = observe(&device_binding, true) {
                        eprintln!(
                            "[sahelflow] protected license clock observation failed: {error}"
                        );
                    }
                    last_observation = Instant::now();
                }
                std::thread::sleep(COMMAND_POLL_INTERVAL);
            }
        })
        .map(|_| ())
        .map_err(|error| format!("could not start protected license clock observation: {error}"))
}

fn process_revocation_requests(
    device_binding: &str,
    system_directory: &Path,
    command_key: &[u8; 32],
) -> Result<(), String> {
    let directory = system_directory.join("license-native-requests");
    if !directory.is_dir() {
        return Ok(());
    }
    let mut processed = 0_u8;
    for entry in fs::read_dir(&directory)
        .map_err(|error| format!("could not read native license requests: {error}"))?
    {
        let entry =
            entry.map_err(|error| format!("could not read a native license request: {error}"))?;
        let path = entry.path();
        if !path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.ends_with(".request.json"))
        {
            continue;
        }
        if processed >= 32 {
            break;
        }
        processed += 1;
        let encoded = match fs::read(&path) {
            Ok(value) => value,
            Err(error) => {
                eprintln!("[sahelflow] unreadable native license request removed: {error}");
                let _ = fs::remove_file(&path);
                continue;
            }
        };
        let request: RevocationRequest = match serde_json::from_slice(&encoded) {
            Ok(value) => value,
            Err(_) => {
                eprintln!("[sahelflow] invalid native license request removed");
                let _ = fs::remove_file(&path);
                continue;
            }
        };
        if request.format_version != COMMAND_FORMAT_VERSION
            || !valid_request_id(&request.request_id)
            || !verify_request_mac(
                command_key,
                &request.mac,
                &request.request_id,
                request.minimum_revocation_epoch,
                request.initialize_permanent_recovery,
            )
        {
            eprintln!("[sahelflow] unauthenticated native license request removed");
            let _ = fs::remove_file(&path);
            continue;
        }
        let anchor = advance_revocation_floor(
            device_binding,
            request.minimum_revocation_epoch,
            request.initialize_permanent_recovery,
        )?;
        let acknowledgement_path = directory.join(format!("{}.ack.json", request.request_id));
        let acknowledgement = RevocationAcknowledgement {
            format_version: COMMAND_FORMAT_VERSION,
            request_id: &request.request_id,
            minimum_revocation_epoch: anchor.minimum_revocation_epoch,
            high_water_ms: anchor.high_water_ms,
            minimum_permanent_recovery_epoch: anchor.minimum_permanent_recovery_epoch,
            mac: acknowledgement_mac_hex(
                command_key,
                &request.request_id,
                anchor.minimum_revocation_epoch,
                anchor.high_water_ms,
                anchor.minimum_permanent_recovery_epoch,
            ),
        };
        write_json_atomic(&acknowledgement_path, &acknowledgement)?;
        fs::remove_file(&path).map_err(|error| {
            format!("could not remove completed native license request: {error}")
        })?;
    }
    Ok(())
}

fn valid_request_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn request_mac_message(
    request_id: &str,
    epoch: u64,
    initialize_permanent_recovery: bool,
) -> Vec<u8> {
    format!(
        "{REQUEST_MAC_DOMAIN}\0{request_id}\0{epoch}\0{}",
        u8::from(initialize_permanent_recovery)
    )
    .into_bytes()
}

fn acknowledgement_mac_message(
    request_id: &str,
    epoch: u64,
    high_water_ms: u64,
    minimum_permanent_recovery_epoch: u64,
) -> Vec<u8> {
    format!(
        "{ACK_MAC_DOMAIN}\0{request_id}\0{epoch}\0{high_water_ms}\0{minimum_permanent_recovery_epoch}"
    )
    .into_bytes()
}

fn request_mac_hex(
    key: &[u8; 32],
    request_id: &str,
    epoch: u64,
    initialize_permanent_recovery: bool,
) -> String {
    hmac_sha256(
        key,
        &request_mac_message(request_id, epoch, initialize_permanent_recovery),
    )
    .iter()
    .map(|byte| format!("{byte:02x}"))
    .collect()
}

fn acknowledgement_mac_hex(
    key: &[u8; 32],
    request_id: &str,
    epoch: u64,
    high_water_ms: u64,
    minimum_permanent_recovery_epoch: u64,
) -> String {
    hmac_sha256(
        key,
        &acknowledgement_mac_message(
            request_id,
            epoch,
            high_water_ms,
            minimum_permanent_recovery_epoch,
        ),
    )
    .iter()
    .map(|byte| format!("{byte:02x}"))
    .collect()
}

fn verify_request_mac(
    key: &[u8; 32],
    supplied: &str,
    request_id: &str,
    epoch: u64,
    initialize_permanent_recovery: bool,
) -> bool {
    let expected = request_mac_hex(key, request_id, epoch, initialize_permanent_recovery);
    supplied.len() == expected.len()
        && supplied
            .bytes()
            .zip(expected.bytes())
            .fold(0_u8, |difference, (left, right)| {
                difference | (left ^ right)
            })
            == 0
}

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
    outer.finalize().into()
}

fn write_json_atomic(path: &Path, value: &impl Serialize) -> Result<(), String> {
    fs::create_dir_all(
        path.parent()
            .ok_or_else(|| "native license path has no parent".to_owned())?,
    )
    .map_err(|error| format!("could not create native license request directory: {error}"))?;
    let temporary = path.with_extension(format!("{}.tmp", now_unix_ms()?));
    let mut bytes = serde_json::to_vec(value)
        .map_err(|error| format!("could not encode native license acknowledgement: {error}"))?;
    bytes.push(b'\n');
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)
        .map_err(|error| format!("could not stage native license acknowledgement: {error}"))?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("could not persist native license acknowledgement: {error}"))?;
    drop(file);
    fs::rename(&temporary, path)
        .map_err(|error| format!("could not publish native license acknowledgement: {error}"))
}

#[cfg(not(windows))]
fn observe_platform(
    _device_binding: &str,
    _device_digest: &str,
    _installation_authority_preexists: bool,
    _now: u64,
) -> Result<Option<CommercialAnchor>, String> {
    Err("the protected license clock anchor is available only on Windows".to_owned())
}

#[cfg(not(windows))]
fn advance_revocation_floor(
    _device_binding: &str,
    _minimum_revocation_epoch: u64,
    _initialize_permanent_recovery: bool,
) -> Result<CommercialAnchor, String> {
    Err("the protected commercial anchor is available only on Windows".to_owned())
}

#[cfg(windows)]
fn observe_platform(
    device_binding: &str,
    device_digest: &str,
    installation_authority_preexists: bool,
    now: u64,
) -> Result<Option<CommercialAnchor>, String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_BINARY,
    };

    const SUBKEY: &str = "Software\\SahelFlow\\CommercialAuthority";
    let subkey = wide(SUBKEY);
    let value_name = wide(&format!("LicenseClockV1_{device_digest}"));
    let mut key: HKEY = null_mut();
    let mut disposition = 0_u32;
    let opened = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            null(),
            0,
            KEY_READ | KEY_WRITE,
            null(),
            &mut key,
            &mut disposition,
        )
    };
    if opened != ERROR_SUCCESS {
        return Err(format!(
            "could not open the protected license clock registry authority: {}",
            std::io::Error::from_raw_os_error(opened as i32)
        ));
    }
    let _key_guard = RegistryKey(key);

    let (previous, legacy) = match read_registry_value(key, &value_name) {
        Ok(Some(ciphertext)) => match unprotect(&ciphertext, device_binding)
            .and_then(|plaintext| parse_clock_payload(&plaintext))
        {
            Ok((value, legacy)) => (Some(value), legacy),
            Err(_) => return Ok(None),
        },
        Ok(None) if installation_authority_preexists => return Ok(None),
        Ok(None) => (None, false),
        Err(_) => return Ok(None),
    };
    let anchor = previous.map_or(
        CommercialAnchor {
            high_water_ms: now,
            minimum_revocation_epoch: 0,
            minimum_permanent_recovery_epoch: 0,
        },
        |value| CommercialAnchor {
            high_water_ms: value.high_water_ms.max(now),
            minimum_revocation_epoch: value.minimum_revocation_epoch,
            minimum_permanent_recovery_epoch: value.minimum_permanent_recovery_epoch,
        },
    );
    if legacy || previous != Some(anchor) {
        let ciphertext = protect(&clock_payload(anchor), device_binding)?;
        let written = unsafe {
            RegSetValueExW(
                key,
                value_name.as_ptr(),
                0,
                REG_BINARY,
                ciphertext.as_ptr(),
                u32::try_from(ciphertext.len())
                    .map_err(|_| "protected clock anchor is too large".to_owned())?,
            )
        };
        if written != ERROR_SUCCESS {
            return Ok(None);
        }
    }
    Ok(Some(anchor))
}

#[cfg(windows)]
fn advance_revocation_floor(
    device_binding: &str,
    minimum_revocation_epoch: u64,
    initialize_permanent_recovery: bool,
) -> Result<CommercialAnchor, String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCreateKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_READ, KEY_WRITE, REG_BINARY,
    };

    let device_digest = validate_device_binding(device_binding)?;
    let subkey = wide("Software\\SahelFlow\\CommercialAuthority");
    let value_name = wide(&format!("LicenseClockV1_{device_digest}"));
    let mut key: HKEY = null_mut();
    let mut disposition = 0_u32;
    let opened = unsafe {
        RegCreateKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            null(),
            0,
            KEY_READ | KEY_WRITE,
            null(),
            &mut key,
            &mut disposition,
        )
    };
    if opened != ERROR_SUCCESS {
        return Err("could not open protected commercial registry authority".to_owned());
    }
    let _key_guard = RegistryKey(key);
    let previous = match read_registry_value(key, &value_name) {
        Ok(Some(ciphertext)) => unprotect(&ciphertext, device_binding)
            .and_then(|plaintext| parse_clock_payload(&plaintext))
            .map(|(anchor, _)| anchor)?,
        Ok(None) => CommercialAnchor {
            high_water_ms: now_unix_ms()?,
            minimum_revocation_epoch: 0,
            minimum_permanent_recovery_epoch: 0,
        },
        Err(error) => return Err(error),
    };
    let minimum_permanent_recovery_epoch =
        if initialize_permanent_recovery && previous.minimum_permanent_recovery_epoch == 0 {
            permanent_recovery_challenge()?
        } else {
            previous.minimum_permanent_recovery_epoch
        };
    let anchor = CommercialAnchor {
        high_water_ms: previous.high_water_ms.max(now_unix_ms()?),
        minimum_revocation_epoch: previous
            .minimum_revocation_epoch
            .max(minimum_revocation_epoch),
        minimum_permanent_recovery_epoch,
    };
    let ciphertext = protect(&clock_payload(anchor), device_binding)?;
    let written = unsafe {
        RegSetValueExW(
            key,
            value_name.as_ptr(),
            0,
            REG_BINARY,
            ciphertext.as_ptr(),
            u32::try_from(ciphertext.len())
                .map_err(|_| "protected commercial anchor is too large".to_owned())?,
        )
    };
    if written != ERROR_SUCCESS {
        return Err("could not persist protected commercial revocation floor".to_owned());
    }
    Ok(anchor)
}

#[cfg(windows)]
struct RegistryKey(windows_sys::Win32::System::Registry::HKEY);

#[cfg(windows)]
impl Drop for RegistryKey {
    fn drop(&mut self) {
        if !self.0.is_null() {
            unsafe {
                windows_sys::Win32::System::Registry::RegCloseKey(self.0);
            }
        }
    }
}

#[cfg(windows)]
fn read_registry_value(
    key: windows_sys::Win32::System::Registry::HKEY,
    name: &[u16],
) -> Result<Option<Vec<u8>>, String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows_sys::Win32::System::Registry::{RegQueryValueExW, REG_BINARY};

    let mut value_type = 0_u32;
    let mut length = 0_u32;
    let measured = unsafe {
        RegQueryValueExW(
            key,
            name.as_ptr(),
            null(),
            &mut value_type,
            null_mut(),
            &mut length,
        )
    };
    if measured == ERROR_FILE_NOT_FOUND {
        return Ok(None);
    }
    if measured != ERROR_SUCCESS {
        return Err(format!(
            "could not read the protected license clock anchor: {}",
            std::io::Error::from_raw_os_error(measured as i32)
        ));
    }
    if value_type != REG_BINARY || length == 0 || length > 4096 {
        return Err(
            "protected license clock anchor has an invalid registry type or size".to_owned(),
        );
    }
    let mut value = vec![0_u8; length as usize];
    let read = unsafe {
        RegQueryValueExW(
            key,
            name.as_ptr(),
            null(),
            &mut value_type,
            value.as_mut_ptr(),
            &mut length,
        )
    };
    if read != ERROR_SUCCESS || value_type != REG_BINARY || length as usize != value.len() {
        return Err("protected license clock anchor changed while it was read".to_owned());
    }
    Ok(Some(value))
}

#[cfg(windows)]
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn protect(plaintext: &[u8], device_binding: &str) -> Result<Vec<u8>, String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let mut entropy = entropy(device_binding);
    let input = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(plaintext.len()).map_err(|_| "clock payload is too large")?,
        pbData: plaintext.as_ptr().cast_mut(),
    };
    let entropy_blob = CRYPT_INTEGER_BLOB {
        cbData: entropy.len() as u32,
        pbData: entropy.as_mut_ptr(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    let succeeded = unsafe {
        CryptProtectData(
            &input,
            null(),
            &entropy_blob,
            null_mut(),
            null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    entropy.fill(0);
    if succeeded == 0 || output.pbData.is_null() || output.cbData == 0 {
        if !output.pbData.is_null() {
            unsafe { LocalFree(output.pbData.cast()) };
        }
        return Err(format!(
            "could not protect the license clock anchor: {}",
            std::io::Error::last_os_error()
        ));
    }
    let ciphertext =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe { LocalFree(output.pbData.cast()) };
    Ok(ciphertext)
}

#[cfg(windows)]
fn unprotect(ciphertext: &[u8], device_binding: &str) -> Result<Vec<u8>, String> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let mut entropy = entropy(device_binding);
    let input = CRYPT_INTEGER_BLOB {
        cbData: u32::try_from(ciphertext.len()).map_err(|_| "clock anchor is too large")?,
        pbData: ciphertext.as_ptr().cast_mut(),
    };
    let entropy_blob = CRYPT_INTEGER_BLOB {
        cbData: entropy.len() as u32,
        pbData: entropy.as_mut_ptr(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    let succeeded = unsafe {
        CryptUnprotectData(
            &input,
            null_mut(),
            &entropy_blob,
            null_mut(),
            null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    entropy.fill(0);
    if succeeded == 0 || output.pbData.is_null() || output.cbData == 0 {
        if !output.pbData.is_null() {
            unsafe { LocalFree(output.pbData.cast()) };
        }
        return Err(format!(
            "could not authenticate the protected license clock anchor: {}",
            std::io::Error::last_os_error()
        ));
    }
    let plaintext =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe { LocalFree(output.pbData.cast()) };
    Ok(plaintext)
}

#[cfg(test)]
mod tests {
    use super::{
        clock_payload, hmac_sha256, parse_clock_payload, permanent_recovery_challenge,
        validate_device_binding, CommercialAnchor, LEGACY_CLOCK_PAYLOAD_PREFIX,
        LEGACY_COMMERCIAL_PAYLOAD_PREFIX,
    };

    #[test]
    fn validates_only_opaque_device_bindings() {
        assert!(validate_device_binding(&format!("sfdb1_{}", "a".repeat(64))).is_ok());
        assert!(validate_device_binding("raw-machine-id").is_err());
        assert!(validate_device_binding(&format!("sfdb1_{}", "g".repeat(64))).is_err());
    }

    #[test]
    fn clock_payload_is_exact_and_versioned() {
        let anchor = CommercialAnchor {
            high_water_ms: 1_754_112_000_000,
            minimum_revocation_epoch: 7,
            minimum_permanent_recovery_epoch: 42,
        };
        let payload = clock_payload(anchor);
        assert_eq!(parse_clock_payload(&payload), Ok((anchor, false)));
        let mut legacy = [0_u8; 16];
        legacy[..8].copy_from_slice(LEGACY_CLOCK_PAYLOAD_PREFIX);
        legacy[8..].copy_from_slice(&anchor.high_water_ms.to_le_bytes());
        assert_eq!(
            parse_clock_payload(&legacy),
            Ok((
                CommercialAnchor {
                    high_water_ms: anchor.high_water_ms,
                    minimum_revocation_epoch: 0,
                    minimum_permanent_recovery_epoch: 0,
                },
                true,
            ))
        );
        let mut legacy_commercial = [0_u8; 24];
        legacy_commercial[..8].copy_from_slice(LEGACY_COMMERCIAL_PAYLOAD_PREFIX);
        legacy_commercial[8..16].copy_from_slice(&anchor.high_water_ms.to_le_bytes());
        legacy_commercial[16..].copy_from_slice(&anchor.minimum_revocation_epoch.to_le_bytes());
        assert_eq!(
            parse_clock_payload(&legacy_commercial),
            Ok((
                CommercialAnchor {
                    high_water_ms: anchor.high_water_ms,
                    minimum_revocation_epoch: anchor.minimum_revocation_epoch,
                    minimum_permanent_recovery_epoch: 0,
                },
                true,
            ))
        );
        assert!(parse_clock_payload(b"invalid").is_err());
    }

    #[test]
    fn permanent_recovery_challenge_is_nonzero_and_javascript_safe() {
        let challenge = permanent_recovery_challenge().expect("secure challenge");
        assert!(((1_u64 << 52)..=9_007_199_254_740_991).contains(&challenge));
    }

    #[test]
    fn hmac_matches_rfc_4231_sha256_vector() {
        let digest = hmac_sha256(&[0x0b; 20], b"Hi There")
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        assert_eq!(
            digest,
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
    }
}
