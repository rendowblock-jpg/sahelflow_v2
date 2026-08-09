use crate::backup_recovery::{
    self, BackupAuthority, BackupSummary, RecoveryKitResult, RestorePreparationResult,
};
use crate::key_hierarchy::{derive_installation_key, PURPOSE_NATIVE_COMMAND_BRIDGE};
use crate::native_command::{self, NativeCommandReplay};
use crate::native_crypto::{clear_bytes, frame, hex_encode, hmac_sha256, random_array};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::{Error as IoError, ErrorKind, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const ENDPOINT_FILE: &str = "survivability-endpoint.json";
const ENDPOINT_FORMAT_VERSION: u8 = 1;
const HANDSHAKE_FORMAT_VERSION: u8 = 1;
const REQUEST_FORMAT_VERSION: u8 = 1;
const RESPONSE_FORMAT_VERSION: u8 = 1;
const HANDSHAKE_MAC_DOMAIN: &[u8] = b"sahelflow.survivability.handshake.v1\0";
const MAX_REQUEST_BYTES: usize = 128 * 1024;
const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const ACCEPT_POLL: Duration = Duration::from_millis(25);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct EndpointManifest {
    format_version: u8,
    state: &'static str,
    host: &'static str,
    port: u16,
    instance_id: String,
    process_id: u32,
    created_at_unix_ms: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeHandshake<'a> {
    format_version: u8,
    instance_id: &'a str,
    port: u16,
    workspace_id: &'a str,
    installation_id: &'a str,
    challenge: String,
    mac: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BridgeRequest {
    format_version: u8,
    request_id: String,
    instance_id: String,
    operation: String,
    authorization: String,
    backup_id: Option<String>,
    recovery_code: Option<String>,
}

impl Drop for BridgeRequest {
    fn drop(&mut self) {
        clear_string(&mut self.authorization);
        if let Some(code) = self.recovery_code.as_mut() {
            clear_string(code);
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeError<'a> {
    code: &'a str,
    message: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BridgeResponse<'a> {
    format_version: u8,
    request_id: &'a str,
    state: &'static str,
    result: Option<Value>,
    error: Option<BridgeError<'static>>,
    completed_at_unix_ms: u64,
}

struct BridgeContext {
    app_data_dir: PathBuf,
    download_dir: PathBuf,
    document_dir: PathBuf,
    installation_root: [u8; 32],
    authority: BackupAuthority,
    instance_id: String,
    port: u16,
    replay: Mutex<NativeCommandReplay>,
}

impl Drop for BridgeContext {
    fn drop(&mut self) {
        clear_bytes(&mut self.installation_root);
    }
}

pub(crate) struct SurvivabilityBridge {
    shutdown: Arc<AtomicBool>,
    worker: Option<JoinHandle<()>>,
    wake_address: SocketAddr,
    endpoint_path: PathBuf,
}

impl SurvivabilityBridge {
    pub(crate) fn start(
        app_data_dir: PathBuf,
        download_dir: PathBuf,
        document_dir: PathBuf,
        installation_root: &[u8; 32],
        authority: BackupAuthority,
    ) -> Result<Self, IoError> {
        validate_authority(&authority)?;
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        listener.set_nonblocking(true)?;
        let wake_address = listener.local_addr()?;
        let port = wake_address.port();
        let instance_id = hex_encode(&random_array::<16>()?);
        let endpoint_path = app_data_dir.join("system").join(ENDPOINT_FILE);
        write_endpoint(
            &endpoint_path,
            &EndpointManifest {
                format_version: ENDPOINT_FORMAT_VERSION,
                state: "ready",
                host: "127.0.0.1",
                port,
                instance_id: instance_id.clone(),
                process_id: std::process::id(),
                created_at_unix_ms: now_unix_ms()?,
            },
        )?;

        let shutdown = Arc::new(AtomicBool::new(false));
        let thread_shutdown = Arc::clone(&shutdown);
        let replay_path = app_data_dir
            .join("system")
            .join("native-command-replay.json");
        let mut root = [0_u8; 32];
        root.copy_from_slice(installation_root);
        let context = BridgeContext {
            app_data_dir,
            download_dir,
            document_dir,
            installation_root: root,
            authority,
            instance_id,
            port,
            replay: Mutex::new(NativeCommandReplay::new(replay_path)),
        };
        let worker = thread::Builder::new()
            .name("sahelflow-survivability".to_owned())
            .spawn(move || bridge_loop(listener, thread_shutdown, context))?;

        Ok(Self {
            shutdown,
            worker: Some(worker),
            wake_address,
            endpoint_path,
        })
    }
}

impl Drop for SurvivabilityBridge {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Release);
        let _ = TcpStream::connect_timeout(&self.wake_address, Duration::from_millis(250));
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
        let _ = remove_endpoint(&self.endpoint_path);
    }
}

fn bridge_loop(listener: TcpListener, shutdown: Arc<AtomicBool>, context: BridgeContext) {
    while !shutdown.load(Ordering::Acquire) {
        match listener.accept() {
            Ok((mut stream, peer)) => {
                if peer.ip() != Ipv4Addr::LOCALHOST {
                    continue;
                }
                // Winsock accepted sockets inherit the listening socket's
                // nonblocking property. The listener polls so controller
                // shutdown stays responsive, but the framed handshake/request
                // protocol below is intentionally blocking with bounded I/O
                // timeouts. Restore that mode before the first protocol read.
                if let Err(error) = stream.set_nonblocking(false) {
                    eprintln!(
                        "[sahelflow] protected survivability connection mode failed ({})",
                        classify_log_error(&error)
                    );
                    continue;
                }
                let _ = stream.set_read_timeout(Some(CONNECTION_TIMEOUT));
                let _ = stream.set_write_timeout(Some(CONNECTION_TIMEOUT));
                let _ = stream.set_nodelay(true);
                if let Err(error) = handle_connection(&mut stream, &context) {
                    eprintln!(
                        "[sahelflow] protected survivability request failed ({})",
                        classify_log_error(&error)
                    );
                }
            }
            Err(error) if error.kind() == ErrorKind::WouldBlock => {
                thread::sleep(ACCEPT_POLL);
            }
            Err(error) => {
                eprintln!(
                    "[sahelflow] protected survivability listener stopped ({})",
                    classify_log_error(&error)
                );
                break;
            }
        }
    }
}

fn handle_connection(stream: &mut TcpStream, context: &BridgeContext) -> Result<(), IoError> {
    write_handshake(stream, context)?;
    let mut request_bytes = read_frame(stream, MAX_REQUEST_BYTES)?;
    let request_result = serde_json::from_slice::<BridgeRequest>(&request_bytes).map_err(|error| {
        IoError::new(
            ErrorKind::InvalidData,
            format!("request JSON is invalid: {error}"),
        )
    });
    clear_bytes(&mut request_bytes);
    let request = request_result?;
    let request_id = if is_lower_hex(&request.request_id, 32) {
        request.request_id.clone()
    } else {
        "invalid-request".to_owned()
    };

    let response = match execute_request(context, request) {
        Ok(result) => BridgeResponse {
            format_version: RESPONSE_FORMAT_VERSION,
            request_id: &request_id,
            state: "complete",
            result: Some(result),
            error: None,
            completed_at_unix_ms: now_unix_ms()?,
        },
        Err(error) => {
            let (code, message) = public_error(&error);
            BridgeResponse {
                format_version: RESPONSE_FORMAT_VERSION,
                request_id: &request_id,
                state: "failed",
                result: None,
                error: Some(BridgeError { code, message }),
                completed_at_unix_ms: now_unix_ms()?,
            }
        }
    };
    let mut encoded = serde_json::to_vec(&response)
        .map_err(|error| IoError::other(format!("response serialization failed: {error}")))?;
    if encoded.len() > MAX_RESPONSE_BYTES {
        clear_bytes(&mut encoded);
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "survivability response exceeds its size limit",
        ));
    }
    let result = write_frame(stream, &encoded);
    clear_bytes(&mut encoded);
    result
}

