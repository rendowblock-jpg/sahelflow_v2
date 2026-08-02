#![allow(dead_code)]

#[path = "../src/shop_lifecycle.rs"]
mod shop_lifecycle;

include!("../src/shop_lifecycle_command.rs");

fn identity(character: char) -> String {
    std::iter::repeat(character).take(32).collect()
}

fn node_golden_authorization() -> ShopLifecycleAuthorization {
    ShopLifecycleAuthorization {
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
    }
}

#[test]
fn rust_matches_the_node_golden_lifecycle_ticket() {
    let authorization = node_golden_authorization();
    let root = [9_u8; 32];
    let mut command_key = lifecycle_command_key(&root);
    assert_eq!(
        hex_32(&command_key),
        "8d4879a0d557206d039e4fd083597886108bbf1fc5427487d4717d13643be423"
    );
    let message = authorization.mac_message();
    assert_eq!(message.len(), 569);
    let mac = hex_32(&hmac_sha256(&command_key, &message));
    command_key.fill(0);
    assert_eq!(
        mac,
        "68abd891f99707bf0ce89bc506db3f23dd72a9ad245cd1a1b86085af5588997b"
    );

    let command = ShopLifecycleCommand {
        authorization,
        mac,
    };
    assert_eq!(command.verify(&root, 1_001_000), Ok(()));
}
