$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "phase4-durable-parity.ps1")

function New-Digest {
    param(
        [string]$Aggregate = "aggregate-a",
        [int64]$SettingCount = 2,
        [string]$SettingDigest = "setting-a",
        [string]$LocalAuthorityDigest = "local-a",
        [string]$DataWrapDigest = "data-wrap-a",
        [string]$SecretWrapDigest = "secret-wrap-a",
        [switch]$WithoutCustomer,
        [switch]$WithoutAuthSecretTable
    )
    $tables = [ordered]@{
        Setting = [pscustomobject]@{ rowCount = $SettingCount; sha256 = $SettingDigest }
    }
    if (-not $WithoutCustomer) {
        $tables.Customer = [pscustomobject]@{ rowCount = 1; sha256 = "customer-a" }
    }
    $tableCounts = [ordered]@{ Session = 0; Setting = $SettingCount }
    if (-not $WithoutAuthSecretTable) {
        $tableCounts.AuthSecret = 0
    }
    return [pscustomobject]@{
        durableDataDigest = $Aggregate
        durableTableDigests = [pscustomobject]$tables
        migrationDigest = "migration-a"
        tableCounts = [pscustomobject]$tableCounts
        replacementLocalAuthorityDigest = $LocalAuthorityDigest
        protectedKeyCount = 2
        protectedKeyWrapDigests = [pscustomobject][ordered]@{
            "shop-data" = [pscustomobject]@{ keyId = "data-key"; sha256 = $DataWrapDigest }
            "shop-secret" = [pscustomobject]@{ keyId = "secret-key"; sha256 = $SecretWrapDigest }
        }
    }
}

function New-Profile {
    param(
        $Digest,
        [string]$ActiveShopId = "default",
        [string]$IncarnationId = "incarnation-a",
        [string]$RegistrySha256 = "registry-a"
    )
    return [pscustomobject]@{
        formatVersion = 2
        revision = 7
        workspaceId = "workspace-a"
        installationId = "installation-a"
        activeShopId = $ActiveShopId
        shopCount = 1
        registrySha256 = $RegistrySha256
        identityAuthoritySha256 = "identity-a"
        shops = @([pscustomobject]@{
            shopId = "default"
            incarnationId = $IncarnationId
            name = "Default shop"
            databaseFile = "default.db"
            icon = $null
            createdAt = "2026-08-09T00:00:00.000Z"
            digest = $Digest
        })
    }
}

$equal = New-Digest
if (@(Get-DurableParityChanges $equal (New-Digest)).Count -ne 0) {
    throw "Equal per-table parity reported a change."
}
Assert-DurableDataParity (New-Profile $equal) (New-Profile (New-Digest))
Assert-RollbackAuthorityParity (New-Profile $equal) (New-Profile (New-Digest))
Assert-ProtectedKeyRewrap `
    (New-Profile $equal) `
    (New-Profile (New-Digest -DataWrapDigest "data-wrap-b" -SecretWrapDigest "secret-wrap-b"))

$missing = @(Get-DurableParityChanges $equal (New-Digest -WithoutCustomer))
if ($missing.Count -ne 1 -or [string]$missing[0] -cne "Customer") {
    throw "Missing-table parity was not identified."
}
$count = @(Get-DurableParityChanges $equal (New-Digest -SettingCount 3))
if ($count.Count -ne 1 -or [string]$count[0] -cne "Setting") {
    throw "Row-count parity was not identified."
}
$digest = @(Get-DurableParityChanges $equal (New-Digest -SettingDigest "setting-b"))
if ($digest.Count -ne 1 -or [string]$digest[0] -cne "Setting") {
    throw "Per-table digest parity was not identified."
}

$aggregateFailed = $false
try {
    Assert-DurableDataParity `
        (New-Profile $equal) `
        (New-Profile (New-Digest -Aggregate "aggregate-b"))
} catch {
    $aggregateFailed = $_.Exception.Message -clike "*aggregate-contract*"
}
if (-not $aggregateFailed) {
    throw "Aggregate-only parity mismatch did not fail closed."
}

$activeShopFailed = $false
try {
    Assert-DurableDataParity `
        (New-Profile $equal) `
        (New-Profile (New-Digest) -ActiveShopId "other")
} catch {
    $activeShopFailed = $_.Exception.Message -clike "*registry authority*"
}
if (-not $activeShopFailed) {
    throw "Active-shop registry mismatch did not fail closed."
}

$incarnationFailed = $false
try {
    Assert-DurableDataParity `
        (New-Profile $equal) `
        (New-Profile (New-Digest) -IncarnationId "incarnation-b")
} catch {
    $incarnationFailed = $_.Exception.Message -clike "*registry continuity*"
}
if (-not $incarnationFailed) {
    throw "Shop-incarnation registry mismatch did not fail closed."
}

$rollbackFailed = $false
try {
    Assert-RollbackAuthorityParity `
        (New-Profile $equal) `
        (New-Profile (New-Digest -LocalAuthorityDigest "local-b"))
} catch {
    $rollbackFailed = $_.Exception.Message -clike "*replacement-local authority*"
}
if (-not $rollbackFailed) {
    throw "Rollback local-authority mismatch did not fail closed."
}

$rollbackRegistryFailed = $false
try {
    Assert-RollbackAuthorityParity `
        (New-Profile $equal) `
        (New-Profile (New-Digest) -RegistrySha256 "registry-b")
} catch {
    $rollbackRegistryFailed = $_.Exception.Message -clike "*exact replacement registry*"
}
if (-not $rollbackRegistryFailed) {
    throw "Rollback registry mismatch did not fail closed."
}

$missingAuthTableFailed = $false
try {
    Assert-RollbackAuthorityParity `
        (New-Profile $equal) `
        (New-Profile (New-Digest -WithoutAuthSecretTable))
} catch {
    $missingAuthTableFailed = $_.Exception.Message -clike "*AuthSecret table count*"
}
if (-not $missingAuthTableFailed) {
    throw "Missing AuthSecret table did not fail closed."
}

$partialRewrapFailed = $false
try {
    Assert-ProtectedKeyRewrap `
        (New-Profile $equal) `
        (New-Profile (New-Digest -DataWrapDigest "data-wrap-b"))
} catch {
    $partialRewrapFailed = $_.Exception.Message -clike "*shop-secret*was not rewrapped*"
}
if (-not $partialRewrapFailed) {
    throw "Partial protected-key wrapping did not fail closed."
}

Write-Host "Phase 4 PowerShell durable parity contract passed."
