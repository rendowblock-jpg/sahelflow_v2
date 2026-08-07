

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ShopRecord {
    pub(crate) id: String,
    pub(crate) incarnation_id: String,
    pub(crate) name: String,
    pub(crate) database_file: String,
    pub(crate) icon: Option<String>,
    pub(crate) created_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct ShopRegistry {
    pub(crate) format_version: u8,
    pub(crate) revision: u64,
    pub(crate) workspace_id: String,
    pub(crate) installation_id: String,
    pub(crate) active_shop_id: Option<String>,
    pub(crate) shops: Vec<ShopRecord>,
}

#[derive(Clone, Debug)]
pub(crate) struct BackupAuthority {
    pub(crate) workspace_id: String,
    pub(crate) installation_id: String,
    pub(crate) migration_set_sha256: String,
    pub(crate) app_version: String,
    pub(crate) runtime_protocol_version: u32,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct BackupSummary {
    pub(crate) backup_id: String,
    pub(crate) created_at_unix_ms: u64,
    pub(crate) verified_at_unix_ms: u64,
    pub(crate) retention_class: String,
    pub(crate) pinned: bool,
    pub(crate) workspace_id: String,
    pub(crate) source_installation_id: String,
    pub(crate) shop_count: usize,
    pub(crate) plaintext_bytes: u64,
    pub(crate) container_bytes: u64,
    pub(crate) status: String,
    pub(crate) location: String,
    pub(crate) requires_recovery_kit: bool,
    pub(crate) independent_recovery_ready: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecoveryKitResult {
    pub(crate) kit_id: String,
    pub(crate) path: String,
    pub(crate) recovery_code: String,
    pub(crate) workspace_id: String,
    pub(crate) brk_id: String,
    pub(crate) created_at_unix_ms: u64,
}

impl Drop for RecoveryKitResult {
    fn drop(&mut self) {
        clear_string(&mut self.recovery_code);
    }
}