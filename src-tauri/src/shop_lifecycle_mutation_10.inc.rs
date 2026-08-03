fn validated_shops_root(app_data_dir: &Path) -> Result<PathBuf, MutationAuthorityError> {
    let app_root = fs::canonicalize(app_data_dir)?;
    let shops = app_data_dir.join("shops");
    fs::create_dir_all(&shops)?;
    let metadata = fs::symlink_metadata(&shops)?;
    if path_is_link(&metadata) || !metadata.is_dir() {
        return Err(MutationAuthorityError::InvalidRegistry(
            "canonical shops directory must not be redirected".to_string(),
        ));
    }
    let root = fs::canonicalize(&shops)?;
    if root != app_root.join("shops") {
        return Err(MutationAuthorityError::InvalidRegistry(
            "canonical shops directory escaped the application root".to_string(),
        ));
    }
    Ok(root)
}

fn ensure_directory(path: &Path) -> Result<(), MutationAuthorityError> {
    fs::create_dir_all(path)?;
    let metadata = fs::symlink_metadata(path)?;
    if path_is_link(&metadata) || !metadata.is_dir() {
        return Err(MutationAuthorityError::Archive(
            "archive directory is redirected".to_string(),
        ));
    }
    sync_parent(path)?;
    Ok(())
}

fn validate_registry_shape(registry: &ShopRegistry) -> Result<(), MutationAuthorityError> {
    if registry.format_version != REGISTRY_FORMAT_VERSION
        || registry.revision == 0
        || registry.shops.is_empty()
        || registry.active_shop_id.is_none()
    {
        return Err(MutationAuthorityError::InvalidRegistry(
            "unsupported or incomplete shop registry".to_string(),
        ));
    }
    if !registry
        .shops
        .iter()
        .any(|shop| Some(shop.id.as_str()) == registry.active_shop_id.as_deref())
    {
        return Err(MutationAuthorityError::InvalidRegistry(
            "active shop is not registered".to_string(),
        ));
    }
    Ok(())
}

fn ensure_no_incomplete_journal(
    app_data_dir: &Path,
    installation_root: &[u8; 32],
) -> Result<(), MutationAuthorityError> {
    let current = journal_current_path(app_data_dir);
    if !current.exists() {
        return Ok(());
    }
    let journal: AuthenticatedShopLifecycleJournal = read_json(&current)?;
    journal.validate(installation_root)?;
    if matches!(
        journal.journal.stage,
        ShopLifecycleStage::Completed
            | ShopLifecycleStage::Recovered
            | ShopLifecycleStage::Blocked
    ) {
        return Ok(());
    }
    Err(MutationAuthorityError::IncompleteJournal(format!(
        "operation {} remains at stage {:?}",
        journal.journal.request.operation_id, journal.journal.stage
    )))
}

fn journal_current_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir
        .join(JOURNAL_DIRECTORY)
        .join(CURRENT_JOURNAL_FILE)
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, MutationAuthorityError> {
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn write_json_atomic<T: Serialize>(
    path: &Path,
    value: &T,
) -> Result<(), MutationAuthorityError> {
    let mut bytes = serde_json::to_vec_pretty(value)?;
    bytes.push(b'\n');
    write_bytes_atomic(path, &bytes)?;
    Ok(())
}

fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), IoError> {
    let parent = path
        .parent()
        .ok_or_else(|| IoError::other("durable file has no parent"))?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(".{}.tmp", random_hex(8)?));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    let result = replace_file_durable(&temporary, path);
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(windows)]
fn replace_file_durable(staged: &Path, target: &Path) -> Result<(), IoError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, ReplaceFileW, MOVEFILE_WRITE_THROUGH,
    };
    let staged_wide = staged
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let target_wide = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    if target.exists() {
        if unsafe {
            ReplaceFileW(
                target_wide.as_ptr(),
                staged_wide.as_ptr(),
                std::ptr::null(),
                0,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        } == 0
        {
            return Err(IoError::last_os_error());
        }
    } else if unsafe {
        MoveFileExW(
            staged_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        return Err(IoError::last_os_error());
    }
    sync_file(target)
}

#[cfg(not(windows))]
fn replace_file_durable(staged: &Path, target: &Path) -> Result<(), IoError> {
    fs::rename(staged, target)?;
    sync_file(target)?;
    sync_parent(target)
}

fn remove_sqlite_file_set(path: &Path) -> Result<(), IoError> {
    remove_file_if_present(path)?;
    for suffix in ["-wal", "-shm", "-journal"] {
        let mut sidecar = path.as_os_str().to_os_string();
        sidecar.push(suffix);
        remove_file_if_present(&PathBuf::from(sidecar))?;
    }
    sync_parent(path)
}

fn remove_file_if_present(path: &Path) -> Result<(), IoError> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn sync_file(path: &Path) -> Result<(), IoError> {
    OpenOptions::new().read(true).write(true).open(path)?.sync_all()
}

fn sync_parent(path: &Path) -> Result<(), IoError> {
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    #[cfg(not(windows))]
    File::open(parent)?.sync_all()?;
    #[cfg(windows)]
    {
        let _ = parent;
    }
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, IoError> {
    let mut file = OpenOptions::new().read(true).open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex_digest(hasher.finalize().as_slice()))
}

fn sha256_bytes(value: &[u8]) -> String {
    hex_digest(Sha256::digest(value).as_slice())
}
