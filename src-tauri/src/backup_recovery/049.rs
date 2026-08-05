

fn verify_database_migration_set(path: &Path, expected_hash: &str) -> Result<(), IoError> {
    let migrations = applied_migration_vector(path)?;
    if migration_set_hash_from_applied(&migrations) != expected_hash {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "shop database migration history does not match the backup authority",
        ));
    }
    Ok(())
}

fn current_migration_authority(
    app_data_dir: &Path,
    expected_hash: &str,
) -> Result<Vec<(String, String)>, IoError> {
    let registry = read_registry(app_data_dir)?;
    let first = registry.shops.first().ok_or_else(|| {
        IoError::new(
            ErrorKind::InvalidData,
            "current installation has no reference shop migration authority",
        )
    })?;
    let reference = applied_migration_vector(
        &app_data_dir.join("shops").join(&first.database_file),
    )?;
    if migration_set_hash_from_applied(&reference) != expected_hash {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "current installation migration authority does not match packaged startup",
        ));
    }
    for shop in registry.shops.iter().skip(1) {
        let observed = applied_migration_vector(
            &app_data_dir.join("shops").join(&shop.database_file),
        )?;
        if observed != reference {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "registered shops do not share one current migration authority",
            ));
        }
    }
    Ok(reference)
}

fn validate_restore_migration_compatibility(
    source_path: &Path,
    source_hash: &str,
    current: &[(String, String)],
) -> Result<(), IoError> {
    let source = applied_migration_vector(source_path)?;
    if migration_set_hash_from_applied(&source) != source_hash {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup database migration history disagrees with its authenticated manifest",
        ));
    }
    if source.len() > current.len()
        || source
            .iter()
            .zip(current.iter())
            .any(|(source, expected)| source != expected)
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "backup database requires an unsupported future or divergent migration history",
        ));
    }
    Ok(())
}