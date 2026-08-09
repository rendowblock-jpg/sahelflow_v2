function Get-DurableParityChanges {
    param($Expected, $Actual)
    $expectedProperties = @($Expected.durableTableDigests.PSObject.Properties)
    $actualProperties = @($Actual.durableTableDigests.PSObject.Properties)
    $allTableNames = @($expectedProperties | ForEach-Object { [string]$_.Name }) +
        @($actualProperties | ForEach-Object { [string]$_.Name })
    $tableNames = @($allTableNames | Sort-Object -Unique)
    return @(
        foreach ($tableName in $tableNames) {
            $expectedTable = @(
                $expectedProperties | Where-Object { [string]$_.Name -ceq $tableName }
            )
            $actualTable = @(
                $actualProperties | Where-Object { [string]$_.Name -ceq $tableName }
            )
            if (
                $expectedTable.Count -ne 1 -or
                $actualTable.Count -ne 1 -or
                [int64]$expectedTable[0].Value.rowCount -ne [int64]$actualTable[0].Value.rowCount -or
                [string]$expectedTable[0].Value.sha256 -cne [string]$actualTable[0].Value.sha256
            ) {
                $tableName
            }
        }
    )
}

function Get-ExactTableCount {
    param(
        $Digest,
        [Parameter(Mandatory = $true)][string]$TableName
    )
    $matches = @(
        $Digest.tableCounts.PSObject.Properties |
            Where-Object { [string]$_.Name -ceq $TableName }
    )
    if ($matches.Count -ne 1) {
        throw "Database digest did not report exactly one $TableName table count."
    }
    return [int64]$matches[0].Value
}

function Assert-RegistryContinuity {
    param($Expected, $Actual)
    if (
        [int]$Actual.formatVersion -ne [int]$Expected.formatVersion -or
        [string]$Actual.workspaceId -cne [string]$Expected.workspaceId -or
        [string]$Actual.activeShopId -cne [string]$Expected.activeShopId -or
        [int64]$Actual.shopCount -ne [int64]$Expected.shopCount
    ) {
        throw "Restored registry authority changed its stable header."
    }
    $expectedShops = @($Expected.shops)
    $actualShops = @($Actual.shops)
    for ($index = 0; $index -lt $expectedShops.Count; $index++) {
        $expectedShop = $expectedShops[$index]
        $actualShop = $actualShops[$index]
        if ([string]$actualShop.shopId -cne [string]$expectedShop.shopId) {
            throw "Restored registry shop order or set changed."
        }
        $expectedIcon = if ($null -eq $expectedShop.icon) {
            "null"
        } else {
            "value:$([string]$expectedShop.icon)"
        }
        $actualIcon = if ($null -eq $actualShop.icon) {
            "null"
        } else {
            "value:$([string]$actualShop.icon)"
        }
        if (
            [string]$actualShop.incarnationId -cne [string]$expectedShop.incarnationId -or
            [string]$actualShop.name -cne [string]$expectedShop.name -or
            [string]$actualShop.databaseFile -cne [string]$expectedShop.databaseFile -or
            $actualIcon -cne $expectedIcon -or
            [string]$actualShop.createdAt -cne [string]$expectedShop.createdAt
        ) {
            throw "Restored registry continuity changed for shop $($expectedShop.shopId)."
        }
    }
}

function Assert-DurableDataParity {
    param($Expected, $Actual)
    Assert-RegistryContinuity $Expected $Actual
    if ($Expected.shopCount -ne $Actual.shopCount) { throw "Restored shop count changed." }
    foreach ($expectedShop in @($Expected.shops)) {
        $actualShop = @($Actual.shops | Where-Object { $_.shopId -ceq $expectedShop.shopId })
        if ($actualShop.Count -ne 1) { throw "Restored shop set changed." }
        $changedTables = @(
            Get-DurableParityChanges $expectedShop.digest $actualShop[0].digest
        )
        if (
            $changedTables.Count -ne 0 -or
            $actualShop[0].digest.durableDataDigest -cne $expectedShop.digest.durableDataDigest
        ) {
            $safeTables = if ($changedTables.Count -eq 0) {
                "aggregate-contract"
            } else {
                $changedTables -join ","
            }
            throw "Restored durable-data parity changed for shop $($expectedShop.shopId); tables: $safeTables."
        }
        if ($actualShop[0].digest.migrationDigest -cne $expectedShop.digest.migrationDigest) {
            throw "Restored migration set changed for shop $($expectedShop.shopId)."
        }
    }
}

