

#[cfg(not(windows))]
fn platform_unprotect(
    _ciphertext: &[u8],
    _identity: &InstallationIdentity,
) -> Result<SensitiveBytes, InstallationRootError> {
    Err(InstallationRootError::UnsupportedPlatform)
}

fn write_document_durable(
    path: &Path,
    document: &ProtectedDocument,
) -> Result<(), InstallationRootError> {
    reject_symlink(path)?;
    let bytes = serde_json::to_vec_pretty(document)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(&bytes)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    sync_parent_directory(path)
}

fn remove_if_regular(path: &Path) -> Result<(), InstallationRootError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata_is_link(&metadata) => Err(
            InstallationRootError::InvalidState(format!(
                "refusing linked installation-root path {}",
                path.display()
            )),
        ),
        Ok(metadata) if metadata.is_file() => {
            fs::remove_file(path)?;
            sync_parent_directory(path)
        }
        Ok(_) => Err(InstallationRootError::InvalidState(format!(
            "installation-root path is not a file: {}",
            path.display()
        ))),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn reject_symlink(path: &Path) -> Result<(), InstallationRootError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata_is_link(&metadata) => Err(
            InstallationRootError::InvalidState(format!(
                "refusing linked installation-root path {}",
                path.display()
            )),
        ),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn metadata_is_link(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    false
}