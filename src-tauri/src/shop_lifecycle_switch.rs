use super::shop_lifecycle::{ShopLifecycleOperation, ShopLifecycleStage};
use super::shop_lifecycle_command::{
    AuthenticatedShopLifecycleJournal, ShopLifecycleCommand, ShopLifecycleCommandError,
    ShopLifecyclePayload,
};
use crate::migration_coordinator::{self, ActiveShopAuthority};
use fs2::FileExt;
use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fmt;
use std::fs::{self, File, OpenOptions};
use std::io::{Error as IoError, Write};
use std::path::{Path, PathBuf};

const REGISTRY_FILE: &str = "shop-registry.json";
const REGISTRY_FORMAT_VERSION: u8 = 2;
const LIFECYCLE_LOCK_FILE: &str = "shop-lifecycle.lock";
const MIGRATION_LOCK_FILE: &str = "migration.lock";
const JOURNAL_DIRECTORY: &str = "shop-lifecycle-journal";
const CURRENT_JOURNAL_FILE: &str = "current.json";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShopRecord {
    id: String,
    incarnation_id: String,
    name: String,
    database_file: String,
    icon: Option<String>,
    created_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShopRegistry {
    format_version: u8,
    revision: u64,
    workspace_id: String,
    installation_id: String,
    active_shop_id: Option<String>,
    shops: Vec<ShopRecord>,
}

#[derive(Clone, Debug)]
pub struct SwitchCommit {
    pub previous_authority: ActiveShopAuthority,
    pub target_authority: ActiveShopAuthority,
}

pub struct AcceptedSwitch {
    app_data_dir: PathBuf,
    migration_set_sha256: String,
    installation_root: [u8; 32],
    journal: AuthenticatedShopLifecycleJournal,
    previous_authority: ActiveShopAuthority,
    target: ShopRecord,
    committed: Option<SwitchCommit>,
    _lifecycle_lock: FileLock,
    _migration_lock: FileLock,
}

impl Drop for AcceptedSwitch {
    fn drop(&mut self) {
        self.installation_root.fill(0);
    }
}

impl AcceptedSwitch {
    pub fn operation_id(&self) -> &str {
        &self.journal.journal.request.operation_id
    }

    pub fn previous_authority(&self) -> &ActiveShopAuthority {
        &self.previous_authority
    }

    pub fn target_shop_id(&self) -> &str {
        &self.target.id
    }

    pub fn begin_compensation(
        &mut self,
        now_unix_ms: u64,
        failure_code: &str,
    ) -> Result<(), SwitchAuthorityError> {
        self.journal.transition(
            &self.installation_root,
            ShopLifecycleStage::Compensating,
            now_unix_ms,
            Some(failure_code.to_string()),
        )?;
        self.persist_journal()
    }

    pub fn transition(
        &mut self,
        next: ShopLifecycleStage,
        now_unix_ms: u64,
    ) -> Result<(), SwitchAuthorityError> {
        self.journal
            .transition(&self.installation_root, next, now_unix_ms, None)?;
        self.persist_journal()
    }

    pub fn commit_registry(
        &mut self,
        now_unix_ms: u64,
    ) -> Result<SwitchCommit, SwitchAuthorityError> {
        if self.committed.is_some() {
            return Err(SwitchAuthorityError::InvalidState(
                "the switch registry transaction is already committed".to_string(),
            ));
        }
        self.transition(ShopLifecycleStage::Staged, now_unix_ms)?;
        self.transition(
            ShopLifecycleStage::RegistryCommitting,
            now_unix_ms.saturating_add(1),
        )?;

        let registry_path = self.app_data_dir.join(REGISTRY_FILE);
        let previous_bytes = fs::read(&registry_path)?;
        let mut registry: ShopRegistry = serde_json::from_slice(&previous_bytes)?;
        validate_registry_shape(&registry)?;
        validate_request_authority(
            &registry,
            &self.journal.journal.request,
            &self.previous_authority,
            &self.target,
        )?;
        registry.active_shop_id = Some(self.target.id.clone());
        registry.revision = registry.revision.checked_add(1).ok_or_else(|| {
            SwitchAuthorityError::InvalidRegistry("registry revision overflow".into())
        })?;
        write_json_atomic(&registry_path, &registry)?;

        let target_authority = match migration_coordinator::active_authority(
            &self.app_data_dir,
            &self.migration_set_sha256,
        ) {
            Ok(authority) => authority,
            Err(error) => {
                return self.restore_after_commit_failure(
                    &registry_path,
                    &previous_bytes,
                    format!("canonical target authority rejected the committed registry: {error}"),
                )
            }
        };
        if let Err(error) = verify_target_authority(&target_authority, &registry, &self.target) {
            return self.restore_after_commit_failure(
                &registry_path,
                &previous_bytes,
                error.to_string(),
            );
        }

        self.transition(ShopLifecycleStage::Committed, now_unix_ms.saturating_add(2))?;
        let committed = SwitchCommit {
            previous_authority: self.previous_authority.clone(),
            target_authority,
        };
        self.committed = Some(committed.clone());
        Ok(committed)
    }

    pub fn compensate_registry(
        &mut self,
        now_unix_ms: u64,
        failure_code: &str,
    ) -> Result<ActiveShopAuthority, SwitchAuthorityError> {
        let committed = self.committed.clone().ok_or_else(|| {
            SwitchAuthorityError::InvalidState(
                "the switch registry transaction has not been committed".to_string(),
            )
        })?;
        self.begin_compensation(now_unix_ms, failure_code)?;

        let registry_path = self.app_data_dir.join(REGISTRY_FILE);
        let mut registry: ShopRegistry = read_json(&registry_path)?;
        validate_registry_shape(&registry)?;
        if registry.revision != committed.target_authority.registry_revision
            || registry.workspace_id != committed.target_authority.workspace_id
            || registry.installation_id != committed.target_authority.installation_id
            || registry.active_shop_id.as_deref()
                != Some(committed.target_authority.shop_id.as_str())
        {
            return Err(SwitchAuthorityError::ManualRecoveryRequired(
                "the registry changed after switch commit; automatic compensation is blocked"
                    .to_string(),
            ));
        }
        registry.active_shop_id = Some(committed.previous_authority.shop_id.clone());
        registry.revision = registry.revision.checked_add(1).ok_or_else(|| {
            SwitchAuthorityError::InvalidRegistry("registry revision overflow".into())
        })?;
        write_json_atomic(&registry_path, &registry)?;
        let recovered =
            migration_coordinator::active_authority(&self.app_data_dir, &self.migration_set_sha256)
                .map_err(|error| {
                    SwitchAuthorityError::ManualRecoveryRequired(format!(
                        "the compensated registry did not produce canonical prior authority: {error}"
                    ))
                })?;
        if recovered.shop_id != committed.previous_authority.shop_id
            || recovered.shop_incarnation_id != committed.previous_authority.shop_incarnation_id
            || recovered.workspace_id != committed.previous_authority.workspace_id
            || recovered.installation_id != committed.previous_authority.installation_id
            || recovered.database_file_id != committed.previous_authority.database_file_id
            || recovered.registry_revision != registry.revision
        {
            return Err(SwitchAuthorityError::ManualRecoveryRequired(
                "the compensated registry produced unexpected prior authority".to_string(),
            ));
        }
        Ok(recovered)
    }

    pub fn complete_recovery(&mut self, now_unix_ms: u64) -> Result<(), SwitchAuthorityError> {
        self.journal.transition(
            &self.installation_root,
            ShopLifecycleStage::Recovered,
            now_unix_ms,
            None,
        )?;
        self.persist_terminal_journal()
    }

    pub fn complete(&mut self, now_unix_ms: u64) -> Result<(), SwitchAuthorityError> {
        self.transition(ShopLifecycleStage::Ready, now_unix_ms)?;
        self.journal.transition(
            &self.installation_root,
            ShopLifecycleStage::Completed,
            now_unix_ms.saturating_add(1),
            None,
        )?;
        self.persist_terminal_journal()
    }

    pub fn block(
        &mut self,
        now_unix_ms: u64,
        failure_code: &str,
        manual_recovery: bool,
    ) -> Result<(), SwitchAuthorityError> {
        self.journal.transition(
            &self.installation_root,
            ShopLifecycleStage::Blocked,
            now_unix_ms,
            Some(failure_code.to_string()),
        )?;
        if manual_recovery {
            self.persist_journal()?;
            self.journal.transition(
                &self.installation_root,
                ShopLifecycleStage::ManualRecoveryRequired,
                now_unix_ms.saturating_add(1),
                Some(failure_code.to_string()),
            )?;
        }
        self.persist_terminal_journal()
    }

    fn restore_after_commit_failure<T>(
        &self,
        registry_path: &Path,
        previous_bytes: &[u8],
        failure: String,
    ) -> Result<T, SwitchAuthorityError> {
        match restore_previous_registry(
            registry_path,
            previous_bytes,
            &self.app_data_dir,
            &self.migration_set_sha256,
            &self.previous_authority,
        ) {
            Ok(()) => Err(SwitchAuthorityError::InvalidRegistry(format!(
                "{failure}; the prior registry authority was restored"
            ))),
            Err(restore_error) => Err(SwitchAuthorityError::ManualRecoveryRequired(format!(
                "{failure}; prior registry restoration also failed ({restore_error})"
            ))),
        }
    }

    fn persist_journal(&self) -> Result<(), SwitchAuthorityError> {
        let current = journal_current_path(&self.app_data_dir);
        write_json_atomic(&current, &self.journal).map_err(Into::into)
    }

    fn persist_terminal_journal(&self) -> Result<(), SwitchAuthorityError> {
        self.persist_journal()?;
        let history = self
            .app_data_dir
            .join(JOURNAL_DIRECTORY)
            .join(format!("{}.json", self.operation_id()));
        write_json_atomic(&history, &self.journal)?;
        Ok(())
    }
}

pub fn accept_switch(
    app_data_dir: &Path,
    migration_set_sha256: &str,
    command: &ShopLifecycleCommand,
    installation_root: &[u8; 32],
    now_unix_ms: u64,
) -> Result<AcceptedSwitch, SwitchAuthorityError> {
    if command.authorization.request.operation != ShopLifecycleOperation::Switch
        || command.authorization.payload != ShopLifecyclePayload::Switch
    {
        return Err(SwitchAuthorityError::UnsupportedOperation);
    }
    command.verify(installation_root, now_unix_ms)?;
    let lifecycle_lock = FileLock::acquire(&app_data_dir.join(LIFECYCLE_LOCK_FILE), "lifecycle")?;
    let migration_lock = FileLock::acquire(&app_data_dir.join(MIGRATION_LOCK_FILE), "migration")?;
    ensure_no_incomplete_journal(app_data_dir, installation_root)?;

    let previous_authority =
        migration_coordinator::active_authority(app_data_dir, migration_set_sha256)
            .map_err(|error| SwitchAuthorityError::InvalidRegistry(error.to_string()))?;
    let registry: ShopRegistry = read_json(&app_data_dir.join(REGISTRY_FILE))?;
    validate_registry_shape(&registry)?;
    let request = &command.authorization.request;
    if request.migration_set_sha256 != migration_set_sha256 {
        return Err(SwitchAuthorityError::AuthorityMismatch(
            "migration-set authority changed".to_string(),
        ));
    }
    let target_id = request
        .target_shop_id
        .as_deref()
        .ok_or_else(|| SwitchAuthorityError::AuthorityMismatch("target shop is missing".into()))?;
    let target_incarnation = request
        .target_shop_incarnation_id
        .as_deref()
        .ok_or_else(|| {
            SwitchAuthorityError::AuthorityMismatch("target incarnation is missing".into())
        })?;
    let target = registry
        .shops
        .iter()
        .find(|shop| shop.id == target_id && shop.incarnation_id == target_incarnation)
        .cloned()
        .ok_or_else(|| {
            SwitchAuthorityError::AuthorityMismatch(
                "target shop authority is stale or unavailable".to_string(),
            )
        })?;
    validate_request_authority(
        &registry,
        &command.authorization.request,
        &previous_authority,
        &target,
    )?;
    preflight_target_database(app_data_dir, &target)?;

    let mut journal =
        AuthenticatedShopLifecycleJournal::accept(command, installation_root, now_unix_ms)?;
    let current = journal_current_path(app_data_dir);
    write_json_atomic(&current, &journal)?;
    journal.transition(
        installation_root,
        ShopLifecycleStage::Authorized,
        now_unix_ms.saturating_add(1),
        None,
    )?;
    write_json_atomic(&current, &journal)?;

    Ok(AcceptedSwitch {
        app_data_dir: app_data_dir.to_path_buf(),
        migration_set_sha256: migration_set_sha256.to_string(),
        installation_root: *installation_root,
        journal,
        previous_authority,
        target,
        committed: None,
        _lifecycle_lock: lifecycle_lock,
        _migration_lock: migration_lock,
    })
}

fn validate_request_authority(
    registry: &ShopRegistry,
    request: &super::shop_lifecycle::ShopLifecycleRequest,
    current: &ActiveShopAuthority,
    target: &ShopRecord,
) -> Result<(), SwitchAuthorityError> {
    if registry.revision != request.expected_registry_revision
        || registry.revision != current.registry_revision
        || registry.workspace_id != request.workspace_id
        || registry.workspace_id != current.workspace_id
        || registry.installation_id != request.installation_id
        || registry.installation_id != current.installation_id
        || registry.active_shop_id.as_deref() != Some(request.current_shop_id.as_str())
        || current.shop_id != request.current_shop_id
        || current.shop_incarnation_id != request.current_shop_incarnation_id
        || target.id != request.target_shop_id.as_deref().unwrap_or_default()
        || target.incarnation_id
            != request
                .target_shop_incarnation_id
                .as_deref()
                .unwrap_or_default()
    {
        return Err(SwitchAuthorityError::AuthorityMismatch(
            "shop lifecycle authority no longer matches the live installation".to_string(),
        ));
    }
    Ok(())
}

fn verify_target_authority(
    authority: &ActiveShopAuthority,
    registry: &ShopRegistry,
    target: &ShopRecord,
) -> Result<(), SwitchAuthorityError> {
    if authority.workspace_id != registry.workspace_id
        || authority.installation_id != registry.installation_id
        || authority.shop_id != target.id
        || authority.shop_incarnation_id != target.incarnation_id
        || authority.database_file_id != target.database_file
        || authority.registry_revision != registry.revision
    {
        return Err(SwitchAuthorityError::InvalidRegistry(
            "committed target authority did not match the exact registry transaction".to_string(),
        ));
    }
    Ok(())
}

fn restore_previous_registry(
    registry_path: &Path,
    previous_bytes: &[u8],
    app_data_dir: &Path,
    migration_set_sha256: &str,
    previous: &ActiveShopAuthority,
) -> Result<(), IoError> {
    write_bytes_atomic(registry_path, previous_bytes)?;
    let restored = migration_coordinator::active_authority(app_data_dir, migration_set_sha256)
        .map_err(|error| IoError::other(error.to_string()))?;
    if restored.workspace_id != previous.workspace_id
        || restored.installation_id != previous.installation_id
        || restored.shop_id != previous.shop_id
        || restored.shop_incarnation_id != previous.shop_incarnation_id
        || restored.database_file_id != previous.database_file_id
        || restored.registry_revision != previous.registry_revision
    {
        return Err(IoError::other(
            "restored registry did not reproduce exact prior authority",
        ));
    }
    Ok(())
}

fn validate_registry_shape(registry: &ShopRegistry) -> Result<(), SwitchAuthorityError> {
    if registry.format_version != REGISTRY_FORMAT_VERSION || registry.revision == 0 {
        return Err(SwitchAuthorityError::InvalidRegistry(
            "unsupported or unprepared shop registry".to_string(),
        ));
    }
    if registry.active_shop_id.is_none() || registry.shops.is_empty() {
        return Err(SwitchAuthorityError::InvalidRegistry(
            "shop registry has no active authority".to_string(),
        ));
    }
    Ok(())
}

fn preflight_target_database(
    app_data_dir: &Path,
    target: &ShopRecord,
) -> Result<(), SwitchAuthorityError> {
    if !valid_database_file(&target.database_file) {
        return Err(SwitchAuthorityError::InvalidRegistry(
            "target database identity is invalid".to_string(),
        ));
    }
    let app_root = fs::canonicalize(app_data_dir)?;
    let shops = app_data_dir.join("shops");
    let shops_metadata = fs::symlink_metadata(&shops)?;
    if path_is_link(&shops_metadata) {
        return Err(SwitchAuthorityError::InvalidRegistry(
            "canonical shops directory must not be redirected".to_string(),
        ));
    }
    let shops_root = fs::canonicalize(&shops)?;
    if shops_root != app_root.join("shops") {
        return Err(SwitchAuthorityError::InvalidRegistry(
            "canonical shops directory escaped the application root".to_string(),
        ));
    }
    let path = shops_root.join(&target.database_file);
    let metadata = fs::symlink_metadata(&path)?;
    if path_is_link(&metadata) || !metadata.is_file() {
        return Err(SwitchAuthorityError::InvalidRegistry(
            "target database is not a contained regular file".to_string(),
        ));
    }
    let resolved = fs::canonicalize(&path)?;
    if resolved.parent() != Some(shops_root.as_path()) {
        return Err(SwitchAuthorityError::InvalidRegistry(
            "target database escaped the canonical shops directory".to_string(),
        ));
    }
    reject_hard_links(&resolved)?;
    let connection = Connection::open_with_flags(
        &resolved,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(SwitchAuthorityError::InvalidRegistry(format!(
            "target database integrity check failed: {integrity}"
        )));
    }
    let foreign_key_failure: Option<i64> = connection
        .query_row(
            "SELECT 1 FROM pragma_foreign_key_check LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if foreign_key_failure.is_some() {
        return Err(SwitchAuthorityError::InvalidRegistry(
            "target database foreign-key check failed".to_string(),
        ));
    }
    Ok(())
}

fn ensure_no_incomplete_journal(
    app_data_dir: &Path,
    installation_root: &[u8; 32],
) -> Result<(), SwitchAuthorityError> {
    let current = journal_current_path(app_data_dir);
    if !current.exists() {
        return Ok(());
    }
    let journal: AuthenticatedShopLifecycleJournal = read_json(&current)?;
    journal.validate(installation_root)?;
    if matches!(
        journal.journal.stage,
        ShopLifecycleStage::Completed | ShopLifecycleStage::Recovered | ShopLifecycleStage::Blocked
    ) {
        return Ok(());
    }
    Err(SwitchAuthorityError::IncompleteJournal(format!(
        "operation {} remains at stage {:?}",
        journal.journal.request.operation_id, journal.journal.stage
    )))
}

fn journal_current_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir
        .join(JOURNAL_DIRECTORY)
        .join(CURRENT_JOURNAL_FILE)
}

