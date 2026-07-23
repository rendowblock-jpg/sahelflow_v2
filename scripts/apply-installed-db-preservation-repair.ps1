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

$old = @'
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

    $closures += Close-SahelFlowNormally -Process $process
'@

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
} elseif ($source.Contains($old)) {
    $source = $source.Replace($old, $new)
    Set-Content -LiteralPath $harnessPath -Value $source -Encoding utf8NoBOM
    Write-Host "Moved database hashing after proven shutdown."
} else {
    throw "Could not locate the canonical live-database hashing block."
}

$repaired = Get-Content -LiteralPath $harnessPath -Raw
if (-not $repaired.Contains('Prisma owns the SQLite file while the packaged runtime is live')) {
    throw "Post-shutdown database preservation marker is missing."
}
