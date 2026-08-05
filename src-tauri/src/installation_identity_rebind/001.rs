use crate::installation_root_key::{
    InstallationIdentity, InstallationRootError, InstallationRootKey,
};
use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::Path;
use std::sync::atomic::{compiler_fence, Ordering};

const DOCUMENT_FORMAT_VERSION: u8 = 1;
const CURRENT_PURPOSE: &str = "sahelflow-installation-root-v1";
const WINDOWS_DPAPI_ALGORITHM: &str = "windows-dpapi-current-user";
const CURRENT_FILE: &str = "installation-root.current.json";
const BACKUP_FILE: &str = "installation-root.backup.json";
const CANDIDATE_FILE: &str = "installation-root.candidate.json";
const ROTATION_JOURNAL_FILE: &str = "installation-root.rotation.json";
const LOCK_FILE: &str = "installation-root.lock";
const REBIND_RESCUE_FILE: &str = "installation-root.identity-rebind-rescue.json";
const MAX_DOCUMENT_BYTES: u64 = 64 * 1024;
const INNER_MAGIC: &[u8] = b"SAHELFLOW-INSTALLATION-ROOT\0";
const OUTER_HASH_DOMAIN: &[u8] = b"sahelflow-installation-root-document-v1\n";
const INNER_HASH_DOMAIN: &[u8] = b"sahelflow-installation-root-payload-v1\n";
const ENTROPY_DOMAIN: &[u8] = b"sahelflow-installation-root-dpapi-entropy-v1\n";

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProtectedDocument {
    format_version: u8,
    algorithm: String,
    purpose: String,
    workspace_id: String,
    installation_id: String,
    key_id: String,
    protected_payload_hex: String,
    document_sha256: String,
}

struct SensitiveBytes(Vec<u8>);

impl Drop for SensitiveBytes {
    fn drop(&mut self) {
        zero_bytes(&mut self.0);
    }
}