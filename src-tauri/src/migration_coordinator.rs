use fs2::FileExt;
use rusqlite::{params, Connection, DatabaseName, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeSet, HashSet};
use std::fs::{self, OpenOptions};
use std::io::{Error as IoError, ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const REGISTRY_FILE: &str = "shop-registry.json";
const LEGACY_REGISTRY_FILE: &str = "app-meta.json";
const REGISTRY_FORMAT_VERSION: u8 = 1;
const JOURNAL_FORMAT_VERSION: u8 = 1;
const COMPATIBILITY_REPORT_FORMAT_VERSION: u8 = 1;
const MIGRATION_SET_HASH_DOMAIN: &[u8] = b"sahelflow-migration-set-v1\n";

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShopRecord {
    id: String,
    name: String,
    database_file: String,
    icon: Option<String>,
    created_at: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShopRegistry {
    format_version: u8,
    revision: u64,
    installation_id: String,
    active_shop_id: Option<String>,
    shops: Vec<ShopRecord>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyShop {
    id: String,
    name: String,
    db_path: String,
    icon: Option<String>,
    created_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyRegistry {
    active_shop_id: Option<String>,
    shops: Vec<LegacyShop>,
}

struct Migration {
    name: String,
    checksum: String,
    sql: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationJournal {
    format_version: u8,
    state: String,
    migration_set_sha256: String,
    started_at_unix_seconds: u64,
    shops: Vec<ShopJournal>,
    failure: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShopJournal {
    shop_id: String,
    database_file: String,
    snapshot_file: Option<String>,
    snapshot_sha256: Option<String>,
    state: String,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct MigrationCompatibilityReport {
    format_version: u8,
    state: String,
    migration_set_sha256: String,
    generated_at_unix_seconds: u64,
    packaged_migration_count: usize,
    required_snapshot_bytes: u64,
    available_snapshot_bytes: Option<u64>,
    shops: Vec<ShopCompatibility>,
    failure: Option<String>,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShopCompatibility {
    shop_id: String,
    database_file: String,
    state: String,
    applied_migration_count: usize,
    pending_migration_count: usize,
    legacy_baseline_inferred: bool,
    failure: Option<String>,
}

struct DatabaseCompatibility {
    applied_migration_count: usize,
    pending_migration_count: usize,
    legacy_baseline_inferred: bool,
}

#[derive(Debug, Eq, Ord, PartialEq, PartialOrd)]
struct IndexColumnFingerprint {
    sequence: i64,
    column_id: i64,
    name: Option<String>,
    descending: i64,
    collation: Option<String>,
    key: i64,
}

#[derive(Debug, Eq, Ord, PartialEq, PartialOrd)]
enum SchemaItem {
    Table {
        name: String,
        object_type: String,
        column_count: i64,
        without_rowid: i64,
        strict: i64,
        sql: Option<String>,
    },
    Column {
        table: String,
        position: i64,
        name: String,
        data_type: String,
        not_null: i64,
        default_value: Option<String>,
        primary_key: i64,
        hidden: i64,
    },
    Index {
        table: String,
        name: String,
        unique: i64,
        origin: String,
        partial: i64,
        sql: Option<String>,
        columns: Vec<IndexColumnFingerprint>,
    },
    ForeignKey {
        table: String,
        id: i64,
        sequence: i64,
        target_table: String,
        from_column: String,
        to_column: Option<String>,
        on_update: String,
        on_delete: String,
        match_clause: String,
    },
    SchemaObject {
        object_type: String,
        name: String,
        table: String,
        sql: Option<String>,
    },
}

#[derive(Clone, Debug)]
pub struct ActiveShopAuthority {
    pub shop_id: String,
    pub database_path: PathBuf,
    pub registry_revision: u64,
    pub migration_set_sha256: String,
}

struct VerifiedSnapshot {
    database_path: PathBuf,
    snapshot_path: PathBuf,
    sha256: String,
}

pub fn prepare_installation(
    app_data_dir: &Path,
    resource_dir: &Path,
) -> Result<ActiveShopAuthority, Box<dyn std::error::Error>> {
    prepare_installation_with_available_space(app_data_dir, resource_dir, |path| {
        fs2::available_space(path)
    })
}

fn prepare_installation_with_available_space<F>(
    app_data_dir: &Path,
    resource_dir: &Path,
    available_space: F,
) -> Result<ActiveShopAuthority, Box<dyn std::error::Error>>
where
    F: Fn(&Path) -> Result<u64, IoError>,
{
    fs::create_dir_all(app_data_dir.join("shops"))?;
    let lock_path = app_data_dir.join("migration.lock");
    let _lock = FileLock::acquire(&lock_path)?;
    let journal_dir = app_data_dir.join("migration-journal");
    let snapshot_dir = app_data_dir.join("migration-snapshots");
    fs::create_dir_all(&journal_dir)?;
    fs::create_dir_all(&snapshot_dir)?;
    // Reject redirected storage roots before creating or opening any shop DB.
    validated_shops_root(app_data_dir)?;
    validated_snapshot_root(app_data_dir, &snapshot_dir)?;
    let journal_path = journal_dir.join("current.json");
    let compatibility_path = journal_dir.join("compatibility.json");
    recover_interrupted_migration(app_data_dir, &snapshot_dir, &journal_path)?;

    let migrations = load_migrations(&resource_dir.join("prisma/migrations"))?;
    if migrations.is_empty() {
        return Err(IoError::new(ErrorKind::NotFound, "no packaged migrations were found").into());
    }
    let migration_set_sha256 = migration_set_hash(&migrations);
    let mut registry = load_or_import_registry(app_data_dir)?;
    ensure_initial_shop(app_data_dir, &mut registry)?;
    validate_registry(app_data_dir, &registry)?;

    let timestamp = unix_seconds();
    // Seconds remain the seller/support-facing journal time, while a per-run
    // random identity prevents retained snapshot collisions when two upgrades
    // begin within the same second.
    let snapshot_run_id = random_hex(8);
    let mut pending = Vec::new();
    let mut compatibility_shops = Vec::new();
    let mut compatibility_failure = None;
    for shop in registry.shops.iter().cloned() {
        let path = app_data_dir.join("shops").join(&shop.database_file);
        match database_compatibility(&path, &migrations) {
            Ok(database) => {
                if database.pending_migration_count > 0 {
                    pending.push((shop.clone(), path));
                }
                compatibility_shops.push(ShopCompatibility {
                    shop_id: shop.id,
                    database_file: shop.database_file,
                    state: if database.pending_migration_count == 0 {
                        "current".to_string()
                    } else {
                        "migration-required".to_string()
                    },
                    applied_migration_count: database.applied_migration_count,
                    pending_migration_count: database.pending_migration_count,
                    legacy_baseline_inferred: database.legacy_baseline_inferred,
                    failure: None,
                });
            }
            Err(error) => {
                let failure = error.to_string();
                compatibility_failure.get_or_insert_with(|| {
                    format!("shop {} is not migration-compatible: {failure}", shop.id)
                });
                compatibility_shops.push(ShopCompatibility {
                    shop_id: shop.id,
                    database_file: shop.database_file,
                    state: "blocked".to_string(),
                    applied_migration_count: 0,
                    pending_migration_count: 0,
                    legacy_baseline_inferred: false,
                    failure: Some(failure),
                });
            }
        }
    }

    let required_bytes = if pending.is_empty() {
        0
    } else {
        pending
            .iter()
            .map(|(_, path)| snapshot_size_estimate(path))
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .sum::<u64>()
            .saturating_mul(2)
            .saturating_add(64 * 1024 * 1024)
    };
    let available_bytes = available_space(&snapshot_dir)?;
    let mut compatibility = MigrationCompatibilityReport {
        format_version: COMPATIBILITY_REPORT_FORMAT_VERSION,
        state: if pending.is_empty() {
            "current".to_string()
        } else {
            "migration-required".to_string()
        },
        migration_set_sha256: migration_set_sha256.clone(),
        generated_at_unix_seconds: timestamp,
        packaged_migration_count: migrations.len(),
        required_snapshot_bytes: required_bytes,
        available_snapshot_bytes: Some(available_bytes),
        shops: compatibility_shops,
        failure: compatibility_failure.clone(),
    };
    if let Some(failure) = compatibility_failure {
        compatibility.state = "blocked".to_string();
        write_json_atomic(&compatibility_path, &compatibility)?;
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "{failure}; compatibility report: {}",
                compatibility_path.display()
            ),
        )
        .into());
    }
    if available_bytes < required_bytes {
        let failure = format!(
            "insufficient free space for verified all-shop migration snapshots: required {required_bytes} bytes, available {available_bytes} bytes"
        );
        compatibility.state = "blocked".to_string();
        compatibility.failure = Some(failure.clone());
        write_json_atomic(&compatibility_path, &compatibility)?;
        return Err(IoError::other(format!(
            "{failure}; compatibility report: {}",
            compatibility_path.display()
        ))
        .into());
    }
    write_json_atomic(&compatibility_path, &compatibility)?;

    let mut journal = MigrationJournal {
        format_version: JOURNAL_FORMAT_VERSION,
        state: "preflight".to_string(),
        migration_set_sha256: migration_set_sha256.clone(),
        started_at_unix_seconds: timestamp,
        shops: pending
            .iter()
            .map(|(shop, _)| ShopJournal {
                shop_id: shop.id.clone(),
                database_file: shop.database_file.clone(),
                snapshot_file: None,
                snapshot_sha256: None,
                state: "pending".to_string(),
            })
            .collect(),
        failure: None,
    };
    write_json_atomic(&journal_path, &journal)?;

    let mut snapshots = Vec::new();
    for (index, (shop, database_path)) in pending.iter().enumerate() {
        preflight_database(database_path)?;
        let snapshot_path = snapshot_dir.join(format!(
            "{}-{}-{}-pre-migration.db",
            timestamp, snapshot_run_id, shop.id
        ));
        let digest = create_verified_snapshot(database_path, &snapshot_path)?;
        let snapshot_file = snapshot_path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| IoError::new(ErrorKind::InvalidData, "snapshot identity is invalid"))?;
        journal.shops[index].snapshot_file = Some(snapshot_file.to_string());
        journal.shops[index].snapshot_sha256 = Some(digest);
        journal.shops[index].state = "snapshot-verified".to_string();
        snapshots.push(VerifiedSnapshot {
            database_path: database_path.clone(),
            snapshot_path,
            sha256: journal.shops[index]
                .snapshot_sha256
                .clone()
                .expect("snapshot digest was just recorded"),
        });
        write_json_atomic(&journal_path, &journal)?;
    }

    journal.state = "migrating".to_string();
    write_json_atomic(&journal_path, &journal)?;
    for (index, (_, database_path)) in pending.iter().enumerate() {
        if let Err(error) = migrate_database(database_path, &migrations) {
            journal.state = "restoring".to_string();
            journal.failure = Some(error.to_string());
            write_json_atomic(&journal_path, &journal)?;
            restore_all(&snapshots)?;
            journal.state = "failed-restored".to_string();
            for shop in &mut journal.shops {
                shop.state = "restored".to_string();
            }
            write_terminal_journal(&journal_path, &journal)?;
            compatibility.state = "blocked".to_string();
            compatibility.failure = Some(error.to_string());
            if let Some(shop) = compatibility
                .shops
                .iter_mut()
                .find(|shop| shop.shop_id == pending[index].0.id)
            {
                shop.state = "failed-restored".to_string();
                shop.failure = Some(error.to_string());
            }
            write_json_atomic(&compatibility_path, &compatibility)?;
            return Err(error);
        }
        preflight_database(database_path)?;
        sync_sqlite_database(database_path)?;
        journal.shops[index].state = "migrated-verified".to_string();
        write_json_atomic(&journal_path, &journal)?;
    }

    create_shop_template(app_data_dir, &migrations, &migration_set_sha256)?;
    journal.state = "complete".to_string();
    write_terminal_journal(&journal_path, &journal)?;
    compatibility.state = "complete".to_string();
    compatibility.failure = None;
    for shop in &mut compatibility.shops {
        shop.state = "current".to_string();
        shop.applied_migration_count = migrations.len();
        shop.pending_migration_count = 0;
        shop.legacy_baseline_inferred = false;
        shop.failure = None;
    }
    write_json_atomic(&compatibility_path, &compatibility)?;

    active_authority(app_data_dir, &migration_set_sha256)
}

fn recover_interrupted_migration(
    app_data_dir: &Path,
    snapshot_dir: &Path,
    journal_path: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let previous_path = previous_generation_path(journal_path);
    if !journal_path.exists() && !previous_path.exists() {
        return Ok(());
    }
    if !journal_path.exists() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "the current migration journal is missing while a retained prior generation exists at {}; automatic rollback is blocked",
                previous_path.display()
            ),
        )
        .into());
    }

    let mut journal: MigrationJournal = read_json(journal_path).map_err(|current_error| {
        let retained = read_json::<MigrationJournal>(&previous_path)
            .map(|previous| format!("retained prior state is {}", previous.state))
            .unwrap_or_else(|_| "no readable retained prior generation is available".to_string());
        IoError::new(
            ErrorKind::InvalidData,
            format!(
                "the current migration journal is unreadable ({current_error}); {retained}; automatic rollback from a prior generation is blocked"
            ),
        )
    })?;
    if journal.format_version != JOURNAL_FORMAT_VERSION {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "unsupported migration journal format",
        )
        .into());
    }

    match journal.state.as_str() {
        "complete" | "failed-restored" | "interrupted-restored" => return Ok(()),
        "preflight" | "migrating" | "restoring" => {}
        state => {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!("migration journal contains an unsupported state: {state}"),
            )
            .into())
        }
    }

    let shops_root = validated_shops_root(app_data_dir)?;
    let snapshot_root = validated_snapshot_root(app_data_dir, snapshot_dir)?;
    let mut identities = HashSet::new();
    let mut snapshots = Vec::new();
    for shop in &journal.shops {
        let Some(snapshot_file) = shop.snapshot_file.as_deref() else {
            if shop.state != "pending" {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    format!(
                        "interrupted migration lost the snapshot for shop {}",
                        shop.shop_id
                    ),
                )
                .into());
            }
            continue;
        };
        let Some(snapshot_sha256) = shop.snapshot_sha256.as_deref() else {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!(
                    "interrupted migration lost the snapshot digest for shop {}",
                    shop.shop_id
                ),
            )
            .into());
        };
        let database_file = safe_file_name(&shop.database_file, "shop database")?;
        let snapshot_file = safe_file_name(snapshot_file, "migration snapshot")?;
        if !valid_database_file(database_file) {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "interrupted migration contains an invalid shop database identity",
            )
            .into());
        }
        let identity = validated_database_identity(&shops_root, database_file)?;
        if !identities.insert(identity) {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "interrupted migration aliases one physical shop database",
            )
            .into());
        }
        snapshots.push(VerifiedSnapshot {
            database_path: shops_root.join(database_file),
            snapshot_path: validated_snapshot_path(&snapshot_root, snapshot_file)?,
            sha256: snapshot_sha256.to_string(),
        });
    }

    restore_all(&snapshots)?;
    journal.state = "interrupted-restored".to_string();
    journal.failure = Some(
        "the previous migration run was interrupted; verified snapshots were restored".to_string(),
    );
    for shop in &mut journal.shops {
        shop.state = if shop.snapshot_file.is_some() {
            "restored".to_string()
        } else {
            "unchanged".to_string()
        };
    }
    write_terminal_journal(journal_path, &journal)
}

