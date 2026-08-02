use serde::{Deserialize, Serialize};
use std::fmt;

const LIFECYCLE_FORMAT_VERSION: u8 = 1;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ShopLifecycleOperation {
    Create,
    Rename,
    Switch,
    Archive,
    Recover,
    Delete,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ShopLifecycleStage {
    Requested,
    Authorized,
    Quiescing,
    RuntimeStopped,
    Staged,
    RegistryCommitting,
    Committed,
    RuntimeStarting,
    Ready,
    Completed,
    Compensating,
    Recovered,
    Blocked,
    ManualRecoveryRequired,
}

impl ShopLifecycleStage {
    fn is_terminal(self) -> bool {
        matches!(
            self,
            Self::Completed | Self::Recovered | Self::ManualRecoveryRequired
        )
    }

    fn requires_failure_code(self) -> bool {
        matches!(
            self,
            Self::Compensating | Self::Blocked | Self::ManualRecoveryRequired
        )
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopLifecycleRequest {
    pub format_version: u8,
    pub operation_id: String,
    pub operation: ShopLifecycleOperation,
    pub expected_registry_revision: u64,
    pub workspace_id: String,
    pub installation_id: String,
    pub actor_person_id: String,
    pub actor_member_id: String,
    pub actor_device_id: String,
    pub actor_session_id: String,
    pub policy_version: u64,
    pub revocation_epoch: u64,
    pub entitlement_id: String,
    pub entitlement_revision: u64,
    pub shop_slots: u16,
    pub migration_set_sha256: String,
    pub current_shop_id: String,
    pub current_shop_incarnation_id: String,
    pub target_shop_id: Option<String>,
    pub target_shop_incarnation_id: Option<String>,
    pub recent_owner_reauthentication: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopLifecycleJournal {
    pub format_version: u8,
    pub request: ShopLifecycleRequest,
    pub stage: ShopLifecycleStage,
    pub created_at_unix_ms: u64,
    pub updated_at_unix_ms: u64,
    pub failure_code: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ShopLifecycleContractError {
    UnsupportedFormat,
    InvalidOperationId,
    InvalidIdentity(&'static str),
    InvalidSessionId,
    InvalidRegistryRevision,
    InvalidPolicyVersion,
    InvalidEntitlementRevision,
    InvalidShopSlots,
    InvalidMigrationSet,
    MissingTarget,
    UnexpectedTarget,
    TargetEqualsCurrent,
    OwnerReauthenticationRequired,
    TimeReversal,
    FailureCodeRequired,
    UnexpectedFailureCode,
    InvalidTransition {
        from: ShopLifecycleStage,
        to: ShopLifecycleStage,
    },
}

impl fmt::Display for ShopLifecycleContractError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedFormat => write!(formatter, "unsupported shop lifecycle format"),
            Self::InvalidOperationId => write!(formatter, "invalid shop lifecycle operation ID"),
            Self::InvalidIdentity(label) => write!(formatter, "invalid {label} identity"),
            Self::InvalidSessionId => write!(formatter, "invalid actor session identity"),
            Self::InvalidRegistryRevision => write!(formatter, "invalid expected registry revision"),
            Self::InvalidPolicyVersion => write!(formatter, "invalid policy version"),
            Self::InvalidEntitlementRevision => write!(formatter, "invalid entitlement revision"),
            Self::InvalidShopSlots => write!(formatter, "invalid signed shop-slot limit"),
            Self::InvalidMigrationSet => write!(formatter, "invalid migration-set identity"),
            Self::MissingTarget => write!(formatter, "shop lifecycle target is required"),
            Self::UnexpectedTarget => write!(formatter, "shop lifecycle target is not allowed"),
            Self::TargetEqualsCurrent => {
                write!(formatter, "target shop must differ from current shop")
            }
            Self::OwnerReauthenticationRequired => {
                write!(formatter, "recent owner reauthentication is required")
            }
            Self::TimeReversal => write!(formatter, "shop lifecycle journal time moved backwards"),
            Self::FailureCodeRequired => {
                write!(formatter, "shop lifecycle failure stage requires an exact code")
            }
            Self::UnexpectedFailureCode => {
                write!(formatter, "shop lifecycle success stage cannot carry a failure code")
            }
            Self::InvalidTransition { from, to } => {
                write!(formatter, "invalid shop lifecycle transition {from:?} -> {to:?}")
            }
        }
    }
}

impl std::error::Error for ShopLifecycleContractError {}

fn valid_hex_identity(value: &str, bytes: usize) -> bool {
    value.len() == bytes * 2 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn valid_shop_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    (1..=64).contains(&bytes.len())
        && (bytes[0].is_ascii_lowercase() || bytes[0].is_ascii_digit())
        && bytes
            .iter()
            .skip(1)
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-')
}

fn valid_failure_code(value: &str) -> bool {
    (1..=96).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_uppercase() || byte.is_ascii_digit() || byte == b'_')
}

fn require_identity(value: &str, label: &'static str) -> Result<(), ShopLifecycleContractError> {
    if valid_hex_identity(value, 16) {
        Ok(())
    } else {
        Err(ShopLifecycleContractError::InvalidIdentity(label))
    }
}

impl ShopLifecycleRequest {
    pub fn validate(&self) -> Result<(), ShopLifecycleContractError> {
        if self.format_version != LIFECYCLE_FORMAT_VERSION {
            return Err(ShopLifecycleContractError::UnsupportedFormat);
        }
        if !valid_hex_identity(&self.operation_id, 16) {
            return Err(ShopLifecycleContractError::InvalidOperationId);
        }
        require_identity(&self.workspace_id, "workspace")?;
        require_identity(&self.installation_id, "installation")?;
        require_identity(&self.actor_person_id, "person")?;
        require_identity(&self.actor_member_id, "member")?;
        require_identity(&self.actor_device_id, "device")?;
        if self.actor_session_id.is_empty()
            || self.actor_session_id.len() > 256
            || self.actor_session_id.trim() != self.actor_session_id
        {
            return Err(ShopLifecycleContractError::InvalidSessionId);
        }
        if self.expected_registry_revision == 0 {
            return Err(ShopLifecycleContractError::InvalidRegistryRevision);
        }
        if self.policy_version == 0 {
            return Err(ShopLifecycleContractError::InvalidPolicyVersion);
        }
        if self.entitlement_id.is_empty()
            || self.entitlement_id.len() > 256
            || self.entitlement_id.trim() != self.entitlement_id
        {
            return Err(ShopLifecycleContractError::InvalidIdentity("entitlement"));
        }
        if self.entitlement_revision == 0 {
            return Err(ShopLifecycleContractError::InvalidEntitlementRevision);
        }
        if !(1..=10).contains(&self.shop_slots) {
            return Err(ShopLifecycleContractError::InvalidShopSlots);
        }
        if !valid_hex_identity(&self.migration_set_sha256, 32) {
            return Err(ShopLifecycleContractError::InvalidMigrationSet);
        }
        if !valid_shop_id(&self.current_shop_id) {
            return Err(ShopLifecycleContractError::InvalidIdentity("current shop"));
        }
        require_identity(
            &self.current_shop_incarnation_id,
            "current shop incarnation",
        )?;

        let requires_target = !matches!(self.operation, ShopLifecycleOperation::Create);
        match (&self.target_shop_id, &self.target_shop_incarnation_id) {
            (Some(shop_id), Some(incarnation_id)) => {
                if !valid_shop_id(shop_id) {
                    return Err(ShopLifecycleContractError::InvalidIdentity("target shop"));
                }
                require_identity(incarnation_id, "target shop incarnation")?;
                if matches!(self.operation, ShopLifecycleOperation::Switch)
                    && shop_id == &self.current_shop_id
                {
                    return Err(ShopLifecycleContractError::TargetEqualsCurrent);
                }
                if !requires_target {
                    return Err(ShopLifecycleContractError::UnexpectedTarget);
                }
            }
            (None, None) if requires_target => {
                return Err(ShopLifecycleContractError::MissingTarget)
            }
            (None, None) => {}
            _ => return Err(ShopLifecycleContractError::MissingTarget),
        }

        if matches!(self.operation, ShopLifecycleOperation::Delete)
            && !self.recent_owner_reauthentication
        {
            return Err(ShopLifecycleContractError::OwnerReauthenticationRequired);
        }

        Ok(())
    }
}

impl ShopLifecycleJournal {
    pub fn new(
        request: ShopLifecycleRequest,
        now_unix_ms: u64,
    ) -> Result<Self, ShopLifecycleContractError> {
        request.validate()?;
        Ok(Self {
            format_version: LIFECYCLE_FORMAT_VERSION,
            request,
            stage: ShopLifecycleStage::Requested,
            created_at_unix_ms: now_unix_ms,
            updated_at_unix_ms: now_unix_ms,
            failure_code: None,
        })
    }

    pub fn validate(&self) -> Result<(), ShopLifecycleContractError> {
        if self.format_version != LIFECYCLE_FORMAT_VERSION {
            return Err(ShopLifecycleContractError::UnsupportedFormat);
        }
        self.request.validate()?;
        if self.updated_at_unix_ms < self.created_at_unix_ms {
            return Err(ShopLifecycleContractError::TimeReversal);
        }
        validate_failure_code(self.stage, self.failure_code.as_deref())
    }

    pub fn transition(
        &mut self,
        next: ShopLifecycleStage,
        now_unix_ms: u64,
        failure_code: Option<String>,
    ) -> Result<(), ShopLifecycleContractError> {
        self.validate()?;
        if now_unix_ms < self.updated_at_unix_ms {
            return Err(ShopLifecycleContractError::TimeReversal);
        }
        if !transition_allowed(self.stage, next) {
            return Err(ShopLifecycleContractError::InvalidTransition {
                from: self.stage,
                to: next,
            });
        }
        validate_failure_code(next, failure_code.as_deref())?;
        self.stage = next;
        self.updated_at_unix_ms = now_unix_ms;
        self.failure_code = failure_code;
        Ok(())
    }
}

fn validate_failure_code(
    stage: ShopLifecycleStage,
    failure_code: Option<&str>,
) -> Result<(), ShopLifecycleContractError> {
    if stage.requires_failure_code() {
        if failure_code.is_some_and(valid_failure_code) {
            return Ok(());
        }
        return Err(ShopLifecycleContractError::FailureCodeRequired);
    }
    if failure_code.is_some() {
        return Err(ShopLifecycleContractError::UnexpectedFailureCode);
    }
    Ok(())
}

fn transition_allowed(from: ShopLifecycleStage, to: ShopLifecycleStage) -> bool {
    if from.is_terminal() {
        return false;
    }
    matches!(
        (from, to),
        (ShopLifecycleStage::Requested, ShopLifecycleStage::Authorized)
            | (ShopLifecycleStage::Authorized, ShopLifecycleStage::Quiescing)
            | (ShopLifecycleStage::Quiescing, ShopLifecycleStage::RuntimeStopped)
            | (ShopLifecycleStage::RuntimeStopped, ShopLifecycleStage::Staged)
            | (ShopLifecycleStage::Staged, ShopLifecycleStage::RegistryCommitting)
            | (ShopLifecycleStage::RegistryCommitting, ShopLifecycleStage::Committed)
            | (ShopLifecycleStage::Committed, ShopLifecycleStage::RuntimeStarting)
            | (ShopLifecycleStage::RuntimeStarting, ShopLifecycleStage::Ready)
            | (ShopLifecycleStage::Ready, ShopLifecycleStage::Completed)
            | (ShopLifecycleStage::RuntimeStopped, ShopLifecycleStage::Compensating)
            | (ShopLifecycleStage::Staged, ShopLifecycleStage::Compensating)
            | (ShopLifecycleStage::RegistryCommitting, ShopLifecycleStage::Compensating)
            | (ShopLifecycleStage::Committed, ShopLifecycleStage::Compensating)
            | (ShopLifecycleStage::RuntimeStarting, ShopLifecycleStage::Compensating)
            | (ShopLifecycleStage::Compensating, ShopLifecycleStage::Recovered)
            | (ShopLifecycleStage::Compensating, ShopLifecycleStage::Blocked)
            | (ShopLifecycleStage::Blocked, ShopLifecycleStage::ManualRecoveryRequired)
            | (ShopLifecycleStage::Requested, ShopLifecycleStage::Blocked)
            | (ShopLifecycleStage::Authorized, ShopLifecycleStage::Blocked)
            | (ShopLifecycleStage::Quiescing, ShopLifecycleStage::Blocked)
            | (ShopLifecycleStage::RuntimeStopped, ShopLifecycleStage::Blocked)
            | (ShopLifecycleStage::Staged, ShopLifecycleStage::Blocked)
            | (ShopLifecycleStage::RegistryCommitting, ShopLifecycleStage::Blocked)
            | (ShopLifecycleStage::Committed, ShopLifecycleStage::Blocked)
            | (ShopLifecycleStage::RuntimeStarting, ShopLifecycleStage::Blocked)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

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
            actor_session_id: "session-exact".to_string(),
            policy_version: 3,
            revocation_epoch: 1,
            entitlement_id: "license_001".to_string(),
            entitlement_revision: 4,
            shop_slots: 5,
            migration_set_sha256: "a".repeat(64),
            current_shop_id: "current-shop".to_string(),
            current_shop_incarnation_id: identity('7'),
            target_shop_id: requires_target.then(|| "target-shop".to_string()),
            target_shop_incarnation_id: requires_target.then(|| identity('8')),
            recent_owner_reauthentication: matches!(operation, ShopLifecycleOperation::Delete),
        }
    }

    #[test]
    fn accepts_complete_switch_contract() {
        assert_eq!(request(ShopLifecycleOperation::Switch).validate(), Ok(()));
    }

    #[test]
    fn rejects_switch_to_current_shop() {
        let mut input = request(ShopLifecycleOperation::Switch);
        input.target_shop_id = Some(input.current_shop_id.clone());
        assert_eq!(
            input.validate(),
            Err(ShopLifecycleContractError::TargetEqualsCurrent)
        );
    }

    #[test]
    fn requires_recent_owner_reauthentication_for_delete() {
        let mut input = request(ShopLifecycleOperation::Delete);
        input.recent_owner_reauthentication = false;
        assert_eq!(
            input.validate(),
            Err(ShopLifecycleContractError::OwnerReauthenticationRequired)
        );
    }

    #[test]
    fn enforces_signed_shop_slot_range() {
        let mut input = request(ShopLifecycleOperation::Create);
        input.shop_slots = 11;
        assert_eq!(
            input.validate(),
            Err(ShopLifecycleContractError::InvalidShopSlots)
        );
    }

    #[test]
    fn permits_happy_path_and_compensation_transitions() {
        let mut journal =
            ShopLifecycleJournal::new(request(ShopLifecycleOperation::Switch), 1)
                .expect("complete request");
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
                .transition(stage, index as u64 + 2, None)
                .expect("valid transition");
        }
        journal
            .transition(
                ShopLifecycleStage::Compensating,
                10,
                Some("RUNTIME_START_FAILED".to_string()),
            )
            .expect("compensation starts after committed mutation");
        journal
            .transition(ShopLifecycleStage::Recovered, 11, None)
            .expect("compensation recovered authority");
        assert_eq!(journal.stage, ShopLifecycleStage::Recovered);
    }

    #[test]
    fn permits_blocked_escalation_to_manual_recovery() {
        let mut journal =
            ShopLifecycleJournal::new(request(ShopLifecycleOperation::Switch), 1)
                .expect("complete request");
        journal
            .transition(
                ShopLifecycleStage::Blocked,
                2,
                Some("REGISTRY_CONFLICT".to_string()),
            )
            .expect("request may fail closed");
        journal
            .transition(
                ShopLifecycleStage::ManualRecoveryRequired,
                3,
                Some("COMPENSATION_UNAVAILABLE".to_string()),
            )
            .expect("blocked authority may require manual recovery");
        assert_eq!(
            journal.stage,
            ShopLifecycleStage::ManualRecoveryRequired
        );
    }

    #[test]
    fn rejects_skipped_and_terminal_transitions() {
        let mut journal =
            ShopLifecycleJournal::new(request(ShopLifecycleOperation::Switch), 1)
                .expect("complete request");
        assert!(matches!(
            journal.transition(ShopLifecycleStage::Committed, 2, None),
            Err(ShopLifecycleContractError::InvalidTransition { .. })
        ));
        journal
            .transition(
                ShopLifecycleStage::Blocked,
                3,
                Some("DENIED".to_string()),
            )
            .expect("request may fail closed");
        assert!(matches!(
            journal.transition(ShopLifecycleStage::Authorized, 4, None),
            Err(ShopLifecycleContractError::InvalidTransition { .. })
        ));
    }

    #[test]
    fn requires_failure_code_for_failure_stages() {
        let mut journal =
            ShopLifecycleJournal::new(request(ShopLifecycleOperation::Switch), 1)
                .expect("complete request");
        assert_eq!(
            journal.transition(ShopLifecycleStage::Blocked, 2, None),
            Err(ShopLifecycleContractError::FailureCodeRequired)
        );
    }

    #[test]
    fn rejects_journal_time_reversal() {
        let mut journal =
            ShopLifecycleJournal::new(request(ShopLifecycleOperation::Switch), 10)
                .expect("complete request");
        assert_eq!(
            journal.transition(ShopLifecycleStage::Authorized, 9, None),
            Err(ShopLifecycleContractError::TimeReversal)
        );
    }
}
