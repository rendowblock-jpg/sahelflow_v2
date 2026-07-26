use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{Error as IoError, ErrorKind, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

const LOOPBACK_HOST: &str = "127.0.0.1";
const READY_PATH: &str = "/api/internal/runtime-ready";
const INSTANCE_HEADER: &str = "x-sahelflow-runtime-instance";
const MANIFEST_FILE: &str = "runtime-endpoint.json";
const PROBE_DIAGNOSTIC_FILE: &str = "runtime-probe-diagnostic.json";
const MAX_HEADER_BYTES: usize = 64 * 1024;
const MAX_RESPONSE_BYTES: usize = 128 * 1024;
const MAX_DIAGNOSTIC_DETAIL_CHARS: usize = 512;
pub const RUNTIME_PROTOCOL_VERSION: u8 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadinessOutcome {
    Ready,
    ProcessExited(u32),
    TimedOut,
}

/// Per-launch authority for the mandatory local application server.
///
/// Secrets intentionally do not implement Debug or Serialize and are never
/// written to the endpoint manifest or readiness diagnostics.
pub struct RuntimeProtocol {
    app_port: u16,
    sidecar_port: u16,
    instance_id: String,
    runtime_token: String,
    app_token: String,
    sidecar_token: String,
    auth_mode: String,
    manifest_path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeEndpointManifest<'a> {
    format_version: u8,
    state: &'static str,
    host: &'static str,
    app_port: u16,
    app_url: String,
    instance_id: &'a str,
    process_id: u32,
    app_version: &'a str,
    created_at_unix_seconds: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeProbeDiagnostic<'a> {
    format_version: u8,
    state: &'static str,
    code: &'static str,
    detail: &'a str,
    app_port: u16,
    created_at_unix_seconds: u64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeReadiness {
    protocol_version: u8,
    status: String,
    instance_id: String,
    process_id: u32,
    app_version: String,
    port: u16,
    shop_id: String,
    registry_revision: u64,
    migration_set_sha256: String,
    auth_mode: String,
    checks: RuntimeChecks,
}

#[derive(Deserialize)]
struct RuntimeChecks {
    app: String,
    database: String,
    migration: String,
    registry: String,
    shop: String,
    auth: String,
}

impl RuntimeProtocol {
    /// Ask the OS for an available loopback port and generate independent
    /// cryptographic launch identity and bearer credential.
    pub fn allocate(app_data_dir: &Path, auth_mode: &str) -> Result<Self, IoError> {
        let app_listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        let sidecar_listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
        let app_port = app_listener.local_addr()?.port();
        let sidecar_port = sidecar_listener.local_addr()?.port();
        drop((app_listener, sidecar_listener));

        Ok(Self {
            app_port,
            sidecar_port,
            instance_id: random_hex(16)?,
            runtime_token: random_hex(32)?,
            app_token: random_hex(32)?,
            sidecar_token: random_hex(32)?,
            auth_mode: auth_mode.to_string(),
            manifest_path: app_data_dir.join(MANIFEST_FILE),
        })
    }

    pub fn app_port(&self) -> u16 {
        self.app_port
    }

    pub fn app_url(&self) -> String {
        format!("http://{LOOPBACK_HOST}:{}", self.app_port)
    }

    pub fn bootstrap_url(&self) -> String {
        format!(
            "{}/api/internal/runtime-bootstrap?token={}",
            self.app_url(),
            self.app_token
        )
    }

    pub fn sidecar_port(&self) -> u16 {
        self.sidecar_port
    }

    pub fn sidecar_url(&self) -> String {
        format!("http://{LOOPBACK_HOST}:{}", self.sidecar_port)
    }

    pub fn instance_id(&self) -> &str {
        &self.instance_id
    }

    pub fn runtime_token(&self) -> &str {
        &self.runtime_token
    }

    pub fn app_token(&self) -> &str {
        &self.app_token
    }

    pub fn sidecar_token(&self) -> &str {
        &self.sidecar_token
    }

    pub fn manifest_path(&self) -> &Path {
        &self.manifest_path
    }

    /// Wait until the exact spawned instance authenticates the probe and
    /// reports that its configured database is queryable.
    pub fn wait_until_ready<F>(
        &self,
        timeout: Duration,
        mut child_exit: F,
    ) -> Result<ReadinessOutcome, IoError>
    where
        F: FnMut() -> Result<Option<u32>, IoError>,
    {
        self.clear_probe_diagnostic();
        let started_at = Instant::now();
        let mut last_failure = "the local server did not accept a readiness connection".to_string();
        while started_at.elapsed() < timeout {
            if let Some(code) = child_exit()? {
                let detail =
                    format!("the local server process exited before readiness with code {code}");
                self.write_probe_diagnostic(&detail);
                return Ok(ReadinessOutcome::ProcessExited(code));
            }
            match self.probe_once() {
                Ok(()) => {
                    self.clear_probe_diagnostic();
                    return Ok(ReadinessOutcome::Ready);
                }
                Err(detail) => last_failure = detail,
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        self.write_probe_diagnostic(&last_failure);
        Ok(ReadinessOutcome::TimedOut)
    }

    /// Publish only non-secret connection metadata after semantic readiness.
    pub fn publish_manifest(&self, app_version: &str) -> Result<(), IoError> {
        let parent = self.manifest_path.parent().ok_or_else(|| {
            IoError::new(
                ErrorKind::InvalidInput,
                "runtime manifest path has no parent directory",
            )
        })?;
        fs::create_dir_all(parent)?;

        let temp_path = parent.join(format!("{MANIFEST_FILE}.tmp"));
        let manifest = RuntimeEndpointManifest {
            format_version: RUNTIME_PROTOCOL_VERSION,
            state: "ready",
            host: LOOPBACK_HOST,
            app_port: self.app_port,
            app_url: self.app_url(),
            instance_id: &self.instance_id,
            process_id: std::process::id(),
            app_version,
            created_at_unix_seconds: unix_seconds(),
        };

        let mut file = OpenOptions::new()
            .create(true)
            .truncate(true)
            .write(true)
            .open(&temp_path)?;
        serde_json::to_writer_pretty(&mut file, &manifest).map_err(|error| {
            IoError::new(
                ErrorKind::InvalidData,
                format!("could not encode runtime endpoint manifest: {error}"),
            )
        })?;
        file.write_all(b"\n")?;
        file.sync_all()?;

        // Windows rename does not replace an existing file. This manifest is
        // diagnostic discovery data, not business authority; remove the stale
        // prior-launch copy only after the new temporary file is durable.
        if self.manifest_path.exists() {
            fs::remove_file(&self.manifest_path)?;
        }
        fs::rename(&temp_path, &self.manifest_path)?;
        Ok(())
    }

    fn probe_once(&self) -> Result<(), String> {
        let address = SocketAddr::from((Ipv4Addr::LOCALHOST, self.app_port));
        let mut stream = TcpStream::connect_timeout(&address, Duration::from_millis(500))
            .map_err(|error| format!("readiness connection failed: {}", error.kind()))?;
        let io_timeout = Some(Duration::from_secs(2));
        stream.set_read_timeout(io_timeout).map_err(|error| {
            format!(
                "could not configure readiness read timeout: {}",
                error.kind()
            )
        })?;
        stream.set_write_timeout(io_timeout).map_err(|error| {
            format!(
                "could not configure readiness write timeout: {}",
                error.kind()
            )
        })?;

        let request = format!(
            "GET {READY_PATH} HTTP/1.1\r\nHost: {LOOPBACK_HOST}:{}\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n",
            self.app_port, self.runtime_token
        );
        stream
            .write_all(request.as_bytes())
            .map_err(|error| format!("could not write readiness request: {}", error.kind()))?;

        let mut response = Vec::with_capacity(4096);
        let mut chunk = [0_u8; 1024];
        loop {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(read) => {
                    response.extend_from_slice(&chunk[..read]);
                    if response.len() > MAX_RESPONSE_BYTES {
                        return Err(
                            "readiness response exceeded the bounded size limit".to_string()
                        );
                    }
                    if let Some(expected_length) = declared_http_message_length(&response)? {
                        if response.len() >= expected_length {
                            response.truncate(expected_length);
                            break;
                        }
                    }
                }
                Err(error)
                    if matches!(error.kind(), ErrorKind::TimedOut | ErrorKind::WouldBlock) =>
                {
                    if let Some(expected_length) = declared_http_message_length(&response)? {
                        if response.len() >= expected_length {
                            response.truncate(expected_length);
                            break;
                        }
                    }
                    return Err(format!(
                        "readiness response timed out before completion after {} bytes",
                        response.len()
                    ));
                }
                Err(error) => {
                    return Err(format!(
                        "could not read readiness response: {}",
                        error.kind()
                    ));
                }
            }
        }

        validate_readiness_response(&response, &self.instance_id, self.app_port, &self.auth_mode)
    }

    fn probe_diagnostic_path(&self) -> Option<PathBuf> {
        self.manifest_path
            .parent()
            .map(|parent| parent.join(PROBE_DIAGNOSTIC_FILE))
    }

    fn clear_probe_diagnostic(&self) {
        let Some(path) = self.probe_diagnostic_path() else {
            return;
        };
        if let Err(error) = fs::remove_file(&path) {
            if error.kind() != ErrorKind::NotFound {
                eprintln!(
                    "[sahelflow] could not remove stale runtime probe diagnostic {}: {error}",
                    path.display()
                );
            }
        }
    }

    fn write_probe_diagnostic(&self, detail: &str) {
        let Some(path) = self.probe_diagnostic_path() else {
            return;
        };
        let Some(parent) = path.parent() else {
            return;
        };
        let safe_detail = bounded_diagnostic_detail(detail);
        let diagnostic = RuntimeProbeDiagnostic {
            format_version: 1,
            state: "blocked",
            code: "RUNTIME_PROBE_FAILED",
            detail: &safe_detail,
            app_port: self.app_port,
            created_at_unix_seconds: unix_seconds(),
        };
        let temp_path = parent.join(format!("{PROBE_DIAGNOSTIC_FILE}.tmp"));
        let result = (|| -> Result<(), IoError> {
            fs::create_dir_all(parent)?;
            let mut file = OpenOptions::new()
                .create(true)
                .truncate(true)
                .write(true)
                .open(&temp_path)?;
            serde_json::to_writer_pretty(&mut file, &diagnostic).map_err(|error| {
                IoError::new(
                    ErrorKind::InvalidData,
                    format!("could not encode runtime probe diagnostic: {error}"),
                )
            })?;
            file.write_all(b"\n")?;
            file.sync_all()?;
            if path.exists() {
                fs::remove_file(&path)?;
            }
            fs::rename(&temp_path, &path)
        })();
        if let Err(error) = result {
            let _ = fs::remove_file(&temp_path);
            eprintln!(
                "[sahelflow] could not persist runtime probe diagnostic {}: {error}",
                path.display()
            );
        }
    }
}

pub fn remove_manifest(app_data_dir: &Path) {
    let path = app_data_dir.join(MANIFEST_FILE);
    if let Err(error) = fs::remove_file(&path) {
        if error.kind() != ErrorKind::NotFound {
            eprintln!(
                "[sahelflow] could not remove stale runtime endpoint manifest {}: {error}",
                path.display()
            );
        }
    }
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn bounded_diagnostic_detail(detail: &str) -> String {
    detail
        .chars()
        .filter(|character| !character.is_control())
        .take(MAX_DIAGNOSTIC_DETAIL_CHARS)
        .collect()
}

fn random_hex(byte_count: usize) -> Result<String, IoError> {
    let mut bytes = vec![0_u8; byte_count];
    getrandom::getrandom(&mut bytes).map_err(|error| {
        IoError::other(format!(
            "secure runtime credential generation failed: {error}"
        ))
    })?;

    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(byte_count * 2);
    for byte in bytes {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    Ok(encoded)
}

fn response_header_end(response: &[u8]) -> Result<Option<usize>, String> {
    if let Some(position) = response.windows(4).position(|window| window == b"\r\n\r\n") {
        if position + 4 > MAX_HEADER_BYTES {
            return Err("readiness response headers exceeded the bounded size limit".to_string());
        }
        return Ok(Some(position));
    }
    if response.len() > MAX_HEADER_BYTES {
        return Err("readiness response headers exceeded the bounded size limit".to_string());
    }
    Ok(None)
}

fn declared_http_message_length(response: &[u8]) -> Result<Option<usize>, String> {
    let Some(header_end) = response_header_end(response)? else {
        return Ok(None);
    };
    let headers = std::str::from_utf8(&response[..header_end])
        .map_err(|_| "readiness response headers were not valid UTF-8".to_string())?;
    let mut content_length = None;
    for line in headers.split("\r\n").skip(1) {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if !name.eq_ignore_ascii_case("content-length") {
            continue;
        }
        let parsed = value
            .trim()
            .parse::<usize>()
            .map_err(|_| "readiness response declared an invalid Content-Length".to_string())?;
        if content_length.is_some_and(|current| current != parsed) {
            return Err(
                "readiness response declared conflicting Content-Length values".to_string(),
            );
        }
        content_length = Some(parsed);
    }
    let Some(content_length) = content_length else {
        return Ok(None);
    };
    let message_length = header_end
        .checked_add(4)
        .and_then(|length| length.checked_add(content_length))
        .ok_or_else(|| "readiness response length overflowed".to_string())?;
    if message_length > MAX_RESPONSE_BYTES {
        return Err("readiness response exceeded the bounded size limit".to_string());
    }
    Ok(Some(message_length))
}

fn safe_blocked_code(body: &[u8]) -> Option<String> {
    let value = serde_json::from_slice::<serde_json::Value>(body).ok()?;
    let code = value.get("code")?.as_str()?;
    if code.is_empty()
        || code.len() > 64
        || !code
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
    {
        return None;
    }
    Some(code.to_string())
}

fn validate_readiness_response(
    response: &[u8],
    expected_instance_id: &str,
    expected_port: u16,
    expected_auth_mode: &str,
) -> Result<(), String> {
    let header_end = response_header_end(response)?
        .ok_or_else(|| "readiness response did not contain complete HTTP headers".to_string())?;
    let headers = std::str::from_utf8(&response[..header_end])
        .map_err(|_| "readiness response headers were not valid UTF-8".to_string())?;
    let mut lines = headers.split("\r\n");
    let status = lines.next().unwrap_or_default();
    let status_code = status.split_ascii_whitespace().nth(1).unwrap_or("unknown");
    let exact_instance_header = lines.clone().any(|line| {
        line.split_once(':').is_some_and(|(name, value)| {
            name.eq_ignore_ascii_case(INSTANCE_HEADER) && value.trim() == expected_instance_id
        })
    });

    let body_start = header_end + 4;
    let body_end = declared_http_message_length(response)?.unwrap_or(response.len());
    if body_end > response.len() || body_end < body_start {
        return Err("readiness response body was incomplete".to_string());
    }
    let body = &response[body_start..body_end];

    if !(status.starts_with("HTTP/1.1 200 ") || status.starts_with("HTTP/1.0 200 ")) {
        let code = safe_blocked_code(body).unwrap_or_else(|| "UNSPECIFIED".to_string());
        return Err(format!(
            "readiness endpoint returned HTTP {status_code} with code {code}"
        ));
    }
    if !exact_instance_header {
        return Err("readiness response did not bind the exact runtime instance".to_string());
    }

    let readiness: RuntimeReadiness = serde_json::from_slice(body)
        .map_err(|_| "readiness response body was not valid semantic JSON".to_string())?;
    if readiness.protocol_version != RUNTIME_PROTOCOL_VERSION {
        return Err("readiness protocol version did not match".to_string());
    }
    if readiness.status != "ready" {
        return Err("readiness response did not report ready state".to_string());
    }
    if readiness.instance_id != expected_instance_id {
        return Err("readiness body did not bind the exact runtime instance".to_string());
    }
    if readiness.process_id == 0 {
        return Err("readiness response did not identify a live process".to_string());
    }
    if readiness.app_version.trim().is_empty() {
        return Err("readiness response omitted the application version".to_string());
    }
    if readiness.port != expected_port {
        return Err("readiness response reported the wrong loopback port".to_string());
    }
    if readiness.shop_id.trim().is_empty() {
        return Err("readiness response omitted the active shop".to_string());
    }
    if readiness.registry_revision == 0 {
        return Err("readiness response reported an invalid registry revision".to_string());
    }
    if readiness.migration_set_sha256.len() != 64
        || !readiness
            .migration_set_sha256
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("readiness response reported an invalid migration digest".to_string());
    }
    if readiness.auth_mode != expected_auth_mode {
        return Err("readiness response reported the wrong authentication mode".to_string());
    }
    if readiness.checks.app != "ready"
        || readiness.checks.database != "ready"
        || readiness.checks.migration != "ready"
        || readiness.checks.registry != "ready"
        || readiness.checks.shop != "ready"
        || readiness.checks.auth != "ready"
    {
        return Err("readiness response contained a blocked semantic check".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::thread;

    fn valid_body(instance: &str, port: u16, auth_mode: &str) -> String {
        format!(
            "{{\"protocolVersion\":1,\"status\":\"ready\",\"instanceId\":\"{instance}\",\"processId\":42,\"appVersion\":\"1.0.0-internal.3\",\"port\":{port},\"shopId\":\"default\",\"registryRevision\":1,\"migrationSetSha256\":\"{}\",\"authMode\":\"{auth_mode}\",\"checks\":{{\"app\":\"ready\",\"database\":\"ready\",\"migration\":\"ready\",\"registry\":\"ready\",\"shop\":\"ready\",\"auth\":\"ready\"}}}}",
            "f".repeat(64)
        )
    }

    #[test]
    fn allocation_uses_loopback_port_and_non_serialized_random_secrets() {
        let protocol =
            RuntimeProtocol::allocate(Path::new("."), "configured").expect("runtime protocol");

        assert_ne!(protocol.app_port(), 0);
        assert_ne!(protocol.sidecar_port(), 0);
        assert_ne!(protocol.app_port(), protocol.sidecar_port());
        assert_eq!(protocol.instance_id().len(), 32);
        assert_eq!(protocol.runtime_token().len(), 64);
        assert_eq!(protocol.app_token().len(), 64);
        assert_eq!(protocol.sidecar_token().len(), 64);
        assert_ne!(protocol.runtime_token(), protocol.sidecar_token());
        assert_ne!(protocol.runtime_token(), protocol.app_token());
        assert!(protocol
            .runtime_token()
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit()));
    }

    #[test]
    fn readiness_requires_success_and_the_exact_instance_header() {
        let body = valid_body("instance-a", 49152, "configured");
        let valid = [
            b"HTTP/1.1 200 OK\r\nX-SahelFlow-Runtime-Instance: instance-a\r\n\r\n".as_slice(),
            body.as_bytes(),
        ]
        .concat();
        let wrong_instance = [
            b"HTTP/1.1 200 OK\r\nX-SahelFlow-Runtime-Instance: instance-b\r\n\r\n".as_slice(),
            body.as_bytes(),
        ]
        .concat();
        let unauthorized = [
            b"HTTP/1.1 401 Unauthorized\r\nX-SahelFlow-Runtime-Instance: instance-a\r\n\r\n"
                .as_slice(),
            body.as_bytes(),
        ]
        .concat();

        assert!(validate_readiness_response(&valid, "instance-a", 49152, "configured").is_ok());
        assert!(validate_readiness_response(&valid, "instance-a", 49152, "setup").is_err());
        assert!(
            validate_readiness_response(&wrong_instance, "instance-a", 49152, "configured")
                .is_err()
        );
        assert!(
            validate_readiness_response(&unauthorized, "instance-a", 49152, "configured").is_err()
        );
        assert!(
            validate_readiness_response(b"not http", "instance-a", 49152, "configured").is_err()
        );
    }

    #[test]
    fn complete_content_length_response_does_not_require_socket_eof() {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).expect("bind readiness server");
        let port = listener.local_addr().expect("readiness address").port();
        let body = valid_body("instance-a", port, "configured");
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: keep-alive\r\nX-SahelFlow-Runtime-Instance: instance-a\r\n\r\n{}",
            body.len(),
            body
        );
        let (release_sender, release_receiver) = mpsc::channel();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept readiness probe");
            let mut request = [0_u8; 2048];
            let read = stream.read(&mut request).expect("read readiness request");
            assert!(String::from_utf8_lossy(&request[..read]).contains(READY_PATH));
            stream
                .write_all(response.as_bytes())
                .expect("write readiness response");
            stream.flush().expect("flush readiness response");
            release_receiver
                .recv_timeout(Duration::from_secs(5))
                .expect("probe should finish without waiting for EOF");
        });
        let protocol = RuntimeProtocol {
            app_port: port,
            sidecar_port: port.saturating_add(1),
            instance_id: "instance-a".to_string(),
            runtime_token: "a".repeat(64),
            app_token: "b".repeat(64),
            sidecar_token: "c".repeat(64),
            auth_mode: "configured".to_string(),
            manifest_path: std::env::temp_dir().join("unused-runtime-endpoint.json"),
        };

        let started = Instant::now();
        assert!(protocol.probe_once().is_ok());
        assert!(started.elapsed() < Duration::from_secs(2));
        release_sender.send(()).expect("release readiness server");
        server.join().expect("readiness server thread");
    }

    #[test]
    fn blocked_readiness_preserves_only_bounded_code_detail() {
        let body = br#"{"status":"blocked","code":"RUNTIME_AUTH_MISMATCH"}"#;
        let response = [
            format!(
                "HTTP/1.1 503 Service Unavailable\r\nContent-Length: {}\r\n\r\n",
                body.len()
            )
            .into_bytes(),
            body.to_vec(),
        ]
        .concat();
        let failure = validate_readiness_response(&response, "instance-a", 49152, "configured")
            .expect_err("blocked readiness must fail");
        assert!(failure.contains("HTTP 503"));
        assert!(failure.contains("RUNTIME_AUTH_MISMATCH"));
    }

    #[test]
    fn readiness_rejects_response_headers_over_the_limit() {
        let oversized = format!(
            "HTTP/1.1 200 OK\r\nX-Fill: {}\r\nX-SahelFlow-Runtime-Instance: instance-a\r\n\r\n",
            "a".repeat(MAX_HEADER_BYTES)
        );

        assert!(validate_readiness_response(
            oversized.as_bytes(),
            "instance-a",
            49152,
            "configured",
        )
        .is_err());
    }

    #[test]
    fn readiness_stops_immediately_when_the_runtime_process_exits() {
        let directory = std::env::temp_dir().join(format!(
            "sahelflow-runtime-exit-{}-{}",
            std::process::id(),
            random_hex(8).expect("test suffix")
        ));
        fs::create_dir_all(&directory).expect("create test directory");
        let protocol = RuntimeProtocol::allocate(&directory, "setup").expect("runtime protocol");

        let started = Instant::now();
        let outcome = protocol
            .wait_until_ready(Duration::from_secs(90), || Ok(Some(23)))
            .expect("readiness outcome");

        assert_eq!(outcome, ReadinessOutcome::ProcessExited(23));
        assert!(started.elapsed() < Duration::from_secs(1));
        let diagnostic = fs::read_to_string(directory.join(PROBE_DIAGNOSTIC_FILE))
            .expect("read process-exit diagnostic");
        assert!(diagnostic.contains("exited before readiness with code 23"));
        fs::remove_dir_all(directory).expect("remove test directory");
    }

    #[test]
    fn stale_manifest_cleanup_is_idempotent() {
        let directory = std::env::temp_dir().join(format!(
            "sahelflow-runtime-protocol-{}-{}",
            std::process::id(),
            random_hex(8).expect("test suffix")
        ));
        fs::create_dir_all(&directory).expect("create test directory");
        let manifest_path = directory.join(MANIFEST_FILE);
        fs::write(&manifest_path, b"stale manifest").expect("write stale manifest");

        remove_manifest(&directory);
        remove_manifest(&directory);

        assert!(!manifest_path.exists());
        fs::remove_dir_all(directory).expect("remove test directory");
    }
}
