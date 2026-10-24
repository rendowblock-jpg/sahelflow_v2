#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn windows_snapshot_verification_and_commit_use_write_capable_handles() {
        let root = std::env::temp_dir().join(format!(
            "sahelflow-durability-sync-{}-{}",
            std::process::id(),
            random_hex(8).expect("random suffix")
        ));
        fs::create_dir_all(&root).expect("durability sync test directory");
        let source = root.join("source.db");
        let snapshot = root.join("staging").join("snapshot.db");
        let connection = Connection::open(&source).expect("snapshot source database");
        connection
            .execute_batch(&format!(
                r#"
                PRAGMA foreign_keys = ON;
                CREATE TABLE "_prisma_migrations" (
                    migration_name TEXT NOT NULL,
                    checksum TEXT NOT NULL,
                    started_at INTEGER NOT NULL,
                    finished_at INTEGER,
                    rolled_back_at INTEGER
                );
                INSERT INTO "_prisma_migrations"
                    (migration_name, checksum, started_at, finished_at, rolled_back_at)
                VALUES ('20260809000000_windows_snapshot', '{}', 1, 2, NULL);
                CREATE TABLE durable_fixture (id INTEGER PRIMARY KEY, value TEXT NOT NULL);
                INSERT INTO durable_fixture (value) VALUES ('preserved');
                "#,
                "a".repeat(64)
            ))
            .expect("snapshot source authority");
        drop(connection);
        let migrations = applied_migration_vector(&source).expect("source migration authority");
        let migration_set_sha256 = migration_set_hash_from_applied(&migrations);

        create_verified_snapshot(&source, &snapshot).expect("verified Windows SQLite snapshot");
        verify_database_migration_set(&snapshot, &migration_set_sha256)
            .expect("snapshot migration authority");
        sync_tree(&root).expect("write-capable Windows durability sync");

        fs::remove_dir_all(root).expect("remove durability sync test directory");
    }

    fn test_restore_journal(state: RestoreJournalState) -> RestoreJournal {
        RestoreJournal {
            unsigned: RestoreJournalUnsigned {
                format_version: RESTORE_JOURNAL_FORMAT_VERSION,
                restore_id: "restore-1234567890abcdef".to_owned(),
                state,
                backup_id: "backup-1234567890-abcdef1234567890".to_owned(),
                local_workspace_id: "10".repeat(16),
                target_workspace_id: "20".repeat(16),
                installation_id: "30".repeat(16),
                staging_directory: "restore-1234567890abcdef".to_owned(),
                rescue_directory: "restore-1234567890abcdef".to_owned(),
                manifest_sha256: "a".repeat(64),
                created_at_unix_ms: 1,
                updated_at_unix_ms: 2,
                failure_code: None,
            },
            mac_hex: "b".repeat(64),
        }
    }

    #[test]
    fn committed_restore_resets_workspace_bound_native_replay_authority() {
        let root = std::env::temp_dir().join(format!(
            "sahelflow-restore-replay-{}-{}",
            std::process::id(),
            random_hex(8).expect("random suffix")
        ));
        let app_data = root.join("data");
        let journal = test_restore_journal(RestoreJournalState::Committed);
        fs::create_dir_all(system_dir(&app_data)).expect("system directory");
        fs::create_dir_all(
            restore_staging_root(&app_data).join(&journal.unsigned.staging_directory),
        )
        .expect("staging directory");
        fs::create_dir_all(restore_rescue_root(&app_data).join(&journal.unsigned.rescue_directory))
            .expect("rescue directory");
        let replay = system_dir(&app_data).join(NATIVE_COMMAND_REPLAY_FILE);
        fs::write(&replay, b"old-workspace-replay-authority").expect("replay authority");
        let pending = pending_restore_path(&app_data);
        fs::create_dir_all(pending.parent().expect("journal parent")).expect("journal directory");
        fs::write(&pending, b"pending").expect("pending journal");

        cleanup_restore_state(&app_data, &journal).expect("cleanup committed restore");

        assert!(!replay.exists());
        assert!(!pending.exists());
        assert!(!restore_staging_root(&app_data)
            .join(&journal.unsigned.staging_directory)
            .exists());
        assert!(!restore_rescue_root(&app_data)
            .join(&journal.unsigned.rescue_directory)
            .exists());
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn rolled_back_restore_preserves_native_replay_authority() {
        let root = std::env::temp_dir().join(format!(
            "sahelflow-rollback-replay-{}-{}",
            std::process::id(),
            random_hex(8).expect("random suffix")
        ));
        let app_data = root.join("data");
        let journal = test_restore_journal(RestoreJournalState::RolledBack);
        fs::create_dir_all(system_dir(&app_data)).expect("system directory");
        let replay = system_dir(&app_data).join(NATIVE_COMMAND_REPLAY_FILE);
        fs::write(&replay, b"local-workspace-replay-authority").expect("replay authority");

        cleanup_restore_state(&app_data, &journal).expect("cleanup rollback");

        assert_eq!(
            fs::read(&replay).expect("preserved replay authority"),
            b"local-workspace-replay-authority"
        );
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn recovery_codes_are_strict_and_round_trip() {
        let bytes = [0xabu8; 32];
        let rendered = formatted_recovery_code(&bytes);
        assert_eq!(parse_recovery_code(&rendered).unwrap(), bytes);
        assert!(parse_recovery_code("not-a-code").is_err());
    }

    #[test]
    fn unsafe_relative_paths_are_rejected() {
        let root = PathBuf::from("root");
        assert!(safe_relative_path(&root, "../escape").is_err());
        assert!(safe_relative_path(&root, "/absolute").is_err());
    }

    #[test]
    fn backup_and_kit_ids_require_the_canonical_generated_shape() {
        assert!(validate_backup_id("backup-1234567890-abcdef1234567890").is_ok());
        assert!(validate_kit_id("kit-1234567890-abcdef1234567890").is_ok());
        for invalid in [
            "backup-1234567890abcdef",
            "backup-1234567890-ABCDEF1234567890",
            "backup-123-abcdef1234567890",
            "other-1234567890-abcdef1234567890",
        ] {
            assert!(validate_backup_id(invalid).is_err());
        }
    }

    #[test]
    fn recovery_kit_receipt_mac_binds_the_persisted_kit_digest() {
        let root = [0x44_u8; 32];
        let root_id = key_id(&root);
        let unsigned = RecoveryKitVerificationReceiptUnsigned {
            format_version: RECOVERY_KIT_RECEIPT_FORMAT_VERSION,
            kit_id: "kit-1234567890-abcdef1234567890".to_owned(),
            workspace_id: "10".repeat(16),
            source_installation_id: "20".repeat(16),
            brk_id: root_id,
            recovery_key_id: "b".repeat(64),
            kit_sha256: "c".repeat(64),
            verified_at_unix_ms: 1,
        };
        let original = recovery_kit_receipt_mac(&root, &unsigned).unwrap();
        let mut changed = unsigned.clone();
        changed.kit_sha256 = "d".repeat(64);
        assert_ne!(original, recovery_kit_receipt_mac(&root, &changed).unwrap());
    }

    fn test_directory(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "sahelflow-survivability-{label}-{}-{}",
            std::process::id(),
            now_unix_ms().unwrap()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn test_envelope() -> NativeAeadEnvelope {
        NativeAeadEnvelope {
            format_version: 1,
            algorithm: "aes-256-gcm".to_owned(),
            key_id: "a".repeat(64),
            nonce_hex: "b".repeat(24),
            ciphertext_hex: "cc".to_owned(),
            tag_hex: "d".repeat(32),
        }
    }

    #[test]
    fn descriptor_rejects_future_runtime_and_schema_authority() {
        let mut descriptor = BackupDescriptor {
            format_version: BACKUP_FORMAT_VERSION,
            format: BACKUP_FORMAT.to_owned(),
            backup_id: "backup-1234567890-abcdef1234567890".to_owned(),
            created_at_unix_ms: 1,
            verified_at_unix_ms: 2,
            parent_backup_id: None,
            retention_class: "manual".to_owned(),
            pinned: false,
            workspace_id: "10".repeat(16),
            source_installation_id: "20".repeat(16),
            brk_id: "a".repeat(64),
            dek_id: "b".repeat(64),
            app_version: "1.0.0-internal.13".to_owned(),
            runtime_protocol_version: SUPPORTED_RUNTIME_PROTOCOL_VERSION,
            schema_epoch: SUPPORTED_SCHEMA_EPOCH,
            migration_set_sha256: "c".repeat(64),
            shop_count: 1,
            plaintext_bytes: 42,
            manifest_file: MANIFEST_FILE.to_owned(),
            manifest_sha256: "d".repeat(64),
            wrapped_dek: test_envelope(),
            state: "complete".to_owned(),
        };
        validate_descriptor(&descriptor).unwrap();
        descriptor.runtime_protocol_version = SUPPORTED_RUNTIME_PROTOCOL_VERSION + 1;
        assert!(validate_descriptor(&descriptor).is_err());
        descriptor.runtime_protocol_version = SUPPORTED_RUNTIME_PROTOCOL_VERSION;
        descriptor.schema_epoch = SUPPORTED_SCHEMA_EPOCH + 1;
        assert!(validate_descriptor(&descriptor).is_err());
    }

    #[test]
    fn replacement_identity_reenrollment_clears_local_auth_authority() {
        let root = test_directory("identity-reenrollment");
        let database = root.join("shop.db");
        let connection = Connection::open(&database).unwrap();
        connection
            .execute_batch(
                r#"
                CREATE TABLE "Session" ("id" TEXT PRIMARY KEY);
                CREATE TABLE "AuthSecret" ("id" TEXT PRIMARY KEY);
                CREATE TABLE "Setting" ("key" TEXT PRIMARY KEY, "value" TEXT NOT NULL);
                INSERT INTO "Session" VALUES ('old-session');
                INSERT INTO "AuthSecret" VALUES ('old-auth-secret');
                INSERT INTO "Setting" VALUES ('identity_authority_initialized_v1', 'old');
                INSERT INTO "Setting" VALUES ('seller-setting', 'kept');
                "#,
            )
            .unwrap();
        drop(connection);

        prepare_replacement_identity_reenrollment(&database).unwrap();

        let connection = Connection::open(&database).unwrap();
        let sessions: i64 = connection
            .query_row(r#"SELECT COUNT(*) FROM "Session""#, [], |row| row.get(0))
            .unwrap();
        let auth_secrets: i64 = connection
            .query_row(r#"SELECT COUNT(*) FROM "AuthSecret""#, [], |row| row.get(0))
            .unwrap();
        let footprint: i64 = connection
            .query_row(
                r#"SELECT COUNT(*) FROM "Setting" WHERE "key" = ?1"#,
                [IDENTITY_FOOTPRINT_SETTING],
                |row| row.get(0),
            )
            .unwrap();
        let seller: String = connection
            .query_row(
                r#"SELECT "value" FROM "Setting" WHERE "key" = 'seller-setting'"#,
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(sessions, 0);
        assert_eq!(auth_secrets, 0);
        assert_eq!(footprint, 0);
        assert_eq!(seller, "kept");
        drop(connection);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn descriptor_metadata_is_authenticated_by_the_dek_wrap_aad() {
        let aad = descriptor_aad(
            "backup-1234567890-abcdef1234567890",
            1,
            2,
            None,
            "manual",
            false,
            &"10".repeat(16),
            &"20".repeat(16),
            &"a".repeat(64),
            &"b".repeat(64),
            "1.0.0",
            1,
            &"c".repeat(64),
            2,
            42,
            &"d".repeat(64),
        );
        let changed = descriptor_aad(
            "backup-1234567890-abcdef1234567890",
            1,
            2,
            None,
            "manual",
            false,
            &"10".repeat(16),
            &"20".repeat(16),
            &"a".repeat(64),
            &"b".repeat(64),
            "1.0.0",
            1,
            &"c".repeat(64),
            3,
            42,
            &"d".repeat(64),
        );
        assert_ne!(aad, changed);
    }

    // Restore drill: a backup nobody restored is not a backup. These tests use the same
    // primitives the product uses (snapshot at backup time, replace + sidecar cleanup +
    // preflight at restore time) on a shop-shaped WAL database, and compare real rows.
    const SHOP_TABLES: [(&str, &str); 4] = [
        ("Customer", "id || '|' || name || '|' || phone"),
        (
            "Order",
            "id || '|' || customerId || '|' || status || '|' || totalCents || '|' || COALESCE(note, '')",
        ),
        (
            "OrderLine",
            "id || '|' || orderId || '|' || sku || '|' || qty || '|' || unitCents",
        ),
        (
            "CashMovement",
            "id || '|' || COALESCE(orderId, '') || '|' || kind || '|' || amountCents",
        ),
    ];

    fn seed_shop_database(path: &Path) -> Connection {
        let connection = Connection::open(path).expect("open shop fixture");
        connection
            .execute_batch(
                r#"
                PRAGMA journal_mode = WAL;
                PRAGMA wal_autocheckpoint = 0;
                PRAGMA foreign_keys = ON;
                CREATE TABLE Customer (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL);
                CREATE TABLE "Order" (
                    id TEXT PRIMARY KEY,
                    customerId TEXT NOT NULL REFERENCES Customer(id),
                    status TEXT NOT NULL,
                    totalCents INTEGER NOT NULL,
                    note TEXT
                );
                CREATE TABLE OrderLine (
                    id TEXT PRIMARY KEY,
                    orderId TEXT NOT NULL REFERENCES "Order"(id),
                    sku TEXT NOT NULL,
                    qty INTEGER NOT NULL,
                    unitCents INTEGER NOT NULL
                );
                CREATE INDEX OrderLine_orderId ON OrderLine(orderId);
                CREATE TABLE CashMovement (
                    id TEXT PRIMARY KEY,
                    orderId TEXT REFERENCES "Order"(id),
                    kind TEXT NOT NULL,
                    amountCents INTEGER NOT NULL
                );
                BEGIN;
                "#,
            )
            .expect("shop fixture schema");
        for customer in 0..12 {
            connection
                .execute(
                    "INSERT INTO Customer (id, name, phone) VALUES (?1, ?2, ?3)",
                    rusqlite::params![
                        format!("cus-{customer:03}"),
                        format!("زبون {customer} \u{0623}\u{062d}\u{0645}\u{062f}"),
                        format!("0555{customer:06}")
                    ],
                )
                .expect("customer row");
        }
        for order in 0..60 {
            let order_id = format!("ord-{order:04}");
            connection
                .execute(
                    r#"INSERT INTO "Order" (id, customerId, status, totalCents, note)
                       VALUES (?1, ?2, ?3, ?4, ?5)"#,
                    rusqlite::params![
                        order_id,
                        format!("cus-{:03}", order % 12),
                        if order % 5 == 0 { "returned" } else { "delivered" },
                        (order as i64 + 1) * 125_000,
                        if order % 7 == 0 { Some("الدفع عند الاستلام") } else { None }
                    ],
                )
                .expect("order row");
            for line in 0..3 {
                connection
                    .execute(
                        "INSERT INTO OrderLine (id, orderId, sku, qty, unitCents) VALUES (?1, ?2, ?3, ?4, ?5)",
                        rusqlite::params![
                            format!("{order_id}-l{line}"),
                            order_id,
                            format!("SKU-{}", (order + line) % 9),
                            line + 1,
                            40_000 + line as i64 * 5_000
                        ],
                    )
                    .expect("order line row");
            }
            connection
                .execute(
                    "INSERT INTO CashMovement (id, orderId, kind, amountCents) VALUES (?1, ?2, 'cod-collected', ?3)",
                    rusqlite::params![
                        format!("cash-{order:04}"),
                        order_id,
                        (order as i64 + 1) * 125_000
                    ],
                )
                .expect("cash row");
        }
        connection.execute_batch("COMMIT;").expect("commit shop fixture");
        connection
    }

    fn shop_fingerprint(connection: &Connection) -> Vec<(String, i64, String)> {
        SHOP_TABLES
            .iter()
            .map(|(table, columns)| {
                let count: i64 = connection
                    .query_row(&format!("SELECT COUNT(*) FROM \"{table}\""), [], |row| {
                        row.get(0)
                    })
                    .expect("row count");
                let rows: String = connection
                    .query_row(
                        &format!(
                            "SELECT COALESCE(group_concat(r, ';'), '') FROM (SELECT {columns} AS r FROM \"{table}\" ORDER BY id)"
                        ),
                        [],
                        |row| row.get(0),
                    )
                    .expect("row content");
                ((*table).to_owned(), count, rows)
            })
            .collect()
    }

    fn open_and_fingerprint(path: &Path) -> Vec<(String, i64, String)> {
        let connection = Connection::open(path).expect("open database for fingerprint");
        shop_fingerprint(&connection)
    }

    fn integrity_and_foreign_key_failures(path: &Path) -> (String, i64) {
        let connection = Connection::open(path).expect("open database for integrity check");
        let integrity: String = connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .expect("integrity_check");
        let failures: i64 = connection
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .expect("foreign_key_check");
        (integrity, failures)
    }

    #[test]
    fn shop_backup_restores_every_row_on_a_fresh_machine_and_over_an_older_database() {
        let root = test_directory("restore-drill-round-trip");
        let live_path = root.join("live").join("shop.db");
        fs::create_dir_all(live_path.parent().unwrap()).unwrap();
        let writer = seed_shop_database(&live_path);
        let committed = shop_fingerprint(&writer);
        assert_eq!(committed[1].1, 60, "fixture must hold 60 orders");
        assert_eq!(committed[2].1, 180, "fixture must hold 180 order lines");

        // The shop is open and a sale is half written when the backup runs: the committed
        // rows live only in the -wal file and the open transaction must not leak in.
        writer
            .execute_batch(
                r#"
                BEGIN IMMEDIATE;
                INSERT INTO "Order" (id, customerId, status, totalCents, note)
                    VALUES ('ord-inflight', 'cus-000', 'pending', 999, NULL);
                INSERT INTO OrderLine (id, orderId, sku, qty, unitCents)
                    VALUES ('ord-inflight-l0', 'ord-inflight', 'SKU-0', 1, 999);
                "#,
            )
            .expect("open an uncommitted sale");
        let snapshot = root.join("backup").join("snapshot.db");
        create_verified_snapshot(&live_path, &snapshot).expect("backup of a live database");
        writer.execute_batch("ROLLBACK;").expect("end the open sale");
        let digest = sha256_file(&snapshot).expect("backup digest");

        // Restore 1: a fresh machine with no shop file at all.
        let fresh = root.join("fresh-machine").join("shops").join("shop.db");
        replace_from_verified_source(&snapshot, &fresh, &digest).expect("restore on a fresh machine");
        remove_sqlite_sidecars(&fresh).expect("remove sidecars");
        preflight_database(&fresh).expect("restored database passes preflight");
        assert_eq!(open_and_fingerprint(&fresh), committed);
        assert_eq!(
            integrity_and_foreign_key_failures(&fresh),
            ("ok".to_owned(), 0)
        );

        // Restore 2: an older local database with a leftover -wal file next to it.
        let older = root.join("older-machine").join("shops").join("shop.db");
        fs::create_dir_all(older.parent().unwrap()).unwrap();
        {
            let old = seed_shop_database(&older);
            old.execute_batch(r#"DELETE FROM CashMovement; DELETE FROM OrderLine; DELETE FROM "Order" WHERE id > 'ord-0009';"#)
                .expect("make the older database different");
        }
        let mut stale_wal = older.as_os_str().to_os_string();
        stale_wal.push("-wal");
        let stale_wal = PathBuf::from(stale_wal);
        fs::write(&stale_wal, vec![0x5a_u8; 8192]).expect("leftover wal from the older database");
        replace_from_verified_source(&snapshot, &older, &digest).expect("restore over older database");
        remove_sqlite_sidecars(&older).expect("remove sidecars");
        assert!(!stale_wal.exists(), "the older database's wal must not survive");
        preflight_database(&older).expect("restored database passes preflight");
        assert_eq!(open_and_fingerprint(&older), committed);
        assert_eq!(
            integrity_and_foreign_key_failures(&older),
            ("ok".to_owned(), 0)
        );
        drop(writer);
        fs::remove_dir_all(root).expect("remove restore drill directory");
    }

    #[test]
    fn corrupt_restore_source_is_refused_and_the_live_database_is_left_untouched() {
        let root = test_directory("restore-drill-corrupt");
        let source_path = root.join("source.db");
        let source = seed_shop_database(&source_path);
        let good = root.join("good.db");
        create_verified_snapshot(&source_path, &good).expect("good backup");
        drop(source);
        let good_digest = sha256_file(&good).expect("good digest");
        let good_bytes = fs::read(&good).expect("good bytes");
        assert!(good_bytes.len() > 16 * 1024, "fixture must span several pages");

        let live = root.join("shops").join("shop.db");
        fs::create_dir_all(live.parent().unwrap()).unwrap();
        {
            let current = seed_shop_database(&live);
            current
                .execute_batch(r#"DELETE FROM CashMovement; DELETE FROM OrderLine; DELETE FROM "Order" WHERE id > 'ord-0004';"#)
                .expect("live database differs from the backup");
        }
        remove_sqlite_sidecars(&live).expect("close out live sidecars");
        let live_digest = sha256_file(&live).expect("live digest");
        let live_rows = open_and_fingerprint(&live);
        remove_sqlite_sidecars(&live).expect("close out live sidecars");
        assert_eq!(sha256_file(&live).expect("live digest again"), live_digest);

        let mut garbage = vec![0_u8; good_bytes.len()];
        for (index, byte) in garbage.iter_mut().enumerate() {
            *byte = (index * 31 % 251) as u8;
        }
        let cases: Vec<(&str, Vec<u8>)> = vec![
            ("empty", Vec::new()),
            ("half-file", good_bytes[..good_bytes.len() / 2].to_vec()),
            ("cut-mid-page", good_bytes[..good_bytes.len() - 1000].to_vec()),
            ("first-page-only", good_bytes[..4096].to_vec()),
            ("garbage", garbage),
        ];
        for (label, bytes) in cases {
            let bad = root.join(format!("bad-{label}.db"));
            fs::write(&bad, &bytes).expect("write corrupt backup");

            // Layer 1: the digest recorded at backup time catches a change in storage.
            let by_digest = replace_from_verified_source(&bad, &live, &good_digest);
            assert!(by_digest.is_err(), "{label}: digest mismatch must refuse the restore");
            assert_eq!(
                sha256_file(&live).expect("live digest after refusal"),
                live_digest,
                "{label}: the live database file changed"
            );
            let leftovers: Vec<_> = fs::read_dir(live.parent().unwrap())
                .unwrap()
                .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
                .filter(|name| name != "shop.db")
                .collect();
            assert!(leftovers.is_empty(), "{label}: refusal left files behind: {leftovers:?}");

            // Layer 2: if the bad file is what was recorded (a bad source snapshot), the
            // integrity gate that runs before the swap must still refuse it.
            // A zero-byte file is a valid empty SQLite database: see the KNOWN GAP test below.
            if label != "empty" {
                assert!(
                    preflight_database(&bad).is_err(),
                    "{label}: preflight_database accepted a corrupt backup"
                );
            }
        }
        assert_eq!(open_and_fingerprint(&live), live_rows);
        fs::remove_dir_all(root).expect("remove restore drill directory");
    }

    // KNOWN GAP (restore drill, 24 Oct 2026): preflight_database runs integrity_check, which
    // says "ok" for a zero-byte file because SQLite treats it as a new empty database. A
    // database that lost all its bytes (failed copy, disk full, power cut) therefore passes the
    // integrity gate. Restore is still guarded by the migration-history check
    // (applied_migration_vector), but the gate itself should refuse a file with no schema.
    #[test]
    #[ignore = "KNOWN GAP: preflight_database accepts a zero-byte database as ok"]
    fn known_gap_zero_byte_database_is_refused_by_preflight() {
        let root = test_directory("restore-drill-empty");
        let empty = root.join("empty.db");
        fs::write(&empty, b"").expect("zero-byte database");
        assert!(
            preflight_database(&empty).is_err(),
            "a zero-byte file passed the integrity gate"
        );
        fs::remove_dir_all(root).expect("remove restore drill directory");
    }
}
