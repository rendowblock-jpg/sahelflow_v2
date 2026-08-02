use fs2::FileExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt::{Display, Formatter};
use std::fs::{self, File, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{compiler_fence, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const ROOT_KEY_BYTES: usize = 32;
const MAX_DOCUMENT_BYTES: u64 = 64 * 1024;
const DOCUMENT_FORMAT_VERSION: u8 = 1;
const CURRENT_PURPOSE: &str = "sahelflow-installation-root-v1";
const RECOVERY_PURPOSE: &str = "sahelflow-installation-root-recovery-v1";
const WINDOWS_DPAPI_ALGORITHM: &str = "windows-dpapi-current-user";
const CURRENT_FILE: &str = "installation-root.current.json";
const CANDIDATE_FILE: &str = "installation-root.candidate.json";
const BACKUP_FILE: &str = "installation-root.backup.json";
const ROTATION_JOURNAL_FILE: &str = "installation-root.rotation.json";
const ROTATION_RECEIPT_FILE: &str = "installation-root.last-rotation.json";
const LOCK_FILE: &str = "installation-root.lock";
const RECOVERY_DIRECTORY: &str = "installation-root-recovery";
const INNER_MAGIC: &[u8] = b"SAHELFLOW-INSTALLATION-ROOT\0";
const OUTER_HASH_DOMAIN: &[u8] = b"sahelflow-installation-root-document-v1\n";
const INNER_HASH_DOMAIN: &[u8] = b"sahelflow-installation-root-payload-v1\n";
const KEY_ID_DOMAIN: &[u8] = b"sahelflow-installation-root-key-id-v1\n";
const ENTROPY_DOMAIN: &[u8] = b"sahelflow-installation-root-dpapi-entropy-v1\n";

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct InstallationIdentity {
    pub(crate) workspace_id: String,
    pub(crate) installation_id: String,
}

impl InstallationIdentity {
    pub(crate) fn new(
        workspace_id: impl Into<String>,
        installation_id: impl Into<String>,
    ) -> Result<Self, InstallationRootError> {
        let identity = Self {
            workspace_id: workspace_id.into(),
            installation_id: installation_id.into(),
        };
        validate_identity(&identity)?;
        Ok(identity)
    }
}

pub(crate) struct InstallationRootRequest<'a> {
    pub(crate) system_dir: &'a Path,
    pub(crate) legacy_master_key_path: &'a Path,
    pub(crate) identity: InstallationIdentity,
    /// True when any pre-existing registry, shop database, migration journal, or
    /// other installation authority was observed before this preflight.
    pub(crate) existing_authority_present: bool,
    /// True only when the caller has positively proved that this is a new,
    /// authority-free installation. Absence of one file is not sufficient.
    pub(crate) provably_fresh: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum InstallationRootDisposition {
    RecoveredProtected,
    ImportedLegacyPlaintext,
    GeneratedFresh,
}

pub(crate) struct PreparedInstallationRoot {
    pub(crate) root_key: InstallationRootKey,
    pub(crate) disposition: InstallationRootDisposition,
    pub(crate) protected_path: PathBuf,
    pub(crate) imported_recovery_archives: usize,
}

pub(crate) enum InstallationRootRotationPreparation {
    Ready(PreparedInstallationRootRotation),
    RecoveredCommitted { receipt_path: PathBuf },
}

/// Holds the installation-root lock across the complete database re-wrap.
/// This type intentionally implements neither `Clone` nor `Debug`.
pub(crate) struct PreparedInstallationRootRotation {
    pub(crate) current_root: InstallationRootKey,
    pub(crate) candidate_root: InstallationRootKey,
    system_dir: PathBuf,
    identity: InstallationIdentity,
    _lock: File,
}

/// This type intentionally implements neither `Clone` nor `Debug`.
pub(crate) struct InstallationRootKey {
    bytes: [u8; ROOT_KEY_BYTES],
    key_id: String,
}

impl InstallationRootKey {
    pub(crate) fn as_bytes(&self) -> &[u8; ROOT_KEY_BYTES] {
        &self.bytes
    }

    pub(crate) fn key_id(&self) -> &str {
        &self.key_id
    }
}

impl Drop for InstallationRootKey {
    fn drop(&mut self) {
        zero_bytes(&mut self.bytes);
    }
}

#[derive(Debug)]
pub(crate) enum InstallationRootError {
    Io(std::io::Error),
    Json(serde_json::Error),
    InvalidState(String),
    IdentityMismatch(String),
    NoRecoverableKey,
    UnsupportedPlatform,
    Crypto(String),
}

impl Display for InstallationRootError {
    fn fmt(&self, formatter: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "installation root I/O failed: {error}"),
            Self::Json(error) => write!(formatter, "installation root JSON is invalid: {error}"),
            Self::InvalidState(message) => {
                write!(formatter, "installation root state is invalid: {message}")
            }
            Self::IdentityMismatch(message) => {
                write!(formatter, "installation root identity mismatch: {message}")
            }
            Self::NoRecoverableKey => write!(
                formatter,
                "existing installation has no recoverable installation root"
            ),
            Self::UnsupportedPlatform => write!(
                formatter,
                "the packaged installation root provider is available only on Windows"
            ),
            Self::Crypto(message) => {
                write!(formatter, "installation root protection failed: {message}")
            }
        }
    }
}

impl std::error::Error for InstallationRootError {}