function Assert-RollbackAuthorityParity {
    param($Expected, $Actual)
    Assert-DurableDataParity $Expected $Actual
    if (
        [string]::IsNullOrWhiteSpace([string]$Expected.registrySha256) -or
        [string]$Actual.registrySha256 -cne [string]$Expected.registrySha256
    ) {
        throw "Rollback changed the exact replacement registry authority."
    }
    if (
        [string]::IsNullOrWhiteSpace([string]$Expected.identityAuthoritySha256) -or
        [string]$Actual.identityAuthoritySha256 -cne [string]$Expected.identityAuthoritySha256
    ) {
        throw "Rollback changed replacement identity-file authority."
    }
    foreach ($expectedShop in @($Expected.shops)) {
        $actualShop = @($Actual.shops | Where-Object { $_.shopId -ceq $expectedShop.shopId })
        if (
            $actualShop.Count -ne 1 -or
            (Get-ExactTableCount $actualShop[0].digest "AuthSecret") -ne
                (Get-ExactTableCount $expectedShop.digest "AuthSecret") -or
            (Get-ExactTableCount $actualShop[0].digest "Session") -ne
                (Get-ExactTableCount $expectedShop.digest "Session") -or
            [string]$actualShop[0].digest.replacementLocalAuthorityDigest -cne
                [string]$expectedShop.digest.replacementLocalAuthorityDigest
        ) {
            throw "Rollback changed replacement-local authority for shop $($expectedShop.shopId)."
        }
    }
}

function Assert-ProtectedKeyRewrap {
    param($Source, $Restored)
    foreach ($sourceShop in @($Source.shops)) {
        $restoredShop = @($Restored.shops | Where-Object { $_.shopId -ceq $sourceShop.shopId })
        if ($restoredShop.Count -ne 1) {
            throw "Protected-key rewrap evidence changed the restored shop set."
        }
        if (
            [int64]$restoredShop[0].digest.protectedKeyCount -ne
                [int64]$sourceShop.digest.protectedKeyCount
        ) {
            throw "Protected-key rewrap changed key count for shop $($sourceShop.shopId)."
        }
        $sourceWraps = @(
            $sourceShop.digest.protectedKeyWrapDigests.PSObject.Properties
        )
        $restoredWraps = @(
            $restoredShop[0].digest.protectedKeyWrapDigests.PSObject.Properties
        )
        if (
            $sourceWraps.Count -ne [int64]$sourceShop.digest.protectedKeyCount -or
            $restoredWraps.Count -ne [int64]$restoredShop[0].digest.protectedKeyCount
        ) {
            throw "Protected-key per-purpose evidence count is invalid for shop $($sourceShop.shopId)."
        }
        foreach ($sourceWrap in $sourceWraps) {
            $purpose = [string]$sourceWrap.Name
            $restoredWrap = @(
                $restoredWraps | Where-Object { [string]$_.Name -ceq $purpose }
            )
            if (
                $restoredWrap.Count -ne 1 -or
                [string]$restoredWrap[0].Value.keyId -cne
                    [string]$sourceWrap.Value.keyId
            ) {
                throw "Protected-key identity changed for purpose $purpose in shop $($sourceShop.shopId)."
            }
            if (
                [string]$restoredWrap[0].Value.sha256 -ceq
                    [string]$sourceWrap.Value.sha256
            ) {
                throw "Protected-key purpose $purpose was not rewrapped for shop $($sourceShop.shopId)."
            }
        }
    }
}
