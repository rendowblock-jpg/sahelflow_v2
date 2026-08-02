#[path = "../shop_lifecycle.rs"]
mod shop_lifecycle;
#[path = "../shop_lifecycle_command.rs"]
mod shop_lifecycle_command;
#[path = "../shop_lifecycle_mutation.rs"]
mod shop_lifecycle_mutation;
#[path = "../shop_lifecycle_switch.rs"]
mod shop_lifecycle_switch;

use self::shop_lifecycle::{ShopLifecycleOperation, ShopLifecycleStage};
use self::shop_lifecycle_command::ShopLifecycleCommand;
use self::shop_lifecycle_mutation::{
    accept_mutation, recover_interrupted_lifecycle, AcceptedMutation, MutationAuthorityError,
};
use self::shop_lifecycle_switch::{accept_switch, AcceptedSwitch, SwitchAuthorityError};
use crate::installation_root_key::InstallationRootKey;
use crate::migration_coordinator::ActiveShopAuthority;
use std::error::Error;
use std::fs::{self, File, OpenOptions};
use std::io::{Error as IoError, ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;

const INBOX_DIRECTORY: &str = "shop-lifecycle-inbox";
const PENDING_DIRECTORY: &str = "pending";
const PROCESSING_DIRECTORY: &str = "processing";
const REJECTED_DIRECTORY: &str = "rejected";
const MAX_COMMAND_BYTES: u64 = 128 * 1024;
const POLL_INTERVAL: Duration = Duration::from_millis(100);
const PLANNED_STOP_TIMEOUT: Duration = Duration::from_secs(12);

static HOST_STARTED: AtomicBool = AtomicBool::new(false);

type HostResult<T> = Result<T, Box<dyn Error>>;

pub(super) fn ensure_started(app: &tauri::AppHandle) -> HostResult<()> {
    if HOST_STARTED
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .is_err()
    {
        return Ok(());
    }

    let app_data_dir = app.path().app_data_dir()?;
    prepare_inbox(&app_data_dir)?;
    let authority = current_authority(app)?;
    let mut installation_root = [0_u8; 32];
    {
        let root = app
            .try_state::<InstallationRootKey>()
            .ok_or_else(|| IoError::other("installation-root authority is missing"))?;
        installation_root.copy_from_slice(root.as_bytes());
    }
    let recovery = recover_interrupted_lifecycle(
        &app_data_dir,
        &authority.migration_set_sha256,
        &installation_root,
        unix_milliseconds(),
    );
    installation_root.fill(0);
    if let Err(error) = recovery {
        HOST_STARTED.store(false, Ordering::Release);
        return Err(Box::new(error));
    }
    let app_handle = app.clone();
    if let Err(error) = std::thread::Builder::new()
        .name("sahelflow-shop-lifecycle".to_string())
        .spawn(move || worker_loop(app_handle, app_data_dir))
    {
        HOST_STARTED.store(false, Ordering::Release);
        return Err(Box::new(error));
    }
    Ok(())
}

fn worker_loop(app: tauri::AppHandle, app_data_dir: PathBuf) {
    loop {
        match claim_next_command(&app_data_dir) {
            Ok(Some(claim)) => process_claim(&app, &app_data_dir, claim),
            Ok(None) => std::thread::sleep(POLL_INTERVAL),
            Err(error) => {
                eprintln!("[sahelflow] shop lifecycle inbox scan failed: {error}");
                std::thread::sleep(Duration::from_secs(1));
            }
        }
    }
}

struct ClaimedCommand {
    operation_id: String,
    path: PathBuf,
}

fn process_claim(app: &tauri::AppHandle, app_data_dir: &Path, claim: ClaimedCommand) {
    let result = read_claimed_command(&claim).and_then(|command| {
        match command.authorization.request.operation {
            ShopLifecycleOperation::Switch => {
                process_switch(app, app_data_dir, &claim.operation_id, command)
            }
            _ => process_mutation(app, app_data_dir, &claim.operation_id, command),
        }
    });
    match result {
        Ok(()) => {
            if let Err(error) = fs::remove_file(&claim.path) {
                eprintln!(
                    "[sahelflow] completed shop lifecycle command could not be removed: {error}"
                );
            }
        }
        Err(error) => {
            eprintln!(
                "[sahelflow] shop lifecycle operation {} failed: {error}",
                claim.operation_id
            );
            if let Err(move_error) = reject_claim(app_data_dir, &claim, &error.to_string()) {
                eprintln!(
                    "[sahelflow] failed shop lifecycle command could not be quarantined: {move_error}"
                );
            }
        }
    }
}

fn process_switch(
    app: &tauri::AppHandle,
    app_data_dir: &Path,
    operation_id: &str,
    command: ShopLifecycleCommand,
) -> HostResult<()> {
    if command.authorization.request.operation_id != operation_id {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "shop lifecycle filename does not match the authenticated operation",
        )
        .into());
    }

    let mut installation_root = [0_u8; 32];
    {
        let root = app
            .try_state::<InstallationRootKey>()
            .ok_or_else(|| IoError::other("installation-root authority is missing"))?;
        installation_root.copy_from_slice(root.as_bytes());
    }
    let migration_set_sha256 = current_authority(app)?.migration_set_sha256;
    let now = unix_milliseconds();
    let mut accepted = match accept_switch(
        app_data_dir,
        &migration_set_sha256,
        &command,
        &installation_root,
        now,
    ) {
        Ok(accepted) => accepted,
        Err(error) => {
            installation_root.fill(0);
            return Err(Box::new(error));
        }
    };
    installation_root.fill(0);

    let origin_generation = match reserve_planned_transition(app) {
        Ok(generation) => generation,
        Err(error) => {
            let _ = accepted.block(unix_milliseconds(), "RUNTIME_TRANSITION_UNAVAILABLE", false);
            return Err(error.into());
        }
    };

    if let Err(error) = execute_switch(app, &mut accepted, origin_generation) {
        return Err(IoError::other(error).into());
    }
    Ok(())
}