fn write_handshake(stream: &mut TcpStream, context: &BridgeContext) -> Result<(), IoError> {
    let challenge = hex_encode(&random_array::<32>()?);
    let derived = derive_installation_key(
        &context.installation_root,
        &context.authority.workspace_id,
        &context.authority.installation_id,
        PURPOSE_NATIVE_COMMAND_BRIDGE,
        1,
    )?;
    let version = [HANDSHAKE_FORMAT_VERSION];
    let port = context.port.to_le_bytes();
    let framed = frame(
        HANDSHAKE_MAC_DOMAIN,
        &[
            &version,
            context.instance_id.as_bytes(),
            &port,
            context.authority.workspace_id.as_bytes(),
            context.authority.installation_id.as_bytes(),
            challenge.as_bytes(),
        ],
    );
    let mac = hex_encode(&hmac_sha256(&derived.key, &framed));
    let handshake = BridgeHandshake {
        format_version: HANDSHAKE_FORMAT_VERSION,
        instance_id: &context.instance_id,
        port: context.port,
        workspace_id: &context.authority.workspace_id,
        installation_id: &context.authority.installation_id,
        challenge,
        mac,
    };
    let mut encoded = serde_json::to_vec(&handshake)
        .map_err(|error| IoError::other(format!("handshake serialization failed: {error}")))?;
    let result = write_frame(stream, &encoded);
    clear_bytes(&mut encoded);
    result
}

