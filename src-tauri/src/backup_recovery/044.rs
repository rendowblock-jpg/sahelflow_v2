

fn validate_restore_id(value: &str) -> Result<(), IoError> {
    if value.len() < 16
        || value.len() > 96
        || !value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "restore identity is invalid",
        ));
    }
    Ok(())
}

fn validated_restore_directory(
    root: &Path,
    identifier: &str,
    must_exist: bool,
) -> Result<PathBuf, IoError> {
    validate_restore_id(identifier)?;
    if !root.exists() {
        if must_exist {
            return Err(IoError::new(
                ErrorKind::NotFound,
                "restore authority directory is missing",
            ));
        }
        fs::create_dir_all(root)?;
    }
    reject_symlink_if_present(root)?;
    let path = root.join(identifier);
    if must_exist {
        let metadata = fs::symlink_metadata(&path)?;
        if path_is_link(&metadata) || !metadata.is_dir() {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "restore authority path is not a contained directory",
            ));
        }
    }
    Ok(path)
}

fn contained_object_path(backup_path: &Path, value: &str) -> Result<PathBuf, IoError> {
    if !value.starts_with(&format!("{OBJECTS_DIRECTORY}/")) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup object path is outside the object directory",
        ));
    }
    safe_relative_path(backup_path, value)
}

fn safe_relative_path(root: &Path, value: &str) -> Result<PathBuf, IoError> {
    let relative = Path::new(value);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "authority path is not a safe relative path",
        ));
    }
    reject_symlink_if_present(root)?;
    let mut path = root.to_path_buf();
    for component in relative.components() {
        let Component::Normal(segment) = component else {
            unreachable!("validated normal relative component")
        };
        path.push(segment);
        reject_symlink_if_present(&path)?;
    }
    Ok(path)
}