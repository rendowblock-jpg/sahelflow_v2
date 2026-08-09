

fn create_verified_snapshot(source: &Path, target: &Path) -> Result<(), IoError> {
    reject_symlink_if_present(source)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    if target.exists() {
        return Err(IoError::new(
            ErrorKind::AlreadyExists,
            "snapshot target already exists",
        ));
    }
    let connection = Connection::open_with_flags(
        source,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
            | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(sqlite_error)?;
    connection
        .busy_timeout(std::time::Duration::from_secs(10))
        .map_err(sqlite_error)?;
    connection
        .backup(DatabaseName::Main, target, None)
        .map_err(sqlite_error)?;
    drop(connection);
    preflight_database(target)?;
    sync_file_durable(target)?;
    Ok(())
}
