

fn sync_tree(path: &Path) -> Result<(), IoError> {
    let metadata = fs::symlink_metadata(path)?;
    if path_is_link(&metadata) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "refusing to sync a linked authority path",
        ));
    }
    if metadata.is_file() {
        File::open(path)?.sync_all()?;
        return Ok(());
    }
    for entry in fs::read_dir(path)? {
        sync_tree(&entry?.path())?;
    }
    sync_directory(path)
}

fn remove_stale_staging(root: &Path) -> Result<(), IoError> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if name.starts_with(".staging-backup-") {
            let metadata = fs::symlink_metadata(entry.path())?;
            if path_is_link(&metadata) {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    "stale backup staging path is a link or reparse point",
                ));
            }
            if metadata.is_dir() {
                fs::remove_dir_all(entry.path())?;
            }
        }
    }
    Ok(())
}

fn clear_string(value: &mut String) {
    unsafe { clear_bytes(value.as_mut_vec()) };
}

fn random_hex(bytes: usize) -> Result<String, IoError> {
    let mut value = vec![0_u8; bytes];
    getrandom::getrandom(&mut value)
        .map_err(|error| IoError::other(format!("secure random generation failed: {error}")))?;
    let encoded = hex_encode(&value);
    clear_bytes(&mut value);
    Ok(encoded)
}

fn now_unix_ms() -> Result<u64, IoError> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| IoError::other("system clock precedes the Unix epoch"))?;
    u64::try_from(elapsed.as_millis())
        .map_err(|_| IoError::other("system clock is out of range"))
}