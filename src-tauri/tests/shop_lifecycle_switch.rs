#![allow(dead_code)]

#[path = "../src/installation_root_key.rs"]
mod installation_root_key;
#[path = "../src/migration_coordinator.rs"]
mod migration_coordinator;
#[path = "../src/shop_lifecycle.rs"]
mod shop_lifecycle;
#[path = "../src/shop_lifecycle_command.rs"]
mod shop_lifecycle_command;
#[path = "../src/shop_lifecycle_switch.rs"]
mod shop_lifecycle_switch;

use crate::shop_lifecycle::{ShopLifecycleOperation, ShopLifecycleRequest, ShopLifecycleStage};
use crate::shop_lifecycle_command::{
    AuthenticatedShopLifecycleJournal, ShopLifecycleAuthorization, ShopLifecycleCommand,
    ShopLifecyclePayload,
};
use crate::shop_lifecycle_switch::{accept_switch, SwitchAuthorityError};
use rusqlite::Connection;
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(1);
const ROOT: [u8; 32] = [9_u8; 32];
const MIGRATION_SET: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

fn identity(character: char) -> String {
    std::iter::repeat(character).take(32).collect()
}

fn golden_command() -> ShopLifecycleCommand {
    ShopLifecycleCommand {
        authorization: ShopLifecycleAuthorization {
            format_version: 1,
            issued_at_unix_ms: 1_000_000,
            expires_at_unix_ms: 1_030_000,
            request: ShopLifecycleRequest {
                format_version: 1,
                operation_id: identity('1'),
                operation: ShopLifecycleOperation::Switch,
                expected_registry_revision: 7,
                workspace_id: identity('2'),
                installation_id: identity('3'),
                actor_person_id: identity('4'),
                actor_member_id: identity('5'),
                actor_device_id: identity('6'),
                actor_session_binding: "b".repeat(64),
                policy_version: 3,
                revocation_epoch: 1,
                entitlement_id: "license_001".to_owned(),
                entitlement_revision: 4,
                shop_slots: 5,
                migration_set_sha256: MIGRATION_SET.to_owned(),
                current_shop_id: "current-shop".to_owned(),
                current_shop_incarnation_id: identity('7'),
                target_shop_id: Some("target-shop".to_owned()),
                target_shop_incarnation_id: Some(identity('8')),
                recent_owner_reauthentication: false,
            },
            payload: ShopLifecyclePayload::Switch,
        },
        mac: "511273bd842a6c5d5265c78e3f74c3f4b7d8f2ee12e37774129add287c640630".to_owned(),
    }
}

fn temp_root(label: &str) -> PathBuf {
    let sequence = TEMP_COUNTER.fetch_add(1, Ordering::Relaxed);
    std::env::temp_dir().join(format!(
        "sahelflow-{label}-{}-{sequence}",
        std::process::id()
    ))
}

fn create_database(path: &Path) {
    let connection = Connection::open(path).expect("create test database");
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;\n             CREATE TABLE authority_probe (id INTEGER PRIMARY KEY);\n             INSERT INTO authority_probe(id) VALUES (1);",
        )
        .expect("initialize test database");
}

fn prepare_installation(label: &str, revision: u64) -> PathBuf {
    let root = temp_root(label);
    let shops = root.join("shops");
    fs::create_dir_all(&shops).expect("create shops directory");
    create_database(&shops.join("current-shop.db"));
    create_database(&shops.join("target-shop.db"));
    let registry = json!({
        "formatVersion": 2,
        "revision": revision,
        "workspaceId": identity('2'),
        "installationId": identity('3'),
        "activeShopId": "current-shop",
        "shops": [
            {
                "id": "current-shop",
                "incarnationId": identity('7'),
                "name": "Current",
                "databaseFile": "current-shop.db",
                "icon": null,
                "createdAt": "2026-08-02T00:00:00.000Z"
            },
            {
                "id": "target-shop",
                "incarnationId": identity('8'),
                "name": "Target",
                "databaseFile": "target-shop.db",
                "icon": null,
                "createdAt": "2026-08-02T00:00:00.000Z"
            }
        ]
    });
    fs::write(
        root.join("shop-registry.json"),
        format!(
            "{}\n",
            serde_json::to_string_pretty(&registry).expect("serialize registry")
        ),
    )
    .expect("write registry");
    root
}

