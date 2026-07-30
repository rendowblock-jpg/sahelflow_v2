use crate::child_containment::ContainedChild;
use crate::installation_root_key::{
    self, InstallationRootRotationPreparation, PreparedInstallationRootRotation,
};
use crate::migration_coordinator;
use serde::Deserialize;
use std::ffi::OsString;
use std::fs;
use std::io::{Error as IoError, ErrorKind, Read};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

#[cfg(windows)]
use windows_sys::Win32::Foundation::{CloseHandle, ERROR_INVALID_PARAMETER, STILL_ACTIVE};
#[cfg(windows)]
use windows_sys::Win32::System::Threading::{
    GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
};

const ROTATION_FRAME_MAGIC: &[u8; 8] = b"SFRKRT01";
const ROTATION_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const PROCESS_TREE_STOP_TIMEOUT: Duration = Duration::from_secs(10);
const ROTATION_WORKER: &str = "sahelflow-rotate-master-key.cjs";
const RUNTIME_MANIFEST: &str = "runtime-endpoint.json";
const MAX_RUNTIME_MANIFEST_BYTES: u64 = 16 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeEndpointManifest {
    format_version: u8,
    state: String,
    host: String,
    app_port: u16,
    process_id: u32,
}

pub(crate) fn rotate_packaged_installation_root(
    app_data_dir: &Path,
    resource_dir: &Path,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    // Prove the packaged server is stopped before generating any candidate or
    // journal. The worker repeats this proof after acquiring the maintenance
    // lease, closing the race without mutating key authority on a rejected run.
    assert_runtime_stopped(app_data_dir)?;
    let system_dir = app_data_dir.join("system");
    let protected_identity = installation_root_key::probe_protected_identity(&system_dir)?;
    let identity = migration_coordinator::installation_identity_before_mutation(
        app_data_dir,
        protected_identity,
    )?;
    let prepared =
        installation_root_key::prepare_installation_root_rotation(&system_dir, identity)?;
    let rotation = match prepared {
        InstallationRootRotationPreparation::Ready(rotation) => rotation,
        InstallationRootRotationPreparation::RecoveredCommitted { receipt_path } => {
            return Ok(receipt_path);
        }
    };

    run_rotation_worker(app_data_dir, resource_dir, rotation)
}

