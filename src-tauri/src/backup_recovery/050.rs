

fn preflight_database(path: &Path) -> Result<(), IoError> {
    reject_symlink_if_present(path)?;
    let connection = Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
            | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(sqlite_error)?;
    let integrity: String = connection
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(sqlite_error)?;
    if integrity != "ok" {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("SQLite integrity check failed for {}: {integrity}", path.display()),
        ));
    }
    let foreign_key_failure: Option<i64> = connection
        .query_row(
            "SELECT 1 FROM pragma_foreign_key_check LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(sqlite_error)?;
    if foreign_key_failure.is_some() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("foreign key check failed for {}", path.display()),
        ));
    }
    Ok(())
}

fn sqlite_error(error: rusqlite::Error) -> IoError {
    IoError::new(ErrorKind::InvalidData, format!("SQLite authority failed: {error}"))
}

fn sha256_file(path: &Path) -> Result<String, IoError> {
    reject_symlink_if_present(path)?;
    let mut file = File::open(path)?;
    let mut digest = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        digest.update(&buffer[..read]);
    }
    Ok(hex_encode(&digest.finalize()))
}

fn directory_size(path: &Path) -> Result<u64, IoError> {
    let metadata = fs::symlink_metadata(path)?;
    if path_is_link(&metadata) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "authority directory contains a link or reparse point",
        ));
    }
    if metadata.is_file() {
        return Ok(metadata.len());
    }
    if !metadata.is_dir() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "authority path has an unsupported file type",
        ));
    }
    let mut total = 0_u64;
    for entry in fs::read_dir(path)? {
        total = total.saturating_add(directory_size(&entry?.path())?);
    }
    Ok(total)
}