impl From<std::io::Error> for InstallationRootError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for InstallationRootError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProtectedDocument {
    format_version: u8,
    algorithm: String,
    purpose: String,
    workspace_id: String,
    installation_id: String,
    key_id: String,
    protected_payload_hex: String,
    document_sha256: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum RotationJournalState {
    Prepared,
    DataRotated,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RotationJournal {
    format_version: u8,
    state: RotationJournalState,
    workspace_id: String,
    installation_id: String,
    current_key_id: String,
    candidate_key_id: String,
    updated_at_unix_seconds: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct RotationReceipt {
    format_version: u8,
    workspace_id: String,
    installation_id: String,
    previous_key_id: String,
    current_key_id: String,
    completed_at_unix_seconds: u64,
}

struct SensitiveBytes(Vec<u8>);

impl SensitiveBytes {
    fn as_slice(&self) -> &[u8] {
        self.0.as_slice()
    }

    fn as_mut_slice(&mut self) -> &mut [u8] {
        self.0.as_mut_slice()
    }
}

impl Drop for SensitiveBytes {
    fn drop(&mut self) {
        zero_bytes(self.0.as_mut_slice());
    }
}

trait PayloadProtector {
    fn algorithm(&self) -> &'static str;
    fn protect(
        &self,
        plaintext: &[u8],
        identity: &InstallationIdentity,
    ) -> Result<Vec<u8>, InstallationRootError>;
    fn unprotect(
        &self,
        ciphertext: &[u8],
        identity: &InstallationIdentity,
    ) -> Result<SensitiveBytes, InstallationRootError>;
}

struct PlatformProtector;

impl PayloadProtector for PlatformProtector {
    fn algorithm(&self) -> &'static str {
        WINDOWS_DPAPI_ALGORITHM
    }

    fn protect(
        &self,
        plaintext: &[u8],
        identity: &InstallationIdentity,
    ) -> Result<Vec<u8>, InstallationRootError> {
        platform_protect(plaintext, identity)
    }

    fn unprotect(
        &self,
        ciphertext: &[u8],
        identity: &InstallationIdentity,
    ) -> Result<SensitiveBytes, InstallationRootError> {
        platform_unprotect(ciphertext, identity)
    }
}

pub(crate) fn probe_protected_identity(
    system_dir: &Path,
) -> Result<Option<InstallationIdentity>, InstallationRootError> {
    if !system_dir.exists() {
        return Ok(None);
    }
    if let Some(parent) = system_dir.parent() {
        reject_symlink(parent)?;
    }
    reject_symlink(system_dir)?;
    // This probe is deliberately read-only. The protected preparation call
    // acquires the exclusive lock and revalidates the identity before it writes.
    // Avoiding lock creation here removes a crash window that could make an
    // otherwise fresh installation look like established authority.
    probe_protected_identity_locked(system_dir)
}

pub(crate) fn prepare_installation_root(
    request: InstallationRootRequest<'_>,
) -> Result<PreparedInstallationRoot, InstallationRootError> {
    prepare_installation_root_with(request, &PlatformProtector)
}

fn prepare_installation_root_with<P: PayloadProtector>(
    request: InstallationRootRequest<'_>,
    protector: &P,
) -> Result<PreparedInstallationRoot, InstallationRootError> {
    validate_identity(&request.identity)?;
    if request.provably_fresh && request.existing_authority_present {
        return Err(InstallationRootError::InvalidState(
            "fresh-install proof conflicts with an existing authority footprint".to_owned(),
        ));
    }

    if let Some(parent) = request.system_dir.parent() {
        if parent.exists() {
            reject_symlink(parent)?;
        }
    }
    fs::create_dir_all(request.system_dir)?;
    if let Some(parent) = request.system_dir.parent() {
        reject_symlink(parent)?;
    }
    reject_symlink(request.system_dir)?;
    let _lock = acquire_lock(request.system_dir)?;

    reject_incomplete_legacy_rotation(request.legacy_master_key_path)?;
    if path_exists_regular(&request.system_dir.join(ROTATION_JOURNAL_FILE))?
        || (path_exists_regular(&request.system_dir.join(CURRENT_FILE))?
            && path_exists_regular(&request.system_dir.join(CANDIDATE_FILE))?)
    {
        return Err(InstallationRootError::InvalidState(
            "protected installation-root rotation requires native resume".to_owned(),
        ));
    }

    if let Some(protected_identity) = probe_protected_identity_locked(request.system_dir)? {
        if protected_identity != request.identity {
            return Err(InstallationRootError::IdentityMismatch(format!(
                "protected identity {}/{} does not match requested identity {}/{}",
                protected_identity.workspace_id,
                protected_identity.installation_id,
                request.identity.workspace_id,
                request.identity.installation_id
            )));
        }
    }

    let protected = load_best_protected_root(request.system_dir, &request.identity, protector)?;
    let legacy_recovery_present = has_legacy_recovery_archives(request.legacy_master_key_path)?;
    let (root_key, disposition) = if let Some((root, source_path)) = protected {
        if source_path.file_name().and_then(|name| name.to_str()) != Some(CURRENT_FILE) {
            let document = make_document(&root, &request.identity, CURRENT_PURPOSE, protector)?;
            commit_current_document(request.system_dir, &document, &root, protector)?;
        }
        (root, InstallationRootDisposition::RecoveredProtected)
    } else if path_exists_regular(request.legacy_master_key_path)? {
        let root = read_legacy_root(request.legacy_master_key_path)?;
        let document = make_document(&root, &request.identity, CURRENT_PURPOSE, protector)?;
        commit_current_document(request.system_dir, &document, &root, protector)?;
        remove_plaintext_after_verification(request.legacy_master_key_path, &root)?;
        (root, InstallationRootDisposition::ImportedLegacyPlaintext)
    } else if request.provably_fresh
        && !request.existing_authority_present
        && !legacy_recovery_present
    {
        let root = generate_root_key()?;
        let document = make_document(&root, &request.identity, CURRENT_PURPOSE, protector)?;
        commit_current_document(request.system_dir, &document, &root, protector)?;
        (root, InstallationRootDisposition::GeneratedFresh)
    } else {
        return Err(InstallationRootError::NoRecoverableKey);
    };

    if path_exists_regular(request.legacy_master_key_path)? {
        let legacy_root = read_legacy_root(request.legacy_master_key_path)?;
        if !keys_equal(root_key.as_bytes(), legacy_root.as_bytes()) {
            return Err(InstallationRootError::InvalidState(
                "legacy master.key disagrees with the protected installation root".to_owned(),
            ));
        }
        remove_plaintext_after_verification(request.legacy_master_key_path, &root_key)?;
    }

    let imported_recovery_archives = import_legacy_recovery_archives(
        request.system_dir,
        request.legacy_master_key_path,
        &request.identity,
        protector,
    )?;

    Ok(PreparedInstallationRoot {
        root_key,
        disposition,
        protected_path: request.system_dir.join(CURRENT_FILE),
        imported_recovery_archives,
    })
}

pub(crate) fn prepare_installation_root_rotation(
    system_dir: &Path,
    identity: InstallationIdentity,
) -> Result<InstallationRootRotationPreparation, InstallationRootError> {
    prepare_installation_root_rotation_with(system_dir, identity, &PlatformProtector)
}

fn prepare_installation_root_rotation_with<P: PayloadProtector>(
    system_dir: &Path,
    identity: InstallationIdentity,
    protector: &P,
) -> Result<InstallationRootRotationPreparation, InstallationRootError> {
    validate_identity(&identity)?;
    if let Some(parent) = system_dir.parent() {
        reject_symlink(parent)?;
    }
    fs::create_dir_all(system_dir)?;
    reject_symlink(system_dir)?;
    let lock = acquire_lock(system_dir)?;

    let protected_identity = probe_protected_identity_locked(system_dir)?.ok_or_else(|| {
        InstallationRootError::InvalidState(
            "protected rotation requires an existing installation root".to_owned(),
        )
    })?;
    if protected_identity != identity {
        return Err(InstallationRootError::IdentityMismatch(
            "protected rotation identity does not match the installed workspace".to_owned(),
        ));
    }

    let journal_path = system_dir.join(ROTATION_JOURNAL_FILE);
    let journal = if path_exists_regular(&journal_path)? {
        Some(read_rotation_journal(&journal_path, &identity)?)
    } else {
        None
    };
    let current_path = system_dir.join(CURRENT_FILE);
    if !path_exists_regular(&current_path)? {
        if let Some(journal) = &journal {
            if journal.state == RotationJournalState::DataRotated {
                let backup = read_and_unprotect_document(
                    &system_dir.join(BACKUP_FILE),
                    &identity,
                    CURRENT_PURPOSE,
                    protector,
                )?;
                let candidate = read_and_unprotect_document(
                    &system_dir.join(CANDIDATE_FILE),
                    &identity,
                    CURRENT_PURPOSE,
                    protector,
                )?;
                if backup.key_id() == journal.current_key_id
                    && candidate.key_id() == journal.candidate_key_id
                {
                    promote_candidate_document(system_dir, &candidate, &identity, protector)?;
                    let receipt_path = finish_rotation_receipt(system_dir, &identity, journal)?;
                    return Ok(InstallationRootRotationPreparation::RecoveredCommitted {
                        receipt_path,
                    });
                }
            }
        }
        return Err(InstallationRootError::InvalidState(
            "protected rotation requires the current installation-root document".to_owned(),
        ));
    }
    let current_root =
        read_and_unprotect_document(&current_path, &identity, CURRENT_PURPOSE, protector)?;

    if let Some(journal) = &journal {
        if journal.state == RotationJournalState::DataRotated {
            let receipt_path = recover_data_rotated_rotation(
                system_dir,
                &identity,
                &current_root,
                journal,
                protector,
            )?;
            return Ok(InstallationRootRotationPreparation::RecoveredCommitted { receipt_path });
        }
        if journal.current_key_id != current_root.key_id() {
            return Err(InstallationRootError::InvalidState(
                "rotation journal current key does not match protected authority".to_owned(),
            ));
        }
    }

    let candidate_path = system_dir.join(CANDIDATE_FILE);
    let candidate_root = if path_exists_regular(&candidate_path)? {
        read_and_unprotect_document(&candidate_path, &identity, CURRENT_PURPOSE, protector)?
    } else {
        let generated = generate_root_key()?;
        let document = make_document(&generated, &identity, CURRENT_PURPOSE, protector)?;
        write_document_durable(&candidate_path, &document)?;
        let verified =
            read_and_unprotect_document(&candidate_path, &identity, CURRENT_PURPOSE, protector)?;
        if !keys_equal(generated.as_bytes(), verified.as_bytes()) {
            return Err(InstallationRootError::InvalidState(
                "rotation candidate round-trip changed the generated root".to_owned(),
            ));
        }
        generated
    };
    if keys_equal(current_root.as_bytes(), candidate_root.as_bytes()) {
        return Err(InstallationRootError::InvalidState(
            "rotation candidate matches the current installation root".to_owned(),
        ));
    }
    if let Some(journal) = &journal {
        if journal.candidate_key_id != candidate_root.key_id() {
            return Err(InstallationRootError::InvalidState(
                "rotation journal candidate key does not match protected authority".to_owned(),
            ));
        }
    } else {
        write_rotation_journal(
            &journal_path,
            &RotationJournal {
                format_version: DOCUMENT_FORMAT_VERSION,
                state: RotationJournalState::Prepared,
                workspace_id: identity.workspace_id.clone(),
                installation_id: identity.installation_id.clone(),
                current_key_id: current_root.key_id().to_owned(),
                candidate_key_id: candidate_root.key_id().to_owned(),
                updated_at_unix_seconds: unix_seconds_now()?,
            },
        )?;
    }

    Ok(InstallationRootRotationPreparation::Ready(
        PreparedInstallationRootRotation {
            current_root,
            candidate_root,
            system_dir: system_dir.to_path_buf(),
            identity,
            _lock: lock,
        },
    ))
}

pub(crate) fn commit_installation_root_rotation(
    rotation: PreparedInstallationRootRotation,
) -> Result<PathBuf, InstallationRootError> {
    commit_installation_root_rotation_with(rotation, &PlatformProtector)
}

fn commit_installation_root_rotation_with<P: PayloadProtector>(
    rotation: PreparedInstallationRootRotation,
    protector: &P,
) -> Result<PathBuf, InstallationRootError> {
    let journal_path = rotation.system_dir.join(ROTATION_JOURNAL_FILE);
    let journal = RotationJournal {
        format_version: DOCUMENT_FORMAT_VERSION,
        state: RotationJournalState::DataRotated,
        workspace_id: rotation.identity.workspace_id.clone(),
        installation_id: rotation.identity.installation_id.clone(),
        current_key_id: rotation.current_root.key_id().to_owned(),
        candidate_key_id: rotation.candidate_root.key_id().to_owned(),
        updated_at_unix_seconds: unix_seconds_now()?,
    };
    write_rotation_journal(&journal_path, &journal)?;
    promote_candidate_document(
        &rotation.system_dir,
        &rotation.candidate_root,
        &rotation.identity,
        protector,
    )?;
    finish_rotation_receipt(&rotation.system_dir, &rotation.identity, &journal)
}

fn recover_data_rotated_rotation<P: PayloadProtector>(
    system_dir: &Path,
    identity: &InstallationIdentity,
    current_root: &InstallationRootKey,
    journal: &RotationJournal,
    protector: &P,
) -> Result<PathBuf, InstallationRootError> {
    if current_root.key_id() == journal.candidate_key_id {
        let backup = read_and_unprotect_document(
            &system_dir.join(BACKUP_FILE),
            identity,
            CURRENT_PURPOSE,
            protector,
        )?;
        if backup.key_id() != journal.current_key_id {
            return Err(InstallationRootError::InvalidState(
                "committed rotation backup does not match the prior root".to_owned(),
            ));
        }
    } else if current_root.key_id() == journal.current_key_id {
        let candidate = read_and_unprotect_document(
            &system_dir.join(CANDIDATE_FILE),
            identity,
            CURRENT_PURPOSE,
            protector,
        )?;
        if candidate.key_id() != journal.candidate_key_id {
            return Err(InstallationRootError::InvalidState(
                "data-rotated candidate does not match the rotation journal".to_owned(),
            ));
        }
        promote_candidate_document(system_dir, &candidate, identity, protector)?;
    } else {
        return Err(InstallationRootError::InvalidState(
            "data-rotated journal matches neither current nor candidate authority".to_owned(),
        ));
    }
    finish_rotation_receipt(system_dir, identity, journal)
}

fn finish_rotation_receipt(
    system_dir: &Path,
    identity: &InstallationIdentity,
    journal: &RotationJournal,
) -> Result<PathBuf, InstallationRootError> {
    let receipt_path = system_dir.join(ROTATION_RECEIPT_FILE);
    write_json_durable(
        &receipt_path,
        &RotationReceipt {
            format_version: DOCUMENT_FORMAT_VERSION,
            workspace_id: identity.workspace_id.clone(),
            installation_id: identity.installation_id.clone(),
            previous_key_id: journal.current_key_id.clone(),
            current_key_id: journal.candidate_key_id.clone(),
            completed_at_unix_seconds: unix_seconds_now()?,
        },
    )?;
    let journal_path = system_dir.join(ROTATION_JOURNAL_FILE);
    if path_exists_regular(&journal_path)? {
        fs::remove_file(&journal_path)?;
        sync_directory(system_dir)?;
    }
    Ok(receipt_path)
}

fn read_rotation_journal(
    path: &Path,
    identity: &InstallationIdentity,
) -> Result<RotationJournal, InstallationRootError> {
    reject_symlink(path)?;
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_DOCUMENT_BYTES {
        return Err(InstallationRootError::InvalidState(
            "rotation journal size is invalid".to_owned(),
        ));
    }
    let journal: RotationJournal = serde_json::from_slice(&fs::read(path)?)?;
    if journal.format_version != DOCUMENT_FORMAT_VERSION
        || journal.workspace_id != identity.workspace_id
        || journal.installation_id != identity.installation_id
        || !valid_key_id(&journal.current_key_id)
        || !valid_key_id(&journal.candidate_key_id)
        || journal.current_key_id == journal.candidate_key_id
    {
        return Err(InstallationRootError::InvalidState(
            "rotation journal authority is invalid".to_owned(),
        ));
    }
    Ok(journal)
}

fn write_rotation_journal(
    path: &Path,
    journal: &RotationJournal,
) -> Result<(), InstallationRootError> {
    write_json_durable(path, journal)
}

fn probe_protected_identity_locked(
    system_dir: &Path,
) -> Result<Option<InstallationIdentity>, InstallationRootError> {
    let mut discovered: Option<InstallationIdentity> = None;
    let mut valid_document_seen = false;
    let mut failures = Vec::new();

    for file_name in [CURRENT_FILE, CANDIDATE_FILE, BACKUP_FILE] {
        let path = system_dir.join(file_name);
        if !path_exists_regular(&path)? {
            continue;
        }
        match read_document(&path) {
            Ok(document) => {
                valid_document_seen = true;
                if document.purpose != CURRENT_PURPOSE {
                    failures.push(format!("{file_name} has an unexpected purpose"));
                    continue;
                }
                let identity = InstallationIdentity::new(
                    document.workspace_id.clone(),
                    document.installation_id.clone(),
                )?;
                if let Some(existing) = &discovered {
                    if existing != &identity {
                        return Err(InstallationRootError::IdentityMismatch(
                            "protected current/candidate/backup documents disagree".to_owned(),
                        ));
                    }
                } else {
                    discovered = Some(identity);
                }
            }
            Err(error) => failures.push(format!("{file_name}: {error}")),
        }
    }

    if discovered.is_none() && (valid_document_seen || !failures.is_empty()) {
        return Err(InstallationRootError::InvalidState(failures.join("; ")));
    }
    Ok(discovered)
}

fn load_best_protected_root<P: PayloadProtector>(
    system_dir: &Path,
    identity: &InstallationIdentity,
    protector: &P,
) -> Result<Option<(InstallationRootKey, PathBuf)>, InstallationRootError> {
    let mut state_seen = false;
    let mut failures = Vec::new();
    // BACKUP_FILE intentionally contains the prior root after a committed
    // rotation. It is authority only for the journaled native recovery path;
    // normal startup must never promote it over databases already using the
    // new current root.
    for file_name in [CURRENT_FILE, CANDIDATE_FILE] {
        let path = system_dir.join(file_name);
        if !path_exists_regular(&path)? {
            continue;
        }
        state_seen = true;
        match read_and_unprotect_document(&path, identity, CURRENT_PURPOSE, protector) {
            Ok(root) => return Ok(Some((root, path))),
            Err(error) => failures.push(format!("{file_name}: {error}")),
        }
    }
    if state_seen {
        Err(InstallationRootError::InvalidState(failures.join("; ")))
    } else {
        Ok(None)
    }
}

fn make_document<P: PayloadProtector>(
    root: &InstallationRootKey,
    identity: &InstallationIdentity,
    purpose: &str,
    protector: &P,
) -> Result<ProtectedDocument, InstallationRootError> {
    let inner = encode_inner(root, identity, purpose)?;
    let ciphertext = protector.protect(inner.as_slice(), identity)?;
    let mut document = ProtectedDocument {
        format_version: DOCUMENT_FORMAT_VERSION,
        algorithm: protector.algorithm().to_owned(),
        purpose: purpose.to_owned(),
        workspace_id: identity.workspace_id.clone(),
        installation_id: identity.installation_id.clone(),
        key_id: root.key_id.clone(),
        protected_payload_hex: hex_encode(&ciphertext),
        document_sha256: String::new(),
    };
    document.document_sha256 = document_hash(&document, &ciphertext);
    Ok(document)
}

fn read_and_unprotect_document<P: PayloadProtector>(
    path: &Path,
    identity: &InstallationIdentity,
    purpose: &str,
    protector: &P,
) -> Result<InstallationRootKey, InstallationRootError> {
    let document = read_document(path)?;
    if document.algorithm != protector.algorithm() {
        return Err(InstallationRootError::InvalidState(format!(
            "unsupported protection algorithm {}",
            document.algorithm
        )));
    }
    if document.purpose != purpose {
        return Err(InstallationRootError::InvalidState(
            "protected purpose does not match its authority".to_owned(),
        ));
    }
    if document.workspace_id != identity.workspace_id
        || document.installation_id != identity.installation_id
    {
        return Err(InstallationRootError::IdentityMismatch(
            "protected payload belongs to a different workspace or installation".to_owned(),
        ));
    }
    let ciphertext = hex_decode(&document.protected_payload_hex)?;
    let plaintext = protector.unprotect(&ciphertext, identity)?;
    decode_inner(plaintext.as_slice(), identity, purpose, &document.key_id)
}

fn read_document(path: &Path) -> Result<ProtectedDocument, InstallationRootError> {
    reject_symlink(path)?;
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_DOCUMENT_BYTES {
        return Err(InstallationRootError::InvalidState(format!(
            "protected document size is invalid: {}",
            path.display()
        )));
    }
    let bytes = fs::read(path)?;
    let document: ProtectedDocument = serde_json::from_slice(&bytes)?;
    if document.format_version != DOCUMENT_FORMAT_VERSION {
        return Err(InstallationRootError::InvalidState(format!(
            "unsupported document format {}",
            document.format_version
        )));
    }
    let ciphertext = hex_decode(&document.protected_payload_hex)?;
    let expected = document_hash(&document, &ciphertext);
    if !strings_equal(&expected, &document.document_sha256) {
        return Err(InstallationRootError::InvalidState(
            "document integrity check failed".to_owned(),
        ));
    }
    Ok(document)
}

fn commit_current_document<P: PayloadProtector>(
    system_dir: &Path,
    document: &ProtectedDocument,
    expected_root: &InstallationRootKey,
    protector: &P,
) -> Result<(), InstallationRootError> {
    let candidate = system_dir.join(CANDIDATE_FILE);
    write_document_durable(&candidate, document)?;
    let verified = read_and_unprotect_document(
        &candidate,
        &InstallationIdentity {
            workspace_id: document.workspace_id.clone(),
            installation_id: document.installation_id.clone(),
        },
        CURRENT_PURPOSE,
        protector,
    )?;
    if !keys_equal(expected_root.as_bytes(), verified.as_bytes()) {
        return Err(InstallationRootError::InvalidState(
            "candidate round-trip changed the installation root".to_owned(),
        ));
    }

    promote_candidate_document(
        system_dir,
        expected_root,
        &InstallationIdentity {
            workspace_id: document.workspace_id.clone(),
            installation_id: document.installation_id.clone(),
        },
        protector,
    )
}

fn promote_candidate_document<P: PayloadProtector>(
    system_dir: &Path,
    expected_root: &InstallationRootKey,
    identity: &InstallationIdentity,
    protector: &P,
) -> Result<(), InstallationRootError> {
    let current = system_dir.join(CURRENT_FILE);
    let candidate = system_dir.join(CANDIDATE_FILE);
    let backup = system_dir.join(BACKUP_FILE);
    let candidate_root =
        read_and_unprotect_document(&candidate, identity, CURRENT_PURPOSE, protector)?;
    if !keys_equal(expected_root.as_bytes(), candidate_root.as_bytes()) {
        return Err(InstallationRootError::InvalidState(
            "protected rotation candidate changed before promotion".to_owned(),
        ));
    }

    if path_exists_regular(&current)? {
        if path_exists_regular(&backup)? {
            reject_symlink(&backup)?;
            fs::remove_file(&backup)?;
            sync_directory(system_dir)?;
        }
        move_file_durable(&current, &backup)?;
    }
    move_file_durable(&candidate, &current)?;
    let committed = read_and_unprotect_document(&current, identity, CURRENT_PURPOSE, protector)?;
    if !keys_equal(expected_root.as_bytes(), committed.as_bytes()) {
        return Err(InstallationRootError::InvalidState(
            "committed installation root failed verification".to_owned(),
        ));
    }
    Ok(())
}

fn import_legacy_recovery_archives<P: PayloadProtector>(
    system_dir: &Path,
    legacy_master_key_path: &Path,
    identity: &InstallationIdentity,
    protector: &P,
) -> Result<usize, InstallationRootError> {
    let Some(parent) = legacy_master_key_path.parent() else {
        return Ok(0);
    };
    if !parent.exists() {
        return Ok(0);
    }
    let base_name = legacy_master_key_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("master.key");
    let prefix = format!("{base_name}.old-");
    let recovery_dir = system_dir.join(RECOVERY_DIRECTORY);
    let mut imported = 0;

    for entry in fs::read_dir(parent)? {
        let entry = entry?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else {
            continue;
        };
        if !name.starts_with(&prefix) {
            continue;
        }
        let source = entry.path();
        reject_symlink(&source)?;
        if !entry.file_type()?.is_file() {
            return Err(InstallationRootError::InvalidState(format!(
                "legacy recovery authority is not a regular file: {name}"
            )));
        }
        let root = read_legacy_root(&source)?;
        fs::create_dir_all(&recovery_dir)?;
        reject_symlink(&recovery_dir)?;
        sync_directory(system_dir)?;
        let archive_id = sha256_hex(name.as_bytes());
        let target = recovery_dir.join(format!("legacy-{}.json", &archive_id[..24]));
        if target.exists() {
            let existing =
                read_and_unprotect_document(&target, identity, RECOVERY_PURPOSE, protector)?;
            if !keys_equal(existing.as_bytes(), root.as_bytes()) {
                return Err(InstallationRootError::InvalidState(format!(
                    "protected recovery archive disagrees with {name}"
                )));
            }
        } else {
            let document = make_document(&root, identity, RECOVERY_PURPOSE, protector)?;
            write_document_durable(&target, &document)?;
            let verified =
                read_and_unprotect_document(&target, identity, RECOVERY_PURPOSE, protector)?;
            if !keys_equal(verified.as_bytes(), root.as_bytes()) {
                return Err(InstallationRootError::InvalidState(format!(
                    "protected recovery archive failed verification for {name}"
                )));
            }
        }
        erase_legacy_plaintext(&source)?;
        imported += 1;
    }
    Ok(imported)
}

fn has_legacy_recovery_archives(
    legacy_master_key_path: &Path,
) -> Result<bool, InstallationRootError> {
    let Some(parent) = legacy_master_key_path.parent() else {
        return Ok(false);
    };
    if !parent.exists() {
        return Ok(false);
    }
    let base_name = legacy_master_key_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("master.key");
    let prefix = format!("{base_name}.old-");
    for entry in fs::read_dir(parent)? {
        let entry = entry?;
        if entry
            .file_name()
            .to_str()
            .is_some_and(|name| name.starts_with(&prefix))
        {
            return Ok(true);
        }
    }
    Ok(false)
}

fn reject_incomplete_legacy_rotation(
    legacy_master_key_path: &Path,
) -> Result<(), InstallationRootError> {
    let Some(parent) = legacy_master_key_path.parent() else {
        return Ok(());
    };
    for file_name in ["master.key.new", "master-key-rotation.lock"] {
        let path = parent.join(file_name);
        if path_exists_regular(&path)? {
            return Err(InstallationRootError::InvalidState(format!(
                "legacy master-key rotation state {file_name} must be recovered before startup"
            )));
        }
    }
    Ok(())
}

fn remove_plaintext_after_verification(
    path: &Path,
    expected: &InstallationRootKey,
) -> Result<(), InstallationRootError> {
    let observed = read_legacy_root(path)?;
    if !keys_equal(expected.as_bytes(), observed.as_bytes()) {
        return Err(InstallationRootError::InvalidState(
            "refusing to remove a plaintext key that does not match protected authority".to_owned(),
        ));
    }
    erase_legacy_plaintext(path)?;
    Ok(())
}

fn write_document_durable(
    path: &Path,
    document: &ProtectedDocument,
) -> Result<(), InstallationRootError> {
    if path.exists() {
        reject_symlink(path)?;
    }
    let bytes = serde_json::to_vec_pretty(document)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(path)?;
    file.write_all(&bytes)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    sync_parent_directory(path)?;
    Ok(())
}

fn write_json_durable<T: Serialize>(path: &Path, value: &T) -> Result<(), InstallationRootError> {
    if path.exists() {
        reject_symlink(path)?;
    }
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            InstallationRootError::InvalidState(
                "rotation authority path has no valid file name".to_owned(),
            )
        })?;
    let temporary = path.with_file_name(format!("{file_name}.new"));
    if temporary.exists() {
        reject_symlink(&temporary)?;
    }
    let bytes = serde_json::to_vec_pretty(value)?;
    let mut file = OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&temporary)?;
    file.write_all(&bytes)?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    drop(file);
    replace_file_durable(&temporary, path)
}

