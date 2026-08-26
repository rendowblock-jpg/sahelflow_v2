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

        // The runtime is stopped before mutation commit. If it was terminated
        // while privacy erase had hidden the media tree, SQLite has now either
        // committed the erase (zero Message rows) or rolled it back (rows
        // remain). Reconcile that deterministic tombstone before deciding what
        // belongs in the authenticated archive. Legacy databases without the
        // Message table remain valid only when no media lifecycle state exists.
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
