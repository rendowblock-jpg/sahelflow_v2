use std::path::PathBuf;

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

fn valid_dns_hostname(value: &str) -> bool {
    if value.len() > 253 || value.starts_with('.') || value.ends_with('.') {
        return false;
    }
    let labels = value.split('.').collect::<Vec<_>>();
    labels.len() >= 2
        && labels.iter().all(|label| {
            let bytes = label.as_bytes();
            !bytes.is_empty()
                && bytes.len() <= 63
                && bytes.first().is_some_and(u8::is_ascii_alphanumeric)
                && bytes.last().is_some_and(u8::is_ascii_alphanumeric)
                && bytes
                    .iter()
                    .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
        })
}

fn public_dns_hostname(value: &str) -> bool {
    if !valid_dns_hostname(value) || value.parse::<std::net::IpAddr>().is_ok() {
        return false;
    }
    if value
        .split('.')
        .all(|label| label.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return false;
    }
    let tld = value.rsplit('.').next().unwrap_or_default();
    !matches!(
        tld,
        "invalid"
            | "example"
            | "test"
            | "localhost"
            | "local"
            | "internal"
            | "lan"
            | "home"
            | "arpa"
    )
}

fn configured_owned_host_suffix() -> String {
    let manifest_dir = PathBuf::from(
        std::env::var("CARGO_MANIFEST_DIR")
            .expect("CARGO_MANIFEST_DIR is unavailable to the Tauri build script"),
    );
    let authority_path = manifest_dir.join("../sahelflow.version.json");
    println!("cargo:rerun-if-changed={}", authority_path.display());
    let document = std::fs::read_to_string(&authority_path).unwrap_or_else(|error| {
        panic!(
            "SahelFlow version authority could not be read from {}: {error}",
            authority_path.display()
        )
    });
    let parsed: serde_json::Value = serde_json::from_str(&document)
        .unwrap_or_else(|_| panic!("sahelflow.version.json is not valid JSON"));
    let suffix = parsed
        .get("licensing")
        .and_then(|value| value.get("ownedHostSuffix"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or_else(|| {
            panic!(
                "sahelflow.version.json licensing.ownedHostSuffix must be provisioned before any customer release build"
            )
        });
    let canonical = suffix.to_ascii_lowercase();
    if suffix != canonical || !public_dns_hostname(&canonical) {
        panic!("licensing.ownedHostSuffix must be a lowercase public DNS hostname");
    }
    if canonical == "workers.dev" || canonical.ends_with(".workers.dev") {
        panic!("workers.dev cannot be the SahelFlow-owned licensing suffix");
    }
    canonical
}

fn production_https_origin(value: &str, owned_host_suffix: &str) -> String {
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
    if !public_dns_hostname(&host) {
        panic!("production trial routes must use public DNS hostnames, not IP/reserved/private-style destinations");
    }
    if host == "workers.dev" || host.ends_with(".workers.dev") {
        panic!("workers.dev must not be packaged as production customer licensing authority");
    }
    let owned_subdomain = format!(".{owned_host_suffix}");
    if host != owned_host_suffix && !host.ends_with(&owned_subdomain) {
        panic!(
            "production trial routes must belong to the provisioned SahelFlow-owned host suffix"
        );
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
            let owned_host_suffix = configured_owned_host_suffix();
            let primary_origin = production_https_origin(routes[0], &owned_host_suffix);
            let recovery_origin = production_https_origin(routes[1], &owned_host_suffix);
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
