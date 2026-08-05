

fn restore_receipt_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("recovery-journal").join(RESTORE_RECEIPT_FILE)
}

fn restore_staging_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("recovery-staging")
}

fn restore_rescue_root(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("recovery-rescue")
}

fn read_registry(app_data_dir: &Path) -> Result<ShopRegistry, IoError> {
    let path = app_data_dir.join(REGISTRY_FILE);
    let registry: ShopRegistry = read_json_limited(&path, MAX_JSON_BYTES)?;
    validate_registry(app_data_dir, &registry)?;
    Ok(registry)
}

fn validate_registry(app_data_dir: &Path, registry: &ShopRegistry) -> Result<(), IoError> {
    if registry.format_version != REGISTRY_FORMAT_VERSION
        || registry.revision == 0
        || !is_identity(&registry.workspace_id)
        || !is_identity(&registry.installation_id)
        || registry.shops.is_empty()
        || registry.shops.len() > MAX_SHOPS
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "shop registry is incomplete or unsupported",
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
                format!("shop registry entry {} is invalid", shop.id),
            ));
        }
        let database = app_data_dir.join("shops").join(&shop.database_file);
        reject_symlink_if_present(&database)?;
        if !database.is_file() {
            return Err(IoError::new(
                ErrorKind::NotFound,
                format!("database is missing for shop {}", shop.id),
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
            "active shop is not registered",
        ));
    }
    Ok(())
}