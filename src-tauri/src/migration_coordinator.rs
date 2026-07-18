use fs2::FileExt;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, OpenOptions};
use std::io::{Error as IoError, ErrorKind, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

const REGISTRY_FILE: &str = "shop-registry.json";
const LEGACY_REGISTRY_FILE: &str = "app-meta.json";
const REGISTRY_FORMAT_VERSION: u8 = 1;
const JOURNAL_FORMAT_VERSION: u8 = 1;
const COMPATIBILITY_REPORT_FORMAT_VERSION: u8 = 1;

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
            .map(|(_, path)| fs::metadata(path).map(|meta| meta.len()))
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
        let snapshot_path =
            snapshot_dir.join(format!("{}-{}-pre-migration.db", timestamp, shop.id));
        create_verified_snapshot(database_path, &snapshot_path)?;
        let digest = sha256_file(&snapshot_path)?;
        journal.shops[index].snapshot_file = Some(
            snapshot_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
        );
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
            write_json_atomic(&journal_path, &journal)?;
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
        journal.shops[index].state = "migrated-verified".to_string();
        write_json_atomic(&journal_path, &journal)?;
    }

    create_shop_template(app_data_dir, &migrations, &migration_set_sha256)?;
    journal.state = "complete".to_string();
    write_json_atomic(&journal_path, &journal)?;
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
    if !journal_path.exists() {
        return Ok(());
    }

    let mut journal: MigrationJournal = read_json(journal_path)?;
    if journal.format_version != JOURNAL_FORMAT_VERSION {
        return Err(IoError::new(
            ErrorKind::InvalidData,
            "unsupported migration journal format",
        )
        .into());
    }

    if !matches!(
        journal.state.as_str(),
        "preflight" | "migrating" | "restoring"
    ) {
        return Ok(());
    }

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
        snapshots.push(VerifiedSnapshot {
            database_path: app_data_dir.join("shops").join(database_file),
            snapshot_path: snapshot_dir.join(snapshot_file),
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
    write_json_atomic(journal_path, &journal)
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
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());
    entries
        .into_iter()
        .map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
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
    for migration in migrations {
        hasher.update(migration.name.as_bytes());
        hasher.update(migration.checksum.as_bytes());
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
    let names = migrations
        .iter()
        .map(|migration| migration.name.as_str())
        .collect::<Vec<_>>();
    let position = |needle: &str| {
        names
            .iter()
            .position(|name| *name == needle)
            .map(|index| index + 1)
            .unwrap_or(0)
    };

    if !table_exists(connection, "Category")?
        || !table_exists(connection, "Order")?
        || !table_exists(connection, "Customer")?
    {
        return Ok(0);
    }
    let mut baseline = position("20260624000000_init");
    if table_exists(connection, "AuthSecret")?
        && column_exists(connection, "Order", "phoneBlindIndex")?
    {
        baseline = position("20260630000000_add_auth_search_blacklist");
    }
    if table_exists(connection, "OrderChange")? && table_exists(connection, "ExtractionMetric")? {
        baseline = position("20260704000000_phase4_drift_capture");
    }
    if table_exists(connection, "PhoneReputation")? && !table_exists(connection, "ReservationItem")?
    {
        baseline = position("20260706000000_session30_31_32_drift_capture");
    }
    if column_exists(connection, "Order", "sourceOrderId")?
        && !table_exists(connection, "PollingEvent")?
    {
        baseline = position("20260706000001_wave7_schema_medium");
    }
    if !table_exists(connection, "Notification")?
        && !table_exists(connection, "DailyAnalyticsReport")?
        && baseline >= position("20260706000001_wave7_schema_medium")
    {
        baseline = position("20260707000000_drop_orphaned_tables");
    }
    if column_is_required_with_false_default(connection, "Order", "codRemitted")? {
        baseline = position("20260712120919_fix_codremitted_null_default");
    }
    if column_exists(connection, "Automation", "dryRun")?
        && column_exists(connection, "Refund", "reversed")?
        && index_exists(connection, "Order_status_createdAt_deletedAt_idx")?
    {
        baseline = position("20260712180000_w2w3_data_safety_indexes");
    }
    Ok(baseline)
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
) -> Result<(), Box<dyn std::error::Error>> {
    if target.exists() {
        fs::remove_file(target)?;
    }
    let connection = Connection::open(source)?;
    connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    drop(connection);
    fs::copy(source, target)?;
    preflight_database(target)
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
        let staged = snapshot.database_path.with_extension("restore-staged.db");
        fs::copy(&snapshot.snapshot_path, &staged)?;
        preflight_database(&staged)?;
        if snapshot.database_path.exists() {
            fs::remove_file(&snapshot.database_path)?;
        }
        fs::rename(staged, &snapshot.database_path)?;
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
    if target.exists() {
        fs::remove_file(&target)?;
    }
    fs::rename(staged, &target)?;
    fs::write(marker, format!("{migration_set_sha256}\n"))?;
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
    let mut ids = std::collections::HashSet::new();
    let mut files = std::collections::HashSet::new();
    for shop in &registry.shops {
        if !ids.insert(&shop.id) || !files.insert(&shop.database_file) {
            return Err(
                IoError::new(ErrorKind::InvalidData, "shop registry contains duplicates").into(),
            );
        }
        let file = Path::new(&shop.database_file);
        if file.file_name().and_then(|name| name.to_str()) != Some(shop.database_file.as_str())
            || file.extension().and_then(|extension| extension.to_str()) != Some("db")
        {
            return Err(
                IoError::new(ErrorKind::InvalidData, "shop database identity is invalid").into(),
            );
        }
        if !app_data_dir.join("shops").join(file).is_file() {
            return Err(IoError::new(
                ErrorKind::NotFound,
                format!("database is missing for registered shop {}", shop.id),
            )
            .into());
        }
    }
    if !ids.contains(active) {
        return Err(IoError::new(ErrorKind::InvalidData, "active shop is not registered").into());
    }
    Ok(())
}

fn database_has_business_schema(connection: &Connection) -> rusqlite::Result<bool> {
    table_exists(connection, "Category")
}

fn table_exists(connection: &Connection, table: &str) -> rusqlite::Result<bool> {
    connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name=?1)",
        params![table],
        |row| row.get(0),
    )
}

