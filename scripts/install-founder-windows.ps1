[CmdletBinding()]
param(
    [switch]$SelfTest,
    [string]$MsiPath,
    [string]$ExpectedMsiSha256,
    [string]$ExpectedDisplayVersion = '1.0.0.5',
    [string]$ExpectedAppVersion = '1.0.0-internal.5'
)

$ErrorActionPreference = 'Stop'
$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$InstallDirectory = Join-Path $env:ProgramFiles 'SahelFlow'
$ExecutablePath = Join-Path $InstallDirectory 'sahelflow.exe'
$EvidencePath = Join-Path $ScriptRoot 'Founder-install-result.json'
$RoamingData = Join-Path $env:APPDATA 'com.sahelflow.desktop'
$LocalData = Join-Path $env:LOCALAPPDATA 'com.sahelflow.desktop'
$ExpectedProtocolVersion = 1

function Get-TrackedDataState {
    $tracked = [System.Collections.Generic.List[object]]::new()
    $candidates = [System.Collections.Generic.List[string]]::new()

    $registryPath = Join-Path $RoamingData 'shop-registry.json'
    if (Test-Path -LiteralPath $registryPath -PathType Leaf) {
        $candidates.Add($registryPath)
    }

    $shopsPath = Join-Path $RoamingData 'shops'
    if (Test-Path -LiteralPath $shopsPath -PathType Container) {
        Get-ChildItem -LiteralPath $shopsPath -File -Filter '*.db' -ErrorAction Stop |
            ForEach-Object { $candidates.Add($_.FullName) }
    }

    foreach ($path in $candidates) {
        $item = Get-Item -LiteralPath $path -ErrorAction Stop
        $tracked.Add([ordered]@{
            path = $item.FullName
            length = $item.Length
            sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
        })
    }

    return @($tracked)
}

function Test-TrackedDataPreserved {
    param([array]$Before, [array]$After)

    foreach ($entry in $Before) {
        $match = $After | Where-Object { $_.path -eq $entry.path } | Select-Object -First 1
        if ($null -eq $match) { return $false }
        if ($match.length -ne $entry.length) { return $false }
        if ($match.sha256 -ne $entry.sha256) { return $false }
    }
    return $true
}

function Get-InstalledSahelFlow {
    $roots = @(
        'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
        'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )
    return Get-ItemProperty -Path $roots -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -eq 'SahelFlow' } |
        Sort-Object DisplayVersion -Descending |
        Select-Object -First 1
}

