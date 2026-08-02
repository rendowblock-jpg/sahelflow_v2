use crate::shop_lifecycle::{
    ShopLifecycleContractError, ShopLifecycleJournal, ShopLifecycleOperation, ShopLifecycleRequest,
    ShopLifecycleStage,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;

const COMMAND_FORMAT_VERSION: u8 = 1;
const COMMAND_KEY_DOMAIN: &[u8] = b"sahelflow.shop-lifecycle.command.key.v1";
const COMMAND_MAC_DOMAIN: &[u8] = b"sahelflow.shop-lifecycle.command.v1";
const JOURNAL_KEY_DOMAIN: &[u8] = b"sahelflow.shop-lifecycle.journal.key.v1";
const JOURNAL_MAC_DOMAIN: &[u8] = b"sahelflow.shop-lifecycle.journal.v1";
const MAX_COMMAND_LIFETIME_MS: u64 = 60_000;
const COMMAND_CLOCK_SKEW_MS: u64 = 5_000;
const MAX_REAUTHENTICATION_AGE_MS: u64 = 10 * 60 * 1_000;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "operation", rename_all = "kebab-case")]
pub enum ShopLifecyclePayload {
    Create {
        name: String,
        icon: Option<String>,
    },
    Rename {
        name: String,
    },
    Switch,
    Archive,
    Recover {
        archive_id: String,
    },
    Delete {
        confirmation_shop_id: String,
        reauthenticated_at_unix_ms: u64,
    },
}

impl ShopLifecyclePayload {
    fn operation(&self) -> ShopLifecycleOperation {
        match self {
            Self::Create { .. } => ShopLifecycleOperation::Create,
            Self::Rename { .. } => ShopLifecycleOperation::Rename,
            Self::Switch => ShopLifecycleOperation::Switch,
            Self::Archive => ShopLifecycleOperation::Archive,
            Self::Recover { .. } => ShopLifecycleOperation::Recover,
            Self::Delete { .. } => ShopLifecycleOperation::Delete,
        }
    }

    fn validate(
        &self,
        request: &ShopLifecycleRequest,
        issued_at_unix_ms: u64,
    ) -> Result<(), ShopLifecycleCommandError> {
        if self.operation() != request.operation {
            return Err(ShopLifecycleCommandError::OperationMismatch);
        }
        match self {
            Self::Create { name, icon } => {
                validate_shop_name(name)?;
                validate_icon(icon.as_deref())
            }
            Self::Rename { name } => validate_shop_name(name),
            Self::Switch | Self::Archive => Ok(()),
            Self::Recover { archive_id } => {
                if valid_lower_hex(archive_id, 16) {
                    Ok(())
                } else {
                    Err(ShopLifecycleCommandError::InvalidArchiveId)
                }
            }
            Self::Delete {
                confirmation_shop_id,
                reauthenticated_at_unix_ms,
            } => {
                let target_shop_id = request
                    .target_shop_id
                    .as_deref()
                    .ok_or(ShopLifecycleCommandError::MissingTarget)?;
                if confirmation_shop_id != target_shop_id {
                    return Err(ShopLifecycleCommandError::DeleteConfirmationMismatch);
                }
                if *reauthenticated_at_unix_ms > issued_at_unix_ms {
                    return Err(ShopLifecycleCommandError::ReauthenticationInFuture);
                }
                if issued_at_unix_ms.saturating_sub(*reauthenticated_at_unix_ms)
                    > MAX_REAUTHENTICATION_AGE_MS
                {
                    return Err(ShopLifecycleCommandError::ReauthenticationStale);
                }
                Ok(())
            }
        }
    }

