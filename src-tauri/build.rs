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

fn production_https_origin(name: &str, value: &str) -> String {
    const PREFIX: &str = "https://";
    if !value.starts_with(PREFIX) || value.contains(char::is_whitespace) {
        panic!("{name} must be an absolute HTTPS origin without whitespace");
    }
    let remainder = &value[PREFIX.len()..];
    if remainder.is_empty()
        || remainder.contains('?')
        || remainder.contains('#')
        || remainder.contains('@')
    {
        panic!("{name} must contain only an HTTPS origin");
    }
    let (authority, path) = remainder
        .split_once('/')
        .map_or((remainder, ""), |(authority, path)| (authority, path));
    if authority.is_empty() || !path.is_empty() || authority.contains(':') {
        panic!("{name} must use a hostname-only HTTPS origin on the default port");
    }
    let host = authority.to_ascii_lowercase();
    let valid_host = host.contains('.')
        && host
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'.');
    if !valid_host || host.starts_with('.') || host.ends_with('.') || host.contains("..") {
        panic!("{name} must use a valid production hostname");
    }
    if host == "workers.dev" || host.ends_with(".workers.dev") {
        panic!("{name} must not use workers.dev as production licensing authority");
    }
    format!("https://{host}")
}

fn main() {
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        let service_url = required_release_value("SF_LICENSE_SERVICE_URL");
        let recovery_url = required_release_value("SF_LICENSE_RECOVERY_SERVICE_URL");
        println!("cargo:rerun-if-env-changed=SF_PHASE4_RESTORE_EVIDENCE_BUILD");
        let restore_evidence_build =
            std::env::var("SF_PHASE4_RESTORE_EVIDENCE_BUILD").as_deref() == Ok("1");
        if restore_evidence_build {
            if !exact_restore_evidence_loopback_url(&service_url)
                || !exact_restore_evidence_loopback_url(&recovery_url)
                || service_url != recovery_url
            {
                panic!(
                    "the explicit Phase 4 restore-evidence build must bind both trial routes to the same exact http://127.0.0.1:<port> disposable issuer"
                );
            }
        } else {
            let primary_origin = production_https_origin("SF_LICENSE_SERVICE_URL", &service_url);
            let recovery_origin =
                production_https_origin("SF_LICENSE_RECOVERY_SERVICE_URL", &recovery_url);
            if primary_origin == recovery_origin {
                panic!(
                    "SF_LICENSE_SERVICE_URL and SF_LICENSE_RECOVERY_SERVICE_URL must use distinct production origins"
                );
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
