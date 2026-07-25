param(
    [Parameter(Mandatory = $true)]
    [string]$MsiPath
)

$ErrorActionPreference = "Stop"

if ($env:GITHUB_ACTIONS -cne "true") {
    throw "This destructive install harness is restricted to an ephemeral GitHub Actions Windows runner."
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$authority = Get-Content -LiteralPath (Join-Path $repositoryRoot "sahelflow.version.json") -Raw |
    ConvertFrom-Json
$expectedVersion = [string]$authority.version
$builtStandaloneRoot = Join-Path $repositoryRoot "src-tauri\resources\standalone"
$standaloneManifestPath = Join-Path $builtStandaloneRoot `
    "sahelflow-standalone-manifest.json"
$standaloneManifest = Get-Content -LiteralPath $standaloneManifestPath -Raw |
    ConvertFrom-Json
$expectedTree = [string]$standaloneManifest.treeSha256
$expectedFileCount = [int64]$standaloneManifest.fileCount
$expectedManifestSha256 = (Get-FileHash -LiteralPath $standaloneManifestPath -Algorithm SHA256).Hash
$expectedServerSha256 = (
    Get-FileHash -LiteralPath (Join-Path $builtStandaloneRoot "server.js") -Algorithm SHA256
).Hash

$resolvedMsi = (Resolve-Path -LiteralPath $MsiPath).Path
$evidenceRoot = Join-Path $env:RUNNER_TEMP "sahelflow-installed-e2e"
$installLog = Join-Path $evidenceRoot "install.log"
$resultPath = Join-Path $evidenceRoot "result.json"
$roamingRoot = Join-Path $env:APPDATA "com.sahelflow.desktop"
$localRoot = Join-Path $env:LOCALAPPDATA "com.sahelflow.desktop"
$runtimeCacheRoot = Join-Path $localRoot "runtime-cache"
$runtimeEndpointPath = Join-Path $roamingRoot "runtime-endpoint.json"
$startupDiagnosticPath = Join-Path $roamingRoot "startup-diagnostic.json"
$registryPath = Join-Path $roamingRoot "shop-registry.json"
$installedRuntimeRoot = "C:\Program Files\SahelFlow\standalone"
$installedRuntimeManifestPath = Join-Path $installedRuntimeRoot `
    "sahelflow-standalone-manifest.json"
$installedServerPath = Join-Path $installedRuntimeRoot "server.js"

New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

function Get-InstalledSahelFlow {
    $locations = @(
        "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    return @(
        Get-ItemProperty -Path $locations -ErrorAction SilentlyContinue |
            Where-Object { $_.DisplayName -eq "SahelFlow" }
    )
}

function Get-SahelFlowProcessTree {
    $all = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $roots = @($all | Where-Object { $_.Name -ieq "sahelflow.exe" })
    $ids = @($roots.ProcessId)
    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($child in @($all | Where-Object { $ids -contains $_.ParentProcessId })) {
            if ($ids -notcontains $child.ProcessId) {
                $ids += $child.ProcessId
                $changed = $true
            }
        }
    }

    return @(
        $all |
            Where-Object { $ids -contains $_.ProcessId } |
            Select-Object Name, ProcessId, ParentProcessId, ExecutablePath, CommandLine, CreationDate
    )
}

function Read-JsonFile {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }
    try {
        return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    } catch {
        return [pscustomobject]@{
            decodeError = $_.Exception.Message
            raw = Get-Content -LiteralPath $Path -Raw
        }
    }
}

