use super::shop_lifecycle::{ShopLifecycleOperation, ShopLifecycleStage};

use super::shop_lifecycle_command::{
    AuthenticatedShopLifecycleJournal, ShopLifecycleCommand, ShopLifecycleCommandError,
    ShopLifecyclePayload,
};

use crate::migration_coordinator::{self, ActiveShopAuthority};

use fs2::FileExt;

use rusqlite::{params, Connection, DatabaseName, OptionalExtension};

use serde::{Deserialize, Serialize};

use sha2::{Digest, Sha256};

use std::fmt;

use std::fs::{self, File, OpenOptions};

use std::io::{copy as copy_io, Error as IoError, ErrorKind, Read, Write};

use std::path::{Path, PathBuf};

const REGISTRY_FILE: &str = "shop-registry.json";

const REGISTRY_FORMAT_VERSION: u8 = 2;

const LIFECYCLE_LOCK_FILE: &str = "shop-lifecycle.lock";

const MIGRATION_LOCK_FILE: &str = "migration.lock";

const JOURNAL_DIRECTORY: &str = "shop-lifecycle-journal";

const CURRENT_JOURNAL_FILE: &str = "current.json";

const ARCHIVE_DIRECTORY: &str = "shop-archives";

const ARCHIVE_DATABASE_FILE: &str = "database.db";

const ARCHIVE_MANIFEST_FILE: &str = "manifest.json";

const ARCHIVE_KEY_DOMAIN: &[u8] = b"sahelflow.shop-archive.key.v1";

const ARCHIVE_MAC_DOMAIN: &[u8] = b"sahelflow.shop-archive.v1";

const MIGRATION_SET_HASH_DOMAIN: &[u8] = b"sahelflow-migration-set-v1\n";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShopRecord {
    id: String,
    incarnation_id: String,
    name: String,
    database_file: String,
    icon: Option<String>,
    created_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ShopRegistry {
    format_version: u8,
    revision: u64,
    workspace_id: String,
    installation_id: String,
    active_shop_id: Option<String>,
    shops: Vec<ShopRecord>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
enum ArchiveStatus {
    Archived,
    DeletedRescue,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveState {
    format_version: u8,
    archive_id: String,
    workspace_id: String,
    installation_id: String,
    status: ArchiveStatus,
    shop: ShopRecord,
    database_sha256: String,
    archived_at_unix_ms: u64,
    source_registry_revision: u64,
    operation_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveEnvelope {
    format_version: u8,
    key_id: String,
    state: ArchiveState,
    mac: String,
}

struct Migration {
    name: String,
    checksum: String,
    sql: String,
}

#[derive(Clone, Debug)]
pub struct MutationCommit {
    pub previous_authority: ActiveShopAuthority,
    pub target_authority: ActiveShopAuthority,
}

enum RollbackAction {
    RegistryOnly,
    RemoveDatabase(PathBuf),
    RestoreArchivedDatabase {
        archive_directory: PathBuf,
        archive_database: PathBuf,
        live_database: PathBuf,
    },
}

struct RollbackPlan {
    previous_registry: ShopRegistry,
    action: RollbackAction,
}

pub struct AcceptedMutation {
    app_data_dir: PathBuf,
    resource_dir: PathBuf,
    migration_set_sha256: String,
    installation_root: [u8; 32],
    journal: AuthenticatedShopLifecycleJournal,
    previous_authority: ActiveShopAuthority,
    rollback: Option<RollbackPlan>,
    finalize_archive: Option<PathBuf>,
    post_commit_remove: Option<PathBuf>,
    registry_committed: bool,
    committed: Option<MutationCommit>,
    _lifecycle_lock: FileLock,
    _migration_lock: FileLock,
}

impl Drop for AcceptedMutation {
    fn drop(&mut self) {
        self.installation_root.fill(0);
    }
}

impl AcceptedMutation {
    pub fn previous_authority(&self) -> &ActiveShopAuthority {
        &self.previous_authority
    }
}

impl AcceptedMutation {
    pub fn transition(
        &mut self,
        next: ShopLifecycleStage,
        now_unix_ms: u64,
    ) -> Result<(), MutationAuthorityError> {
        self.journal
            .transition(&self.installation_root, next, now_unix_ms, None)?;
        self.persist_journal()
    }
}
