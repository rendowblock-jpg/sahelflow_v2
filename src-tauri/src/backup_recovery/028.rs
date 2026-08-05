

pub(crate) fn apply_pending_restore(
    app_data_dir: &Path,
    installation_root: &InstallationRootKey,
    observed_identity: &InstallationIdentity,
) -> Result<Option<InstallationIdentity>, IoError> {
    let path = pending_restore_path(app_data_dir);
    if !path.exists() {
        return Ok(None);
    }
    let _lock = FileLock::acquire(&system_dir(app_data_dir).join(BACKUP_LOCK_FILE))?;
    let mut journal = read_restore_journal(app_data_dir, installation_root.as_bytes())?;
    let local_identity = InstallationIdentity::new(
        journal.unsigned.local_workspace_id.clone(),
        journal.unsigned.installation_id.clone(),
    )
    .map_err(|error| IoError::new(ErrorKind::InvalidData, error.to_string()))?;
    let target_identity = InstallationIdentity::new(
        journal.unsigned.target_workspace_id.clone(),
        journal.unsigned.installation_id.clone(),
    )
    .map_err(|error| IoError::new(ErrorKind::InvalidData, error.to_string()))?;
    if observed_identity != &local_identity && observed_identity != &target_identity {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "pending restore belongs to another installation identity",
        ));
    }

    let staging = validated_restore_directory(
        &restore_staging_root(app_data_dir),
        &journal.unsigned.staging_directory,
        true,
    )?;
    let staged_manifest_path = staging.join("restore-manifest.json");
    if sha256_file(&staged_manifest_path)? != journal.unsigned.manifest_sha256 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "staged restore manifest failed authentication",
        ));
    }
    let staged: StagedRestoreManifest =
        read_json_limited(&staged_manifest_path, MAX_JSON_BYTES)?;
    validate_staged_restore(&staged, &journal, &staging)?;

    match journal.unsigned.state {
        RestoreJournalState::Committed => {
            cleanup_restore_state(app_data_dir, &journal)?;
            return Ok(Some(target_identity));
        }
        RestoreJournalState::RolledBack => {
            cleanup_restore_state(app_data_dir, &journal)?;
            return Ok(Some(local_identity));
        }
        RestoreJournalState::Applying => {
            rollback_to_rescue(
                app_data_dir,
                installation_root,
                &local_identity,
                &target_identity,
                observed_identity,
                &journal,
            )?;
            journal.unsigned.state = RestoreJournalState::RescueReady;
            journal.unsigned.updated_at_unix_ms = now_unix_ms()?;
            journal.unsigned.failure_code = None;
            write_restore_journal(
                app_data_dir,
                installation_root.as_bytes(),
                journal.unsigned.clone(),
            )?;
        }
        RestoreJournalState::Staged | RestoreJournalState::RescueReady => {}
    }

    if matches!(journal.unsigned.state, RestoreJournalState::Staged) {
        create_rescue(app_data_dir, &journal)?;
        journal.unsigned.state = RestoreJournalState::RescueReady;
        journal.unsigned.updated_at_unix_ms = now_unix_ms()?;
        write_restore_journal(
            app_data_dir,
            installation_root.as_bytes(),
            journal.unsigned.clone(),
        )?;
    }

    journal.unsigned.state = RestoreJournalState::Applying;
    journal.unsigned.updated_at_unix_ms = now_unix_ms()?;
    write_restore_journal(
        app_data_dir,
        installation_root.as_bytes(),
        journal.unsigned.clone(),
    )?;

    let apply_result = apply_staged_restore(
        app_data_dir,
        installation_root,
        &local_identity,
        &target_identity,
        &journal,
        &staged,
        &staging,
    );
    if let Err(error) = apply_result {
        let rollback_observed = installation_root_key::probe_protected_identity(
            &system_dir(app_data_dir),
        )
        .map_err(|probe_error| IoError::other(probe_error.to_string()))?
        .ok_or_else(|| {
            IoError::new(
                ErrorKind::InvalidData,
                "restore failure left no protected installation-root identity",
            )
        })?;
        let rollback_result = rollback_to_rescue(
            app_data_dir,
            installation_root,
            &local_identity,
            &target_identity,
            &rollback_observed,
            &journal,
        );
        journal.unsigned.updated_at_unix_ms = now_unix_ms()?;
        return match rollback_result {
            Ok(()) => {
                journal.unsigned.state = RestoreJournalState::RolledBack;
                journal.unsigned.failure_code =
                    Some("RESTORE_APPLY_FAILED_ROLLED_BACK".to_owned());
                let _ = write_restore_journal(
                    app_data_dir,
                    installation_root.as_bytes(),
                    journal.unsigned.clone(),
                );
                let _ = write_restore_receipt(
                    app_data_dir,
                    &journal,
                    staged.source.shop_count,
                );
                eprintln!(
                    "[sahelflow] replacement restore rolled back [RESTORE_APPLY_FAILED_ROLLED_BACK]"
                );
                cleanup_restore_state(app_data_dir, &journal)?;
                Ok(Some(local_identity))
            }
            Err(rollback_error) => {
                journal.unsigned.state = RestoreJournalState::Applying;
                journal.unsigned.failure_code =
                    Some("RESTORE_APPLY_AND_ROLLBACK_FAILED".to_owned());
                let _ = write_restore_journal(
                    app_data_dir,
                    installation_root.as_bytes(),
                    journal.unsigned.clone(),
                );
                let _ = write_restore_receipt(
                    app_data_dir,
                    &journal,
                    staged.source.shop_count,
                );
                Err(IoError::other(format!(
                    "replacement restore failed ({error}); rollback also failed ({rollback_error})"
                )))
            }
        };
    }

    journal.unsigned.state = RestoreJournalState::Committed;
    journal.unsigned.updated_at_unix_ms = now_unix_ms()?;
    journal.unsigned.failure_code = None;
    write_restore_journal(
        app_data_dir,
        installation_root.as_bytes(),
        journal.unsigned.clone(),
    )?;
    write_restore_receipt(
        app_data_dir,
        &journal,
        staged.source.shop_count,
    )?;
    cleanup_restore_state(app_data_dir, &journal)?;
    Ok(Some(target_identity))
}