fn acquire_lock(system_dir: &Path) -> Result<File, InstallationRootError> {
    let path = system_dir.join(LOCK_FILE);
    if path.exists() {
        reject_symlink(&path)?;
    }
    let file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(path)?;
    file.lock_exclusive()?;
    Ok(file)
}

fn encode_inner(
    root: &InstallationRootKey,
    identity: &InstallationIdentity,
    purpose: &str,
) -> Result<SensitiveBytes, InstallationRootError> {
    let mut bytes = Vec::with_capacity(256);
    bytes.extend_from_slice(INNER_MAGIC);
    bytes.push(DOCUMENT_FORMAT_VERSION);
    append_field(&mut bytes, purpose.as_bytes())?;
    append_field(&mut bytes, identity.workspace_id.as_bytes())?;
    append_field(&mut bytes, identity.installation_id.as_bytes())?;
    append_field(&mut bytes, root.key_id.as_bytes())?;
    bytes.extend_from_slice(root.as_bytes());
    let mut digest = Sha256::new();
    digest.update(INNER_HASH_DOMAIN);
    digest.update(&bytes);
    bytes.extend_from_slice(&digest.finalize());
    Ok(SensitiveBytes(bytes))
}

fn decode_inner(
    bytes: &[u8],
    identity: &InstallationIdentity,
    purpose: &str,
    outer_key_id: &str,
) -> Result<InstallationRootKey, InstallationRootError> {
    if bytes.len() < INNER_MAGIC.len() + 1 + ROOT_KEY_BYTES + 32 {
        return Err(InstallationRootError::InvalidState(
            "protected payload is truncated".to_owned(),
        ));
    }
    let (signed, observed_digest) = bytes.split_at(bytes.len() - 32);
    let mut digest = Sha256::new();
    digest.update(INNER_HASH_DOMAIN);
    digest.update(signed);
    if !byte_slices_equal(digest.finalize().as_slice(), observed_digest) {
        return Err(InstallationRootError::InvalidState(
            "protected payload integrity check failed".to_owned(),
        ));
    }
    let mut cursor = 0;
    take_exact(signed, &mut cursor, INNER_MAGIC)?;
    if take_byte(signed, &mut cursor)? != DOCUMENT_FORMAT_VERSION {
        return Err(InstallationRootError::InvalidState(
            "protected payload version is unsupported".to_owned(),
        ));
    }
    let inner_purpose = take_field(signed, &mut cursor)?;
    let workspace_id = take_field(signed, &mut cursor)?;
    let installation_id = take_field(signed, &mut cursor)?;
    let key_id = take_field(signed, &mut cursor)?;
    if inner_purpose != purpose.as_bytes()
        || workspace_id != identity.workspace_id.as_bytes()
        || installation_id != identity.installation_id.as_bytes()
        || key_id != outer_key_id.as_bytes()
    {
        return Err(InstallationRootError::IdentityMismatch(
            "protected inner and outer authority bindings disagree".to_owned(),
        ));
    }
    if signed.len().saturating_sub(cursor) != ROOT_KEY_BYTES {
        return Err(InstallationRootError::InvalidState(
            "protected payload has an invalid key length".to_owned(),
        ));
    }
    let mut root = [0_u8; ROOT_KEY_BYTES];
    root.copy_from_slice(&signed[cursor..]);
    Ok(InstallationRootKey {
        bytes: root,
        key_id: outer_key_id.to_owned(),
    })
}

