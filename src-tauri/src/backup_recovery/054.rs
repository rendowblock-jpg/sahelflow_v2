

#[cfg(test)]
mod tests {
    use super::*;

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
        fs::create_dir_all(
            restore_rescue_root(&app_data).join(&journal.unsigned.rescue_directory),
        )
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
}
