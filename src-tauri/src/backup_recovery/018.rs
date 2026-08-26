#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum BackupCreateStage {
    Preflight,
    KeyAuthority,
    Staging,
    ShopSnapshot,
    ShopKeyExport,
    ObjectWrite,
    Commit,
    RecoveryReadiness,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum SurvivabilityPermissionReason {
    RecoveryMaterial,
    ReplacementAuthority,
}

#[derive(Debug)]
struct SurvivabilityPermissionError {
    reason: SurvivabilityPermissionReason,
    source: IoError,
}

impl std::fmt::Display for SurvivabilityPermissionError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "{}", self.source)
    }
}

impl std::error::Error for SurvivabilityPermissionError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}

fn survivability_permission_failure(
    reason: SurvivabilityPermissionReason,
    message: &'static str,
) -> IoError {
    IoError::new(
        ErrorKind::PermissionDenied,
        SurvivabilityPermissionError {
            reason,
            source: IoError::new(ErrorKind::PermissionDenied, message),
        },
    )
}

pub(crate) fn survivability_permission_reason(
    error: &IoError,
) -> Option<SurvivabilityPermissionReason> {
    error
        .get_ref()?
        .downcast_ref::<SurvivabilityPermissionError>()
        .map(|failure| failure.reason)
}

#[derive(Debug)]
struct BackupCreateStageError {
    stage: BackupCreateStage,
    source: IoError,
}

impl std::fmt::Display for BackupCreateStageError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "protected backup failed during {:?}: {}",
            self.stage, self.source
        )
    }
}

impl std::error::Error for BackupCreateStageError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}

pub(crate) fn backup_create_failure_stage(error: &IoError) -> Option<BackupCreateStage> {
    error
        .get_ref()?
        .downcast_ref::<BackupCreateStageError>()
        .map(|failure| failure.stage)
}

fn backup_create_stage<T>(
    stage: BackupCreateStage,
    result: Result<T, IoError>,
) -> Result<T, IoError> {
    result.map_err(|source| IoError::new(source.kind(), BackupCreateStageError { stage, source }))
}

#[cfg(test)]
pub(crate) fn staged_backup_create_error_for_test(
    stage: BackupCreateStage,
    source: IoError,
) -> IoError {
    backup_create_stage::<()>(stage, Err(source))
        .expect_err("staged test error must remain an error")
}

const WHATSAPP_MEDIA_DATABASE_GENERATION_DOMAIN: &[u8] =
    b"sahelflow.whatsapp.media-db-generation.v1\0";

fn media_generation_sql_error(context: &'static str, error: rusqlite::Error) -> IoError {
    IoError::other(format!("{context}: {error}"))
}

fn update_media_generation_field(digest: &mut Sha256, value: &str) {
    digest.update((value.len() as u64).to_le_bytes());
    digest.update(value.as_bytes());
}

fn whatsapp_media_database_generation(database_path: &Path) -> Result<String, IoError> {
    let connection = Connection::open_with_flags(
        database_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
            | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| media_generation_sql_error("failed to open media-generation database", error))?;
    let mut digest = Sha256::new();
    digest.update(WHATSAPP_MEDIA_DATABASE_GENERATION_DOMAIN);

    {
        let mut statement = connection
            .prepare(
                r#"SELECT "id", "messageType", COALESCE("attachments", '')
                   FROM "Message"
                   WHERE "messageType" IN ('image', 'video', 'audio', 'document', 'sticker')
                   ORDER BY "id" ASC"#,
            )
            .map_err(|error| {
                media_generation_sql_error("failed to prepare canonical media Message scan", error)
            })?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|error| {
                media_generation_sql_error("failed to scan canonical media Messages", error)
            })?;
        for row in rows {
            let (id, message_type, attachments) = row.map_err(|error| {
                media_generation_sql_error("failed to read canonical media Message", error)
            })?;
            digest.update(b"M");
            update_media_generation_field(&mut digest, &id);
            update_media_generation_field(&mut digest, &message_type);
            update_media_generation_field(&mut digest, &attachments);
        }
    }

    {
        let mut statement = connection
            .prepare(
                r#"SELECT "effectKey", "status", COALESCE("outcomeState", ''), COALESCE("receiptJson", '')
                   FROM "OutboxIntent"
                   WHERE "effectType" = 'whatsapp.media.fetch.v1'
                   ORDER BY "effectKey" ASC"#,
            )
            .map_err(|error| {
                media_generation_sql_error("failed to prepare WhatsApp media outbox scan", error)
            })?;
        let rows = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            })
            .map_err(|error| {
                media_generation_sql_error("failed to scan WhatsApp media outbox", error)
            })?;
        for row in rows {
            let (effect_key, status, outcome_state, receipt_json) = row.map_err(|error| {
                media_generation_sql_error("failed to read WhatsApp media outbox", error)
            })?;
            digest.update(b"O");
            update_media_generation_field(&mut digest, &effect_key);
            update_media_generation_field(&mut digest, &status);
            update_media_generation_field(&mut digest, &outcome_state);
            update_media_generation_field(&mut digest, &receipt_json);
        }
    }

    Ok(hex_encode(&digest.finalize()))
}

