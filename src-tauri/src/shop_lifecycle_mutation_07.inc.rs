fn validate_operation_target(
    app_data_dir: &Path,
    registry: &ShopRegistry,
    command: &ShopLifecycleCommand,
    installation_root: &[u8; 32],
) -> Result<(), MutationAuthorityError> {
    match &command.authorization.payload {
        ShopLifecyclePayload::Create { .. } => {
            if registry.shops.len()
                >= usize::from(command.authorization.request.shop_slots)
            {
                return Err(MutationAuthorityError::Entitlement(
                    "signed shop-slot authority is exhausted".to_string(),
                ));
            }
        }
        ShopLifecyclePayload::Rename { .. }
        | ShopLifecyclePayload::Archive
        | ShopLifecyclePayload::Delete { .. } => {
            exact_registry_target_ref(registry, &command.authorization.request)?;
        }
        ShopLifecyclePayload::Recover { archive_id } => {
            if registry.shops.len()
                >= usize::from(command.authorization.request.shop_slots)
            {
                return Err(MutationAuthorityError::Entitlement(
                    "signed shop-slot authority is exhausted".to_string(),
                ));
            }
            let (_, archive) = read_archive(app_data_dir, archive_id, installation_root)?;
            validate_recovery_target(&archive, &command.authorization.request)?;
        }
        ShopLifecyclePayload::Switch => {
            return Err(MutationAuthorityError::UnsupportedOperation)
        }
    }
    Ok(())
}

fn validate_current_authority(
    registry: &ShopRegistry,
    request: &super::shop_lifecycle::ShopLifecycleRequest,
    current: &ActiveShopAuthority,
) -> Result<(), MutationAuthorityError> {
    if request.migration_set_sha256 != current.migration_set_sha256
        || registry.revision != request.expected_registry_revision
        || registry.revision != current.registry_revision
        || registry.workspace_id != request.workspace_id
        || registry.workspace_id != current.workspace_id
        || registry.installation_id != request.installation_id
        || registry.installation_id != current.installation_id
        || registry.active_shop_id.as_deref() != Some(request.current_shop_id.as_str())
        || current.shop_id != request.current_shop_id
        || current.shop_incarnation_id != request.current_shop_incarnation_id
    {
        return Err(MutationAuthorityError::AuthorityMismatch(
            "shop lifecycle authority no longer matches the live installation".to_string(),
        ));
    }
    Ok(())
}

fn exact_registry_target_ref<'a>(
    registry: &'a ShopRegistry,
    request: &super::shop_lifecycle::ShopLifecycleRequest,
) -> Result<&'a ShopRecord, MutationAuthorityError> {
    let target_id = request.target_shop_id.as_deref().ok_or_else(|| {
        MutationAuthorityError::AuthorityMismatch("target shop is missing".to_string())
    })?;
    let target_incarnation = request.target_shop_incarnation_id.as_deref().ok_or_else(|| {
        MutationAuthorityError::AuthorityMismatch("target incarnation is missing".to_string())
    })?;
    registry
        .shops
        .iter()
        .find(|shop| shop.id == target_id && shop.incarnation_id == target_incarnation)
        .ok_or_else(|| {
            MutationAuthorityError::AuthorityMismatch(
                "target shop authority is stale or unavailable".to_string(),
            )
        })
}

fn exact_registry_target_mut<'a>(
    registry: &'a mut ShopRegistry,
    request: &super::shop_lifecycle::ShopLifecycleRequest,
) -> Result<&'a mut ShopRecord, MutationAuthorityError> {
    let target_id = request.target_shop_id.as_deref().ok_or_else(|| {
        MutationAuthorityError::AuthorityMismatch("target shop is missing".to_string())
    })?;
    let target_incarnation = request.target_shop_incarnation_id.as_deref().ok_or_else(|| {
        MutationAuthorityError::AuthorityMismatch("target incarnation is missing".to_string())
    })?;
    registry
        .shops
        .iter_mut()
        .find(|shop| shop.id == target_id && shop.incarnation_id == target_incarnation)
        .ok_or_else(|| {
            MutationAuthorityError::AuthorityMismatch(
                "target shop authority is stale or unavailable".to_string(),
            )
        })
}

fn validate_recovery_target(
    archive: &ArchiveState,
    request: &super::shop_lifecycle::ShopLifecycleRequest,
) -> Result<(), MutationAuthorityError> {
    if request.target_shop_id.as_deref() != Some(archive.shop.id.as_str())
        || request.target_shop_incarnation_id.as_deref()
            != Some(archive.shop.incarnation_id.as_str())
    {
        return Err(MutationAuthorityError::AuthorityMismatch(
            "archive target does not match authenticated recovery authority".to_string(),
        ));
    }
    Ok(())
}

fn new_shop(
    name: &str,
    icon: Option<String>,
    registry: &ShopRegistry,
    operation_id: &str,
    now_unix_ms: u64,
) -> Result<ShopRecord, MutationAuthorityError> {
    let id = deterministic_shop_id(name, operation_id)?;
    if registry.shops.iter().any(|shop| shop.id == id) {
        return Err(MutationAuthorityError::InvalidRegistry(
            "deterministic shop identity already exists".to_string(),
        ));
    }
    Ok(ShopRecord {
        database_file: format!("{id}.db"),
        id,
        incarnation_id: random_hex(16)?,
        name: name.to_string(),
        icon,
        created_at: format!("unix-ms:{now_unix_ms}"),
    })
}

fn deterministic_shop_id(
    name: &str,
    operation_id: &str,
) -> Result<String, MutationAuthorityError> {
    let base = slug(name);
    let suffix = operation_id.get(..8).ok_or_else(|| {
        MutationAuthorityError::InvalidRegistry("operation identity is incomplete".to_string())
    })?;
    Ok(format!(
        "{}-{suffix}",
        base.chars().take(54).collect::<String>()
    ))
}