fn execute_request(context: &BridgeContext, request: BridgeRequest) -> Result<Value, IoError> {
    if request.format_version != REQUEST_FORMAT_VERSION
        || request.instance_id != context.instance_id
        || !is_lower_hex(&request.request_id, 32)
    {
        return Err(authorization_failure(IoError::new(
            ErrorKind::PermissionDenied,
            "survivability request belongs to another runtime instance",
        )));
    }

    let (action, resource) = request_contract(&request).map_err(authorization_failure)?;
    native_command::verify_authorization(
        &context.replay,
        &context.installation_root,
        &context.authority.workspace_id,
        &context.authority.installation_id,
        action,
        resource,
        &request.authorization,
    )
    .map_err(authorization_failure)?;

    match request.operation.as_str() {
        "create-backup" => to_value(backup_recovery::create_backup(
            &context.app_data_dir,
            &context.download_dir,
            &context.document_dir,
            &context.installation_root,
            &context.authority,
        )?),
        "list-backups" => {
            let result: Vec<BackupSummary> = backup_recovery::list_backups(
                &context.app_data_dir,
                &context.download_dir,
                &context.document_dir,
                &context.installation_root,
                &context.authority,
            )?;
            to_value(result)
        }
        "create-recovery-kit" => {
            let result: RecoveryKitResult = backup_recovery::create_recovery_kit(
                &context.app_data_dir,
                &context.document_dir,
                &context.installation_root,
                &context.authority,
            )?;
            to_value(&result)
        }
        "prepare-restore" => {
            let backup_id = request.backup_id.as_deref().ok_or_else(|| {
                IoError::new(
                    ErrorKind::InvalidInput,
                    "restore request has no backup identity",
                )
            })?;
            let result: RestorePreparationResult = backup_recovery::prepare_restore(
                &context.app_data_dir,
                &context.download_dir,
                &context.document_dir,
                &context.installation_root,
                &context.authority,
                backup_id,
                request.recovery_code.as_deref(),
            )?;
            to_value(result)
        }
        "delete-backup" => {
            let backup_id = request.backup_id.as_deref().ok_or_else(|| {
                IoError::new(
                    ErrorKind::InvalidInput,
                    "delete request has no backup identity",
                )
            })?;
            backup_recovery::delete_backup(
                &context.app_data_dir,
                &context.download_dir,
                &context.document_dir,
                &context.installation_root,
                &context.authority,
                backup_id,
            )?;
            Ok(json!({ "deleted": true }))
        }
        _ => Err(authorization_failure(IoError::new(
            ErrorKind::PermissionDenied,
            "survivability operation is unsupported",
        ))),
    }
}

#[derive(Debug)]
struct AuthorizationFailure {
    source: IoError,
}

impl std::fmt::Display for AuthorizationFailure {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            formatter,
            "protected native authorization failed: {}",
            self.source
        )
    }
}

impl std::error::Error for AuthorizationFailure {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        Some(&self.source)
    }
}

fn authorization_failure(source: IoError) -> IoError {
    IoError::new(ErrorKind::PermissionDenied, AuthorizationFailure { source })
}

fn is_authorization_failure(error: &IoError) -> bool {
    error
        .get_ref()
        .and_then(|source| source.downcast_ref::<AuthorizationFailure>())
        .is_some()
}

