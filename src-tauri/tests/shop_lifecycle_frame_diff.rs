#![allow(dead_code)]
// The probe includes the production module, whose internal unit tests precede
// this test-only frame inspection helper.
#![allow(clippy::items_after_test_module)]

#[path = "../src/shop_lifecycle.rs"]
mod shop_lifecycle;

mod protocol {
    include!("../src/shop_lifecycle_command.rs");

    pub fn framed_authorization(authorization: &ShopLifecycleAuthorization) -> Vec<u8> {
        authorization.mac_message()
    }
}

use crate::protocol::{framed_authorization, ShopLifecycleAuthorization, ShopLifecyclePayload};
use crate::shop_lifecycle::{ShopLifecycleOperation, ShopLifecycleRequest};

fn identity(character: char) -> String {
    std::iter::repeat(character).take(32).collect()
}

fn authorization() -> ShopLifecycleAuthorization {
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
            output.push(1);
            push_string(output, value);
        }
        None => output.push(0),
    }
}

fn expected_node_frame() -> Vec<u8> {
    let mut output = Vec::with_capacity(620);
    output.extend_from_slice(b"sahelflow.shop-lifecycle.command.v1");
    output.push(0);
    output.push(1);
    push_u64(&mut output, 1_000_000);
    push_u64(&mut output, 1_030_000);
    output.push(3);
    push_string(&mut output, &identity('1'));
    push_u64(&mut output, 7);
    push_string(&mut output, &identity('2'));
    push_string(&mut output, &identity('3'));
    push_string(&mut output, &identity('4'));
    push_string(&mut output, &identity('5'));
    push_string(&mut output, &identity('6'));
    push_string(&mut output, &"b".repeat(64));
    push_u64(&mut output, 3);
    push_u64(&mut output, 1);
    push_string(&mut output, "license_001");
    push_u64(&mut output, 4);
    push_u64(&mut output, 5);
    push_string(&mut output, &"a".repeat(64));
    push_string(&mut output, "current-shop");
    push_string(&mut output, &identity('7'));
    push_optional_string(&mut output, Some("target-shop"));
    push_optional_string(&mut output, Some(&identity('8')));
    output.push(0);
    output.push(3);
    output
}

#[test]
fn report_first_lifecycle_frame_divergence() {
    let rust = framed_authorization(&authorization());
    let node = expected_node_frame();
    assert_eq!(rust.len(), node.len());
    if rust != node {
        let index = rust
            .iter()
            .zip(&node)
            .position(|(actual, expected)| actual != expected)
            .expect("equal-length frames must differ at one byte");
        panic!(
            "first divergence at byte {index}: rust={} node={} rust-window={:?} node-window={:?}",
            rust[index],
            node[index],
            &rust[index.saturating_sub(8)..(index + 9).min(rust.len())],
            &node[index.saturating_sub(8)..(index + 9).min(node.len())],
        );
    }
}