fn safe_file_name<'a>(value: &'a str, label: &str) -> Result<&'a str, IoError> {
    let path = Path::new(value);
    if path.file_name().and_then(|name| name.to_str()) != Some(value) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("{label} identity is invalid"),
        ));
    }
    Ok(value)
}

pub fn active_authority(
    app_data_dir: &Path,
    migration_set_sha256: &str,
) -> Result<ActiveShopAuthority, Box<dyn std::error::Error>> {
    let registry: ShopRegistry = read_json(&app_data_dir.join(REGISTRY_FILE))?;
    validate_registry(app_data_dir, &registry)?;
    let active_id = registry
        .active_shop_id
        .as_ref()
        .ok_or_else(|| IoError::new(ErrorKind::InvalidData, "shop registry has no active shop"))?;
    let shop = registry
        .shops
        .iter()
        .find(|shop| &shop.id == active_id)
        .ok_or_else(|| IoError::new(ErrorKind::InvalidData, "active shop is not registered"))?;
    Ok(ActiveShopAuthority {
        shop_id: shop.id.clone(),
        database_path: app_data_dir.join("shops").join(&shop.database_file),
        registry_revision: registry.revision,
        migration_set_sha256: migration_set_sha256.to_string(),
    })
}

fn load_migrations(directory: &Path) -> Result<Vec<Migration>, Box<dyn std::error::Error>> {
    if !directory.is_dir() {
        return Err(IoError::new(
            ErrorKind::NotFound,
            format!("migration directory is missing at {}", directory.display()),
        )
        .into());
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
                IoError::new(ErrorKind::InvalidData, "migration name is not valid UTF-8")
            })?;
            if !name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
            {
                return Err(IoError::new(
                    ErrorKind::InvalidData,
                    format!("migration name has unsupported characters: {name}"),
                )
                .into());
            }
            let path = entry.path().join("migration.sql");
            let sql = fs::read_to_string(&path)?;
            let checksum = sha256_bytes(sql.as_bytes());
            Ok(Migration {
                name,
                checksum,
                sql,
            })
        })
        .collect()
}

fn migration_set_hash(migrations: &[Migration]) -> String {
    let mut hasher = Sha256::new();
    // Framed migration-set-v1 algorithm, shared with generate-evidence-manifest.ts:
    // domain line, then `<UTF-8 name byte length>:<name>\n64:<SQL SHA-256 hex>\n`.
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

fn database_compatibility(
    database_path: &Path,
    migrations: &[Migration],
) -> Result<DatabaseCompatibility, Box<dyn std::error::Error>> {
    preflight_database(database_path)?;
    let connection = Connection::open(database_path)?;
    let applied = applied_migrations(&connection)?;
    if applied.is_empty() && database_has_business_schema(&connection)? {
        let baseline = infer_legacy_baseline(&connection, migrations)?;
        if baseline == 0 {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "legacy database schema is not a recognized SahelFlow baseline",
            )
            .into());
        }
        return Ok(DatabaseCompatibility {
            applied_migration_count: baseline,
            pending_migration_count: migrations.len().saturating_sub(baseline),
            legacy_baseline_inferred: true,
        });
    }
    verify_applied_checksums(&applied, migrations)?;
    Ok(DatabaseCompatibility {
        applied_migration_count: applied.len(),
        pending_migration_count: migrations.len().saturating_sub(applied.len()),
        legacy_baseline_inferred: false,
    })
}

fn migrate_database(
    database_path: &Path,
    migrations: &[Migration],
) -> Result<(), Box<dyn std::error::Error>> {
    let connection = Connection::open(database_path)?;
    connection.busy_timeout(std::time::Duration::from_secs(10))?;
    ensure_migration_table(&connection)?;
    let mut applied = applied_migrations(&connection)?;
    if applied.is_empty() && database_has_business_schema(&connection)? {
        let baseline = infer_legacy_baseline(&connection, migrations)?;
        if baseline == 0 {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "legacy database schema is not a recognized SahelFlow baseline",
            )
            .into());
        }
        for migration in migrations.iter().take(baseline) {
            record_migration(&connection, migration)?;
        }
        applied = applied_migrations(&connection)?;
    }
    verify_applied_checksums(&applied, migrations)?;
    for migration in migrations.iter().skip(applied.len()) {
        connection.execute_batch(&migration.sql)?;
        record_migration(&connection, migration)?;
    }
    Ok(())
}