function Wait-ForLaunchOutcome {
    param(
        [Parameter(Mandatory = $true)]
        [System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)]
        [datetime]$StartedAt,
        [Parameter(Mandatory = $true)]
        [string]$Phase
    )

    $deadline = (Get-Date).AddMinutes(4)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        $Process.Refresh()

        if ($Process.HasExited) {
            return [pscustomobject]@{
                phase = $Phase
                outcome = "exited"
                exitCode = $Process.ExitCode
                processId = $Process.Id
                endpoint = $null
                diagnostic = Read-JsonFile $startupDiagnosticPath
                processTree = Get-SahelFlowProcessTree
            }
        }

        if (Test-Path -LiteralPath $runtimeEndpointPath -PathType Leaf) {
            $item = Get-Item -LiteralPath $runtimeEndpointPath
            if ($item.LastWriteTime -ge $StartedAt.AddSeconds(-2)) {
                $endpoint = Read-JsonFile $runtimeEndpointPath
                if ($endpoint.state -eq "ready" -and $endpoint.appVersion -eq $expectedVersion) {
                    return [pscustomobject]@{
                        phase = $Phase
                        outcome = "ready"
                        exitCode = $null
                        processId = $Process.Id
                        endpoint = $endpoint
                        diagnostic = Read-JsonFile $startupDiagnosticPath
                        processTree = Get-SahelFlowProcessTree
                    }
                }
            }
        }

        if (Test-Path -LiteralPath $startupDiagnosticPath -PathType Leaf) {
            $item = Get-Item -LiteralPath $startupDiagnosticPath
            if ($item.LastWriteTime -ge $StartedAt.AddSeconds(-2)) {
                $diagnostic = Read-JsonFile $startupDiagnosticPath
                if ($diagnostic.state -eq "blocked" -and $diagnostic.appVersion -eq $expectedVersion) {
                    return [pscustomobject]@{
                        phase = $Phase
                        outcome = "blocked"
                        exitCode = $null
                        processId = $Process.Id
                        endpoint = Read-JsonFile $runtimeEndpointPath
                        diagnostic = $diagnostic
                        processTree = Get-SahelFlowProcessTree
                    }
                }
            }
        }
    }

    return [pscustomobject]@{
        phase = $Phase
        outcome = "timeout"
        exitCode = $null
        processId = $Process.Id
        endpoint = Read-JsonFile $runtimeEndpointPath
        diagnostic = Read-JsonFile $startupDiagnosticPath
        processTree = Get-SahelFlowProcessTree
    }
}

