

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct RestorePreparationResult {
    pub(crate) backup_id: String,
    pub(crate) restore_id: String,
    pub(crate) source_workspace_id: String,
    pub(crate) source_shop_count: usize,
    pub(crate) restart_required: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupDescriptor {
    format_version: u8,
    format: String,
    backup_id: String,
    created_at_unix_ms: u64,
    verified_at_unix_ms: u64,
    parent_backup_id: Option<String>,
    retention_class: String,
    pinned: bool,
    workspace_id: String,
    source_installation_id: String,
    brk_id: String,
    dek_id: String,
    app_version: String,
    runtime_protocol_version: u32,
    schema_epoch: u32,
    migration_set_sha256: String,
    shop_count: usize,
    plaintext_bytes: u64,
    manifest_file: String,
    manifest_sha256: String,
    wrapped_dek: NativeAeadEnvelope,
    state: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupManifest {
    format_version: u8,
    backup_id: String,
    created_at_unix_ms: u64,
    verified_at_unix_ms: u64,
    parent_backup_id: Option<String>,
    retention_class: String,
    pinned: bool,
    workspace_id: String,
    source_installation_id: String,
    brk_id: String,
    dek_id: String,
    app_version: String,
    runtime_protocol_version: u32,
    schema_epoch: u32,
    migration_set_sha256: String,
    registry: ShopRegistry,
    recovery_set: RecoverySetClassification,
    objects: Vec<BackupObject>,
    shop_keys: BTreeMap<String, Vec<ExportedShopKey>>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecoverySetClassification {
    included: Vec<String>,
    rebuilt: Vec<String>,
    re_enrolled: Vec<String>,
    non_transferable: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupObject {
    name: String,
    kind: String,
    shop_id: Option<String>,
    file: String,
    plaintext_sha256: String,
    ciphertext_sha256: String,
    plaintext_bytes: u64,
    encrypted_bytes: u64,
    chunk_count: u32,
}