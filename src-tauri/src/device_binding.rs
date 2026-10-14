use sha2::{Digest, Sha256};

const DEVICE_BINDING_DOMAIN: &[u8] = b"sahelflow.device-binding.v1";
const RAW_SMBIOS_HEADER_LEN: usize = 8;
const SYSTEM_INFORMATION_TYPE: u8 = 1;
const END_OF_TABLE_TYPE: u8 = 127;

fn next_structure(table: &[u8], formatted_end: usize) -> Result<usize, String> {
    let mut cursor = formatted_end;
    while cursor + 1 < table.len() {
        if table[cursor] == 0 && table[cursor + 1] == 0 {
            return Ok(cursor + 2);
        }
        cursor += 1;
    }
    Err("SMBIOS structure has no string terminator".to_owned())
}

fn extract_system_uuid(raw: &[u8]) -> Result<[u8; 16], String> {
    if raw.len() < RAW_SMBIOS_HEADER_LEN {
        return Err("raw SMBIOS data is truncated".to_owned());
    }
    let declared_length = u32::from_le_bytes(
        raw[4..8]
            .try_into()
            .map_err(|_| "raw SMBIOS length is invalid")?,
    ) as usize;
    if declared_length == 0 || declared_length > raw.len() - RAW_SMBIOS_HEADER_LEN {
        return Err("raw SMBIOS table length is invalid".to_owned());
    }

    let table = &raw[RAW_SMBIOS_HEADER_LEN..RAW_SMBIOS_HEADER_LEN + declared_length];
    let mut offset = 0;
    while offset + 4 <= table.len() {
        let structure_type = table[offset];
        let formatted_length = table[offset + 1] as usize;
        if formatted_length < 4 || offset + formatted_length > table.len() {
            return Err("SMBIOS structure length is invalid".to_owned());
        }
        if structure_type == SYSTEM_INFORMATION_TYPE {
            if formatted_length < 24 {
                return Err("SMBIOS system-information UUID is unavailable".to_owned());
            }
            let mut uuid = [0_u8; 16];
            uuid.copy_from_slice(&table[offset + 8..offset + 24]);
            if uuid.iter().all(|byte| *byte == 0) || uuid.iter().all(|byte| *byte == 0xff) {
                return Err("SMBIOS system-information UUID is not usable".to_owned());
            }
            return Ok(uuid);
        }
        if structure_type == END_OF_TABLE_TYPE {
            break;
        }
        offset = next_structure(table, offset + formatted_length)?;
    }
    Err("SMBIOS system-information structure is missing".to_owned())
}

fn binding_from_raw_smbios(raw: &[u8]) -> Result<String, String> {
    let uuid = extract_system_uuid(raw)?;
    let mut hasher = Sha256::new();
    hasher.update(DEVICE_BINDING_DOMAIN);
    hasher.update([0]);
    hasher.update(uuid);
    let digest = hasher.finalize();
    let mut encoded = String::with_capacity(70);
    encoded.push_str("sfdb1_");
    for byte in digest {
        use std::fmt::Write as _;
        write!(&mut encoded, "{byte:02x}")
            .map_err(|_| "device binding encoding failed".to_owned())?;
    }
    Ok(encoded)
}

#[cfg(target_os = "windows")]
fn raw_smbios() -> Result<Vec<u8>, String> {
    use windows_sys::Win32::System::SystemInformation::GetSystemFirmwareTable;

    const RSMB_PROVIDER: u32 = u32::from_be_bytes(*b"RSMB");
    let required = unsafe { GetSystemFirmwareTable(RSMB_PROVIDER, 0, std::ptr::null_mut(), 0) };
    if required == 0 {
        return Err(format!(
            "GetSystemFirmwareTable size query failed: {}",
            std::io::Error::last_os_error()
        ));
    }
    let mut raw = vec![0_u8; required as usize];
    let written =
        unsafe { GetSystemFirmwareTable(RSMB_PROVIDER, 0, raw.as_mut_ptr().cast(), required) };
    if written != required {
        raw.fill(0);
        return Err("GetSystemFirmwareTable returned an incomplete table".to_owned());
    }
    Ok(raw)
}

#[cfg(target_os = "windows")]
pub(crate) fn current_device_binding() -> Result<String, String> {
    let mut raw = raw_smbios()?;
    let binding = match binding_from_raw_smbios(&raw) {
        Ok(binding) => Ok(binding),
        Err(error) if uuid_unusable(&error) => machine_guid_binding(),
        Err(error) => Err(error),
    };
    raw.fill(0);
    binding
}

