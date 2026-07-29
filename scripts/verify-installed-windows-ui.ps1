$ErrorActionPreference = "Stop"

if ($env:GITHUB_ACTIONS -cne "true") {
    throw "This installed UI harness is restricted to an ephemeral GitHub Actions Windows runner."
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$authority = Get-Content -LiteralPath (Join-Path $repositoryRoot "sahelflow.version.json") -Raw |
    ConvertFrom-Json
$expectedVersion = [string]$authority.version
$expectedProtocol = [int]$authority.runtimeProtocolVersion
$evidenceRoot = Join-Path $env:RUNNER_TEMP "sahelflow-installed-e2e"
$roamingRoot = Join-Path $env:APPDATA "com.sahelflow.desktop"
$runtimeEndpointPath = Join-Path $roamingRoot "runtime-endpoint.json"
$runtimeUiReadyPath = Join-Path $roamingRoot "runtime-ui-ready.json"
$runtimeUiDiagnosticPath = Join-Path $roamingRoot "runtime-ui-diagnostic.json"
$startupDiagnosticPath = Join-Path $roamingRoot "startup-diagnostic.json"
$startupTracePath = Join-Path $roamingRoot "startup-trace.json"
$registryPath = Join-Path $roamingRoot "shop-registry.json"
$nodeCompileCacheRoot = Join-Path `
    (Join-Path $env:LOCALAPPDATA "com.sahelflow.desktop\node-compile-cache") `
    $expectedVersion
$installRoot = "C:\Program Files\SahelFlow"
$exe = Join-Path $installRoot "sahelflow.exe"
$resultPath = Join-Path $evidenceRoot "ui-result.json"
$workspaceWindowTitle = "SahelFlow"
$maxRuntimePrepareMilliseconds = 15000
$maxAuthenticatedUiMilliseconds = 45000

New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

function Read-JsonFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Get-SahelFlowProcesses {
    return @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $path = [string]$_.ExecutablePath
                -not [string]::IsNullOrWhiteSpace($path) -and
                $path.StartsWith("$installRoot\", [System.StringComparison]::OrdinalIgnoreCase)
            } |
            Select-Object Name, ProcessId, ParentProcessId, ExecutablePath, CommandLine, CreationDate
    )
}