fn run_rotation_worker(
    app_data_dir: &Path,
    resource_dir: &Path,
    rotation: PreparedInstallationRootRotation,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
    let node = canonical_resource_file(resource_dir, Path::new("runtime").join("node.exe"))?;
    let prisma_engine = canonical_resource_file(
        resource_dir,
        Path::new("runtime").join("query_engine-windows.dll.node"),
    )?;
    let worker =
        canonical_resource_file(resource_dir, Path::new("standalone").join(ROTATION_WORKER))?;
    let worker_argument = crate::node_entrypoint_environment_value(&worker)?;
    let prisma_engine_environment = crate::node_entrypoint_environment_value(&prisma_engine)?;
    let working_dir = worker.parent().ok_or_else(|| {
        IoError::new(
            ErrorKind::InvalidData,
            "protected rotation worker has no parent directory",
        )
    })?;

    let mut environment = ["SystemRoot", "WINDIR", "TEMP", "TMP"]
        .into_iter()
        .filter_map(|key| std::env::var_os(key).map(|value| (OsString::from(key), value)))
        .collect::<Vec<_>>();
    environment.push((OsString::from("NODE_ENV"), OsString::from("production")));
    environment.push((
        OsString::from("SF_DATA_DIR"),
        app_data_dir.as_os_str().to_owned(),
    ));
    environment.push((
        OsString::from("SF_INSTALLATION_ROOT_ROTATION_SOURCE"),
        OsString::from("native-stdin-v1"),
    ));
    // Rotation receives both roots through its own bounded frame and must pass
    // them explicitly to every crypto helper. Mark the process as protected so
    // an omitted argument fails closed instead of recreating master.key.
    environment.push((
        OsString::from("SF_INSTALLATION_ROOT_SOURCE"),
        OsString::from("native-stdin-v1"),
    ));
    // The worker is a separate bundle from the Next.js server. Bind Prisma to
    // the exact installed engine instead of relying on bundle-relative lookup.
    environment.push((
        OsString::from("PRISMA_QUERY_ENGINE_LIBRARY"),
        OsString::from(prisma_engine_environment),
    ));

    let mut frame = [0_u8; 72];
    frame[..8].copy_from_slice(ROTATION_FRAME_MAGIC);
    frame[8..40].copy_from_slice(rotation.current_root.as_bytes());
    frame[40..].copy_from_slice(rotation.candidate_root.as_bytes());
    let spawned = ContainedChild::spawn_in_capturing_stderr_with_stdin_frame(
        &node,
        &[
            OsString::from("--conditions=react-server"),
            OsString::from(worker_argument),
            OsString::from("--recover-stale-lock"),
        ],
        &environment,
        Some(working_dir),
        &frame,
    );
    installation_root_key::clear_secret_bytes(&mut frame);
    let child = spawned.map_err(|error| {
        IoError::other(format!(
            "failed to start the protected installation-root rotation worker: {error}"
        ))
    })?;

    let deadline = Instant::now() + ROTATION_TIMEOUT;
    let exit = loop {
        if let Some(exit) = child.try_wait()? {
            let closed = child.wait_for_exit_and_close_tree(PROCESS_TREE_STOP_TIMEOUT)?;
            if closed.code != exit.code {
                return Err(IoError::other(
                    "protected rotation worker exit changed while closing its process tree",
                )
                .into());
            }
            break closed;
        }
        if Instant::now() >= deadline {
            child.terminate_tree_and_wait(PROCESS_TREE_STOP_TIMEOUT)?;
            return Err(IoError::new(
                ErrorKind::TimedOut,
                "protected installation-root rotation exceeded 30 minutes",
            )
            .into());
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    if exit.code != 0 {
        let diagnostic = child
            .stderr_snapshot(Duration::from_secs(2))
            .unwrap_or_default();
        let detail = crate::summarize_runtime_stderr(&diagnostic)
            .map(|summary| {
                format!(
                    "protected rotation worker failed with exit code {}: {summary}",
                    exit.code
                )
            })
            .unwrap_or_else(|| {
                format!(
                    "protected rotation worker failed with exit code {}",
                    exit.code
                )
            });
        return Err(IoError::other(detail).into());
    }

    Ok(installation_root_key::commit_installation_root_rotation(
        rotation,
    )?)
}

fn assert_runtime_stopped(app_data_dir: &Path) -> Result<(), IoError> {
    let manifest_path = app_data_dir.join(RUNTIME_MANIFEST);
    let manifest_metadata = match fs::symlink_metadata(&manifest_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
        Err(error) => {
            return Err(IoError::new(
                error.kind(),
                format!("runtime endpoint manifest metadata is unavailable: {error}"),
            ));
        }
    };
    if manifest_metadata.file_type().is_symlink() || !manifest_metadata.is_file() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "runtime endpoint manifest is a symlink or is not a regular file",
        ));
    }
    if manifest_metadata.len() > MAX_RUNTIME_MANIFEST_BYTES {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "runtime endpoint manifest exceeds the size limit",
        ));
    }

    let file = fs::File::open(&manifest_path)?;
    let opened_metadata = file.metadata()?;
    if !opened_metadata.is_file() || opened_metadata.len() > MAX_RUNTIME_MANIFEST_BYTES {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "runtime endpoint manifest changed or exceeds the size limit",
        ));
    }
    let mut payload = Vec::with_capacity(opened_metadata.len() as usize);
    file.take(MAX_RUNTIME_MANIFEST_BYTES + 1)
        .read_to_end(&mut payload)?;
    if payload.len() as u64 > MAX_RUNTIME_MANIFEST_BYTES {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "runtime endpoint manifest exceeds the size limit",
        ));
    }
    let final_metadata = fs::symlink_metadata(&manifest_path)?;
    if final_metadata.file_type().is_symlink()
        || !final_metadata.is_file()
        || final_metadata.len() != manifest_metadata.len()
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "runtime endpoint manifest changed during validation",
        ));
    }

    let manifest: RuntimeEndpointManifest = serde_json::from_slice(&payload).map_err(|_| {
        IoError::new(
            ErrorKind::InvalidData,
            "runtime endpoint manifest is malformed",
        )
    })?;
    if manifest.format_version != 1
        || manifest.state != "ready"
        || manifest.host != "127.0.0.1"
        || manifest.app_port == 0
        || manifest.process_id == 0
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "runtime endpoint manifest is malformed",
        ));
    }

    let process_alive = process_is_alive(manifest.process_id);
    let port_open = TcpStream::connect_timeout(
        &SocketAddr::from((Ipv4Addr::LOCALHOST, manifest.app_port)),
        Duration::from_millis(500),
    )
    .is_ok();
    if process_alive || port_open {
        return Err(IoError::new(
            ErrorKind::WouldBlock,
            format!(
                "SahelFlow is still running (PID {}, port {})",
                manifest.process_id, manifest.app_port
            ),
        ));
    }
    Ok(())
}

