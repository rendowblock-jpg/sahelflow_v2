

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RestoreReceipt {
    format_version: u8,
    restore_id: String,
    backup_id: String,
    state: String,
    source_workspace_id: String,
    installation_id: String,
    shop_count: usize,
    completed_at_unix_ms: u64,
    failure_code: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupDeletionReceiptUnsigned {
    format_version: u8,
    state: String,
    backup_id: String,
    backup_workspace_id: String,
    actor_workspace_id: String,
    installation_id: String,
    descriptor_sha256: String,
    started_at_unix_ms: u64,
    completed_at_unix_ms: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BackupDeletionReceipt {
    #[serde(flatten)]
    unsigned: BackupDeletionReceiptUnsigned,
    mac_hex: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StagedRestoreManifest {
    restore_id: String,
    backup_id: String,
    source: StagedRestoreSource,
    target_registry_file: String,
    target_brk_authority_file: String,
    staged_objects: Vec<StagedRestoreObject>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StagedRestoreSource {
    workspace_id: String,
    source_installation_id: String,
    app_version: String,
    runtime_protocol_version: u32,
    schema_epoch: u32,
    migration_set_sha256: String,
    shop_count: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct StagedRestoreObject {
    shop_id: String,
    database_file: String,
    staged_file: String,
    sha256: String,
    bytes: u64,
}