fn ensure_migration_table(connection: &Connection) -> rusqlite::Result<()> {
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
    )
}

fn record_migration(connection: &Connection, migration: &Migration) -> rusqlite::Result<()> {
    connection.execute(
        r#"INSERT INTO "_prisma_migrations"
        (id, checksum, finished_at, migration_name, started_at, applied_steps_count)
        VALUES (?1, ?2, CURRENT_TIMESTAMP, ?3, CURRENT_TIMESTAMP, 1)"#,
        params![random_hex(16), migration.checksum, migration.name],
    )?;
    Ok(())
}

fn applied_migrations(connection: &Connection) -> rusqlite::Result<Vec<(String, String)>> {
    if !table_exists(connection, "_prisma_migrations")? {
        return Ok(Vec::new());
    }
    let mut statement = connection.prepare(
        r#"SELECT migration_name, checksum FROM "_prisma_migrations"
           WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
           ORDER BY started_at, migration_name"#,
    )?;
    let migrations = statement
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect();
    migrations
}

fn verify_applied_checksums(
    applied: &[(String, String)],
    migrations: &[Migration],
) -> Result<(), Box<dyn std::error::Error>> {
    if applied.len() > migrations.len() {
        return Err(IoError::new(ErrorKind::InvalidData, "database has unknown migrations").into());
    }
    for ((name, checksum), expected) in applied.iter().zip(migrations) {
        if name != &expected.name || checksum != &expected.checksum {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!("migration history diverges at {name}"),
            )
            .into());
        }
    }
    Ok(())
}

fn infer_legacy_baseline(
    connection: &Connection,
    migrations: &[Migration],
) -> Result<usize, Box<dyn std::error::Error>> {
    let actual = schema_signature(connection)?;
    let expected = Connection::open_in_memory()?;
    for (index, migration) in migrations.iter().enumerate() {
        expected.execute_batch(&migration.sql)?;
        if schema_signature(&expected)? == actual {
            return Ok(index + 1);
        }
    }
    Ok(0)
}

fn preflight_database(path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if !path.is_file() {
        return Err(IoError::new(
            ErrorKind::NotFound,
            format!("shop database is missing at {}", path.display()),
        )
        .into());
    }
    let connection = Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "SQLite integrity check failed for {}: {integrity}",
                path.display()
            ),
        )
        .into());
    }
    let foreign_key_failure: Option<i64> = connection
        .query_row(
            "SELECT 1 FROM pragma_foreign_key_check LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if foreign_key_failure.is_some() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!("foreign key check failed for {}", path.display()),
        )
        .into());
    }
    Ok(())
}

fn create_verified_snapshot(
    source: &Path,
    target: &Path,
) -> Result<String, Box<dyn std::error::Error>> {
    if target.exists() {
        return Err(IoError::new(
            ErrorKind::AlreadyExists,
            format!("migration snapshot already exists at {}", target.display()),
        )
        .into());
    }
    let staged = target.with_extension(format!("{}.tmp", random_hex(8)));
    let source_connection = Connection::open_with_flags(
        source,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    source_connection.busy_timeout(std::time::Duration::from_secs(10))?;
    let backup_result = source_connection.backup(DatabaseName::Main, &staged, None);
    drop(source_connection);
    if let Err(error) = backup_result {
        let _ = fs::remove_file(&staged);
        return Err(error.into());
    }

    preflight_database(&staged)?;
    sync_file(&staged)?;
    replace_file_durable(&staged, target, false)?;
    preflight_database(target)?;
    sha256_file(target).map_err(Into::into)
}

fn restore_all(snapshots: &[VerifiedSnapshot]) -> Result<(), Box<dyn std::error::Error>> {
    for snapshot in snapshots {
        preflight_database(&snapshot.snapshot_path)?;
        if sha256_file(&snapshot.snapshot_path)? != snapshot.sha256 {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                format!(
                    "migration snapshot digest does not match for {}",
                    snapshot.database_path.display()
                ),
            )
            .into());
        }
        let mut destination = Connection::open(&snapshot.database_path)?;
        destination.busy_timeout(std::time::Duration::from_secs(10))?;
        destination.restore(
            DatabaseName::Main,
            &snapshot.snapshot_path,
            None::<fn(rusqlite::backup::Progress)>,
        )?;
        let checkpoint: (i64, i64, i64) =
            destination.query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })?;
        if checkpoint.0 != 0 {
            return Err(IoError::other(format!(
                "restored database WAL could not be checkpointed for {}",
                snapshot.database_path.display()
            ))
            .into());
        }
        drop(destination);
        sync_sqlite_database(&snapshot.database_path)?;
        preflight_database(&snapshot.database_path)?;
    }
    Ok(())
}

fn create_shop_template(
    app_data_dir: &Path,
    migrations: &[Migration],
    migration_set_sha256: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let system_dir = app_data_dir.join("system");
    fs::create_dir_all(&system_dir)?;
    let target = system_dir.join("shop-template.db");
    let marker = system_dir.join("shop-template.sha256");
    if target.exists()
        && marker.exists()
        && fs::read_to_string(&marker)?.trim() == migration_set_sha256
    {
        preflight_database(&target)?;
        return Ok(());
    }
    let staged = system_dir.join("shop-template.staged.db");
    if staged.exists() {
        fs::remove_file(&staged)?;
    }
    Connection::open(&staged)?;
    migrate_database(&staged, migrations)?;
    preflight_database(&staged)?;
    sync_sqlite_database(&staged)?;
    replace_file_durable(&staged, &target, false)?;
    write_bytes_atomic(&marker, format!("{migration_set_sha256}\n").as_bytes())?;
    Ok(())
}

fn load_or_import_registry(
    app_data_dir: &Path,
) -> Result<ShopRegistry, Box<dyn std::error::Error>> {
    let registry_path = app_data_dir.join(REGISTRY_FILE);
    if registry_path.exists() {
        return read_json(&registry_path);
    }
    let legacy_path = app_data_dir.join(LEGACY_REGISTRY_FILE);
    let registry = if legacy_path.exists() {
        let legacy: LegacyRegistry = read_json(&legacy_path)?;
        let shops = legacy
            .shops
            .into_iter()
            .map(|shop| {
                let database_file = Path::new(&shop.db_path)
                    .file_name()
                    .ok_or_else(|| {
                        IoError::new(ErrorKind::InvalidData, "legacy database path is invalid")
                    })?
                    .to_string_lossy()
                    .into_owned();
                Ok(ShopRecord {
                    id: shop.id,
                    name: shop.name,
                    database_file,
                    icon: shop.icon,
                    created_at: shop
                        .created_at
                        .unwrap_or_else(|| unix_seconds().to_string()),
                })
            })
            .collect::<Result<Vec<_>, IoError>>()?;
        ShopRegistry {
            format_version: REGISTRY_FORMAT_VERSION,
            revision: 1,
            installation_id: random_hex(16),
            active_shop_id: legacy
                .active_shop_id
                .or_else(|| shops.first().map(|shop| shop.id.clone())),
            shops,
        }
    } else {
        ShopRegistry {
            format_version: REGISTRY_FORMAT_VERSION,
            revision: 0,
            installation_id: random_hex(16),
            active_shop_id: None,
            shops: Vec::new(),
        }
    };
    write_json_atomic(&registry_path, &registry)?;
    Ok(registry)
}

fn ensure_initial_shop(
    app_data_dir: &Path,
    registry: &mut ShopRegistry,
) -> Result<(), Box<dyn std::error::Error>> {
    if !registry.shops.is_empty() {
        return Ok(());
    }
    let database_file = "dev.db".to_string();
    let database_path = app_data_dir.join("shops").join(&database_file);
    if !database_path.exists() {
        Connection::open(&database_path)?;
    }
    registry.shops.push(ShopRecord {
        id: "default".to_string(),
        name: "Ma Boutique".to_string(),
        database_file,
        icon: None,
        created_at: unix_seconds().to_string(),
    });
    registry.active_shop_id = Some("default".to_string());
    registry.revision += 1;
    write_json_atomic(&app_data_dir.join(REGISTRY_FILE), registry)?;
    Ok(())
}

fn validate_registry(
    app_data_dir: &Path,
    registry: &ShopRegistry,
) -> Result<(), Box<dyn std::error::Error>> {
    if registry.format_version != REGISTRY_FORMAT_VERSION {
        return Err(
            IoError::new(ErrorKind::InvalidData, "unsupported shop registry format").into(),
        );
    }
    if registry.revision == 0 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "a prepared shop registry must have a positive revision",
        )
        .into());
    }
    let active = registry
        .active_shop_id
        .as_ref()
        .ok_or_else(|| IoError::new(ErrorKind::InvalidData, "shop registry has no active shop"))?;
    let shops_root = validated_shops_root(app_data_dir)?;
    let mut ids = HashSet::new();
    let mut files = HashSet::new();
    let mut identities = HashSet::new();
    for shop in &registry.shops {
        if !valid_shop_id(&shop.id) {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "shop registry contains an invalid shop ID",
            )
            .into());
        }
        if !ids.insert(&shop.id) || !files.insert(&shop.database_file) {
            return Err(
                IoError::new(ErrorKind::InvalidData, "shop registry contains duplicates").into(),
            );
        }
        if !valid_database_file(&shop.database_file) {
            return Err(
                IoError::new(ErrorKind::InvalidData, "shop database identity is invalid").into(),
            );
        }
        let identity = validated_database_identity(&shops_root, &shop.database_file)?;
        if !identities.insert(identity) {
            return Err(IoError::new(
                ErrorKind::InvalidData,
                "shop registry aliases one physical database through multiple files",
            )
            .into());
        }
    }
    if !ids.contains(active) {
        return Err(IoError::new(ErrorKind::InvalidData, "active shop is not registered").into());
    }
    Ok(())
}

