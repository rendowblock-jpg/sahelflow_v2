

pub(crate) fn create_backup(
    app_data_dir: &Path,
    download_dir: &Path,
    document_dir: &Path,
    installation_root: &[u8; 32],
    authority: &BackupAuthority,
) -> Result<BackupSummary, IoError> {
    let _lock = FileLock::acquire(&system_dir(app_data_dir).join(BACKUP_LOCK_FILE))?;
    let registry = read_registry(app_data_dir)?;
    if registry.workspace_id != authority.workspace_id
        || registry.installation_id != authority.installation_id
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup authority does not match the canonical shop registry",
        ));
    }
    let root = backup_root(download_dir)?;
    let kit_root = recovery_kit_root(document_dir)?;
    remove_stale_staging(&root)?;
    let estimated_plaintext = registry.shops.iter().try_fold(
        fs::metadata(app_data_dir.join(REGISTRY_FILE))?.len(),
        |total, shop| {
            Ok::<u64, IoError>(
                total.saturating_add(
                    fs::metadata(app_data_dir.join("shops").join(&shop.database_file))?.len(),
                ),
            )
        },
    )?;
    let required = estimated_plaintext
        .saturating_mul(2)
        .saturating_add(RESTORE_RESERVE_BYTES);
    let available = fs2::available_space(&root)?;
    if available < required {
        return Err(IoError::other(format!(
            "insufficient free space for an all-shop encrypted backup: required {required} bytes, available {available} bytes"
        )));
    }

    let (brk, brk_id) = load_or_create_local_brk(
        app_data_dir,
        installation_root,
        &authority.workspace_id,
        &authority.installation_id,
    )?;
    let dek = SecretKey::new(random_array::<32>()?);
    let dek_id = key_id(dek.as_array());
    let created_at_unix_ms = now_unix_ms()?;
    let backup_id = format!("backup-{created_at_unix_ms}-{}", random_hex(8)?);
    let staging = root.join(format!(".staging-{backup_id}"));
    let final_path = root.join(format!("{backup_id}{BACKUP_SUFFIX}"));
    fs::create_dir(&staging)?;
    fs::create_dir(staging.join(OBJECTS_DIRECTORY))?;

    let result = (|| -> Result<BackupSummary, IoError> {
        let mut objects = Vec::with_capacity(registry.shops.len() + 1);
        let mut shop_keys = BTreeMap::new();
        let registry_source = app_data_dir.join(REGISTRY_FILE);
        let registry_object = staging.join(OBJECTS_DIRECTORY).join("registry.sfo");
        let registry_stats = encrypt_object_file(
            &registry_source,
            &registry_object,
            dek.as_array(),
            &backup_id,
            "registry",
        )?;
        objects.push(BackupObject {
            name: "registry".to_owned(),
            kind: "shop-registry".to_owned(),
            shop_id: None,
            file: format!("{OBJECTS_DIRECTORY}/registry.sfo"),
            plaintext_sha256: registry_stats.plaintext_sha256,
            ciphertext_sha256: registry_stats.ciphertext_sha256,
            plaintext_bytes: registry_stats.plaintext_bytes,
            encrypted_bytes: registry_stats.encrypted_bytes,
            chunk_count: registry_stats.chunk_count,
        });

        let snapshot_root = staging.join("snapshots");
        fs::create_dir(&snapshot_root)?;
        for (index, shop) in registry.shops.iter().enumerate() {
            let source = app_data_dir.join("shops").join(&shop.database_file);
            let snapshot = snapshot_root.join(&shop.database_file);
            create_verified_snapshot(&source, &snapshot)?;
            verify_database_migration_set(
                &snapshot,
                &authority.migration_set_sha256,
            )?;
            let keys = export_shop_keys(
                &snapshot,
                installation_root,
                &registry.workspace_id,
                &registry.installation_id,
                &shop.id,
                &shop.incarnation_id,
            )?;
            shop_keys.insert(shop.id.clone(), keys);
            let object_name = format!("shop:{index}:{}", shop.id);
            let object_file_name = format!("shop-{index:02}.sfo");
            let object_path = staging.join(OBJECTS_DIRECTORY).join(&object_file_name);
            let stats = encrypt_object_file(
                &snapshot,
                &object_path,
                dek.as_array(),
                &backup_id,
                &object_name,
            )?;
            objects.push(BackupObject {
                name: object_name,
                kind: "shop-database".to_owned(),
                shop_id: Some(shop.id.clone()),
                file: format!("{OBJECTS_DIRECTORY}/{object_file_name}"),
                plaintext_sha256: stats.plaintext_sha256,
                ciphertext_sha256: stats.ciphertext_sha256,
                plaintext_bytes: stats.plaintext_bytes,
                encrypted_bytes: stats.encrypted_bytes,
                chunk_count: stats.chunk_count,
            });
            fs::remove_file(&snapshot)?;
        }
        fs::remove_dir(&snapshot_root)?;
        if objects.len() > MAX_BACKUP_OBJECTS {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "backup contains too many objects",
            ));
        }

        let verified_at_unix_ms = now_unix_ms()?;
        let mut manifest = BackupManifest {
            format_version: MANIFEST_FORMAT_VERSION,
            backup_id: backup_id.clone(),
            created_at_unix_ms,
            verified_at_unix_ms,
            parent_backup_id: None,
            retention_class: "manual".to_owned(),
            pinned: false,
            workspace_id: registry.workspace_id.clone(),
            source_installation_id: registry.installation_id.clone(),
            brk_id: brk_id.clone(),
            dek_id: dek_id.clone(),
            app_version: authority.app_version.clone(),
            runtime_protocol_version: authority.runtime_protocol_version,
            schema_epoch: 1,
            migration_set_sha256: authority.migration_set_sha256.clone(),
            registry: registry.clone(),
            recovery_set: canonical_recovery_set(),
            objects,
            shop_keys,
        };
        let manifest_plaintext = SensitiveBytes(
            serde_json::to_vec(&manifest).map_err(|error| {
                IoError::other(format!("backup manifest serialization failed: {error}"))
            })?,
        );
        let manifest_aad = manifest_aad(
            &backup_id,
            created_at_unix_ms,
            verified_at_unix_ms,
            None,
            "manual",
            false,
            &registry.workspace_id,
            &registry.installation_id,
            &brk_id,
            &dek_id,
            &authority.migration_set_sha256,
        );
        let manifest_envelope = seal(
            dek.as_array(),
            BACKUP_MANIFEST_CONTEXT,
            &manifest_aad,
            manifest_plaintext.as_slice(),
        )?;
        let manifest_bytes = serde_json::to_vec(&manifest_envelope)
            .map_err(|error| IoError::other(format!("encrypted manifest serialization failed: {error}")))?;
        let parsed_manifest_envelope: NativeAeadEnvelope = serde_json::from_slice(&manifest_bytes)
            .map_err(|error| IoError::other(format!("encrypted manifest round-trip failed: {error}")))?;
        let verified_manifest_plaintext = open(
            dek.as_array(),
            BACKUP_MANIFEST_CONTEXT,
            &manifest_aad,
            &parsed_manifest_envelope,
        )?;
        if verified_manifest_plaintext.as_slice() != manifest_plaintext.as_slice() {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "encrypted manifest round-trip changed its plaintext",
            ));
        }
        verify_staged_backup_objects(&staging, &manifest, dek.as_array())?;
        clear_exported_shop_keys(&mut manifest.shop_keys);
        let manifest_path = staging.join(MANIFEST_FILE);
        write_bytes_atomic(&manifest_path, &manifest_bytes)?;
        let manifest_sha256 = hex_encode(&sha256(&[&manifest_bytes]));
        let plaintext_bytes = manifest
            .objects
            .iter()
            .map(|object| object.plaintext_bytes)
            .sum::<u64>();
        let descriptor_aad = descriptor_aad(
            &backup_id,
            created_at_unix_ms,
            verified_at_unix_ms,
            None,
            "manual",
            false,
            &registry.workspace_id,
            &registry.installation_id,
            &brk_id,
            &dek_id,
            &authority.app_version,
            authority.runtime_protocol_version,
            &authority.migration_set_sha256,
            registry.shops.len(),
            plaintext_bytes,
            &manifest_sha256,
        );
        let wrapped_dek = seal(
            brk.as_array(),
            BACKUP_DEK_WRAP_CONTEXT,
            &descriptor_aad,
            dek.as_array(),
        )?;
        let verified_dek = open(
            brk.as_array(),
            BACKUP_DEK_WRAP_CONTEXT,
            &descriptor_aad,
            &wrapped_dek,
        )?;
        if verified_dek.as_slice() != dek.as_array().as_slice() {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "wrapped backup data key failed round-trip verification",
            ));
        }
        let descriptor = BackupDescriptor {
            format_version: BACKUP_FORMAT_VERSION,
            format: BACKUP_FORMAT.to_owned(),
            backup_id: backup_id.clone(),
            created_at_unix_ms,
            verified_at_unix_ms,
            parent_backup_id: None,
            retention_class: "manual".to_owned(),
            pinned: false,
            workspace_id: registry.workspace_id.clone(),
            source_installation_id: registry.installation_id.clone(),
            brk_id: brk_id.clone(),
            dek_id: dek_id.clone(),
            app_version: authority.app_version.clone(),
            runtime_protocol_version: authority.runtime_protocol_version,
            schema_epoch: 1,
            migration_set_sha256: authority.migration_set_sha256.clone(),
            shop_count: registry.shops.len(),
            plaintext_bytes,
            manifest_file: MANIFEST_FILE.to_owned(),
            manifest_sha256,
            wrapped_dek,
            state: "complete".to_owned(),
        };
        write_json_atomic(&staging.join(DESCRIPTOR_FILE), &descriptor)?;
        sync_tree(&staging)?;
        if final_path.exists() {
            return Err(IoError::new(
                ErrorKind::AlreadyExists,
                "backup destination already exists",
            ));
        }
        fs::rename(&staging, &final_path)?;
        sync_parent_directory(&final_path)?;
        let container_bytes = directory_size(&final_path)?;
        Ok(BackupSummary {
            backup_id,
            created_at_unix_ms,
            verified_at_unix_ms,
            retention_class: "manual".to_owned(),
            pinned: false,
            workspace_id: registry.workspace_id,
            source_installation_id: registry.installation_id,
            shop_count: registry.shops.len(),
            plaintext_bytes,
            container_bytes,
            status: "verified".to_owned(),
            location: final_path.to_string_lossy().into_owned(),
            requires_recovery_kit: false,
            independent_recovery_ready: matching_recovery_kit_exists(
                app_data_dir,
                &kit_root,
                Some(&brk),
                &authority.workspace_id,
                &authority.installation_id,
                &brk_id,
            )?,
        })
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}