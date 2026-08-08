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
        @{ owner = 'Establish-OwnerSession $replacementBaseUrl $replacementSession'; base = '$replacementBaseUrl'; session = '$replacementSession' },
        @{ owner = 'Establish-OwnerSession $committedBaseUrl $committedSession'; base = '$committedBaseUrl'; session = '$committedSession' }
    )) {
        if (-not $source.Contains([string]$binding.owner)) {
            throw "Replacement harness activation anchor drifted: $($binding.owner)"
        }
        $replacement = $activationTemplate.Replace('__OWNER__', [string]$binding.owner).Replace('__BASE__', [string]$binding.base).Replace('__SESSION__', [string]$binding.session)
        $source = $source.Replace([string]$binding.owner, $replacement.TrimEnd())
    }
    Set-Content -LiteralPath $patchedScript -Value $source -Encoding UTF8

    & $patchedScript -MsiPath $MsiPath
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
    if ($null -ne $trialServer) {
        Stop-Process -Id $trialServer.Id -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $patchedScript -Force -ErrorAction SilentlyContinue
}
