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
$builtRuntimeRoot = Join-Path $repositoryRoot "src-tauri\resources\runtime"
$runtimeManifestPath = Join-Path $builtRuntimeRoot "runtime-manifest.json"
$runtimeManifest = Get-Content -LiteralPath $runtimeManifestPath -Raw | ConvertFrom-Json
if (
    [int]$runtimeManifest.formatVersion -ne 3 -or
    $runtimeManifest.node.file -cne "node.exe" -or
    $runtimeManifest.node.licenseFile -cne "NODE-LICENSE.txt"
) {
    throw "Built Node.js runtime manifest is invalid."
}
$expectedRuntimeManifestSha256 = (
    Get-FileHash -LiteralPath $runtimeManifestPath -Algorithm SHA256
).Hash.ToLowerInvariant()
$expectedNodeSha256 = ([string]$runtimeManifest.node.sha256).ToLowerInvariant()
$expectedNodeLicenseSha256 = ([string]$runtimeManifest.node.licenseSha256).ToLowerInvariant()

$resolvedMsi = (Resolve-Path -LiteralPath $MsiPath).Path
$evidenceRoot = Join-Path $env:RUNNER_TEMP "sahelflow-installed-e2e"
$installLog = Join-Path $evidenceRoot "install.log"
$resultPath = Join-Path $evidenceRoot "result.json"
$rotationDiagnosticPath = Join-Path $evidenceRoot "installation-root-rotation-diagnostic.json"
$rotationStderrPath = Join-Path $evidenceRoot "installation-root-rotation-stderr.tmp"
$roamingRoot = Join-Path $env:APPDATA "com.sahelflow.desktop"
$localRoot = Join-Path $env:LOCALAPPDATA "com.sahelflow.desktop"
$runtimeCacheRoot = Join-Path $localRoot "runtime-cache"
$runtimeWorkRoot = Join-Path $localRoot "runtime-work"
$runtimeEndpointPath = Join-Path $roamingRoot "runtime-endpoint.json"
$startupDiagnosticPath = Join-Path $roamingRoot "startup-diagnostic.json"
$registryPath = Join-Path $roamingRoot "shop-registry.json"
$legacyMasterKeyPath = Join-Path $roamingRoot "master.key"
$protectedInstallationRootPath = Join-Path $roamingRoot "system\installation-root.current.json"
$protectedInstallationRootCandidatePath = Join-Path $roamingRoot "system\installation-root.candidate.json"
$protectedInstallationRootBackupPath = Join-Path $roamingRoot "system\installation-root.backup.json"
$protectedInstallationRootJournalPath = Join-Path $roamingRoot "system\installation-root.rotation.json"
$protectedInstallationRootReceiptPath = Join-Path $roamingRoot "system\installation-root.last-rotation.json"
$migrationSnapshotRoot = Join-Path $roamingRoot "migration-snapshots"
$migrationJournalRoot = Join-Path $roamingRoot "migration-journal"
$migrationJournalPath = Join-Path $migrationJournalRoot "current.json"
$migrationCompatibilityPath = Join-Path $migrationJournalRoot "compatibility.json"
$migrationRecoveryReceiptPath = Join-Path $migrationJournalRoot "last-recovery.json"
$founderSentinelKey = "founder_ci_sentinel"
$founderSentinelValue = "preserve-v1-founder-row"
$shopSentinelValues = @{
    default = $founderSentinelValue
    second = "preserve-v1-second-shop-row"
}
$installedProductRoot = "C:\Program Files\SahelFlow"
$installedRuntimeRoot = Join-Path $installedProductRoot "standalone"
$installedRuntimeManifestPath = Join-Path $installedRuntimeRoot `
    "sahelflow-standalone-manifest.json"
$installedServerPath = Join-Path $installedRuntimeRoot "server.js"
$installedJavascriptRuntimeRoot = "C:\Program Files\SahelFlow\runtime"
$installedJavascriptRuntimeManifestPath = Join-Path $installedJavascriptRuntimeRoot "runtime-manifest.json"
$installedNodePath = Join-Path $installedJavascriptRuntimeRoot "node.exe"
$installedNodeLicensePath = Join-Path $installedJavascriptRuntimeRoot "NODE-LICENSE.txt"
$forbiddenInstalledBunPath = Join-Path $installedJavascriptRuntimeRoot "bun.exe"

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
    return @(
        Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Where-Object {
                $path = [string]$_.ExecutablePath
                -not [string]::IsNullOrWhiteSpace($path) -and
                $path.StartsWith(
                    "$installedProductRoot\",
                    [System.StringComparison]::OrdinalIgnoreCase
                )
            } |
            Select-Object Name, ProcessId, ParentProcessId, ExecutablePath, CommandLine, CreationDate
    )
}

function Get-ProcessIdentityKey {
    param([Parameter(Mandatory = $true)]$Process)

    if ($null -eq $Process.CreationDate) {
        throw "Windows did not expose a creation timestamp for process $($Process.ProcessId)."
    }
    $createdAtUtcTicks = ([datetime]$Process.CreationDate).ToUniversalTime().Ticks
    return "$([int64]$Process.ProcessId):$createdAtUtcTicks"
}

function Get-DescendantProcessIdentities {
    param([Parameter(Mandatory = $true)][int64]$RootProcessId)

    $snapshot = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
    $rootProcess = @(
        $snapshot | Where-Object { [int64]$_.ProcessId -eq $RootProcessId }
    ) | Select-Object -First 1
    if ($null -eq $rootProcess -or $null -eq $rootProcess.CreationDate) {
        throw "Windows did not expose the root process identity for descendant capture."
    }

    $frontier = @(
        [pscustomobject]@{
            processId = $RootProcessId
            createdAtUtcTicks = ([datetime]$rootProcess.CreationDate).ToUniversalTime().Ticks
        }
    )
    $seen = @{}
    $descendants = @()
    while ($frontier.Count -gt 0) {
        $next = @()
        foreach ($parent in $frontier) {
            foreach ($child in @($snapshot | Where-Object {
                [int64]$_.ParentProcessId -eq [int64]$parent.processId
            })) {
                if ($null -eq $child.CreationDate) {
                    throw "Windows did not expose a creation timestamp for candidate descendant $($child.ProcessId)."
                }
                $childCreatedAtUtcTicks = ([datetime]$child.CreationDate).ToUniversalTime().Ticks
                # ParentProcessId is only a numeric historical PID. Reject a
                # candidate created before its alleged parent so PID reuse by
                # long-lived Windows session processes cannot forge ancestry.
                if ($childCreatedAtUtcTicks -lt [int64]$parent.createdAtUtcTicks) {
                    continue
                }

                $childId = [int64]$child.ProcessId
                $identityKey = Get-ProcessIdentityKey -Process $child
                if (-not $seen.ContainsKey($identityKey)) {
                    $seen[$identityKey] = $true
                    $descendants += [pscustomobject]@{
                        processId = $childId
                        name = [string]$child.Name
                        executablePath = [string]$child.ExecutablePath
                        creationDate = [datetime]$child.CreationDate
                        identityKey = $identityKey
                    }
                    $next += [pscustomobject]@{
                        processId = $childId
                        createdAtUtcTicks = $childCreatedAtUtcTicks
                    }
                }
            }
        }
        $frontier = $next
    }
    return @($descendants)
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

function Get-FounderSentinel {
    param(
        [Parameter(Mandatory = $true)]
        [string]$DatabasePath,
        [Parameter(Mandatory = $true)]
        [ValidateSet("seed", "read")]
        [string]$Mode
    )

    $previousDatabaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL", "Process")
    $previousMode = [Environment]::GetEnvironmentVariable("SF_FOUNDER_SENTINEL_MODE", "Process")
    $previousKey = [Environment]::GetEnvironmentVariable("SF_FOUNDER_SENTINEL_KEY", "Process")
    $previousValue = [Environment]::GetEnvironmentVariable("SF_FOUNDER_SENTINEL_VALUE", "Process")
    $sentinelScript = @'
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
try {
  const key = process.env.SF_FOUNDER_SENTINEL_KEY;
  const value = process.env.SF_FOUNDER_SENTINEL_VALUE;
  if (process.env.SF_FOUNDER_SENTINEL_MODE === "seed") {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  const row = await prisma.setting.findUnique({ where: { key } });
  console.log(JSON.stringify(row));
} finally {
  await prisma.$disconnect();
}
'@

    try {
        $env:DATABASE_URL = "file:$DatabasePath"
        $env:SF_FOUNDER_SENTINEL_MODE = $Mode
        $env:SF_FOUNDER_SENTINEL_KEY = $founderSentinelKey
        $env:SF_FOUNDER_SENTINEL_VALUE = $founderSentinelValue
        Push-Location $repositoryRoot
        $output = @(& bun -e $sentinelScript 2>&1)
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            throw "Founder sentinel $Mode failed: $($output -join [Environment]::NewLine)"
        }
        $jsonLine = @(
            $output |
                ForEach-Object { [string]$_ } |
                Where-Object { $_.TrimStart().StartsWith("{") }
        ) | Select-Object -Last 1
        if ([string]::IsNullOrWhiteSpace($jsonLine)) {
            throw "Founder sentinel $Mode did not return a JSON row."
        }
        return $jsonLine | ConvertFrom-Json
    } finally {
        Pop-Location -ErrorAction SilentlyContinue
        if ($null -eq $previousDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $previousDatabaseUrl }
        if ($null -eq $previousMode) { Remove-Item Env:SF_FOUNDER_SENTINEL_MODE -ErrorAction SilentlyContinue } else { $env:SF_FOUNDER_SENTINEL_MODE = $previousMode }
        if ($null -eq $previousKey) { Remove-Item Env:SF_FOUNDER_SENTINEL_KEY -ErrorAction SilentlyContinue } else { $env:SF_FOUNDER_SENTINEL_KEY = $previousKey }
        if ($null -eq $previousValue) { Remove-Item Env:SF_FOUNDER_SENTINEL_VALUE -ErrorAction SilentlyContinue } else { $env:SF_FOUNDER_SENTINEL_VALUE = $previousValue }
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
    # WebView2 descendants run outside the SahelFlow installation directory and
    # may outlive the desktop process briefly. Capture PID plus creation time so
    # rapid Windows PID reuse cannot turn an unrelated runner process into a
    # false application descendant.
    $descendantProcesses = @(Get-DescendantProcessIdentities -RootProcessId $Process.Id)
    $descendantProcessIds = @(
        $descendantProcesses | ForEach-Object { [int64]$_.processId }
    )

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
        $processSnapshot = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)
        $remaining = @(
            $processSnapshot |
                Where-Object {
                    $_.Name -ieq "sahelflow.exe" -or
                    $_.Name -ieq "node.exe" -or
                    $_.Name -ieq "sahelflow-whatsapp.exe"
                }
        )
        $liveProcessIdentityKeys = @{}
        foreach ($candidate in $processSnapshot) {
            if ($null -ne $candidate.CreationDate) {
                $identityKey = Get-ProcessIdentityKey -Process $candidate
                $liveProcessIdentityKeys[$identityKey] = $true
            }
        }
        $remainingDescendants = @(
            $descendantProcesses |
                Where-Object { $liveProcessIdentityKeys.ContainsKey($_.identityKey) }
        )
        $remainingDescendantIds = @(
            $remainingDescendants | ForEach-Object { [int64]$_.processId }
        )
        $endpointPresent = Test-Path -LiteralPath $runtimeEndpointPath -PathType Leaf
        if (
            $remaining.Count -eq 0 -and
            $remainingDescendantIds.Count -eq 0 -and
            -not $endpointPresent
        ) {
            return [pscustomobject]@{
                processId = $Process.Id
                windowHandles = @($posted)
                descendantProcessIds = @($descendantProcessIds)
                descendantTreeStopped = $true
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
    $descendantSummary = if ($remainingDescendants.Count -eq 0) {
        "none"
    } else {
        ($remainingDescendants | ForEach-Object { "$($_.name):$($_.processId)" }) -join ", "
    }
    throw "Normal close was incomplete; remaining processes: $remainingSummary; remaining captured descendants: $descendantSummary; runtime endpoint present: $endpointPresent"
}

$existing = Get-InstalledSahelFlow
if ($existing.Count -ne 0) {
    throw "The ephemeral runner unexpectedly already has SahelFlow installed."
}

# These paths belong to the ephemeral Actions account only. Seed the real v1
# registry shape before installation so the first candidate launch must prove
# the same in-place migration and Founder-row preservation required in production.
Remove-Item -LiteralPath $roamingRoot, $localRoot -Recurse -Force -ErrorAction SilentlyContinue
$legacyShopsRoot = Join-Path $roamingRoot "shops"
$legacyDatabasePath = Join-Path $legacyShopsRoot "dev.db"
$legacySecondDatabasePath = Join-Path $legacyShopsRoot "second.db"
$legacyInstallationId = [Guid]::NewGuid().ToString("N")
New-Item -ItemType Directory -Path $legacyShopsRoot -Force | Out-Null

$legacyMasterKeyHex = [string]$env:SF_MASTER_KEY
if ($legacyMasterKeyHex -cnotmatch '^[0-9a-fA-F]{64}$') {
    throw "The installed preservation fixture requires one exact 32-byte legacy master key."
}
[System.IO.File]::WriteAllText(
    $legacyMasterKeyPath,
    $legacyMasterKeyHex.ToLowerInvariant(),
    [System.Text.Encoding]::ASCII
)

$previousDatabaseUrl = [Environment]::GetEnvironmentVariable("DATABASE_URL", "Process")
try {
    $env:DATABASE_URL = "file:$legacyDatabasePath"
    Push-Location $repositoryRoot
    $migrationOutput = @(& bunx prisma migrate deploy --schema=prisma/schema.prisma 2>&1)
    $migrationExitCode = $LASTEXITCODE
    if ($migrationExitCode -ne 0) {
        throw "Failed to prepare the v1 Founder database fixture: $($migrationOutput -join [Environment]::NewLine)"
    }
} finally {
    Pop-Location -ErrorAction SilentlyContinue
    if ($null -eq $previousDatabaseUrl) {
        Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    } else {
        $env:DATABASE_URL = $previousDatabaseUrl
    }
}

$legacyFounderSentinel = Get-FounderSentinel -DatabasePath $legacyDatabasePath -Mode "seed"
if (
    $legacyFounderSentinel.key -cne $founderSentinelKey -or
    $legacyFounderSentinel.value -cne $founderSentinelValue
) {
    throw "The v1 Founder database fixture did not retain its seeded sentinel row."
}
Copy-Item -LiteralPath $legacyDatabasePath -Destination $legacySecondDatabasePath -Force
$preservedSentinelValue = $founderSentinelValue
try {
    $founderSentinelValue = $shopSentinelValues.second
    $legacySecondFounderSentinel = Get-FounderSentinel `
        -DatabasePath $legacySecondDatabasePath -Mode "seed"
} finally {
    $founderSentinelValue = $preservedSentinelValue
}
if (
    $legacySecondFounderSentinel.key -cne $founderSentinelKey -or
    $legacySecondFounderSentinel.value -cne $shopSentinelValues.second
) {
    throw "The second v1 shop fixture did not retain its seeded sentinel row."
}
$legacyRegistry = [ordered]@{
    formatVersion = 1
    revision = 1
    installationId = $legacyInstallationId
    activeShopId = "default"
    shops = @(
        [ordered]@{
            id = "default"
            name = "Ma Boutique"
            databaseFile = "dev.db"
            icon = $null
            createdAt = "2026-01-01T00:00:00.000Z"
        },
        [ordered]@{
            id = "second"
            name = "Second Shop"
            databaseFile = "second.db"
            icon = $null
            createdAt = "2026-01-02T00:00:00.000Z"
        }
    )
}
$legacyRegistryJson = $legacyRegistry | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText(
    $registryPath,
    "$legacyRegistryJson$([Environment]::NewLine)",
    [System.Text.UTF8Encoding]::new($false)
)
$legacyCompatibilityIdentity = [pscustomobject]@{
    registryFormatVersion = 1
    registryRevision = 1
    installationId = $legacyInstallationId
    registrySha256 = (Get-FileHash -LiteralPath $registryPath -Algorithm SHA256).Hash
    databases = @(
        [pscustomobject]@{
            shopId = "default"
            path = $legacyDatabasePath
            length = (Get-Item -LiteralPath $legacyDatabasePath).Length
            sha256 = (Get-FileHash -LiteralPath $legacyDatabasePath -Algorithm SHA256).Hash
            founderSentinel = $legacyFounderSentinel
        },
        [pscustomobject]@{
            shopId = "second"
            path = $legacySecondDatabasePath
            length = (Get-Item -LiteralPath $legacySecondDatabasePath).Length
            sha256 = (Get-FileHash -LiteralPath $legacySecondDatabasePath -Algorithm SHA256).Hash
            founderSentinel = $legacySecondFounderSentinel
        }
    )
}

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
foreach ($requiredRuntimePath in @(
    $installedJavascriptRuntimeManifestPath,
    $installedNodePath,
    $installedNodeLicensePath
)) {
    if (-not (Test-Path -LiteralPath $requiredRuntimePath -PathType Leaf)) {
        throw "Installed Node.js runtime file is missing: $requiredRuntimePath"
    }
}
if (Test-Path -LiteralPath $forbiddenInstalledBunPath) {
    throw "Installed runtime still contains the retired Bun production executable."
}
$installedRuntimeManifest = Read-JsonFile $installedJavascriptRuntimeManifestPath
$installedRuntimeManifestSha256 = (
    Get-FileHash -LiteralPath $installedJavascriptRuntimeManifestPath -Algorithm SHA256
).Hash.ToLowerInvariant()
$installedNodeSha256 = (
    Get-FileHash -LiteralPath $installedNodePath -Algorithm SHA256
).Hash.ToLowerInvariant()
$installedNodeLicenseSha256 = (
    Get-FileHash -LiteralPath $installedNodeLicensePath -Algorithm SHA256
).Hash.ToLowerInvariant()
$runtimeIdentityProblems = [System.Collections.Generic.List[string]]::new()
if ([int]$installedRuntimeManifest.formatVersion -ne 3) {
    $runtimeIdentityProblems.Add("manifest-format")
}
if ($installedRuntimeManifest.node.file -cne "node.exe") {
    $runtimeIdentityProblems.Add("node-file")
}
if ([string]$installedRuntimeManifest.node.sha256 -cne $expectedNodeSha256) {
    $runtimeIdentityProblems.Add("manifest-node-digest")
}
if ($installedRuntimeManifest.node.licenseFile -cne "NODE-LICENSE.txt") {
    $runtimeIdentityProblems.Add("license-file")
}
if ([string]$installedRuntimeManifest.node.licenseSha256 -cne $expectedNodeLicenseSha256) {
    $runtimeIdentityProblems.Add("manifest-license-digest")
}
if ($installedRuntimeManifestSha256 -cne $expectedRuntimeManifestSha256) {
    $runtimeIdentityProblems.Add("runtime-manifest-file-digest")
}
if ($installedNodeSha256 -cne $expectedNodeSha256) {
    $runtimeIdentityProblems.Add("installed-node-digest")
}
if ($installedNodeLicenseSha256 -cne $expectedNodeLicenseSha256) {
    $runtimeIdentityProblems.Add("installed-license-digest")
}
if ($runtimeIdentityProblems.Count -ne 0) {
    throw "Installed Node.js runtime identity does not match the built candidate: $($runtimeIdentityProblems -join ', ')."
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
$shopSetIdentity = $null
$registryMigrationIdentity = $null
$migrationRecoveryDrill = $null
$installationRootRotation = $null
$lifecyclePasses = 3

for ($attempt = 1; $attempt -le $lifecyclePasses; $attempt++) {
    # Each launch must publish its own readiness evidence. In particular, a
    # blocked diagnostic from the previous pass can otherwise satisfy the
    # filesystem timestamp tolerance while the new desktop process continues
    # starting, which would leave it alive when native rotation begins.
    Remove-Item -LiteralPath $runtimeEndpointPath, $startupDiagnosticPath `
        -Force -ErrorAction SilentlyContinue
    $startedAt = Get-Date
    $process = Start-Process -FilePath $exe -PassThru
    $launch = Wait-ForLaunchOutcome -Process $process -StartedAt $startedAt -Phase "launch-$attempt"
    $launches += $launch

    if ($launch.outcome -ne "ready") {
        break
    }

    if ($attempt -eq 1) {
        if (-not (Test-Path -LiteralPath $protectedInstallationRootPath -PathType Leaf)) {
            throw "Installed launch did not publish the protected installation root."
        }
        if (Test-Path -LiteralPath $legacyMasterKeyPath) {
            throw "Installed launch did not erase the imported plaintext legacy master key."
        }
    }

    $runtimeCacheEntries = @(
        Get-ChildItem -LiteralPath $runtimeCacheRoot -Force -ErrorAction SilentlyContinue
    )
    if ($runtimeCacheEntries.Count -ne 0) {
        throw "Installed launch created $($runtimeCacheEntries.Count) AppData runtime-cache entry or staging path."
    }
    $runtimeWorkExecutables = @(
        if (Test-Path -LiteralPath $runtimeWorkRoot) {
            Get-ChildItem -LiteralPath $runtimeWorkRoot -Recurse -File -ErrorAction Stop |
                Where-Object {
                    $_.Name -ieq "node.exe" -or
                    $_.Name -ieq "server.js" -or
                    $_.Name -ieq "runtime-manifest.json"
                }
        }
    )
    if ($runtimeWorkExecutables.Count -ne 0) {
        throw "Installed launch copied executable runtime authority into the writable working directory."
    }

    $manifest = Read-JsonFile $installedRuntimeManifestPath
    if (
        $manifest.appVersion -ne $expectedVersion -or
        $manifest.treeSha256 -ne $expectedTree -or
        [int64]$manifest.fileCount -ne $expectedFileCount
    ) {
        throw "Protected installed runtime identity does not match the built candidate."
    }

    $currentJavascriptRuntimeManifestSha256 = (
        Get-FileHash -LiteralPath $installedJavascriptRuntimeManifestPath -Algorithm SHA256
    ).Hash
    $currentNodeSha256 = (Get-FileHash -LiteralPath $installedNodePath -Algorithm SHA256).Hash
    $currentNodeLicenseSha256 = (
        Get-FileHash -LiteralPath $installedNodeLicensePath -Algorithm SHA256
    ).Hash

    $currentInstalledRuntimeIdentity = [pscustomobject]@{
        directory = $installedRuntimeRoot
        manifestSha256 = (Get-FileHash -LiteralPath $installedRuntimeManifestPath -Algorithm SHA256).Hash
        serverSha256 = (Get-FileHash -LiteralPath $installedServerPath -Algorithm SHA256).Hash
        appVersion = $manifest.appVersion
        treeSha256 = $manifest.treeSha256
        fileCount = $manifest.fileCount
        completeTreeVerified = [bool]$installedTreeVerification.verified
        appDataRuntimeCacheEntryCount = $runtimeCacheEntries.Count
        javascriptRuntimeDirectory = $installedJavascriptRuntimeRoot
        javascriptRuntimeManifestSha256 = $currentJavascriptRuntimeManifestSha256
        nodeSha256 = $currentNodeSha256
        nodeLicenseSha256 = $currentNodeLicenseSha256
        bunProductionRuntimePresent = Test-Path -LiteralPath $forbiddenInstalledBunPath
    }
    if (
        $currentInstalledRuntimeIdentity.manifestSha256 -ne $expectedManifestSha256 -or
        $currentInstalledRuntimeIdentity.serverSha256 -ne $expectedServerSha256
    ) {
        throw "Protected installed runtime files do not match the built candidate."
    }

    $registry = Read-JsonFile $registryPath
    if (
        $null -eq $registry -or
        $registry.formatVersion -ne 2 -or
        $registry.revision -lt 1 -or
        [string]$registry.workspaceId -notmatch '^[0-9a-f]{32}$' -or
        [string]$registry.installationId -notmatch '^[0-9a-f]{32}$' -or
        [string]::IsNullOrWhiteSpace($registry.activeShopId)
    ) {
        throw "Installed launch did not create a valid active shop registry."
    }
    if (@($registry.shops).Count -ne 2) {
        throw "Installed migration did not preserve the complete two-shop fixture."
    }
    foreach ($shop in @($registry.shops)) {
        if ([string]$shop.incarnationId -notmatch '^[0-9a-f]{32}$') {
            throw "Installed launch did not resolve a valid incarnation for shop $($shop.id)."
        }
    }
    $activeShop = @($registry.shops | Where-Object { $_.id -eq $registry.activeShopId })
    if ($activeShop.Count -ne 1) {
        throw "Installed launch did not resolve exactly one active shop."
    }
    if ([string]$activeShop[0].incarnationId -notmatch '^[0-9a-f]{32}$') {
        throw "Installed launch did not resolve a valid shop incarnation."
    }
    $databasePath = Join-Path (Join-Path $roamingRoot "shops") $activeShop[0].databaseFile
    if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
        throw "Installed launch did not preserve the active shop database."
    }

    $currentRegistryIdentity = [pscustomobject]@{
        workspaceId = [string]$registry.workspaceId
        installationId = [string]$registry.installationId
        revision = $registry.revision
        activeShopId = $registry.activeShopId
        shopIncarnationId = [string]$activeShop[0].incarnationId
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
    $currentFounderSentinel = Get-FounderSentinel -DatabasePath $databasePath -Mode "read"
    if (
        $currentFounderSentinel.key -cne $founderSentinelKey -or
        $currentFounderSentinel.value -cne $founderSentinelValue
    ) {
        throw "Installed migration did not preserve the seeded Founder row."
    }
    $currentShopSetIdentity = @(
        foreach ($shop in @($registry.shops | Sort-Object id)) {
            $shopDatabasePath = Join-Path (Join-Path $roamingRoot "shops") $shop.databaseFile
            if (-not (Test-Path -LiteralPath $shopDatabasePath -PathType Leaf)) {
                throw "Installed migration lost registered shop database $($shop.id)."
            }
            $shopSentinel = Get-FounderSentinel -DatabasePath $shopDatabasePath -Mode "read"
            $expectedShopSentinel = $shopSentinelValues[[string]$shop.id]
            if (
                $shopSentinel.key -cne $founderSentinelKey -or
                [string]::IsNullOrWhiteSpace($expectedShopSentinel) -or
                $shopSentinel.value -cne $expectedShopSentinel
            ) {
                throw "Installed migration did not preserve the sentinel for shop $($shop.id)."
            }
            [pscustomobject]@{
                shopId = [string]$shop.id
                incarnationId = [string]$shop.incarnationId
                databaseFile = [string]$shop.databaseFile
                path = $shopDatabasePath
                length = (Get-Item -LiteralPath $shopDatabasePath).Length
                sha256 = (Get-FileHash -LiteralPath $shopDatabasePath -Algorithm SHA256).Hash
                founderSentinel = $shopSentinel
            }
        }
    )

    if ($attempt -eq 1) {
        if (
            $currentRegistryIdentity.installationId -cne $legacyInstallationId -or
            [int64]$currentRegistryIdentity.revision -ne 2 -or
            $currentRegistryIdentity.activeShopId -cne "default" -or
            $currentDatabaseIdentity.path -cne $legacyDatabasePath
        ) {
            throw "Installed launch did not preserve the v1 Founder authority during registry migration."
        }
        $installedRuntimeIdentity = $currentInstalledRuntimeIdentity
        $registryIdentity = $currentRegistryIdentity
        $databaseIdentity = $currentDatabaseIdentity
        $shopSetIdentity = $currentShopSetIdentity
        $registryMigrationIdentity = [pscustomobject]@{
            before = $legacyCompatibilityIdentity
            after = $currentRegistryIdentity
            shopsAfter = $currentShopSetIdentity
            founderSentinelAfter = $currentFounderSentinel
        }

        $compatibility = Read-JsonFile $migrationCompatibilityPath
        if (
            $null -eq $compatibility -or
            $compatibility.sqliteEngine -cne "rusqlite-migration-coordinator" -or
            [string]$compatibility.migrationSetSha256 -notmatch '^[0-9a-f]{64}$' -or
            @($compatibility.shops).Count -ne 2 -or
            @(
                $compatibility.shops | Where-Object {
                    [string]::IsNullOrWhiteSpace([string]$_.sqliteVersion) -or
                    [string]::IsNullOrWhiteSpace([string]$_.journalMode)
                }
            ).Count -ne 0
        ) {
            throw "Installed migration did not emit complete two-shop compatibility evidence."
        }
        New-Item -ItemType Directory -Path $migrationSnapshotRoot -Force | Out-Null
        $snapshotEntries = @()
        foreach ($shop in @($registry.shops | Sort-Object id)) {
            $shopDatabasePath = Join-Path (Join-Path $roamingRoot "shops") $shop.databaseFile
            $snapshotFile = "installed-recovery-$($shop.id).db"
            $snapshotPath = Join-Path $migrationSnapshotRoot $snapshotFile
            Copy-Item -LiteralPath $shopDatabasePath -Destination $snapshotPath -Force
            $snapshotSha256 = (
                Get-FileHash -LiteralPath $snapshotPath -Algorithm SHA256
            ).Hash.ToLowerInvariant()
            $shopCompatibility = @(
                $compatibility.shops | Where-Object { $_.shopId -ceq $shop.id }
            )
            if ($shopCompatibility.Count -ne 1) {
                throw "Installed compatibility evidence did not resolve shop $($shop.id)."
            }
            $snapshotEntries += [ordered]@{
                shopId = [string]$shop.id
                databaseFile = [string]$shop.databaseFile
                snapshotFile = $snapshotFile
                snapshotSha256 = $snapshotSha256
                sqliteVersion = [string]$shopCompatibility[0].sqliteVersion
                journalMode = [string]$shopCompatibility[0].journalMode
                state = "migrated-verified"
            }
        }

        $preservedSentinelValue = $founderSentinelValue
        try {
            $founderSentinelValue = "injected-partial-migration-generation"
            foreach ($shop in @($registry.shops)) {
                $shopDatabasePath = Join-Path (Join-Path $roamingRoot "shops") $shop.databaseFile
                Get-FounderSentinel -DatabasePath $shopDatabasePath -Mode "seed" | Out-Null
            }
        } finally {
            $founderSentinelValue = $preservedSentinelValue
        }

        # Simulate termination after the first shop has been rolled back while
        # the second still contains the partial generation. The next installed
        # launch must keep startup blocked and idempotently restore both.
        $firstSnapshot = Join-Path $migrationSnapshotRoot $snapshotEntries[0].snapshotFile
        $firstDatabase = Join-Path (Join-Path $roamingRoot "shops") $snapshotEntries[0].databaseFile
        Copy-Item -LiteralPath $firstSnapshot -Destination $firstDatabase -Force
        $injectedMixedShopSet = @(
            foreach ($entry in @($snapshotEntries | Sort-Object shopId)) {
                $entryDatabase = Join-Path (Join-Path $roamingRoot "shops") $entry.databaseFile
                $expectedShop = @($shopSetIdentity | Where-Object { $_.shopId -ceq $entry.shopId })
                if ($expectedShop.Count -ne 1) {
                    throw "Injected recovery fixture lost baseline identity for shop $($entry.shopId)."
                }
                $entrySentinel = Get-FounderSentinel -DatabasePath $entryDatabase -Mode "read"
                $entryHash = (Get-FileHash -LiteralPath $entryDatabase -Algorithm SHA256).Hash
                [pscustomobject]@{
                    shopId = [string]$entry.shopId
                    sha256 = $entryHash
                    founderSentinel = $entrySentinel
                    matchesSnapshot = $entryHash.ToLowerInvariant() -ceq $entry.snapshotSha256
                    matchesBaseline = $entryHash -ceq $expectedShop[0].sha256
                }
            }
        )
        if (
            $injectedMixedShopSet.Count -ne 2 -or
            $injectedMixedShopSet[0].matchesSnapshot -ne $true -or
            $injectedMixedShopSet[0].matchesBaseline -ne $true -or
            $injectedMixedShopSet[0].founderSentinel.value -cne $shopSentinelValues.default -or
            $injectedMixedShopSet[1].matchesSnapshot -ne $false -or
            $injectedMixedShopSet[1].matchesBaseline -ne $false -or
            $injectedMixedShopSet[1].founderSentinel.value -cne "injected-partial-migration-generation"
        ) {
            throw "Installed recovery fixture did not create the exact intended mixed generation."
        }
        $injectedJournal = [ordered]@{
            formatVersion = 1
            state = "restore-applying"
            migrationSetSha256 = [string]$compatibility.migrationSetSha256
            registrySha256 = (
                Get-FileHash -LiteralPath $registryPath -Algorithm SHA256
            ).Hash.ToLowerInvariant()
            startedAtUnixSeconds = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
            shops = $snapshotEntries
            failure = "installed CI interruption after first all-shop rollback replacement"
        }
        New-Item -ItemType Directory -Path $migrationJournalRoot -Force | Out-Null
        [System.IO.File]::WriteAllText(
            $migrationJournalPath,
            "$(($injectedJournal | ConvertTo-Json -Depth 10))$([Environment]::NewLine)",
            [System.Text.UTF8Encoding]::new($false)
        )
        $migrationRecoveryDrill = [ordered]@{
            injectedState = $injectedJournal.state
            registrySha256 = $injectedJournal.registrySha256
            migrationSetSha256 = $injectedJournal.migrationSetSha256
            snapshots = $snapshotEntries
            injectedShops = $injectedMixedShopSet
            recovered = $null
        }
    } else {
        if ($currentInstalledRuntimeIdentity.directory -ne $installedRuntimeIdentity.directory -or
            $currentInstalledRuntimeIdentity.manifestSha256 -ne $installedRuntimeIdentity.manifestSha256 -or
            $currentInstalledRuntimeIdentity.serverSha256 -ne $installedRuntimeIdentity.serverSha256 -or
            $currentInstalledRuntimeIdentity.javascriptRuntimeManifestSha256 -ne $installedRuntimeIdentity.javascriptRuntimeManifestSha256 -or
            $currentInstalledRuntimeIdentity.nodeSha256 -ne $installedRuntimeIdentity.nodeSha256 -or
            $currentInstalledRuntimeIdentity.nodeLicenseSha256 -ne $installedRuntimeIdentity.nodeLicenseSha256 -or
            $currentInstalledRuntimeIdentity.bunProductionRuntimePresent -or
            $currentInstalledRuntimeIdentity.appDataRuntimeCacheEntryCount -ne 0) {
            throw "A later launch changed the protected installed runtime or staged an AppData copy."
        }
        if ($currentRegistryIdentity.workspaceId -ne $registryIdentity.workspaceId -or
            $currentRegistryIdentity.installationId -ne $registryIdentity.installationId -or
            $currentRegistryIdentity.revision -ne $registryIdentity.revision -or
            $currentRegistryIdentity.activeShopId -ne $registryIdentity.activeShopId -or
            $currentRegistryIdentity.shopIncarnationId -ne $registryIdentity.shopIncarnationId -or
            $currentRegistryIdentity.registrySha256 -ne $registryIdentity.registrySha256) {
            throw "A later launch changed registry authority."
        }
        if ($currentDatabaseIdentity.path -ne $databaseIdentity.path -or
            $currentDatabaseIdentity.length -ne $databaseIdentity.length -or
            $currentDatabaseIdentity.sha256 -ne $databaseIdentity.sha256) {
            throw "A later launch changed the active shop database identity."
        }
        if ($currentShopSetIdentity.Count -ne $shopSetIdentity.Count) {
            throw "Recovery changed the registered shop count."
        }
        for ($shopIndex = 0; $shopIndex -lt $shopSetIdentity.Count; $shopIndex++) {
            $expectedShop = $shopSetIdentity[$shopIndex]
            $currentShop = $currentShopSetIdentity[$shopIndex]
            if (
                $currentShop.shopId -cne $expectedShop.shopId -or
                $currentShop.incarnationId -cne $expectedShop.incarnationId -or
                $currentShop.databaseFile -cne $expectedShop.databaseFile -or
                $currentShop.path -cne $expectedShop.path -or
                $currentShop.length -ne $expectedShop.length -or
                $currentShop.sha256 -cne $expectedShop.sha256
            ) {
                throw "Installed recovery changed shop authority or data for $($expectedShop.shopId)."
            }
        }
        if ($attempt -eq 2) {
            $recoveryReceipt = Read-JsonFile $migrationRecoveryReceiptPath
            if (
                $null -eq $recoveryReceipt -or
                [int]$recoveryReceipt.formatVersion -ne 1 -or
                $recoveryReceipt.state -cne "interrupted-restored" -or
                $recoveryReceipt.registrySha256 -cne $migrationRecoveryDrill.registrySha256 -or
                $recoveryReceipt.migrationSetSha256 -cne $migrationRecoveryDrill.migrationSetSha256 -or
                @($recoveryReceipt.shops).Count -ne 2 -or
                @($recoveryReceipt.shops | Where-Object { $_.state -cne "restored" }).Count -ne 0
            ) {
                throw "Installed restart did not emit a complete all-shop recovery receipt."
            }
            $receiptShops = @($recoveryReceipt.shops | Sort-Object shopId)
            $expectedReceiptShops = @($snapshotEntries | Sort-Object shopId)
            for ($receiptIndex = 0; $receiptIndex -lt $expectedReceiptShops.Count; $receiptIndex++) {
                $expectedReceiptShop = $expectedReceiptShops[$receiptIndex]
                $actualReceiptShop = $receiptShops[$receiptIndex]
                if (
                    $actualReceiptShop.shopId -cne $expectedReceiptShop.shopId -or
                    $actualReceiptShop.databaseFile -cne $expectedReceiptShop.databaseFile -or
                    $actualReceiptShop.snapshotFile -cne $expectedReceiptShop.snapshotFile -or
                    $actualReceiptShop.snapshotSha256 -cne $expectedReceiptShop.snapshotSha256 -or
                    $actualReceiptShop.sqliteVersion -cne $expectedReceiptShop.sqliteVersion -or
                    $actualReceiptShop.journalMode -cne $expectedReceiptShop.journalMode
                ) {
                    throw "Installed recovery receipt identity mismatch for shop $($expectedReceiptShop.shopId)."
                }
            }
            $migrationRecoveryDrill.recovered = [ordered]@{
                receipt = $recoveryReceipt
                shops = $currentShopSetIdentity
            }
        }
    }
}

$beforeRotation = Read-JsonFile $protectedInstallationRootPath
if (
    $null -eq $beforeRotation -or
    [string]$beforeRotation.keyId -notmatch '^[0-9a-f]{32}$'
) {
    throw "Protected installation-root authority is invalid before rotation."
}
$rotationStartedAt = Get-Date
Remove-Item -LiteralPath $rotationStderrPath -Force -ErrorAction SilentlyContinue
$rotationProcess = Start-Process -FilePath $exe `
    -ArgumentList @("--rotate-installation-root") `
    -PassThru -WindowStyle Hidden `
    -RedirectStandardError $rotationStderrPath
$rotationInvocation = $null
$rotationInvocationDeadline = (Get-Date).AddSeconds(3)
do {
    $rotationInvocation = Get-CimInstance Win32_Process `
        -Filter "ProcessId = $($rotationProcess.Id)" `
        -ErrorAction SilentlyContinue
    if ($null -ne $rotationInvocation) { break }
    Start-Sleep -Milliseconds 50
} while ((Get-Date) -lt $rotationInvocationDeadline)
$rotationArgumentObserved = (
    $null -ne $rotationInvocation -and
    [string]$rotationInvocation.CommandLine -match '(?i)(^|\s)--rotate-installation-root(\s|$)'
)
$rotationProcess.WaitForExit()
Start-Sleep -Milliseconds 250
$rotationStderr = if (Test-Path -LiteralPath $rotationStderrPath -PathType Leaf) {
    $rotationStderrContent = Get-Content -LiteralPath $rotationStderrPath -Raw
    if ($null -eq $rotationStderrContent) {
        ""
    } else {
        [string]$rotationStderrContent
    }
} else {
    ""
}
$rotationStderrCategories = @()
foreach ($classification in @(
    @{ signature = 'another SahelFlow desktop or installation-root rotation process is active'; category = 'process-authority-conflict' },
    @{ signature = 'protected installation-root rotation application setup failed'; category = 'rotation-application-setup-failed' },
    @{ signature = 'error while building SahelFlow application'; category = 'tauri-build-failed' },
    @{ signature = 'protected installation-root rotation blocked'; category = 'native-rotation-blocked' },
    @{ signature = 'pending replacement recovery'; category = 'pending-recovery-blocked' }
)) {
    if ($rotationStderr.IndexOf(
        [string]$classification.signature,
        [System.StringComparison]::OrdinalIgnoreCase
    ) -ge 0) {
        $rotationStderrCategories += [string]$classification.category
    }
}
if (-not [string]::IsNullOrWhiteSpace($rotationStderr) -and $rotationStderrCategories.Count -eq 0) {
    $rotationStderrCategories += 'raw-output-suppressed'
}
$rotationStderrBytes = if (Test-Path -LiteralPath $rotationStderrPath -PathType Leaf) {
    [int64](Get-Item -LiteralPath $rotationStderrPath).Length
} else {
    0
}
$rotationStderrSha256 = if ($rotationStderrBytes -gt 0) {
    (Get-FileHash -LiteralPath $rotationStderrPath -Algorithm SHA256).Hash.ToLowerInvariant()
} else {
    $null
}
$rotationSurvivors = @(
    Get-SahelFlowProcessTree |
        Select-Object Name, ProcessId, ParentProcessId, CreationDate
)
[ordered]@{
    formatVersion = 1
    startedAt = $rotationStartedAt.ToUniversalTime().ToString('o')
    processId = $rotationProcess.Id
    argumentObserved = $rotationArgumentObserved
    exitCode = $rotationProcess.ExitCode
    stderrBytes = $rotationStderrBytes
    stderrSha256 = $rotationStderrSha256
    stderrCategories = @($rotationStderrCategories)
    survivingInstalledProcesses = @($rotationSurvivors)
} |
    ConvertTo-Json -Depth 8 |
    Set-Content -LiteralPath $rotationDiagnosticPath -Encoding UTF8
Remove-Item -LiteralPath $rotationStderrPath -Force -ErrorAction SilentlyContinue
if ($rotationProcess.ExitCode -ne 0) {
    $safeCategories = if ($rotationStderrCategories.Count -eq 0) {
        "none"
    } else {
        $rotationStderrCategories -join ","
    }
    throw "Native protected installation-root rotation failed with exit code $($rotationProcess.ExitCode), argument observed $rotationArgumentObserved, stderr categories $safeCategories, and $($rotationSurvivors.Count) surviving installed process(es)."
}
if (@(Get-SahelFlowProcessTree).Count -ne 0) {
    throw "Native protected rotation left an installed process running."
}
$afterRotation = Read-JsonFile $protectedInstallationRootPath
$rotationBackup = Read-JsonFile $protectedInstallationRootBackupPath
$rotationReceipt = Read-JsonFile $protectedInstallationRootReceiptPath
if (
    $null -eq $afterRotation -or
    $null -eq $rotationBackup -or
    $null -eq $rotationReceipt -or
    [int]$rotationReceipt.formatVersion -ne 1 -or
    [string]$rotationReceipt.previousKeyId -cne [string]$beforeRotation.keyId -or
    [string]$rotationReceipt.currentKeyId -cne [string]$afterRotation.keyId -or
    [string]$rotationBackup.keyId -cne [string]$beforeRotation.keyId -or
    [string]$afterRotation.keyId -ceq [string]$beforeRotation.keyId -or
    (Test-Path -LiteralPath $protectedInstallationRootCandidatePath) -or
    (Test-Path -LiteralPath $protectedInstallationRootJournalPath) -or
    (Test-Path -LiteralPath $legacyMasterKeyPath)
) {
    throw "Native protected rotation did not publish an exact current/backup/receipt authority set."
}

$rotationLaunchStartedAt = Get-Date
$rotationLaunchProcess = Start-Process -FilePath $exe -PassThru
$rotationLaunch = Wait-ForLaunchOutcome `
    -Process $rotationLaunchProcess `
    -StartedAt $rotationLaunchStartedAt `
    -Phase "launch-after-protected-rotation"
$launches += $rotationLaunch
if ($rotationLaunch.outcome -ne "ready") {
    throw "SahelFlow did not reopen with the rotated protected installation root."
}
$closures += Close-SahelFlowNormally -Process $rotationLaunchProcess

$rotatedRegistry = Read-JsonFile $registryPath
if (
    $null -eq $rotatedRegistry -or
    [string]$rotatedRegistry.workspaceId -cne [string]$registryIdentity.workspaceId -or
    [string]$rotatedRegistry.installationId -cne [string]$registryIdentity.installationId -or
    [string]$rotatedRegistry.activeShopId -cne [string]$registryIdentity.activeShopId -or
    @($rotatedRegistry.shops).Count -ne $shopSetIdentity.Count
) {
    throw "Protected rotation changed registry or shop authority."
}
foreach ($expectedShop in @($shopSetIdentity)) {
    $rotatedShop = @($rotatedRegistry.shops | Where-Object { $_.id -ceq $expectedShop.shopId })
    if (
        $rotatedShop.Count -ne 1 -or
        [string]$rotatedShop[0].incarnationId -cne [string]$expectedShop.incarnationId -or
        [string]$rotatedShop[0].databaseFile -cne [string]$expectedShop.databaseFile
    ) {
        throw "Protected rotation changed shop identity for $($expectedShop.shopId)."
    }
    $rotatedDatabasePath = Join-Path (Join-Path $roamingRoot "shops") $rotatedShop[0].databaseFile
    $rotatedSentinel = Get-FounderSentinel -DatabasePath $rotatedDatabasePath -Mode "read"
    if ($rotatedSentinel.value -cne $shopSentinelValues[$expectedShop.shopId]) {
        throw "Protected rotation did not preserve seller data for $($expectedShop.shopId)."
    }
}
$installationRootRotation = [ordered]@{
    previousKeyId = [string]$beforeRotation.keyId
    currentKeyId = [string]$afterRotation.keyId
    backupKeyId = [string]$rotationBackup.keyId
    receipt = $rotationReceipt
    reopened = $rotationLaunch
}

$instanceIds = @(
    $launches |
        Where-Object { $_.outcome -eq "ready" } |
        ForEach-Object { $_.endpoint.instanceId }
)
$uniqueInstanceIds = @($instanceIds | Sort-Object -Unique)
if ($uniqueInstanceIds.Count -ne $instanceIds.Count) {
    throw "An installed launch reused an earlier runtime instance identity."
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
    registryMigration = $registryMigrationIdentity
    migrationRecovery = $migrationRecoveryDrill
    installationRootRotation = $installationRootRotation
    database = $databaseIdentity
    shops = $shopSetIdentity
    finalProcesses = Get-SahelFlowProcessTree
}
$result | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $resultPath -Encoding UTF8

Copy-Item -LiteralPath $startupDiagnosticPath -Destination (Join-Path $evidenceRoot "startup-diagnostic.json") `
    -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath $runtimeEndpointPath -Destination (Join-Path $evidenceRoot "runtime-endpoint.json") `
    -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath $registryPath -Destination (Join-Path $evidenceRoot "shop-registry.json") `
    -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath $migrationRecoveryReceiptPath `
    -Destination (Join-Path $evidenceRoot "migration-last-recovery.json") `
    -Force -ErrorAction SilentlyContinue
Copy-Item -LiteralPath $protectedInstallationRootReceiptPath `
    -Destination (Join-Path $evidenceRoot "installation-root-last-rotation.json") `
    -Force -ErrorAction SilentlyContinue

$failed = @($launches | Where-Object { $_.outcome -ne "ready" })
if ($failed.Count -gt 0) {
    $result | ConvertTo-Json -Depth 14 | Write-Host
    throw "Installed SahelFlow did not reach ready state: $($failed[0].outcome)."
}

$expectedLaunches = $lifecyclePasses + 1
if ($launches.Count -ne $expectedLaunches -or $closures.Count -ne $expectedLaunches) {
    throw "Installed SahelFlow did not complete all $expectedLaunches launch and normal-close passes."
}

Write-Host "Installed MSI launch/reopen proof passed for $expectedVersion."
Write-Host "Evidence: $resultPath"