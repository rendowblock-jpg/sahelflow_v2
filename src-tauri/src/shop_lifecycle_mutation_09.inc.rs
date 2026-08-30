fn copy_database_exact(source: &Path, target: &Path) -> Result<(), MutationAuthorityError> {
    if target.exists() {
        return Err(MutationAuthorityError::InvalidRegistry(
            "shop database target already exists".to_string(),
        ));
    }
    let parent = target.parent().ok_or_else(|| {
        MutationAuthorityError::InvalidRegistry("shop database target has no parent".to_string())
    })?;
    fs::create_dir_all(parent)?;
    let staged = parent.join(format!(".restore-{}.db", random_hex(8)?));
    let expected = sha256_file(source)?;
    let outcome = (|| -> Result<(), MutationAuthorityError> {
        let mut input = OpenOptions::new().read(true).open(source)?;
        let mut output = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&staged)?;
        copy_io(&mut input, &mut output)?;
        output.sync_all()?;
        drop(output);
        preflight_database(&staged)?;
        if sha256_file(&staged)? != expected {
            return Err(MutationAuthorityError::Archive(
                "restored shop database digest does not match archive".to_string(),
            ));
        }
        fs::rename(&staged, target)?;
        sync_parent(target)?;
        preflight_database(target)
    })();
    if let Err(failure) = &outcome {
        // R3: the legacy `let _ =` cleanup silently ignored removal
        // failures — an orphan database stranded at the live target path
        // wedged all future recoveries behind "shop database target already
        // exists" with the real cause swallowed. Quarantine-rename keeps
        // the recovery path unblocked; if even quarantine fails, surface it.
        if let Err(cleanup_error) = quarantine_or_remove_sqlite_file_set(&staged)
            .and_then(|()| quarantine_or_remove_sqlite_file_set(target))
        {
            return Err(MutationAuthorityError::InvalidRegistry(format!(
                "recovery cleanup failed and a database file set may be stranded at {} or {}: {cleanup_error}; original failure: {failure}",
                staged.display(),
                target.display()
            )));
        }
    }
    outcome
}

fn write_archive_manifest(
    path: &Path,
    state: ArchiveState,
    installation_root: &[u8; 32],
) -> Result<(), MutationAuthorityError> {
    let mut key = hmac_sha256(installation_root, ARCHIVE_KEY_DOMAIN);
    let mac = hex_digest(&hmac_sha256(&key, &archive_message(&state)));
    key.fill(0);
    write_json_atomic(
        path,
        &ArchiveEnvelope {
            format_version: 1,
            key_id: "installation-root-shop-archive-hmac-v1".to_string(),
            state,
            mac,
        },
    )
}

fn read_archive(
    app_data_dir: &Path,
    archive_id: &str,
    installation_root: &[u8; 32],
) -> Result<(PathBuf, ArchiveState), MutationAuthorityError> {
    if !valid_lower_hex(archive_id, 16) {
        return Err(MutationAuthorityError::Archive(
            "archive identity is invalid".to_string(),
        ));
    }
    let root = app_data_dir.join(ARCHIVE_DIRECTORY);
    let directory = root.join(archive_id);
    let envelope: ArchiveEnvelope = read_json(&directory.join(ARCHIVE_MANIFEST_FILE))?;
    if envelope.format_version != 1
        || envelope.key_id != "installation-root-shop-archive-hmac-v1"
        || envelope.state.format_version != 1
        || envelope.state.archive_id != archive_id
    {
        return Err(MutationAuthorityError::Archive(
            "archive manifest format or identity is invalid".to_string(),
        ));
    }
    let mut key = hmac_sha256(installation_root, ARCHIVE_KEY_DOMAIN);
    let expected = hmac_sha256(&key, &archive_message(&envelope.state));
    key.fill(0);
    if !constant_time_hex_matches(&envelope.mac, &expected) {
        return Err(MutationAuthorityError::Archive(
            "archive manifest authentication failed".to_string(),
        ));
    }
    Ok((directory, envelope.state))
}

fn archive_message(state: &ArchiveState) -> Vec<u8> {
    let mut output = Vec::with_capacity(768);
    push_string(&mut output, std::str::from_utf8(ARCHIVE_MAC_DOMAIN).unwrap_or(""));
    output.push(0);
    output.push(state.format_version);
    push_string(&mut output, &state.archive_id);
    push_string(&mut output, &state.workspace_id);
    push_string(&mut output, &state.installation_id);
    output.push(match state.status {
        ArchiveStatus::Archived => 1,
        ArchiveStatus::DeletedRescue => 2,
    });
    push_string(&mut output, &state.shop.id);
    push_string(&mut output, &state.shop.incarnation_id);
    push_string(&mut output, &state.shop.name);
    push_string(&mut output, &state.shop.database_file);
    push_optional_string(&mut output, state.shop.icon.as_deref());
    push_string(&mut output, &state.shop.created_at);
    push_string(&mut output, &state.database_sha256);
    // Backward compatibility: old format-v1 archives had no media field in the
    // authenticated message. Appending this extension only when present keeps
    // those exact MAC bytes valid while authenticating every new media archive.
    if let Some(media) = state.whatsapp_media.as_ref() {
        push_string(&mut output, "whatsapp-media-archive-scope-v1");
        push_u64(&mut output, media.object_count);
        push_u64(&mut output, media.ciphertext_bytes);
        push_string(&mut output, &media.scope_sha256);
    }
    push_u64(&mut output, state.archived_at_unix_ms);
    push_u64(&mut output, state.source_registry_revision);
    push_string(&mut output, &state.operation_id);
    output
}

fn verify_archive_database(path: &Path, digest: &str) -> Result<(), MutationAuthorityError> {
    preflight_database(path)?;
    if sha256_file(path)? != digest {
        return Err(MutationAuthorityError::Archive(
            "archive database digest does not match its manifest".to_string(),
        ));
    }
    Ok(())
}

fn preflight_database(path: &Path) -> Result<(), MutationAuthorityError> {
    if !path.is_file() {
        return Err(MutationAuthorityError::InvalidRegistry(format!(
            "shop database is missing at {}",
            path.display()
        )));
    }
    let connection = Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
            | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(MutationAuthorityError::InvalidRegistry(format!(
            "SQLite integrity check failed for {}: {integrity}",
            path.display()
        )));
    }
    let foreign_key_failure: Option<i64> = connection
        .query_row(
            "SELECT 1 FROM pragma_foreign_key_check LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if foreign_key_failure.is_some() {
        return Err(MutationAuthorityError::InvalidRegistry(format!(
            "foreign key check failed for {}",
            path.display()
        )));
    }
    Ok(())
}
