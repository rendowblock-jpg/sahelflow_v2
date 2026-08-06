param(
    [int]$RemoteDebuggingPort = 9222,
    [int]$ObservationTimeoutMilliseconds = 105000
)

$ErrorActionPreference = "Stop"

if ($env:GITHUB_ACTIONS -cne "true") {
    throw "This diagnostic is restricted to an ephemeral GitHub Actions Windows runner."
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$evidenceRoot = Join-Path $env:RUNNER_TEMP "sahelflow-webview-transition-diagnostic"
$roamingRoot = Join-Path $env:APPDATA "com.sahelflow.desktop"
$installRoot = "C:\Program Files\SahelFlow"
$exe = Join-Path $installRoot "sahelflow.exe"
$eventsPath = Join-Path $evidenceRoot "webview-cdp-events.jsonl"
$summaryPath = Join-Path $evidenceRoot "webview-cdp-summary.json"
$observerStdout = Join-Path $evidenceRoot "webview-observer-stdout.txt"
$observerStderr = Join-Path $evidenceRoot "webview-observer-stderr.txt"
$launchResultPath = Join-Path $evidenceRoot "diagnostic-launch.json"
$processInventoryPath = Join-Path $evidenceRoot "processes-at-observer-completion.json"
$diagnosticFiles = @(
    "startup-diagnostic.json",
    "runtime-probe-diagnostic.json",
    "runtime-readiness-diagnostic.json",
    "runtime-endpoint.json",
    "runtime-ui-ready.json",
    "runtime-ui-diagnostic.json",
    "runtime-browser-diagnostic.jsonl",
    "startup-trace.json"
)

New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw "Installed executable is missing: $exe"
}

$installedProcesses = @(
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $path = [string]$_.ExecutablePath
            -not [string]::IsNullOrWhiteSpace($path) -and
            $path.StartsWith("$installRoot\", [System.StringComparison]::OrdinalIgnoreCase)
        }
)
if ($installedProcesses.Count -ne 0) {
    throw "The WebView diagnostic requires a clean installed-process boundary."
}

function Get-SahelFlowWebViewProcesses {
    return @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Name -ieq "msedgewebview2.exe" -and
                [string]$_.CommandLine -match "com\.sahelflow\.desktop"
            }
    )
}

# The native lifecycle proof launches the installed WebView before this step.
# WebView2 may retain that browser process and reuse it for the observed launch;
# additional browser arguments cannot retrofit a process that already exists.
# Drain only processes bound to SahelFlow's user-data profile after confirming
# the installed application itself has stopped.
$naturalDrainDeadline = (Get-Date).AddSeconds(10)
do {
    $lingeringWebViews = Get-SahelFlowWebViewProcesses
    if ($lingeringWebViews.Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $naturalDrainDeadline)

$forcedWebViewProcessIds = @(
    $lingeringWebViews | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
        [int64]$_.ProcessId
    }
)
$forcedDrainDeadline = (Get-Date).AddSeconds(10)
do {
    $remainingWebViews = Get-SahelFlowWebViewProcesses
    if ($remainingWebViews.Count -eq 0) { break }
    Start-Sleep -Milliseconds 250
} while ((Get-Date) -lt $forcedDrainDeadline)
if ($remainingWebViews.Count -ne 0) {
    throw "SahelFlow's retained WebView2 browser process did not stop before observation."
}

foreach ($relative in $diagnosticFiles) {
    Remove-Item -LiteralPath (Join-Path $roamingRoot $relative) -Force -ErrorAction SilentlyContinue
}