fn request_contract<'a>(request: &'a BridgeRequest) -> Result<(&'static str, &'a str), IoError> {
    match request.operation.as_str() {
        "create-backup" if request.backup_id.is_none() && request.recovery_code.is_none() => {
            Ok(("survivability-backup:create", "workspace"))
        }
        "list-backups" if request.backup_id.is_none() && request.recovery_code.is_none() => {
            Ok(("survivability-backup:list", "workspace"))
        }
        "create-recovery-kit" if request.backup_id.is_none() && request.recovery_code.is_none() => {
            Ok(("survivability-kit:create", "workspace"))
        }
        "prepare-restore" => {
            let backup_id = request.backup_id.as_deref().ok_or_else(|| {
                IoError::new(
                    ErrorKind::InvalidInput,
                    "restore request has no backup identity",
                )
            })?;
            validate_backup_id(backup_id)?;
            if request
                .recovery_code
                .as_deref()
                .is_some_and(|value| value.trim().is_empty() || value.len() > 256)
            {
                return Err(IoError::new(
                    ErrorKind::InvalidInput,
                    "recovery code has invalid dimensions",
                ));
            }
            Ok(("survivability-restore:prepare", backup_id))
        }
        "delete-backup" if request.recovery_code.is_none() => {
            let backup_id = request.backup_id.as_deref().ok_or_else(|| {
                IoError::new(
                    ErrorKind::InvalidInput,
                    "delete request has no backup identity",
                )
            })?;
            validate_backup_id(backup_id)?;
            Ok(("survivability-backup:delete", backup_id))
        }
        _ => Err(IoError::new(
            ErrorKind::PermissionDenied,
            "survivability request shape is not authorized",
        )),
    }
}

fn validate_backup_id(value: &str) -> Result<(), IoError> {
    let Some(rest) = value.strip_prefix("backup-") else {
        return Err(IoError::new(
            ErrorKind::InvalidInput,
            "backup identity is invalid",
        ));
    };
    let Some((timestamp, random)) = rest.rsplit_once('-') else {
        return Err(IoError::new(
            ErrorKind::InvalidInput,
            "backup identity is invalid",
        ));
    };
    if !(10..=17).contains(&timestamp.len())
        || !timestamp.bytes().all(|byte| byte.is_ascii_digit())
        || !is_lower_hex(random, 16)
    {
        return Err(IoError::new(
            ErrorKind::InvalidInput,
            "backup identity is invalid",
        ));
    }
    Ok(())
}

fn validate_authority(authority: &BackupAuthority) -> Result<(), IoError> {
    if !is_lower_hex(&authority.workspace_id, 32)
        || !is_lower_hex(&authority.installation_id, 32)
        || !is_lower_hex(&authority.migration_set_sha256, 64)
        || authority.app_version.is_empty()
        || authority.runtime_protocol_version == 0
    {
        return Err(IoError::new(
            ErrorKind::InvalidInput,
            "survivability bridge authority is invalid",
        ));
    }
    Ok(())
}

fn to_value<T: Serialize>(value: T) -> Result<Value, IoError> {
    serde_json::to_value(value)
        .map_err(|error| IoError::other(format!("native result serialization failed: {error}")))
}

fn read_frame(stream: &mut TcpStream, maximum: usize) -> Result<Vec<u8>, IoError> {
    let mut prefix = [0_u8; 4];
    stream.read_exact(&mut prefix)?;
    let length = u32::from_be_bytes(prefix) as usize;
    if length == 0 || length > maximum {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "survivability request frame has invalid dimensions",
        ));
    }
    let mut payload = vec![0_u8; length];
    if let Err(error) = stream.read_exact(&mut payload) {
        clear_bytes(&mut payload);
        return Err(error);
    }
    Ok(payload)
}

fn write_frame(stream: &mut TcpStream, payload: &[u8]) -> Result<(), IoError> {
    if payload.is_empty() || payload.len() > MAX_RESPONSE_BYTES {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "survivability response frame has invalid dimensions",
        ));
    }
    let length = u32::try_from(payload.len())
        .map_err(|_| IoError::new(ErrorKind::InvalidData, "response frame is too large"))?;
    stream.write_all(&length.to_be_bytes())?;
    stream.write_all(payload)?;
    stream.flush()
}

fn write_endpoint(path: &Path, manifest: &EndpointManifest) -> Result<(), IoError> {
    let parent = path.parent().ok_or_else(|| {
        IoError::new(
            ErrorKind::InvalidInput,
            "survivability endpoint has no parent",
        )
    })?;
    fs::create_dir_all(parent)?;
    reject_link(parent)?;
    reject_link(path)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    let temporary = parent.join(format!(
        ".survivability-endpoint-{}.tmp",
        hex_encode(&random_array::<8>()?)
    ));
    let mut encoded = serde_json::to_vec_pretty(manifest)
        .map_err(|error| IoError::other(format!("endpoint serialization failed: {error}")))?;
    encoded.push(b'\n');
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)?;
    file.write_all(&encoded)?;
    file.sync_all()?;
    clear_bytes(&mut encoded);
    drop(file);
    fs::rename(&temporary, path)?;
    sync_parent(path)
}

