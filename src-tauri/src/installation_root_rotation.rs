use crate::child_containment::ContainedChild;
use crate::installation_root_key::{
    self, InstallationRootRotationPreparation, PreparedInstallationRootRotation,
};
use crate::migration_coordinator;
use std::ffi::OsString;
use std::io::{Error as IoError, ErrorKind};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

const ROTATION_FRAME_MAGIC: &[u8; 8] = b"SFRKRT01";
const ROTATION_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const PROCESS_TREE_STOP_TIMEOUT: Duration = Duration::from_secs(10);
const ROTATION_WORKER: &str = "sahelflow-rotate-master-key.cjs";

pub(crate) fn rotate_packaged_installation_root(
    app_data_dir: &Path,
    resource_dir: &Path,
) -> Result<PathBuf, Box<dyn std::error::Error>> {
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
        prisma_engine.as_os_str().to_owned(),
    ));

    let mut frame = [0_u8; 72];
    frame[..8].copy_from_slice(ROTATION_FRAME_MAGIC);
    frame[8..40].copy_from_slice(rotation.current_root.as_bytes());
    frame[40..].copy_from_slice(rotation.candidate_root.as_bytes());
    let spawned = ContainedChild::spawn_in_capturing_stderr_with_stdin_frame(
        &node,
        &[
            OsString::from("--conditions=react-server"),
            worker.as_os_str().to_owned(),
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
