

fn derive_object_key(dek: &[u8; 32], backup_id: &str, object_name: &str) -> [u8; 32] {
    let salt = sha256(&[
        OBJECT_KEY_SALT_DOMAIN,
        backup_id.as_bytes(),
        object_name.as_bytes(),
    ]);
    let info = frame(
        OBJECT_KEY_INFO_DOMAIN,
        &[backup_id.as_bytes(), object_name.as_bytes()],
    );
    hkdf_sha256(dek, &salt, &info)
}

fn object_chunk_aad(
    backup_id: &str,
    object_name: &str,
    index: u32,
    total_size: u64,
    chunk_size: u32,
) -> Vec<u8> {
    frame(
        OBJECT_AAD_DOMAIN,
        &[
            backup_id.as_bytes(),
            object_name.as_bytes(),
            &index.to_le_bytes(),
            &total_size.to_le_bytes(),
            &chunk_size.to_le_bytes(),
        ],
    )
}

fn manifest_aad(
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
    migration_set_sha256: &str,
) -> Vec<u8> {
    frame(
        b"sahelflow.backup.manifest.aad.v1\0",
        &[
            &[MANIFEST_FORMAT_VERSION],
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
            migration_set_sha256.as_bytes(),
        ],
    )
}