fn remove_endpoint(path: &Path) -> Result<(), IoError> {
    reject_link(path)?;
    match fs::remove_file(path) {
        Ok(()) => sync_parent(path),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn reject_link(path: &Path) -> Result<(), IoError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => Err(IoError::new(
            ErrorKind::InvalidData,
            format!("survivability authority path is a link: {}", path.display()),
        )),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

fn sync_parent(path: &Path) -> Result<(), IoError> {
    let parent = path.parent().ok_or_else(|| {
        IoError::new(
            ErrorKind::InvalidInput,
            "survivability authority has no parent",
        )
    })?;
    #[cfg(not(windows))]
    fs::File::open(parent)?.sync_all()?;
    #[cfg(windows)]
    let _ = parent;
    Ok(())
}

fn public_error(error: &IoError) -> (&'static str, &'static str) {
    let lower = error.to_string().to_ascii_lowercase();
    if error.kind() == ErrorKind::PermissionDenied && is_authorization_failure(error) {
        (
            "SF-SURVIVABILITY-AUTHORIZATION",
            "The desktop rejected this backup or recovery authorization. Sign in again and retry.",
        )
    } else if error.kind() == ErrorKind::PermissionDenied {
        let backup_stage = backup_recovery::backup_create_failure_stage(error);
        if backup_stage.is_some() {
            backup_access_error(backup_stage)
        } else if let Some(reason) = backup_recovery::survivability_permission_reason(error) {
            survivability_permission_error(reason)
        } else {
            backup_access_error(None)
        }
    } else if error.kind() == ErrorKind::NotFound {
        (
            "SF-SURVIVABILITY-NOT-FOUND",
            "The selected backup or recovery material is no longer available.",
        )
    } else if error.kind() == ErrorKind::WouldBlock {
        (
            "SF-SURVIVABILITY-BUSY",
            "Another protected backup, restore, migration or recovery operation is already active.",
        )
    } else if lower.contains("space") {
        (
            "SF-SURVIVABILITY-SPACE",
            "There is not enough free disk space to complete this operation with rollback protection.",
        )
    } else if error.kind() == ErrorKind::InvalidData || error.kind() == ErrorKind::InvalidInput {
        (
            "SF-SURVIVABILITY-VERIFICATION",
            "The backup or recovery material could not be authenticated. Verify the selected backup and recovery code.",
        )
    } else {
        (
            "SF-SURVIVABILITY-FAILED",
            "The protected backup or recovery operation could not be completed safely. No successful completion was recorded.",
        )
    }
}

fn survivability_permission_error(
    reason: backup_recovery::SurvivabilityPermissionReason,
) -> (&'static str, &'static str) {
    match reason {
        backup_recovery::SurvivabilityPermissionReason::RecoveryMaterial => (
            "SF-SURVIVABILITY-RECOVERY-KIT",
            "The selected backup requires its matching recovery kit and recovery code.",
        ),
        backup_recovery::SurvivabilityPermissionReason::ReplacementAuthority => (
            "SF-SURVIVABILITY-REPLACEMENT-AUTHORIZATION",
            "This operation requires authenticated replacement-install recovery authority.",
        ),
    }
}

fn backup_access_error(
    stage: Option<backup_recovery::BackupCreateStage>,
) -> (&'static str, &'static str) {
    match stage {
        Some(backup_recovery::BackupCreateStage::Preflight) => (
            "SF-SURVIVABILITY-BACKUP-PREFLIGHT-ACCESS",
            "Windows denied access while preparing protected backup storage. Close competing file tools and retry.",
        ),
        Some(backup_recovery::BackupCreateStage::KeyAuthority) => (
            "SF-SURVIVABILITY-BACKUP-KEY-ACCESS",
            "Windows denied access to the protected backup key authority. Close competing file tools and retry.",
        ),
        Some(backup_recovery::BackupCreateStage::Staging) => (
            "SF-SURVIVABILITY-BACKUP-STAGING-ACCESS",
            "Windows denied access while creating protected backup staging. Close competing file tools and retry.",
        ),
        Some(backup_recovery::BackupCreateStage::ShopSnapshot) => (
            "SF-SURVIVABILITY-BACKUP-SNAPSHOT-ACCESS",
            "Windows denied access while taking a consistent shop snapshot. Close competing file tools and retry.",
        ),
        Some(backup_recovery::BackupCreateStage::ShopKeyExport) => (
            "SF-SURVIVABILITY-BACKUP-SHOP-KEY-ACCESS",
            "Windows denied access while protecting shop recovery keys. Close competing file tools and retry.",
        ),
        Some(backup_recovery::BackupCreateStage::ObjectWrite) => (
            "SF-SURVIVABILITY-BACKUP-OBJECT-ACCESS",
            "Windows denied access while writing encrypted backup objects. Close competing file tools and retry.",
        ),
        Some(backup_recovery::BackupCreateStage::Commit) => (
            "SF-SURVIVABILITY-BACKUP-COMMIT-ACCESS",
            "Windows denied access while committing the verified backup. Close competing file tools and retry.",
        ),
        Some(backup_recovery::BackupCreateStage::RecoveryReadiness) => (
            "SF-SURVIVABILITY-BACKUP-RECOVERY-ACCESS",
            "Windows denied access while verifying independent recovery readiness. Close competing file tools and retry.",
        ),
        None => (
            "SF-SURVIVABILITY-STORAGE-ACCESS",
            "Windows denied access to protected backup or recovery storage. Close competing file tools and retry.",
        ),
    }
}

fn classify_log_error(error: &IoError) -> &'static str {
    if is_authorization_failure(error) {
        return "authorization";
    }
    if let Some(reason) = backup_recovery::survivability_permission_reason(error) {
        return match reason {
            backup_recovery::SurvivabilityPermissionReason::RecoveryMaterial => "verification",
            backup_recovery::SurvivabilityPermissionReason::ReplacementAuthority => "authorization",
        };
    }
    match error.kind() {
        ErrorKind::PermissionDenied => "storage-access",
        ErrorKind::NotFound => "not-found",
        ErrorKind::WouldBlock => "busy",
        ErrorKind::InvalidData | ErrorKind::InvalidInput => "verification",
        ErrorKind::TimedOut => "timeout",
        _ => "operation",
    }
}

fn now_unix_ms() -> Result<u64, IoError> {
    let elapsed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| IoError::other("system clock precedes Unix epoch"))?;
    u64::try_from(elapsed.as_millis()).map_err(|_| IoError::other("system clock is out of range"))
}

