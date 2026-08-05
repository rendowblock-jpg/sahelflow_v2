

fn validate_descriptor(descriptor: &BackupDescriptor) -> Result<(), IoError> {
    validate_backup_id(&descriptor.backup_id)?;
    if descriptor.format_version != BACKUP_FORMAT_VERSION
        || descriptor.format != BACKUP_FORMAT
        || descriptor.state != "complete"
        || descriptor.manifest_file != MANIFEST_FILE
        || descriptor.verified_at_unix_ms < descriptor.created_at_unix_ms
        || descriptor.retention_class != "manual"
        || descriptor.parent_backup_id.is_some()
        || !is_identity(&descriptor.workspace_id)
        || !is_identity(&descriptor.source_installation_id)
        || descriptor.brk_id.len() != 64
        || descriptor.dek_id.len() != 64
        || descriptor.manifest_sha256.len() != 64
        || descriptor.migration_set_sha256.len() != 64
        || !descriptor
            .brk_id
            .bytes()
            .chain(descriptor.dek_id.bytes())
            .chain(descriptor.manifest_sha256.bytes())
            .chain(descriptor.migration_set_sha256.bytes())
            .all(|byte| byte.is_ascii_hexdigit())
        || descriptor.shop_count == 0
        || descriptor.shop_count > MAX_SHOPS
        || descriptor.plaintext_bytes == 0
        || descriptor.runtime_protocol_version == 0
        || descriptor.runtime_protocol_version > SUPPORTED_RUNTIME_PROTOCOL_VERSION
        || descriptor.schema_epoch == 0
        || descriptor.schema_epoch > SUPPORTED_SCHEMA_EPOCH
        || descriptor.app_version.trim().is_empty()
        || descriptor.app_version.len() > 128
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup descriptor is malformed or unsupported",
        ));
    }
    Ok(())
}