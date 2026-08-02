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

fn main() {
    if std::env::var("PROFILE").as_deref() == Ok("release") {
        let service_url = required_release_value("SF_LICENSE_SERVICE_URL");
        if !service_url.starts_with("https://") || service_url.contains(char::is_whitespace) {
            panic!("SF_LICENSE_SERVICE_URL must be an absolute HTTPS URL without whitespace");
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
