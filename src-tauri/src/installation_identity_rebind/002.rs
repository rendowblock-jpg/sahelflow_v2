

pub(crate) fn recover_incomplete_rebind(system_dir: &Path) -> Result<(), InstallationRootError> {
    let rescue = system_dir.join(REBIND_RESCUE_FILE);
    if !path_exists_regular(&rescue)? {
        return Ok(());
    }
    // The rescue was copied from a fully verified protected document before
    // replacement. If the current generation is absent or structurally broken,
    // restore the rescue name first; installation-root preparation performs the
    // authoritative DPAPI/root verification immediately afterwards.
    let current = system_dir.join(CURRENT_FILE);
    let current_usable = path_exists_regular(&current)? && read_document(&current).is_ok();
    if !current_usable {
        if current.exists() {
            remove_if_regular(&current)?;
        }
        copy_document_durable(&rescue, &current)?;
    }
    Ok(())
}