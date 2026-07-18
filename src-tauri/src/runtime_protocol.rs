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
const MAX_HEADER_BYTES: usize = 64 * 1024;
const MAX_RESPONSE_BYTES: usize = 128 * 1024;
pub const RUNTIME_PROTOCOL_VERSION: u8 = 1;

/// Per-launch authority for the mandatory local application server.
///
/// Secrets intentionally do not implement Debug or Serialize and are never
/// written to the endpoint manifest.
pub struct RuntimeProtocol {
    app_port: u16,
    sidecar_port: u16,
    instance_id: String,
    runtime_token: String,
    app_token: String,
    sidecar_token: String,
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
    checks: RuntimeChecks,
}

#[derive(Deserialize)]
struct RuntimeChecks {
    app: String,
    database: String,
    migration: String,
    registry: String,
    shop: String,
}

impl RuntimeProtocol {
    /// Ask the OS for an available loopback port and generate independent
    /// cryptographic launch identity and bearer credential.
    pub fn allocate(app_data_dir: &Path) -> Result<Self, IoError> {
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
    pub fn wait_until_ready(&self, timeout: Duration) -> bool {
        let started_at = Instant::now();
        while started_at.elapsed() < timeout {
            if self.probe_once() {
                return true;
            }
            std::thread::sleep(Duration::from_millis(250));
        }
        false
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
            created_at_unix_seconds: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_secs())
                .unwrap_or(0),
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

    fn probe_once(&self) -> bool {
        let address = SocketAddr::from((Ipv4Addr::LOCALHOST, self.app_port));
        let mut stream = match TcpStream::connect_timeout(&address, Duration::from_millis(500)) {
            Ok(stream) => stream,
            Err(_) => return false,
        };
        let io_timeout = Some(Duration::from_secs(2));
        if stream.set_read_timeout(io_timeout).is_err()
            || stream.set_write_timeout(io_timeout).is_err()
        {
            return false;
        }

        let request = format!(
            "GET {READY_PATH} HTTP/1.1\r\nHost: {LOOPBACK_HOST}:{}\r\nAuthorization: Bearer {}\r\nConnection: close\r\n\r\n",
            self.app_port, self.runtime_token
        );
        if stream.write_all(request.as_bytes()).is_err() {
            return false;
        }

        let mut response = Vec::with_capacity(4096);
        let mut chunk = [0_u8; 1024];
        loop {
            match stream.read(&mut chunk) {
                Ok(0) => break,
                Ok(read) => {
                    response.extend_from_slice(&chunk[..read]);
                    if response.len() > MAX_RESPONSE_BYTES {
                        return false;
                    }
                }
                Err(_) => return false,
            }
        }

        response_proves_readiness(&response, &self.instance_id, self.app_port)
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

fn response_proves_readiness(
    response: &[u8],
    expected_instance_id: &str,
    expected_port: u16,
) -> bool {
    let header_end = match response.windows(4).position(|window| window == b"\r\n\r\n") {
        Some(position) => position,
        None => return false,
    };
    if header_end + 4 > MAX_HEADER_BYTES {
        return false;
    }
    let headers = match std::str::from_utf8(&response[..header_end]) {
        Ok(headers) => headers,
        Err(_) => return false,
    };
    let mut lines = headers.split("\r\n");
    let status = lines.next().unwrap_or_default();
    if !(status.starts_with("HTTP/1.1 200 ") || status.starts_with("HTTP/1.0 200 ")) {
        return false;
    }

    let exact_instance_header = lines.any(|line| {
        line.split_once(':').is_some_and(|(name, value)| {
            name.eq_ignore_ascii_case(INSTANCE_HEADER) && value.trim() == expected_instance_id
        })
    });
    if !exact_instance_header {
        return false;
    }

    let body = &response[header_end + 4..];
    let readiness: RuntimeReadiness = match serde_json::from_slice(body) {
        Ok(readiness) => readiness,
        Err(_) => return false,
    };

    readiness.protocol_version == RUNTIME_PROTOCOL_VERSION
        && readiness.status == "ready"
        && readiness.instance_id == expected_instance_id
        && readiness.process_id > 0
        && !readiness.app_version.trim().is_empty()
        && readiness.port == expected_port
        && !readiness.shop_id.trim().is_empty()
        && readiness.registry_revision > 0
        && readiness.migration_set_sha256.len() == 64
        && readiness.checks.app == "ready"
        && readiness.checks.database == "ready"
        && readiness.checks.migration == "ready"
        && readiness.checks.registry == "ready"
        && readiness.checks.shop == "ready"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allocation_uses_loopback_port_and_non_serialized_random_secrets() {
        let protocol = RuntimeProtocol::allocate(Path::new(".")).expect("runtime protocol");

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
        let body = format!(
            "{{\"protocolVersion\":1,\"status\":\"ready\",\"instanceId\":\"instance-a\",\"processId\":42,\"appVersion\":\"1.0.0-internal.1\",\"port\":49152,\"shopId\":\"default\",\"registryRevision\":1,\"migrationSetSha256\":\"{}\",\"checks\":{{\"app\":\"ready\",\"database\":\"ready\",\"migration\":\"ready\",\"registry\":\"ready\",\"shop\":\"ready\"}}}}",
            "f".repeat(64)
        );
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

        assert!(response_proves_readiness(&valid, "instance-a", 49152));
        assert!(!response_proves_readiness(
            &wrong_instance,
            "instance-a",
            49152
        ));
        assert!(!response_proves_readiness(
            &unauthorized,
            "instance-a",
            49152
        ));
        assert!(!response_proves_readiness(b"not http", "instance-a", 49152));
    }

    #[test]
    fn readiness_rejects_response_headers_over_the_limit() {
        let oversized = format!(
            "HTTP/1.1 200 OK\r\nX-Fill: {}\r\nX-SahelFlow-Runtime-Instance: instance-a\r\n\r\n",
            "a".repeat(MAX_HEADER_BYTES)
        );

        assert!(!response_proves_readiness(
            oversized.as_bytes(),
            "instance-a",
            49152,
        ));
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
