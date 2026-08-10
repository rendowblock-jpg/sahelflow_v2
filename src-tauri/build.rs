fn required_release_value(name: &str) -> String {
    println!("cargo:rerun-if-env-changed={name}");
    let value = std::env::var(name)
        .unwrap_or_else(|_| panic!("{name} is required for every release/package build"));
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed != value {
        panic!("{name} must be non-empty and contain no surrounding whitespace");
    }
    value
}

fn validate_keyring(name: &str, value: &str) {
    let parsed: serde_json::Value =
        serde_json::from_str(value).unwrap_or_else(|_| panic!("{name} must be valid JSON"));
    let keyring = parsed
        .as_object()
        .filter(|entries| !entries.is_empty())
        .unwrap_or_else(|| panic!("{name} must be a non-empty JSON object"));
    for (key_id, public_key) in keyring {
        let encoded = public_key
            .as_str()
            .unwrap_or_else(|| panic!("{name}.{key_id} must be a base64 public key string"));
        if key_id.len() < 8 || !(40..=256).contains(&encoded.len()) {
            panic!("{name}.{key_id} has an invalid key identifier or public key length");
        }
    }
}

fn exact_restore_evidence_loopback_url(value: &str) -> bool {
    const PREFIX: &str = "http://127.0.0.1:";
    let Some(port) = value.strip_prefix(PREFIX) else {
        return false;
    };
    if port.is_empty() || !port.bytes().all(|byte| byte.is_ascii_digit()) {
        return false;
    }
    port.parse::<u16>().is_ok_and(|port| port != 0)
}

fn configured_service_urls(value: &str) -> Vec<&str> {
    let routes = value.split('|').collect::<Vec<_>>();
    if routes.is_empty()
        || routes.len() > 2
        || routes
            .iter()
            .any(|route| route.is_empty() || route.trim() != *route)
    {
        panic!("SF_LICENSE_SERVICE_URL must contain one or two non-empty origins separated by '|'");
    }
    routes
}

fn production_https_origin(value: &str) -> String {
    const PREFIX: &str = "https://";
    if !value.starts_with(PREFIX) || value.contains(char::is_whitespace) {
        panic!("production trial routes must be absolute HTTPS origins without whitespace");
    }
    let remainder = &value[PREFIX.len()..];
    if remainder.is_empty()
        || remainder.contains('?')
        || remainder.contains('#')
        || remainder.contains('@')
    {
        panic!("production trial routes must contain only an HTTPS origin");
    }
    let (authority, path) = remainder
        .split_once('/')
        .map_or((remainder, ""), |(authority, path)| (authority, path));
    if authority.is_empty() || !path.is_empty() || authority.contains(':') {
        panic!("production trial routes must use hostname-only HTTPS origins on the default port");
    }
    let host = authority.to_ascii_lowercase();
    let valid_host = host.contains('.')
        && host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'.');
    if !valid_host || host.starts_with('.') || host.ends_with('.') || host.contains("..") {
        panic!("production trial routes must use valid hostnames");
    }
    if host == "workers.dev" || host.ends_with(".workers.dev") {
        panic!("workers.dev must not be packaged as production customer licensing authority");
    }
    format!("https://{host}")
}

fn non_release_ci_placeholder(routes: &[&str]) -> bool {
    let workflow = std::env::var("GITHUB_WORKFLOW").unwrap_or_default();
    matches!(
        workflow.as_str(),
        "CI" | "Native source contract" | "Windows Rust release parity"
    ) && routes == ["https://license.invalid"]
}

fn main() {
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        let service_authority = required_release_value("SF_LICENSE_SERVICE_URL");
        println!("cargo:rerun-if-env-changed=SF_PHASE4_RESTORE_EVIDENCE_BUILD");
        let restore_evidence_build =
            std::env::var("SF_PHASE4_RESTORE_EVIDENCE_BUILD").as_deref() == Ok("1");
        let routes = configured_service_urls(&service_authority);
        if restore_evidence_build {
            if routes.len() != 1 || !exact_restore_evidence_loopback_url(routes[0]) {
                panic!(
                    "the explicit Phase 4 restore-evidence build must use one exact http://127.0.0.1:<port> disposable trial issuer"
                );
            }
        } else if !non_release_ci_placeholder(&routes) {
            if routes.len() != 2 {
                panic!(
                    "production SF_LICENSE_SERVICE_URL must contain distinct primary and recovery HTTPS origins separated by '|'"
                );
            }
            let primary_origin = production_https_origin(routes[0]);
            let recovery_origin = production_https_origin(routes[1]);
            if primary_origin == recovery_origin {
                panic!("production trial primary and recovery origins must be distinct");
            }
        }
        for name in [
            "SF_LICENSE_TRIAL_PUBLIC_KEYS",
            "SF_LICENSE_PERMANENT_PUBLIC_KEYS",
        ] {
            let value = required_release_value(name);
            validate_keyring(name, &value);
        }
    }
    tauri_build::build()
}
