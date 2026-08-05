

fn sync_sqlite_database(database: &Path) -> Result<(), IoError> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(database)?
        .sync_all()?;
    for suffix in ["-wal", "-journal"] {
        let mut value = database.as_os_str().to_os_string();
        value.push(suffix);
        let sidecar = PathBuf::from(value);
        if sidecar.is_file() {
            OpenOptions::new()
                .read(true)
                .write(true)
                .open(sidecar)?
                .sync_all()?;
        }
    }
    sync_parent_directory(database)
}

fn remove_sqlite_sidecars(database: &Path) -> Result<(), IoError> {
    for suffix in ["-wal", "-shm", "-journal"] {
        let mut value = database.as_os_str().to_os_string();
        value.push(suffix);
        remove_file_if_present(&PathBuf::from(value))?;
    }
    sync_parent_directory(database)
}

fn remove_sqlite_file_set(database: &Path) -> Result<(), IoError> {
    remove_file_if_present(database)?;
    remove_sqlite_sidecars(database)
}

fn remove_file_if_present(path: &Path) -> Result<(), IoError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if path_is_link(&metadata) => Err(IoError::new(
            ErrorKind::InvalidData,
            format!("refusing to remove a linked authority path: {}", path.display()),
        )),
        Ok(metadata) if metadata.is_file() => {
            fs::remove_file(path)?;
            sync_parent_directory(path)
        }
        Ok(_) => Err(IoError::new(
            ErrorKind::InvalidData,
            format!("authority path is not a regular file: {}", path.display()),
        )),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn reject_symlink_if_present(path: &Path) -> Result<(), IoError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if path_is_link(&metadata) => Err(IoError::new(
            ErrorKind::InvalidData,
            format!("authority path must not be a link or reparse point: {}", path.display()),
        )),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}