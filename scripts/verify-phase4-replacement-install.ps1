param(
    [Parameter(Mandatory = $true)]
    [string]$MsiPath,
    [Parameter(Mandatory = $true)]
    [string]$RepositoryRoot,
    [switch]$ValidateHarnessOnly
)

$ErrorActionPreference = "Stop"
if ($env:GITHUB_ACTIONS -cne "true") {
    throw "The replacement-install drill is restricted to an ephemeral GitHub Actions Windows runner."
}

$repositoryRoot = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$resolvedMsi = (Resolve-Path -LiteralPath $MsiPath).Path
$exe = "C:\Program Files\SahelFlow\sahelflow.exe"
$roamingRoot = Join-Path $env:APPDATA "com.sahelflow.desktop"
$localRoot = Join-Path $env:LOCALAPPDATA "com.sahelflow.desktop"
$endpointPath = Join-Path $roamingRoot "runtime-endpoint.json"
$registryPath = Join-Path $roamingRoot "shop-registry.json"
$recoveryJournalRoot = Join-Path $roamingRoot "recovery-journal"
$pendingRestorePath = Join-Path $recoveryJournalRoot "pending-restore.json"
$restoreReceiptPath = Join-Path $recoveryJournalRoot "last-restore.json"
$identityAuthorityPath = Join-Path $roamingRoot "system\identity-authority.json"
$digestScript = Join-Path $repositoryRoot "scripts\phase4-installed-database-digest.ts"
$parityScript = Join-Path $repositoryRoot "scripts\phase4-durable-parity.ps1"
$canonicalHarness = Join-Path $repositoryRoot "scripts\verify-phase4-replacement-install.ps1"
$pin = "Phase4-Owner-8642"
$sourcePhone = "0550008642"
$localPhone = "0550008643"
$sourceSecret = "phase4-evidence-secret-8642"

if (-not (Test-Path -LiteralPath $digestScript -PathType Leaf)) {
    throw "The replacement harness repository root does not contain its database digest dependency."
}
if (-not (Test-Path -LiteralPath $canonicalHarness -PathType Leaf)) {
    throw "The replacement harness repository root does not contain the canonical harness."
}
if (-not (Test-Path -LiteralPath $parityScript -PathType Leaf)) {
    throw "The replacement harness repository root does not contain its durable parity dependency."
}
. $parityScript
$bunCommand = Get-Command bun -CommandType Application -ErrorAction SilentlyContinue
if ($null -eq $bunCommand) {
    throw "The replacement harness requires Bun on PATH."
}
if ($ValidateHarnessOnly) {
    Write-Host "Phase 4 replacement harness dependency and relocation contract passed."
    return
}

$evidenceRoot = Join-Path $env:RUNNER_TEMP "sahelflow-installed-e2e"
$resultPath = Join-Path $evidenceRoot "phase4-replacement-result.json"
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null

if ($env:SF_PHASE4_WEBVIEW_DEBUG_PORT -cnotmatch "^[0-9]{1,5}$") {
    throw "The CI-only evidence MSI did not publish its WebView debugging port."
}
$runtimeDebuggingPort = [int]$env:SF_PHASE4_WEBVIEW_DEBUG_PORT
if ($runtimeDebuggingPort -lt 1 -or $runtimeDebuggingPort -gt 65535) {
    throw "The CI-only WebView debugging port is outside the TCP port range."
}