#[test]
fn native_switch_commits_exact_target_and_terminal_authenticated_journal() {
    let root = prepare_installation("switch-commit", 7);
    let mut switch = accept_switch(&root, MIGRATION_SET, &golden_command(), &ROOT, 1_001_000)
        .expect("accept exact switch");
    switch
        .transition(ShopLifecycleStage::Quiescing, 1_001_002)
        .expect("journal quiescing");
    switch
        .transition(ShopLifecycleStage::RuntimeStopped, 1_001_003)
        .expect("journal stopped runtime");
    let committed = switch
        .commit_registry(1_001_004)
        .expect("commit target registry");
    assert_eq!(committed.previous_authority.shop_id, "current-shop");
    assert_eq!(committed.previous_authority.registry_revision, 7);
    assert_eq!(committed.target_authority.shop_id, "target-shop");
    assert_eq!(committed.target_authority.registry_revision, 8);

    switch
        .transition(ShopLifecycleStage::RuntimeStarting, 1_001_007)
        .expect("journal target startup");
    switch.complete(1_001_008).expect("complete switch");

    let authority = migration_coordinator::active_authority(&root, MIGRATION_SET)
        .expect("resolve committed target authority");
    assert_eq!(authority.shop_id, "target-shop");
    assert_eq!(authority.registry_revision, 8);
    let current: AuthenticatedShopLifecycleJournal = serde_json::from_slice(
        &fs::read(root.join("shop-lifecycle-journal/current.json")).expect("read current journal"),
    )
    .expect("parse current journal");
    current
        .validate(&ROOT)
        .expect("authenticate current journal");
    assert_eq!(current.journal.stage, ShopLifecycleStage::Completed);
    assert!(root
        .join("shop-lifecycle-journal")
        .join(format!("{}.json", identity('1')))
        .is_file());
    drop(switch);
    fs::remove_dir_all(root).expect("remove test installation");
}

#[test]
fn failed_target_can_compensate_to_prior_shop_with_monotonic_revision() {
    let root = prepare_installation("switch-compensate", 7);
    let mut switch = accept_switch(&root, MIGRATION_SET, &golden_command(), &ROOT, 1_001_000)
        .expect("accept exact switch");
    switch
        .transition(ShopLifecycleStage::Quiescing, 1_001_002)
        .expect("journal quiescing");
    switch
        .transition(ShopLifecycleStage::RuntimeStopped, 1_001_003)
        .expect("journal stopped runtime");
    switch
        .commit_registry(1_001_004)
        .expect("commit target registry");
    switch
        .transition(ShopLifecycleStage::RuntimeStarting, 1_001_007)
        .expect("journal target startup");
    let recovered = switch
        .compensate_registry(1_001_008, "TARGET_RUNTIME_FAILED")
        .expect("compensate registry");

    assert_eq!(recovered.shop_id, "current-shop");
    assert_eq!(recovered.registry_revision, 9);
    let current: AuthenticatedShopLifecycleJournal = serde_json::from_slice(
        &fs::read(root.join("shop-lifecycle-journal/current.json"))
            .expect("read recovered journal"),
    )
    .expect("parse recovered journal");
    current
        .validate(&ROOT)
        .expect("authenticate recovery journal");
    assert_eq!(current.journal.stage, ShopLifecycleStage::Recovered);
    drop(switch);
    fs::remove_dir_all(root).expect("remove test installation");
}

#[test]
fn incomplete_authenticated_journal_blocks_a_second_switch() {
    let root = prepare_installation("switch-incomplete", 7);
    let accepted = accept_switch(&root, MIGRATION_SET, &golden_command(), &ROOT, 1_001_000)
        .expect("accept first switch");
    drop(accepted);

    let error = match accept_switch(&root, MIGRATION_SET, &golden_command(), &ROOT, 1_001_000) {
        Ok(_) => panic!("incomplete journal must block a second switch"),
        Err(error) => error,
    };
    assert!(matches!(error, SwitchAuthorityError::IncompleteJournal(_)));
    fs::remove_dir_all(root).expect("remove test installation");
}

#[test]
fn stale_registry_revision_is_rejected_before_runtime_quiescence() {
    let root = prepare_installation("switch-stale", 8);
    let error = match accept_switch(&root, MIGRATION_SET, &golden_command(), &ROOT, 1_001_000) {
        Ok(_) => panic!("stale registry authority must be rejected"),
        Err(error) => error,
    };
    assert!(matches!(error, SwitchAuthorityError::AuthorityMismatch(_)));
    fs::remove_dir_all(root).expect("remove test installation");
}
