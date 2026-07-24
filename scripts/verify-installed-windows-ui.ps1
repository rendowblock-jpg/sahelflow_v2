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
$exe = "C:\Program Files\SahelFlow\sahelflow.exe"
$resultPath = Join-Path $evidenceRoot "ui-result.json"

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
                $_.Name -ieq "sahelflow.exe" -or
                $_.Name -ieq "bun.exe" -or
                $_.Name -ieq "sahelflow-whatsapp.exe"
            } |
            Select-Object Name, ProcessId, ParentProcessId, ExecutablePath, CommandLine, CreationDate
    )
}

if (-not ("SahelFlowUiWindow" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class SahelFlowUiWindow
{
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool IsWindowVisible(IntPtr window);

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
    if ($null -eq $registry -or $registry.revision -lt 1 -or [string]::IsNullOrWhiteSpace($registry.activeShopId)) {
        throw "Installed UI verification could not resolve the active shop registry."
    }
    $activeShop = @($registry.shops | Where-Object { $_.id -eq $registry.activeShopId })
    if ($activeShop.Count -ne 1) {
        throw "Installed UI verification did not resolve exactly one active shop."
    }
    $databasePath = Join-Path (Join-Path $roamingRoot "shops") $activeShop[0].databaseFile
    if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
        throw "Installed UI verification could not find the active shop database."
    }
    return [pscustomobject]@{
        registryRevision = [int64]$registry.revision
        activeShopId = [string]$registry.activeShopId
        registrySha256 = (Get-FileHash -LiteralPath $registryPath -Algorithm SHA256).Hash
        databasePath = $databasePath
        databaseLength = (Get-Item -LiteralPath $databasePath).Length
        databaseSha256 = (Get-FileHash -LiteralPath $databasePath -Algorithm SHA256).Hash
    }
}

function Wait-ForPromptVisibleWindow {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][string]$Phase
    )

    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 100
        $Process.Refresh()
        if ($Process.HasExited) {
            throw "${Phase}: SahelFlow exited before presenting a prompt startup window."
        }
        $handles = @([SahelFlowUiWindow]::FindVisibleTopLevelWindows([uint32]$Process.Id))
        if ($handles.Count -gt 0 -and $Process.Responding) {
            return [pscustomobject]@{
                outcome = "prompt-responsive-window"
                elapsedMilliseconds = [int64]((Get-Date) - $Process.StartTime).TotalMilliseconds
                visibleWindowHandles = @($handles)
            }
        }
    }
    throw "${Phase}: SahelFlow did not present a responsive visible window within 15 seconds."
}

function Wait-ForAuthenticatedUi {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][datetime]$StartedAt,
        [Parameter(Mandatory = $true)][string]$Phase
    )

    $deadline = (Get-Date).AddMinutes(5)
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
        if ($null -eq $endpointItem -or $null -eq $uiItem) {
            continue
        }
        if (
            $endpointItem.LastWriteTime -lt $StartedAt.AddSeconds(-2) -or
            $uiItem.LastWriteTime -lt $StartedAt.AddSeconds(-2)
        ) {
            continue
        }

        $endpoint = Read-JsonFile -Path $runtimeEndpointPath
        $uiReady = Read-JsonFile -Path $runtimeUiReadyPath
        if ($null -eq $endpoint -or $null -eq $uiReady) {
            continue
        }

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
        if (-not $matching) {
            continue
        }

        $handles = @([SahelFlowUiWindow]::FindVisibleTopLevelWindows([uint32]$Process.Id))
        $Process.Refresh()
        if ($handles.Count -eq 0 -or -not $Process.Responding) {
            continue
        }

        return [pscustomobject]@{
            phase = $Phase
            outcome = "authenticated-ui-ready"
            processId = $Process.Id
            responding = $Process.Responding
            visibleWindowHandles = @($handles)
            endpoint = $endpoint
            uiReady = $uiReady
            processTree = Get-SahelFlowProcesses
        }
    }

    throw "${Phase}: installed SahelFlow did not produce a matching authenticated, hydrated, responsive UI within five minutes."
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

