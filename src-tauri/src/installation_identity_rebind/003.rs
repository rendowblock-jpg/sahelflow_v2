

pub(crate) fn rebind_installation_root_identity(
    system_dir: &Path,
    expected_current: &InstallationIdentity,
    target: &InstallationIdentity,
    root: &InstallationRootKey,
) -> Result<(), InstallationRootError> {
    if expected_current.installation_id != target.installation_id {
        return Err(InstallationRootError::IdentityMismatch(
            "replacement restore must preserve the local installation identity".to_owned(),
        ));
    }
    if let Some(parent) = system_dir.parent() {
        if parent.exists() {
            reject_symlink(parent)?;
        }
    }
    fs::create_dir_all(system_dir)?;
    reject_symlink(system_dir)?;
    let lock_path = system_dir.join(LOCK_FILE);
    reject_symlink(&lock_path)?;
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&lock_path)?;
    lock.lock_exclusive()?;

    let rotation_journal_path = system_dir.join(ROTATION_JOURNAL_FILE);
    let candidate_path = system_dir.join(CANDIDATE_FILE);
    reject_symlink(&rotation_journal_path)?;
    reject_symlink(&candidate_path)?;
    if rotation_journal_path.exists() || candidate_path.exists() {
        return Err(InstallationRootError::InvalidState(
            "installation-root identity cannot change during a root rotation".to_owned(),
        ));
    }
    let current_path = system_dir.join(CURRENT_FILE);
    let rescue_path = system_dir.join(REBIND_RESCUE_FILE);
    let observed = read_document(&current_path)?;
    let observed_identity = InstallationIdentity::new(
        observed.workspace_id.clone(),
        observed.installation_id.clone(),
    )?;
    if path_exists_regular(&rescue_path)? {
        let rescue_document = read_document(&rescue_path)?;
        let rescue_identity = InstallationIdentity::new(
            rescue_document.workspace_id.clone(),
            rescue_document.installation_id.clone(),
        )?;
        if rescue_document.key_id != root.key_id() {
            return Err(InstallationRootError::InvalidState(
                "installation-root identity rescue does not match the process root".to_owned(),
            ));
        }
        if &rescue_identity == target {
            verify_document_root(&rescue_path, target, root)?;
            copy_document_durable(&rescue_path, &current_path)?;
            verify_document_root(&current_path, target, root)?;
            remove_if_regular(&rescue_path)?;
            remove_if_regular(&system_dir.join(BACKUP_FILE))?;
            return Ok(());
        }
        if &rescue_identity != expected_current {
            return Err(InstallationRootError::IdentityMismatch(
                "installation-root identity rescue belongs to another transition".to_owned(),
            ));
        }
        // The current generation decides whether the previous replacement
        // committed. A still-current source identity means the rescue is stale;
        // a target identity means the replacement completed and only cleanup
        // was interrupted.
        if &observed_identity == target {
            verify_document_root(&current_path, target, root)?;
            remove_if_regular(&rescue_path)?;
            remove_if_regular(&system_dir.join(BACKUP_FILE))?;
            return Ok(());
        }
        if &observed_identity == expected_current {
            verify_document_root(&current_path, expected_current, root)?;
            remove_if_regular(&rescue_path)?;
        }
    }
    if observed.key_id != root.key_id() {
        return Err(InstallationRootError::InvalidState(
            "installation-root document does not match the process root".to_owned(),
        ));
    }
    if &observed_identity == target {
        verify_document_root(&current_path, target, root)?;
        remove_if_regular(&rescue_path)?;
        remove_if_regular(&system_dir.join(BACKUP_FILE))?;
        return Ok(());
    }
    if &observed_identity != expected_current {
        return Err(InstallationRootError::IdentityMismatch(
            "installation-root identity changed outside the restore journal".to_owned(),
        ));
    }
    verify_document_root(&current_path, expected_current, root)?;

    // Retain a verified source-bound generation under a file name ignored by
    // the ordinary installation-root probe. A crash or partial Windows rename
    // can therefore recover the exact previous root document before startup.
    copy_document_durable(&current_path, &rescue_path)?;
    verify_document_root(&rescue_path, expected_current, root)?;
    // A root-rotation backup carries the old workspace binding. Remove it before
    // the atomic identity replacement so the normal startup probe can never see
    // mixed workspace identities.
    remove_if_regular(&system_dir.join(BACKUP_FILE))?;
    let temporary = system_dir.join("installation-root.identity-rebind.tmp");
    remove_if_regular(&temporary)?;
    let document = make_document(root, target)?;
    write_document_durable(&temporary, &document)?;
    verify_document_root(&temporary, target, root)?;
    replace_file_durable(&temporary, &current_path)?;
    verify_document_root(&current_path, target, root)?;
    remove_if_regular(&rescue_path)?;
    Ok(())
}