fn append_field(target: &mut Vec<u8>, field: &[u8]) -> Result<(), InstallationRootError> {
    let length = u16::try_from(field.len()).map_err(|_| {
        InstallationRootError::InvalidState("installation identity field is too long".to_owned())
    })?;
    target.extend_from_slice(&length.to_le_bytes());
    target.extend_from_slice(field);
    Ok(())
}

fn take_field<'a>(bytes: &'a [u8], cursor: &mut usize) -> Result<&'a [u8], InstallationRootError> {
    if bytes.len().saturating_sub(*cursor) < 2 {
        return Err(InstallationRootError::InvalidState(
            "protected payload field is truncated".to_owned(),
        ));
    }
    let length = u16::from_le_bytes([bytes[*cursor], bytes[*cursor + 1]]) as usize;
    *cursor += 2;
    if bytes.len().saturating_sub(*cursor) < length {
        return Err(InstallationRootError::InvalidState(
            "protected payload field exceeds its boundary".to_owned(),
        ));
    }
    let field = &bytes[*cursor..*cursor + length];
    *cursor += length;
    Ok(field)
}

fn take_exact(
    bytes: &[u8],
    cursor: &mut usize,
    expected: &[u8],
) -> Result<(), InstallationRootError> {
    if bytes.len().saturating_sub(*cursor) < expected.len()
        || &bytes[*cursor..*cursor + expected.len()] != expected
    {
        return Err(InstallationRootError::InvalidState(
            "protected payload magic is invalid".to_owned(),
        ));
    }
    *cursor += expected.len();
    Ok(())
}

