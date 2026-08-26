use std::collections::{BTreeMap, BTreeSet};

fn whatsapp_media_lifecycle_state_exists(
    scope_root: &Path,
) -> Result<bool, MutationAuthorityError> {
    let scope_name = scope_root
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| {
            MutationAuthorityError::InvalidRegistry(
                "WhatsApp media shop scope identity is not UTF-8".to_string(),
            )
        })?;
    let tombstone = scope_root.with_file_name(format!("{scope_name}.erasing"));
    Ok(scope_root.exists() || tombstone.exists())
}

fn canonical_whatsapp_message_count(
    database_path: &Path,
    media_scope: &Path,
) -> Result<u64, MutationAuthorityError> {
    let connection = Connection::open_with_flags(
        database_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
            | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    let has_message_table: i64 = connection.query_row(
        r#"SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Message')"#,
        [],
        |row| row.get(0),
    )?;
    if has_message_table == 0 {
        if whatsapp_media_lifecycle_state_exists(media_scope)? {
            return Err(MutationAuthorityError::InvalidRegistry(
                "shop has WhatsApp media lifecycle state but no canonical Message table"
                    .to_string(),
            ));
        }
        // Pre-media lifecycle fixtures and legitimate legacy shop databases may
        // not contain the canonical Message table. With no live/tombstoned media
        // state there is nothing to reconcile, so preserve legacy compatibility.
        return Ok(0);
    }
    let count: i64 = connection.query_row(r#"SELECT COUNT(*) FROM "Message""#, [], |row| {
        row.get(0)
    })?;
    u64::try_from(count).map_err(|_| {
        MutationAuthorityError::InvalidRegistry(
            "canonical WhatsApp message count is negative".to_string(),
        )
    })
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct CompletedWhatsAppArchiveObjectEvidence {
    ciphertext_sha256: String,
    ciphertext_bytes: u64,
}

fn lifecycle_table_exists(
    connection: &Connection,
    table_name: &str,
) -> Result<bool, MutationAuthorityError> {
    let exists: i64 = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        [table_name],
        |row| row.get(0),
    )?;
    Ok(exists != 0)
}