fn process_mutation(
    app: &tauri::AppHandle,
    app_data_dir: &Path,
    operation_id: &str,
    command: ShopLifecycleCommand,
) -> HostResult<()> {
    if command.authorization.request.operation_id != operation_id {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "shop lifecycle filename does not match the authenticated operation",
        )
        .into());
    }

    let mut installation_root = [0_u8; 32];
    {
        let root = app
            .try_state::<InstallationRootKey>()
            .ok_or_else(|| IoError::other("installation-root authority is missing"))?;
        installation_root.copy_from_slice(root.as_bytes());
    }
    let migration_set_sha256 = current_authority(app)?.migration_set_sha256;
    let resource_dir = app.path().resource_dir()?;
    let now = unix_milliseconds();
    let mut accepted = match accept_mutation(
        app_data_dir,
        &resource_dir,
        &migration_set_sha256,
        &command,
        &installation_root,
        now,
    ) {
        Ok(accepted) => accepted,
        Err(error) => {
            installation_root.fill(0);
            return Err(Box::new(error));
        }
    };
    installation_root.fill(0);

    let origin_generation = match reserve_planned_transition(app) {
        Ok(generation) => generation,
        Err(error) => {
            let _ = accepted.block(unix_milliseconds(), "RUNTIME_TRANSITION_UNAVAILABLE", false);
            return Err(error.into());
        }
    };

    if let Err(error) = execute_mutation(app, &mut accepted, origin_generation) {
        return Err(IoError::other(error).into());
    }
    Ok(())
}