fn take_byte(bytes: &[u8], cursor: &mut usize) -> Result<u8, InstallationRootError> {
    let value = bytes.get(*cursor).copied().ok_or_else(|| {
        InstallationRootError::InvalidState("protected payload is truncated".to_owned())
    })?;
    *cursor += 1;
    Ok(value)
}

fn root_from_exact_bytes(bytes: &[u8]) -> Result<InstallationRootKey, InstallationRootError> {
    if bytes.len() != ROOT_KEY_BYTES {
        return Err(InstallationRootError::InvalidState(format!(
            "legacy installation root must be exactly {ROOT_KEY_BYTES} bytes"
        )));
    }
    let mut root = [0_u8; ROOT_KEY_BYTES];
    root.copy_from_slice(bytes);
    Ok(InstallationRootKey {
        key_id: derive_key_id(&root),
        bytes: root,
    })
}

fn generate_root_key() -> Result<InstallationRootKey, InstallationRootError> {
    let mut root = [0_u8; ROOT_KEY_BYTES];
    getrandom::getrandom(&mut root).map_err(|error| {
        InstallationRootError::Crypto(format!("secure random generation failed: {error}"))
    })?;
    let key_id = derive_key_id(&root);
    Ok(InstallationRootKey {
        bytes: root,
        key_id,
    })
}

fn derive_key_id(root: &[u8; ROOT_KEY_BYTES]) -> String {
    let mut digest = Sha256::new();
    digest.update(KEY_ID_DOMAIN);
    digest.update(root);
    hex_encode(&digest.finalize()[..16])
}

fn document_hash(document: &ProtectedDocument, ciphertext: &[u8]) -> String {
    let mut digest = Sha256::new();
    digest.update(OUTER_HASH_DOMAIN);
    digest.update([document.format_version]);
    update_hash_field(&mut digest, document.algorithm.as_bytes());
    update_hash_field(&mut digest, document.purpose.as_bytes());
    update_hash_field(&mut digest, document.workspace_id.as_bytes());
    update_hash_field(&mut digest, document.installation_id.as_bytes());
    update_hash_field(&mut digest, document.key_id.as_bytes());
    update_hash_field(&mut digest, ciphertext);
    hex_encode(&digest.finalize())
}

