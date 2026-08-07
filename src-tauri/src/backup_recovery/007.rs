

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RescueManifest {
    registry_file: String,
    registry_sha256: String,
    local_workspace_id: String,
    installation_id: String,
    brk_authority_file: Option<String>,
    brk_authority_sha256: Option<String>,
    identity_authority_file: Option<String>,
    identity_authority_sha256: Option<String>,
    identity_marker_file: Option<String>,
    identity_marker_sha256: Option<String>,
    databases: Vec<RescueDatabase>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RescueDatabase {
    database_file: String,
    rescue_file: String,
    sha256: String,
}

struct FileLock {
    file: File,
}

impl FileLock {
    fn acquire(path: &Path) -> Result<Self, IoError> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        reject_symlink_if_present(path)?;
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(path)?;
        file.try_lock_exclusive().map_err(|error| {
            IoError::new(
                ErrorKind::WouldBlock,
                format!("survivability operation is already active: {error}"),
            )
        })?;
        Ok(Self { file })
    }
}

impl Drop for FileLock {
    fn drop(&mut self) {
        let _ = fs2::FileExt::unlock(&self.file);
    }
}

pub(crate) fn backup_root(download_dir: &Path) -> Result<PathBuf, IoError> {
    reject_symlink_if_present(download_dir)?;
    let root = download_dir.join(BACKUP_ROOT_NAME);
    fs::create_dir_all(&root)?;
    reject_symlink_if_present(&root)?;
    Ok(root)
}

pub(crate) fn recovery_kit_root(document_dir: &Path) -> Result<PathBuf, IoError> {
    reject_symlink_if_present(document_dir)?;
    let root = document_dir.join(RECOVERY_KIT_ROOT_NAME);
    fs::create_dir_all(&root)?;
    reject_symlink_if_present(&root)?;
    Ok(root)
}

fn system_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("system")
}

fn pending_restore_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("recovery-journal").join(PENDING_RESTORE_FILE)
}