fn execute_mutation(
    app: &tauri::AppHandle,
    accepted: &mut AcceptedMutation,
    origin_generation: u64,
) -> Result<(), String> {
    accepted
        .transition(ShopLifecycleStage::Quiescing, unix_milliseconds())
        .map_err(|error| {
            fail_mutation_before_stop(app, accepted, origin_generation, error.to_string())
        })?;

    if let Err(error) = stop_planned_runtime(app, origin_generation) {
        let manual = supervisor_in_safe_mode(app);
        let _ = accepted.block(unix_milliseconds(), "CURRENT_RUNTIME_STOP_FAILED", manual);
        if !manual {
            cancel_planned_transition(app, origin_generation);
        }
        return Err(error.to_string());
    }
    accepted
        .transition(ShopLifecycleStage::RuntimeStopped, unix_milliseconds())
        .map_err(|error| error.to_string())?;

    let committed = match accepted.commit(unix_milliseconds()) {
        Ok(committed) => committed,
        Err(MutationAuthorityError::ManualRecoveryRequired(error)) => {
            let _ = accepted.block(unix_milliseconds(), "REGISTRY_COMMIT_RECOVERY_FAILED", true);
            show_manual_recovery(app, &error);
            return Err(error);
        }
        Err(error) => {
            if let Err(recovery_error) =
                recover_mutation_prior(app, accepted, origin_generation, "MUTATION_COMMIT_REJECTED")
            {
                let _ = accepted.block(unix_milliseconds(), "PRIOR_RUNTIME_RECOVERY_FAILED", true);
                show_manual_recovery(app, &recovery_error);
                return Err(format!("{error}; {recovery_error}"));
            }
            return Err(error.to_string());
        }
    };
    replace_current_authority(app, committed.target_authority.clone()).map_err(|error| {
        show_manual_recovery(app, &error.to_string());
        error.to_string()
    })?;
    accepted
        .transition(ShopLifecycleStage::RuntimeStarting, unix_milliseconds())
        .map_err(|error| error.to_string())?;

    match start_planned_runtime(app, origin_generation) {
        Ok(runtime) => {
            if let Err(error) = activate_ready_runtime(app, &runtime) {
                let recovery = recover_mutation_after_target_failure(
                    app,
                    accepted,
                    runtime.generation,
                    "TARGET_RUNTIME_NAVIGATION_FAILED",
                );
                return match recovery {
                    Ok(()) => Err(error.to_string()),
                    Err(recovery_error) => {
                        show_manual_recovery(app, &recovery_error);
                        Err(format!("{error}; {recovery_error}"))
                    }
                };
            }
            accepted
                .complete(unix_milliseconds())
                .map_err(|error| error.to_string())?;
            Ok(())
        }
        Err(error) => match recover_mutation_after_target_failure(
            app,
            accepted,
            current_generation(app).unwrap_or(origin_generation),
            "TARGET_RUNTIME_START_FAILED",
        ) {
            Ok(()) => Err(error.to_string()),
            Err(recovery_error) => {
                show_manual_recovery(app, &recovery_error);
                Err(format!("{error}; {recovery_error}"))
            }
        },
    }
}

fn fail_mutation_before_stop(
    app: &tauri::AppHandle,
    accepted: &mut AcceptedMutation,
    origin_generation: u64,
    error: String,
) -> String {
    cancel_planned_transition(app, origin_generation);
    let _ = accepted.block(unix_milliseconds(), "LIFECYCLE_JOURNAL_FAILED", false);
    error
}

fn recover_mutation_prior(
    app: &tauri::AppHandle,
    accepted: &mut AcceptedMutation,
    expected_previous_generation: u64,
    failure_code: &str,
) -> Result<(), String> {
    let prior = accepted
        .compensate(unix_milliseconds(), failure_code)
        .map_err(|error| error.to_string())?;
    replace_current_authority(app, prior).map_err(|error| error.to_string())?;
    let runtime = start_planned_runtime(app, expected_previous_generation)
        .map_err(|error| error.to_string())?;
    activate_ready_runtime(app, &runtime).map_err(|error| error.to_string())?;
    accepted
        .complete_recovery(unix_milliseconds())
        .map_err(|error| error.to_string())
}

fn recover_mutation_after_target_failure(
    app: &tauri::AppHandle,
    accepted: &mut AcceptedMutation,
    failed_generation: u64,
    failure_code: &str,
) -> Result<(), String> {
    if runtime_present(app, failed_generation) {
        stop_planned_runtime(app, failed_generation).map_err(|error| error.to_string())?;
    } else {
        mark_planned_generation_failed(app, failed_generation)
            .map_err(|error| error.to_string())?;
    }
    let prior = accepted
        .compensate(unix_milliseconds(), failure_code)
        .map_err(|error| error.to_string())?;
    replace_current_authority(app, prior).map_err(|error| error.to_string())?;
    let runtime =
        start_planned_runtime(app, failed_generation).map_err(|error| error.to_string())?;
    activate_ready_runtime(app, &runtime).map_err(|error| error.to_string())?;
    accepted
        .complete_recovery(unix_milliseconds())
        .map_err(|error| error.to_string())
}

