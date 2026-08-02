fn expected_archive_status(payload: &ShopLifecyclePayload) -> Option<ArchiveStatus> {
    match payload {
        ShopLifecyclePayload::Archive => Some(ArchiveStatus::Archived),
        ShopLifecyclePayload::Delete { .. } => Some(ArchiveStatus::DeletedRescue),
        _ => None,
    }
}

fn committed_outcome_matches(
    app_data_dir: &Path,
    registry: &ShopRegistry,
    journal: &AuthenticatedShopLifecycleJournal,
    installation_root: &[u8; 32],
) -> Result<bool, MutationAuthorityError> {
    let request = &journal.journal.request;
    Ok(match &journal.authorization.payload {
        ShopLifecyclePayload::Switch => {
            registry.active_shop_id.as_deref() == request.target_shop_id.as_deref()
        }
        ShopLifecyclePayload::Create { name, .. } => {
            let id = deterministic_shop_id(name, &request.operation_id)?;
            registry.shops.iter().any(|shop| {
                shop.id == id
                    && shop.database_file == format!("{id}.db")
                    && app_data_dir.join("shops").join(&shop.database_file).is_file()
            })
        }
        ShopLifecyclePayload::Rename { name } => registry.shops.iter().any(|shop| {
            Some(shop.id.as_str()) == request.target_shop_id.as_deref()
                && Some(shop.incarnation_id.as_str())
                    == request.target_shop_incarnation_id.as_deref()
                && shop.name == *name
        }),
        ShopLifecyclePayload::Archive | ShopLifecyclePayload::Delete { .. } => {
            let expected_status = expected_archive_status(&journal.authorization.payload)
                .expect("archive payload has an archive status");
            let target_absent = !registry.shops.iter().any(|shop| {
                Some(shop.id.as_str()) == request.target_shop_id.as_deref()
            });
            let (archive_directory, archive) = read_archive(
                app_data_dir,
                &request.operation_id,
                installation_root,
            )?;
            verify_archive_database(
                &archive_directory.join(ARCHIVE_DATABASE_FILE),
                &archive.database_sha256,
            )?;
            target_absent
                && archive.status == expected_status
                && archive.workspace_id == registry.workspace_id
                && archive.installation_id == registry.installation_id
                && archive.source_registry_revision == request.expected_registry_revision
                && archive.operation_id == request.operation_id
                && Some(archive.shop.id.as_str()) == request.target_shop_id.as_deref()
                && Some(archive.shop.incarnation_id.as_str())
                    == request.target_shop_incarnation_id.as_deref()
        }
        ShopLifecyclePayload::Recover { .. } => {
            let Some(shop) = registry.shops.iter().find(|shop| {
                Some(shop.id.as_str()) == request.target_shop_id.as_deref()
                    && Some(shop.incarnation_id.as_str())
                        == request.target_shop_incarnation_id.as_deref()
            }) else {
                return Ok(false);
            };
            preflight_database(&app_data_dir.join("shops").join(&shop.database_file))?;
            true
        }
    })
}

fn finalize_committed_artifacts(
    app_data_dir: &Path,
    journal: &AuthenticatedShopLifecycleJournal,
    installation_root: &[u8; 32],
) -> Result<(), MutationAuthorityError> {
    let request = &journal.journal.request;
    match &journal.authorization.payload {
        ShopLifecyclePayload::Archive | ShopLifecyclePayload::Delete { .. } => {
            let expected_status = expected_archive_status(&journal.authorization.payload)
                .expect("archive payload has an archive status");
            let (archive_directory, archive) = read_archive(
                app_data_dir,
                &request.operation_id,
                installation_root,
            )?;
            if archive.status != expected_status
                || archive.workspace_id != request.workspace_id
                || archive.installation_id != request.installation_id
                || archive.operation_id != request.operation_id
                || Some(archive.shop.id.as_str()) != request.target_shop_id.as_deref()
                || Some(archive.shop.incarnation_id.as_str())
                    != request.target_shop_incarnation_id.as_deref()
            {
                return Err(MutationAuthorityError::ManualRecoveryRequired(
                    "committed archive evidence no longer matches lifecycle authority".to_string(),
                ));
            }
            verify_archive_database(
                &archive_directory.join(ARCHIVE_DATABASE_FILE),
                &archive.database_sha256,
            )?;
            let live_database = app_data_dir.join("shops").join(&archive.shop.database_file);
            if live_database.exists() {
                remove_sqlite_file_set(&live_database)?;
            }
        }
        ShopLifecyclePayload::Recover { archive_id } => {
            let expected_directory = app_data_dir.join(ARCHIVE_DIRECTORY).join(archive_id);
            if expected_directory.exists() {
                let (archive_directory, archive) =
                    read_archive(app_data_dir, archive_id, installation_root)?;
                validate_recovery_target(&archive, request)?;
                verify_archive_database(
                    &archive_directory.join(ARCHIVE_DATABASE_FILE),
                    &archive.database_sha256,
                )?;
                fs::remove_dir_all(&archive_directory)?;
            }
        }
        ShopLifecyclePayload::Create { .. }
        | ShopLifecyclePayload::Rename { .. }
        | ShopLifecyclePayload::Switch => {}
    }
    Ok(())
}

