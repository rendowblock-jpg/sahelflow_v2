impl AcceptedMutation {
    pub fn commit(
        &mut self,
        now_unix_ms: u64,
    ) -> Result<MutationCommit, MutationAuthorityError> {
        if self.committed.is_some() || self.registry_committed {
            return Err(MutationAuthorityError::InvalidState(
                "the lifecycle mutation is already committed".to_string(),
            ));
        }

        self.transition(ShopLifecycleStage::Staged, now_unix_ms)?;
        self.transition(
            ShopLifecycleStage::RegistryCommitting,
            now_unix_ms.saturating_add(1),
        )?;

        let registry_path = self.app_data_dir.join(REGISTRY_FILE);
        let mut registry: ShopRegistry = read_json(&registry_path)?;
        validate_registry_shape(&registry)?;
        validate_current_authority(
            &registry,
            &self.journal.journal.request,
            &self.previous_authority,
        )?;
        let previous_registry = registry.clone();
        let payload = self.journal.authorization.payload.clone();
        let rollback_action = match payload {
            ShopLifecyclePayload::Create { name, icon } => {
                if registry.shops.len() >= usize::from(self.journal.journal.request.shop_slots) {
                    return Err(MutationAuthorityError::Entitlement(
                        "signed shop-slot authority is exhausted".to_string(),
                    ));
                }
                let shop = new_shop(
                    &name,
                    icon,
                    &registry,
                    &self.journal.journal.request.operation_id,
                    now_unix_ms,
                )?;
                let database_path = self.app_data_dir.join("shops").join(&shop.database_file);
                provision_database(
                    &self.app_data_dir,
                    &self.resource_dir,
                    &database_path,
                    &self.migration_set_sha256,
                )?;
                registry.shops.push(shop);
                RollbackAction::RemoveDatabase(database_path)
            }
            ShopLifecyclePayload::Rename { name } => {
                let target = exact_registry_target_mut(
                    &mut registry,
                    &self.journal.journal.request,
                )?;
                target.name = name;
                RollbackAction::RegistryOnly
            }
            ShopLifecyclePayload::Archive => self.archive_target(
                &mut registry,
                ArchiveStatus::Archived,
                now_unix_ms,
            )?,
            ShopLifecyclePayload::Delete { .. } => self.archive_target(
                &mut registry,
                ArchiveStatus::DeletedRescue,
                now_unix_ms,
            )?,
            ShopLifecyclePayload::Recover { archive_id } => {
                if registry.shops.len() >= usize::from(self.journal.journal.request.shop_slots) {
                    return Err(MutationAuthorityError::Entitlement(
                        "signed shop-slot authority is exhausted".to_string(),
                    ));
                }
                let (archive_directory, archive) = read_archive(
                    &self.app_data_dir,
                    &archive_id,
                    &self.installation_root,
                )?;
                if archive.status != ArchiveStatus::Archived {
                    return Err(MutationAuthorityError::Archive(
                        "only an ordinary archived shop can be recovered".to_string(),
                    ));
                }
                validate_recovery_target(&archive, &self.journal.journal.request)?;
                if archive.workspace_id != registry.workspace_id
                    || archive.installation_id != registry.installation_id
                    || registry.shops.iter().any(|shop| {
                        shop.id == archive.shop.id
                            || shop.incarnation_id == archive.shop.incarnation_id
                            || shop.database_file == archive.shop.database_file
                    })
                {
                    return Err(MutationAuthorityError::Archive(
                        "archive identity collides with live registry authority".to_string(),
                    ));
                }
                let archive_database = archive_directory.join(ARCHIVE_DATABASE_FILE);
                verify_archive_database(&archive_database, &archive.database_sha256)?;
                let live_database = self
                    .app_data_dir
                    .join("shops")
                    .join(&archive.shop.database_file);
                copy_database_exact(&archive_database, &live_database)?;
                registry.shops.push(archive.shop);
                self.finalize_archive = Some(archive_directory);
                RollbackAction::RemoveDatabase(live_database)
            }
            ShopLifecyclePayload::Switch => {
                return Err(MutationAuthorityError::UnsupportedOperation)
            }
        };

        registry.revision = registry.revision.checked_add(1).ok_or_else(|| {
            MutationAuthorityError::InvalidRegistry("registry revision overflow".to_string())
        })?;
        validate_registry_shape(&registry)?;
        self.rollback = Some(RollbackPlan {
            previous_registry,
            action: rollback_action,
        });
        write_json_atomic(&registry_path, &registry)?;
        self.registry_committed = true;
        if let Some(database_path) = self.post_commit_remove.take() {
            remove_sqlite_file_set(&database_path)?;
        }

        let target_authority = migration_coordinator::active_authority(
            &self.app_data_dir,
            &self.migration_set_sha256,
        )
        .map_err(|error| MutationAuthorityError::InvalidRegistry(error.to_string()))?;
        if target_authority.workspace_id != registry.workspace_id
            || target_authority.installation_id != registry.installation_id
            || target_authority.registry_revision != registry.revision
        {
            return Err(MutationAuthorityError::InvalidRegistry(
                "committed registry did not produce exact active authority".to_string(),
            ));
        }

        self.transition(ShopLifecycleStage::Committed, now_unix_ms.saturating_add(2))?;
        let committed = MutationCommit {
            previous_authority: self.previous_authority.clone(),
            target_authority,
        };
        self.committed = Some(committed.clone());
        Ok(committed)
    }
}