fn update_hash_field(digest: &mut Sha256, field: &[u8]) {
    digest.update((field.len() as u64).to_le_bytes());
    digest.update(field);
}

fn validate_identity(identity: &InstallationIdentity) -> Result<(), InstallationRootError> {
    for (label, value) in [
        ("workspace", identity.workspace_id.as_str()),
        ("installation", identity.installation_id.as_str()),
    ] {
        if value.is_empty() || value.len() > 512 || value.chars().any(char::is_control) {
            return Err(InstallationRootError::InvalidState(format!(
                "{label} identity is empty, too long, or contains control characters"
            )));
        }
    }
    Ok(())
}

fn read_legacy_root(path: &Path) -> Result<InstallationRootKey, InstallationRootError> {
    reject_symlink(path)?;
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || !matches!(metadata.len(), 32 | 64) {
        return Err(InstallationRootError::InvalidState(format!(
            "legacy installation root must be a regular 32-byte key or 64-character hex file: {}",
            path.display()
        )));
    }
    let bytes = read_sensitive_file_with_lengths(path, &[32, 64])?;
    if bytes.as_slice().len() == ROOT_KEY_BYTES {
        return root_from_exact_bytes(bytes.as_slice());
    }
    let decoded = decode_legacy_hex(bytes.as_slice())?;
    root_from_exact_bytes(decoded.as_slice())
}

fn read_sensitive_file_with_lengths(
    path: &Path,
    allowed_lengths: &[u64],
) -> Result<SensitiveBytes, InstallationRootError> {
    reject_symlink(path)?;
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() || !allowed_lengths.contains(&metadata.len()) {
        return Err(InstallationRootError::InvalidState(format!(
            "legacy installation-root file has an invalid size: {}",
            path.display()
        )));
    }
    Ok(SensitiveBytes(fs::read(path)?))
}

fn decode_legacy_hex(value: &[u8]) -> Result<SensitiveBytes, InstallationRootError> {
    if value.len() != ROOT_KEY_BYTES * 2 {
        return Err(InstallationRootError::InvalidState(
            "legacy installation-root hex must contain exactly 64 characters".to_owned(),
        ));
    }
    let mut output = SensitiveBytes(vec![0_u8; ROOT_KEY_BYTES]);
    for (index, pair) in value.chunks_exact(2).enumerate() {
        output.as_mut_slice()[index] =
            (legacy_hex_nibble(pair[0])? << 4) | legacy_hex_nibble(pair[1])?;
    }
    Ok(output)
}

fn legacy_hex_nibble(value: u8) -> Result<u8, InstallationRootError> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(value - b'a' + 10),
        b'A'..=b'F' => Ok(value - b'A' + 10),
        _ => Err(InstallationRootError::InvalidState(
            "legacy installation-root file is not hexadecimal".to_owned(),
        )),
    }
}

fn erase_legacy_plaintext(path: &Path) -> Result<(), InstallationRootError> {
    reject_symlink(path)?;
    let length = fs::metadata(path)?.len();
    let zero_length = usize::try_from(length).map_err(|_| {
        InstallationRootError::InvalidState(
            "legacy installation-root file is too large to erase".to_owned(),
        )
    })?;
    let mut file = OpenOptions::new().write(true).truncate(true).open(path)?;
    file.write_all(&vec![0_u8; zero_length])?;
    file.sync_all()?;
    drop(file);
    fs::remove_file(path)?;
    sync_parent_directory(path)
}

fn sync_parent_directory(path: &Path) -> Result<(), InstallationRootError> {
    let parent = path.parent().ok_or_else(|| {
        InstallationRootError::InvalidState(format!(
            "installation-root authority path has no parent: {}",
            path.display()
        ))
    })?;
    sync_directory(parent)
}

#[cfg(windows)]
fn move_file_durable(source: &Path, target: &Path) -> Result<(), InstallationRootError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{MoveFileExW, MOVEFILE_WRITE_THROUGH};

    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        return Err(std::io::Error::last_os_error().into());
    }
    Ok(())
}

#[cfg(windows)]
fn replace_file_durable(source: &Path, target: &Path) -> Result<(), InstallationRootError> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let target_wide: Vec<u16> = target.as_os_str().encode_wide().chain(Some(0)).collect();
    if unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            target_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        return Err(std::io::Error::last_os_error().into());
    }
    Ok(())
}

#[cfg(not(windows))]
fn move_file_durable(source: &Path, target: &Path) -> Result<(), InstallationRootError> {
    fs::rename(source, target)?;
    sync_parent_directory(target)
}

#[cfg(not(windows))]
fn replace_file_durable(source: &Path, target: &Path) -> Result<(), InstallationRootError> {
    fs::rename(source, target)?;
    sync_parent_directory(target)
}

#[cfg(not(windows))]
fn sync_directory(path: &Path) -> Result<(), InstallationRootError> {
    File::open(path)?.sync_all()?;
    Ok(())
}

#[cfg(windows)]
fn sync_directory(_path: &Path) -> Result<(), InstallationRootError> {
    // Windows has no supported portable directory flush. File contents are
    // flushed explicitly, and authority moves use MOVEFILE_WRITE_THROUGH.
    Ok(())
}

fn reject_symlink(path: &Path) -> Result<(), InstallationRootError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata_is_link(&metadata) => Err(InstallationRootError::InvalidState(
            format!("refusing symbolic-link authority path {}", path.display()),
        )),
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn path_exists_regular(path: &Path) -> Result<bool, InstallationRootError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata_is_link(&metadata) => Err(InstallationRootError::InvalidState(
            format!("refusing symbolic-link authority path {}", path.display()),
        )),
        Ok(metadata) if metadata.is_file() => Ok(true),
        Ok(_) => Err(InstallationRootError::InvalidState(format!(
            "authority path is not a regular file: {}",
            path.display()
        ))),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.into()),
    }
}

fn metadata_is_link(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        use windows_sys::Win32::Storage::FileSystem::FILE_ATTRIBUTE_REPARSE_POINT;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }
    #[cfg(not(windows))]
    false
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

fn hex_decode(value: &str) -> Result<Vec<u8>, InstallationRootError> {
    if value.len() & 1 != 0 {
        return Err(InstallationRootError::InvalidState(
            "protected payload hex has an odd length".to_owned(),
        ));
    }
    let mut output = Vec::with_capacity(value.len() / 2);
    let bytes = value.as_bytes();
    for pair in bytes.chunks_exact(2) {
        let high = hex_nibble(pair[0])?;
        let low = hex_nibble(pair[1])?;
        output.push((high << 4) | low);
    }
    Ok(output)
}

fn hex_nibble(value: u8) -> Result<u8, InstallationRootError> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(value - b'a' + 10),
        _ => Err(InstallationRootError::InvalidState(
            "protected payload hex is not lowercase hexadecimal".to_owned(),
        )),
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex_encode(&Sha256::digest(bytes))
}

fn valid_key_id(value: &str) -> bool {
    value.len() == 32 && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn unix_seconds_now() -> Result<u64, InstallationRootError> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| {
            InstallationRootError::InvalidState(format!(
                "system clock is before the Unix epoch: {error}"
            ))
        })
}

fn keys_equal(left: &[u8; ROOT_KEY_BYTES], right: &[u8; ROOT_KEY_BYTES]) -> bool {
    byte_slices_equal(left, right)
}

fn strings_equal(left: &str, right: &str) -> bool {
    byte_slices_equal(left.as_bytes(), right.as_bytes())
}

fn byte_slices_equal(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    left.iter()
        .zip(right)
        .fold(0_u8, |difference, (a, b)| difference | (a ^ b))
        == 0
}

fn zero_bytes(bytes: &mut [u8]) {
    for byte in bytes {
        unsafe { std::ptr::write_volatile(byte, 0) };
    }
    compiler_fence(Ordering::SeqCst);
}

pub(crate) fn clear_secret_bytes(bytes: &mut [u8]) {
    zero_bytes(bytes);
}

fn dpapi_entropy(identity: &InstallationIdentity) -> [u8; 32] {
    let mut digest = Sha256::new();
    digest.update(ENTROPY_DOMAIN);
    update_hash_field(&mut digest, identity.workspace_id.as_bytes());
    update_hash_field(&mut digest, identity.installation_id.as_bytes());
    digest.finalize().into()
}

