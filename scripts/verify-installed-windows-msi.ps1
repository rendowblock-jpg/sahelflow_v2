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
$roamingRoot = Join-Path $env:APPDATA "com.sahelflow.desktop"
$localRoot = Join-Path $env:LOCALAPPDATA "com.sahelflow.desktop"
$runtimeCacheRoot = Join-Path $localRoot "runtime-cache"
$runtimeWorkRoot = Join-Path $localRoot "runtime-work"
$runtimeEndpointPath = Join-Path $roamingRoot "runtime-endpoint.json"
$startupDiagnosticPath = Join-Path $roamingRoot "startup-diagnostic.json"
$registryPath = Join-Path $roamingRoot "shop-registry.json"
$founderSentinelKey = "founder_ci_sentinel"
$founderSentinelValue = "preserve-v1-founder-row"
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
                    $_.Name -ieq "node.exe" -or
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

# These paths belong to the ephemeral Actions account only. Seed the real v1
# registry shape before installation so the first candidate launch must prove
# the same in-place migration and Founder-row preservation required in production.
Remove-Item -LiteralPath $roamingRoot, $localRoot -Recurse -Force -ErrorAction SilentlyContinue
$legacyShopsRoot = Join-Path $roamingRoot "shops"
$legacyDatabasePath = Join-Path $legacyShopsRoot "dev.db"
$legacyInstallationId = [Guid]::NewGuid().ToString("N")
New-Item -ItemType Directory -Path $legacyShopsRoot -Force | Out-Null

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
    databasePath = $legacyDatabasePath
    databaseLength = (Get-Item -LiteralPath $legacyDatabasePath).Length
    databaseSha256 = (Get-FileHash -LiteralPath $legacyDatabasePath -Algorithm SHA256).Hash
    founderSentinel = $legacyFounderSentinel
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
$registryMigrationIdentity = $null
$lifecyclePasses = 3

for ($attempt = 1; $attempt -le $lifecyclePasses; $attempt++) {
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
        $registryMigrationIdentity = [pscustomobject]@{
            before = $legacyCompatibilityIdentity
            after = $currentRegistryIdentity
            founderSentinelAfter = $currentFounderSentinel
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
    }
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

if ($launches.Count -ne $lifecyclePasses -or $closures.Count -ne $lifecyclePasses) {
    throw "Installed SahelFlow did not complete all $lifecyclePasses launch and normal-close passes."
}

Write-Host "Installed MSI launch/reopen proof passed for $expectedVersion."
Write-Host "Evidence: $resultPath"
