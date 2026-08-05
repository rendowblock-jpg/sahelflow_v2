

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BrkAuthorityDocument {
    format_version: u8,
    algorithm: String,
    workspace_id: String,
    installation_id: String,
    brk_id: String,
    wrapping_key_id: String,
    wrapped_brk: NativeAeadEnvelope,
    created_at_unix_ms: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecoveryKitDocument {
    format_version: u8,
    format: String,
    kit_id: String,
    created_at_unix_ms: u64,
    workspace_id: String,
    source_installation_id: String,
    brk_id: String,
    recovery_key_id: String,
    wrapped_brk: NativeAeadEnvelope,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecoveryKitVerificationReceiptUnsigned {
    format_version: u8,
    kit_id: String,
    workspace_id: String,
    source_installation_id: String,
    brk_id: String,
    recovery_key_id: String,
    kit_sha256: String,
    verified_at_unix_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RecoveryKitVerificationReceipt {
    #[serde(flatten)]
    unsigned: RecoveryKitVerificationReceiptUnsigned,
    mac_hex: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum RestoreJournalState {
    Staged,
    RescueReady,
    Applying,
    Committed,
    RolledBack,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RestoreJournalUnsigned {
    format_version: u8,
    restore_id: String,
    state: RestoreJournalState,
    backup_id: String,
    local_workspace_id: String,
    target_workspace_id: String,
    installation_id: String,
    staging_directory: String,
    rescue_directory: String,
    manifest_sha256: String,
    created_at_unix_ms: u64,
    updated_at_unix_ms: u64,
    failure_code: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RestoreJournal {
    #[serde(flatten)]
    unsigned: RestoreJournalUnsigned,
    mac_hex: String,
}