fn execute_switch(
    app: &tauri::AppHandle,
    accepted: &mut AcceptedSwitch,
    origin_generation: u64,
) -> Result<(), String> {
    accepted
        .transition(ShopLifecycleStage::Quiescing, unix_milliseconds())
        .map_err(|error| fail_before_stop(app, accepted, origin_generation, error.to_string()))?;

    if let Err(error) = stop_planned_runtime(app, origin_generation) {
        let manual = supervisor_in_safe_mode(app);
        let _ = accepted.block(unix_milliseconds(), "CURRENT_RUNTIME_STOP_FAILED", manual);
        if !manual {
            cancel_planned_transition(app, origin_generation);
        }
        return Err(error.to_string());
    }
    accepted
        .transition(ShopLifecycleStage::RuntimeStopped, unix_milliseconds())
        .map_err(|error| error.to_string())?;

    let committed = match accepted.commit_registry(unix_milliseconds()) {
        Ok(committed) => committed,
        Err(SwitchAuthorityError::ManualRecoveryRequired(error)) => {
            let _ = accepted.block(unix_milliseconds(), "REGISTRY_COMMIT_RECOVERY_FAILED", true);
            show_manual_recovery(app, &error);
            return Err(error);
        }
        Err(error) => {
            if let Err(recovery_error) = recover_prior_without_commit(
                app,
                accepted,
                origin_generation,
                "REGISTRY_COMMIT_REJECTED",
            ) {
                let _ = accepted.block(unix_milliseconds(), "PRIOR_RUNTIME_RECOVERY_FAILED", true);
                show_manual_recovery(app, &recovery_error);
                return Err(format!("{error}; {recovery_error}"));
            }
            return Err(error.to_string());
        }
    };
    replace_current_authority(app, committed.target_authority.clone()).map_err(|error| {
        show_manual_recovery(app, &error.to_string());
        error.to_string()
    })?;
    accepted
        .transition(ShopLifecycleStage::RuntimeStarting, unix_milliseconds())
        .map_err(|error| error.to_string())?;

    match start_planned_runtime(app, origin_generation) {
        Ok(runtime) => {
            if let Err(error) = activate_ready_runtime(app, &runtime) {
                let recovery = recover_after_target_failure(
                    app,
                    accepted,
                    runtime.generation,
                    "TARGET_RUNTIME_NAVIGATION_FAILED",
                );
                return match recovery {
                    Ok(()) => Err(error.to_string()),
                    Err(recovery_error) => {
                        show_manual_recovery(app, &recovery_error);
                        Err(format!("{error}; {recovery_error}"))
                    }
                };
            }
            accepted
                .complete(unix_milliseconds())
                .map_err(|error| error.to_string())?;
            Ok(())
        }
        Err(error) => match recover_after_target_failure(
            app,
            accepted,
            current_generation(app).unwrap_or(origin_generation),
            "TARGET_RUNTIME_START_FAILED",
        ) {
            Ok(()) => Err(error.to_string()),
            Err(recovery_error) => {
                show_manual_recovery(app, &recovery_error);
                Err(format!("{error}; {recovery_error}"))
            }
        },
    }
}

fn fail_before_stop(
    app: &tauri::AppHandle,
    accepted: &mut AcceptedSwitch,
    origin_generation: u64,
    error: String,
) -> String {
    cancel_planned_transition(app, origin_generation);
    let _ = accepted.block(unix_milliseconds(), "LIFECYCLE_JOURNAL_FAILED", false);
    error
}

fn recover_prior_without_commit(
    app: &tauri::AppHandle,
    accepted: &mut AcceptedSwitch,
    expected_previous_generation: u64,
    failure_code: &str,
) -> Result<(), String> {
    accepted
        .begin_compensation(unix_milliseconds(), failure_code)
        .map_err(|error| error.to_string())?;
    let prior = accepted.previous_authority().clone();
    replace_current_authority(app, prior).map_err(|error| error.to_string())?;
    let runtime = start_planned_runtime(app, expected_previous_generation)
        .map_err(|error| error.to_string())?;
    activate_ready_runtime(app, &runtime).map_err(|error| error.to_string())?;
    accepted
        .complete_recovery(unix_milliseconds())
        .map_err(|error| error.to_string())
}

fn recover_after_target_failure(
    app: &tauri::AppHandle,
    accepted: &mut AcceptedSwitch,
    failed_generation: u64,
    failure_code: &str,
) -> Result<(), String> {
    if runtime_present(app, failed_generation) {
        stop_planned_runtime(app, failed_generation).map_err(|error| error.to_string())?;
    } else {
        mark_planned_generation_failed(app, failed_generation)
            .map_err(|error| error.to_string())?;
    }
    let prior = accepted
        .compensate_registry(unix_milliseconds(), failure_code)
        .map_err(|error| error.to_string())?;
    replace_current_authority(app, prior).map_err(|error| error.to_string())?;
    let runtime =
        start_planned_runtime(app, failed_generation).map_err(|error| error.to_string())?;
    activate_ready_runtime(app, &runtime).map_err(|error| error.to_string())?;
    accepted
        .complete_recovery(unix_milliseconds())
        .map_err(|error| error.to_string())
}