fn cleanup_uncommitted_artifacts(
    app_data_dir: &Path,
    registry: &ShopRegistry,
    journal: &AuthenticatedShopLifecycleJournal,
    installation_root: &[u8; 32],
) -> Result<(), MutationAuthorityError> {
    let request = &journal.journal.request;
    match &journal.authorization.payload {
        ShopLifecyclePayload::Create { name, .. } => {
            let id = deterministic_shop_id(name, &request.operation_id)?;
            if !registry.shops.iter().any(|shop| shop.id == id) {
                remove_sqlite_file_set(&app_data_dir.join("shops").join(format!("{id}.db")))?;
            }
        }
        ShopLifecyclePayload::Recover { archive_id } => {
            if let Ok((_, archive)) = read_archive(app_data_dir, archive_id, installation_root) {
                if !registry.shops.iter().any(|shop| shop.id == archive.shop.id) {
                    remove_sqlite_file_set(
                        &app_data_dir.join("shops").join(&archive.shop.database_file),
                    )?;
                }
            }
        }
        ShopLifecyclePayload::Archive | ShopLifecyclePayload::Delete { .. } => {
            let archive_directory = app_data_dir
                .join(ARCHIVE_DIRECTORY)
                .join(&request.operation_id);
            if archive_directory.exists() {
                if let Ok((_, archive)) = read_archive(
                    app_data_dir,
                    &request.operation_id,
                    installation_root,
                ) {
                    let live = app_data_dir.join("shops").join(&archive.shop.database_file);
                    if !live.exists() {
                        copy_database_exact(
                            &archive_directory.join(ARCHIVE_DATABASE_FILE),
                            &live,
                        )?;
                    }
                }
                fs::remove_dir_all(archive_directory)?;
            }
        }
        ShopLifecyclePayload::Rename { .. } | ShopLifecyclePayload::Switch => {}
    }
    Ok(())
}

fn advance_committed_journal(
    journal: &mut AuthenticatedShopLifecycleJournal,
    installation_root: &[u8; 32],
    now_unix_ms: u64,
) -> Result<(), MutationAuthorityError> {
    let mut timestamp = now_unix_ms;
    loop {
        let next = match journal.journal.stage {
            ShopLifecycleStage::Requested => ShopLifecycleStage::Authorized,
            ShopLifecycleStage::Authorized => ShopLifecycleStage::Quiescing,
            ShopLifecycleStage::Quiescing => ShopLifecycleStage::RuntimeStopped,
            ShopLifecycleStage::RuntimeStopped => ShopLifecycleStage::Staged,
            ShopLifecycleStage::Staged => ShopLifecycleStage::RegistryCommitting,
            ShopLifecycleStage::RegistryCommitting => ShopLifecycleStage::Committed,
            ShopLifecycleStage::Committed => ShopLifecycleStage::RuntimeStarting,
            ShopLifecycleStage::RuntimeStarting => ShopLifecycleStage::Ready,
            ShopLifecycleStage::Ready => ShopLifecycleStage::Completed,
            ShopLifecycleStage::Completed => return Ok(()),
            _ => {
                return Err(MutationAuthorityError::ManualRecoveryRequired(
                    "interrupted committed lifecycle journal is not forward-completable"
                        .to_string(),
                ))
            }
        };
        journal.transition(installation_root, next, timestamp, None)?;
        timestamp = timestamp.saturating_add(1);
    }
}

fn persist_recovered_journal(
    app_data_dir: &Path,
    journal: &AuthenticatedShopLifecycleJournal,
) -> Result<(), MutationAuthorityError> {
    write_json_atomic(&journal_current_path(app_data_dir), journal)?;
    write_json_atomic(
        &app_data_dir
            .join(JOURNAL_DIRECTORY)
            .join(format!("{}.json", journal.journal.request.operation_id)),
        journal,
    )
}