fn validated_shops_root(app_data_dir: &Path) -> Result<PathBuf, IoError> {
    let app_root = fs::canonicalize(app_data_dir)?;
    let shops_path = app_data_dir.join("shops");
    let metadata = fs::symlink_metadata(&shops_path)?;
    if path_is_link(&metadata) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "the canonical shops directory must not be a link or reparse point",
        ));
    }
    let shops_root = fs::canonicalize(&shops_path)?;
    if shops_root != app_root.join("shops") {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "the canonical shops directory resolves outside the application data root",
        ));
    }
    Ok(shops_root)
}

fn validated_snapshot_root(app_data_dir: &Path, snapshot_dir: &Path) -> Result<PathBuf, IoError> {
    let app_root = fs::canonicalize(app_data_dir)?;
    let metadata = fs::symlink_metadata(snapshot_dir)?;
    if path_is_link(&metadata) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "the migration snapshot directory must not be a link or reparse point",
        ));
    }
    let snapshot_root = fs::canonicalize(snapshot_dir)?;
    if snapshot_root != app_root.join("migration-snapshots") {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "the migration snapshot directory resolves outside the application data root",
        ));
    }
    Ok(snapshot_root)
}

fn validated_snapshot_path(snapshot_root: &Path, snapshot_file: &str) -> Result<PathBuf, IoError> {
    let path = snapshot_root.join(snapshot_file);
    let metadata = fs::symlink_metadata(&path)?;
    if path_is_link(&metadata) || !metadata.is_file() {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "migration snapshot is not a regular contained file: {}",
                path.display()
            ),
        ));
    }
    let resolved = fs::canonicalize(&path)?;
    if resolved.parent() != Some(snapshot_root) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "migration snapshot resolves outside its root: {}",
                path.display()
            ),
        ));
    }
    Ok(resolved)
}

fn validated_database_identity(
    shops_root: &Path,
    database_file: &str,
) -> Result<DatabaseFileIdentity, IoError> {
    let path = shops_root.join(database_file);
    let metadata = fs::symlink_metadata(&path).map_err(|error| {
        IoError::new(
            error.kind(),
            format!(
                "registered shop database is unavailable at {}: {error}",
                path.display()
            ),
        )
    })?;
    if path_is_link(&metadata) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "registered shop database must not be a link: {}",
                path.display()
            ),
        ));
    }
    if !metadata.is_file() {
        return Err(IoError::new(
            ErrorKind::NotFound,
            format!("registered shop database is not a file: {}", path.display()),
        ));
    }
    let resolved = fs::canonicalize(&path)?;
    if resolved.parent() != Some(shops_root) {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "registered shop database resolves outside the shops root: {}",
                path.display()
            ),
        ));
    }
    database_file_identity(&resolved)
}

fn path_is_link(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    false
}

#[cfg(windows)]
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct DatabaseFileIdentity {
    volume: u32,
    index: u64,
}

#[cfg(windows)]
fn database_file_identity(path: &Path) -> Result<DatabaseFileIdentity, IoError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, GetFileInformationByHandle, BY_HANDLE_FILE_INFORMATION, FILE_ATTRIBUTE_NORMAL,
        FILE_READ_ATTRIBUTES, FILE_SHARE_DELETE, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };

    let wide = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            FILE_READ_ATTRIBUTES,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            std::ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(IoError::last_os_error());
    }
    let mut information: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
    let queried = unsafe { GetFileInformationByHandle(handle, &mut information) };
    let error = (queried == 0).then(IoError::last_os_error);
    unsafe {
        CloseHandle(handle);
    }
    if let Some(error) = error {
        return Err(error);
    }
    if information.nNumberOfLinks != 1 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "registered shop database must not be hard-linked: {}",
                path.display()
            ),
        ));
    }
    Ok(DatabaseFileIdentity {
        volume: information.dwVolumeSerialNumber,
        index: ((information.nFileIndexHigh as u64) << 32) | information.nFileIndexLow as u64,
    })
}

#[cfg(unix)]
#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
struct DatabaseFileIdentity {
    device: u64,
    inode: u64,
}

#[cfg(unix)]
fn database_file_identity(path: &Path) -> Result<DatabaseFileIdentity, IoError> {
    use std::os::unix::fs::MetadataExt;
    let metadata = fs::metadata(path)?;
    if metadata.nlink() != 1 {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            format!(
                "registered shop database must not be hard-linked: {}",
                path.display()
            ),
        ));
    }
    Ok(DatabaseFileIdentity {
        device: metadata.dev(),
        inode: metadata.ino(),
    })
}

fn database_has_business_schema(connection: &Connection) -> rusqlite::Result<bool> {
    table_exists(connection, "Category")
}

fn valid_shop_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    (1..=64).contains(&bytes.len())
        && (bytes[0].is_ascii_lowercase() || bytes[0].is_ascii_digit())
        && bytes
            .iter()
            .skip(1)
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-')
}

fn valid_database_file(value: &str) -> bool {
    let Some(stem) = value.strip_suffix(".db") else {
        return false;
    };
    !stem.is_empty()
        && (stem.as_bytes()[0].is_ascii_lowercase() || stem.as_bytes()[0].is_ascii_digit())
        && stem
            .bytes()
            .skip(1)
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}

fn table_exists(connection: &Connection, table: &str) -> rusqlite::Result<bool> {
    connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
        params![table],
        |row| row.get(0),
    )
}