#[cfg(windows)]
fn process_is_alive(process_id: u32) -> bool {
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, process_id) };
    if handle == 0 {
        return IoError::last_os_error().raw_os_error() != Some(ERROR_INVALID_PARAMETER as i32);
    }
    let mut exit_code = 0_u32;
    let observed = unsafe { GetExitCodeProcess(handle, &mut exit_code) } != 0;
    unsafe {
        CloseHandle(handle);
    }
    !observed || exit_code == STILL_ACTIVE as u32
}

#[cfg(not(windows))]
fn process_is_alive(process_id: u32) -> bool {
    process_id == std::process::id()
}

fn canonical_resource_file(resource_dir: &Path, relative: PathBuf) -> Result<PathBuf, IoError> {
    let root = std::fs::canonicalize(resource_dir)?;
    let path = std::fs::canonicalize(resource_dir.join(relative))?;
    if !path.starts_with(&root) || !std::fs::metadata(&path)?.is_file() {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "protected rotation resource escaped the installed resource tree",
        ));
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let suffix = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "sahelflow-installation-root-rotation-{label}-{}-{suffix}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("test directory");
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn live_runtime_manifest_blocks_before_rotation_authority_is_created() {
        let directory = TestDirectory::new("live-runtime");
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("listener");
        let port = listener.local_addr().expect("listener address").port();
        let manifest = serde_json::json!({
            "formatVersion": 1,
            "state": "ready",
            "host": "127.0.0.1",
            "appPort": port,
            "processId": std::process::id(),
        });
        fs::write(
            directory.0.join(RUNTIME_MANIFEST),
            serde_json::to_vec(&manifest).expect("manifest"),
        )
        .expect("write manifest");

        let error = rotate_packaged_installation_root(&directory.0, &directory.0)
            .expect_err("live runtime must block rotation");
        assert!(error.to_string().contains("SahelFlow is still running"));
        assert!(!directory.0.join("system").exists());
    }

    #[test]
    fn malformed_runtime_manifest_fails_closed() {
        let directory = TestDirectory::new("malformed-runtime");
        fs::write(directory.0.join(RUNTIME_MANIFEST), b"not-json")
            .expect("write malformed manifest");

        let error = assert_runtime_stopped(&directory.0)
            .expect_err("malformed runtime authority must block rotation");
        assert_eq!(error.kind(), ErrorKind::InvalidData);
    }

    #[test]
    fn non_file_runtime_manifest_fails_closed() {
        let directory = TestDirectory::new("non-file-runtime");
        fs::create_dir(directory.0.join(RUNTIME_MANIFEST)).expect("manifest directory");

        let error = assert_runtime_stopped(&directory.0)
            .expect_err("non-file runtime authority must block rotation");
        assert_eq!(error.kind(), ErrorKind::InvalidData);
    }

    #[test]
    fn oversized_runtime_manifest_fails_closed() {
        let directory = TestDirectory::new("oversized-runtime");
        fs::write(
            directory.0.join(RUNTIME_MANIFEST),
            vec![b'x'; MAX_RUNTIME_MANIFEST_BYTES as usize + 1],
        )
        .expect("write oversized manifest");

        let error = assert_runtime_stopped(&directory.0)
            .expect_err("oversized runtime authority must block rotation");
        assert_eq!(error.kind(), ErrorKind::InvalidData);
    }
}