fn valid_database_file(value: &str) -> bool {
    let Some(stem) = value.strip_suffix(".db") else {
        return false;
    };
    !stem.is_empty()
        && (stem.as_bytes()[0].is_ascii_lowercase() || stem.as_bytes()[0].is_ascii_digit())
        && stem
            .bytes()
            .skip(1)
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

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
    false
}

#[cfg(windows)]
fn reject_hard_links(path: &Path) -> Result<(), SwitchAuthorityError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION, FILE_ATTRIBUTE_NORMAL,
        FILE_READ_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    let wide = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            FILE_READ_ATTRIBUTES,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            std::ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(IoError::last_os_error().into());
    }
    let mut information: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
    let queried = unsafe { GetFileInformationByHandle(handle, &mut information) };
    let error = (queried == 0).then(IoError::last_os_error);
    unsafe { CloseHandle(handle) };
    if let Some(error) = error {
        return Err(error.into());
    }
    if information.nNumberOfLinks != 1 {
        return Err(SwitchAuthorityError::InvalidRegistry(
            "target database must not be hard-linked".to_string(),
        ));
    }
    Ok(())
}

#[cfg(unix)]
fn reject_hard_links(path: &Path) -> Result<(), SwitchAuthorityError> {
    use std::os::unix::fs::MetadataExt;
    if fs::metadata(path)?.nlink() != 1 {
        return Err(SwitchAuthorityError::InvalidRegistry(
            "target database must not be hard-linked".to_string(),
        ));
    }
    Ok(())
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, SwitchAuthorityError> {
    Ok(serde_json::from_slice(&fs::read(path)?)?)
}

fn write_json_atomic<T: Serialize>(path: &Path, value: &T) -> Result<(), SwitchAuthorityError> {
    let mut bytes = serde_json::to_vec_pretty(value)?;
    bytes.push(b'\n');
    write_bytes_atomic(path, &bytes)?;
    Ok(())
}

fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), IoError> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temp = path.with_extension(format!("{}.tmp", random_hex(8)?));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    let result = replace_file_durable(&temp, path);
    if result.is_err() {
        let _ = fs::remove_file(&temp);
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
        let replaced = unsafe {
            ReplaceFileW(
                target_wide.as_ptr(),
                staged_wide.as_ptr(),
                std::ptr::null(),
                0,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };
        if replaced == 0 {
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
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(target)?
        .sync_all()
}

#[cfg(not(windows))]
fn replace_file_durable(staged: &Path, target: &Path) -> Result<(), IoError> {
    fs::rename(staged, target)?;
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(target)?
        .sync_all()?;
    if let Some(parent) = target.parent() {
        File::open(parent)?.sync_all()?;
    }
    Ok(())
}

fn random_hex(byte_count: usize) -> Result<String, IoError> {
    let mut bytes = vec![0_u8; byte_count];
    getrandom::getrandom(&mut bytes)
        .map_err(|error| IoError::other(format!("secure OS randomness failed: {error}")))?;
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(byte_count * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    Ok(output)
}

struct FileLock {
    file: File,
}

impl FileLock {
    fn acquire(path: &Path, label: &str) -> Result<Self, SwitchAuthorityError> {
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(path)?;
        file.try_lock_exclusive().map_err(|error| {
            SwitchAuthorityError::Busy(format!("another {label} operation owns the lock: {error}"))
        })?;
        Ok(Self { file })
    }
}

impl Drop for FileLock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}

#[derive(Debug)]
pub enum SwitchAuthorityError {
    Command(ShopLifecycleCommandError),
    Io(IoError),
    Json(serde_json::Error),
    Sqlite(rusqlite::Error),
    UnsupportedOperation,
    AuthorityMismatch(String),
    InvalidRegistry(String),
    InvalidState(String),
    IncompleteJournal(String),
    Busy(String),
    ManualRecoveryRequired(String),
}

impl fmt::Display for SwitchAuthorityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Command(error) => write!(formatter, "shop lifecycle command rejected: {error}"),
            Self::Io(error) => write!(formatter, "shop lifecycle I/O failed: {error}"),
            Self::Json(error) => write!(formatter, "shop lifecycle JSON is invalid: {error}"),
            Self::Sqlite(error) => {
                write!(formatter, "shop lifecycle SQLite preflight failed: {error}")
            }
            Self::UnsupportedOperation => {
                write!(
                    formatter,
                    "only native switch is accepted by this authority"
                )
            }
            Self::AuthorityMismatch(message) => {
                write!(formatter, "shop lifecycle authority mismatch: {message}")
            }
            Self::InvalidRegistry(message) => {
                write!(formatter, "shop registry rejected: {message}")
            }
            Self::InvalidState(message) => {
                write!(formatter, "shop lifecycle state rejected: {message}")
            }
            Self::IncompleteJournal(message) => write!(
                formatter,
                "an incomplete shop lifecycle journal blocks the operation: {message}"
            ),
            Self::Busy(message) => {
                write!(formatter, "shop lifecycle authority is busy: {message}")
            }
            Self::ManualRecoveryRequired(message) => write!(
                formatter,
                "manual shop lifecycle recovery is required: {message}"
            ),
        }
    }
}

impl std::error::Error for SwitchAuthorityError {}

impl From<ShopLifecycleCommandError> for SwitchAuthorityError {
    fn from(value: ShopLifecycleCommandError) -> Self {
        Self::Command(value)
    }
}

impl From<IoError> for SwitchAuthorityError {
    fn from(value: IoError) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for SwitchAuthorityError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

impl From<rusqlite::Error> for SwitchAuthorityError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Sqlite(value)
    }
}