fn reserve_planned_transition(app: &tauri::AppHandle) -> Result<u64, IoError> {
    let state = app
        .try_state::<std::sync::Mutex<crate::SpawnedChildren>>()
        .ok_or_else(|| IoError::other("runtime supervisor state is missing"))?;
    let mut children = state
        .lock()
        .map_err(|_| IoError::other("runtime supervisor state is poisoned"))?;
    if children.server.is_none() || !children.supervisor.runtime_ready() {
        return Err(IoError::other("the current runtime is not ready"));
    }
    let generation = children.supervisor.current_generation();
    children
        .supervisor
        .begin_planned_transition(generation)
        .map_err(IoError::other)?;
    Ok(generation)
}

fn cancel_planned_transition(app: &tauri::AppHandle, generation: u64) {
    if let Some(state) = app.try_state::<std::sync::Mutex<crate::SpawnedChildren>>() {
        if let Ok(mut children) = state.lock() {
            children.supervisor.cancel_planned_transition(generation);
        }
    }
}

fn stop_planned_runtime(app: &tauri::AppHandle, generation: u64) -> Result<(), IoError> {
    let server = {
        let state = app
            .try_state::<std::sync::Mutex<crate::SpawnedChildren>>()
            .ok_or_else(|| IoError::other("runtime supervisor state is missing"))?;
        let children = state
            .lock()
            .map_err(|_| IoError::other("runtime supervisor state is poisoned"))?;
        if children.supervisor.current_generation() != generation
            || children.supervisor.planned_transition_origin().is_none()
            || !children.supervisor.runtime_ready()
        {
            return Err(IoError::other(
                "planned runtime stop authority is stale or unavailable",
            ));
        }
        children
            .shutdown_authority
            .as_ref()
            .ok_or_else(|| IoError::other("runtime shutdown authority is missing"))?
            .flush_compile_cache()?;
        children
            .server
            .as_ref()
            .cloned()
            .ok_or_else(|| IoError::other("runtime server process is missing"))?
    };
    crate::stop_process_tree(&server, "planned shop lifecycle runtime")?;

    let deadline = Instant::now() + PLANNED_STOP_TIMEOUT;
    loop {
        let state = app
            .try_state::<std::sync::Mutex<crate::SpawnedChildren>>()
            .ok_or_else(|| IoError::other("runtime supervisor state is missing"))?;
        let children = state
            .lock()
            .map_err(|_| IoError::other("runtime supervisor state is poisoned"))?;
        if children.supervisor.in_safe_mode() {
            return Err(IoError::other(
                "runtime containment became uncertain during the planned stop",
            ));
        }
        if children.supervisor.current_generation() != generation {
            return Err(IoError::other(
                "runtime generation changed during the planned stop",
            ));
        }
        if children.server.is_none() && !children.supervisor.runtime_ready() {
            return Ok(());
        }
        drop(children);
        if Instant::now() >= deadline {
            return Err(IoError::new(
                ErrorKind::TimedOut,
                "planned runtime stop did not complete within the containment bound",
            ));
        }
        std::thread::sleep(Duration::from_millis(10));
    }
}

fn start_planned_runtime(
    app: &tauri::AppHandle,
    expected_previous_generation: u64,
) -> Result<crate::SpawnedRuntime, IoError> {
    let generation = {
        let state = app
            .try_state::<std::sync::Mutex<crate::SpawnedChildren>>()
            .ok_or_else(|| IoError::other("runtime supervisor state is missing"))?;
        let mut children = state
            .lock()
            .map_err(|_| IoError::other("runtime supervisor state is poisoned"))?;
        if children.server.is_some() {
            return Err(IoError::other(
                "a runtime process is still registered before planned startup",
            ));
        }
        children
            .supervisor
            .begin_planned_generation(expected_previous_generation)
            .map_err(IoError::other)?
    };

    let prepared = match crate::prepare_runtime(app) {
        Ok(prepared) => prepared,
        Err(error) => {
            mark_planned_generation_failed(app, generation)?;
            return Err(IoError::other(error.to_string()));
        }
    };
    match crate::spawn_runtime_generation(app, generation, &prepared) {
        Ok(runtime) => Ok(runtime),
        Err(error) => {
            mark_planned_generation_failed(app, generation)?;
            Err(IoError::other(error.to_string()))
        }
    }
}

