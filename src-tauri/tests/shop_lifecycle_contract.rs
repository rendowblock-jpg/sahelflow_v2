#[allow(dead_code)]
#[path = "../src/shop_lifecycle.rs"]
mod shop_lifecycle;

#[allow(dead_code)]
#[path = "../src/shop_lifecycle_command.rs"]
mod shop_lifecycle_command;

use shop_lifecycle::{ShopLifecycleOperation, ShopLifecycleRequest};
use shop_lifecycle_command::{
    ShopLifecycleAuthorization, ShopLifecycleCommand, ShopLifecyclePayload,
};

fn identity(character: char) -> String {
    std::iter::repeat(character).take(32).collect()
}

#[test]
fn rust_accepts_the_node_golden_lifecycle_ticket() {
    let command = ShopLifecycleCommand {
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
        mac: "68abd891f99707bf0ce89bc506db3f23dd72a9ad245cd1a1b86085af5588997b"
            .to_owned(),
    };

    assert_eq!(command.verify(&[9_u8; 32], 1_001_000), Ok(()));
}