fn valid_media_provenance_hex(value: &str) -> bool {
    value.len() == 64
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn canonical_completed_whatsapp_archive_objects(
    database_path: &Path,
) -> Result<BTreeMap<String, CompletedWhatsAppArchiveObjectEvidence>, MutationAuthorityError> {
    let connection = Connection::open_with_flags(
        database_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
            | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    if !lifecycle_table_exists(&connection, "OutboxIntent")? {
        return Ok(BTreeMap::new());
    }
    let completed_count: i64 = connection.query_row(
        r#"SELECT COUNT(*)
           FROM "OutboxIntent"
           WHERE "effectType" = 'whatsapp.media.fetch.v1'
             AND "status" = 'succeeded'
             AND "outcomeState" = 'receipt'
             AND "receiptJson" IS NOT NULL"#,
        [],
        |row| row.get(0),
    )?;
    if completed_count == 0 {
        return Ok(BTreeMap::new());
    }
    if !lifecycle_table_exists(&connection, "AuditLog")? {
        return Err(MutationAuthorityError::Archive(
            "completed WhatsApp media authority has no success audit table".to_string(),
        ));
    }

    let mut statement = connection.prepare(
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
    )?;
    let rows = statement.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, Option<String>>(1)?,
        ))
    })?;
    let mut seen_effects = BTreeSet::new();
    let mut objects = BTreeMap::new();
    for row in rows {
        let (effect_key, metadata) = row?;
        if !seen_effects.insert(effect_key.clone()) {
            return Err(MutationAuthorityError::Archive(
                "completed WhatsApp media intent has duplicate success audit authority".to_string(),
            ));
        }
        let metadata = metadata.ok_or_else(|| {
            MutationAuthorityError::Archive(
                "completed WhatsApp media intent is missing success audit authority".to_string(),
            )
        })?;
        let decoded: serde_json::Value = serde_json::from_str(&metadata).map_err(|error| {
            MutationAuthorityError::Archive(format!(
                "completed WhatsApp media audit metadata is invalid: {error}"
            ))
        })?;
        if decoded.get("effectKey").and_then(|value| value.as_str())
            != Some(effect_key.as_str())
        {
            return Err(MutationAuthorityError::Archive(
                "completed WhatsApp media audit effect identity does not match".to_string(),
            ));
        }
        let object_id = decoded
            .get("objectId")
            .and_then(|value| value.as_str())
            .ok_or_else(|| {
                MutationAuthorityError::Archive(
                    "completed WhatsApp media audit omitted canonical object identity".to_string(),
                )
            })?;
        let ciphertext_sha256 = decoded
            .get("objectCiphertextSha256")
            .and_then(|value| value.as_str())
            .ok_or_else(|| {
                MutationAuthorityError::Archive(
                    "completed WhatsApp media audit omitted authenticated ciphertext digest"
                        .to_string(),
                )
            })?;
        let ciphertext_bytes = decoded
            .get("objectCiphertextBytes")
            .and_then(|value| value.as_u64())
            .filter(|value| *value > 0)
            .ok_or_else(|| {
                MutationAuthorityError::Archive(
                    "completed WhatsApp media audit omitted authenticated ciphertext byte length"
                        .to_string(),
                )
            })?;
        if !valid_media_provenance_hex(object_id)
            || !valid_media_provenance_hex(ciphertext_sha256)
        {
            return Err(MutationAuthorityError::Archive(
                "completed WhatsApp media audit contains invalid object provenance".to_string(),
            ));
        }
        if objects
            .insert(
                object_id.to_owned(),
                CompletedWhatsAppArchiveObjectEvidence {
                    ciphertext_sha256: ciphertext_sha256.to_owned(),
                    ciphertext_bytes,
                },
            )
            .is_some()
        {
            return Err(MutationAuthorityError::Archive(
                "completed WhatsApp media audit contains duplicate object identity".to_string(),
            ));
        }
    }
    Ok(objects)
}

fn verify_archived_whatsapp_media_provenance(
    archive_database: &Path,
    archive_media_scope: &Path,
) -> Result<(), MutationAuthorityError> {
    let expected = canonical_completed_whatsapp_archive_objects(archive_database)?;
    if expected.is_empty() {
        return Ok(());
    }
    if !archive_media_scope.exists() {
        return Err(MutationAuthorityError::Archive(
            "completed WhatsApp media authority is missing its archived media scope".to_string(),
        ));
    }
    for (object_id, evidence) in expected {
        let path = archive_media_scope.join(format!("{object_id}.sfmedia"));
        let metadata = fs::symlink_metadata(&path).map_err(|error| {
            MutationAuthorityError::Archive(format!(
                "completed WhatsApp media object is missing from lifecycle archive: {error}"
            ))
        })?;
        if !metadata.is_file()
            || metadata.len() != evidence.ciphertext_bytes
            || sha256_file(&path)? != evidence.ciphertext_sha256
        {
            return Err(MutationAuthorityError::Archive(
                "completed WhatsApp media object does not match GCM-verified ciphertext provenance"
                    .to_string(),
            ));
        }
    }
    Ok(())
}

