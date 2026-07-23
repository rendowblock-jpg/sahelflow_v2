$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$libPath = Join-Path $repositoryRoot "src-tauri\src\lib.rs"
$source = (Get-Content -LiteralPath $libPath -Raw) -replace "`r`n", "`n"

$old = @'
        .run(|_app_handle, _event| {
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                if matches!(
                    _event,
                    tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
                ) {
                    if let Some(state) =
                        _app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>()
                    {
                        if let Ok(mut children) = state.lock() {
                            children.kill_all();
                        }
                    }
                    if let Ok(app_data_dir) = _app_handle.path().app_data_dir() {
                        runtime_protocol::remove_manifest(&app_data_dir);
                    }
                }
            }
        });
'@

$new = @'
        .run(|app_handle, event| {
            #[cfg(not(debug_assertions))]
            {
                use tauri::Manager;
                let main_window_close = matches!(
                    &event,
                    tauri::RunEvent::WindowEvent {
                        label,
                        event: tauri::WindowEvent::CloseRequested { .. },
                        ..
                    } if label == "main"
                );
                let shutdown = main_window_close
                    || matches!(
                        event,
                        tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit
                    );
                if shutdown {
                    if let Some(state) =
                        app_handle.try_state::<std::sync::Mutex<SpawnedChildren>>()
                    {
                        if let Ok(mut children) = state.lock() {
                            children.kill_all();
                        }
                    }
                    if let Ok(app_data_dir) = app_handle.path().app_data_dir() {
                        runtime_protocol::remove_manifest(&app_data_dir);
                    }
                }
                if main_window_close {
                    app_handle.exit(0);
                }
            }
        });
'@

if ($source.Contains($new)) {
    Write-Host "Explicit main-window shutdown path is already present."
} elseif ($source.Contains($old)) {
    $source = $source.Replace($old, $new)
    Set-Content -LiteralPath $libPath -Value $source -Encoding utf8NoBOM
    Write-Host "Applied explicit main-window shutdown path."
} else {
    throw "Could not locate the canonical Tauri run-event shutdown block."
}

Push-Location $repositoryRoot
try {
    git diff --check
    if ($LASTEXITCODE -ne 0) {
        throw "main-window shutdown repair introduced whitespace errors"
    }
} finally {
    Pop-Location
}
