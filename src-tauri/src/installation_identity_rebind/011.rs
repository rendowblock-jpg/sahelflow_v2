

fn copy_document_durable(source: &Path, target: &Path) -> Result<(), InstallationRootError> {
    reject_symlink(source)?;
    reject_symlink(target)?;
    let bytes = fs::read(source)?;
    let temporary = target.with_extension("identity-rebind-copy.tmp");
    remove_if_regular(&temporary)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)?;
    file.write_all(&bytes)?;
    file.sync_all()?;
    drop(file);
    replace_file_durable(&temporary, target)
}

fn path_exists_regular(path: &Path) -> Result<bool, InstallationRootError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata_is_link(&metadata) => Err(InstallationRootError::InvalidState(
            format!("refusing symbolic-link installation-root path {}", path.display()),
        )),
        Ok(metadata) if metadata.is_file() => Ok(true),
        Ok(_) => Err(InstallationRootError::InvalidState(format!(
            "installation-root path is not a regular file: {}",
            path.display()
        ))),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

#[cfg(windows)]
fn replace_file_durable(source: &Path, target: &Path) -> Result<(), InstallationRootError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let source_wide = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target_wide = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    if unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        return Err(std::io::Error::last_os_error().into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file_durable(source: &Path, target: &Path) -> Result<(), InstallationRootError> {
    fs::rename(source, target)?;
    sync_parent_directory(target)
}