use crate::backup_recovery;
use crate::installation_root_key::{self, InstallationIdentity, InstallationRootRequest};
use crate::survivability_bridge::SurvivabilityBridge;
use serde::Deserialize;
use std::fs;
use std::io::{Error as IoError, ErrorKind};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const IDENTIFIER: &str = "com.sahelflow.desktop";
const RUNTIME_MANIFEST: &str = "runtime-endpoint.json";
const MAX_RUNTIME_MANIFEST_BYTES: u64 = 16 * 1024;
const RUNTIME_STOP_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "camelCase")]
struct RuntimeEndpointManifest {
    format_version: u8,
    state: String,
    host: String,
    app_port: u16,
    instance_id: String,
    process_id: u32,
    app_version: String,
    created_at_unix_seconds: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct RuntimeManifestIdentity {
    instance_id: String,
    process_id: u32,
    created_at_unix_seconds: u64,
}

impl RuntimeEndpointManifest {
    fn identity(&self) -> RuntimeManifestIdentity {
        RuntimeManifestIdentity {
            instance_id: self.instance_id.clone(),
            process_id: self.process_id,
            created_at_unix_seconds: self.created_at_unix_seconds,
        }
    }
}

pub(crate) struct SurvivabilityController {
    shutdown: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
}

impl SurvivabilityController {
    pub(crate) fn start() -> Result<Self, IoError> {
        let app_data_dir = app_data_dir()?;
        let download_dir = download_dir()?;
        let document_dir = document_dir()?;
        let controller_started_at_unix_seconds = unix_seconds_now();
        let initial_manifest_identity = read_runtime_manifest(&app_data_dir)
            .ok()
            .flatten()
            .map(|manifest| manifest.identity());
        let shutdown = Arc::new(AtomicBool::new(false));
        let thread_shutdown = Arc::clone(&shutdown);
        let worker = thread::Builder::new()
            .name("sahelflow-survivability-controller".to_owned())
            .spawn(move || {
                let mut bridge: Option<SurvivabilityBridge> = None;
                while !thread_shutdown.load(Ordering::Acquire) {
                    if bridge.is_none()
                        && runtime_ready(
                            &app_data_dir,
                            controller_started_at_unix_seconds,
                            initial_manifest_identity.as_ref(),
                        )
                        .unwrap_or(false)
                    {
                        match start_ready_bridge(
                            &app_data_dir,
                            &download_dir,
                            &document_dir,
                        ) {
                            Ok(started) => bridge = Some(started),
                            Err(error) => eprintln!(
                                "[sahelflow] protected survivability bridge remains unavailable ({})",
                                classify_error(&error)
                            ),
                        }
                    }
                    thread::sleep(Duration::from_millis(100));
                }
                drop(bridge);
            })?;
        Ok(Self {
            shutdown,
            worker: Some(worker),
        })
    }
}

impl Drop for SurvivabilityController {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

pub(crate) fn pending_restore_present() -> Result<bool, IoError> {
    Ok(backup_recovery::pending_restore_present(&app_data_dir()?))
}

pub(crate) fn recover_pending_before_run() -> Result<(), IoError> {
    let app_data_dir = app_data_dir()?;
    if !backup_recovery::pending_restore_present(&app_data_dir) {
        return Ok(());
    }
    wait_for_previous_runtime_stop(&app_data_dir)?;
    backup_recovery::recover_pending_before_startup(&app_data_dir)?;
    Ok(())
}

fn start_ready_bridge(
    app_data_dir: &Path,
    download_dir: &Path,
    document_dir: &Path,
) -> Result<SurvivabilityBridge, IoError> {
    let authority = backup_recovery::discover_backup_authority(app_data_dir)?;
    let identity = InstallationIdentity::new(
        authority.workspace_id.clone(),
        authority.installation_id.clone(),
    )
    .map_err(|error| IoError::other(error.to_string()))?;
    let system_dir = app_data_dir.join("system");
    let prepared = installation_root_key::prepare_installation_root(InstallationRootRequest {
        system_dir: &system_dir,
        legacy_master_key_path: &app_data_dir.join("master.key"),
        identity,
        existing_authority_present: true,
        provably_fresh: false,
    })
    .map_err(|error| IoError::other(error.to_string()))?;
    SurvivabilityBridge::start(
        app_data_dir.to_path_buf(),
        download_dir.to_path_buf(),
        document_dir.to_path_buf(),
        prepared.root_key.as_bytes(),
        authority,
    )
}

fn runtime_ready(
    app_data_dir: &Path,
    controller_started_at_unix_seconds: u64,
    initial_manifest_identity: Option<&RuntimeManifestIdentity>,
) -> Result<bool, IoError> {
    let Some(manifest) = read_runtime_manifest(app_data_dir)? else {
        return Ok(false);
    };
    if !manifest_matches_current_launch(
        &manifest,
        std::process::id(),
        env!("CARGO_PKG_VERSION"),
        controller_started_at_unix_seconds,
        initial_manifest_identity,
    ) {
        return Ok(false);
    }

    let address = SocketAddr::from((Ipv4Addr::LOCALHOST, manifest.app_port));
    Ok(TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_ok())
}

fn manifest_matches_current_launch(
    manifest: &RuntimeEndpointManifest,
    current_process_id: u32,
    current_app_version: &str,
    controller_started_at_unix_seconds: u64,
    initial_manifest_identity: Option<&RuntimeManifestIdentity>,
) -> bool {
    manifest.process_id == current_process_id
        && manifest.app_version == current_app_version
        && manifest.created_at_unix_seconds >= controller_started_at_unix_seconds
        && initial_manifest_identity != Some(&manifest.identity())
}

fn read_runtime_manifest(app_data_dir: &Path) -> Result<Option<RuntimeEndpointManifest>, IoError> {
    let path = app_data_dir.join(RUNTIME_MANIFEST);
    let metadata = match fs::symlink_metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    if metadata.file_type().is_symlink()
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > MAX_RUNTIME_MANIFEST_BYTES
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "packaged runtime readiness authority is invalid",
        ));
    }
    let manifest: RuntimeEndpointManifest = serde_json::from_slice(&fs::read(&path)?)
        .map_err(|error| IoError::new(ErrorKind::InvalidData, error.to_string()))?;
    let valid_instance_id = manifest.instance_id.len() == 32
        && manifest
            .instance_id
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit());
    if manifest.format_version != 1
        || manifest.state != "ready"
        || manifest.host != "127.0.0.1"
        || manifest.app_port == 0
        || !valid_instance_id
        || manifest.process_id == 0
        || manifest.app_version.is_empty()
        || manifest.created_at_unix_seconds == 0
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "packaged runtime readiness authority is malformed",
        ));
    }
    Ok(Some(manifest))
}

