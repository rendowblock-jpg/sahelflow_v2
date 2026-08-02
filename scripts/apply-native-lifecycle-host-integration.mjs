import { readFileSync, writeFileSync } from "node:fs";

const path = "src-tauri/src/startup_recovery/shop_lifecycle_host.rs";
let source = readFileSync(path, "utf8");

function replaceExact(label, before, after) {
  if (!source.includes(before)) {
    throw new Error(`Missing ${label} integration anchor`);
  }
  source = source.replace(before, after);
}

replaceExact(
  "module imports",
`#[path = "../shop_lifecycle_switch.rs"]
mod shop_lifecycle_switch;

use self::shop_lifecycle::ShopLifecycleStage;
use self::shop_lifecycle_command::ShopLifecycleCommand;
use self::shop_lifecycle_switch::{accept_switch, AcceptedSwitch, SwitchAuthorityError};`,
`#[path = "../shop_lifecycle_switch.rs"]
mod shop_lifecycle_switch;
#[path = "../shop_lifecycle_mutation.rs"]
mod shop_lifecycle_mutation;

use self::shop_lifecycle::{ShopLifecycleOperation, ShopLifecycleStage};
use self::shop_lifecycle_command::ShopLifecycleCommand;
use self::shop_lifecycle_mutation::{
    accept_mutation, recover_interrupted_lifecycle, AcceptedMutation, MutationAuthorityError,
};
use self::shop_lifecycle_switch::{accept_switch, AcceptedSwitch, SwitchAuthorityError};`,
);

replaceExact(
  "startup recovery",
`    let app_data_dir = app.path().app_data_dir()?;
    prepare_inbox(&app_data_dir)?;
    let app_handle = app.clone();`,
`    let app_data_dir = app.path().app_data_dir()?;
    prepare_inbox(&app_data_dir)?;
    let authority = current_authority(app)?;
    let mut installation_root = [0_u8; 32];
    {
        let root = app
            .try_state::<crate::InstallationRootKey>()
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
    let app_handle = app.clone();`,
);

replaceExact(
  "command dispatch",
`    let result = read_claimed_command(&claim)
        .and_then(|command| process_switch(app, app_data_dir, &claim.operation_id, command));`,
`    let result = read_claimed_command(&claim).and_then(|command| {
        match command.authorization.request.operation {
            ShopLifecycleOperation::Switch => {
                process_switch(app, app_data_dir, &claim.operation_id, command)
            }
            _ => process_mutation(app, app_data_dir, &claim.operation_id, command),
        }
    });`,
);

const mutationFunctions = String.raw`
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
            .try_state::<crate::InstallationRootKey>()
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
            let _ = accepted.block(
                unix_milliseconds(),
                "RUNTIME_TRANSITION_UNAVAILABLE",
                false,
            );
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
            let _ = accepted.block(
                unix_milliseconds(),
                "REGISTRY_COMMIT_RECOVERY_FAILED",
                true,
            );
            show_manual_recovery(app, &error);
            return Err(error);
        }
        Err(error) => {
            if let Err(recovery_error) = recover_mutation_prior(
                app,
                accepted,
                origin_generation,
                "MUTATION_COMMIT_REJECTED",
            ) {
                let _ = accepted.block(
                    unix_milliseconds(),
                    "PRIOR_RUNTIME_RECOVERY_FAILED",
                    true,
                );
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

`;

replaceExact(
  "mutation executor insertion",
  "fn execute_switch(\n",
  `${mutationFunctions}fn execute_switch(\n`,
);

source = source.replaceAll(
  "Native shop switching could not prove safe compensation:",
  "Native shop lifecycle could not prove safe compensation:",
);

writeFileSync(path, source);