if (-not ("SahelFlowUiWindow" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;

public static class SahelFlowUiWindow
{
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool IsWindowVisible(IntPtr window);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowTextLength(IntPtr window);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowText(IntPtr window, StringBuilder text, int maximumCount);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    public static long[] FindVisibleTopLevelWindows(uint processId)
    {
        var windows = new List<long>();
        EnumWindows((window, parameter) =>
        {
            uint ownerProcessId;
            GetWindowThreadProcessId(window, out ownerProcessId);
            if (ownerProcessId == processId && IsWindowVisible(window))
            {
                windows.Add(window.ToInt64());
            }
            return true;
        }, IntPtr.Zero);
        return windows.ToArray();
    }

    public static string GetWindowTitle(long handle)
    {
        var window = new IntPtr(handle);
        var length = GetWindowTextLength(window);
        var text = new StringBuilder(length + 1);
        GetWindowText(window, text, text.Capacity);
        return text.ToString();
    }

    public static bool RequestClose(long handle)
    {
        const uint WM_CLOSE = 0x0010;
        return PostMessage(new IntPtr(handle), WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
    }
}
"@
}

function Get-BusinessIdentity {
    $registry = Read-JsonFile -Path $registryPath
    if (
        $null -eq $registry -or
        $registry.formatVersion -ne 2 -or
        $registry.revision -lt 1 -or
        [string]$registry.workspaceId -notmatch '^[0-9a-f]{32}$' -or
        [string]$registry.installationId -notmatch '^[0-9a-f]{32}$' -or
        [string]::IsNullOrWhiteSpace($registry.activeShopId)
    ) {
        throw "Installed UI verification could not resolve the active shop registry."
    }
    $activeShop = @($registry.shops | Where-Object { $_.id -eq $registry.activeShopId })
    if ($activeShop.Count -ne 1) {
        throw "Installed UI verification did not resolve exactly one active shop."
    }
    if ([string]$activeShop[0].incarnationId -notmatch '^[0-9a-f]{32}$') {
        throw "Installed UI verification did not resolve a valid shop incarnation."
    }
    $databasePath = Join-Path (Join-Path $roamingRoot "shops") $activeShop[0].databaseFile
    if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
        throw "Installed UI verification could not find the active shop database."
    }
    return [pscustomobject]@{
        workspaceId = [string]$registry.workspaceId
        installationId = [string]$registry.installationId
        registryRevision = [int64]$registry.revision
        activeShopId = [string]$registry.activeShopId
        shopIncarnationId = [string]$activeShop[0].incarnationId
        registrySha256 = (Get-FileHash -LiteralPath $registryPath -Algorithm SHA256).Hash
        databasePath = $databasePath
        databaseLength = (Get-Item -LiteralPath $databasePath).Length
        databaseSha256 = (Get-FileHash -LiteralPath $databasePath -Algorithm SHA256).Hash
    }
}

function Wait-ForAuthenticatedUi {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][datetime]$StartedAt,
        [Parameter(Mandatory = $true)][string]$Phase
    )

    $deadline = $StartedAt.AddMilliseconds($maxAuthenticatedUiMilliseconds)
    $lastObservation = $null
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 250
        $Process.Refresh()
        if ($Process.HasExited) {
            throw "${Phase}: SahelFlow exited with code $($Process.ExitCode) before authenticated UI readiness."
        }

        if (Test-Path -LiteralPath $startupDiagnosticPath -PathType Leaf) {
            $diagnosticItem = Get-Item -LiteralPath $startupDiagnosticPath
            $diagnostic = Read-JsonFile -Path $startupDiagnosticPath
            if (
                $diagnosticItem.LastWriteTime -ge $StartedAt.AddSeconds(-2) -and
                $diagnostic.state -eq "blocked" -and
                $diagnostic.appVersion -eq $expectedVersion
            ) {
                throw "${Phase}: SahelFlow reported $($diagnostic.code): $($diagnostic.detail)"
            }
        }

        $endpointItem = Get-Item -LiteralPath $runtimeEndpointPath -ErrorAction SilentlyContinue
        $uiItem = Get-Item -LiteralPath $runtimeUiReadyPath -ErrorAction SilentlyContinue
        $endpoint = $null
        $uiReady = $null
        $matching = $false
        if (
            $null -ne $endpointItem -and
            $null -ne $uiItem -and
            $endpointItem.LastWriteTime -ge $StartedAt.AddSeconds(-2) -and
            $uiItem.LastWriteTime -ge $StartedAt.AddSeconds(-2)
        ) {
            $endpoint = Read-JsonFile -Path $runtimeEndpointPath
            $uiReady = Read-JsonFile -Path $runtimeUiReadyPath
            if ($null -ne $endpoint -and $null -ne $uiReady) {
                $matching =
                    $endpoint.state -eq "ready" -and
                    $endpoint.appVersion -eq $expectedVersion -and
                    [int64]$endpoint.processId -eq [int64]$Process.Id -and
                    -not [string]::IsNullOrWhiteSpace([string]$endpoint.instanceId) -and
                    [int]$uiReady.formatVersion -eq 1 -and
                    [int]$uiReady.protocolVersion -eq $expectedProtocol -and
                    $uiReady.state -eq "ready" -and
                    $uiReady.appVersion -eq $expectedVersion -and
                    $uiReady.instanceId -eq $endpoint.instanceId -and
                    $uiReady.pageUrl -match '^http://(127\.0\.0\.1|localhost):\d+$'
            }
        }

        $handles = @([SahelFlowUiWindow]::FindVisibleTopLevelWindows([uint32]$Process.Id))
        $Process.Refresh()
        $visibleWindows = @(
            foreach ($handle in $handles) {
                [pscustomobject]@{
                    handle = [int64]$handle
                    title = [SahelFlowUiWindow]::GetWindowTitle([int64]$handle)
                }
            }
        )
        $workspaceWindows = @($visibleWindows | Where-Object { $_.title -ceq $workspaceWindowTitle })
        $lastObservation = [pscustomobject]@{
            endpointMatched = [bool]$matching
            responding = [bool]$Process.Responding
            workspaceWindowCount = $workspaceWindows.Count
            visibleWindows = @($visibleWindows)
        }
        if (-not $matching) {
            if ($workspaceWindows.Count -ne 0) {
                throw "${Phase}: workspace became visible before authenticated readiness evidence."
            }
            continue
        }
        if (
            $workspaceWindows.Count -ne 1 -or
            -not $Process.Responding
        ) {
            continue
        }

        return [pscustomobject]@{
            phase = $Phase
            outcome = "authenticated-ui-ready"
            processId = $Process.Id
            responding = $Process.Responding
            visibleWindowHandles = @($workspaceWindows | ForEach-Object { $_.handle })
            visibleWindows = @($visibleWindows)
            endpoint = $endpoint
            uiReady = $uiReady
            processTree = Get-SahelFlowProcesses
            elapsedMilliseconds = [int64]((Get-Date) - $StartedAt).TotalMilliseconds
        }
    }

    $observationJson = if ($null -eq $lastObservation) {
        "no matching endpoint/UI-ready evidence was observed"
    } else {
        $lastObservation | ConvertTo-Json -Depth 5 -Compress
    }
    throw "${Phase}: installed SahelFlow did not produce a matching authenticated, hydrated, responsive UI within $maxAuthenticatedUiMilliseconds ms. Last observation: $observationJson"
}

