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
$trialServerScript = Join-Path $env:RUNNER_TEMP "phase4-trial-service.mjs"
$trialKeyHex = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
$trialKeyId = "ci-trial-key-v1"
$trialServer = $null

function Reserve-LoopbackPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    try {
        $listener.Start()
        return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    } finally {
        $listener.Stop()
    }
}

try {
    $publicKey = @(
        & node --input-type=module -e @'
import { getPublicKeyAsync } from "@noble/ed25519";
const secret = Buffer.from(process.argv[1], "hex");
console.log(Buffer.from(await getPublicKeyAsync(secret)).toString("base64"));
'@ $trialKeyHex 2>&1
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Could not derive the CI trial verification key: $($publicKey -join [Environment]::NewLine)"
    }
    $publicKey = [string]($publicKey | Select-Object -Last 1)
    $env:SF_LICENSE_TRIAL_PUBLIC_KEYS = (@{ $trialKeyId = $publicKey.Trim() } | ConvertTo-Json -Compress)

    $trialPort = Reserve-LoopbackPort
    $env:SF_LICENSE_SERVICE_URL = "http://127.0.0.1:$trialPort"

    @'
import http from "node:http";
import { signAsync } from "@noble/ed25519";

const port = Number.parseInt(process.argv[2], 10);
const secret = Buffer.from(process.argv[3], "hex");
const keyId = "ci-trial-key-v1";

function canonicalBytes(claims) {
  const canonical = [
    claims.domain,
    claims.formatVersion,
    claims.licenseId,
    claims.workspaceId,
    claims.installationId,
    claims.deviceBinding,
    claims.productMajor,
    claims.type,
    claims.issuedAt,
    claims.expiresAt,
    claims.supportEndsAt,
    claims.shopSlots,
    claims.memberLimit,
    claims.deviceLimit,
    claims.backupBytes,
    claims.mediaBytes,
    [...claims.features].sort(),
    claims.transferState,
    claims.transferEpoch,
    claims.recoveryEpoch,
    claims.revocationEpoch,
    claims.keyId,
    claims.issuer,
  ];
  return new TextEncoder().encode(JSON.stringify(canonical));
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end('{"ok":true}');
    return;
  }
  if (req.method !== "POST" || req.url !== "/v1/trials") {
    res.writeHead(404).end();
    return;
  }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const support = new Date(now.getTime() + 5 * 365 * 24 * 60 * 60 * 1000);
    const claims = {
      domain: "sahelflow.license.entitlement.v2",
      formatVersion: 2,
      licenseId: "ci-phase4-trial-0001",
      workspaceId: request.workspaceId,
      installationId: request.installationId,
      deviceBinding: request.deviceBinding,
      productMajor: 1,
      type: "trial",
      issuedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      supportEndsAt: support.toISOString(),
      shopSlots: 10,
      memberLimit: 10,
      deviceLimit: 10,
      backupBytes: 50 * 1024 * 1024 * 1024,
      mediaBytes: 10 * 1024 * 1024 * 1024,
      features: ["core"],
      transferState: "active",
      transferEpoch: 0,
      recoveryEpoch: 0,
      revocationEpoch: 0,
      keyId,
      issuer: "trial-service",
    };
    const signature = Buffer.from(await signAsync(canonicalBytes(claims), secret)).toString("base64");
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    res.end(JSON.stringify({ claims, signature }));
  } catch {
    res.writeHead(500, { "content-type": "application/json" });
    res.end('{"error":"ci_trial_failure"}');
  }
});
server.listen(port, "127.0.0.1");
'@ | Set-Content -LiteralPath $trialServerScript -Encoding UTF8

    $trialServer = Start-Process -FilePath "node" -ArgumentList @($trialServerScript, $trialPort, $trialKeyHex) -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds(15)
    do {
        try {
            $health = Invoke-WebRequest -Uri "$env:SF_LICENSE_SERVICE_URL/health" -UseBasicParsing -TimeoutSec 2
            if ($health.StatusCode -eq 200) { break }
        } catch {
            Start-Sleep -Milliseconds 150
        }
    } while ((Get-Date) -lt $deadline)
    if ($null -eq $health -or $health.StatusCode -ne 200) {
        throw "CI trial service did not become ready."
    }

    $source = Get-Content -LiteralPath $sourceScript -Raw
    $activationTemplate = @'
__OWNER__
$trialActivation = Invoke-SahelFlowJson -Method POST -BaseUrl __BASE__ -Path "/api/license/trial" -Session __SESSION__
if ($trialActivation.status -ne 200 -or $trialActivation.body.status -cne "valid") {
    $trialCode = if ($null -ne $trialActivation.body -and $null -ne $trialActivation.body.code) { [string]$trialActivation.body.code } else { "none" }
    throw "CI trial activation failed with HTTP $($trialActivation.status) and code $trialCode."
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
    Remove-Item -LiteralPath $patchedScript, $trialServerScript -Force -ErrorAction SilentlyContinue
}
