use sha2::{Digest, Sha256};
use std::time::{SystemTime, UNIX_EPOCH};

const DEVICE_BINDING_PREFIX: &str = "sfdb1_";
const CLOCK_PAYLOAD_PREFIX: &[u8; 8] = b"SFLC0001";
const DPAPI_ENTROPY_DOMAIN: &[u8] = b"sahelflow.license-clock-anchor.dpapi.v1\0";

fn now_unix_ms() -> Result<u64, String> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "system clock precedes the Unix epoch".to_owned())?;
    u64::try_from(elapsed.as_millis()).map_err(|_| "system clock is out of range".to_owned())
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

fn clock_payload(unix_ms: u64) -> [u8; 16] {
    let mut payload = [0_u8; 16];
    payload[..8].copy_from_slice(CLOCK_PAYLOAD_PREFIX);
    payload[8..].copy_from_slice(&unix_ms.to_le_bytes());
    payload
}

fn parse_clock_payload(payload: &[u8]) -> Result<u64, String> {
    if payload.len() != 16 || &payload[..8] != CLOCK_PAYLOAD_PREFIX {
        return Err("protected license clock anchor has an invalid format".to_owned());
    }
    let mut encoded = [0_u8; 8];
    encoded.copy_from_slice(&payload[8..]);
    Ok(u64::from_le_bytes(encoded))
}

pub(crate) fn observe(
    device_binding: &str,
    authority_file_exists: bool,
) -> Result<Option<u64>, String> {
    let digest = validate_device_binding(device_binding)?;
    let now = now_unix_ms()?;
    observe_platform(device_binding, digest, authority_file_exists, now)
}

#[cfg(not(windows))]
fn observe_platform(
    _device_binding: &str,
    _device_digest: &str,
    _authority_file_exists: bool,
    _now: u64,
) -> Result<Option<u64>, String> {
    Err("the protected license clock anchor is available only on Windows".to_owned())
}

#[cfg(windows)]
fn observe_platform(
    device_binding: &str,
    device_digest: &str,
    authority_file_exists: bool,
    now: u64,
) -> Result<Option<u64>, String> {
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

    let previous = match read_registry_value(key, &value_name) {
        Ok(Some(ciphertext)) => match unprotect(&ciphertext, device_binding)
            .and_then(|plaintext| parse_clock_payload(&plaintext))
        {
            Ok(value) => Some(value),
            Err(_) => return Ok(None),
        },
        Ok(None) if authority_file_exists => return Ok(None),
        Ok(None) => None,
        Err(_) => return Ok(None),
    };
    let high_water = previous.map_or(now, |value| value.max(now));
    if previous != Some(high_water) {
        let ciphertext = protect(&clock_payload(high_water), device_binding)?;
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
    Ok(Some(high_water))
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
    use super::{clock_payload, parse_clock_payload, validate_device_binding};

    #[test]
    fn validates_only_opaque_device_bindings() {
        assert!(validate_device_binding(&format!("sfdb1_{}", "a".repeat(64))).is_ok());
        assert!(validate_device_binding("raw-machine-id").is_err());
        assert!(validate_device_binding(&format!("sfdb1_{}", "g".repeat(64))).is_err());
    }

    #[test]
    fn clock_payload_is_exact_and_versioned() {
        let payload = clock_payload(1_754_112_000_000);
        assert_eq!(parse_clock_payload(&payload), Ok(1_754_112_000_000));
        assert!(parse_clock_payload(b"invalid").is_err());
    }
}