fn canonical_completed_media_object_ids(database_path: &Path) -> Result<BTreeSet<String>, IoError> {
    let connection = Connection::open_with_flags(
        database_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
            | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|error| media_generation_sql_error("failed to open completed-media database", error))?;
    let mut statement = connection
        .prepare(
            r#"SELECT o."effectKey", a."metadata"
               FROM "OutboxIntent" o
               LEFT JOIN "AuditLog" a
                 ON a."action" = 'whatsapp.media.fetch_succeeded'
                AND a."entity" = 'message'
                AND ('whatsapp-media-fetch:' || a."entityId") = o."effectKey"
               WHERE o."effectType" = 'whatsapp.media.fetch.v1'
                 AND o."status" = 'succeeded'
                 AND o."outcomeState" = 'receipt'
                 AND o."receiptJson" IS NOT NULL
               ORDER BY o."effectKey" ASC"#,
        )
        .map_err(|error| {
            media_generation_sql_error("failed to prepare completed WhatsApp media scan", error)
        })?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
            ))
        })
        .map_err(|error| {
            media_generation_sql_error("failed to scan completed WhatsApp media", error)
        })?;
    let mut seen_effects = BTreeSet::new();
    let mut object_ids = BTreeSet::new();
    for row in rows {
        let (effect_key, metadata) = row.map_err(|error| {
            media_generation_sql_error("failed to read completed WhatsApp media row", error)
        })?;
        if !seen_effects.insert(effect_key.clone()) {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "completed WhatsApp media intent has duplicate success audit authority",
            ));
        }
        let metadata = metadata.ok_or_else(|| {
            IoError::new(
                ErrorKind::InvalidData,
                "completed WhatsApp media intent is missing success audit authority",
            )
        })?;
        let decoded: serde_json::Value = serde_json::from_str(&metadata).map_err(|error| {
            IoError::new(
                ErrorKind::InvalidData,
                format!("completed WhatsApp media audit metadata is invalid: {error}"),
            )
        })?;
        if decoded.get("effectKey").and_then(|value| value.as_str()) != Some(effect_key.as_str()) {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "completed WhatsApp media audit effect identity does not match",
            ));
        }
        let object_id = decoded
            .get("objectId")
            .and_then(|value| value.as_str())
            .ok_or_else(|| {
                IoError::new(
                    ErrorKind::InvalidData,
                    "completed WhatsApp media audit omitted canonical object identity",
                )
            })?;
        if !valid_lower_hex_64(object_id) || !object_ids.insert(object_id.to_owned()) {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "completed WhatsApp media audit contains invalid or duplicate object identity",
            ));
        }
    }
    Ok(object_ids)
}