$bunCommand = Get-Command bun.exe -CommandType Application -ErrorAction SilentlyContinue
if ($null -ne $bunCommand) {
    $bun = $bunCommand.Source
} else {
    $npmRoot = (& npm root --global).Trim()
    $bun = @(
        Get-ChildItem -LiteralPath (Join-Path $npmRoot "bun") -Recurse `
            -Filter "bun.exe" -File -ErrorAction Stop |
            Select-Object -ExpandProperty FullName
    ) | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($bun)) {
        throw "The native Bun executable was not found."
    }
}
$observerPath = Join-Path $PSScriptRoot "observe-installed-webview-cdp.mjs"
$endpoint = "http://127.0.0.1:$RemoteDebuggingPort"
$previousBrowserArguments = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$observer = $null
$app = $null
$startedAt = Get-Date
$failure = $null

try {
    $remoteDebuggingArgument = "--remote-debugging-port=$RemoteDebuggingPort"
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = if (
        [string]::IsNullOrWhiteSpace($previousBrowserArguments)
    ) {
        $remoteDebuggingArgument
    } elseif ($previousBrowserArguments -match "(?:^|\s)--remote-debugging-port=\d+(?:\s|$)") {
        $previousBrowserArguments
    } else {
        "$previousBrowserArguments $remoteDebuggingArgument"
    }
    $observerArguments = @(
        "run",
        $observerPath,
        "--endpoint=$endpoint",
        "--output=$eventsPath",
        "--summary=$summaryPath",
        "--timeout=$ObservationTimeoutMilliseconds"
    )
    $observer = Start-Process -FilePath $bun `
        -ArgumentList $observerArguments `
        -WorkingDirectory $repositoryRoot `
        -RedirectStandardOutput $observerStdout `
        -RedirectStandardError $observerStderr `
        -PassThru

    Start-Sleep -Milliseconds 500
    $app = Start-Process -FilePath $exe -PassThru

    $observerDeadline = (Get-Date).AddMilliseconds($ObservationTimeoutMilliseconds + 15000)
    while (-not $observer.HasExited -and (Get-Date) -lt $observerDeadline) {
        Start-Sleep -Milliseconds 250
        $observer.Refresh()
    }
    if (-not $observer.HasExited) {
        throw "The CDP observer did not stop inside its bounded deadline."
    }
    if ($observer.ExitCode -ne 0) {
        throw "The CDP observer exited with code $($observer.ExitCode)."
    }
} catch {
    $failure = $_
} finally {
    @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $_.Name -ieq "sahelflow.exe" -or
                $_.Name -ieq "node.exe" -or
                $_.Name -ieq "sahelflow-whatsapp.exe" -or
                $_.Name -ieq "msedgewebview2.exe"
            } |
            Select-Object Name, ProcessId, ParentProcessId, ExecutablePath, CommandLine, CreationDate
    ) | ConvertTo-Json -Depth 6 |
        Set-Content -LiteralPath $processInventoryPath -Encoding UTF8

    foreach ($relative in $diagnosticFiles) {
        $source = Join-Path $roamingRoot $relative
        if (Test-Path -LiteralPath $source -PathType Leaf) {
            Copy-Item -LiteralPath $source -Destination (Join-Path $evidenceRoot $relative) -Force
        }
    }

    [pscustomobject]@{
        capturedAt = (Get-Date).ToUniversalTime().ToString("o")
        startedAt = $startedAt.ToUniversalTime().ToString("o")
        sourceSha = $env:SOURCE_SHA
        appProcessId = if ($null -ne $app) { $app.Id } else { $null }
        observerProcessId = if ($null -ne $observer) { $observer.Id } else { $null }
        observerExitCode = if ($null -ne $observer -and $observer.HasExited) { $observer.ExitCode } else { $null }
        remoteDebuggingPort = $RemoteDebuggingPort
        forcedWebViewProcessIds = $forcedWebViewProcessIds
        productionBinaryModified = $false
        failure = if ($null -ne $failure) { [string]$failure.Exception.Message } else { $null }
    } | ConvertTo-Json -Depth 5 |
        Set-Content -LiteralPath $launchResultPath -Encoding UTF8

    if ($null -ne $observer -and -not $observer.HasExited) {
        Stop-Process -Id $observer.Id -Force -ErrorAction SilentlyContinue
    }
    @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $path = [string]$_.ExecutablePath
                -not [string]::IsNullOrWhiteSpace($path) -and
                $path.StartsWith("$installRoot\", [System.StringComparison]::OrdinalIgnoreCase)
            }
    ) | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

    if ($null -eq $previousBrowserArguments) {
        Remove-Item Env:\WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS -ErrorAction SilentlyContinue
    } else {
        $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $previousBrowserArguments
    }
}

if ($null -ne $failure) {
    throw $failure
}

Write-Host "Installed WebView2 transition diagnostics captured in $evidenceRoot"
if (Test-Path -LiteralPath $summaryPath -PathType Leaf) {
    Write-Host "SF_WEBVIEW_TRANSITION_SUMMARY_BEGIN"
    Write-Host (Get-Content -LiteralPath $summaryPath -Raw)
    Write-Host "SF_WEBVIEW_TRANSITION_SUMMARY_END"
}