fn activate_ready_runtime(
    app: &tauri::AppHandle,
    runtime: &crate::SpawnedRuntime,
) -> Result<(), IoError> {
    super::show_ready(app, &runtime.protocol.bootstrap_url())
        .map_err(|error| IoError::other(error.to_string()))?;
    {
        let state = app
            .try_state::<std::sync::Mutex<crate::SpawnedChildren>>()
            .ok_or_else(|| IoError::other("runtime supervisor state is missing"))?;
        let mut children = state
            .lock()
            .map_err(|_| IoError::other("runtime supervisor state is poisoned"))?;
        children
            .supervisor
            .finish_planned_transition(runtime.generation)
            .map_err(IoError::other)?;
    }
    let environment = crate::sidecar_env(app, &runtime.protocol)
        .map_err(|error| IoError::other(error.to_string()))?;
    crate::spawn_sidecar_and_watch(app.clone(), environment, runtime.generation)
}

fn mark_planned_generation_failed(app: &tauri::AppHandle, generation: u64) -> Result<(), IoError> {
    let state = app
        .try_state::<std::sync::Mutex<crate::SpawnedChildren>>()
        .ok_or_else(|| IoError::other("runtime supervisor state is missing"))?;
    let mut children = state
        .lock()
        .map_err(|_| IoError::other("runtime supervisor state is poisoned"))?;
    if children.supervisor.current_generation() != generation || children.server.is_some() {
        return Err(IoError::other(
            "failed planned generation no longer has exact supervisor authority",
        ));
    }
    children.supervisor.record_restart_failure(generation);
    if children.supervisor.in_safe_mode() {
        return Err(IoError::other(
            "failed planned generation entered containment safe mode",
        ));
    }
    Ok(())
}

fn current_generation(app: &tauri::AppHandle) -> Result<u64, IoError> {
    let state = app
        .try_state::<std::sync::Mutex<crate::SpawnedChildren>>()
        .ok_or_else(|| IoError::other("runtime supervisor state is missing"))?;
    let children = state
        .lock()
        .map_err(|_| IoError::other("runtime supervisor state is poisoned"))?;
    Ok(children.supervisor.current_generation())
}

fn runtime_present(app: &tauri::AppHandle, generation: u64) -> bool {
    app.try_state::<std::sync::Mutex<crate::SpawnedChildren>>()
        .and_then(|state| {
            state.lock().ok().map(|children| {
                children.supervisor.current_generation() == generation
                    && children.server.is_some()
                    && children.supervisor.runtime_ready()
            })
        })
        .unwrap_or(false)
}

fn supervisor_in_safe_mode(app: &tauri::AppHandle) -> bool {
    app.try_state::<std::sync::Mutex<crate::SpawnedChildren>>()
        .and_then(|state| {
            state
                .lock()
                .ok()
                .map(|children| children.supervisor.in_safe_mode())
        })
        .unwrap_or(true)
}

fn current_authority(app: &tauri::AppHandle) -> Result<ActiveShopAuthority, IoError> {
    let state = app
        .try_state::<std::sync::Mutex<ActiveShopAuthority>>()
        .ok_or_else(|| IoError::other("shop authority state is missing"))?;
    state
        .lock()
        .map_err(|_| IoError::other("shop authority state is poisoned"))
        .map(|authority| authority.clone())
}

fn replace_current_authority(
    app: &tauri::AppHandle,
    authority: ActiveShopAuthority,
) -> Result<(), IoError> {
    let state = app
        .try_state::<std::sync::Mutex<ActiveShopAuthority>>()
        .ok_or_else(|| IoError::other("shop authority state is missing"))?;
    *state
        .lock()
        .map_err(|_| IoError::other("shop authority state is poisoned"))? = authority;
    Ok(())
}

fn show_manual_recovery(app: &tauri::AppHandle, detail: &str) {
    if let Err(error) = super::show_blocked(
        app,
        "SF-SHOP-LIFECYCLE-MANUAL-RECOVERY",
        &format!(
            "Native shop lifecycle could not prove safe compensation: {detail}. SahelFlow will not start another lifecycle operation until the installation is recovered."
        ),
    ) {
        eprintln!("[sahelflow] could not show lifecycle recovery block: {error}");
    }
}

