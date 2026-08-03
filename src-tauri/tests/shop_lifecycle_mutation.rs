#![allow(dead_code)]

#[path = "../src/installation_root_key.rs"]
mod installation_root_key;
#[path = "../src/migration_coordinator.rs"]
mod migration_coordinator;
#[path = "../src/shop_lifecycle.rs"]
mod shop_lifecycle;
#[path = "../src/shop_lifecycle_command.rs"]
mod shop_lifecycle_command;
#[path = "../src/shop_lifecycle_mutation.rs"]
mod shop_lifecycle_mutation;

use crate::shop_lifecycle::{ShopLifecycleOperation, ShopLifecycleRequest, ShopLifecycleStage};
use crate::shop_lifecycle_command::{
    AuthenticatedShopLifecycleJournal, ShopLifecycleAuthorization, ShopLifecycleCommand,
    ShopLifecyclePayload,
};
use crate::shop_lifecycle_mutation::{accept_mutation, recover_interrupted_lifecycle};
use rusqlite::Connection;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEMP_COUNTER: AtomicU64 = AtomicU64::new(1);
const ROOT: [u8; 32] = [9_u8; 32];
const MIGRATION_SET: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const COMMAND_KEY_DOMAIN: &[u8] = b"sahelflow.shop-lifecycle.command.key.v1";
const COMMAND_MAC_DOMAIN: &[u8] = b"sahelflow.shop-lifecycle.command.v1";