function Wait-ForCompleteStartupTrace {
    param(
        [Parameter(Mandatory = $true)][datetime]$StartedAt,
        [Parameter(Mandatory = $true)][string]$Phase,
        [Parameter(Mandatory = $true)][string[]]$RequiredStages
    )

    $deadline = (Get-Date).AddSeconds(5)
    $missingStages = @($RequiredStages)
    do {
        $traceItem = Get-Item -LiteralPath $startupTracePath -ErrorAction SilentlyContinue
        if ($null -ne $traceItem -and $traceItem.LastWriteTime -ge $StartedAt.AddSeconds(-2)) {
            $trace = Read-JsonFile -Path $startupTracePath
            if ($null -ne $trace -and [int]$trace.formatVersion -eq 1) {
                $observedStages = @($trace.events | ForEach-Object { [string]$_.stage })
                $missingStages = @(
                    $RequiredStages | Where-Object { $observedStages -notcontains $_ }
                )
                if ($missingStages.Count -eq 0) {
                    return $trace
                }
            }
        }
        Start-Sleep -Milliseconds 100
    } while ((Get-Date) -lt $deadline)

    $missingSummary = $missingStages -join ", "
    throw "${Phase}: startup trace did not settle within 5 seconds. Missing stages: [$missingSummary]."
}

