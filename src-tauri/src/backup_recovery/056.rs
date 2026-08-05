

/// Derive the command authority only from the canonical registry and the exact
/// completed migration set already present in every registered shop. The bridge
/// calls this after packaged runtime readiness, so it never guesses a schema
/// hash or publishes against a mixed installation.
pub(crate) fn discover_backup_authority(
    app_data_dir: &Path,
) -> Result<BackupAuthority, IoError> {
    let registry = read_registry(app_data_dir)?;
    let first = registry.shops.first().ok_or_else(|| {
        IoError::new(
            ErrorKind::InvalidData,
            "current installation has no reference shop migration authority",
        )
    })?;
    let reference_path = app_data_dir.join("shops").join(&first.database_file);
    let connection = Connection::open_with_flags(
        &reference_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
            | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    let mut statement = connection.prepare(
        "SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name ASC",
    )?;
    let migrations = statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    if migrations.is_empty() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "current installation has no completed migration authority",
        ));
    }
    let migration_set_sha256 = migration_set_hash_from_applied(&migrations);
    for shop in &registry.shops {
        verify_database_migration_set(
            &app_data_dir.join("shops").join(&shop.database_file),
            &migration_set_sha256,
        )?;
    }
    Ok(BackupAuthority {
        workspace_id: registry.workspace_id,
        installation_id: registry.installation_id,
        migration_set_sha256,
        app_version: env!("CARGO_PKG_VERSION").to_owned(),
        runtime_protocol_version: SUPPORTED_RUNTIME_PROTOCOL_VERSION,
    })
}

pub(crate) fn pending_restore_present(app_data_dir: &Path) -> Result<bool, IoError> {
    let path = pending_restore_path(app_data_dir);
    reject_symlink_if_present(&path)?;
    Ok(path.exists())
}
