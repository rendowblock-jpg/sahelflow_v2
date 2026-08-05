use crate::installation_identity_rebind;
use crate::installation_root_key::{
    self, InstallationIdentity, InstallationRootKey, InstallationRootRequest,
};
use crate::key_hierarchy::{
    derive_installation_key, PURPOSE_BACKUP_RECOVERY_WRAP, PURPOSE_MIGRATION_JOURNAL,
};
use crate::native_crypto::{
    clear_bytes, constant_time_equal, frame, hex_decode_exact, hex_encode, hkdf_sha256,
    hmac_sha256, key_id, open, open_detached, random_array, seal, seal_detached, sha256,
    NativeAeadEnvelope, SecretKey, SensitiveBytes,
};
use crate::protected_key_transport::{
    clear_exported_shop_keys, export_shop_keys, rewrap_imported_shop_keys, ExportedShopKey,
};
use fs2::FileExt;
use rusqlite::{Connection, DatabaseName, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::ffi::OsStr;
use std::fs::{self, File, OpenOptions};
use std::io::{
    copy as copy_io, BufReader, BufWriter, Error as IoError, ErrorKind, Read, Write,
};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const REGISTRY_FILE: &str = "shop-registry.json";
const REGISTRY_FORMAT_VERSION: u8 = 2;
const IDENTITY_AUTHORITY_FILE: &str = "identity-authority.json";
const IDENTITY_MARKER_FILE: &str = "identity-authority.initialized.json";
const IDENTITY_FOOTPRINT_SETTING: &str = "identity_authority_initialized_v1";
const BACKUP_ROOT_NAME: &str = "SahelFlow Backups";
const RECOVERY_KIT_ROOT_NAME: &str = "SahelFlow Recovery Kits";
const BACKUP_SUFFIX: &str = ".sfbackup";
const KIT_SUFFIX: &str = ".sfkit";
const DESCRIPTOR_FILE: &str = "descriptor.json";
const MANIFEST_FILE: &str = "manifest.sfm";
const OBJECTS_DIRECTORY: &str = "objects";
const BACKUP_FORMAT_VERSION: u8 = 1;
const MANIFEST_FORMAT_VERSION: u8 = 1;
const BRK_AUTHORITY_FORMAT_VERSION: u8 = 1;
const KIT_FORMAT_VERSION: u8 = 1;
const RECOVERY_KIT_RECEIPT_FORMAT_VERSION: u8 = 1;
const RESTORE_JOURNAL_FORMAT_VERSION: u8 = 1;
const RESTORE_RECEIPT_FORMAT_VERSION: u8 = 1;
const BACKUP_FORMAT: &str = "sahelflow-survivability-backup";
const KIT_FORMAT: &str = "sahelflow-independent-recovery-kit";
const BRK_AUTHORITY_FILE: &str = "backup-recovery-key.current.json";
const PENDING_RESTORE_FILE: &str = "pending-restore.json";
const RESTORE_RECEIPT_FILE: &str = "last-restore.json";