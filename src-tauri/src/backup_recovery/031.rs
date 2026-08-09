

fn validate_manifest(
    backup_path: &Path,
    descriptor: &BackupDescriptor,
    manifest: &BackupManifest,
) -> Result<(), IoError> {
    if manifest.format_version != MANIFEST_FORMAT_VERSION
        || manifest.backup_id != descriptor.backup_id
        || manifest.created_at_unix_ms != descriptor.created_at_unix_ms
        || manifest.verified_at_unix_ms != descriptor.verified_at_unix_ms
        || manifest.parent_backup_id != descriptor.parent_backup_id
        || manifest.retention_class != descriptor.retention_class
        || manifest.pinned != descriptor.pinned
        || manifest.workspace_id != descriptor.workspace_id
        || manifest.source_installation_id != descriptor.source_installation_id
        || manifest.brk_id != descriptor.brk_id
        || manifest.dek_id != descriptor.dek_id
        || manifest.app_version != descriptor.app_version
        || manifest.runtime_protocol_version != descriptor.runtime_protocol_version
        || manifest.schema_epoch != descriptor.schema_epoch
        || manifest.migration_set_sha256 != descriptor.migration_set_sha256
        || manifest.registry.workspace_id != manifest.workspace_id
        || manifest.registry.installation_id != manifest.source_installation_id
        || manifest.registry.shops.len() != descriptor.shop_count
        || manifest.recovery_set != canonical_recovery_set()
        || manifest.objects.len() != descriptor.shop_count + 1
        || manifest.objects.len() > MAX_BACKUP_OBJECTS
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "authenticated backup manifest disagrees with its descriptor",
        ));
    }
    validate_target_registry(&manifest.registry)?;
    let mut names = BTreeSet::new();
    let mut shops = BTreeSet::new();
    let mut registry_count = 0_usize;
    let mut plaintext_bytes = 0_u64;
    for (index, object) in manifest.objects.iter().enumerate() {
        if !names.insert(object.name.clone())
            || object.plaintext_sha256.len() != 64
            || object.ciphertext_sha256.len() != 64
            || !object
                .plaintext_sha256
                .bytes()
                .chain(object.ciphertext_sha256.bytes())
                .all(|byte| byte.is_ascii_hexdigit())
            || object.chunk_count == 0
            || object.encrypted_bytes == 0
        {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "backup object metadata is invalid",
            ));
        }
        plaintext_bytes = plaintext_bytes.checked_add(object.plaintext_bytes).ok_or_else(|| {
            IoError::new(ErrorKind::InvalidData, "backup plaintext size overflowed")
        })?;
        let object_path = contained_object_path(backup_path, &object.file)?;
        if fs::metadata(&object_path)?.len() != object.encrypted_bytes
            || sha256_file(&object_path)? != object.ciphertext_sha256
        {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "encrypted backup object size or digest does not match its manifest",
            ));
        }
        match object.kind.as_str() {
            "shop-registry"
                if index == 0
                    && object.shop_id.is_none()
                    && object.name == "registry"
                    && object.file == format!("{OBJECTS_DIRECTORY}/registry.sfo") =>
            {
                registry_count += 1;
            }
            "shop-database" if index > 0 => {
                let expected_index = index - 1;
                let expected_shop = manifest.registry.shops.get(expected_index).ok_or_else(|| {
                    IoError::new(ErrorKind::InvalidData, "backup shop ordering is invalid")
                })?;
                let shop_id = object.shop_id.as_ref().ok_or_else(|| {
                    IoError::new(ErrorKind::InvalidData, "shop object has no shop identity")
                })?;
                if shop_id != &expected_shop.id
                    || object.name != format!("shop:{expected_index}:{}", expected_shop.id)
                    || object.file
                        != format!("{OBJECTS_DIRECTORY}/shop-{expected_index:02}.sfo")
                    || !shops.insert(shop_id.clone())
                {
                    return Err(IoError::new(
                        ErrorKind::InvalidData,
                        "backup shop object ordering or identity is invalid",
                    ));
                }
            }
            _ => {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    "backup object kind or ordering is unsupported",
                ));
            }
        }
    }
    if registry_count != 1
        || shops.len() != manifest.registry.shops.len()
        || plaintext_bytes != descriptor.plaintext_bytes
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup object set or aggregate size is incomplete",
        ));
    }
    if manifest.shop_keys.len() != manifest.registry.shops.len()
        || manifest
            .registry
            .shops
            .iter()
            .any(|shop| !manifest.shop_keys.contains_key(&shop.id))
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup protected-key set is incomplete",
        ));
    }
    let expected_purposes = BTreeSet::from([
        "shop-data",
        "shop-blind-index",
        "shop-secret",
    ]);
    for keys in manifest.shop_keys.values() {
        if keys.is_empty() {
            continue;
        }
        let purposes = keys
            .iter()
            .map(|key| key.purpose.as_str())
            .collect::<BTreeSet<_>>();
        if keys.len() != expected_purposes.len()
            || purposes != expected_purposes
            || keys.iter().any(|key| {
                key.key_version == 0
                    || key.key_id.len() != 64
                    || key.key_hex.len() != 64
                    || !key
                        .key_id
                        .bytes()
                        .chain(key.key_hex.bytes())
                        .all(|byte| byte.is_ascii_hexdigit())
            })
        {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "backup protected-key authority is malformed",
            ));
        }
    }
    Ok(())
}
