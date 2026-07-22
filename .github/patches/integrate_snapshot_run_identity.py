from pathlib import Path

root = Path(__file__).resolve().parents[2]
path = root / "src-tauri" / "src" / "migration_coordinator.rs"
source = path.read_text(encoding="utf-8")

old_timestamp = '''    let timestamp = unix_seconds();
    let mut pending = Vec::new();
'''
new_timestamp = '''    let timestamp = unix_seconds();
    // Seconds remain the seller/support-facing journal time, while a per-run
    // random identity prevents retained snapshot collisions when two upgrades
    // begin within the same second.
    let snapshot_run_id = random_hex(8);
    let mut pending = Vec::new();
'''
if source.count(old_timestamp) != 1:
    raise SystemExit("expected exactly one migration timestamp boundary")
source = source.replace(old_timestamp, new_timestamp)

old_snapshot = '''        let snapshot_path =
            snapshot_dir.join(format!("{}-{}-pre-migration.db", timestamp, shop.id));
'''
new_snapshot = '''        let snapshot_path = snapshot_dir.join(format!(
            "{}-{}-{}-pre-migration.db",
            timestamp, snapshot_run_id, shop.id
        ));
'''
if source.count(old_snapshot) != 1:
    raise SystemExit("expected exactly one migration snapshot path boundary")
source = source.replace(old_snapshot, new_snapshot)

path.write_text(source, encoding="utf-8")
