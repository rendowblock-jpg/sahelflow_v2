$ErrorActionPreference = "Stop"

$evidenceRoot = Join-Path $env:RUNNER_TEMP "sahelflow-installed-e2e"
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
trap {
    $_ | Format-List * -Force | Out-String |
        Set-Content -LiteralPath (Join-Path $evidenceRoot "shutdown-repair-error.txt") -Encoding UTF8
    throw
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$libPath = Join-Path $repositoryRoot "src-tauri\src\lib.rs"
$source = (Get-Content -LiteralPath $libPath -Raw) -replace "`r`n", "`n"

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
} else {
    $pattern = '(?ms)^        \.run\(\|_app_handle, _event\| \{.*?^        \}\);'
    $found = [regex]::Matches($source, $pattern)
    [pscustomobject]@{
        matchCount = $found.Count
        sourceLength = $source.Length
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidenceRoot "shutdown-repair-match.json") -Encoding UTF8
    if ($found.Count -ne 1) {
        throw "Expected exactly one canonical Tauri run-event callback, found $($found.Count)."
    }
    $match = $found[0]
    $source = $source.Substring(0, $match.Index) + $new + $source.Substring($match.Index + $match.Length)
    Set-Content -LiteralPath $libPath -Value $source -Encoding utf8NoBOM
    Write-Host "Applied explicit main-window shutdown path."
}

$repaired = Get-Content -LiteralPath $libPath -Raw
foreach ($required in @(
    'tauri::RunEvent::WindowEvent',
    'tauri::WindowEvent::CloseRequested',
    'label == "main"',
    'app_handle.exit(0)'
)) {
    if (-not $repaired.Contains($required)) {
        throw "Main-window shutdown repair is missing required source: $required"
    }
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
