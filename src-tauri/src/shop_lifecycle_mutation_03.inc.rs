impl AcceptedMutation {
    pub fn compensate(
        &mut self,
        now_unix_ms: u64,
        failure_code: &str,
    ) -> Result<ActiveShopAuthority, MutationAuthorityError> {
        self.journal.transition(
            &self.installation_root,
            ShopLifecycleStage::Compensating,
            now_unix_ms,
            Some(failure_code.to_string()),
        )?;
        self.persist_journal()?;

        let Some(plan) = self.rollback.take() else {
            return Ok(self.previous_authority.clone());
        };
        let registry_path = self.app_data_dir.join(REGISTRY_FILE);
        let current: ShopRegistry = read_json(&registry_path)?;
        validate_registry_shape(&current)?;
        let committed_revision = plan
            .previous_registry
            .revision
            .checked_add(1)
            .ok_or_else(|| {
                MutationAuthorityError::InvalidRegistry("registry revision overflow".to_string())
            })?;
        let committed_observed = current.workspace_id == plan.previous_registry.workspace_id
            && current.installation_id == plan.previous_registry.installation_id
            && current.revision == committed_revision;
        let prior_observed = current.workspace_id == plan.previous_registry.workspace_id
            && current.installation_id == plan.previous_registry.installation_id
            && current.revision == plan.previous_registry.revision;
        if !committed_observed && !prior_observed {
            return Err(MutationAuthorityError::ManualRecoveryRequired(
                "registry changed after lifecycle mutation; automatic compensation is blocked"
                    .to_string(),
            ));
        }
        let registry_changed = self.registry_committed || committed_observed;

        let mut restored = plan.previous_registry;
        if registry_changed {
            restored.revision = current.revision.checked_add(1).ok_or_else(|| {
                MutationAuthorityError::InvalidRegistry("registry revision overflow".to_string())
            })?;
        }

        match plan.action {
            RollbackAction::RegistryOnly => {
                if registry_changed {
                    write_json_atomic(&registry_path, &restored)?;
                }
            }
            RollbackAction::RemoveDatabase(path) => {
                if registry_changed {
                    write_json_atomic(&registry_path, &restored)?;
                }
                remove_sqlite_file_set(&path)?;
            }
            RollbackAction::RestoreArchivedDatabase {
                archive_directory,
                archive_database,
                live_database,
            } => {
                if registry_changed || !live_database.exists() {
                    let _ = remove_sqlite_file_set(&live_database);
                    copy_database_exact(&archive_database, &live_database)?;
                }
                if registry_changed {
                    write_json_atomic(&registry_path, &restored)?;
                }
                if let Err(error) = fs::remove_dir_all(&archive_directory) {
                    eprintln!(
                        "[sahelflow] WARN: compensated archive {} could not be removed: {error}",
                        archive_directory.display()
                    );
                }
            }
        }
        self.finalize_archive = None;
        self.post_commit_remove = None;
        self.registry_committed = false;

        let recovered = migration_coordinator::active_authority(
            &self.app_data_dir,
            &self.migration_set_sha256,
        )
        .map_err(|error| {
            MutationAuthorityError::ManualRecoveryRequired(format!(
                "compensated registry did not produce canonical prior authority: {error}"
            ))
        })?;
        if recovered.workspace_id != self.previous_authority.workspace_id
            || recovered.installation_id != self.previous_authority.installation_id
            || recovered.shop_id != self.previous_authority.shop_id
            || recovered.shop_incarnation_id
                != self.previous_authority.shop_incarnation_id
            || recovered.database_file_id != self.previous_authority.database_file_id
        {
            return Err(MutationAuthorityError::ManualRecoveryRequired(
                "compensation produced unexpected prior shop authority".to_string(),
            ));
        }
        Ok(recovered)
    }
}

impl AcceptedMutation {
    pub fn complete_recovery(
        &mut self,
        now_unix_ms: u64,
    ) -> Result<(), MutationAuthorityError> {
        self.journal.transition(
            &self.installation_root,
            ShopLifecycleStage::Recovered,
            now_unix_ms,
            None,
        )?;
        self.persist_terminal_journal()
    }
}

impl AcceptedMutation {
    pub fn complete(&mut self, now_unix_ms: u64) -> Result<(), MutationAuthorityError> {
        self.transition(ShopLifecycleStage::Ready, now_unix_ms)?;
        if let Some(archive_directory) = self.finalize_archive.take() {
            if let Err(error) = fs::remove_dir_all(&archive_directory) {
                eprintln!(
                    "[sahelflow] WARN: recovered archive {} remains retained after success: {error}",
                    archive_directory.display()
                );
            }
        }
        self.journal.transition(
            &self.installation_root,
            ShopLifecycleStage::Completed,
            now_unix_ms.saturating_add(1),
            None,
        )?;
        self.persist_terminal_journal()
    }
}

impl AcceptedMutation {
    pub fn block(
        &mut self,
        now_unix_ms: u64,
        failure_code: &str,
        manual_recovery: bool,
    ) -> Result<(), MutationAuthorityError> {
        self.journal.transition(
            &self.installation_root,
            ShopLifecycleStage::Blocked,
            now_unix_ms,
            Some(failure_code.to_string()),
        )?;
        if manual_recovery {
            self.persist_journal()?;
            self.journal.transition(
                &self.installation_root,
                ShopLifecycleStage::ManualRecoveryRequired,
                now_unix_ms.saturating_add(1),
                Some(failure_code.to_string()),
            )?;
        }
        self.persist_terminal_journal()
    }
}