fn prepare_inbox(app_data_dir: &Path) -> Result<(), IoError> {
    let root = app_data_dir.join(INBOX_DIRECTORY);
    for directory in [PENDING_DIRECTORY, PROCESSING_DIRECTORY, REJECTED_DIRECTORY] {
        let path = root.join(directory);
        fs::create_dir_all(&path)?;
        let metadata = fs::symlink_metadata(&path)?;
        if path_is_link(&metadata) || !metadata.is_dir() {
            return Err(IoError::new(
                ErrorKind::PermissionDenied,
                format!("shop lifecycle inbox {} is redirected", path.display()),
            ));
        }
    }
    Ok(())
}

fn claim_next_command(app_data_dir: &Path) -> Result<Option<ClaimedCommand>, IoError> {
    let root = app_data_dir.join(INBOX_DIRECTORY);
    let pending = root.join(PENDING_DIRECTORY);
    let processing = root.join(PROCESSING_DIRECTORY);
    let mut candidates = fs::read_dir(&pending)?
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            valid_command_filename(&name).then_some((name, entry.path()))
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| left.0.cmp(&right.0));

    for (name, source) in candidates {
        let metadata = fs::symlink_metadata(&source)?;
        if path_is_link(&metadata)
            || !metadata.is_file()
            || metadata.len() == 0
            || metadata.len() > MAX_COMMAND_BYTES
        {
            continue;
        }
        let operation_id = name.trim_end_matches(".json").to_string();
        let target = processing.join(format!("{operation_id}.processing"));
        match fs::rename(&source, &target) {
            Ok(()) => {
                return Ok(Some(ClaimedCommand {
                    operation_id,
                    path: target,
                }))
            }
            Err(error) if error.kind() == ErrorKind::NotFound => continue,
            Err(error) => return Err(error),
        }
    }
    Ok(None)
}

fn read_claimed_command(claim: &ClaimedCommand) -> HostResult<ShopLifecycleCommand> {
    let metadata = fs::symlink_metadata(&claim.path)?;
    if path_is_link(&metadata)
        || !metadata.is_file()
        || metadata.len() == 0
        || metadata.len() > MAX_COMMAND_BYTES
    {
        return Err(IoError::new(
            ErrorKind::PermissionDenied,
            "claimed shop lifecycle command is not a bounded regular file",
        )
        .into());
    }
    Ok(serde_json::from_slice(&fs::read(&claim.path)?)?)
}

fn reject_claim(app_data_dir: &Path, claim: &ClaimedCommand, error: &str) -> Result<(), IoError> {
    let rejected = app_data_dir.join(INBOX_DIRECTORY).join(REJECTED_DIRECTORY);
    let target = rejected.join(format!(
        "{}-{}.json",
        claim.operation_id,
        unix_milliseconds()
    ));
    fs::rename(&claim.path, &target)?;
    let diagnostic = rejected.join(format!(
        "{}-{}.error.json",
        claim.operation_id,
        unix_milliseconds()
    ));
    write_diagnostic_atomic(
        &diagnostic,
        &serde_json::json!({
            "formatVersion": 1,
            "operationId": claim.operation_id,
            "error": bounded_error(error),
            "createdAtUnixMs": unix_milliseconds(),
        }),
    )
}

fn write_diagnostic_atomic(path: &Path, value: &serde_json::Value) -> Result<(), IoError> {
    let parent = path
        .parent()
        .ok_or_else(|| IoError::other("diagnostic path has no parent"))?;
    fs::create_dir_all(parent)?;
    let temporary = parent.join(format!(".{}.tmp", unix_milliseconds()));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&temporary)?;
    serde_json::to_writer_pretty(&mut file, value)
        .map_err(|error| IoError::new(ErrorKind::InvalidData, error))?;
    file.write_all(b"\n")?;
    file.sync_all()?;
    drop(file);
    fs::rename(&temporary, path)?;
    File::open(parent)?.sync_all()
}

fn bounded_error(value: &str) -> String {
    value.chars().take(2_048).collect()
}

fn valid_command_filename(value: &str) -> bool {
    let Some(operation_id) = value.strip_suffix(".json") else {
        return false;
    };
    operation_id.len() == 32
        && operation_id
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}

fn path_is_link(metadata: &fs::Metadata) -> bool {
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

fn unix_milliseconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
        .unwrap_or(0)
}
