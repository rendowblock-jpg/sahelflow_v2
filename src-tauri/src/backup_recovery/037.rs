


fn canonical_recovery_set() -> RecoverySetClassification {
    RecoverySetClassification {
        included: vec![
            "shop-registry".to_owned(),
            "all-shop-sqlite-snapshots".to_owned(),
            "protected-shop-key-authorities".to_owned(),
            "backup-recovery-key-descriptor".to_owned(),
            "schema-and-migration-compatibility".to_owned(),
        ],
        rebuilt: vec![
            "sqlite-wal-shm-journal".to_owned(),
            "runtime-endpoint-and-process-state".to_owned(),
            "caches-and-temporary-files".to_owned(),
        ],
        re_enrolled: vec![
            "installation-root-protection".to_owned(),
            "identity-device-and-session-authority".to_owned(),
        ],
        non_transferable: vec![
            "license-clock-and-revocation-floor".to_owned(),
            "operating-system-device-binding".to_owned(),
            "live-runtime-credentials".to_owned(),
        ],
    }
}

fn prepare_replacement_identity_reenrollment(database_path: &Path) -> Result<(), IoError> {
    let mut connection = Connection::open(database_path).map_err(sqlite_error)?;
    let transaction = connection.transaction().map_err(sqlite_error)?;
    transaction
        .execute(r#"DELETE FROM "Session""#, [])
        .map_err(sqlite_error)?;
    transaction
        .execute(r#"DELETE FROM "AuthSecret""#, [])
        .map_err(sqlite_error)?;
    transaction
        .execute(
            r#"DELETE FROM "Setting" WHERE "key" = ?1"#,
            [IDENTITY_FOOTPRINT_SETTING],
        )
        .map_err(sqlite_error)?;
    transaction.commit().map_err(sqlite_error)?;
    drop(connection);
    sync_sqlite_database(database_path)
}

fn copy_optional_rescue_authority(
    source: &Path,
    rescue: &Path,
    file_name: &str,
) -> Result<(Option<String>, Option<String>), IoError> {
    if !source.exists() {
        return Ok((None, None));
    }
    reject_symlink_if_present(source)?;
    if !fs::metadata(source)?.is_file() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "identity rescue authority is not a regular file",
        ));
    }
    let target = rescue.join(file_name);
    copy_file_verified(source, &target)?;
    Ok((Some(file_name.to_owned()), Some(sha256_file(&target)?)))
}
