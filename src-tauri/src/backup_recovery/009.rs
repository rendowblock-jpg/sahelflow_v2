

fn validate_target_registry(registry: &ShopRegistry) -> Result<(), IoError> {
    if registry.format_version != REGISTRY_FORMAT_VERSION
        || registry.revision == 0
        || !is_identity(&registry.workspace_id)
        || !is_identity(&registry.installation_id)
        || registry.shops.is_empty()
        || registry.shops.len() > MAX_SHOPS
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup registry is incomplete or unsupported",
        ));
    }
    let mut ids = BTreeSet::new();
    let mut files = BTreeSet::new();
    for shop in &registry.shops {
        if !valid_shop_id(&shop.id)
            || !is_identity(&shop.incarnation_id)
            || shop.name.trim().is_empty()
            || shop.created_at.trim().is_empty()
            || !valid_database_file(&shop.database_file)
            || !ids.insert(shop.id.clone())
            || !files.insert(shop.database_file.clone())
        {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!("backup registry entry {} is invalid", shop.id),
            ));
        }
    }
    if registry
        .active_shop_id
        .as_ref()
        .is_some_and(|active| !ids.contains(active))
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup active shop is not registered",
        ));
    }
    Ok(())
}

fn valid_shop_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .bytes()
            .enumerate()
            .all(|(index, byte)| byte.is_ascii_lowercase() || byte.is_ascii_digit() || index > 0 && byte == b'-')
}

fn valid_database_file(value: &str) -> bool {
    let path = Path::new(value);
    path.file_name() == Some(OsStr::new(value))
        && path.extension() == Some(OsStr::new("db"))
        && value.len() <= 96
        && value
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'.')
}

fn is_identity(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}