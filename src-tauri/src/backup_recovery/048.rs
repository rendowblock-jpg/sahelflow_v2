


fn applied_migration_vector(path: &Path) -> Result<Vec<(String, String)>, IoError> {
    let connection = Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
            | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(sqlite_error)?;
    let table_exists: i64 = connection
        .query_row(
            r#"SELECT EXISTS(
                SELECT 1 FROM sqlite_master
                WHERE type = 'table' AND name = '_prisma_migrations'
            )"#,
            [],
            |row| row.get(0),
        )
        .map_err(sqlite_error)?;
    if table_exists != 1 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "shop database has no authenticated migration history",
        ));
    }
    let mut statement = connection
        .prepare(
            r#"SELECT migration_name, checksum FROM "_prisma_migrations"
               WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
               ORDER BY started_at, migration_name"#,
        )
        .map_err(sqlite_error)?;
    let migrations = statement
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(sqlite_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sqlite_error)?;
    if migrations.is_empty()
        || migrations.iter().any(|(name, checksum)| {
            name.is_empty()
                || !name
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
                || checksum.len() != 64
                || !checksum.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
    {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "shop database migration history is empty or malformed",
        ));
    }
    Ok(migrations)
}

fn migration_set_hash_from_applied(migrations: &[(String, String)]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(MIGRATION_SET_HASH_DOMAIN);
    for (name, checksum) in migrations {
        hasher.update(name.len().to_string().as_bytes());
        hasher.update(b":");
        hasher.update(name.as_bytes());
        hasher.update(b"\n64:");
        hasher.update(checksum.as_bytes());
        hasher.update(b"\n");
    }
    hex_encode(&hasher.finalize())
}