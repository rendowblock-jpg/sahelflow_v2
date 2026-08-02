fn slug(name: &str) -> String {
    let mut output = String::new();
    let mut hyphen = false;
    for character in name.chars() {
        if character.is_ascii_alphanumeric() {
            if hyphen && !output.is_empty() {
                output.push('-');
            }
            output.push(character.to_ascii_lowercase());
            hyphen = false;
        } else if character.is_whitespace() || character == '-' {
            hyphen = true;
        }
        if output.len() >= 30 {
            break;
        }
    }
    while output.ends_with('-') {
        output.pop();
    }
    if output.is_empty() {
        "shop".to_string()
    } else {
        output
    }
}

fn provision_database(
    app_data_dir: &Path,
    resource_dir: &Path,
    target: &Path,
    expected_migration_set: &str,
) -> Result<(), MutationAuthorityError> {
    let shops_root = validated_shops_root(app_data_dir)?;
    if target.parent() != Some(shops_root.as_path()) || target.exists() {
        return Err(MutationAuthorityError::InvalidRegistry(
            "new shop database target is invalid or already exists".to_string(),
        ));
    }
    let migrations = load_migrations(&resource_dir.join("prisma/migrations"))?;
    if migrations.is_empty() || migration_set_hash(&migrations) != expected_migration_set {
        return Err(MutationAuthorityError::Migration(
            "packaged migration set does not match lifecycle authority".to_string(),
        ));
    }
    let staged = shops_root.join(format!(".provision-{}.db", random_hex(8)?));
    let outcome = (|| -> Result<(), MutationAuthorityError> {
        let connection = Connection::open(&staged)?;
        connection.busy_timeout(std::time::Duration::from_secs(10))?;
        ensure_migration_table(&connection)?;
        for migration in &migrations {
            connection.execute_batch(&migration.sql)?;
            connection.execute(
                r#"INSERT INTO "_prisma_migrations"
                (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
                VALUES (?1, ?2, CURRENT_TIMESTAMP, ?3, CURRENT_TIMESTAMP, 1)"#,
                params![random_hex(16)?, &migration.checksum, &migration.name],
            )?;
        }
        drop(connection);
        preflight_database(&staged)?;
        sync_file(&staged)?;
        fs::rename(&staged, target)?;
        sync_parent(target)?;
        preflight_database(target)
    })();
    if outcome.is_err() {
        let _ = remove_sqlite_file_set(&staged);
        let _ = remove_sqlite_file_set(target);
    }
    outcome
}

fn load_migrations(directory: &Path) -> Result<Vec<Migration>, MutationAuthorityError> {
    if !directory.is_dir() {
        return Err(MutationAuthorityError::Migration(format!(
            "packaged migration directory is missing at {}",
            directory.display()
        )));
    }
    let mut entries = fs::read_dir(directory)?
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .filter(|entry| entry.path().is_dir())
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());
    entries
        .into_iter()
        .map(|entry| {
            let name = entry.file_name().into_string().map_err(|_| {
                MutationAuthorityError::Migration(
                    "migration name is not valid UTF-8".to_string(),
                )
            })?;
            if !name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
            {
                return Err(MutationAuthorityError::Migration(format!(
                    "migration name has unsupported characters: {name}"
                )));
            }
            let sql = fs::read_to_string(entry.path().join("migration.sql"))?;
            Ok(Migration {
                name,
                checksum: sha256_bytes(sql.as_bytes()),
                sql,
            })
        })
        .collect()
}

fn migration_set_hash(migrations: &[Migration]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(MIGRATION_SET_HASH_DOMAIN);
    for migration in migrations {
        hasher.update(migration.name.len().to_string().as_bytes());
        hasher.update(b":");
        hasher.update(migration.name.as_bytes());
        hasher.update(b"\n64:");
        hasher.update(migration.checksum.as_bytes());
        hasher.update(b"\n");
    }
    hex_digest(hasher.finalize().as_slice())
}

fn ensure_migration_table(connection: &Connection) -> Result<(), MutationAuthorityError> {
    connection.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "checksum" TEXT NOT NULL,
          "finished_at" DATETIME,
          "migration_name" TEXT NOT NULL,
          "logs" TEXT,
          "rolled_back_at" DATETIME,
          "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
          "applied_steps_count" INTEGER NOT NULL DEFAULT 0
        );
        "#,
    )?;
    Ok(())
}

fn snapshot_database(source: &Path, target: &Path) -> Result<(), MutationAuthorityError> {
    if target.exists() {
        return Err(MutationAuthorityError::Archive(
            "archive database already exists".to_string(),
        ));
    }
    let staged = target.with_extension(format!("{}.tmp", random_hex(8)?));
    let outcome = (|| -> Result<(), MutationAuthorityError> {
        let source_connection = Connection::open_with_flags(
            source,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
                | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
        )?;
        source_connection.busy_timeout(std::time::Duration::from_secs(10))?;
        source_connection.backup(DatabaseName::Main, &staged, None)?;
        drop(source_connection);
        preflight_database(&staged)?;
        sync_file(&staged)?;
        fs::rename(&staged, target)?;
        sync_parent(target)?;
        preflight_database(target)
    })();
    if outcome.is_err() {
        let _ = remove_sqlite_file_set(&staged);
        let _ = remove_sqlite_file_set(target);
    }
    outcome
}