function Read-JsonFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    try {
        return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

if ($SelfTest) {
    if ([string]::IsNullOrWhiteSpace($ScriptRoot)) {
        throw 'Windows PowerShell could not resolve the script directory.'
    }
    if ($ExpectedDisplayVersion -notmatch '^\d+\.\d+\.\d+\.\d+$') {
        throw 'ExpectedDisplayVersion is not a four-part MSI version.'
    }
    if ($ExpectedAppVersion -notmatch '^\d+\.\d+\.\d+-internal\.\d+$') {
        throw 'ExpectedAppVersion is not an internal SahelFlow version.'
    }
    Write-Host "Founder installer self-test passed under Windows PowerShell $($PSVersionTable.PSVersion)." -ForegroundColor Green
    exit 0
}

if ([string]::IsNullOrWhiteSpace($MsiPath)) {
    throw 'MsiPath is required. Pass the exact signed MSI path explicitly.'
}
if ($ExpectedMsiSha256 -notmatch '^[0-9A-Fa-f]{64}$') {
    throw 'ExpectedMsiSha256 must be the exact 64-character SHA-256 supplied with the handoff.'
}

Write-Host "SahelFlow $ExpectedAppVersion Founder installation" -ForegroundColor Cyan
Write-Host 'This upgrades the installed internal candidate in place. It does not uninstall SahelFlow or delete AppData.'

if (-not (Test-Path -LiteralPath $MsiPath -PathType Leaf)) {
    throw "MSI not found: $MsiPath"
}

$running = @(Get-Process -Name 'sahelflow', 'bun', 'sahelflow-whatsapp' -ErrorAction SilentlyContinue)
if ($running.Count -ne 0) {
    throw 'SahelFlow or one of its runtime children is running. Close SahelFlow normally before installing.'
}

$resolvedMsiPath = (Resolve-Path -LiteralPath $MsiPath).Path
$actualHash = (Get-FileHash -LiteralPath $resolvedMsiPath -Algorithm SHA256).Hash
if ($actualHash -ine $ExpectedMsiSha256) {
    throw "MSI SHA-256 mismatch. Expected $ExpectedMsiSha256, found $actualHash. Installation blocked."
}
Write-Host 'MSI SHA-256 verified.' -ForegroundColor Green

$before = @(Get-TrackedDataState)
$arguments = @('/i', ('"{0}"' -f $resolvedMsiPath), '/passive', '/norestart')
$installer = Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments -Verb RunAs -Wait -PassThru
if ($installer.ExitCode -notin @(0, 3010)) {
    throw "MSI installation failed with exit code $($installer.ExitCode)."
}

$afterInstall = @(Get-TrackedDataState)
$dataPreserved = Test-TrackedDataPreserved -Before $before -After $afterInstall
if (-not $dataPreserved) {
    throw 'Tracked shop registry/database state changed during installation. Launch blocked.'
}

$installed = Get-InstalledSahelFlow
if ($null -eq $installed) {
    throw 'SahelFlow is not registered after installation.'
}
if ($installed.DisplayVersion -ne $ExpectedDisplayVersion) {
    throw "Installed version mismatch. Expected $ExpectedDisplayVersion, found $($installed.DisplayVersion)."
}
if (-not (Test-Path -LiteralPath $ExecutablePath -PathType Leaf)) {
    throw "Installed executable not found: $ExecutablePath"
}
$executableVersion = (Get-Item -LiteralPath $ExecutablePath).VersionInfo.ProductVersion
if ($executableVersion -ne $ExpectedAppVersion) {
    throw "Installed executable version mismatch. Expected $ExpectedAppVersion, found $executableVersion."
}

Write-Host 'Installation and AppData preservation checks passed.' -ForegroundColor Green
Write-Host 'Launching SahelFlow and waiting for authenticated hydrated UI proof...' -ForegroundColor Cyan

$endpointCandidates = @(
    (Join-Path $RoamingData 'runtime-endpoint.json'),
    (Join-Path $LocalData 'runtime-endpoint.json')
)
$uiReadyCandidates = @(
    (Join-Path $RoamingData 'runtime-ui-ready.json'),
    (Join-Path $LocalData 'runtime-ui-ready.json')
)
$diagnosticCandidates = @(
    (Join-Path $RoamingData 'startup-diagnostic.json'),
    (Join-Path $LocalData 'startup-diagnostic.json')
)

$launchStartedAt = Get-Date
$app = Start-Process -FilePath $ExecutablePath -PassThru
$deadline = (Get-Date).AddMinutes(10)
$endpoint = $null
$endpointPath = $null
$uiReady = $null
$uiReadyPath = $null

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    $app.Refresh()
    if ($app.HasExited) {
        throw "SahelFlow exited before authenticated UI readiness with code $($app.ExitCode)."
    }

    foreach ($candidate in $diagnosticCandidates) {
        $item = Get-Item -LiteralPath $candidate -ErrorAction SilentlyContinue
        if ($null -eq $item -or $item.LastWriteTime -lt $launchStartedAt.AddSeconds(-2)) { continue }
        $diagnostic = Read-JsonFile -Path $candidate
        if ($null -ne $diagnostic -and $diagnostic.state -eq 'blocked' -and $diagnostic.appVersion -eq $ExpectedAppVersion) {
            throw "SahelFlow reported $($diagnostic.code): $($diagnostic.detail)"
        }
    }

    foreach ($candidate in $endpointCandidates) {
        $item = Get-Item -LiteralPath $candidate -ErrorAction SilentlyContinue
        if ($null -eq $item -or $item.LastWriteTime -lt $launchStartedAt.AddSeconds(-2)) { continue }
        $parsed = Read-JsonFile -Path $candidate
        if (
            $null -ne $parsed -and
            $parsed.state -eq 'ready' -and
            $parsed.appVersion -eq $ExpectedAppVersion -and
            [int64]$parsed.processId -eq [int64]$app.Id -and
            -not [string]::IsNullOrWhiteSpace([string]$parsed.instanceId)
        ) {
            $endpoint = $parsed
            $endpointPath = $candidate
            break
        }
    }

    foreach ($candidate in $uiReadyCandidates) {
        $item = Get-Item -LiteralPath $candidate -ErrorAction SilentlyContinue
        if ($null -eq $item -or $item.LastWriteTime -lt $launchStartedAt.AddSeconds(-2)) { continue }
        $parsed = Read-JsonFile -Path $candidate
        if (
            $null -ne $parsed -and
            [int]$parsed.formatVersion -eq 1 -and
            [int]$parsed.protocolVersion -eq $ExpectedProtocolVersion -and
            $parsed.state -eq 'ready' -and
            $parsed.appVersion -eq $ExpectedAppVersion -and
            $parsed.pageUrl -match '^http://(127\.0\.0\.1|localhost):\d+$'
        ) {
            $uiReady = $parsed
            $uiReadyPath = $candidate
            break
        }
    }

    $app.Refresh()
    if (
        $null -ne $endpoint -and
        $null -ne $uiReady -and
        $uiReady.instanceId -eq $endpoint.instanceId -and
        $app.MainWindowHandle -ne 0 -and
        $app.Responding
    ) {
        break
    }
}

$app.Refresh()
if (
    $null -eq $endpoint -or
    $null -eq $uiReady -or
    $uiReady.instanceId -ne $endpoint.instanceId -or
    $app.MainWindowHandle -eq 0 -or
    -not $app.Responding
) {
    throw 'SahelFlow did not produce a matching authenticated, hydrated, visible, responsive interface within ten minutes.'
}

$result = [ordered]@{
    capturedAt = (Get-Date).ToUniversalTime().ToString('o')
    msiPath = $resolvedMsiPath
    msiSha256 = $actualHash
    installerExitCode = $installer.ExitCode
    installedDisplayVersion = $installed.DisplayVersion
    installedExecutableVersion = $executableVersion
    installLocation = $installed.InstallLocation
    appProcessId = $app.Id
    appResponding = $app.Responding
    mainWindowHandle = $app.MainWindowHandle
    appVersion = $endpoint.appVersion
    runtimeState = $endpoint.state
    runtimeInstanceId = $endpoint.instanceId
    runtimeEndpointPath = $endpointPath
    runtimeUiReadyPath = $uiReadyPath
    runtimeUiReady = $uiReady
    preExistingTrackedDataFiles = $before
    postInstallTrackedDataFiles = $afterInstall
    trackedAppDataPreserved = $dataPreserved
    uninstallPerformed = $false
    appDataDeleted = $false
    outcome = 'AUTHENTICATED_UI_READY'
}
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8

Write-Host ''
Write-Host "SUCCESS: SahelFlow $ExpectedAppVersion is installed with an authenticated, hydrated, visible interface." -ForegroundColor Green
Write-Host "Instance: $($endpoint.instanceId)"
Write-Host "Evidence: $EvidencePath"
Write-Host 'Leave SahelFlow open and visually confirm that the setup, login, or workspace screen is usable.'
