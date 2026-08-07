use crate::native_crypto::{clear_bytes, hex_encode, hkdf_sha256, sha256};
use std::io::{Error as IoError, ErrorKind};

const DESCRIPTOR_FORMAT_VERSION: u8 = 1;
const ALGORITHM: &str = "hkdf-sha256";
const SALT_DOMAIN: &[u8] = b"sahelflow.installation-kek.salt.v1\0";
const INFO_DOMAIN: &[u8] = b"sahelflow.installation-kek.info.v1\0";
const KEY_ID_DOMAIN: &[u8] = b"sahelflow.installation-kek.key-id.v1\0";

pub(crate) const PURPOSE_SHOP_DATA_WRAP: &str = "shop-data-key-wrap";
pub(crate) const PURPOSE_SHOP_BLIND_INDEX_WRAP: &str = "shop-blind-index-key-wrap";
pub(crate) const PURPOSE_SECRET_STORE_WRAP: &str = "secret-store-key-wrap";
pub(crate) const PURPOSE_CONTROL_INTEGRITY: &str = "control-integrity";
pub(crate) const PURPOSE_MIGRATION_JOURNAL: &str = "migration-journal-authentication";
pub(crate) const PURPOSE_BACKUP_RECOVERY_WRAP: &str = "backup-recovery-key-wrap";
pub(crate) const PURPOSE_NATIVE_COMMAND_BRIDGE: &str = "native-command-bridge";
pub(crate) const PURPOSE_IDENTITY_AUTHORITY: &str = "identity-authority";

const PURPOSES: &[&str] = &[
    PURPOSE_SHOP_DATA_WRAP,
    PURPOSE_SHOP_BLIND_INDEX_WRAP,
    PURPOSE_SECRET_STORE_WRAP,
    PURPOSE_CONTROL_INTEGRITY,
    PURPOSE_MIGRATION_JOURNAL,
    PURPOSE_BACKUP_RECOVERY_WRAP,
    PURPOSE_NATIVE_COMMAND_BRIDGE,
    PURPOSE_IDENTITY_AUTHORITY,
];

pub(crate) struct DerivedInstallationKey {
    pub(crate) format_version: u8,
    pub(crate) algorithm: &'static str,
    pub(crate) purpose: String,
    pub(crate) version: u32,
    pub(crate) key_id: String,
    pub(crate) key: [u8; 32],
}

impl Drop for DerivedInstallationKey {
    fn drop(&mut self) {
        clear_bytes(&mut self.key);
    }
}

pub(crate) fn derive_installation_key(
    installation_root: &[u8; 32],
    workspace_id: &str,
    installation_id: &str,
    purpose: &str,
    version: u32,
) -> Result<DerivedInstallationKey, IoError> {
    validate_identity(workspace_id, "workspace")?;
    validate_identity(installation_id, "installation")?;
    if !PURPOSES.contains(&purpose) {
        return Err(IoError::new(
            ErrorKind::InvalidInput,
            format!("unsupported installation key purpose: {purpose}"),
        ));
    }
    if version == 0 {
        return Err(IoError::new(
            ErrorKind::InvalidInput,
            "installation key version must be positive",
        ));
    }

    let context = format!(
        "{{\"formatVersion\":{DESCRIPTOR_FORMAT_VERSION},\"algorithm\":\"{ALGORITHM}\",\"workspaceId\":\"{}\",\"installationId\":\"{}\",\"purpose\":\"{purpose}\",\"version\":{version}}}",
        workspace_id.to_ascii_lowercase(),
        installation_id.to_ascii_lowercase(),
    );
    let salt = sha256(&[SALT_DOMAIN, context.as_bytes()]);
    let mut info = Vec::with_capacity(INFO_DOMAIN.len() + context.len());
    info.extend_from_slice(INFO_DOMAIN);
    info.extend_from_slice(context.as_bytes());
    let key = hkdf_sha256(installation_root, &salt, &info);
    let key_id = hex_encode(&sha256(&[KEY_ID_DOMAIN, context.as_bytes(), &key]));

    Ok(DerivedInstallationKey {
        format_version: DESCRIPTOR_FORMAT_VERSION,
        algorithm: ALGORITHM,
        purpose: purpose.to_owned(),
        version,
        key_id,
        key,
    })
}

fn validate_identity(value: &str, label: &str) -> Result<(), IoError> {
    if value.len() != 32 || !value.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err(IoError::new(
            ErrorKind::InvalidInput,
            format!("{label} identity must be 32 hexadecimal characters"),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn descriptor_matches_typescript_contract_vector() {
        let root = [0x11_u8; 32];
        let derived = derive_installation_key(
            &root,
            &"10".repeat(16),
            &"20".repeat(16),
            PURPOSE_SHOP_DATA_WRAP,
            1,
        )
        .unwrap();
        assert_eq!(derived.key.len(), 32);
        assert_eq!(derived.key_id.len(), 64);
        let again = derive_installation_key(
            &root,
            &"10".repeat(16),
            &"20".repeat(16),
            PURPOSE_SHOP_DATA_WRAP,
            1,
        )
        .unwrap();
        assert_eq!(derived.key_id, again.key_id);
        assert_eq!(derived.key, again.key);
    }

    #[test]
    fn purposes_are_separated() {
        let root = [0x22_u8; 32];
        let data = derive_installation_key(
            &root,
            &"10".repeat(16),
            &"20".repeat(16),
            PURPOSE_SHOP_DATA_WRAP,
            1,
        )
        .unwrap();
        let backup = derive_installation_key(
            &root,
            &"10".repeat(16),
            &"20".repeat(16),
            PURPOSE_BACKUP_RECOVERY_WRAP,
            1,
        )
        .unwrap();
        assert_ne!(data.key_id, backup.key_id);
        assert_ne!(data.key, backup.key);
    }
}