function Wait-ForNodeCompileCache {
    param([Parameter(Mandatory = $true)][string]$Phase)

    $deadline = (Get-Date).AddSeconds(15)
    do {
        $files = @(
            Get-ChildItem -LiteralPath $nodeCompileCacheRoot -Recurse -File `
                -ErrorAction SilentlyContinue
        )
        if ($files.Count -gt 0) {
            $forbidden = @(
                $files | Where-Object {
                    $_.Extension -in @(".exe", ".dll", ".node", ".js", ".cjs", ".mjs", ".cmd", ".bat", ".ps1") -or
                    $_.Name -ieq "server.js" -or
                    $_.Name -ieq "runtime-manifest.json"
                }
            )
            if ($forbidden.Count -ne 0) {
                throw "${Phase}: Node compile cache contains executable or source authority."
            }
            return [pscustomobject]@{
                root = $nodeCompileCacheRoot
                fileCount = $files.Count
                bytes = [int64](($files | Measure-Object -Property Length -Sum).Sum)
                executableOrSourceFiles = 0
            }
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)

    throw "${Phase}: packaged Node did not persist its version-scoped compile cache."
}

function Reset-NodeCompileCacheForCloseProof {
    param([Parameter(Mandatory = $true)][string]$Phase)

    if (Test-Path -LiteralPath $nodeCompileCacheRoot) {
        Remove-Item -LiteralPath $nodeCompileCacheRoot -Recurse -Force
    }
    if (Test-Path -LiteralPath $nodeCompileCacheRoot) {
        throw "${Phase}: could not reset the CI-only compile cache before normal close."
    }
    return (Get-Date).ToString("o")
}

function Close-SahelFlowNormally {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][long[]]$WindowHandles,
        [Parameter(Mandatory = $true)][string]$Phase
    )

    $posted = @(
        foreach ($handle in $WindowHandles) {
            if ([SahelFlowUiWindow]::RequestClose($handle)) {
                $handle
            }
        }
    )
    if ($posted.Count -eq 0) {
        throw "${Phase}: Windows rejected every normal GUI close request."
    }
    if (-not $Process.WaitForExit(30000)) {
        throw "${Phase}: SahelFlow did not exit after a normal GUI close within 30 seconds."
    }

    $deadline = (Get-Date).AddSeconds(20)
    do {
        $remaining = Get-SahelFlowProcesses
        $endpointPresent = Test-Path -LiteralPath $runtimeEndpointPath -PathType Leaf
        if ($remaining.Count -eq 0 -and -not $endpointPresent) {
            return [pscustomobject]@{
                phase = $Phase
                processId = $Process.Id
                windowHandles = @($posted)
                processTreeStopped = $true
                runtimeEndpointRemoved = $true
            }
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)

    $summary = ($remaining | ForEach-Object { "$($_.Name):$($_.ProcessId)" }) -join ", "
    throw "${Phase}: normal close left processes [$summary] or endpointPresent=$endpointPresent."
}

if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw "Installed executable is missing: $exe"
}
if ((Get-SahelFlowProcesses).Count -ne 0) {
    throw "Installed UI verification requires a clean process boundary."
}

$baseline = Get-BusinessIdentity
$launches = @()
$closures = @()
$lifecyclePasses = 3

for ($attempt = 1; $attempt -le $lifecyclePasses; $attempt++) {
    Remove-Item -LiteralPath $runtimeEndpointPath, $runtimeUiReadyPath, `
        $runtimeUiDiagnosticPath, $startupDiagnosticPath, $startupTracePath `
        -Force -ErrorAction SilentlyContinue

    $startedAt = Get-Date
    $process = Start-Process -FilePath $exe -PassThru
    $launch = Wait-ForAuthenticatedUi -Process $process -StartedAt $startedAt `
        -Phase "ui-launch-$attempt"
    $requiredStages = @(
        'native-started',
        'workspace-window-pending',
        'migration-started',
        'migration-complete',
        'runtime-prepare-started',
        'runtime-prepare-complete',
        'runtime-attempt-started',
        'runtime-listening',
        'runtime-ready',
        'ui-navigation-started',
        'ui-ready'
    )
    $startupTrace = Wait-ForCompleteStartupTrace -StartedAt $startedAt `
        -Phase "ui-launch-$attempt" `
        -RequiredStages $requiredStages
    $uiDiagnostic = Read-JsonFile -Path $runtimeUiDiagnosticPath
    $prepareStartedEvents = @(
        $startupTrace.events |
            Where-Object { $_.stage -eq 'runtime-prepare-started' }
    )
    $prepareCompleteEvents = @(
        $startupTrace.events |
            Where-Object { $_.stage -eq 'runtime-prepare-complete' }
    )
    if ($prepareStartedEvents.Count -ne 1 -or $prepareCompleteEvents.Count -ne 1) {
        throw "ui-launch-$attempt did not retain exactly one runtime preparation interval."
    }
    $prepareCompleteMilliseconds = [int64]$prepareCompleteEvents[0].createdAtUnixMilliseconds
    $prepareStartedMilliseconds = [int64]$prepareStartedEvents[0].createdAtUnixMilliseconds
    $runtimePrepareMilliseconds = $prepareCompleteMilliseconds - $prepareStartedMilliseconds
    if (
        $runtimePrepareMilliseconds -lt 0 -or
        $runtimePrepareMilliseconds -gt $maxRuntimePrepareMilliseconds
    ) {
        throw "ui-launch-$attempt runtime preparation took $runtimePrepareMilliseconds ms; maximum is $maxRuntimePrepareMilliseconds ms."
    }
    if (
        $null -eq $uiDiagnostic -or
        $uiDiagnostic.state -ne 'ready' -or
        $uiDiagnostic.code -ne 'RUNTIME_UI_READY_PERSISTED' -or
        $uiDiagnostic.instanceId -ne $launch.endpoint.instanceId -or
        $uiDiagnostic.appVersion -ne $expectedVersion
    ) {
        throw "ui-launch-$attempt did not retain matching successful UI-ready diagnostics."
    }
    $launch | Add-Member -NotePropertyName runtimePreparationMilliseconds `
        -NotePropertyValue $runtimePrepareMilliseconds
    $launch | Add-Member -NotePropertyName startupTrace -NotePropertyValue $startupTrace
    $launch | Add-Member -NotePropertyName uiDiagnostic -NotePropertyValue $uiDiagnostic

    $endpointEvidence = Join-Path $evidenceRoot "runtime-endpoint-ui-launch-$attempt.json"
    $uiEvidence = Join-Path $evidenceRoot "runtime-ui-ready-launch-$attempt.json"
    $uiDiagnosticEvidence = Join-Path $evidenceRoot "runtime-ui-diagnostic-launch-$attempt.json"
    $startupTraceEvidence = Join-Path $evidenceRoot "startup-trace-launch-$attempt.json"
    Copy-Item -LiteralPath $runtimeEndpointPath -Destination $endpointEvidence -Force
    Copy-Item -LiteralPath $runtimeUiReadyPath -Destination $uiEvidence -Force
    Copy-Item -LiteralPath $runtimeUiDiagnosticPath -Destination $uiDiagnosticEvidence -Force
    Copy-Item -LiteralPath $startupTracePath -Destination $startupTraceEvidence -Force

    # The runner is ephemeral. Reset only this version-scoped cache after UI
    # readiness so each post-close cache is attributable to this exact runtime
    # instance while the next launch can still exercise the preceding cache.
    $compileCacheResetAt = Reset-NodeCompileCacheForCloseProof `
        -Phase "ui-close-$attempt"
    $closures += Close-SahelFlowNormally `
        -Process $process `
        -WindowHandles @($launch.visibleWindowHandles) `
        -Phase "ui-close-$attempt"
    $nodeCompileCache = Wait-ForNodeCompileCache -Phase "ui-close-$attempt"
    $launch | Add-Member -NotePropertyName compileCacheResetAt `
        -NotePropertyValue $compileCacheResetAt
    $launch | Add-Member -NotePropertyName nodeCompileCache -NotePropertyValue $nodeCompileCache
    $launches += $launch

    $current = Get-BusinessIdentity
    if (
        $current.workspaceId -ne $baseline.workspaceId -or
        $current.installationId -ne $baseline.installationId -or
        $current.registryRevision -ne $baseline.registryRevision -or
        $current.activeShopId -ne $baseline.activeShopId -or
        $current.shopIncarnationId -ne $baseline.shopIncarnationId -or
        $current.registrySha256 -ne $baseline.registrySha256 -or
        $current.databasePath -ne $baseline.databasePath -or
        $current.databaseLength -ne $baseline.databaseLength -or
        $current.databaseSha256 -ne $baseline.databaseSha256
    ) {
        throw "ui-launch-$attempt changed registry or active-shop database identity."
    }
}

if ($launches.Count -ne $lifecyclePasses -or $closures.Count -ne $lifecyclePasses) {
    throw "Installed UI verification did not complete all $lifecyclePasses launch and normal-close passes."
}
$instanceIds = @($launches | ForEach-Object { $_.endpoint.instanceId })
$uniqueInstanceIds = @($instanceIds | Sort-Object -Unique)
if ($uniqueInstanceIds.Count -ne $instanceIds.Count) {
    throw "An authenticated UI launch reused an earlier runtime instance identity."
}

$result = [ordered]@{
    capturedAt = (Get-Date).ToString("o")
    expectedVersion = $expectedVersion
    expectedProtocol = $expectedProtocol
    acceptance = "authenticated-hydrated-responsive-ui"
    baselineBusinessIdentity = $baseline
    launches = $launches
    closures = $closures
    finalProcesses = Get-SahelFlowProcesses
}
$result | ConvertTo-Json -Depth 16 | Set-Content -LiteralPath $resultPath -Encoding UTF8

Write-Host "Installed authenticated WebView UI proof passed twice for $expectedVersion."
Write-Host "Evidence: $resultPath"
