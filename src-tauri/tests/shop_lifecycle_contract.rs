#![allow(dead_code)]

#[path = "../src/shop_lifecycle.rs"]
mod shop_lifecycle;

#[path = "../src/shop_lifecycle_command.rs"]
mod shop_lifecycle_command;

use crate::{
    shop_lifecycle::{ShopLifecycleOperation, ShopLifecycleRequest},
    shop_lifecycle_command::{
        lifecycle_command_key, ShopLifecycleAuthorization, ShopLifecycleCommand,
        ShopLifecyclePayload,
    },
};

fn identity(character: char) -> String {
    std::iter::repeat(character).take(32).collect()
}

fn node_golden_command() -> ShopLifecycleCommand {
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
                actor_session_id: "session-exact".to_owned(),
                policy_version: 3,
                revocation_epoch: 1,
                entitlement_id: "license_001".to_owned(),
                entitlement_revision: 4,
                shop_slots: 5,
                migration_set_sha256: "a".repeat(64),
                current_shop_id: "current-shop".to_owned(),
                current_shop_incarnation_id: identity('7'),
                target_shop_id: Some("target-shop".to_owned()),
                target_shop_incarnation_id: Some(identity('8')),
                recent_owner_reauthentication: false,
            },
            payload: ShopLifecyclePayload::Switch,
        },
        mac: "68abd891f99707bf0ce89bc506db3f23dd72a9ad245cd1a1b86085af5588997b".to_owned(),
    }
}

#[test]
fn rust_matches_the_node_lifecycle_command_key() {
    let key = lifecycle_command_key(&[9_u8; 32]);
    assert_eq!(
        key,
        [
            0x8d, 0x48, 0x79, 0xa0, 0xd5, 0x57, 0x20, 0x6d, 0x03, 0x9e, 0x4f, 0xd0,
            0x83, 0x59, 0x78, 0x86, 0x10, 0x8b, 0xbf, 0x1f, 0xc5, 0x42, 0x74, 0x87,
            0xd4, 0x71, 0x7d, 0x13, 0x64, 0x3b, 0xe4, 0x23,
        ]
    );
}

#[test]
fn rust_accepts_the_node_golden_lifecycle_ticket() {
    assert_eq!(
        node_golden_command().verify(&[9_u8; 32], 1_001_000),
        Ok(())
    );
}
