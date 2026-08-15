param(
    [Parameter(Mandatory = $true)]
    [string]$MsiPath
)

$ErrorActionPreference = "Stop"
if ($env:GITHUB_ACTIONS -cne "true") {
    throw "The Phase 4 licensed replacement wrapper is CI-only."
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$sourceScript = Join-Path $PSScriptRoot "verify-phase4-replacement-install.ps1"
$patchedScript = Join-Path $env:RUNNER_TEMP "verify-phase4-replacement-install.licensed.ps1"
$trialServerScript = Join-Path $PSScriptRoot "phase4-ci-trial-issuer.mjs"
$trialKeyHex = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
$trialKeyId = "ci-trial-key-v1"
$trialServer = $null

try {
    $issuerSelfTest = @(& node $trialServerScript --self-test $trialKeyHex 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "CI trial issuer self-test failed: $($issuerSelfTest -join [Environment]::NewLine)"
    }

    $publicKey = @(& node $trialServerScript --public-key $trialKeyHex 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Could not derive the CI trial verification key: $($publicKey -join [Environment]::NewLine)"
    }
    $publicKey = ([string]($publicKey | Select-Object -Last 1)).Trim()

    if ([string]::IsNullOrWhiteSpace($env:SF_LICENSE_SERVICE_URL)) {
        throw "The evidence MSI did not publish its compiled CI trial-service URL."
    }
    try {
        $trialServiceUri = [Uri]$env:SF_LICENSE_SERVICE_URL
    } catch {
        throw "The compiled CI trial-service URL is invalid."
    }
    if (
        $trialServiceUri.Scheme -cne "http" -or
        $trialServiceUri.Host -cne "127.0.0.1" -or
        $trialServiceUri.Port -lt 1 -or
        $trialServiceUri.Port -gt 65535 -or
        $trialServiceUri.AbsolutePath -cne "/"
    ) {
        throw "The replacement evidence MSI must bind its trial issuer to one exact loopback HTTP origin."
    }
    $trialPort = $trialServiceUri.Port

    if ([string]::IsNullOrWhiteSpace($env:SF_LICENSE_TRIAL_PUBLIC_KEYS)) {
        throw "The evidence MSI did not publish its compiled CI trial verification keyring."
    }
    try {
        $compiledTrialKeys = $env:SF_LICENSE_TRIAL_PUBLIC_KEYS | ConvertFrom-Json
    } catch {
        throw "The compiled CI trial verification keyring is invalid JSON."
    }
    $compiledTrialKey = $compiledTrialKeys.PSObject.Properties[$trialKeyId]
    if ($null -eq $compiledTrialKey -or [string]$compiledTrialKey.Value -cne $publicKey) {
        throw "The replacement evidence issuer key does not match the trial key compiled into the MSI."
    }

    $trialServer = Start-Process -FilePath "node" -ArgumentList @(
        $trialServerScript,
        "--serve",
        $trialPort,
        $trialKeyHex
    ) -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(15)
    $health = $null
    do {
        try {
            $health = Invoke-WebRequest -Uri "$env:SF_LICENSE_SERVICE_URL/health" -UseBasicParsing -TimeoutSec 2
            if ($health.StatusCode -eq 200) { break }
        } catch {
            Start-Sleep -Milliseconds 150
        }
    } while ((Get-Date) -lt $deadline)
    if ($null -eq $health -or $health.StatusCode -ne 200) {
        throw "CI trial service did not become ready at the exact origin compiled into the evidence MSI."
    }

    $source = Get-Content -LiteralPath $sourceScript -Raw
    $activationTemplate = @'
__OWNER__
$trialActivation = Invoke-SahelFlowJson -Method POST -BaseUrl __BASE__ -Path "/api/license/trial" -Session __SESSION__
if ($trialActivation.status -ne 200 -or $trialActivation.body.status -cne "valid") {
    $trialCode = if ($null -ne $trialActivation.body -and $null -ne $trialActivation.body.code) { [string]$trialActivation.body.code } else { "none" }
    $trialDetail = if ($null -ne $trialActivation.body -and $null -ne $trialActivation.body.error) { [string]$trialActivation.body.error } else { "none" }
    throw "CI trial activation failed with HTTP $($trialActivation.status), code $trialCode, detail $trialDetail."
}
'@
    foreach ($binding in @(
        @{ owner = 'Establish-OwnerSession $sourceBaseUrl $sourceSession'; base = '$sourceBaseUrl'; session = '$sourceSession' },
        @{ owner = 'Establish-OwnerSession $replacementBaseUrl $replacementSession'; base = '$replacementBaseUrl'; session = '$replacementSession' }
    )) {
        if (-not $source.Contains([string]$binding.owner)) {
            throw "Replacement harness activation anchor drifted: $($binding.owner)"
        }
        $replacement = $activationTemplate.Replace('__OWNER__', [string]$binding.owner).Replace('__BASE__', [string]$binding.base).Replace('__SESSION__', [string]$binding.session)
        $source = $source.Replace([string]$binding.owner, $replacement.TrimEnd())
    }

    $kitAnchor = @'
$kit = Invoke-SahelFlowJson -Method POST -BaseUrl $sourceBaseUrl -Path "/api/backup/recovery-kit" -Session $sourceSession
'@
    $kitPrelude = @'
# Runtime HTTP readiness precedes the native survivability controller by a
# separate authority handoff. A retained endpoint from an abnormal prior stop
# must never be accepted as current evidence. Wait only for the endpoint owned
# by this exact source sahelflow.exe process, then prove one read-only native
# round-trip before issuing the non-idempotent recovery-kit command.
$survivabilityEndpointPath = Join-Path (Join-Path $roamingRoot "system") "survivability-endpoint.json"
$bridgeDeadline = (Get-Date).AddSeconds(20)
$currentBridge = $null
do {
    if (Test-Path -LiteralPath $survivabilityEndpointPath -PathType Leaf) {
        try {
            $candidateBridge = Get-Content -LiteralPath $survivabilityEndpointPath -Raw | ConvertFrom-Json
            $candidateInstanceId = [string]$candidateBridge.instanceId
            $candidatePort = [int]$candidateBridge.port
            if (
                [int]$candidateBridge.formatVersion -eq 1 -and
                [string]$candidateBridge.state -ceq "ready" -and
                [string]$candidateBridge.host -ceq "127.0.0.1" -and
                [int]$candidateBridge.processId -eq $sourceProcess.Id -and
                $candidateInstanceId -cmatch '^[0-9a-f]{32}$' -and
                $candidatePort -ge 1 -and
                $candidatePort -le 65535
            ) {
                $currentBridge = $candidateBridge
                break
            }
        } catch {
            # The controller writes the endpoint atomically; tolerate only the
            # short replacement/read race while waiting for the current PID.
        }
    }
    Start-Sleep -Milliseconds 100
} while ((Get-Date) -lt $bridgeDeadline)
if ($null -eq $currentBridge) {
    throw "The current source installation survivability bridge did not become ready for process $($sourceProcess.Id)."
}

$bridgeProbe = Invoke-SahelFlowJson -Method GET -BaseUrl $sourceBaseUrl -Path "/api/backup/list" -Session $sourceSession
if ($bridgeProbe.status -ne 200) {
    $bridgeCode = if ($null -ne $bridgeProbe.body -and $null -ne $bridgeProbe.body.code) { [string]$bridgeProbe.body.code } else { "none" }
    $bridgeDetail = if ($null -ne $bridgeProbe.body -and $null -ne $bridgeProbe.body.error) { [string]$bridgeProbe.body.error } else { "none" }
    throw "Current survivability bridge probe failed with HTTP $($bridgeProbe.status), code $bridgeCode, detail $bridgeDetail, endpoint PID $($currentBridge.processId), source PID $($sourceProcess.Id)."
}

$kit = Invoke-SahelFlowJson -Method POST -BaseUrl $sourceBaseUrl -Path "/api/backup/recovery-kit" -Session $sourceSession
'@
    $kitCommand = $kitAnchor.TrimEnd()
    $kitCommandFirst = $source.IndexOf($kitCommand, [StringComparison]::Ordinal)
    $kitCommandLast = $source.LastIndexOf($kitCommand, [StringComparison]::Ordinal)
    if ($kitCommandFirst -lt 0 -or $kitCommandFirst -ne $kitCommandLast) {
        throw "Replacement harness recovery-kit command anchor drifted."
    }
    $source = $source.Replace($kitCommand, $kitPrelude.TrimEnd())

    $acceptanceAnchor = @'
$committedAcceptance = Invoke-CommittedWebViewAcceptance `
    -BaseUrl $committedBaseUrl `
    -Pin $pin `
    -Phone $sourcePhone `
    -ActivateTrial
'@
    $acceptanceReplacement = @'
# The installed-MSI workflow separately proves that the real WebView hydrates
# and authenticates twice. Keep the committed-restore authority check focused
# on the restored installed runtime instead of holding a DevTools WebSocket open
# across the production PIN derivation and all protected reads. CDP remains
# limited to the short read-only runtime-cookie handoff inside
# Establish-OwnerSession; the long acceptance journey uses the same loopback
# HTTP authority as the installed app and never changes production cookie policy.
$committedSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Establish-OwnerSession $committedBaseUrl $committedSession -RequireSetup
$committedTrial = Invoke-SahelFlowJson -Method POST -BaseUrl $committedBaseUrl -Path "/api/license/trial" -Session $committedSession
$committedSearch = Invoke-SahelFlowJson -Method GET -BaseUrl $committedBaseUrl -Path "/api/customers/search?q=$sourcePhone" -Session $committedSession
$committedSecret = Invoke-SahelFlowJson -Method GET -BaseUrl $committedBaseUrl -Path "/api/secrets/gemini-key" -Session $committedSession
$committedAcceptance = [pscustomobject]@{
    setupStatus = 200
    trialStatus = [int]$committedTrial.status
    trialState = if ($null -ne $committedTrial.body) { [string]$committedTrial.body.status } else { $null }
    searchStatus = [int]$committedSearch.status
    customerTotal = if ($null -ne $committedSearch.body -and $null -ne $committedSearch.body.total) { [int]$committedSearch.body.total } else { 0 }
    secretStatus = [int]$committedSecret.status
    secretConfigured = if ($null -ne $committedSecret.body) { [bool]$committedSecret.body.configured } else { $false }
}
'@
    $acceptanceCommand = $acceptanceAnchor.TrimEnd()
    $acceptanceCommandFirst = $source.IndexOf($acceptanceCommand, [StringComparison]::Ordinal)
    $acceptanceCommandLast = $source.LastIndexOf($acceptanceCommand, [StringComparison]::Ordinal)
    if ($acceptanceCommandFirst -lt 0 -or $acceptanceCommandFirst -ne $acceptanceCommandLast) {
        throw "Replacement harness committed-acceptance anchor drifted."
    }
    $source = $source.Replace($acceptanceCommand, $acceptanceReplacement.TrimEnd())

    Set-Content -LiteralPath $patchedScript -Value $source -Encoding UTF8

    & $patchedScript -MsiPath $MsiPath -RepositoryRoot $repoRoot
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    if ($null -ne $trialServer) {
        Stop-Process -Id $trialServer.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $patchedScript -Force -ErrorAction SilentlyContinue
}