fn index_exists(connection: &Connection, index: &str) -> rusqlite::Result<bool> {
    connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type='index' AND name=?1)",
        params![index],
        |row| row.get(0),
    )
}

fn column_exists(connection: &Connection, table: &str, column: &str) -> rusqlite::Result<bool> {
    let mut statement = connection.prepare(&format!(
        "PRAGMA table_info(\"{}\")",
        table.replace('"', "")
    ))?;
    let names = statement
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(names.iter().any(|name| name == column))
}

fn column_is_required_with_false_default(
    connection: &Connection,
    table: &str,
    column: &str,
) -> rusqlite::Result<bool> {
    let mut statement = connection.prepare(&format!(
        "PRAGMA table_info(\"{}\")",
        table.replace('"', "")
    ))?;
    let mut rows = statement.query([])?;
    while let Some(row) = rows.next()? {
        let name: String = row.get(1)?;
        if name == column {
            let not_null: i64 = row.get(3)?;
            let default_value: Option<String> = row.get(4)?;
            return Ok(
                not_null == 1 && matches!(default_value.as_deref(), Some("false") | Some("0"))
            );
        }
    }
    Ok(false)
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
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let temp = path.with_extension(format!("{}.tmp", random_hex(8)));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temp)?;
    serde_json::to_writer_pretty(&mut file, value)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    fs::rename(temp, path)?;
    Ok(())
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
        let before = sha256_file(&authority.database_path).expect("baseline digest");
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
        assert_eq!(
            sha256_file(&authority.database_path).expect("restored digest"),
            before
        );
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
}