fn verify_whatsapp_media_database_generations(
    app_data_dir: &Path,
    registry: &ShopRegistry,
    captured: &BTreeMap<String, String>,
) -> Result<(), IoError> {
    if captured.len() != registry.shops.len() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup media database generation set is incomplete",
        ));
    }
    for shop in &registry.shops {
        let expected = captured.get(&shop.id).ok_or_else(|| {
            IoError::new(
                ErrorKind::InvalidData,
                "backup media database generation is missing a registered shop",
            )
        })?;
        let live = whatsapp_media_database_generation(
            &app_data_dir.join("shops").join(&shop.database_file),
        )?;
        if &live != expected {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!(
                    "shop {} changed WhatsApp media authority while backup generation was captured",
                    shop.id
                ),
            ));
        }
    }
    Ok(())
}

fn verify_whatsapp_media_filesystem_generation(
    app_data_dir: &Path,
    registry: &ShopRegistry,
    captured: Option<&WhatsAppMediaTreeStats>,
) -> Result<(), IoError> {
    let root = whatsapp_media_root(app_data_dir);
    let entries = whatsapp_media_tree_entries(&root, registry)?;
    let live = whatsapp_media_tree_stats(&root, registry)?;
    match captured {
        Some(expected) if &live == expected => {}
        None if live.object_count == 0 => {}
        _ => {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "WhatsApp media tree changed while backup generation was captured",
            ))
        }
    }

    let available = entries
        .into_iter()
        .map(|entry| (entry.scope, entry.object_id))
        .collect::<BTreeSet<_>>();
    for shop in &registry.shops {
        let scope = whatsapp_media_scope_hash(
            &registry.workspace_id,
            &shop.id,
            &shop.incarnation_id,
        )?;
        let expected = canonical_completed_media_object_ids(
            &app_data_dir.join("shops").join(&shop.database_file),
        )?;
        for object_id in expected {
            if !available.contains(&(scope.clone(), object_id)) {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    format!(
                        "shop {} has completed WhatsApp media authority without its authenticated object",
                        shop.id
                    ),
                ));
            }
        }
    }
    Ok(())
}