fn uuid_unusable(error: &str) -> bool {
    error.contains("not usable")
        || error.contains("is missing")
        || error.contains("is unavailable")
}

/// White-box machines ship an all-zero SMBIOS UUID. The Windows MachineGuid
/// is the fallback identity. It uses a different domain byte so it can never
/// collide with a real SMBIOS binding.
pub(crate) fn binding_from_machine_guid(guid: &str) -> Result<String, String> {
    let trimmed = guid.trim();
    if trimmed.len() < 8 || trimmed.chars().all(|char| char == '0' || char == '-') {
        return Err("Windows MachineGuid is not usable".to_owned());
    }
    let mut hasher = Sha256::new();
    hasher.update(DEVICE_BINDING_DOMAIN);
    hasher.update([1]);
    hasher.update(trimmed.as_bytes());
    let digest = hasher.finalize();
    let mut encoded = String::with_capacity(70);
    encoded.push_str("sfdb1_");
    for byte in digest {
        use std::fmt::Write as _;
        write!(&mut encoded, "{byte:02x}")
            .map_err(|_| "device binding encoding failed".to_owned())?;
    }
    Ok(encoded)
}

#[cfg(target_os = "windows")]
fn machine_guid_binding() -> Result<String, String> {
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{RegGetValueW, HKEY_LOCAL_MACHINE, RRF_RT_REG_SZ};
    let subkey: Vec<u16> = std::ffi::OsStr::new("SOFTWARE\\Microsoft\\Cryptography")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let name: Vec<u16> = std::ffi::OsStr::new("MachineGuid")
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let mut bytes = vec![0_u16; 80];
    let mut size = (bytes.len() * 2) as u32;
    let read = unsafe {
        RegGetValueW(
            HKEY_LOCAL_MACHINE,
            subkey.as_ptr(),
            name.as_ptr(),
            RRF_RT_REG_SZ,
            null_mut(),
            bytes.as_mut_ptr().cast(),
            &mut size,
        )
    };
    if read != ERROR_SUCCESS {
        return Err(format!(
            "Windows MachineGuid is unavailable ({})",
            std::io::Error::from_raw_os_error(read as i32)
        ));
    }
    let chars = (size as usize / 2).saturating_sub(1);
    let guid = String::from_utf16_lossy(&bytes[..chars.min(bytes.len())]);
    binding_from_machine_guid(&guid)
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn current_device_binding() -> Result<String, String> {
    Err("SahelFlow device binding is supported only on Windows".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unusable_uuid_is_not_a_machine_guid_binding() {
        let zeros = binding_from_raw_smbios(&raw_table([0; 16]));
        assert!(zeros.expect_err("zero uuid").contains("not usable"));
        let guid = binding_from_machine_guid("4c4c4544-0032-4410-8051-b7c04f583532")
            .expect("machine guid");
        assert!(guid.starts_with("sfdb1_"));
        assert_ne!(
            guid,
            binding_from_machine_guid("4c4c4544-0032-4410-8051-b7c04f583533").expect("other")
        );
        assert!(binding_from_machine_guid("00000000-0000-0000-0000-000000000000").is_err());
    }

    fn raw_table(uuid: [u8; 16]) -> Vec<u8> {
        let mut table = vec![1, 25, 1, 0, 1, 2, 3, 4];
        table.extend_from_slice(&uuid);
        table.push(0);
        table.extend_from_slice(b"vendor\0product\0version\0serial\0\0");
        table.extend_from_slice(&[127, 4, 0xff, 0xff, 0, 0]);
        let mut raw = vec![0, 3, 6, 0];
        raw.extend_from_slice(&(table.len() as u32).to_le_bytes());
        raw.extend_from_slice(&table);
        raw
    }

    #[test]
    fn hashes_only_the_direct_smbios_system_uuid() {
        let raw = raw_table([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
        let binding = binding_from_raw_smbios(&raw).expect("device binding");
        assert_eq!(binding.len(), 70);
        assert!(binding.starts_with("sfdb1_"));
        assert_eq!(
            binding,
            binding_from_raw_smbios(&raw).expect("stable binding")
        );
        assert!(!binding.contains("01020304"));
    }

    #[test]
    fn rejects_missing_or_placeholder_system_uuid() {
        assert!(binding_from_raw_smbios(&raw_table([0; 16])).is_err());
        assert!(binding_from_raw_smbios(&raw_table([0xff; 16])).is_err());
        assert!(binding_from_raw_smbios(&[0; 7]).is_err());
    }
}
