

pub(crate) fn prepare_restore(
    app_data_dir: &Path,
    download_dir: &Path,
    document_dir: &Path,
    installation_root: &[u8; 32],
    authority: &BackupAuthority,
    backup_id: &str,
    recovery_code: Option<&str>,
) -> Result<RestorePreparationResult, IoError> {
    validate_backup_id(backup_id)?;
    let _lock = FileLock::acquire(&system_dir(app_data_dir).join(BACKUP_LOCK_FILE))?;
    if pending_restore_path(app_data_dir).exists() {
        return Err(IoError::new(
            ErrorKind::WouldBlock,
            "a replacement restore is already pending",
        ));
    }
    let root = backup_root(download_dir)?;
    let kit_root = recovery_kit_root(document_dir)?;
    let opened = open_backup(
        app_data_dir,
        &root,
        &kit_root,
        installation_root,
        authority,
        backup_id,
        recovery_code,
    )?;
    let required = opened
        .descriptor
        .plaintext_bytes
        .saturating_mul(RESTORE_COPY_MULTIPLIER)
        .saturating_add(RESTORE_RESERVE_BYTES);
    let available = fs2::available_space(app_data_dir)?;
    if available < required {
        return Err(IoError::other(format!(
            "insufficient free space for staged all-shop restore and rollback: required {required} bytes, available {available} bytes"
        )));
    }

    let restore_id = format!("restore-{}-{}", now_unix_ms()?, random_hex(8)?);
    let staging_root = restore_staging_root(app_data_dir);
    fs::create_dir_all(&staging_root)?;
    reject_symlink_if_present(&staging_root)?;
    let staging = staging_root.join(&restore_id);
    if staging.exists() {
        return Err(IoError::new(
            ErrorKind::AlreadyExists,
            "restore staging identity already exists",
        ));
    }
    fs::create_dir(&staging)?;
    fs::create_dir(staging.join("shops"))?;

    let preparation = (|| -> Result<RestorePreparationResult, IoError> {
        validate_target_registry(&opened.manifest.registry)?;
        let registry_object = opened
            .manifest
            .objects
            .iter()
            .find(|object| object.kind == "shop-registry")
            .ok_or_else(|| {
                IoError::new(ErrorKind::InvalidData, "backup has no registry object")
            })?;
        let restored_registry_path = staging.join("source-registry.json");
        decrypt_object_file(
            &opened.path,
            registry_object,
            &restored_registry_path,
            opened.dek.as_array(),
            &opened.descriptor.backup_id,
        )?;
        let observed_registry: ShopRegistry =
            read_json_limited(&restored_registry_path, MAX_JSON_BYTES)?;
        if observed_registry != opened.manifest.registry {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "encrypted registry object disagrees with the authenticated manifest",
            ));
        }
        fs::remove_file(&restored_registry_path)?;

        let mut target_registry = opened.manifest.registry.clone();
        target_registry.installation_id = authority.installation_id.clone();
        target_registry.revision = target_registry
            .revision
            .max(read_registry(app_data_dir)?.revision)
            .checked_add(1)
            .ok_or_else(|| IoError::new(ErrorKind::InvalidData, "registry revision overflow"))?;
        validate_target_registry(&target_registry)?;
        let target_registry_file = "target-registry.json".to_owned();
        write_json_atomic(&staging.join(&target_registry_file), &target_registry)?;

        let target_brk_authority_file = "target-backup-recovery-key.json".to_owned();
        write_brk_authority(
            &staging.join(&target_brk_authority_file),
            installation_root,
            &target_registry.workspace_id,
            &target_registry.installation_id,
            opened.brk.as_array(),
        )?;

        let current_migrations = current_migration_authority(
            app_data_dir,
            &authority.migration_set_sha256,
        )?;
        let mut staged_objects = Vec::with_capacity(target_registry.shops.len());
        for shop in &target_registry.shops {
            let object = opened
                .manifest
                .objects
                .iter()
                .find(|object| {
                    object.kind == "shop-database"
                        && object.shop_id.as_deref() == Some(shop.id.as_str())
                })
                .ok_or_else(|| {
                    IoError::new(
                        ErrorKind::InvalidData,
                        format!("backup is missing the database for shop {}", shop.id),
                    )
                })?;
            let staged_file = format!("shops/{}", shop.database_file);
            let staged_path = staging.join(&staged_file);
            decrypt_object_file(
                &opened.path,
                object,
                &staged_path,
                opened.dek.as_array(),
                &opened.descriptor.backup_id,
            )?;
            preflight_database(&staged_path)?;
            validate_restore_migration_compatibility(
                &staged_path,
                &opened.manifest.migration_set_sha256,
                &current_migrations,
            )?;
            let keys = opened.manifest.shop_keys.get(&shop.id).ok_or_else(|| {
                IoError::new(
                    ErrorKind::InvalidData,
                    format!("backup is missing protected keys for shop {}", shop.id),
                )
            })?;
            rewrap_imported_shop_keys(
                &staged_path,
                keys,
                installation_root,
                &target_registry.workspace_id,
                &target_registry.installation_id,
                &shop.id,
                &shop.incarnation_id,
            )?;
            prepare_replacement_identity_reenrollment(&staged_path)?;
            preflight_database(&staged_path)?;
            let bytes = fs::metadata(&staged_path)?.len();
            let digest = sha256_file(&staged_path)?;
            staged_objects.push(StagedRestoreObject {
                shop_id: shop.id.clone(),
                database_file: shop.database_file.clone(),
                staged_file,
                sha256: digest,
                bytes,
            });
        }

        let staged_manifest = StagedRestoreManifest {
            restore_id: restore_id.clone(),
            backup_id: opened.descriptor.backup_id.clone(),
            source: StagedRestoreSource {
                workspace_id: opened.manifest.workspace_id.clone(),
                source_installation_id: opened.manifest.source_installation_id.clone(),
                app_version: opened.manifest.app_version.clone(),
                runtime_protocol_version: opened.manifest.runtime_protocol_version,
                schema_epoch: opened.manifest.schema_epoch,
                migration_set_sha256: opened.manifest.migration_set_sha256.clone(),
                shop_count: opened.manifest.registry.shops.len(),
            },
            target_registry_file,
            target_brk_authority_file,
            staged_objects,
        };
        let staged_manifest_path = staging.join("restore-manifest.json");
        write_json_atomic(&staged_manifest_path, &staged_manifest)?;
        sync_tree(&staging)?;
        let manifest_sha256 = sha256_file(&staged_manifest_path)?;
        let now = now_unix_ms()?;
        let unsigned = RestoreJournalUnsigned {
            format_version: RESTORE_JOURNAL_FORMAT_VERSION,
            restore_id: restore_id.clone(),
            state: RestoreJournalState::Staged,
            backup_id: opened.descriptor.backup_id.clone(),
            local_workspace_id: authority.workspace_id.clone(),
            target_workspace_id: target_registry.workspace_id.clone(),
            installation_id: authority.installation_id.clone(),
            staging_directory: restore_id.clone(),
            rescue_directory: restore_id.clone(),
            manifest_sha256,
            created_at_unix_ms: now,
            updated_at_unix_ms: now,
            failure_code: None,
        };
        write_restore_journal(app_data_dir, installation_root, unsigned)?;
        Ok(RestorePreparationResult {
            backup_id: opened.descriptor.backup_id.clone(),
            restore_id,
            source_workspace_id: target_registry.workspace_id,
            source_shop_count: target_registry.shops.len(),
            restart_required: true,
        })
    })();
    if preparation.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    preparation
}