pub(crate) fn create_backup(
    app_data_dir: &Path,
    download_dir: &Path,
    document_dir: &Path,
    installation_root: &[u8; 32],
    authority: &BackupAuthority,
) -> Result<BackupSummary, IoError> {
    let _lock = backup_create_stage(
        BackupCreateStage::Preflight,
        FileLock::acquire(&system_dir(app_data_dir).join(BACKUP_LOCK_FILE)),
    )?;
    let registry = backup_create_stage(BackupCreateStage::Preflight, read_registry(app_data_dir))?;
    if registry.workspace_id != authority.workspace_id
        || registry.installation_id != authority.installation_id
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup authority does not match the canonical shop registry",
        ));
    }
    let root = backup_create_stage(BackupCreateStage::Preflight, backup_root(download_dir))?;
    let kit_root = backup_create_stage(
        BackupCreateStage::Preflight,
        recovery_kit_root(document_dir),
    )?;
    backup_create_stage(BackupCreateStage::Preflight, remove_stale_staging(&root))?;
    let estimated_database_plaintext = backup_create_stage(
        BackupCreateStage::Preflight,
        registry.shops.iter().try_fold(
            fs::metadata(app_data_dir.join(REGISTRY_FILE))?.len(),
            |total, shop| {
                total
                    .checked_add(
                        fs::metadata(app_data_dir.join("shops").join(&shop.database_file))?.len(),
                    )
                    .ok_or_else(|| {
                        IoError::new(ErrorKind::InvalidData, "backup source size overflowed")
                    })
            },
        ),
    )?;
    let estimated_media_plaintext = backup_create_stage(
        BackupCreateStage::Preflight,
        estimate_whatsapp_media_pack_plaintext_bytes(app_data_dir, &registry),
    )?;
    let estimated_plaintext = estimated_database_plaintext
        .checked_add(estimated_media_plaintext)
        .ok_or_else(|| IoError::new(ErrorKind::InvalidData, "backup source size overflowed"))?;
    let required = estimated_plaintext
        .saturating_mul(2)
        .saturating_add(RESTORE_RESERVE_BYTES);
    let available = backup_create_stage(BackupCreateStage::Preflight, fs2::available_space(&root))?;
    if available < required {
        return Err(IoError::other(format!(
            "insufficient free space for an all-shop encrypted backup: required {required} bytes, available {available} bytes"
        )));
    }

    let (brk, brk_id) = backup_create_stage(
        BackupCreateStage::KeyAuthority,
        load_or_create_local_brk(
            app_data_dir,
            installation_root,
            &authority.workspace_id,
            &authority.installation_id,
        ),
    )?;
    let dek = SecretKey::new(random_array::<32>()?);
    let dek_id = key_id(dek.as_array());
    let created_at_unix_ms = now_unix_ms()?;
    let backup_id = format!("backup-{created_at_unix_ms}-{}", random_hex(8)?);
    let staging = root.join(format!(".staging-{backup_id}"));
    let final_path = root.join(format!("{backup_id}{BACKUP_SUFFIX}"));
    backup_create_stage(BackupCreateStage::Staging, fs::create_dir(&staging))?;
    backup_create_stage(
        BackupCreateStage::Staging,
        fs::create_dir(staging.join(OBJECTS_DIRECTORY)),
    )?;

    let result = (|| -> Result<BackupSummary, IoError> {
        let mut objects = Vec::with_capacity(registry.shops.len() + 2);
        let mut shop_keys = BTreeMap::new();
        let registry_source = app_data_dir.join(REGISTRY_FILE);
        let registry_object = staging.join(OBJECTS_DIRECTORY).join("registry.sfo");
        let registry_stats = backup_create_stage(
            BackupCreateStage::ObjectWrite,
            encrypt_object_file(
                &registry_source,
                &registry_object,
                dek.as_array(),
                &backup_id,
                "registry",
            ),
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
        backup_create_stage(BackupCreateStage::Staging, fs::create_dir(&snapshot_root))?;
        let mut media_database_generations = BTreeMap::new();
        for (index, shop) in registry.shops.iter().enumerate() {
            let source = app_data_dir.join("shops").join(&shop.database_file);
            let snapshot = snapshot_root.join(&shop.database_file);
            backup_create_stage(
                BackupCreateStage::ShopSnapshot,
                create_verified_snapshot(&source, &snapshot),
            )?;
            backup_create_stage(
                BackupCreateStage::ShopSnapshot,
                verify_database_migration_set(&snapshot, &authority.migration_set_sha256),
            )?;
            let generation = backup_create_stage(
                BackupCreateStage::ShopSnapshot,
                whatsapp_media_database_generation(&snapshot),
            )?;
            if media_database_generations
                .insert(shop.id.clone(), generation)
                .is_some()
            {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    "backup media database generation duplicated a shop identity",
                ));
            }
            let keys = backup_create_stage(
                BackupCreateStage::ShopKeyExport,
                export_shop_keys(
                    &snapshot,
                    installation_root,
                    &registry.workspace_id,
                    &registry.installation_id,
                    &shop.id,
                    &shop.incarnation_id,
                ),
            )?;
            shop_keys.insert(shop.id.clone(), keys);
            let object_name = format!("shop:{index}:{}", shop.id);
            let object_file_name = format!("shop-{index:02}.sfo");
            let object_path = staging.join(OBJECTS_DIRECTORY).join(&object_file_name);
            let stats = backup_create_stage(
                BackupCreateStage::ObjectWrite,
                encrypt_object_file(
                    &snapshot,
                    &object_path,
                    dek.as_array(),
                    &backup_id,
                    &object_name,
                ),
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
            backup_create_stage(BackupCreateStage::Commit, fs::remove_file(&snapshot))?;
        }

        let media_pack = snapshot_root.join("whatsapp-media.pack");
        let has_whatsapp_media = backup_create_stage(
            BackupCreateStage::ObjectWrite,
            create_whatsapp_media_pack(app_data_dir, &registry, &media_pack),
        )?;
        let captured_media_stats = if has_whatsapp_media {
            Some(backup_create_stage(
                BackupCreateStage::ObjectWrite,
                validate_whatsapp_media_pack(&media_pack, &registry),
            )?)
        } else {
            None
        };
        if has_whatsapp_media {
            let media_object = staging.join(WHATSAPP_MEDIA_BACKUP_OBJECT_FILE);
            let stats = backup_create_stage(
                BackupCreateStage::ObjectWrite,
                encrypt_object_file(
                    &media_pack,
                    &media_object,
                    dek.as_array(),
                    &backup_id,
                    WHATSAPP_MEDIA_BACKUP_OBJECT_NAME,
                ),
            )?;
            objects.push(BackupObject {
                name: WHATSAPP_MEDIA_BACKUP_OBJECT_NAME.to_owned(),
                kind: WHATSAPP_MEDIA_BACKUP_OBJECT_KIND.to_owned(),
                shop_id: None,
                file: WHATSAPP_MEDIA_BACKUP_OBJECT_FILE.to_owned(),
                plaintext_sha256: stats.plaintext_sha256,
                ciphertext_sha256: stats.ciphertext_sha256,
                plaintext_bytes: stats.plaintext_bytes,
                encrypted_bytes: stats.encrypted_bytes,
                chunk_count: stats.chunk_count,
            });
            backup_create_stage(BackupCreateStage::Commit, fs::remove_file(&media_pack))?;
        }

        backup_create_stage(
            BackupCreateStage::ShopSnapshot,
            verify_whatsapp_media_database_generations(
                app_data_dir,
                &registry,
                &media_database_generations,
            ),
        )?;
        backup_create_stage(
            BackupCreateStage::ObjectWrite,
            verify_whatsapp_media_filesystem_generation(
                app_data_dir,
                &registry,
                captured_media_stats.as_ref(),
            ),
        )?;

        backup_create_stage(BackupCreateStage::Commit, fs::remove_dir(&snapshot_root))?;
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
            recovery_set: if has_whatsapp_media {
                canonical_recovery_set()
            } else {
                legacy_recovery_set()
            },
            objects,
            shop_keys,
        };
        let manifest_plaintext =
            SensitiveBytes(serde_json::to_vec(&manifest).map_err(|error| {
                IoError::other(format!("backup manifest serialization failed: {error}"))
            })?);
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
        let manifest_bytes = serde_json::to_vec(&manifest_envelope).map_err(|error| {
            IoError::other(format!("encrypted manifest serialization failed: {error}"))
        })?;
        let parsed_manifest_envelope: NativeAeadEnvelope = serde_json::from_slice(&manifest_bytes)
            .map_err(|error| {
                IoError::other(format!("encrypted manifest round-trip failed: {error}"))
            })?;
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
        backup_create_stage(
            BackupCreateStage::ObjectWrite,
            verify_staged_backup_objects(&staging, &manifest, dek.as_array()),
        )?;
        clear_exported_shop_keys(&mut manifest.shop_keys);
        let manifest_path = staging.join(MANIFEST_FILE);
        backup_create_stage(
            BackupCreateStage::Commit,
            write_bytes_atomic(&manifest_path, &manifest_bytes),
        )?;
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
        backup_create_stage(
            BackupCreateStage::Commit,
            write_json_atomic(&staging.join(DESCRIPTOR_FILE), &descriptor),
        )?;
        backup_create_stage(BackupCreateStage::Commit, sync_tree(&staging))?;
        if final_path.exists() {
            return Err(IoError::new(
                ErrorKind::AlreadyExists,
                "backup destination already exists",
            ));
        }
        backup_create_stage(BackupCreateStage::Commit, fs::rename(&staging, &final_path))?;
        backup_create_stage(
            BackupCreateStage::Commit,
            sync_parent_directory(&final_path),
        )?;
        let container_bytes =
            backup_create_stage(BackupCreateStage::Commit, directory_size(&final_path))?;
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
            independent_recovery_ready: backup_create_stage(
                BackupCreateStage::RecoveryReadiness,
                matching_recovery_kit_exists(
                    app_data_dir,
                    &kit_root,
                    Some(&brk),
                    &authority.workspace_id,
                    &authority.installation_id,
                    &brk_id,
                ),
            )?,
        })
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging);
    }
    result
}

