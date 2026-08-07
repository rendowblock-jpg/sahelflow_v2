

fn path_is_link(metadata: &fs::Metadata) -> bool {
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
    {
        false
    }
}

#[cfg(windows)]
fn replace_file_durable(source: &Path, target: &Path) -> Result<(), IoError> {
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
        return Err(IoError::last_os_error());
    }
    Ok(())
}

#[cfg(not(windows))]
fn replace_file_durable(source: &Path, target: &Path) -> Result<(), IoError> {
    fs::rename(source, target)?;
    sync_parent_directory(target)
}

fn sync_parent_directory(path: &Path) -> Result<(), IoError> {
    let parent = path.parent().ok_or_else(|| {
        IoError::new(
            ErrorKind::InvalidInput,
            format!("authority path has no parent: {}", path.display()),
        )
    })?;
    sync_directory(parent)
}

#[cfg(not(windows))]
fn sync_directory(path: &Path) -> Result<(), IoError> {
    File::open(path)?.sync_all()
}

#[cfg(windows)]
fn sync_directory(_path: &Path) -> Result<(), IoError> {
    Ok(())
}