    fn frame(&self, output: &mut Vec<u8>) {
        match self {
            Self::Create { name, icon } => {
                push_u8(output, 1);
                push_string(output, name);
                push_optional_string(output, icon.as_deref());
            }
            Self::Rename { name } => {
                push_u8(output, 2);
                push_string(output, name);
            }
            Self::Switch => push_u8(output, 3),
            Self::Archive => push_u8(output, 4),
            Self::Recover { archive_id } => {
                push_u8(output, 5);
                push_string(output, archive_id);
            }
            Self::Delete {
                confirmation_shop_id,
                reauthenticated_at_unix_ms,
            } => {
                push_u8(output, 6);
                push_string(output, confirmation_shop_id);
                push_u64(output, *reauthenticated_at_unix_ms);
            }
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopLifecycleAuthorization {
    pub format_version: u8,
    pub issued_at_unix_ms: u64,
    pub expires_at_unix_ms: u64,
    pub request: ShopLifecycleRequest,
    pub payload: ShopLifecyclePayload,
}

impl ShopLifecycleAuthorization {
    pub fn validate(&self) -> Result<(), ShopLifecycleCommandError> {
        if self.format_version != COMMAND_FORMAT_VERSION {
            return Err(ShopLifecycleCommandError::UnsupportedFormat);
        }
        if self.issued_at_unix_ms == 0
            || self.expires_at_unix_ms <= self.issued_at_unix_ms
            || self
                .expires_at_unix_ms
                .saturating_sub(self.issued_at_unix_ms)
                > MAX_COMMAND_LIFETIME_MS
        {
            return Err(ShopLifecycleCommandError::InvalidCommandWindow);
        }
        self.request.validate()?;
        self.payload.validate(&self.request, self.issued_at_unix_ms)
    }

    fn mac_message(&self) -> Vec<u8> {
        let mut output = Vec::with_capacity(512);
        output.extend_from_slice(COMMAND_MAC_DOMAIN);
        push_u8(&mut output, 0);
        push_u8(&mut output, self.format_version);
        push_u64(&mut output, self.issued_at_unix_ms);
        push_u64(&mut output, self.expires_at_unix_ms);
        frame_request(&mut output, &self.request);
        self.payload.frame(&mut output);
        output
    }
}

#[derive(Clone, Debug, Deserialize, Eq,PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopLifecycleCommand {
    pub authorization: ShopLifecycleAuthorization,
    pub mac: String,
}

impl ShopLifecycleCommand {
    pub fn verify(
        &self,
        installation_root: &[u8; 32],
        now_unix_ms: u64,
    ) -> Result<(), ShopLifecycleCommandError> {
        self.authorization.validate()?;
        if self.authorization.issued_at_unix_ms > now_unix_ms.saturating_add(COMMAND_CLOCK_SKEW_MS)
        {
            return Err(ShopLifecycleCommandError::CommandNotYetValid);
        }
        if now_unix_ms > self.authorization.expires_at_unix_ms {
            return Err(ShopLifecycleCommandError::CommandExpired);
        }
        self.verify_mac(installation_root)
    }

    fn verify_mac(&self, installation_root: &[u8; 32]) -> Result<(), ShopLifecycleCommandError> {
        let mut command_key = lifecycle_command_key(installation_root);
        let result = verify_hex_mac(
            &self.mac,
            &command_key,
            &self.authorization.mac_message(),
            ShopLifecycleCommandError::InvalidMac,
        );
        command_key.fill(0);
        result
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthenticatedShopLifecycleJournal {
    pub authorization: ShopLifecycleAuthorization,
    pub command_mac: String,
    pub journal: ShopLifecycleJournal,
    pub journal_mac: String,
}

impl AuthenticatedShopLifecycleJournal {
    pub fn accept(
        command: &ShopLifecycleCommand,
        installation_root: &[u8; 32],
        now_unix_ms: u64,
    ) -> Result<Self, ShopLifecycleCommandError> {
        command.verify(installation_root, now_unix_ms)?;
        let journal =
            ShopLifecycleJournal::new(command.authorization.request.clone(), now_unix_ms)?;
        let journal_mac = journal_mac(installation_root, &command.mac, &journal);
        Ok(Self {
            authorization: command.authorization.clone(),
            command_mac: command.mac.clone(),
            journal,
            journal_mac,
        })
    }

    pub fn validate(&self, installation_root: &[u8; 32]) -> Result<(), ShopLifecycleCommandError> {
        self.authorization.validate()?;
        ShopLifecycleCommand {
            authorization: self.authorization.clone(),
            mac: self.command_mac.clone(),
        }
        .verify_mac(installation_root)?;
        if self.authorization.request != self.journal.request {
            return Err(ShopLifecycleCommandError::JournalRequestMismatch);
        }
        self.journal.validate()?;

        let mut journal_key = lifecycle_journal_key(installation_root);
        let result = verify_hex_mac(
            &self.journal_mac,
            &journal_key,
            &journal_message(&self.command_mac, &self.journal),
            ShopLifecycleCommandError::InvalidJournalMac,
        );
        journal_key.fill(0);
        result
    }

    pub fn transition(
        &mut self,
        installation_root: &[u8; 32],
        next: ShopLifecycleStage,
        now_unix_ms: u64,
        failure_code: Option<String>,
    ) -> Result<(), ShopLifecycleCommandError> {
        self.validate(installation_root)?;
        self.journal
            .transition(next, now_unix_ms, failure_code)
            .map_err(ShopLifecycleCommandError::from)?;
        self.journal_mac = journal_mac(installation_root, &self.command_mac, &self.journal);
        Ok(())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ShopLifecycleCommandError {
    Contract(ShopLifecycleContractError),
    UnsupportedFormat,
    InvalidCommandWindow,
    OperationMismatch,
    InvalidShopName,
    InvalidIcon,
    InvalidArchiveId,
    MissingTarget,
    DeleteConfirmationMismatch,
    ReauthenticationInFuture,
    ReauthenticationStale,
    CommandNotYetValid,
    CommandExpired,
    InvalidMac,
    InvalidJournalMac,
    JournalRequestMismatch,
}

impl fmt::Display for ShopLifecycleCommandError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Contract(error) => write!(formatter, "{error}"),
            Self::UnsupportedFormat => {
                write!(formatter, "unsupported shop lifecycle command format")
            }
            Self::InvalidCommandWindow => {
                write!(formatter, "invalid shop lifecycle command validity window")
            }
            Self::OperationMismatch => {
                write!(
                    formatter,
                    "shop lifecycle operation and payload do not match"
                )
            }
            Self::InvalidShopName => write!(formatter, "invalid shop name"),
            Self::InvalidIcon => write!(formatter, "invalid shop icon"),
            Self::InvalidArchiveId => write!(formatter, "invalid shop archive identity"),
            Self::MissingTarget => write!(formatter, "shop lifecycle target is missing"),
            Self::DeleteConfirmationMismatch => {
                write!(
                    formatter,
                    "shop deletion confirmation does not match the target"
                )
            }
            Self::ReauthenticationInFuture => {
                write!(formatter, "owner reauthentication proof is future-dated")
            }
            Self::ReauthenticationStale => {
                write!(formatter, "owner reauthentication proof is stale")
            }
            Self::CommandNotYetValid => {
                write!(formatter, "shop lifecycle command is not yet valid")
            }
            Self::CommandExpired => write!(formatter, "shop lifecycle command has expired"),
            Self::InvalidMac => {
                write!(formatter, "shop lifecycle command authentication failed")
            }
            Self::InvalidJournalMac => {
                write!(formatter, "shop lifecycle journal authentication failed")
            }
            Self::JournalRequestMismatch => {
                write!(formatter, "shop lifecycle journal request was altered")
            }
        }
    }
}

impl std::error::Error for ShopLifecycleCommandError {}

impl From<ShopLifecycleContractError> for ShopLifecycleCommandError {
    fn from(error: ShopLifecycleContractError) -> Self {
        Self::Contract(error)
    }
}

pub fn lifecycle_command_key(installation_root: &[u8; 32]) -> [u8; 32] {
    hmac_sha256(installation_root, COMMAND_KEY_DOMAIN)
}

fn lifecycle_journal_key(installation_root: &[u8; 32]) -> [u8; 32] {
    hmac_sha256(installation_root, JOURNAL_KEY_DOMAIN)
}

fn journal_mac(
    installation_root: &[u8; 32],
    command_mac: &str,
    journal: &ShopLifecycleJournal,
) -> String {
    let mut journal_key = lifecycle_journal_key(installation_root);
    let output = hex_32(&hmac_sha256(
        &journal_key,
        &journal_message(command_mac, journal),
    ));
    journal_key.fill(0);
    output
}

fn journal_message(command_mac: &str, journal: &ShopLifecycleJournal) -> Vec<u8> {
    let mut output = Vec::with_capacity(256);
    output.extend_from_slice(JOURNAL_MAC_DOMAIN);
    push_u8(&mut output, 0);
    push_string(&mut output, command_mac);
    push_u8(&mut output, stage_code(journal.stage));
    push_u64(&mut output, journal.created_at_unix_ms);
    push_u64(&mut output, journal.updated_at_unix_ms);
    push_optional_string(&mut output, journal.failure_code.as_deref());
    output
}

fn stage_code(stage: ShopLifecycleStage) -> u8 {
    match stage {
        ShopLifecycleStage::Requested => 1,
        ShopLifecycleStage::Authorized => 2,
        ShopLifecycleStage::Quiescing => 3,
        ShopLifecycleStage::RuntimeStopped => 4,
        ShopLifecycleStage::Staged => 5,
        ShopLifecycleStage::RegistryCommitting => 6,
        ShopLifecycleStage::Committed => 7,
        ShopLifecycleStage::RuntimeStarting => 8,
        ShopLifecycleStage::Ready => 9,
        ShopLifecycleStage::Completed => 10,
        ShopLifecycleStage::Compensating => 11,
        ShopLifecycleStage::Recovered => 12,
        ShopLifecycleStage::Blocked => 13,
        ShopLifecycleStage::ManualRecoveryRequired => 14,
    }
}

fn validate_shop_name(value: &str) -> Result<(), ShopLifecycleCommandError> {
    let trimmed = value.trim();
    if trimmed.is_empty()
        || trimmed != value
        || trimmed.chars().count() > 50
        || trimmed.chars().any(char::is_control)
    {
        return Err(ShopLifecycleCommandError::InvalidShopName);
    }
    Ok(())
}

fn validate_icon(value: Option<&str>) -> Result<(), ShopLifecycleCommandError> {
    if value.is_some_and(|icon| {
        icon.is_empty() || icon.len() > 32 || icon.chars().any(char::is_control)
    }) {
        return Err(ShopLifecycleCommandError::InvalidIcon);
    }
    Ok(())
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

fn valid_lower_hex(value: &str, bytes: usize) -> bool {
    value.len() == bytes * 2
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
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

fn verify_hex_mac(
    supplied_hex: &str,
    key: &[u8; 32],
    message: &[u8],
    mismatch: ShopLifecycleCommandError,
) -> Result<(), ShopLifecycleCommandError> {
    let supplied = decode_hex_32(supplied_hex).ok_or_else(|| mismatch.clone())?;
    let expected = hmac_sha256(key, message);
    let difference = supplied
        .iter()
        .zip(expected)
        .fold(0_u8, |value, (left, right)| value | (*left ^ right));
    if difference == 0 {
        Ok(())
    } else {
        Err(mismatch)
    }
}

fn decode_hex_32(value: &str) -> Option<[u8; 32]> {
    if !valid_lower_hex(value, 32) {
        return None;
    }
    let bytes = value.as_bytes();
    let mut output = [0_u8; 32];
    for (index, pair) in bytes.chunks_exact(2).enumerate() {
        output[index] = (hex_nibble(pair[0])? << 4) | hex_nibble(pair[1])?;
    }
    Some(output)
}

fn hex_nibble(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        _ => None,
    }
}

fn hex_32(value: &[u8; 32]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(64);
    for byte in value {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
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

#[cfg(test)]
mod tests {
    use super::*;

    const ROOT: [u8; 32] = [9_u8; 32];

    fn identity(character: char) -> String {
        std::iter::repeat(character).take(32).collect()
    }

    fn request(operation: ShopLifecycleOperation) -> ShopLifecycleRequest {
        let requires_target = !matches!(operation, ShopLifecycleOperation::Create);
        ShopLifecycleRequest {
            format_version: 1,
            operation_id: identity('1'),
            operation,
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
            target_shop_id: requires_target.then(|| "target-shop".to_owned()),
            target_shop_incarnation_id: requires_target.then(|| identity('8')),
            recent_owner_reauthentication: matches!(operation, ShopLifecycleOperation::Delete),
        }
    }

    fn authorization(
        operation: ShopLifecycleOperation,
        payload: ShopLifecyclePayload,
    ) -> ShopLifecycleAuthorization {
        ShopLifecycleAuthorization {
            format_version: 1,
            issued_at_unix_ms: 1_000_000,
            expires_at_unix_ms: 1_030_000,
            request: request(operation),
            payload,
        }
    }

    fn signed_command(
        operation: ShopLifecycleOperation,
        payload: ShopLifecyclePayload,
    ) -> ShopLifecycleCommand {
        let authorization = authorization(operation, payload);
        let mut key = lifecycle_command_key(&ROOT);
        let mac = hex_32(&hmac_sha256(&key, &authorization.mac_message()));
        key.fill(0);
        ShopLifecycleCommand { authorization, mac }
    }

    fn switch_command() -> ShopLifecycleCommand {
        signed_command(ShopLifecycleOperation::Switch, ShopLifecyclePayload::Switch)
    }

    #[test]
    fn accepts_authenticated_switch_contract() {
        assert_eq!(switch_command().verify(&ROOT, 1_001_000), Ok(()));
    }

    #[test]
    fn rejects_tampered_authority_fields() {
        let mut command = switch_command();
        command.authorization.request.expected_registry_revision += 1;
        assert_eq!(
            command.verify(&ROOT, 1_001_000),
            Err(ShopLifecycleCommandError::InvalidMac)
        );
    }

    #[test]
    fn rejects_expired_and_future_commands() {
        let command = switch_command();
        assert_eq!(
            command.verify(&ROOT, 1_040_000),
            Err(ShopLifecycleCommandError::CommandExpired)
        );
        assert_eq!(
            command.verify(&ROOT, 900_000),
            Err(ShopLifecycleCommandError::CommandNotYetValid)
        );
    }

    #[test]
    fn binds_operation_specific_payload() {
        let command = signed_command(
            ShopLifecycleOperation::Switch,
            ShopLifecyclePayload::Archive,
        );
        assert_eq!(
            command.authorization.validate(),
            Err(ShopLifecycleCommandError::OperationMismatch)
        );
    }

    #[test]
    fn requires_exact_delete_confirmation_and_recent_reauthentication() {
        let mut command = signed_command(
            ShopLifecycleOperation::Delete,
            ShopLifecyclePayload::Delete {
                confirmation_shop_id: "wrong-shop".to_owned(),
                reauthenticated_at_unix_ms: 999_000,
            },
        );
        assert_eq!(
            command.authorization.validate(),
            Err(ShopLifecycleCommandError::DeleteConfirmationMismatch)
        );

        command = signed_command(
            ShopLifecycleOperation::Delete,
            ShopLifecyclePayload::Delete {
                confirmation_shop_id: "target-shop".to_owned(),
                reauthenticated_at_unix_ms: 1_000_000 - MAX_REAUTHENTICATION_AGE_MS - 1,
            },
        );
        assert_eq!(
            command.authorization.validate(),
            Err(ShopLifecycleCommandError::ReauthenticationStale)
        );
    }

    #[test]
    fn journal_accepts_only_authenticated_commands() {
        let command = switch_command();
        let journal = AuthenticatedShopLifecycleJournal::accept(&command, &ROOT, 1_001_000)
            .expect("authenticated");
        assert_eq!(journal.journal.stage, ShopLifecycleStage::Requested);

        let mut tampered = command;
        tampered.authorization.request.actor_person_id = identity('c');
        assert_eq!(
            AuthenticatedShopLifecycleJournal::accept(&tampered, &ROOT, 1_001_000),
            Err(ShopLifecycleCommandError::InvalidMac)
        );
    }

    #[test]
    fn authenticated_journal_detects_request_tampering() {
        let mut journal =
            AuthenticatedShopLifecycleJournal::accept(&switch_command(), &ROOT, 1_001_000)
                .expect("authenticated");
        journal.journal.request.shop_slots = 10;
        assert_eq!(
            journal.validate(&ROOT),
            Err(ShopLifecycleCommandError::JournalRequestMismatch)
        );
    }

    #[test]
    fn authenticated_journal_detects_stage_tampering() {
        let mut journal =
            AuthenticatedShopLifecycleJournal::accept(&switch_command(), &ROOT, 1_001_000)
                .expect("authenticated");
        journal.journal.stage = ShopLifecycleStage::Authorized;
        journal.journal.updated_at_unix_ms = 1_002_000;
        assert_eq!(
            journal.validate(&ROOT),
            Err(ShopLifecycleCommandError::InvalidJournalMac)
        );
    }

    #[test]
    fn transitions_authenticated_journal_through_compensation() {
        let mut journal =
            AuthenticatedShopLifecycleJournal::accept(&switch_command(), &ROOT, 1_001_000)
                .expect("authenticated");
        for (index, stage) in [
            ShopLifecycleStage::Authorized,
            ShopLifecycleStage::Quiescing,
            ShopLifecycleStage::RuntimeStopped,
            ShopLifecycleStage::Staged,
            ShopLifecycleStage::RegistryCommitting,
            ShopLifecycleStage::Committed,
            ShopLifecycleStage::RuntimeStarting,
        ]
        .into_iter()
        .enumerate()
        {
            journal
                .transition(&ROOT, stage, 1_002_000 + index as u64, None)
                .expect("valid transition");
        }
        journal
            .transition(
                &ROOT,
                ShopLifecycleStage::Compensating,
                1_003_000,
                Some("RUNTIME_START_FAILED".to_owned()),
            )
            .expect("compensation begins");
        journal
            .transition(&ROOT, ShopLifecycleStage::Recovered, 1_004_000, None)
            .expect("authority recovered");
        assert_eq!(journal.journal.stage, ShopLifecycleStage::Recovered);
        assert_eq!(journal.validate(&ROOT), Ok(()));
    }
}