fn is_lower_hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || matches!(byte, b'a'..=b'f'))
}

fn clear_string(value: &mut String) {
    unsafe {
        clear_bytes(value.as_bytes_mut());
    }
    value.clear();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backup_identity_contract_is_strict() {
        assert!(validate_backup_id("backup-1720000000000-0011223344556677").is_ok());
        assert!(validate_backup_id("../backup-1720000000000-0011223344556677").is_err());
        assert!(validate_backup_id("backup-x-0011223344556677").is_err());
    }

    #[test]
    fn error_classification_never_echoes_private_details() {
        let error = IoError::new(
            ErrorKind::InvalidData,
            "seller Amira, phone 0555000000, database C:\\private\\shop.db",
        );
        let (_, message) = public_error(&error);
        assert!(!message.contains("Amira"));
        assert!(!message.contains("0555"));
        assert!(!message.contains("shop.db"));
    }

    #[test]
    fn permission_errors_preserve_the_authorization_storage_boundary() {
        let authorization = authorization_failure(IoError::new(
            ErrorKind::PermissionDenied,
            "private authorization detail",
        ));
        assert_eq!(
            public_error(&authorization).0,
            "SF-SURVIVABILITY-AUTHORIZATION"
        );
        assert_eq!(classify_log_error(&authorization), "authorization");

        let storage = backup_recovery::staged_backup_create_error_for_test(
            backup_recovery::BackupCreateStage::ShopSnapshot,
            IoError::new(ErrorKind::PermissionDenied, "C:\\private\\shop.db"),
        );
        let (code, message) = public_error(&storage);
        assert_eq!(code, "SF-SURVIVABILITY-BACKUP-SNAPSHOT-ACCESS");
        assert_eq!(classify_log_error(&storage), "storage-access");
        assert!(!message.contains("private"));
        assert!(!message.contains("shop.db"));

        assert_eq!(
            survivability_permission_error(
                backup_recovery::SurvivabilityPermissionReason::RecoveryMaterial,
            )
            .0,
            "SF-SURVIVABILITY-RECOVERY-KIT"
        );
        assert_eq!(
            survivability_permission_error(
                backup_recovery::SurvivabilityPermissionReason::ReplacementAuthority,
            )
            .0,
            "SF-SURVIVABILITY-REPLACEMENT-AUTHORIZATION"
        );
    }
}
