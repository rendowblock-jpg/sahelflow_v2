pub fn recover_interrupted_lifecycle(
    app_data_dir: &Path,
    migration_set_sha256: &str,
    installation_root: &[u8; 32],
    now_unix_ms: u64,
) -> Result<(), MutationAuthorityError> {
    let current_path = journal_current_path(app_data_dir);
    if !current_path.exists() {
        return Ok(());
    }
    let mut journal: AuthenticatedShopLifecycleJournal = read_json(&current_path)?;
    journal.validate(installation_root)?;
    if matches!(
        journal.journal.stage,
        ShopLifecycleStage::Completed
            | ShopLifecycleStage::Recovered
            | ShopLifecycleStage::Blocked
    ) {
        return Ok(());
    }
    if journal.journal.stage == ShopLifecycleStage::ManualRecoveryRequired {
        return Err(MutationAuthorityError::ManualRecoveryRequired(format!(
            "operation {} remains blocked for manual recovery",
            journal.journal.request.operation_id
        )));
    }
    let recovery_time = now_unix_ms.max(journal.journal.updated_at_unix_ms);

    let registry: ShopRegistry = read_json(&app_data_dir.join(REGISTRY_FILE))?;
    validate_registry_shape(&registry)?;
    let request = &journal.journal.request;
    if registry.workspace_id != request.workspace_id
        || registry.installation_id != request.installation_id
        || request.migration_set_sha256 != migration_set_sha256
    {
        return Err(MutationAuthorityError::ManualRecoveryRequired(
            "interrupted lifecycle authority belongs to another installation state".to_string(),
        ));
    }

    let prior_observed = registry.revision == request.expected_registry_revision
        && registry.active_shop_id.as_deref() == Some(request.current_shop_id.as_str());
    let committed_revision = request
        .expected_registry_revision
        .checked_add(1)
        .ok_or_else(|| {
            MutationAuthorityError::InvalidRegistry("registry revision overflow".to_string())
        })?;
    let committed_observed = registry.revision == committed_revision
        && committed_outcome_matches(app_data_dir, &registry, &journal, installation_root)?;

    if prior_observed {
        cleanup_uncommitted_artifacts(app_data_dir, &registry, &journal, installation_root)?;
        match journal.journal.stage {
            ShopLifecycleStage::Requested
            | ShopLifecycleStage::Authorized
            | ShopLifecycleStage::Quiescing => {
                journal.transition(
                    installation_root,
                    ShopLifecycleStage::Blocked,
                    recovery_time,
                    Some("INTERRUPTED_BEFORE_COMMIT".to_string()),
                )?;
            }
            ShopLifecycleStage::RuntimeStopped
            | ShopLifecycleStage::Staged
            | ShopLifecycleStage::RegistryCommitting
            | ShopLifecycleStage::Committed
            | ShopLifecycleStage::RuntimeStarting => {
                journal.transition(
                    installation_root,
                    ShopLifecycleStage::Compensating,
                    recovery_time,
                    Some("INTERRUPTED_OPERATION_RECOVERED".to_string()),
                )?;
                journal.transition(
                    installation_root,
                    ShopLifecycleStage::Recovered,
                    recovery_time.saturating_add(1),
                    None,
                )?;
            }
            ShopLifecycleStage::Compensating => {
                journal.transition(
                    installation_root,
                    ShopLifecycleStage::Recovered,
                    recovery_time,
                    None,
                )?;
            }
            _ => {
                return Err(MutationAuthorityError::ManualRecoveryRequired(
                    "interrupted lifecycle stage cannot be reconciled to prior authority"
                        .to_string(),
                ))
            }
        }
        persist_recovered_journal(app_data_dir, &journal)?;
        return Ok(());
    }

    if committed_observed {
        let authority = migration_coordinator::active_authority(app_data_dir, migration_set_sha256)
            .map_err(|error| MutationAuthorityError::InvalidRegistry(error.to_string()))?;
        if authority.registry_revision != committed_revision {
            return Err(MutationAuthorityError::ManualRecoveryRequired(
                "interrupted lifecycle registry did not produce current runtime authority"
                    .to_string(),
            ));
        }
        finalize_committed_artifacts(app_data_dir, &journal, installation_root)?;
        advance_committed_journal(&mut journal, installation_root, recovery_time)?;
        persist_recovered_journal(app_data_dir, &journal)?;
        return Ok(());
    }

    Err(MutationAuthorityError::ManualRecoveryRequired(
        "interrupted lifecycle registry is neither exact prior nor exact committed authority"
            .to_string(),
    ))
}
