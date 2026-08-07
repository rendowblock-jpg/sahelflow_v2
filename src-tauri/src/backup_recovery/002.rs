
const BACKUP_DELETION_RECEIPT_FILE: &str = "last-backup-deletion.json";
const RECOVERY_KIT_RECEIPTS_DIRECTORY: &str = "recovery-kit-receipts";
const NATIVE_COMMAND_REPLAY_FILE: &str = "native-command-replay.json";
const BACKUP_LOCK_FILE: &str = "survivability.lock";
const OBJECT_MAGIC: &[u8; 8] = b"SFOBJ001";
const OBJECT_FORMAT_VERSION: u8 = 1;
const OBJECT_CHUNK_BYTES: usize = 4 * 1024 * 1024;
const MAX_JSON_BYTES: u64 = 16 * 1024 * 1024;
const MAX_BACKUP_OBJECTS: usize = 128;
const MAX_SHOPS: usize = 10;
const BACKUP_DEK_WRAP_CONTEXT: &[u8] = b"sahelflow.backup.dek-wrap.v1\0";
const BACKUP_MANIFEST_CONTEXT: &[u8] = b"sahelflow.backup.manifest.v1\0";
const BRK_WRAP_CONTEXT: &[u8] = b"sahelflow.backup.brk-wrap.v1\0";
const RECOVERY_KIT_CONTEXT: &[u8] = b"sahelflow.recovery-kit.brk.v1\0";
const RECOVERY_KIT_SALT_DOMAIN: &[u8] = b"sahelflow.recovery-kit.salt.v1\0";
const RECOVERY_KIT_INFO_DOMAIN: &[u8] = b"sahelflow.recovery-kit.info.v1\0";
const OBJECT_KEY_SALT_DOMAIN: &[u8] = b"sahelflow.backup.object-key.salt.v1\0";
const OBJECT_KEY_INFO_DOMAIN: &[u8] = b"sahelflow.backup.object-key.info.v1\0";
const OBJECT_AAD_DOMAIN: &[u8] = b"sahelflow.backup.object-chunk.aad.v1\0";
const DESCRIPTOR_AAD_DOMAIN: &[u8] = b"sahelflow.backup.descriptor.aad.v1\0";
const BRK_AAD_DOMAIN: &[u8] = b"sahelflow.backup.brk-authority.aad.v1\0";
const KIT_AAD_DOMAIN: &[u8] = b"sahelflow.recovery-kit.aad.v1\0";
const RESTORE_JOURNAL_MAC_DOMAIN: &[u8] = b"sahelflow.restore-journal.mac.v1\0";
const BACKUP_DELETION_RECEIPT_MAC_DOMAIN: &[u8] = b"sahelflow.backup-deletion-receipt.mac.v1\0";
const RECOVERY_KIT_RECEIPT_MAC_DOMAIN: &[u8] = b"sahelflow.recovery-kit-receipt.mac.v1\0";
const RECOVERY_KIT_RECEIPT_KEY_SALT_DOMAIN: &[u8] =
    b"sahelflow.recovery-kit-receipt.salt.v1\0";
const RECOVERY_KIT_RECEIPT_KEY_INFO_DOMAIN: &[u8] =
    b"sahelflow.recovery-kit-receipt.info.v1\0";
const RESTORE_RESERVE_BYTES: u64 = 64 * 1024 * 1024;
const RESTORE_COPY_MULTIPLIER: u64 = 5;
const SUPPORTED_RUNTIME_PROTOCOL_VERSION: u32 = 1;
const SUPPORTED_SCHEMA_EPOCH: u32 = 1;
const MIGRATION_SET_HASH_DOMAIN: &[u8] = b"sahelflow-migration-set-v1\n";