function Read-JsonFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Get-FileSha256OrNull {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

# Tauri may surface Windows known folders in Win32 verbatim form. Convert only
# the evidence probe passed to PowerShell's filesystem provider; retain the
# native response, backup identity, recovery code and restore payload unchanged.
function Get-SahelFlowProviderPathKind {
    param([AllowEmptyString()][string]$Path)
    if ($Path.StartsWith('\\?\UNC\', [StringComparison]::OrdinalIgnoreCase)) { return "extended-unc" }
    if ($Path.StartsWith('\\?\')) { return "extended-drive" }
    return "conventional"
}

function ConvertTo-SahelFlowProviderPath {
    param([AllowEmptyString()][string]$Path)
    if ([string]::IsNullOrWhiteSpace($Path)) { return "" }
    if ($Path.StartsWith('\\?\UNC\', [StringComparison]::OrdinalIgnoreCase) -and $Path.Length -gt 8) {
        return "\\$($Path.Substring(8))"
    }
    if ($Path.StartsWith('\\?\') -and $Path.Length -gt 4) {
        $conventional = $Path.Substring(4)
        if ($conventional -cmatch '^[A-Za-z]:\\') { return $conventional }
        throw "The native operation returned an unsupported extended Windows path kind."
    }
    return $Path
}

function Assert-SahelFlowProviderPathContract {
    $cases = @(
        @{ input = '\\?\C:\SahelFlow\evidence'; expected = 'C:\SahelFlow\evidence' },
        @{ input = '\\?\UNC\server\share\evidence'; expected = '\\server\share\evidence' },
        @{ input = '\\?\unc\server\share\evidence'; expected = '\\server\share\evidence' },
        @{ input = 'C:\SahelFlow\evidence'; expected = 'C:\SahelFlow\evidence' }
    )
    foreach ($case in $cases) {
        $actual = ConvertTo-SahelFlowProviderPath ([string]$case.input)
        if ($actual -cne [string]$case.expected) {
            throw "The Windows provider-path normalization contract failed."
        }
    }
}

Assert-SahelFlowProviderPathContract

function Stop-ResidualSahelFlow {
    Get-Process -Name sahelflow -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-Process -Name node -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -like "C:\Program Files\SahelFlow\*" } |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.Name -ieq "msedgewebview2.exe" -and
            [string]$_.CommandLine -match "com\.sahelflow\.desktop"
        } |
        ForEach-Object {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
    Start-Sleep -Milliseconds 500
}

function Start-SahelFlow {
    if (-not (Test-Path -LiteralPath $exe -PathType Leaf)) {
        throw "Installed executable is missing."
    }
    Remove-Item -LiteralPath $endpointPath -Force -ErrorAction SilentlyContinue
    return Start-Process -FilePath $exe -PassThru
}

function Wait-ForRuntime {
    param(
        [Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process,
        [Parameter(Mandatory = $true)][string]$Phase
    )
    $deadline = (Get-Date).AddMinutes(4)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 250
        $Process.Refresh()
        if ($Process.HasExited) {
            throw "$Phase exited before runtime readiness with code $($Process.ExitCode)."
        }
        $endpoint = Read-JsonFile $endpointPath
        if ($null -ne $endpoint -and $endpoint.state -eq "ready") {
            return $endpoint
        }
    }
    throw "$Phase did not publish runtime readiness."
}

function Invoke-SahelFlowJson {
    param(
        [Parameter(Mandatory = $true)][string]$Method,
        [Parameter(Mandatory = $true)][string]$BaseUrl,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        $Body = $null
    )
    $arguments = @{
        Method = $Method
        Uri = "$BaseUrl$Path"
        WebSession = $Session
        SkipHttpErrorCheck = $true
        UseBasicParsing = $true
    }
    if ($null -ne $Body) {
        $arguments.ContentType = "application/json"
        $arguments.Body = $Body | ConvertTo-Json -Depth 12 -Compress
    }
    $response = Invoke-WebRequest @arguments
    $decoded = if ([string]::IsNullOrWhiteSpace($response.Content)) {
        $null
    } else {
        $response.Content | ConvertFrom-Json
    }
    return [pscustomobject]@{
        status = [int]$response.StatusCode
        body = $decoded
        setCookies = @($response.Headers["Set-Cookie"])
    }
}

function Import-SellerSessionCookieFromResponse {
    param(
        [Parameter(Mandatory = $true)][string]$BaseUrl,
        [Parameter(Mandatory = $true)][Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [Parameter(Mandatory = $true)]$Response
    )
    # The installed app correctly marks the seller session Secure in
    # production. This evidence client speaks only to the app's HTTP
    # loopback listener, and System.Net therefore will not resend that
    # Secure cookie. Reuse the exact server-minted value only inside
    # this ephemeral runner by copying it into a host-only non-Secure
    # loopback cookie. Production cookie policy is never changed.
    $header = @($Response.setCookies) -join ","
    $match = [regex]::Match(
        $header,
        "(?:^|,\s*)sf_session=([^;,\s]+)"
    )
    if (-not $match.Success) {
        throw "Seller session response did not contain the expected auth cookie."
    }
    $cookie = [System.Net.Cookie]::new(
        "sf_session",
        $match.Groups[1].Value,
        "/"
    )
    $cookie.HttpOnly = $true
    $cookie.Secure = $false
    $Session.Cookies.Add([Uri]$BaseUrl, $cookie)
    $cookie = $null
    $match = $null
    $header = $null
}

function Read-CdpMessage {
    param(
        [Parameter(Mandatory = $true)][System.Net.WebSockets.ClientWebSocket]$Socket,
        [Parameter(Mandatory = $true)][System.Threading.CancellationToken]$CancellationToken
    )
    $stream = [System.IO.MemoryStream]::new()
    try {
        do {
            $buffer = [byte[]]::new(16384)
            $segment = [System.ArraySegment[byte]]::new($buffer)
            $result = $Socket.ReceiveAsync($segment, $CancellationToken).GetAwaiter().GetResult()
            if ($result.MessageType -eq [System.Net.WebSockets.WebSocketMessageType]::Close) {
                throw "The WebView2 CDP target closed before returning its runtime cookie."
            }
            $stream.Write($buffer, 0, $result.Count)
        } while (-not $result.EndOfMessage)
        return [System.Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
    } finally {
        $stream.Dispose()
    }
}

function Get-RuntimeCookieFromTarget {
    param(
        [Parameter(Mandatory = $true)][string]$WebSocketUrl,
        [Parameter(Mandatory = $true)][string]$BaseUrl
    )
    $socket = [System.Net.WebSockets.ClientWebSocket]::new()
    $timeout = [System.Threading.CancellationTokenSource]::new([TimeSpan]::FromSeconds(5))
    try {
        # Chromium rejects CDP WebSocket requests carrying an unapproved Origin.
        # Bind this disposable evidence client and evidence-only MSI to one exact
        # loopback origin instead of opening the endpoint to a wildcard origin.
        $socket.Options.SetRequestHeader(
            "Origin",
            "http://127.0.0.1:$runtimeDebuggingPort"
        )
        $socket.Options.Proxy = $null
        $socket.ConnectAsync([Uri]$WebSocketUrl, $timeout.Token).GetAwaiter().GetResult()
        $base = [Uri]$BaseUrl
        $command = @{
            id = 1
            method = "Storage.getCookies"
            params = @{}
        } | ConvertTo-Json -Depth 5 -Compress
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($command)
        $socket.SendAsync(
            [System.ArraySegment[byte]]::new($bytes),
            [System.Net.WebSockets.WebSocketMessageType]::Text,
            $true,
            $timeout.Token
        ).GetAwaiter().GetResult()

        do {
            $message = Read-CdpMessage -Socket $socket -CancellationToken $timeout.Token
        } while ([int]$message.id -ne 1)

        return @(
            $message.result.cookies | Where-Object {
                $_.name -ceq "sf_runtime" -and
                ([string]$_.domain -ceq $base.Host -or [string]$_.domain -ceq "localhost") -and
                [string]$_.path -ceq "/"
            }
        ) |
            Select-Object -First 1
    } finally {
        $timeout.Dispose()
        $socket.Dispose()
    }
}

function Import-RuntimeCookieFromWebView {
    param(
        [Parameter(Mandatory = $true)][string]$BaseUrl,
        [Parameter(Mandatory = $true)][Microsoft.PowerShell.Commands.WebRequestSession]$Session
    )
    $deadline = (Get-Date).AddSeconds(30)
    $debugEndpoint = "http://127.0.0.1:$runtimeDebuggingPort/json/list"
    do {
        try {
            $targets = @(Invoke-RestMethod -Uri $debugEndpoint -TimeoutSec 2)
            $appPort = ([Uri]$BaseUrl).Port
            $candidates = @(
                $targets | Where-Object {
                    -not [string]::IsNullOrWhiteSpace([string]$_.webSocketDebuggerUrl) -and
                    (
                        [string]$_.url -match ":$appPort(?:/|$)" -or
                        [string]$_.type -ceq "page"
                    )
                }
            )
            foreach ($target in $candidates) {
                $cookie = Get-RuntimeCookieFromTarget `
                    -WebSocketUrl ([string]$target.webSocketDebuggerUrl) `
                    -BaseUrl $BaseUrl
                if (
                    $null -ne $cookie -and
                    [string]$cookie.value -cmatch "^[0-9a-f]{64}$"
                ) {
                    # Keep the per-launch bearer only in this process. It is never
                    # written to evidence or emitted to the Actions log.
                    $Session.Cookies.SetCookies(
                        [Uri]$BaseUrl,
                        "sf_runtime=$([string]$cookie.value); Path=/; HttpOnly"
                    )
                    $cookie = $null
                    return
                }
            }
        } catch {
            # WebView2 and its CDP target appear asynchronously after runtime
            # readiness. Retry only inside this bounded ephemeral-runner gate.
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)
    throw "The installed WebView session did not expose its runtime cookie to the bounded CI drill."
}

function Establish-OwnerSession {
    param(
        [Parameter(Mandatory = $true)][string]$BaseUrl,
        [Parameter(Mandatory = $true)][Microsoft.PowerShell.Commands.WebRequestSession]$Session,
        [switch]$RequireSetup
    )
    Import-RuntimeCookieFromWebView -BaseUrl $BaseUrl -Session $Session
    $setup = Invoke-SahelFlowJson -Method POST -BaseUrl $BaseUrl -Path "/api/auth/setup" -Session $Session -Body @{ pin = $pin }
    if ($setup.status -eq 200) {
        Import-SellerSessionCookieFromResponse -BaseUrl $BaseUrl -Session $Session -Response $setup
        return
    }
    if ($RequireSetup -and $setup.status -eq 409) {
        throw "Replacement owner authority was not cleared before re-enrollment."
    }
    if ($setup.status -ne 409) {
        throw "Owner setup failed with HTTP $($setup.status)."
    }
    $login = Invoke-SahelFlowJson -Method POST -BaseUrl $BaseUrl -Path "/api/auth/login" -Session $Session -Body @{ pin = $pin }
    if ($login.status -ne 200) {
        throw "Owner login failed with HTTP $($login.status)."
    }
    Import-SellerSessionCookieFromResponse -BaseUrl $BaseUrl -Session $Session -Response $login
}

if (-not ("SahelFlowPhase4Closer" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class SahelFlowPhase4Closer {
  private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);
  [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
  [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);
  [DllImport("user32.dll")] private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
  public static int Close(uint processId) {
    var count = 0;
    EnumWindows((window, parameter) => {
      uint owner; GetWindowThreadProcessId(window, out owner);
      if (owner == processId && PostMessage(window, 0x0010, IntPtr.Zero, IntPtr.Zero)) count++;
      return true;
    }, IntPtr.Zero);
    return count;
  }
}
"@
}

function Close-SahelFlow {
    param([Parameter(Mandatory = $true)][System.Diagnostics.Process]$Process)
    $Process.Refresh()
    if ($Process.HasExited) { throw "SahelFlow exited before normal close proof." }
    $posted = [SahelFlowPhase4Closer]::Close([uint32]$Process.Id)
    if ($posted -lt 1) { throw "No SahelFlow window accepted WM_CLOSE." }
    if (-not $Process.WaitForExit(30000)) {
        throw "SahelFlow did not exit after WM_CLOSE."
    }
    $deadline = (Get-Date).AddSeconds(20)
    while ((Get-Date) -lt $deadline) {
        if (-not (Test-Path -LiteralPath $endpointPath -PathType Leaf)) { return }
        Start-Sleep -Milliseconds 250
    }
    throw "Runtime endpoint remained after normal close."
}

function Get-DatabaseDigest {
    param([Parameter(Mandatory = $true)][string]$DatabasePath)
    $output = @(& $bunCommand.Source $digestScript $DatabasePath 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Database digest failed: $($output -join [Environment]::NewLine)"
    }
    return ($output | Select-Object -Last 1) | ConvertFrom-Json
}

function Get-ProfileEvidence {
    $registry = Read-JsonFile $registryPath
    if ($null -eq $registry) { throw "Shop registry is missing." }
    $shops = @(
        foreach ($shop in @($registry.shops)) {
            $databasePath = Join-Path (Join-Path $roamingRoot "shops") ([string]$shop.databaseFile)
            if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
                throw "Registered shop database is missing."
            }
            [pscustomobject]@{
                shopId = [string]$shop.id
                incarnationId = [string]$shop.incarnationId
                name = [string]$shop.name
                databaseFile = [string]$shop.databaseFile
                icon = if ($null -eq $shop.icon) { $null } else { [string]$shop.icon }
                createdAt = [string]$shop.createdAt
                digest = Get-DatabaseDigest $databasePath
            }
        }
    )
    return [pscustomobject]@{
        formatVersion = [int]$registry.formatVersion
        revision = [int64]$registry.revision
        workspaceId = [string]$registry.workspaceId
        installationId = [string]$registry.installationId
        activeShopId = [string]$registry.activeShopId
        shopCount = $shops.Count
        registrySha256 = Get-FileSha256OrNull $registryPath
        identityAuthoritySha256 = Get-FileSha256OrNull $identityAuthorityPath
        shops = $shops
    }
}

function Assert-ActiveIdentityFootprint {
    param(
        $Evidence,
        [Parameter(Mandatory = $true)]
        [ValidateSet("bound", "absent")]
        [string]$ExpectedState
    )
    $activeShop = @(
        $Evidence.shops | Where-Object { $_.shopId -ceq $Evidence.activeShopId }
    )
    if ($activeShop.Count -ne 1) {
        throw "Identity-footprint evidence did not resolve exactly one active shop."
    }
    $footprint = $activeShop[0].digest.identityAuthorityFootprint
    if ($ExpectedState -ceq "absent") {
        if ($null -ne $footprint) {
            throw "Replacement restore retained the source installation identity footprint."
        }
        return
    }
    if (
        $null -eq $footprint -or
        [int]$footprint.formatVersion -ne 1 -or
        [string]$footprint.workspaceId -cne [string]$Evidence.workspaceId -or
        [string]$footprint.installationId -cne [string]$Evidence.installationId
    ) {
        throw "Active identity footprint does not bind the current workspace and installation."
    }
}

function Assert-RestoredIdentityAuthorityCleared {
    param($Evidence)
    foreach ($shop in @($Evidence.shops)) {
        if ($null -ne $shop.digest.identityAuthorityFootprint) {
            throw "Replacement restore retained an identity footprint for shop $($shop.shopId)."
        }
        if (
            [int64]$shop.digest.authSecretCount -ne 0 -or
            (Get-ExactTableCount $shop.digest "AuthSecret") -ne 0 -or
            (Get-ExactTableCount $shop.digest "Session") -ne 0
        ) {
            throw "Replacement restore retained PIN or session authority for shop $($shop.shopId)."
        }
    }
}

function Assert-ReenrolledIdentityAuthority {
    param($Evidence, $SourceEvidence)
    Assert-ActiveIdentityFootprint $Evidence "bound"
    $activeShop = @(
        $Evidence.shops | Where-Object { $_.shopId -ceq $Evidence.activeShopId }
    )[0]
    $sourceActiveShop = @(
        $SourceEvidence.shops | Where-Object { $_.shopId -ceq $Evidence.activeShopId }
    )
    if ($sourceActiveShop.Count -ne 1) {
        throw "Re-enrollment evidence did not resolve the restored active shop in source evidence."
    }
    if (
        [int64]$activeShop.digest.authSecretCount -ne 1 -or
        (Get-ExactTableCount $activeShop.digest "AuthSecret") -ne 1 -or
        (Get-ExactTableCount $activeShop.digest "Session") -lt 1 -or
        [string]$activeShop.digest.authSecretAuthorityDigest -ceq
            [string]$sourceActiveShop[0].digest.authSecretAuthorityDigest
    ) {
        throw "Replacement owner PIN/session authority was not independently re-enrolled."
    }
    foreach ($shop in @($Evidence.shops | Where-Object { $_.shopId -cne $Evidence.activeShopId })) {
        if (
            $null -ne $shop.digest.identityAuthorityFootprint -or
            [int64]$shop.digest.authSecretCount -ne 0 -or
            (Get-ExactTableCount $shop.digest "AuthSecret") -ne 0 -or
            (Get-ExactTableCount $shop.digest "Session") -ne 0
        ) {
            throw "Inactive restored shop $($shop.shopId) retained or created local identity authority."
        }
    }
}

function Install-Msi {
    param([ValidateSet("install", "uninstall")][string]$Mode)
    $verb = if ($Mode -eq "install") { "/i" } else { "/x" }
    $arguments = "$verb `"$resolvedMsi`" /qn /norestart"
    $process = Start-Process -FilePath "$env:SystemRoot\System32\msiexec.exe" -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "MSI $Mode failed with exit code $($process.ExitCode)." }
}

Stop-ResidualSahelFlow

# Source installation: establish real owner/session, protected PII and secret,
# then create an independent recovery kit and encrypted all-shop backup.
$sourceProcess = Start-SahelFlow
$sourceEndpoint = Wait-ForRuntime $sourceProcess "source installation"
$sourceBaseUrl = [string]$sourceEndpoint.appUrl
$sourceSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Establish-OwnerSession $sourceBaseUrl $sourceSession

$search = Invoke-SahelFlowJson -Method GET -BaseUrl $sourceBaseUrl -Path "/api/customers/search?q=$sourcePhone" -Session $sourceSession
if ($search.status -ne 200) {
    $safeCode = if ($null -ne $search.body -and $null -ne $search.body.code) {
        [string]$search.body.code
    } else {
        "none"
    }
    throw "Source customer search failed with HTTP $($search.status) and code $safeCode."
}
if ([int]$search.body.total -eq 0) {
    $created = Invoke-SahelFlowJson -Method POST -BaseUrl $sourceBaseUrl -Path "/api/customers" -Session $sourceSession -Body @{
        name = "Phase4 Evidence Customer"
        phone = $sourcePhone
        wilaya = "Alger"
        commune = "Alger Centre"
        address = "Evidence address"
        notes = "replacement-install evidence"
    }
    if ($created.status -ne 201) { throw "Protected source customer creation failed." }
}
$secretWrite = Invoke-SahelFlowJson -Method POST -BaseUrl $sourceBaseUrl -Path "/api/secrets/gemini-key" -Session $sourceSession -Body @{ key = $sourceSecret; test = $false }
if ($secretWrite.status -ne 200) { throw "Protected source secret creation failed." }
$kit = Invoke-SahelFlowJson -Method POST -BaseUrl $sourceBaseUrl -Path "/api/backup/recovery-kit" -Session $sourceSession
if ($kit.status -ne 201) {
    $kitCode = if ($null -ne $kit.body -and $null -ne $kit.body.code) { [string]$kit.body.code } else { "none" }
    throw "Independent recovery kit creation failed with HTTP $($kit.status) and code $kitCode."
}
$kitPath = if ($null -ne $kit.body -and $null -ne $kit.body.path) { [string]$kit.body.path } else { "" }
if ([string]::IsNullOrWhiteSpace($kitPath)) {
    throw "Independent recovery kit creation returned HTTP 201 without a persisted path."
}
$kitPathKind = Get-SahelFlowProviderPathKind $kitPath
$kitProbePath = ConvertTo-SahelFlowProviderPath $kitPath
if (-not [System.IO.Path]::IsPathRooted($kitProbePath)) {
    throw "Independent recovery kit creation returned a non-absolute $kitPathKind path."
}
if (-not (Test-Path -LiteralPath $kitProbePath -PathType Leaf)) {
    throw "Independent recovery kit creation returned HTTP 201, but its $kitPathKind persisted file was not found."
}
$sourceEvidence = Get-ProfileEvidence
if ($sourceEvidence.shopCount -lt 2) { throw "Source profile is not a realistic multi-shop installation." }
Assert-ActiveIdentityFootprint $sourceEvidence "bound"
$backup = Invoke-SahelFlowJson -Method POST -BaseUrl $sourceBaseUrl -Path "/api/backup/create" -Session $sourceSession
if ($backup.status -ne 201) {
    $backupCode = if ($null -ne $backup.body -and $null -ne $backup.body.code) { [string]$backup.body.code } else { "none" }
    throw "All-shop source backup creation failed with HTTP $($backup.status) and code $backupCode."
}
$backupShopCount = if ($null -ne $backup.body -and $null -ne $backup.body.shopCount) { [int]$backup.body.shopCount } else { -1 }
if ($backupShopCount -lt 2) {
    throw "All-shop source backup returned HTTP 201 with shopCount $backupShopCount; expected at least 2."
}
$backupPath = if ($null -ne $backup.body -and $null -ne $backup.body.location) { [string]$backup.body.location } else { "" }
if ([string]::IsNullOrWhiteSpace($backupPath)) {
    throw "All-shop source backup returned HTTP 201 and shopCount $backupShopCount without a persisted location."
}
$backupPathKind = Get-SahelFlowProviderPathKind $backupPath
$backupProbePath = ConvertTo-SahelFlowProviderPath $backupPath
if (-not [System.IO.Path]::IsPathRooted($backupProbePath)) {
    throw "All-shop source backup returned a non-absolute $backupPathKind location."
}
if (-not (Test-Path -LiteralPath $backupProbePath -PathType Container)) {
    throw "All-shop source backup returned HTTP 201 and shopCount $backupShopCount, but its $backupPathKind persisted directory was not found."
}
$sourceSearch = Invoke-SahelFlowJson -Method GET -BaseUrl $sourceBaseUrl -Path "/api/customers/search?q=$sourcePhone" -Session $sourceSession
$sourceSecretState = Invoke-SahelFlowJson -Method GET -BaseUrl $sourceBaseUrl -Path "/api/secrets/gemini-key" -Session $sourceSession
if ($sourceSearch.status -ne 200 -or [int]$sourceSearch.body.total -lt 1 -or $sourceSecretState.body.configured -ne $true) {
    throw "Source protected-data readback failed."
}
Close-SahelFlow $sourceProcess
Stop-ResidualSahelFlow

# Prove source loss, then install into a new local profile/root.
$sourceActive = @($sourceEvidence.shops | Where-Object { $_.shopId -eq $sourceEvidence.activeShopId })[0]
$sourceActivePath = Join-Path (Join-Path $roamingRoot "shops") ((Read-JsonFile $registryPath).shops | Where-Object { $_.id -eq $sourceEvidence.activeShopId } | Select-Object -ExpandProperty databaseFile)
$sourceDatabaseSha = Get-FileSha256OrNull $sourceActivePath
[System.IO.File]::WriteAllBytes($sourceActivePath, [byte[]](1..64))
if ((Get-FileSha256OrNull $sourceActivePath) -ceq $sourceDatabaseSha) { throw "Source corruption fixture did not change the database." }
Remove-Item -LiteralPath $roamingRoot, $localRoot -Recurse -Force -ErrorAction SilentlyContinue
Install-Msi uninstall
Install-Msi install

$replacementProcess = Start-SahelFlow
$replacementEndpoint = Wait-ForRuntime $replacementProcess "replacement installation"
$replacementBaseUrl = [string]$replacementEndpoint.appUrl
$replacementSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Establish-OwnerSession $replacementBaseUrl $replacementSession
$replacementRegistry = Read-JsonFile $registryPath
if ([string]$replacementRegistry.installationId -ceq $sourceEvidence.installationId) {
    throw "Replacement installation cloned the source installation identity."
}
$localCreated = Invoke-SahelFlowJson -Method POST -BaseUrl $replacementBaseUrl -Path "/api/customers" -Session $replacementSession -Body @{ name = "Local Rollback Sentinel"; phone = $localPhone; wilaya = "Oran"; commune = "Oran"; address = "Local evidence" }
if ($localCreated.status -ne 201) { throw "Replacement-local rollback sentinel creation failed." }
$localSecret = Invoke-SahelFlowJson -Method POST -BaseUrl $replacementBaseUrl -Path "/api/secrets/gemini-key" -Session $replacementSession -Body @{ key = "replacement-local-secret-8643"; test = $false }
if ($localSecret.status -ne 200) { throw "Replacement-local secret creation failed." }
$restore = Invoke-SahelFlowJson -Method POST -BaseUrl $replacementBaseUrl -Path "/api/backup/restore" -Session $replacementSession -Body @{ backupId = [string]$backup.body.backupId; recoveryCode = [string]$kit.body.recoveryCode; confirm = "RESTORE" }
if ($restore.status -ne 202 -or $restore.body.restartRequired -ne $true) { throw "Replacement restore was not staged." }
Close-SahelFlow $replacementProcess
$replacementBeforeRestore = Get-ProfileEvidence
Assert-ActiveIdentityFootprint $replacementBeforeRestore "bound"

# First installed launch performs one real shop replacement and exits at the
# evidence-only boundary. The next launch rolls the partial cutover back to the
# rescued replacement profile and exits before resuming. The final launch then
# applies and commits the same staged restore normally.
$env:SF_PHASE4_RESTORE_INTERRUPT_AFTER_SHOPS = "1"
$interrupted = Start-SahelFlow
if (-not $interrupted.WaitForExit(120000)) { Stop-Process -Id $interrupted.Id -Force; throw "Interrupted restore did not stop." }
Remove-Item Env:SF_PHASE4_RESTORE_INTERRUPT_AFTER_SHOPS -ErrorAction SilentlyContinue
if ($interrupted.ExitCode -ne 86) { throw "Restore interruption did not exit at the governed shop boundary." }
$interrupted.Dispose()
Stop-ResidualSahelFlow
$interruptedJournal = Read-JsonFile $pendingRestorePath
if ($null -eq $interruptedJournal -or $interruptedJournal.state -ne "applying") { throw "Interrupted restore did not retain applying journal authority." }

$env:SF_PHASE4_RESTORE_STOP_AFTER_ROLLBACK = "1"
$rolledBack = Start-SahelFlow
if (-not $rolledBack.WaitForExit(120000)) { Stop-Process -Id $rolledBack.Id -Force; throw "Rollback proof did not stop." }
Remove-Item Env:SF_PHASE4_RESTORE_STOP_AFTER_ROLLBACK -ErrorAction SilentlyContinue
if ($rolledBack.ExitCode -ne 87) { throw "Restore rollback did not reach the governed rescue boundary." }
$rolledBack.Dispose()
Stop-ResidualSahelFlow
$rollbackJournal = Read-JsonFile $pendingRestorePath
if ($null -eq $rollbackJournal -or $rollbackJournal.state -ne "rescue-ready") { throw "Rollback did not return the journal to rescue-ready." }
$replacementAfterRollback = Get-ProfileEvidence
Assert-RollbackAuthorityParity $replacementBeforeRestore $replacementAfterRollback
Assert-ActiveIdentityFootprint $replacementAfterRollback "bound"
if ($replacementAfterRollback.installationId -cne $replacementBeforeRestore.installationId) { throw "Rollback changed replacement installation authority." }

$committedProcess = Start-SahelFlow
$committedEndpoint = Wait-ForRuntime $committedProcess "committed replacement restore"
$committedBaseUrl = [string]$committedEndpoint.appUrl
$restoredBeforeReenrollment = Get-ProfileEvidence
Assert-DurableDataParity $sourceEvidence $restoredBeforeReenrollment
Assert-ProtectedKeyRewrap $sourceEvidence $restoredBeforeReenrollment
Assert-RestoredIdentityAuthorityCleared $restoredBeforeReenrollment
if ($restoredBeforeReenrollment.workspaceId -cne $sourceEvidence.workspaceId) { throw "Restored workspace identity changed." }
if ($restoredBeforeReenrollment.installationId -cne $replacementBeforeRestore.installationId) { throw "Restore did not retain replacement installation identity." }
if ($restoredBeforeReenrollment.installationId -ceq $sourceEvidence.installationId) { throw "Restore cloned the source installation identity." }
if ($restoredBeforeReenrollment.revision -le $sourceEvidence.revision) { throw "Restore did not advance registry revision authority." }
$committedSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Establish-OwnerSession $committedBaseUrl $committedSession -RequireSetup
$restoredSearch = Invoke-SahelFlowJson -Method GET -BaseUrl $committedBaseUrl -Path "/api/customers/search?q=$sourcePhone" -Session $committedSession
$restoredSecretState = Invoke-SahelFlowJson -Method GET -BaseUrl $committedBaseUrl -Path "/api/secrets/gemini-key" -Session $committedSession
if ($restoredSearch.status -ne 200 -or [int]$restoredSearch.body.total -lt 1) { throw "Restored protected customer was not searchable by blind index." }
if ($restoredSecretState.status -ne 200 -or $restoredSecretState.body.configured -ne $true) { throw "Restored protected secret was unavailable." }
Close-SahelFlow $committedProcess
$restoredEvidence = Get-ProfileEvidence
Assert-ReenrolledIdentityAuthority $restoredEvidence $sourceEvidence
if ($restoredEvidence.workspaceId -cne $sourceEvidence.workspaceId) { throw "Restored workspace identity changed." }
if ($restoredEvidence.installationId -cne $replacementBeforeRestore.installationId) { throw "Restore did not retain replacement installation identity." }
if ($restoredEvidence.installationId -ceq $sourceEvidence.installationId) { throw "Restore cloned the source installation identity." }
if ($restoredEvidence.identityAuthoritySha256 -ceq $sourceEvidence.identityAuthoritySha256) { throw "Restore cloned source local identity authority." }
foreach ($sourceShop in @($sourceEvidence.shops)) {
    $restoredShop = @($restoredEvidence.shops | Where-Object { $_.shopId -eq $sourceShop.shopId })[0]
    $overlap = @($sourceShop.digest.sessionIdentityHashes | Where-Object { $restoredShop.digest.sessionIdentityHashes -contains $_ })
    if ($overlap.Count -ne 0) { throw "Restore cloned a source session authority." }
}
$restoreReceipt = Read-JsonFile $restoreReceiptPath
if ($null -eq $restoreReceipt) { throw "Committed restore receipt is missing." }
if (
    [int]$restoreReceipt.formatVersion -ne 1 -or
    [string]$restoreReceipt.state -cne "committed" -or
    [string]$restoreReceipt.backupId -cne [string]$backup.body.backupId -or
    [string]$restoreReceipt.sourceWorkspaceId -cne [string]$sourceEvidence.workspaceId -or
    [string]$restoreReceipt.installationId -cne [string]$restoredEvidence.installationId -or
    [int]$restoreReceipt.shopCount -ne [int]$restoredEvidence.shopCount -or
    $null -ne $restoreReceipt.failureCode
) {
    throw "Committed restore receipt does not bind the proven backup, workspace, replacement installation, and restored shop set."
}

[pscustomobject]@{
    formatVersion = 1
    passed = $true
    sourceShopCount = $sourceEvidence.shopCount
    restoredShopCount = $restoredEvidence.shopCount
    sourceWorkspacePreserved = $restoredEvidence.workspaceId -ceq $sourceEvidence.workspaceId
    replacementInstallationRetained = $restoredEvidence.installationId -ceq $replacementBeforeRestore.installationId
    sourceInstallationNotCloned = $restoredEvidence.installationId -cne $sourceEvidence.installationId
    protectedCustomerBlindIndexVerified = $true
    protectedSecretVerified = $true
    interruptedExitCode = 86
    rollbackExitCode = 87
    rollbackDurableDataParityVerified = $true
    rollbackLocalAuthorityParityVerified = $true
    restoredDurableDataParityVerified = $true
    restoredProtectedKeyRewrapVerified = $true
    restoredIdentityAuthorityCleared = $true
    restoredIdentityFootprintBound = $true
    replacementOwnerAuthorityReenrolled = $true
    sourceSessionNonCloningVerified = $true
    recoveryKitIndependent = $backup.body.independentRecoveryReady -eq $true
    committedReceiptVerified = $true
    restoreReceiptSha256 = Get-FileSha256OrNull $restoreReceiptPath
} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $resultPath -Encoding UTF8

Write-Host "Phase 4 replacement-install backup, restore, identity, and rollback drill passed."