if (-not ("SahelFlowWindowCloser" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class SahelFlowWindowCloser
{
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    public static long[] FindTopLevelWindows(uint processId)
    {
        var windows = new List<long>();
        EnumWindows((window, parameter) =>
        {
            uint ownerProcessId;
            GetWindowThreadProcessId(window, out ownerProcessId);
            if (ownerProcessId == processId)
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

function Close-SahelFlowNormally {
    param([System.Diagnostics.Process]$Process)

    $Process.Refresh()
    if ($Process.HasExited) {
        throw "SahelFlow exited before the normal close request could be proven."
    }

    $handles = @(
        [SahelFlowWindowCloser]::FindTopLevelWindows([uint32]$Process.Id)
    )
    if ($handles.Count -eq 0) {
        $Process.Refresh()
        if ($Process.MainWindowHandle -ne [IntPtr]::Zero) {
            $handles = @($Process.MainWindowHandle.ToInt64())
        }
    }
    if ($handles.Count -eq 0) {
        throw "SahelFlow exposed no top-level window for a normal close request."
    }

    $posted = @(
        foreach ($handle in $handles) {
            if ([SahelFlowWindowCloser]::RequestClose([int64]$handle)) {
                $handle
            }
        }
    )
    if ($posted.Count -eq 0) {
        throw "Windows rejected every SahelFlow WM_CLOSE request."
    }
    Write-Host "Posted WM_CLOSE to $($posted.Count) SahelFlow top-level window(s)."

    if (-not $Process.WaitForExit(30000)) {
        throw "SahelFlow did not exit after a real GUI close request within 30 seconds."
    }

    $deadline = (Get-Date).AddSeconds(20)
    do {
        $remaining = @(
            Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
                Where-Object {
                    $_.Name -ieq "sahelflow.exe" -or
                    $_.Name -ieq "bun.exe" -or
                    $_.Name -ieq "sahelflow-whatsapp.exe"
                }
        )
        $endpointPresent = Test-Path -LiteralPath $runtimeEndpointPath -PathType Leaf
        if ($remaining.Count -eq 0 -and -not $endpointPresent) {
            return [pscustomobject]@{
                processId = $Process.Id
                windowHandles = @($posted)
                processTreeStopped = $true
                runtimeEndpointRemoved = $true
            }
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)

    $remainingSummary = if ($remaining.Count -eq 0) {
        "none"
    } else {
        ($remaining | ForEach-Object { "$($_.Name):$($_.ProcessId)" }) -join ", "
    }
    throw "Normal close was incomplete; remaining processes: $remainingSummary; runtime endpoint present: $endpointPresent"
}

$existing = Get-InstalledSahelFlow
if ($existing.Count -ne 0) {
    throw "The ephemeral runner unexpectedly already has SahelFlow installed."
}

# These paths belong to the ephemeral Actions account only. Starting clean makes
# the test deterministic and cannot touch Founder or seller data.
Remove-Item -LiteralPath $roamingRoot, $localRoot -Recurse -Force -ErrorAction SilentlyContinue

$arguments = @(
    "/i",
    "`"$resolvedMsi`"",
    "/qn",
    "/norestart",
    "/L*v",
    "`"$installLog`""
) -join " "
$installer = Start-Process -FilePath "$env:SystemRoot\System32\msiexec.exe" `
    -ArgumentList $arguments -Wait -PassThru
if ($installer.ExitCode -ne 0) {
    throw "MSI installation failed with exit code $($installer.ExitCode)."
}

$installed = Get-InstalledSahelFlow
if ($installed.Count -ne 1) {
    throw "Expected exactly one installed SahelFlow product, found $($installed.Count)."
}

$exe = "C:\Program Files\SahelFlow\sahelflow.exe"
if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
    throw "Installed executable is missing: $exe"
}
if (-not (Test-Path -LiteralPath $installedRuntimeManifestPath -PathType Leaf)) {
    throw "Installed standalone manifest is missing: $installedRuntimeManifestPath"
}
if (-not (Test-Path -LiteralPath $installedServerPath -PathType Leaf)) {
    throw "Installed standalone server is missing: $installedServerPath"
}

$treeVerifierPath = Join-Path $repositoryRoot "scripts\verify-installed-standalone.ts"
$treeVerificationOutput = @(
    & bun $treeVerifierPath $installedRuntimeRoot $expectedVersion 2>&1
)
if ($LASTEXITCODE -ne 0) {
    throw "Complete installed standalone verification failed: $($treeVerificationOutput -join [Environment]::NewLine)"
}
$installedTreeVerification = ($treeVerificationOutput -join [Environment]::NewLine) |
    ConvertFrom-Json
if (
    $installedTreeVerification.verified -ne $true -or
    $installedTreeVerification.root -ne $installedRuntimeRoot -or
    $installedTreeVerification.appVersion -ne $expectedVersion -or
    $installedTreeVerification.treeSha256 -ne $expectedTree -or
    [int64]$installedTreeVerification.fileCount -ne $expectedFileCount
) {
    throw "Complete installed standalone verification did not match the built candidate."
}

$launches = @()
$closures = @()
$installedRuntimeIdentity = $null
$registryIdentity = $null
$databaseIdentity = $null

for ($attempt = 1; $attempt -le 2; $attempt++) {
    if ($attempt -eq 1) {
        Remove-Item -LiteralPath $runtimeEndpointPath -Force -ErrorAction SilentlyContinue
    }
    $startedAt = Get-Date
    $process = Start-Process -FilePath $exe -PassThru
    $launch = Wait-ForLaunchOutcome -Process $process -StartedAt $startedAt -Phase "launch-$attempt"
    $launches += $launch

    if ($launch.outcome -ne "ready") {
        break
    }

    $runtimeCacheEntries = @(
        Get-ChildItem -LiteralPath $runtimeCacheRoot -Force -ErrorAction SilentlyContinue
    )
    if ($runtimeCacheEntries.Count -ne 0) {
        throw "Installed launch created $($runtimeCacheEntries.Count) AppData runtime-cache entry or staging path."
    }

    $manifest = Read-JsonFile $installedRuntimeManifestPath
    if (
        $manifest.appVersion -ne $expectedVersion -or
        $manifest.treeSha256 -ne $expectedTree -or
        [int64]$manifest.fileCount -ne $expectedFileCount
    ) {
        throw "Protected installed runtime identity does not match the built candidate."
    }

    $currentInstalledRuntimeIdentity = [pscustomobject]@{
        directory = $installedRuntimeRoot
        manifestSha256 = (Get-FileHash -LiteralPath $installedRuntimeManifestPath -Algorithm SHA256).Hash
        serverSha256 = (Get-FileHash -LiteralPath $installedServerPath -Algorithm SHA256).Hash
        appVersion = $manifest.appVersion
        treeSha256 = $manifest.treeSha256
        fileCount = $manifest.fileCount
        completeTreeVerified = [bool]$installedTreeVerification.verified
        appDataRuntimeCacheEntryCount = $runtimeCacheEntries.Count
    }
    if (
        $currentInstalledRuntimeIdentity.manifestSha256 -ne $expectedManifestSha256 -or
        $currentInstalledRuntimeIdentity.serverSha256 -ne $expectedServerSha256
    ) {
        throw "Protected installed runtime files do not match the built candidate."
    }

    $registry = Read-JsonFile $registryPath
    if ($null -eq $registry -or $registry.revision -lt 1 -or [string]::IsNullOrWhiteSpace($registry.activeShopId)) {
        throw "Installed launch did not create a valid active shop registry."
    }
    $activeShop = @($registry.shops | Where-Object { $_.id -eq $registry.activeShopId })
    if ($activeShop.Count -ne 1) {
        throw "Installed launch did not resolve exactly one active shop."
    }
    $databasePath = Join-Path (Join-Path $roamingRoot "shops") $activeShop[0].databaseFile
    if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
        throw "Installed launch did not preserve the active shop database."
    }

    $currentRegistryIdentity = [pscustomobject]@{
        revision = $registry.revision
        activeShopId = $registry.activeShopId
        registrySha256 = (Get-FileHash -LiteralPath $registryPath -Algorithm SHA256).Hash
    }
    $closures += Close-SahelFlowNormally -Process $process

    # Prisma owns the SQLite file while the packaged runtime is live. Hash only
    # after the normal close has stopped the complete process tree and released
    # the database handle.
    $currentDatabaseIdentity = [pscustomobject]@{
        path = $databasePath
        length = (Get-Item -LiteralPath $databasePath).Length
        sha256 = (Get-FileHash -LiteralPath $databasePath -Algorithm SHA256).Hash
    }

    if ($attempt -eq 1) {
        $installedRuntimeIdentity = $currentInstalledRuntimeIdentity
        $registryIdentity = $currentRegistryIdentity
        $databaseIdentity = $currentDatabaseIdentity
    } else {
        if ($currentInstalledRuntimeIdentity.directory -ne $installedRuntimeIdentity.directory -or
            $currentInstalledRuntimeIdentity.manifestSha256 -ne $installedRuntimeIdentity.manifestSha256 -or
            $currentInstalledRuntimeIdentity.serverSha256 -ne $installedRuntimeIdentity.serverSha256 -or
            $currentInstalledRuntimeIdentity.appDataRuntimeCacheEntryCount -ne 0) {
            throw "Second launch changed the protected installed runtime or staged an AppData copy."
        }
        if ($currentRegistryIdentity.revision -ne $registryIdentity.revision -or
            $currentRegistryIdentity.activeShopId -ne $registryIdentity.activeShopId -or
            $currentRegistryIdentity.registrySha256 -ne $registryIdentity.registrySha256) {
            throw "Second launch changed registry authority."
        }
        if ($currentDatabaseIdentity.path -ne $databaseIdentity.path -or
            $currentDatabaseIdentity.length -ne $databaseIdentity.length -or
            $currentDatabaseIdentity.sha256 -ne $databaseIdentity.sha256) {
            throw "Second launch changed the active shop database identity."
        }
        if ($launches[1].endpoint.instanceId -eq $launches[0].endpoint.instanceId) {
            throw "Second launch reused the first runtime instance identity."
        }
    }
}

$result = [ordered]@{
    capturedAt = (Get-Date).ToString("o")
    expectedVersion = $expectedVersion
    expectedTreeSha256 = $expectedTree
    msiPath = $resolvedMsi
    msiSha256 = (Get-FileHash -LiteralPath $resolvedMsi -Algorithm SHA256).Hash
    installerExitCode = $installer.ExitCode
    installedDisplayVersion = $installed[0].DisplayVersion
    launches = $launches
    closures = $closures
    installedTreeVerification = $installedTreeVerification
    installedRuntime = $installedRuntimeIdentity
    registry = $registryIdentity
    database = $databaseIdentity
    finalProcesses = Get-SahelFlowProcessTree
}
$result | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $resultPath -Encoding UTF8

Copy-Item -LiteralPath $startupDiagnosticPath -Destination (Join-Path $evidenceRoot "startup-diagnostic.json") `
    -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath $runtimeEndpointPath -Destination (Join-Path $evidenceRoot "runtime-endpoint.json") `
    -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath $registryPath -Destination (Join-Path $evidenceRoot "shop-registry.json") `
    -Force -ErrorAction SilentlyContinue

$failed = @($launches | Where-Object { $_.outcome -ne "ready" })
if ($failed.Count -gt 0) {
    $result | ConvertTo-Json -Depth 14 | Write-Host
    throw "Installed SahelFlow did not reach ready state: $($failed[0].outcome)."
}

if ($launches.Count -ne 2 -or $closures.Count -ne 2) {
    throw "Installed SahelFlow did not complete both launch and normal-close passes."
}

Write-Host "Installed MSI launch/reopen proof passed for $expectedVersion."
Write-Host "Evidence: $resultPath"