#[cfg(test)]
mod whatsapp_media_backup_generation_tests {
    use super::*;

    #[test]
    fn database_generation_tracks_media_truth_but_not_unrelated_rows() {
        let root = std::env::temp_dir().join(format!(
            "sahelflow-media-db-generation-{}-{}",
            std::process::id(),
            random_hex(4).expect("random test suffix")
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create generation test root");
        let database = root.join("shop.db");
        let connection = Connection::open(&database).expect("open generation test database");
        connection
            .execute_batch(
                r#"
                CREATE TABLE "Message" (
                    "id" TEXT PRIMARY KEY,
                    "messageType" TEXT NOT NULL,
                    "attachments" TEXT
                );
                CREATE TABLE "OutboxIntent" (
                    "effectKey" TEXT PRIMARY KEY,
                    "effectType" TEXT NOT NULL,
                    "status" TEXT NOT NULL,
                    "outcomeState" TEXT,
                    "receiptJson" TEXT
                );
                CREATE TABLE "Other" ("id" INTEGER PRIMARY KEY, "value" TEXT);
                "#,
            )
            .expect("create generation test schema");

        let baseline = whatsapp_media_database_generation(&database).expect("baseline generation");
        connection
            .execute("INSERT INTO \"Other\" (\"value\") VALUES ('unrelated')", [])
            .expect("write unrelated row");
        let unrelated =
            whatsapp_media_database_generation(&database).expect("unrelated generation");
        assert_eq!(baseline, unrelated);

        connection
            .execute(
                "INSERT INTO \"Message\" (\"id\", \"messageType\", \"attachments\") VALUES (?1, 'image', ?2)",
                ("message-1", "protected-attachment"),
            )
            .expect("write media message");
        let with_message =
            whatsapp_media_database_generation(&database).expect("message generation");
        assert_ne!(baseline, with_message);

        connection
            .execute(
                "INSERT INTO \"OutboxIntent\" (\"effectKey\", \"effectType\", \"status\", \"outcomeState\", \"receiptJson\") VALUES (?1, 'whatsapp.media.fetch.v1', 'succeeded', 'receipt', ?2)",
                ("whatsapp-media-fetch:message-1", "protected-receipt"),
            )
            .expect("write media receipt");
        let with_receipt =
            whatsapp_media_database_generation(&database).expect("receipt generation");
        assert_ne!(with_message, with_receipt);

        drop(connection);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn completed_media_requires_audited_object_identity() {
        let root = std::env::temp_dir().join(format!(
            "sahelflow-completed-media-{}-{}",
            std::process::id(),
            random_hex(4).expect("random test suffix")
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create completed-media test root");
        let database = root.join("shop.db");
        let connection = Connection::open(&database).expect("open completed-media database");
        connection
            .execute_batch(
                r#"
                CREATE TABLE "OutboxIntent" (
                    "effectKey" TEXT PRIMARY KEY,
                    "effectType" TEXT NOT NULL,
                    "status" TEXT NOT NULL,
                    "outcomeState" TEXT,
                    "receiptJson" TEXT
                );
                CREATE TABLE "AuditLog" (
                    "action" TEXT NOT NULL,
                    "entity" TEXT,
                    "entityId" TEXT,
                    "metadata" TEXT
                );
                INSERT INTO "OutboxIntent" ("effectKey", "effectType", "status", "outcomeState", "receiptJson")
                VALUES ('whatsapp-media-fetch:message-1', 'whatsapp.media.fetch.v1', 'succeeded', 'receipt', 'protected');
                "#,
            )
            .expect("create completed-media schema");
        assert!(canonical_completed_media_object_ids(&database).is_err());

        let object_id = "a".repeat(64);
        connection
            .execute(
                "INSERT INTO \"AuditLog\" (\"action\", \"entity\", \"entityId\", \"metadata\") VALUES ('whatsapp.media.fetch_succeeded', 'message', 'message-1', ?1)",
                [serde_json::json!({
                    "effectKey": "whatsapp-media-fetch:message-1",
                    "objectId": object_id,
                })
                .to_string()],
            )
            .expect("write completed-media audit");
        let observed = canonical_completed_media_object_ids(&database)
            .expect("completed media object identities");
        assert_eq!(observed, BTreeSet::from(["a".repeat(64)]));

        drop(connection);
        let _ = fs::remove_dir_all(root);
    }
}
