

fn read_registry_relaxed(app_data_dir: &Path) -> Result<ShopRegistry, IoError> {
    read_json_limited(&app_data_dir.join(REGISTRY_FILE), MAX_JSON_BYTES)
}

fn read_bytes_limited(path: &Path, maximum: u64) -> Result<Vec<u8>, IoError> {
    reject_symlink_if_present(path)?;
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > maximum {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("authority file has invalid dimensions: {}", path.display()),
        ));
    }
    fs::read(path)
}

fn read_json_limited<T: for<'de> Deserialize<'de>>(
    path: &Path,
    maximum: u64,
) -> Result<T, IoError> {
    let bytes = read_bytes_limited(path, maximum)?;
    serde_json::from_slice(&bytes).map_err(|error| {
        IoError::new(
            ErrorKind::InvalidData,
            format!("authority JSON is invalid at {}: {error}", path.display()),
        )
    })
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), IoError> {
    let bytes = serde_json::to_vec_pretty(value)
        .map_err(|error| IoError::other(format!("authority JSON serialization failed: {error}")))?;
    write_bytes_atomic(path, &[bytes.as_slice(), b"\n"].concat())
}

fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), IoError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
        reject_symlink_if_present(parent)?;
    }
    reject_symlink_if_present(path)?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| IoError::new(ErrorKind::InvalidInput, "authority file name is invalid"))?;
    let temporary = path.with_file_name(format!(".{file_name}.{}.tmp", random_hex(8)?));
    let mut file = OpenOptions::new().write(true).create_new(true).open(&temporary)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    replace_file_durable(&temporary, path)?;
    sync_parent_directory(path)
}