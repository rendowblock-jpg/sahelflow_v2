

fn write_restore_receipt(
    app_data_dir: &Path,
    journal: &RestoreJournal,
    shop_count: usize,
) -> Result<(), IoError> {
    write_json_atomic(
        &restore_receipt_path(app_data_dir),
        &RestoreReceipt {
            format_version: RESTORE_RECEIPT_FORMAT_VERSION,
            restore_id: journal.unsigned.restore_id.clone(),
            backup_id: journal.unsigned.backup_id.clone(),
            state: match journal.unsigned.state {
                RestoreJournalState::Committed => "committed",
                RestoreJournalState::RolledBack => "rolled-back",
                _ => "incomplete",
            }
            .to_owned(),
            source_workspace_id: journal.unsigned.target_workspace_id.clone(),
            installation_id: journal.unsigned.installation_id.clone(),
            shop_count,
            completed_at_unix_ms: now_unix_ms()?,
            failure_code: journal.unsigned.failure_code.clone(),
        },
    )
}

fn cleanup_restore_state(app_data_dir: &Path, journal: &RestoreJournal) -> Result<(), IoError> {
    remove_file_if_present(&pending_restore_path(app_data_dir))?;
    if journal.unsigned.state == RestoreJournalState::Committed {
        // Replay authority is MACed with the exact workspace/installation command
        // key. Replacement restore preserves the local installation ID but adopts
        // the recovered workspace, so the pre-restore file cannot authenticate
        // under the committed identity. Reset it only after commit; rollback keeps
        // the original identity and its replay protection intact.
        remove_file_if_present(
            &system_dir(app_data_dir).join(NATIVE_COMMAND_REPLAY_FILE),
        )?;
    }
    let staging = restore_staging_root(app_data_dir).join(&journal.unsigned.staging_directory);
    let rescue = restore_rescue_root(app_data_dir).join(&journal.unsigned.rescue_directory);
    if staging.exists() {
        fs::remove_dir_all(staging)?;
    }
    if rescue.exists() {
        fs::remove_dir_all(rescue)?;
    }
    Ok(())
}