for ($attempt = 1; $attempt -le 2; $attempt++) {
    Remove-Item -LiteralPath $runtimeEndpointPath, $runtimeUiReadyPath, `
        $runtimeUiDiagnosticPath, $startupDiagnosticPath, $startupTracePath `
        -Force -ErrorAction SilentlyContinue

    $startedAt = Get-Date
    $process = Start-Process -FilePath $exe -PassThru
    $promptWindow = Wait-ForPromptVisibleWindow -Process $process -Phase "ui-launch-$attempt"
    $launch = Wait-ForAuthenticatedUi -Process $process -StartedAt $startedAt -Phase "ui-launch-$attempt"
    $startupTrace = Read-JsonFile -Path $startupTracePath
    $uiDiagnostic = Read-JsonFile -Path $runtimeUiDiagnosticPath
    if ($null -eq $startupTrace -or [int]$startupTrace.formatVersion -ne 1) {
        throw "ui-launch-$attempt did not retain a valid startup trace."
    }
    $requiredStages = @(
        'native-started',
        'startup-screen-visible',
        'migration-started',
        'migration-complete',
        'runtime-prepare-started',
        'runtime-prepare-complete',
        'runtime-attempt-started',
        'runtime-ready',
        'ui-navigation-started',
        'ui-ready'
    )
    $observedStages = @($startupTrace.events | ForEach-Object { [string]$_.stage })
    foreach ($requiredStage in $requiredStages) {
        if ($observedStages -notcontains $requiredStage) {
            throw "ui-launch-$attempt startup trace omitted stage $requiredStage."
        }
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
    $launch | Add-Member -NotePropertyName promptWindow -NotePropertyValue $promptWindow
    $launch | Add-Member -NotePropertyName startupTrace -NotePropertyValue $startupTrace
    $launch | Add-Member -NotePropertyName uiDiagnostic -NotePropertyValue $uiDiagnostic
    $launches += $launch

    $endpointEvidence = Join-Path $evidenceRoot "runtime-endpoint-ui-launch-$attempt.json"
    $uiEvidence = Join-Path $evidenceRoot "runtime-ui-ready-launch-$attempt.json"
    $uiDiagnosticEvidence = Join-Path $evidenceRoot "runtime-ui-diagnostic-launch-$attempt.json"
    $startupTraceEvidence = Join-Path $evidenceRoot "startup-trace-launch-$attempt.json"
    Copy-Item -LiteralPath $runtimeEndpointPath -Destination $endpointEvidence -Force
    Copy-Item -LiteralPath $runtimeUiReadyPath -Destination $uiEvidence -Force
    Copy-Item -LiteralPath $runtimeUiDiagnosticPath -Destination $uiDiagnosticEvidence -Force
    Copy-Item -LiteralPath $startupTracePath -Destination $startupTraceEvidence -Force

    $closures += Close-SahelFlowNormally `
        -Process $process `
        -WindowHandles @($launch.visibleWindowHandles) `
        -Phase "ui-close-$attempt"

    $current = Get-BusinessIdentity
    if (
        $current.registryRevision -ne $baseline.registryRevision -or
        $current.activeShopId -ne $baseline.activeShopId -or
        $current.registrySha256 -ne $baseline.registrySha256 -or
        $current.databasePath -ne $baseline.databasePath -or
        $current.databaseLength -ne $baseline.databaseLength -or
        $current.databaseSha256 -ne $baseline.databaseSha256
    ) {
        throw "ui-launch-$attempt changed registry or active-shop database identity."
    }
}

if ($launches.Count -ne 2 -or $closures.Count -ne 2) {
    throw "Installed UI verification did not complete two launch and normal-close passes."
}
if ($launches[0].endpoint.instanceId -eq $launches[1].endpoint.instanceId) {
    throw "Second authenticated UI launch reused the first runtime instance identity."
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