fn identity(character: char) -> String {
    std::iter::repeat(character).take(32).collect()
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

fn prepare_installation(label: &str) -> PathBuf {
    let root = temp_root(label);
    let shops = root.join("shops");
    fs::create_dir_all(&shops).expect("create shops directory");
    create_database(&shops.join("current-shop.db"));
    create_database(&shops.join("target-shop.db"));
    let registry = json!({
        "formatVersion": 2,
        "revision": 7,
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

fn signed_command(
    operation_id: String,
    operation: ShopLifecycleOperation,
    expected_registry_revision: u64,
    issued_at_unix_ms: u64,
    target: Option<(&str, String)>,
    payload: ShopLifecyclePayload,
) -> ShopLifecycleCommand {
    let authorization = ShopLifecycleAuthorization {
        format_version: 1,
        issued_at_unix_ms,
        expires_at_unix_ms: issued_at_unix_ms + 30_000,
        request: ShopLifecycleRequest {
            format_version: 1,
            operation_id,
            operation,
            expected_registry_revision,
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
            target_shop_id: target.as_ref().map(|(shop_id, _)| (*shop_id).to_owned()),
            target_shop_incarnation_id: target.map(|(_, incarnation_id)| incarnation_id),
            recent_owner_reauthentication: matches!(operation, ShopLifecycleOperation::Delete),
        },
        payload,
    };
    let mut key = hmac_sha256(&ROOT, COMMAND_KEY_DOMAIN);
    let mac = hex_digest(&hmac_sha256(&key, &command_message(&authorization)));
    key.fill(0);
    ShopLifecycleCommand { authorization, mac }
}

fn archive_command(operation_id: &str, issued_at_unix_ms: u64) -> ShopLifecycleCommand {
    signed_command(
        operation_id.to_owned(),
        ShopLifecycleOperation::Archive,
        7,
        issued_at_unix_ms,
        Some(("target-shop", identity('8'))),
        ShopLifecyclePayload::Archive,
    )
}

fn recover_command(
    operation_id: &str,
    archive_id: &str,
    issued_at_unix_ms: u64,
) -> ShopLifecycleCommand {
    signed_command(
        operation_id.to_owned(),
        ShopLifecycleOperation::Recover,
        8,
        issued_at_unix_ms,
        Some(("target-shop", identity('8'))),
        ShopLifecyclePayload::Recover {
            archive_id: archive_id.to_owned(),
        },
    )
}

fn command_message(authorization: &ShopLifecycleAuthorization) -> Vec<u8> {
    let mut output = Vec::with_capacity(512);
    output.extend_from_slice(COMMAND_MAC_DOMAIN);
    push_u8(&mut output, 0);
    push_u8(&mut output, authorization.format_version);
    push_u64(&mut output, authorization.issued_at_unix_ms);
    push_u64(&mut output, authorization.expires_at_unix_ms);
    frame_request(&mut output, &authorization.request);
    frame_payload(&mut output, &authorization.payload);
    output
}

fn frame_request(output: &mut Vec<u8>, request: &ShopLifecycleRequest) {
    push_u8(
        output,
        match request.operation {
            ShopLifecycleOperation::Create => 1,
            ShopLifecycleOperation::Rename => 2,
            ShopLifecycleOperation::Switch => 3,
            ShopLifecycleOperation::Archive => 4,
            ShopLifecycleOperation::Recover => 5,
            ShopLifecycleOperation::Delete => 6,
        },
    );
    push_string(output, &request.operation_id);
    push_u64(output, request.expected_registry_revision);
    push_string(output, &request.workspace_id);
    push_string(output, &request.installation_id);
    push_string(output, &request.actor_person_id);
    push_string(output, &request.actor_member_id);
    push_string(output, &request.actor_device_id);
    push_string(output, &request.actor_session_binding);
    push_u64(output, request.policy_version);
    push_u64(output, request.revocation_epoch);
    push_string(output, &request.entitlement_id);
    push_u64(output, request.entitlement_revision);
    push_u64(output, u64::from(request.shop_slots));
    push_string(output, &request.migration_set_sha256);
    push_string(output, &request.current_shop_id);
    push_string(output, &request.current_shop_incarnation_id);
    push_optional_string(output, request.target_shop_id.as_deref());
    push_optional_string(output, request.target_shop_incarnation_id.as_deref());
    push_u8(output, u8::from(request.recent_owner_reauthentication));
}

fn frame_payload(output: &mut Vec<u8>, payload: &ShopLifecyclePayload) {
    match payload {
        ShopLifecyclePayload::Create { name, icon } => {
            push_u8(output, 1);
            push_string(output, name);
            push_optional_string(output, icon.as_deref());
        }
        ShopLifecyclePayload::Rename { name } => {
            push_u8(output, 2);
            push_string(output, name);
        }
        ShopLifecyclePayload::Switch => push_u8(output, 3),
        ShopLifecyclePayload::Archive => push_u8(output, 4),
        ShopLifecyclePayload::Recover { archive_id } => {
            push_u8(output, 5);
            push_string(output, archive_id);
        }
        ShopLifecyclePayload::Delete {
            confirmation_shop_id,
            reauthenticated_at_unix_ms,
        } => {
            push_u8(output, 6);
            push_string(output, confirmation_shop_id);
            push_u64(output, *reauthenticated_at_unix_ms);
        }
    }
}

fn push_u8(output: &mut Vec<u8>, value: u8) {
    output.push(value);
}

fn push_u64(output: &mut Vec<u8>, value: u64) {
    output.extend_from_slice(&value.to_be_bytes());
}

fn push_string(output: &mut Vec<u8>, value: &str) {
    push_u64(output, value.len() as u64);
    output.extend_from_slice(value.as_bytes());
}

fn push_optional_string(output: &mut Vec<u8>, value: Option<&str>) {
    match value {
        Some(value) => {
            push_u8(output, 1);
            push_string(output, value);
        }
        None => push_u8(output, 0),
    }
}

fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    let mut block = [0_u8; 64];
    if key.len() > block.len() {
        block[..32].copy_from_slice(&Sha256::digest(key));
    } else {
        block[..key.len()].copy_from_slice(key);
    }
    let mut inner_pad = [0x36_u8; 64];
    let mut outer_pad = [0x5c_u8; 64];
    for index in 0..block.len() {
        inner_pad[index] ^= block[index];
        outer_pad[index] ^= block[index];
    }
    let mut inner = Sha256::new();
    inner.update(inner_pad);
    inner.update(message);
    let inner_digest = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(outer_pad);
    outer.update(inner_digest);
    let output = outer.finalize().into();
    block.fill(0);
    inner_pad.fill(0);
    outer_pad.fill(0);
    output
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

fn transition_to_committed(
    accepted: &mut shop_lifecycle_mutation::AcceptedMutation,
    base_time: u64,
) {
    accepted
        .transition(ShopLifecycleStage::Quiescing, base_time + 2)
        .expect("journal quiescing");
    accepted
        .transition(ShopLifecycleStage::RuntimeStopped, base_time + 3)
        .expect("journal stopped runtime");
    accepted.commit(base_time + 4).expect("commit mutation");
}

fn current_journal(root: &Path) -> AuthenticatedShopLifecycleJournal {
    serde_json::from_slice(
        &fs::read(root.join("shop-lifecycle-journal/current.json"))
            .expect("read current lifecycle journal"),
    )
    .expect("parse current lifecycle journal")
}

#[test]
fn committed_archive_recovery_removes_a_leftover_unregistered_database() {
    let root = prepare_installation("archive-interruption-cleanup");
    let archive_id = identity('1');
    let issued_at = 1_000_000;
    let mut accepted = accept_mutation(
        &root,
        Path::new("."),
        MIGRATION_SET,
        &archive_command(&archive_id, issued_at),
        &ROOT,
        issued_at + 1_000,
    )
    .expect("accept archive");
    transition_to_committed(&mut accepted, issued_at + 1_000);

    let archive_database = root
        .join("shop-archives")
        .join(&archive_id)
        .join("database.db");
    let live_database = root.join("shops/target-shop.db");
    assert!(!live_database.exists());
    fs::copy(&archive_database, &live_database).expect("recreate interrupted live database");
    drop(accepted);

    recover_interrupted_lifecycle(&root, MIGRATION_SET, &ROOT, issued_at + 2_000)
        .expect("reconcile committed archive");
    assert!(!live_database.exists());
    assert!(archive_database.is_file());
    let journal = current_journal(&root);
    journal
        .validate(&ROOT)
        .expect("authenticate recovered journal");
    assert_eq!(journal.journal.stage, ShopLifecycleStage::Completed);

    fs::remove_dir_all(root).expect("remove test installation");
}

#[test]
fn committed_recover_finishes_after_archive_cleanup_precedes_terminal_journal() {
    let root = prepare_installation("recover-interruption-cleanup");
    let archive_id = identity('1');
    let archive_issued_at = 1_000_000;
    let mut archived = accept_mutation(
        &root,
        Path::new("."),
        MIGRATION_SET,
        &archive_command(&archive_id, archive_issued_at),
        &ROOT,
        archive_issued_at + 1_000,
    )
    .expect("accept archive");
    transition_to_committed(&mut archived, archive_issued_at + 1_000);
    archived
        .transition(
            ShopLifecycleStage::RuntimeStarting,
            archive_issued_at + 1_007,
        )
        .expect("journal archive runtime start");
    archived
        .complete(archive_issued_at + 1_008)
        .expect("complete archive");
    drop(archived);

    let recover_id = identity('2');
    let recover_issued_at = 2_000_000;
    let mut recovered = accept_mutation(
        &root,
        Path::new("."),
        MIGRATION_SET,
        &recover_command(&recover_id, &archive_id, recover_issued_at),
        &ROOT,
        recover_issued_at + 1_000,
    )
    .expect("accept recover");
    transition_to_committed(&mut recovered, recover_issued_at + 1_000);
    recovered
        .transition(
            ShopLifecycleStage::RuntimeStarting,
            recover_issued_at + 1_007,
        )
        .expect("journal recovered runtime start");
    recovered
        .transition(ShopLifecycleStage::Ready, recover_issued_at + 1_008)
        .expect("journal recovered runtime ready");

    let archive_directory = root.join("shop-archives").join(&archive_id);
    fs::remove_dir_all(&archive_directory).expect("simulate completed archive cleanup");
    drop(recovered);

    recover_interrupted_lifecycle(&root, MIGRATION_SET, &ROOT, recover_issued_at + 2_000)
        .expect("finish committed recover without archive residue");
    assert!(root.join("shops/target-shop.db").is_file());
    assert!(!archive_directory.exists());
    let authority = migration_coordinator::active_authority(&root, MIGRATION_SET)
        .expect("resolve recovered authority");
    assert_eq!(authority.shop_id, "current-shop");
    assert_eq!(authority.registry_revision, 9);
    let journal = current_journal(&root);
    journal
        .validate(&ROOT)
        .expect("authenticate completed journal");
    assert_eq!(journal.journal.stage, ShopLifecycleStage::Completed);

    fs::remove_dir_all(root).expect("remove test installation");
}
