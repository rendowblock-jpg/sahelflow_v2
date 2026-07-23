$ErrorActionPreference = "Stop"

$evidenceRoot = Join-Path $env:RUNNER_TEMP "sahelflow-installed-e2e"
New-Item -ItemType Directory -Path $evidenceRoot -Force | Out-Null
trap {
    $_ | Format-List * -Force | Out-String |
        Set-Content -LiteralPath (Join-Path $evidenceRoot "db-preservation-repair-error.txt") -Encoding UTF8
    throw
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$harnessPath = Join-Path $repositoryRoot "scripts\verify-installed-windows-msi.ps1"
$source = (Get-Content -LiteralPath $harnessPath -Raw) -replace "`r`n", "`n"

$new = @'
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
        $cacheIdentity = $currentCacheIdentity
        $registryIdentity = $currentRegistryIdentity
        $databaseIdentity = $currentDatabaseIdentity
    } else {
        if ($currentCacheIdentity.directory -ne $cacheIdentity.directory -or
            $currentCacheIdentity.manifestSha256 -ne $cacheIdentity.manifestSha256) {
            throw "Second launch did not reuse the verified runtime cache."
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
'@

if ($source.Contains($new)) {
    Write-Host "Post-shutdown database preservation proof is already present."
} else {
    $pattern = '(?ms)^    \$currentDatabaseIdentity = \[pscustomobject\]@\{.*?^    \$closures \+= Close-SahelFlowNormally -Process \$process$'
    $found = [regex]::Matches($source, $pattern)
    [pscustomobject]@{
        matchCount = $found.Count
        sourceLength = $source.Length
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evidenceRoot "db-preservation-repair-match.json") -Encoding UTF8
    if ($found.Count -ne 1) {
        throw "Expected exactly one live-database hashing range, found $($found.Count)."
    }
    $match = $found[0]
    $source = $source.Substring(0, $match.Index) + $new + $source.Substring($match.Index + $match.Length)
    Set-Content -LiteralPath $harnessPath -Value $source -Encoding utf8NoBOM
    Write-Host "Moved database hashing after proven shutdown."
}

$repaired = Get-Content -LiteralPath $harnessPath -Raw
foreach ($required in @(
    'Prisma owns the SQLite file while the packaged runtime is live',
    '$closures += Close-SahelFlowNormally -Process $process',
    'Get-FileHash -LiteralPath $databasePath'
)) {
    if (-not $repaired.Contains($required)) {
        throw "Post-shutdown database preservation proof is missing required source: $required"
    }
}

Push-Location $repositoryRoot
try {
    & cargo fmt --manifest-path src-tauri/Cargo.toml --all 2>&1 |
        Tee-Object -FilePath (Join-Path $evidenceRoot "cargo-fmt.txt")
    $formatExit = $LASTEXITCODE
    if ($formatExit -ne 0) {
        throw "cargo fmt failed with exit code $formatExit"
    }

    $diffOutput = @(& git diff --check 2>&1)
    $diffExit = $LASTEXITCODE
    $diffOutput | Set-Content -LiteralPath (Join-Path $evidenceRoot "git-diff-check.txt") -Encoding UTF8
    if ($diffExit -ne 0) {
        throw "git diff --check failed with exit code $diffExit"
    }
} finally {
    Pop-Location
}

Write-Host "Database preservation repair and formatter diagnostics passed."
