#![allow(dead_code)]

#[path = "../src/shop_lifecycle.rs"]
mod shop_lifecycle;

mod protocol {
    include!("../src/shop_lifecycle_command.rs");

    pub fn framed_authorization(
        authorization: &ShopLifecycleAuthorization,
    ) -> Vec<u8> {
        authorization.mac_message()
    }

    pub fn authorization_mac(
        installation_root: &[u8; 32],
        authorization: &ShopLifecycleAuthorization,
    ) -> String {
        let mut key = lifecycle_command_key(installation_root);
        let output = hex_32(&hmac_sha256(&key, &authorization.mac_message()));
        key.fill(0);
        output
    }
}

use crate::shop_lifecycle::{ShopLifecycleOperation, ShopLifecycleRequest};
use crate::protocol::{
    authorization_mac, framed_authorization, ShopLifecycleAuthorization,
    ShopLifecyclePayload,
};
use sha2::{Digest, Sha256};

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
            actor_session_binding: "b".repeat(64),
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
fn rust_framing_matches_the_node_protocol_digest() {
    let authorization = node_golden_authorization();
    let framed = framed_authorization(&authorization);
    assert_eq!(framed.len(), 620);
    assert_eq!(
        format!("{:x}", Sha256::digest(&framed)),
        "893fb38f88e190c51cdcdfa9e17b612beae54513c83dc62a2224355321411ba2"
    );
    assert_eq!(
        authorization_mac(&[9_u8; 32], &authorization),
        "511273bd842a6c5d5265c78e3f74c3f4b7d8f2ee12e37774129add287c640630"
    );
}
