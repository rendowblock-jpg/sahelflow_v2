

#[allow(clippy::too_many_arguments)]
fn descriptor_aad(
    backup_id: &str,
    created_at_unix_ms: u64,
    verified_at_unix_ms: u64,
    parent_backup_id: Option<&str>,
    retention_class: &str,
    pinned: bool,
    workspace_id: &str,
    source_installation_id: &str,
    brk_id: &str,
    dek_id: &str,
    app_version: &str,
    runtime_protocol_version: u32,
    migration_set_sha256: &str,
    shop_count: usize,
    plaintext_bytes: u64,
    manifest_sha256: &str,
) -> Vec<u8> {
    frame(
        DESCRIPTOR_AAD_DOMAIN,
        &[
            &[BACKUP_FORMAT_VERSION],
            BACKUP_FORMAT.as_bytes(),
            backup_id.as_bytes(),
            &created_at_unix_ms.to_le_bytes(),
            &verified_at_unix_ms.to_le_bytes(),
            parent_backup_id.unwrap_or("").as_bytes(),
            retention_class.as_bytes(),
            &[u8::from(pinned)],
            workspace_id.as_bytes(),
            source_installation_id.as_bytes(),
            brk_id.as_bytes(),
            dek_id.as_bytes(),
            app_version.as_bytes(),
            &runtime_protocol_version.to_le_bytes(),
            &1_u32.to_le_bytes(),
            migration_set_sha256.as_bytes(),
            &(shop_count as u64).to_le_bytes(),
            &plaintext_bytes.to_le_bytes(),
            MANIFEST_FILE.as_bytes(),
            manifest_sha256.as_bytes(),
            b"complete",
        ],
    )
}

struct OpenedBackup {
    path: PathBuf,
    descriptor: BackupDescriptor,
    manifest: BackupManifest,
    brk: SecretKey,
    dek: SecretKey,
}

impl Drop for OpenedBackup {
    fn drop(&mut self) {
        clear_exported_shop_keys(&mut self.manifest.shop_keys);
    }
}