fn schema_signature(connection: &Connection) -> rusqlite::Result<BTreeSet<SchemaItem>> {
    let tables = connection
        .prepare(
            "SELECT name, sql FROM sqlite_master
             WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
               AND name <> '_prisma_migrations'
             ORDER BY name",
        )?
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut signature = BTreeSet::new();

    for (table, table_sql) in tables {
        let (object_type, column_count, without_rowid, strict) = connection.query_row(
            "SELECT type, ncol, wr, strict FROM pragma_table_list
             WHERE schema = 'main' AND name = ?1",
            params![table],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )?;
        signature.insert(SchemaItem::Table {
            name: table.clone(),
            object_type,
            column_count,
            without_rowid,
            strict,
            sql: table_sql,
        });
        let quoted_table = sqlite_identifier(&table);
        let columns = connection
            .prepare(&format!("PRAGMA table_xinfo({quoted_table})"))?
            .query_map([], |row| {
                Ok(SchemaItem::Column {
                    table: table.clone(),
                    position: row.get(0)?,
                    name: row.get(1)?,
                    data_type: row.get(2)?,
                    not_null: row.get(3)?,
                    default_value: row.get(4)?,
                    primary_key: row.get(5)?,
                    hidden: row.get(6)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        signature.extend(columns);

        let indexes = connection
            .prepare(&format!("PRAGMA index_list({quoted_table})"))?
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, i64>(4)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for (name, unique, origin, partial) in indexes {
            let columns = connection
                .prepare(&format!("PRAGMA index_xinfo({})", sqlite_identifier(&name)))?
                .query_map([], |row| {
                    Ok(IndexColumnFingerprint {
                        sequence: row.get(0)?,
                        column_id: row.get(1)?,
                        name: row.get(2)?,
                        descending: row.get(3)?,
                        collation: row.get(4)?,
                        key: row.get(5)?,
                    })
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            let index_sql = connection
                .query_row(
                    "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?1",
                    params![name],
                    |row| row.get::<_, Option<String>>(0),
                )
                .optional()?
                .flatten();
            signature.insert(SchemaItem::Index {
                table: table.clone(),
                name,
                unique,
                origin,
                partial,
                sql: index_sql,
                columns,
            });
        }

        let foreign_keys = connection
            .prepare(&format!("PRAGMA foreign_key_list({quoted_table})"))?
            .query_map([], |row| {
                Ok(SchemaItem::ForeignKey {
                    table: table.clone(),
                    id: row.get(0)?,
                    sequence: row.get(1)?,
                    target_table: row.get(2)?,
                    from_column: row.get(3)?,
                    to_column: row.get(4)?,
                    on_update: row.get(5)?,
                    on_delete: row.get(6)?,
                    match_clause: row.get(7)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        signature.extend(foreign_keys);
    }

    let objects = connection
        .prepare(
            "SELECT type, name, tbl_name, sql FROM sqlite_master
             WHERE type IN ('trigger', 'view') ORDER BY type, name",
        )?
        .query_map([], |row| {
            Ok(SchemaItem::SchemaObject {
                object_type: row.get(0)?,
                name: row.get(1)?,
                table: row.get(2)?,
                sql: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    signature.extend(objects);
    Ok(signature)
}

fn sqlite_identifier(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Result<T, Box<dyn std::error::Error>> {
    let mut file = fs::File::open(path)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    Ok(serde_json::from_slice(&bytes)?)
}

fn write_json_atomic<T: Serialize>(
    path: &Path,
    value: &T,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut bytes = serde_json::to_vec_pretty(value)?;
    bytes.push(b'\n');
    write_bytes_atomic(path, &bytes)
}

fn write_terminal_journal(
    path: &Path,
    journal: &MigrationJournal,
) -> Result<(), Box<dyn std::error::Error>> {
    write_terminal_journal_with(path, journal, write_json_atomic)
}

fn write_terminal_journal_with<F>(
    path: &Path,
    journal: &MigrationJournal,
    mut write: F,
) -> Result<(), Box<dyn std::error::Error>>
where
    F: FnMut(&Path, &MigrationJournal) -> Result<(), Box<dyn std::error::Error>>,
{
    // Two successful replacements leave both current and retained generations
    // terminal. A crash between them still leaves a readable terminal current.
    write(path, journal)?;
    write(path, journal)
}

fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), Box<dyn std::error::Error>> {
    write_bytes_atomic_with_replace(path, bytes, |temp, target| {
        replace_file_durable(temp, target, true)
    })
}

fn write_bytes_atomic_with_replace<F>(
    path: &Path,
    bytes: &[u8],
    replace: F,
) -> Result<(), Box<dyn std::error::Error>>
where
    F: FnOnce(&Path, &Path) -> Result<(), IoError>,
{
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temp = path.with_extension(format!("{}.tmp", random_hex(8)));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    if let Err(error) = replace(&temp, path) {
        let _ = fs::remove_file(&temp);
        return Err(error.into());
    }
    Ok(())
}

fn previous_generation_path(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(".previous");
    PathBuf::from(value)
}

#[cfg(windows)]
fn replace_file_durable(
    staged: &Path,
    target: &Path,
    retain_previous: bool,
) -> Result<(), IoError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, ReplaceFileW, MOVEFILE_WRITE_THROUGH,
    };

    if !target.exists() {
        let staged_wide = staged
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        let target_wide = target
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>();
        if unsafe {
            MoveFileExW(
                staged_wide.as_ptr(),
                target_wide.as_ptr(),
                MOVEFILE_WRITE_THROUGH,
            )
        } == 0
        {
            return Err(IoError::last_os_error());
        }
        sync_file(target)?;
        return sync_parent(target);
    }

    let previous = retain_previous.then(|| previous_generation_path(target));
    if let Some(path) = &previous {
        match fs::remove_file(path) {
            Ok(()) => {}
            Err(error) if error.kind() == ErrorKind::NotFound => {}
            Err(error) => return Err(error),
        }
    }
    let target_wide = target
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let staged_wide = staged
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let previous_wide = previous.as_ref().map(|path| {
        path.as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect::<Vec<_>>()
    });
    let previous_ptr = previous_wide
        .as_ref()
        .map_or(std::ptr::null(), |path| path.as_ptr());
    let replaced = unsafe {
        // REPLACEFILE_WRITE_THROUGH is documented as unsupported. The staged
        // file was flushed above; flush the resulting files after replacement.
        ReplaceFileW(
            target_wide.as_ptr(),
            staged_wide.as_ptr(),
            previous_ptr,
            0,
            std::ptr::null(),
            std::ptr::null(),
        )
    };
    if replaced == 0 {
        return Err(IoError::last_os_error());
    }
    sync_file(target)?;
    if let Some(previous) = previous {
        sync_file(&previous)?;
    }
    sync_parent(target)
}

#[cfg(not(windows))]
fn replace_file_durable(
    staged: &Path,
    target: &Path,
    _retain_previous: bool,
) -> Result<(), IoError> {
    fs::rename(staged, target)?;
    sync_file(target)?;
    sync_parent(target)
}

fn sync_file(path: &Path) -> Result<(), IoError> {
    OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)?
        .sync_all()
}

#[cfg(not(windows))]
fn sync_parent(path: &Path) -> Result<(), IoError> {
    let parent = path
        .parent()
        .ok_or_else(|| IoError::new(ErrorKind::InvalidInput, "path has no parent directory"))?;
    fs::File::open(parent)?.sync_all()
}

#[cfg(windows)]
fn sync_parent(_path: &Path) -> Result<(), IoError> {
    // Windows has no supported ReplaceFile write-through option or portable
    // directory flush here. File contents are flushed explicitly, but this
    // does not claim directory-metadata or arbitrary power-loss durability.
    Ok(())
}

fn sync_sqlite_database(path: &Path) -> Result<(), IoError> {
    sync_file(path)?;
    for suffix in ["-wal", "-journal"] {
        let mut sidecar = path.as_os_str().to_os_string();
        sidecar.push(suffix);
        let sidecar = PathBuf::from(sidecar);
        if sidecar.is_file() {
            sync_file(&sidecar)?;
        }
    }
    sync_parent(path)
}

fn snapshot_size_estimate(path: &Path) -> Result<u64, Box<dyn std::error::Error>> {
    let connection = Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;
    let page_count: u64 = connection.query_row("PRAGMA page_count", [], |row| row.get(0))?;
    let page_size: u64 = connection.query_row("PRAGMA page_size", [], |row| row.get(0))?;
    page_count
        .checked_mul(page_size)
        .ok_or_else(|| IoError::other("SQLite snapshot size estimate overflowed").into())
}

fn sha256_file(path: &Path) -> Result<String, IoError> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hex_digest(hasher.finalize().as_slice()))
}

fn sha256_bytes(bytes: &[u8]) -> String {
    hex_digest(Sha256::digest(bytes).as_slice())
}

fn hex_digest(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn random_hex(byte_count: usize) -> String {
    let mut bytes = vec![0_u8; byte_count];
    getrandom::getrandom(&mut bytes).expect("secure OS randomness is required");
    hex_digest(&bytes)
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

struct FileLock {
    file: fs::File,
}

impl FileLock {
    fn acquire(path: &Path) -> Result<Self, IoError> {
        let file = OpenOptions::new()
            .create(true)
            .truncate(false)
            .read(true)
            .write(true)
            .open(path)?;
        file.try_lock_exclusive().map_err(|error| {
            IoError::new(
                ErrorKind::WouldBlock,
                format!("another migration coordinator owns the installation lock: {error}"),
            )
        })?;
        Ok(Self { file })
    }
}

impl Drop for FileLock {
    fn drop(&mut self) {
        let _ = FileExt::unlock(&self.file);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "sahelflow-migration-{name}-{}-{}",
            std::process::id(),
            random_hex(8)
        ))
    }

    fn write_migration(resource_dir: &Path, name: &str, sql: &str) {
        let directory = resource_dir.join("prisma/migrations").join(name);
        fs::create_dir_all(&directory).expect("create migration directory");
        fs::write(directory.join("migration.sql"), sql).expect("write migration");
    }

    fn compatibility_report(app_data: &Path) -> MigrationCompatibilityReport {
        read_json(&app_data.join("migration-journal/compatibility.json"))
            .expect("read compatibility report")
    }

    fn applied_migration_count(database_path: &Path) -> usize {
        let connection = Connection::open(database_path).expect("open database");
        connection
            .query_row(
                r#"SELECT COUNT(*) FROM "_prisma_migrations"
                   WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"#,
                [],
                |row| row.get(0),
            )
            .expect("count applied migrations")
    }

    #[test]
    fn fresh_install_creates_migrated_shop_registry_and_template() {
        let root = test_root("fresh");
        let app_data = root.join("data");
        let resources = root.join("resources");
        write_migration(
            &resources,
            "001_init",
            "CREATE TABLE Business (id TEXT PRIMARY KEY);",
        );

        let authority =
            prepare_installation(&app_data, &resources).expect("prepare fresh installation");

        assert_eq!(authority.shop_id, "default");
        assert!(authority.database_path.is_file());
        assert!(app_data.join("shop-registry.json").is_file());
        assert!(app_data.join("system/shop-template.db").is_file());
        let connection = Connection::open(&authority.database_path).expect("open shop");
        assert!(table_exists(&connection, "Business").expect("business table"));
        assert!(table_exists(&connection, "_prisma_migrations").expect("migration table"));
        let report = compatibility_report(&app_data);
        assert_eq!(report.state, "complete");
        assert_eq!(report.shops.len(), 1);
        assert_eq!(report.shops[0].state, "current");
        assert_eq!(report.shops[0].pending_migration_count, 0);
        #[cfg(windows)]
        {
            let previous: MigrationJournal = read_json(&previous_generation_path(
                &app_data.join("migration-journal/current.json"),
            ))
            .expect("read retained terminal journal");
            assert_eq!(previous.state, "complete");
        }

        drop(connection);
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn insufficient_space_blocks_before_snapshot_and_writes_compatibility_report() {
        let root = test_root("low-disk");
        let app_data = root.join("data");
        let resources = root.join("resources");
        write_migration(
            &resources,
            "001_init",
            "CREATE TABLE Business (id TEXT PRIMARY KEY);",
        );

        let result = prepare_installation_with_available_space(&app_data, &resources, |_| Ok(0));

        let error = result
            .expect_err("low disk must block migration")
            .to_string();
        assert!(error.contains("insufficient free space"));
        assert!(error.contains("compatibility.json"));
        let report = compatibility_report(&app_data);
        assert_eq!(report.state, "blocked");
        assert_eq!(report.available_snapshot_bytes, Some(0));
        assert!(report.required_snapshot_bytes >= 64 * 1024 * 1024);
        assert_eq!(report.shops[0].state, "migration-required");
        assert!(!app_data.join("migration-journal/current.json").exists());
        assert_eq!(
            fs::read_dir(app_data.join("migration-snapshots"))
                .expect("read snapshots")
                .count(),
            0
        );
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn completed_migration_rerun_is_noop_even_when_snapshot_space_is_zero() {
        let root = test_root("rerun");
        let app_data = root.join("data");
        let resources = root.join("resources");
        write_migration(
            &resources,
            "001_init",
            "CREATE TABLE Business (id TEXT PRIMARY KEY, value TEXT NOT NULL);",
        );
        let authority = prepare_installation(&app_data, &resources).expect("prepare installation");
        let connection = Connection::open(&authority.database_path).expect("open shop");
        connection
            .execute(
                "INSERT INTO Business (id, value) VALUES ('seller', 'kept')",
                [],
            )
            .expect("insert seller data");
        drop(connection);
        let snapshot_count = fs::read_dir(app_data.join("migration-snapshots"))
            .expect("read snapshots")
            .count();

        prepare_installation_with_available_space(&app_data, &resources, |_| Ok(0))
            .expect("rerun current installation");

        assert_eq!(applied_migration_count(&authority.database_path), 1);
        let connection = Connection::open(&authority.database_path).expect("open rerun shop");
        let value: String = connection
            .query_row(
                "SELECT value FROM Business WHERE id = 'seller'",
                [],
                |row| row.get(0),
            )
            .expect("read seller data");
        assert_eq!(value, "kept");
        assert_eq!(
            fs::read_dir(app_data.join("migration-snapshots"))
                .expect("read snapshots after rerun")
                .count(),
            snapshot_count
        );
        let report = compatibility_report(&app_data);
        assert_eq!(report.state, "complete");
        assert_eq!(report.required_snapshot_bytes, 0);
        assert_eq!(report.available_snapshot_bytes, Some(0));
        drop(connection);
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn multi_shop_upgrade_migrates_every_database_and_preserves_rows() {
        let root = test_root("multi-shop");
        let app_data = root.join("data");
        let resources = root.join("resources");
        write_migration(
            &resources,
            "001_init",
            "CREATE TABLE Business (id TEXT PRIMARY KEY, value TEXT NOT NULL);",
        );
        let authority =
            prepare_installation(&app_data, &resources).expect("prepare baseline installation");
        let second_database = app_data.join("shops/second.db");
        fs::copy(app_data.join("system/shop-template.db"), &second_database)
            .expect("copy second shop database");
        for (path, id) in [
            (authority.database_path.as_path(), "default-row"),
            (second_database.as_path(), "second-row"),
        ] {
            let connection = Connection::open(path).expect("open shop database");
            connection
                .execute(
                    "INSERT INTO Business (id, value) VALUES (?1, 'preserved')",
                    params![id],
                )
                .expect("insert shop row");
        }
        let mut registry: ShopRegistry =
            read_json(&app_data.join(REGISTRY_FILE)).expect("read registry");
        registry.shops.push(ShopRecord {
            id: "second".to_string(),
            name: "Second Shop".to_string(),
            database_file: "second.db".to_string(),
            icon: None,
            created_at: unix_seconds().to_string(),
        });
        registry.revision += 1;
        write_json_atomic(&app_data.join(REGISTRY_FILE), &registry).expect("write registry");
        write_migration(
            &resources,
            "002_upgrade",
            "ALTER TABLE Business ADD COLUMN migrated INTEGER NOT NULL DEFAULT 1;",
        );

        prepare_installation(&app_data, &resources).expect("migrate both shops");

        for (path, id) in [
            (authority.database_path.as_path(), "default-row"),
            (second_database.as_path(), "second-row"),
        ] {
            assert_eq!(applied_migration_count(path), 2);
            let connection = Connection::open(path).expect("open migrated shop");
            let row: (String, i64) = connection
                .query_row(
                    "SELECT value, migrated FROM Business WHERE id = ?1",
                    params![id],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .expect("read migrated row");
            assert_eq!(row, ("preserved".to_string(), 1));
        }
        let report = compatibility_report(&app_data);
        assert_eq!(report.state, "complete");
        assert_eq!(report.shops.len(), 2);
        assert!(report.shops.iter().all(|shop| shop.state == "current"));
        let journal: MigrationJournal =
            read_json(&app_data.join("migration-journal/current.json")).expect("read journal");
        assert_eq!(journal.state, "complete");
        assert_eq!(journal.shops.len(), 2);
        assert!(journal
            .shops
            .iter()
            .all(|shop| shop.state == "migrated-verified"));
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn packaged_upgrade_preserves_supported_current_seller_rows() {
        let root = test_root("packaged-current-data");
        let app_data = root.join("data");
        let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("repository root")
            .to_path_buf();
        let migrations = load_migrations(&resources.join("prisma/migrations"))
            .expect("load packaged migrations");
        assert!(migrations.len() >= 2);
        fs::create_dir_all(app_data.join("shops")).expect("create shops directory");
        let database_path = app_data.join("shops/current.db");
        migrate_database(&database_path, &migrations[..migrations.len() - 1])
            .expect("prepare supported current database");
        let connection = Connection::open(&database_path).expect("open current database");
        connection
            .execute_batch(
                r#"
                INSERT INTO "Customer" ("id", "name", "phone", "updatedAt")
                VALUES ('customer-1', 'Seller Customer', 'encrypted-phone', CURRENT_TIMESTAMP);
                INSERT INTO "Order" (
                    "id", "orderNumber", "customerId", "totalPrice", "wilaya",
                    "commune", "address", "phone", "updatedAt", "codRemitted"
                ) VALUES (
                    'order-1', 'SF-1001', 'customer-1', 4200, '16',
                    'Alger Centre', 'Seller Address', 'encrypted-phone', CURRENT_TIMESTAMP, false
                );
                INSERT INTO "Automation" ("id", "name", "trigger", "action", "updatedAt")
                VALUES ('automation-1', 'Keep me', 'order.created', 'send_message', CURRENT_TIMESTAMP);
                INSERT INTO "Refund" ("id", "orderId", "amount", "method")
                VALUES ('refund-1', 'order-1', 500, 'cash');
                "#,
            )
            .expect("insert representative current seller rows");
        drop(connection);
        let registry = ShopRegistry {
            format_version: REGISTRY_FORMAT_VERSION,
            revision: 1,
            installation_id: random_hex(16),
            active_shop_id: Some("current".to_string()),
            shops: vec![ShopRecord {
                id: "current".to_string(),
                name: "Current Seller".to_string(),
                database_file: "current.db".to_string(),
                icon: None,
                created_at: unix_seconds().to_string(),
            }],
        };
        write_json_atomic(&app_data.join(REGISTRY_FILE), &registry).expect("write registry");

        prepare_installation(&app_data, &resources).expect("upgrade packaged current database");

        assert_eq!(applied_migration_count(&database_path), migrations.len());
        let connection = Connection::open(&database_path).expect("open upgraded database");
        let order: (String, i64) = connection
            .query_row(
                r#"SELECT "orderNumber", "totalPrice" FROM "Order" WHERE "id" = 'order-1'"#,
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read preserved order");
        assert_eq!(order, ("SF-1001".to_string(), 4200));
        let automation: (String, bool) = connection
            .query_row(
                r#"SELECT "name", "dryRun" FROM "Automation" WHERE "id" = 'automation-1'"#,
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read preserved automation");
        assert_eq!(automation, ("Keep me".to_string(), false));
        let refund: (i64, bool) = connection
            .query_row(
                r#"SELECT "amount", "reversed" FROM "Refund" WHERE "id" = 'refund-1'"#,
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read preserved refund");
        assert_eq!(refund, (500, false));
        preflight_database(&database_path).expect("verify upgraded database");
        drop(connection);
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn divergent_history_blocks_with_per_shop_compatibility_detail() {
        let root = test_root("compatibility-blocked");
        let app_data = root.join("data");
        let resources = root.join("resources");
        write_migration(
            &resources,
            "001_init",
            "CREATE TABLE Business (id TEXT PRIMARY KEY);",
        );
        let authority =
            prepare_installation(&app_data, &resources).expect("prepare baseline installation");
        let connection = Connection::open(&authority.database_path).expect("open shop");
        connection
            .execute(
                r#"UPDATE "_prisma_migrations" SET checksum = 'diverged'
                   WHERE migration_name = '001_init'"#,
                [],
            )
            .expect("diverge migration history");
        drop(connection);

        let result = prepare_installation(&app_data, &resources);

        let error = result
            .expect_err("divergent history must block")
            .to_string();
        assert!(error.contains("compatibility report"));
        let report = compatibility_report(&app_data);
        assert_eq!(report.state, "blocked");
        assert_eq!(report.shops[0].state, "blocked");
        assert!(report.shops[0]
            .failure
            .as_deref()
            .is_some_and(|failure| failure.contains("migration history diverges")));
        assert_eq!(applied_migration_count(&authority.database_path), 1);
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn legacy_import_starts_with_a_positive_registry_revision() {
        let root = test_root("legacy-registry");
        let app_data = root.join("data");
        let resources = root.join("resources");
        fs::create_dir_all(app_data.join("shops")).expect("create shops directory");
        Connection::open(app_data.join("shops/dev.db")).expect("create legacy database");
        fs::write(
            app_data.join(LEGACY_REGISTRY_FILE),
            r#"{
                "activeShopId": "default",
                "shops": [{
                    "id": "default",
                    "name": "Ma Boutique",
                    "dbPath": "data/shops/dev.db",
                    "icon": null,
                    "createdAt": "2026-01-01T00:00:00Z"
                }]
            }"#,
        )
        .expect("write legacy registry");
        write_migration(
            &resources,
            "001_init",
            "CREATE TABLE Business (id TEXT PRIMARY KEY);",
        );

        let authority =
            prepare_installation(&app_data, &resources).expect("import legacy installation");

        assert_eq!(authority.registry_revision, 1);
        let registry: ShopRegistry =
            read_json(&app_data.join(REGISTRY_FILE)).expect("read imported registry");
        assert_eq!(registry.revision, 1);
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn failed_migration_restores_the_original_database() {
        let root = test_root("restore");
        let app_data = root.join("data");
        let resources = root.join("resources");
        write_migration(
            &resources,
            "001_init",
            "CREATE TABLE Business (id TEXT PRIMARY KEY);",
        );
        let authority =
            prepare_installation(&app_data, &resources).expect("prepare baseline installation");
        write_migration(
            &resources,
            "002_broken",
            "CREATE TABLE Partial (id TEXT); INVALID SQL;",
        );

        let result = prepare_installation(&app_data, &resources);

        assert!(result.is_err());
        let connection = Connection::open(&authority.database_path).expect("open restored shop");
        assert!(table_exists(&connection, "Business").expect("business table"));
        assert!(!table_exists(&connection, "Partial").expect("partial table"));
        let journal: serde_json::Value =
            read_json(&app_data.join("migration-journal/current.json")).expect("journal");
        assert_eq!(journal["state"], "failed-restored");

        drop(connection);
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn corrupt_registry_blocks_without_creating_a_fallback_database() {
        let root = test_root("corrupt-registry");
        let app_data = root.join("data");
        let resources = root.join("resources");
        fs::create_dir_all(&app_data).expect("create app data");
        fs::write(app_data.join("shop-registry.json"), b"{broken").expect("write corrupt registry");
        write_migration(
            &resources,
            "001_init",
            "CREATE TABLE Business (id TEXT PRIMARY KEY);",
        );

        let result = prepare_installation(&app_data, &resources);

        assert!(result.is_err());
        assert!(!app_data.join("shops/dev.db").exists());
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn stale_lock_file_does_not_block_and_live_lock_does() {
        let root = test_root("lock");
        fs::create_dir_all(&root).expect("create test root");
        let lock_path = root.join("migration.lock");
        fs::write(&lock_path, b"stale sentinel").expect("write stale lock file");

        let first = FileLock::acquire(&lock_path).expect("acquire stale lock file");
        let concurrent = FileLock::acquire(&lock_path);
        assert!(concurrent.is_err());
        drop(first);
        let reacquired = FileLock::acquire(&lock_path).expect("reacquire released lock");
        drop(reacquired);

        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn interrupted_migration_restores_verified_snapshot_before_replanning() {
        let root = test_root("interrupted");
        let app_data = root.join("data");
        let resources = root.join("resources");
        write_migration(
            &resources,
            "001_init",
            "CREATE TABLE Business (id TEXT PRIMARY KEY);",
        );
        let authority =
            prepare_installation(&app_data, &resources).expect("prepare baseline installation");

        let snapshot_dir = app_data.join("migration-snapshots");
        let snapshot_path = snapshot_dir.join("interrupted-default.db");
        create_verified_snapshot(&authority.database_path, &snapshot_path)
            .expect("create interruption snapshot");
        let snapshot_digest = sha256_file(&snapshot_path).expect("snapshot digest");
        let connection = Connection::open(&authority.database_path).expect("open active database");
        connection
            .execute_batch("CREATE TABLE InterruptedPartial (id TEXT);")
            .expect("simulate partial migration");
        drop(connection);

        let journal = MigrationJournal {
            format_version: JOURNAL_FORMAT_VERSION,
            state: "migrating".to_string(),
            migration_set_sha256: "0".repeat(64),
            started_at_unix_seconds: unix_seconds(),
            shops: vec![ShopJournal {
                shop_id: authority.shop_id.clone(),
                database_file: authority
                    .database_path
                    .file_name()
                    .expect("database file")
                    .to_string_lossy()
                    .into_owned(),
                snapshot_file: Some(
                    snapshot_path
                        .file_name()
                        .expect("snapshot file")
                        .to_string_lossy()
                        .into_owned(),
                ),
                snapshot_sha256: Some(snapshot_digest),
                state: "snapshot-verified".to_string(),
            }],
            failure: None,
        };
        write_json_atomic(&app_data.join("migration-journal/current.json"), &journal)
            .expect("write interrupted journal");
        write_migration(
            &resources,
            "002_resume",
            "CREATE TABLE ResumedMigration (id TEXT PRIMARY KEY);",
        );

        prepare_installation(&app_data, &resources).expect("recover and resume migration");

        let recovered =
            Connection::open(&authority.database_path).expect("open recovered database");
        assert!(!table_exists(&recovered, "InterruptedPartial").expect("partial table lookup"));
        assert!(table_exists(&recovered, "ResumedMigration").expect("resumed table lookup"));
        drop(recovered);
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn snapshot_backup_includes_committed_wal_rows() {
        let root = test_root("wal-snapshot");
        fs::create_dir_all(&root).expect("create test root");
        let source = root.join("source.db");
        let snapshot = root.join("snapshot.db");
        let writer = Connection::open(&source).expect("open WAL source");
        writer
            .execute_batch(
                r#"
                PRAGMA journal_mode=WAL;
                PRAGMA wal_autocheckpoint=0;
                CREATE TABLE SellerData (id TEXT PRIMARY KEY, value TEXT NOT NULL);
                INSERT INTO SellerData (id, value) VALUES ('committed', 'from-wal');
                "#,
            )
            .expect("commit WAL row");
        let mut wal_path = source.as_os_str().to_os_string();
        wal_path.push("-wal");
        assert!(PathBuf::from(wal_path).is_file());

        let digest = create_verified_snapshot(&source, &snapshot).expect("create WAL snapshot");

        assert_eq!(digest, sha256_file(&snapshot).expect("snapshot digest"));
        let restored = Connection::open(&snapshot).expect("open snapshot");
        let value: String = restored
            .query_row(
                "SELECT value FROM SellerData WHERE id = 'committed'",
                [],
                |row| row.get(0),
            )
            .expect("read committed WAL row from snapshot");
        assert_eq!(value, "from-wal");
        drop(restored);
        drop(writer);
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn failed_atomic_replacement_keeps_the_prior_journal_readable() {
        let root = test_root("atomic-journal-failure");
        fs::create_dir_all(&root).expect("create test root");
        let path = root.join("current.json");
        write_bytes_atomic(&path, br#"{"generation":"prior"}"#).expect("write prior journal");

        let result = write_bytes_atomic_with_replace(
            &path,
            br#"{"generation":"next"}"#,
            |staged, target| {
                let prior: serde_json::Value = read_json(target).expect("read prior generation");
                let next: serde_json::Value = read_json(staged).expect("read staged generation");
                assert_eq!(prior["generation"], "prior");
                assert_eq!(next["generation"], "next");
                Err(IoError::other("injected failure before atomic replacement"))
            },
        );

        assert!(result.is_err());
        let current: serde_json::Value = read_json(&path).expect("prior journal remains readable");
        assert_eq!(current["generation"], "prior");
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[cfg(windows)]
    #[test]
    fn corrupt_completed_journal_never_restores_a_retained_migrating_generation() {
        let root = test_root("journal-terminal-corruption");
        let app_data = root.join("data");
        let snapshot_dir = app_data.join("migration-snapshots");
        let journal_dir = app_data.join("migration-journal");
        let shops_dir = app_data.join("shops");
        fs::create_dir_all(&snapshot_dir).expect("create snapshot directory");
        fs::create_dir_all(&journal_dir).expect("create journal directory");
        fs::create_dir_all(&shops_dir).expect("create shops directory");
        let path = journal_dir.join("current.json");
        let database_path = shops_dir.join("seller.db");
        let connection = Connection::open(&database_path).expect("create seller database");
        connection
            .execute_batch(
                "CREATE TABLE SellerData (id TEXT PRIMARY KEY); INSERT INTO SellerData VALUES ('before');",
            )
            .expect("create pre-migration data");
        drop(connection);
        let snapshot_path = snapshot_dir.join("seller-pre-migration.db");
        let snapshot_sha256 =
            create_verified_snapshot(&database_path, &snapshot_path).expect("create snapshot");

        let mut journal = MigrationJournal {
            format_version: JOURNAL_FORMAT_VERSION,
            state: "migrating".to_string(),
            migration_set_sha256: "0".repeat(64),
            started_at_unix_seconds: unix_seconds(),
            shops: vec![ShopJournal {
                shop_id: "seller".to_string(),
                database_file: "seller.db".to_string(),
                snapshot_file: Some("seller-pre-migration.db".to_string()),
                snapshot_sha256: Some(snapshot_sha256),
                state: "migrated-verified".to_string(),
            }],
            failure: None,
        };
        write_json_atomic(&path, &journal).expect("write migrating current generation");
        journal.state = "complete".to_string();
        let mut terminal_writes = 0;
        let interrupted_terminal_write =
            write_terminal_journal_with(&path, &journal, |path, journal| {
                terminal_writes += 1;
                if terminal_writes == 2 {
                    return Err(IoError::other(
                        "injected interruption before the second terminal replacement",
                    )
                    .into());
                }
                write_json_atomic(path, journal)
            });
        assert!(interrupted_terminal_write.is_err());
        assert_eq!(terminal_writes, 2);
        let current: MigrationJournal = read_json(&path).expect("read terminal current journal");
        let retained: MigrationJournal =
            read_json(&previous_generation_path(&path)).expect("read retained migrating journal");
        assert_eq!(current.state, "complete");
        assert_eq!(retained.state, "migrating");

        let connection = Connection::open(&database_path).expect("open completed database");
        connection
            .execute("INSERT INTO SellerData VALUES ('after-complete')", [])
            .expect("write data after completed migration");
        drop(connection);
        fs::write(&path, b"{broken").expect("write corrupt current journal");

        let error = recover_interrupted_migration(&app_data, &snapshot_dir, &path)
            .expect_err("corrupt current must block destructive prior-generation recovery")
            .to_string();
        assert!(error.contains("automatic rollback from a prior generation is blocked"));
        let connection = Connection::open(&database_path).expect("reopen completed database");
        let rows: i64 = connection
            .query_row("SELECT COUNT(*) FROM SellerData", [], |row| row.get(0))
            .expect("count preserved rows");
        assert_eq!(
            rows, 2,
            "post-completion seller data must not be rolled back"
        );

        drop(connection);
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[cfg(windows)]
    #[test]
    fn successful_windows_replacement_retains_the_prior_generation() {
        let root = test_root("atomic-journal-previous");
        fs::create_dir_all(&root).expect("create test root");
        let path = root.join("current.json");
        write_bytes_atomic(&path, br#"{"generation":"prior"}"#).expect("write prior journal");
        write_bytes_atomic(&path, br#"{"generation":"next"}"#).expect("replace journal");

        let current: serde_json::Value = read_json(&path).expect("read current journal");
        let previous: serde_json::Value =
            read_json(&previous_generation_path(&path)).expect("read retained prior journal");
        assert_eq!(current["generation"], "next");
        assert_eq!(previous["generation"], "prior");
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn legacy_inference_requires_an_exact_packaged_schema_prefix() {
        let migrations = vec![
            Migration {
                name: "001_init".to_string(),
                checksum: sha256_bytes(b"CREATE TABLE Base (id TEXT PRIMARY KEY);"),
                sql: "CREATE TABLE Base (id TEXT PRIMARY KEY);".to_string(),
            },
            Migration {
                name: "002_more".to_string(),
                checksum: sha256_bytes(b"ALTER TABLE Base ADD COLUMN value TEXT;"),
                sql: "ALTER TABLE Base ADD COLUMN value TEXT;".to_string(),
            },
        ];
        let exact = Connection::open_in_memory().expect("open exact legacy database");
        for migration in &migrations {
            exact
                .execute_batch(&migration.sql)
                .expect("apply legacy schema migration");
        }
        assert_eq!(
            infer_legacy_baseline(&exact, &migrations).expect("infer exact prefix"),
            2
        );

        let packaged_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .expect("repository root")
            .to_path_buf();
        let packaged = load_migrations(&packaged_root.join("prisma/migrations"))
            .expect("load packaged migrations");
        let sparse = Connection::open_in_memory().expect("open sparse legacy database");
        sparse
            .execute_batch(
                r#"
                CREATE TABLE Category (id TEXT PRIMARY KEY);
                CREATE TABLE Customer (id TEXT PRIMARY KEY);
                CREATE TABLE "Order" (
                    id TEXT PRIMARY KEY,
                    status TEXT,
                    createdAt DATETIME,
                    deletedAt DATETIME
                );
                CREATE TABLE Automation (dryRun BOOLEAN);
                CREATE TABLE Refund (reversed BOOLEAN);
                CREATE INDEX Order_status_createdAt_deletedAt_idx
                    ON "Order" (status, createdAt, deletedAt);
                "#,
            )
            .expect("create sparse drift schema");
        assert_eq!(
            infer_legacy_baseline(&sparse, &packaged).expect("inspect sparse drift"),
            0
        );
    }

    #[test]
    fn legacy_inference_fingerprints_constraints_indexes_views_and_triggers() {
        let sql = r#"
            CREATE TABLE Base (
                id TEXT PRIMARY KEY,
                value TEXT CHECK (length(value) > 0)
            );
            CREATE INDEX Base_value_idx
                ON Base(value COLLATE NOCASE DESC) WHERE value IS NOT NULL;
            CREATE VIEW Base_values AS SELECT value FROM Base WHERE value IS NOT NULL;
            CREATE TRIGGER Base_touch AFTER UPDATE ON Base
                BEGIN SELECT NEW.value; END;
        "#;
        let migrations = vec![Migration {
            name: "001_exact".to_string(),
            checksum: sha256_bytes(sql.as_bytes()),
            sql: sql.to_string(),
        }];
        let exact = Connection::open_in_memory().expect("open exact schema");
        exact.execute_batch(sql).expect("create exact schema");
        assert_eq!(
            infer_legacy_baseline(&exact, &migrations).expect("infer exact rich schema"),
            1
        );

        let divergent = Connection::open_in_memory().expect("open divergent schema");
        divergent
            .execute_batch(
                r#"
                CREATE TABLE Base (
                    id TEXT PRIMARY KEY,
                    value TEXT CHECK (length(value) >= 0)
                );
                CREATE INDEX Base_value_idx
                    ON Base(value COLLATE BINARY ASC) WHERE value <> '';
                CREATE VIEW Base_values AS SELECT value FROM Base;
                CREATE TRIGGER Base_touch AFTER UPDATE ON Base
                    BEGIN SELECT OLD.value; END;
                "#,
            )
            .expect("create structurally similar divergent schema");
        assert_eq!(
            infer_legacy_baseline(&divergent, &migrations).expect("inspect rich schema drift"),
            0
        );
    }

    #[test]
    fn legacy_inference_preserves_semantic_whitespace_inside_schema_sql() {
        let sql = "CREATE TABLE Category (id TEXT CHECK (id <> 'a  b'));";
        let migrations = vec![Migration {
            name: "001_exact".to_string(),
            checksum: sha256_bytes(sql.as_bytes()),
            sql: sql.to_string(),
        }];
        let divergent = Connection::open_in_memory().expect("open divergent schema");
        divergent
            .execute_batch("CREATE TABLE Category (id TEXT CHECK (id <> 'a b'));")
            .expect("create schema with a different literal");

        assert_eq!(
            infer_legacy_baseline(&divergent, &migrations).expect("inspect schema literal drift"),
            0
        );
    }

    #[test]
    fn registry_rejects_hard_linked_database_aliases() {
        let root = test_root("hard-link-alias");
        let app_data = root.join("data");
        let shops = app_data.join("shops");
        fs::create_dir_all(&shops).expect("create shops directory");
        Connection::open(shops.join("first.db")).expect("create first database");
        fs::hard_link(shops.join("first.db"), root.join("outside-alias.db"))
            .expect("create external hard-linked database alias");
        let registry = ShopRegistry {
            format_version: REGISTRY_FORMAT_VERSION,
            revision: 1,
            installation_id: random_hex(16),
            active_shop_id: Some("first".to_string()),
            shops: vec![ShopRecord {
                id: "first".to_string(),
                name: "First".to_string(),
                database_file: "first.db".to_string(),
                icon: None,
                created_at: unix_seconds().to_string(),
            }],
        };

        let error = validate_registry(&app_data, &registry)
            .expect_err("hard-linked databases must fail closed")
            .to_string();
        assert!(error.contains("hard-linked") || error.contains("aliases one physical"));
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn registry_rejects_database_links_outside_the_shops_root() {
        let root = test_root("outside-database-link");
        let app_data = root.join("data");
        let shops = app_data.join("shops");
        fs::create_dir_all(&shops).expect("create shops directory");
        let outside = root.join("outside.db");
        Connection::open(&outside).expect("create outside database");
        let linked = shops.join("linked.db");
        #[cfg(windows)]
        let link_result = std::os::windows::fs::symlink_file(&outside, &linked);
        #[cfg(unix)]
        let link_result = std::os::unix::fs::symlink(&outside, &linked);
        if let Err(error) = link_result {
            if error.kind() == ErrorKind::PermissionDenied || error.raw_os_error() == Some(1314) {
                fs::remove_dir_all(root).expect("remove test root");
                return;
            }
            panic!("create outside database link: {error}");
        }
        let registry = ShopRegistry {
            format_version: REGISTRY_FORMAT_VERSION,
            revision: 1,
            installation_id: random_hex(16),
            active_shop_id: Some("linked".to_string()),
            shops: vec![ShopRecord {
                id: "linked".to_string(),
                name: "Linked".to_string(),
                database_file: "linked.db".to_string(),
                icon: None,
                created_at: unix_seconds().to_string(),
            }],
        };

        let error = validate_registry(&app_data, &registry)
            .expect_err("database links must fail closed")
            .to_string();
        assert!(error.contains("must not be a link"));
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[cfg(windows)]
    #[test]
    fn registry_rejects_a_junction_as_the_shops_root() {
        let root = test_root("shops-junction");
        let app_data = root.join("data");
        let resources = root.join("resources");
        let shops = app_data.join("shops");
        let outside_shops = root.join("outside-shops");
        fs::create_dir_all(&app_data).expect("create app data directory");
        fs::create_dir_all(&outside_shops).expect("create outside shops directory");
        write_migration(
            &resources,
            "001_init",
            "CREATE TABLE Business (id TEXT PRIMARY KEY);",
        );
        let output = std::process::Command::new("cmd")
            .arg("/C")
            .arg("mklink")
            .arg("/J")
            .arg(&shops)
            .arg(&outside_shops)
            .output()
            .expect("invoke junction creation");
        assert!(
            output.status.success(),
            "create shops junction: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        let error = prepare_installation(&app_data, &resources)
            .expect_err("shops-root junction must fail closed")
            .to_string();
        assert!(error.contains("shops directory must not be a link or reparse point"));
        assert!(!outside_shops.join("dev.db").exists());
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn shop_id_validation_matches_the_typescript_registry_grammar() {
        assert!(valid_shop_id("a"));
        assert!(valid_shop_id("9-shop-2"));
        assert!(valid_shop_id(&"a".repeat(64)));
        assert!(!valid_shop_id(""));
        assert!(!valid_shop_id("Uppercase"));
        assert!(!valid_shop_id("shop_name"));
        assert!(!valid_shop_id("-shop"));
        assert!(!valid_shop_id(&"a".repeat(65)));

        assert!(valid_database_file("9-shop.db"));
        assert!(!valid_database_file("shop_name.db"));
        assert!(!valid_database_file("../shop.db"));
        assert!(!valid_database_file("SHOP.db"));
    }

    #[test]
    fn migration_set_hash_matches_the_shared_golden_vector() {
        let sql_1 = "CREATE TABLE t (id INTEGER);\n";
        let sql_2 = "ALTER TABLE t ADD COLUMN name TEXT;\n";
        let migrations = vec![
            Migration {
                name: "001_init".to_string(),
                checksum: sha256_bytes(sql_1.as_bytes()),
                sql: sql_1.to_string(),
            },
            Migration {
                name: "002_add_name".to_string(),
                checksum: sha256_bytes(sql_2.as_bytes()),
                sql: sql_2.to_string(),
            },
        ];

        assert_eq!(
            migration_set_hash(&migrations),
            "b3b8d5e292253c7a85f58ea1eef8e4df810ea4a6cb1ab88de66a581e0e0e2c21"
        );
    }
}