impl AcceptedMutation {
    fn archive_target(
        &mut self,
        registry: &mut ShopRegistry,
        status: ArchiveStatus,
        now_unix_ms: u64,
    ) -> Result<RollbackAction, MutationAuthorityError> {
        if registry.shops.len() <= 1 {
            return Err(MutationAuthorityError::InvalidRegistry(
                "the final live shop cannot be archived or deleted".to_string(),
            ));
        }
        let target = exact_registry_target_ref(registry, &self.journal.journal.request)?.clone();
        let archive_directory = self
            .app_data_dir
            .join(ARCHIVE_DIRECTORY)
            .join(&self.journal.journal.request.operation_id);
        if archive_directory.exists() {
            return Err(MutationAuthorityError::Archive(
                "archive operation identity already exists".to_string(),
            ));
        }
        let live_database = self
            .app_data_dir
            .join("shops")
            .join(&target.database_file);
        let live_media_scope = whatsapp_media_scope_path(
            &self.app_data_dir,
            &registry.workspace_id,
            &target.id,
            &target.incarnation_id,
        )?;

        reconcile_whatsapp_media_erase_tombstone(
            &live_media_scope,
            canonical_whatsapp_message_count(&live_database, &live_media_scope)?,
        )?;

        ensure_directory(&archive_directory)?;
        let archive_database = archive_directory.join(ARCHIVE_DATABASE_FILE);
        let archive_media_scope = archive_directory.join(ARCHIVE_WHATSAPP_MEDIA_DIRECTORY);

        let prepared = (|| -> Result<
            (String, Option<WhatsAppMediaScopeStats>),
            MutationAuthorityError,
        > {
            snapshot_database(&live_database, &archive_database)?;
            let digest = sha256_file(&archive_database)?;
            let media_stats =
                snapshot_whatsapp_media_scope(&live_media_scope, &archive_media_scope)?;
            if let Some(expected) = media_stats.as_ref() {
                verify_whatsapp_media_scope(&archive_media_scope, expected)?;
            }
            // The archive database and media scope are one authority. Before
            // authenticating the archive manifest, prove that every succeeded
            // media intent in the exact SQLite snapshot maps to the same
            // ciphertext bytes that previously passed GCM verification.
            verify_archived_whatsapp_media_provenance(
                &archive_database,
                &archive_media_scope,
            )?;
            let state = ArchiveState {
                format_version: 1,
                archive_id: self.journal.journal.request.operation_id.clone(),
                workspace_id: registry.workspace_id.clone(),
                installation_id: registry.installation_id.clone(),
                status,
                shop: target.clone(),
                database_sha256: digest.clone(),
                whatsapp_media: media_stats.clone(),
                archived_at_unix_ms: now_unix_ms,
                source_registry_revision: registry.revision,
                operation_id: self.journal.journal.request.operation_id.clone(),
            };
            write_archive_manifest(
                &archive_directory.join(ARCHIVE_MANIFEST_FILE),
                state,
                &self.installation_root,
            )?;
            Ok((digest, media_stats))
        })();
        let (_, media_stats) = match prepared {
            Ok(value) => value,
            Err(error) => {
                let _ = fs::remove_dir_all(&archive_directory);
                return Err(error);
            }
        };

        registry.shops.retain(|shop| shop.id != target.id);
        if registry.active_shop_id.as_deref() == Some(target.id.as_str()) {
            registry.active_shop_id = registry.shops.first().map(|shop| shop.id.clone());
        }
        self.post_commit_remove = Some(live_database.clone());
        self.post_commit_remove_media = Some(live_media_scope.clone());
        Ok(RollbackAction::RestoreArchivedShop {
            archive_directory,
            archive_database,
            archive_media_scope,
            live_database,
            live_media_scope,
            media_stats,
        })
    }
}

impl AcceptedMutation {
    fn persist_journal(&self) -> Result<(), MutationAuthorityError> {
        write_json_atomic(&journal_current_path(&self.app_data_dir), &self.journal)
    }
}

impl AcceptedMutation {
    fn persist_terminal_journal(&self) -> Result<(), MutationAuthorityError> {
        self.persist_journal()?;
        write_json_atomic(
            &self
                .app_data_dir
                .join(JOURNAL_DIRECTORY)
                .join(format!(
                    "{}.json",
                    self.journal.journal.request.operation_id
                )),
            &self.journal,
        )
    }
}