#[cfg(windows)]
fn platform_protect(
    plaintext: &[u8],
    identity: &InstallationIdentity,
) -> Result<Vec<u8>, InstallationRootError> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let input_length = u32::try_from(plaintext.len()).map_err(|_| {
        InstallationRootError::InvalidState("installation root payload is too large".to_owned())
    })?;
    let mut entropy = dpapi_entropy(identity);
    let input = CRYPT_INTEGER_BLOB {
        cbData: input_length,
        pbData: plaintext.as_ptr().cast_mut(),
    };
    let entropy_blob = CRYPT_INTEGER_BLOB {
        cbData: entropy.len() as u32,
        pbData: entropy.as_mut_ptr(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    let succeeded = unsafe {
        CryptProtectData(
            &input,
            null(),
            &entropy_blob,
            null_mut(),
            null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if succeeded == 0 {
        let error = std::io::Error::last_os_error();
        zero_bytes(&mut entropy);
        return Err(InstallationRootError::Crypto(error.to_string()));
    }
    zero_bytes(&mut entropy);
    if output.pbData.is_null() || output.cbData == 0 {
        if !output.pbData.is_null() {
            unsafe {
                LocalFree(output.pbData.cast());
            }
        }
        return Err(InstallationRootError::Crypto(
            "DPAPI returned an empty protected payload".to_owned(),
        ));
    }
    let result =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec();
    unsafe {
        zero_bytes(std::slice::from_raw_parts_mut(
            output.pbData,
            output.cbData as usize,
        ));
        LocalFree(output.pbData.cast());
    }
    Ok(result)
}

#[cfg(windows)]
fn platform_unprotect(
    ciphertext: &[u8],
    identity: &InstallationIdentity,
) -> Result<SensitiveBytes, InstallationRootError> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::LocalFree;
    use windows_sys::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    let input_length = u32::try_from(ciphertext.len()).map_err(|_| {
        InstallationRootError::InvalidState("protected installation root is too large".to_owned())
    })?;
    let mut entropy = dpapi_entropy(identity);
    let input = CRYPT_INTEGER_BLOB {
        cbData: input_length,
        pbData: ciphertext.as_ptr().cast_mut(),
    };
    let entropy_blob = CRYPT_INTEGER_BLOB {
        cbData: entropy.len() as u32,
        pbData: entropy.as_mut_ptr(),
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    let succeeded = unsafe {
        CryptUnprotectData(
            &input,
            null_mut(),
            &entropy_blob,
            null_mut(),
            null_mut(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )
    };
    if succeeded == 0 {
        let error = std::io::Error::last_os_error();
        zero_bytes(&mut entropy);
        return Err(InstallationRootError::Crypto(error.to_string()));
    }
    zero_bytes(&mut entropy);
    if output.pbData.is_null() || output.cbData == 0 {
        if !output.pbData.is_null() {
            unsafe {
                LocalFree(output.pbData.cast());
            }
        }
        return Err(InstallationRootError::Crypto(
            "DPAPI returned an empty plaintext payload".to_owned(),
        ));
    }
    let result = SensitiveBytes(
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize) }.to_vec(),
    );
    unsafe {
        zero_bytes(std::slice::from_raw_parts_mut(
            output.pbData,
            output.cbData as usize,
        ));
        LocalFree(output.pbData.cast());
    }
    Ok(result)
}

#[cfg(not(windows))]
fn platform_protect(
    _plaintext: &[u8],
    _identity: &InstallationIdentity,
) -> Result<Vec<u8>, InstallationRootError> {
    Err(InstallationRootError::UnsupportedPlatform)
}

#[cfg(not(windows))]
fn platform_unprotect(
    _ciphertext: &[u8],
    _identity: &InstallationIdentity,
) -> Result<SensitiveBytes, InstallationRootError> {
    Err(InstallationRootError::UnsupportedPlatform)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TestProtector;

    impl PayloadProtector for TestProtector {
        fn algorithm(&self) -> &'static str {
            WINDOWS_DPAPI_ALGORITHM
        }

        fn protect(
            &self,
            plaintext: &[u8],
            identity: &InstallationIdentity,
        ) -> Result<Vec<u8>, InstallationRootError> {
            let entropy = dpapi_entropy(identity);
            Ok(plaintext
                .iter()
                .enumerate()
                .map(|(index, byte)| byte ^ entropy[index % entropy.len()] ^ 0xa5)
                .collect())
        }

        fn unprotect(
            &self,
            ciphertext: &[u8],
            identity: &InstallationIdentity,
        ) -> Result<SensitiveBytes, InstallationRootError> {
            Ok(SensitiveBytes(self.protect(ciphertext, identity)?))
        }
    }

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock")
                .as_nanos();
            let path = std::env::temp_dir().join(format!(
                "sahelflow-installation-root-{label}-{}-{nonce}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn identity() -> InstallationIdentity {
        InstallationIdentity::new("workspace-test", "installation-test").expect("identity")
    }

    fn prepare_test(
        root: &Path,
        existing: bool,
        fresh: bool,
    ) -> Result<PreparedInstallationRoot, InstallationRootError> {
        let system_dir = root.join("system");
        let legacy_master_key_path = root.join("master.key");
        prepare_installation_root_with(
            InstallationRootRequest {
                system_dir: &system_dir,
                legacy_master_key_path: &legacy_master_key_path,
                identity: identity(),
                existing_authority_present: existing,
                provably_fresh: fresh,
            },
            &TestProtector,
        )
    }

    fn prepare_rotation_test(
        root: &Path,
    ) -> Result<InstallationRootRotationPreparation, InstallationRootError> {
        prepare_installation_root_rotation_with(&root.join("system"), identity(), &TestProtector)
    }

    #[test]
    fn imports_exact_plaintext_and_recovers_same_root() {
        let directory = TestDirectory::new("import");
        let expected = [0x5a; ROOT_KEY_BYTES];
        fs::write(directory.0.join("master.key"), hex_encode(&expected)).expect("legacy key");
        let prepared = prepare_test(&directory.0, true, false).expect("import root");
        assert_eq!(prepared.root_key.as_bytes(), &expected);
        assert_eq!(
            prepared.disposition,
            InstallationRootDisposition::ImportedLegacyPlaintext
        );
        assert!(!directory.0.join("master.key").exists());
        drop(prepared);

        let recovered = prepare_test(&directory.0, true, false).expect("recover root");
        assert_eq!(recovered.root_key.as_bytes(), &expected);
        assert_eq!(
            recovered.disposition,
            InstallationRootDisposition::RecoveredProtected
        );
    }

    #[test]
    fn refuses_generation_for_an_existing_installation() {
        let directory = TestDirectory::new("existing");
        match prepare_test(&directory.0, true, false) {
            Err(InstallationRootError::NoRecoverableKey) => {}
            Err(error) => panic!("unexpected error: {error}"),
            Ok(_) => panic!("existing installation must fail closed"),
        }
    }

    #[test]
    fn generates_only_with_positive_fresh_proof() {
        let directory = TestDirectory::new("fresh");
        let prepared = prepare_test(&directory.0, false, true).expect("fresh root");
        assert_eq!(
            prepared.disposition,
            InstallationRootDisposition::GeneratedFresh
        );
        assert!(prepared.protected_path.exists());
    }

    #[test]
    fn recovers_candidate_when_current_is_missing() {
        let directory = TestDirectory::new("candidate");
        let first = prepare_test(&directory.0, false, true).expect("fresh root");
        let expected = *first.root_key.as_bytes();
        drop(first);
        let system = directory.0.join("system");
        fs::rename(system.join(CURRENT_FILE), system.join(CANDIDATE_FILE))
            .expect("simulate interruption");

        let recovered = prepare_test(&directory.0, true, false).expect("recover candidate");
        assert_eq!(recovered.root_key.as_bytes(), &expected);
        assert!(system.join(CURRENT_FILE).exists());
    }

    #[test]
    fn imports_legacy_rotation_archives_under_recovery_purpose() {
        let directory = TestDirectory::new("archives");
        fs::write(
            directory.0.join("master.key"),
            hex_encode(&[1_u8; ROOT_KEY_BYTES]),
        )
        .expect("current key");
        fs::write(
            directory.0.join("master.key.old-123"),
            hex_encode(&[2_u8; ROOT_KEY_BYTES]),
        )
        .expect("old key");
        let prepared = prepare_test(&directory.0, true, false).expect("import archives");
        assert_eq!(prepared.imported_recovery_archives, 1);
        assert!(!directory.0.join("master.key.old-123").exists());
        let recovery_files = fs::read_dir(directory.0.join("system").join(RECOVERY_DIRECTORY))
            .expect("recovery directory")
            .count();
        assert_eq!(recovery_files, 1);
    }

    #[test]
    fn rejects_outer_document_tampering() {
        let directory = TestDirectory::new("tamper");
        let prepared = prepare_test(&directory.0, false, true).expect("fresh root");
        drop(prepared);
        let path = directory.0.join("system").join(CURRENT_FILE);
        let mut text = fs::read_to_string(&path).expect("read document");
        text = text.replace("workspace-test", "workspace-evil");
        fs::write(&path, text).expect("tamper document");
        assert!(prepare_test(&directory.0, true, false).is_err());
    }

    #[test]
    fn probe_returns_identity_without_unprotecting_secret() {
        let directory = TestDirectory::new("probe");
        let prepared = prepare_test(&directory.0, false, true).expect("fresh root");
        drop(prepared);
        let observed = probe_protected_identity_locked(&directory.0.join("system"))
            .expect("probe")
            .expect("identity");
        assert_eq!(observed, identity());
    }

    #[test]
    fn refuses_fresh_generation_when_only_a_legacy_archive_exists() {
        let directory = TestDirectory::new("archive-is-footprint");
        fs::write(
            directory.0.join("master.key.old-123"),
            hex_encode(&[7_u8; ROOT_KEY_BYTES]),
        )
        .expect("legacy archive");
        assert!(matches!(
            prepare_test(&directory.0, false, true),
            Err(InstallationRootError::NoRecoverableKey)
        ));
        assert!(!directory.0.join("system").join(CURRENT_FILE).exists());
    }

    #[test]
    fn refuses_incomplete_legacy_rotation_before_root_changes() {
        let directory = TestDirectory::new("rotation-sidecar");
        fs::write(
            directory.0.join("master.key"),
            hex_encode(&[1_u8; ROOT_KEY_BYTES]),
        )
        .expect("current key");
        fs::write(
            directory.0.join("master.key.new"),
            hex_encode(&[2_u8; ROOT_KEY_BYTES]),
        )
        .expect("rotation candidate");
        assert!(matches!(
            prepare_test(&directory.0, true, false),
            Err(InstallationRootError::InvalidState(_))
        ));
        assert!(directory.0.join("master.key").exists());
        assert!(!directory.0.join("system").join(CURRENT_FILE).exists());
    }

    #[test]
    fn protected_rotation_reuses_candidate_and_commits_with_backup() {
        let directory = TestDirectory::new("protected-rotation");
        let initial = prepare_test(&directory.0, false, true).expect("fresh root");
        let previous = *initial.root_key.as_bytes();
        drop(initial);

        let first = match prepare_rotation_test(&directory.0).expect("prepare rotation") {
            InstallationRootRotationPreparation::Ready(rotation) => rotation,
            InstallationRootRotationPreparation::RecoveredCommitted { .. } => {
                panic!("new rotation unexpectedly completed")
            }
        };
        let candidate = *first.candidate_root.as_bytes();
        assert_ne!(candidate, previous);
        drop(first);

        assert!(matches!(
            prepare_test(&directory.0, true, false),
            Err(InstallationRootError::InvalidState(_))
        ));
        let resumed = match prepare_rotation_test(&directory.0).expect("resume rotation") {
            InstallationRootRotationPreparation::Ready(rotation) => rotation,
            InstallationRootRotationPreparation::RecoveredCommitted { .. } => {
                panic!("prepared rotation unexpectedly committed")
            }
        };
        assert_eq!(resumed.current_root.as_bytes(), &previous);
        assert_eq!(resumed.candidate_root.as_bytes(), &candidate);
        let receipt = commit_installation_root_rotation_with(resumed, &TestProtector)
            .expect("commit protected rotation");
        assert!(receipt.exists());

        let system = directory.0.join("system");
        let current = read_and_unprotect_document(
            &system.join(CURRENT_FILE),
            &identity(),
            CURRENT_PURPOSE,
            &TestProtector,
        )
        .expect("current root");
        let backup = read_and_unprotect_document(
            &system.join(BACKUP_FILE),
            &identity(),
            CURRENT_PURPOSE,
            &TestProtector,
        )
        .expect("backup root");
        assert_eq!(current.as_bytes(), &candidate);
        assert_eq!(backup.as_bytes(), &previous);
        assert!(!system.join(CANDIDATE_FILE).exists());
        assert!(!system.join(ROTATION_JOURNAL_FILE).exists());
    }

    #[test]
    fn normal_startup_never_promotes_the_prior_rotation_backup() {
        let directory = TestDirectory::new("protected-rotation-backup-is-not-current");
        let initial = prepare_test(&directory.0, false, true).expect("fresh root");
        drop(initial);

        let rotation = match prepare_rotation_test(&directory.0).expect("prepare rotation") {
            InstallationRootRotationPreparation::Ready(rotation) => rotation,
            InstallationRootRotationPreparation::RecoveredCommitted { .. } => {
                panic!("new rotation unexpectedly completed")
            }
        };
        let prior_root = *rotation.current_root.as_bytes();
        let current_root = *rotation.candidate_root.as_bytes();
        commit_installation_root_rotation_with(rotation, &TestProtector)
            .expect("commit protected rotation");

        let system = directory.0.join("system");
        fs::remove_file(system.join(CURRENT_FILE)).expect("remove current authority");
        assert!(matches!(
            prepare_test(&directory.0, true, false),
            Err(InstallationRootError::NoRecoverableKey)
        ));

        let backup = read_and_unprotect_document(
            &system.join(BACKUP_FILE),
            &identity(),
            CURRENT_PURPOSE,
            &TestProtector,
        )
        .expect("prior backup remains recoverable only by journaled rotation");
        assert_eq!(backup.as_bytes(), &prior_root);
        assert_ne!(backup.as_bytes(), &current_root);
        assert!(!system.join(CURRENT_FILE).exists());
    }

    #[test]
    fn data_rotated_journal_finishes_commit_without_rewriting_databases() {
        let directory = TestDirectory::new("rotation-resume-after-data");
        let initial = prepare_test(&directory.0, false, true).expect("fresh root");
        drop(initial);
        let rotation = match prepare_rotation_test(&directory.0).expect("prepare rotation") {
            InstallationRootRotationPreparation::Ready(rotation) => rotation,
            InstallationRootRotationPreparation::RecoveredCommitted { .. } => {
                panic!("new rotation unexpectedly completed")
            }
        };
        let previous_id = rotation.current_root.key_id().to_owned();
        let candidate_id = rotation.candidate_root.key_id().to_owned();
        let system = directory.0.join("system");
        write_rotation_journal(
            &system.join(ROTATION_JOURNAL_FILE),
            &RotationJournal {
                format_version: DOCUMENT_FORMAT_VERSION,
                state: RotationJournalState::DataRotated,
                workspace_id: identity().workspace_id,
                installation_id: identity().installation_id,
                current_key_id: previous_id,
                candidate_key_id: candidate_id.clone(),
                updated_at_unix_seconds: unix_seconds_now().expect("clock"),
            },
        )
        .expect("record data-rotated state");
        fs::rename(system.join(CURRENT_FILE), system.join(BACKUP_FILE))
            .expect("simulate crash after current moved to backup");
        drop(rotation);

        let receipt = match prepare_rotation_test(&directory.0).expect("recover commit") {
            InstallationRootRotationPreparation::RecoveredCommitted { receipt_path } => {
                receipt_path
            }
            InstallationRootRotationPreparation::Ready(_) => {
                panic!("data-rotated state reran database rotation")
            }
        };
        assert!(receipt.exists());
        let current = read_and_unprotect_document(
            &system.join(CURRENT_FILE),
            &identity(),
            CURRENT_PURPOSE,
            &TestProtector,
        )
        .expect("committed current root");
        assert_eq!(current.key_id(), candidate_id);
        assert!(!system.join(ROTATION_JOURNAL_FILE).exists());
    }
}