fn wait_for_previous_runtime_stop(app_data_dir: &Path) -> Result<(), IoError> {
    let deadline = Instant::now() + RUNTIME_STOP_TIMEOUT;
    loop {
        let Some(manifest) = read_runtime_manifest(app_data_dir)? else {
            return Ok(());
        };
        let address = SocketAddr::from((Ipv4Addr::LOCALHOST, manifest.app_port));
        if TcpStream::connect_timeout(&address, Duration::from_millis(250)).is_err() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(IoError::new(
                ErrorKind::WouldBlock,
                "replacement restore is waiting for the previous packaged runtime to stop",
            ));
        }
        thread::sleep(Duration::from_millis(100));
    }
}

fn unix_seconds_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn app_data_dir() -> Result<PathBuf, IoError> {
    #[cfg(windows)]
    {
        let root = std::env::var_os("APPDATA").ok_or_else(|| {
            IoError::new(
                ErrorKind::NotFound,
                "Windows roaming AppData is unavailable",
            )
        })?;
        return Ok(PathBuf::from(root).join(IDENTIFIER));
    }
    #[cfg(not(windows))]
    {
        if let Some(root) = std::env::var_os("XDG_DATA_HOME") {
            return Ok(PathBuf::from(root).join(IDENTIFIER));
        }
        let home = std::env::var_os("HOME")
            .ok_or_else(|| IoError::new(ErrorKind::NotFound, "home directory is unavailable"))?;
        Ok(PathBuf::from(home)
            .join(".local")
            .join("share")
            .join(IDENTIFIER))
    }
}

fn user_profile() -> Result<PathBuf, IoError> {
    #[cfg(windows)]
    let variable = "USERPROFILE";
    #[cfg(not(windows))]
    let variable = "HOME";
    std::env::var_os(variable)
        .map(PathBuf::from)
        .ok_or_else(|| IoError::new(ErrorKind::NotFound, "user profile is unavailable"))
}

fn download_dir() -> Result<PathBuf, IoError> {
    let configured = std::env::var_os("SF_BACKUP_DIRECTORY").map(PathBuf::from);
    Ok(configured.unwrap_or(user_profile()?.join("Downloads")))
}

fn document_dir() -> Result<PathBuf, IoError> {
    let configured = std::env::var_os("SF_RECOVERY_KIT_DIRECTORY").map(PathBuf::from);
    Ok(configured.unwrap_or(user_profile()?.join("Documents")))
}

fn classify_error(error: &IoError) -> &'static str {
    match error.kind() {
        ErrorKind::NotFound => "authority-not-ready",
        ErrorKind::InvalidData | ErrorKind::InvalidInput => "authority-invalid",
        ErrorKind::PermissionDenied => "authority-denied",
        ErrorKind::WouldBlock => "authority-busy",
        _ => "authority-operation",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn manifest(
        instance_id: &str,
        process_id: u32,
        created_at_unix_seconds: u64,
    ) -> RuntimeEndpointManifest {
        RuntimeEndpointManifest {
            format_version: 1,
            state: "ready".to_owned(),
            host: "127.0.0.1".to_owned(),
            app_port: 3000,
            instance_id: instance_id.to_owned(),
            process_id,
            app_version: env!("CARGO_PKG_VERSION").to_owned(),
            created_at_unix_seconds,
        }
    }

    #[test]
    fn runtime_manifest_requires_exact_ready_state() {
        let current = manifest(&"a".repeat(32), 41, 100);
        assert_eq!(current.state, "ready");
        assert!(current.app_port > 0);
        assert!(manifest_matches_current_launch(
            &current,
            41,
            env!("CARGO_PKG_VERSION"),
            100,
            None,
        ));
    }

    #[test]
    fn stale_startup_manifest_cannot_start_the_survivability_bridge() {
        let stale = manifest(&"a".repeat(32), 41, 100);
        let initial_identity = stale.identity();

        assert!(!manifest_matches_current_launch(
            &stale,
            41,
            env!("CARGO_PKG_VERSION"),
            100,
            Some(&initial_identity),
        ));
        assert!(!manifest_matches_current_launch(
            &stale,
            42,
            env!("CARGO_PKG_VERSION"),
            100,
            None,
        ));
        assert!(!manifest_matches_current_launch(
            &stale,
            41,
            env!("CARGO_PKG_VERSION"),
            101,
            None,
        ));

        let current = manifest(&"b".repeat(32), 41, 101);
        assert!(manifest_matches_current_launch(
            &current,
            41,
            env!("CARGO_PKG_VERSION"),
            100,
            Some(&initial_identity),
        ));
    }
}