pub fn accept_mutation(
    app_data_dir: &Path,
    resource_dir: &Path,
    migration_set_sha256: &str,
    command: &ShopLifecycleCommand,
    installation_root: &[u8; 32],
    now_unix_ms: u64,
) -> Result<AcceptedMutation, MutationAuthorityError> {
    if command.authorization.request.operation == ShopLifecycleOperation::Switch
        || command.authorization.payload == ShopLifecyclePayload::Switch
    {
        return Err(MutationAuthorityError::UnsupportedOperation);
    }
    command.verify(installation_root, now_unix_ms)?;
    let lifecycle_lock = FileLock::acquire(&app_data_dir.join(LIFECYCLE_LOCK_FILE), "lifecycle")?;
    let migration_lock = FileLock::acquire(&app_data_dir.join(MIGRATION_LOCK_FILE), "migration")?;
    ensure_no_incomplete_journal(app_data_dir, installation_root)?;

    let previous_authority =
        migration_coordinator::active_authority(app_data_dir, migration_set_sha256)
            .map_err(|error| MutationAuthorityError::InvalidRegistry(error.to_string()))?;
    let registry: ShopRegistry = read_json(&app_data_dir.join(REGISTRY_FILE))?;
    validate_registry_shape(&registry)?;
    validate_current_authority(
        &registry,
        &command.authorization.request,
        &previous_authority,
    )?;
    validate_operation_target(app_data_dir, &registry, command, installation_root)?;

    let mut journal =
        AuthenticatedShopLifecycleJournal::accept(command, installation_root, now_unix_ms)?;
    let current = journal_current_path(app_data_dir);
    write_json_atomic(&current, &journal)?;
    journal.transition(
        installation_root,
        ShopLifecycleStage::Authorized,
        now_unix_ms.saturating_add(1),
        None,
    )?;
    write_json_atomic(&current, &journal)?;

    Ok(AcceptedMutation {
        app_data_dir: app_data_dir.to_path_buf(),
        resource_dir: resource_dir.to_path_buf(),
        migration_set_sha256: migration_set_sha256.to_string(),
        installation_root: *installation_root,
        journal,
        previous_authority,
        rollback: None,
        finalize_archive: None,
        post_commit_remove: None,
        post_commit_remove_media: None,
        registry_committed: false,
        committed: None,
        _lifecycle_lock: lifecycle_lock,
        _migration_lock: migration_lock,
    })
}

#[cfg(test)]
mod whatsapp_media_archive_provenance_tests {
    use super::*;

    #[test]
    fn lifecycle_archive_rejects_missing_or_changed_completed_media() {
        let root = std::env::temp_dir().join(format!(
            "sahelflow-lifecycle-media-provenance-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).expect("create lifecycle provenance root");
        let database = root.join("database.db");
        let media_scope = root.join("whatsapp-media");
        fs::create_dir(&media_scope).expect("create lifecycle media scope");
        let connection = Connection::open(&database).expect("open lifecycle provenance database");
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
            .expect("create lifecycle provenance schema");
        assert!(verify_archived_whatsapp_media_provenance(&database, &media_scope).is_err());

        let object_id = "a".repeat(64);
        let object_path = media_scope.join(format!("{object_id}.sfmedia"));
        fs::write(&object_path, b"authenticated-ciphertext").expect("write archived object");
        let ciphertext_sha256 = sha256_file(&object_path).expect("hash archived object");
        let ciphertext_bytes = fs::metadata(&object_path)
            .expect("stat archived object")
            .len();
        let audit = serde_json::json!({
            "effectKey": "whatsapp-media-fetch:message-1",
            "objectId": object_id,
            "objectCiphertextSha256": ciphertext_sha256,
            "objectCiphertextBytes": ciphertext_bytes,
        })
        .to_string();
        connection
            .execute(
                "INSERT INTO \"AuditLog\" (\"action\", \"entity\", \"entityId\", \"metadata\") VALUES ('whatsapp.media.fetch_succeeded', 'message', 'message-1', ?1)",
                [audit],
            )
            .expect("write lifecycle success audit");
        verify_archived_whatsapp_media_provenance(&database, &media_scope)
            .expect("matching archived provenance");

        fs::write(&object_path, b"changed-ciphertext").expect("tamper archived object");
        assert!(verify_archived_whatsapp_media_provenance(&database, &media_scope).is_err());

        drop(connection);
        let _ = fs::remove_dir_all(root);
    }
}
