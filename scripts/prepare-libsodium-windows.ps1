[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot "..\.sf-build\libsodium-dist")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$crateVersion = "1.24.0"
$libsodiumVersion = "1.0.22"
$expectedArchiveSha256 = "3e03a726fac4bc09cb61d8f29d658ef7a5eca0811de59082130414f7ca2e4279"
$pointArchiveName = "libsodium-$libsodiumVersion-msvc.zip"
$pointSignatureName = "$pointArchiveName.minisig"
$buildArchiveName = "libsodium-$libsodiumVersion-stable-msvc.zip"
$buildSignatureName = "$buildArchiveName.minisig"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestPath = Join-Path $repoRoot "src-tauri\Cargo.toml"
$distDir = [IO.Path]::GetFullPath($OutputDirectory)

function Invoke-DownloadWithFallback {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Urls,
        [Parameter(Mandatory = $true)]
        [string]$Destination
    )

    $partial = "$Destination.partial"
    $lastError = $null
    foreach ($url in $Urls) {
        for ($attempt = 1; $attempt -le 4; $attempt++) {
            try {
                Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
                Invoke-WebRequest `
                    -Uri $url `
                    -OutFile $partial `
                    -MaximumRedirection 10 `
                    -Headers @{ "User-Agent" = "SahelFlow-internal-Windows-build" }
                $download = Get-Item -LiteralPath $partial
                if ($download.Length -lt 1) {
                    throw "downloaded file is empty"
                }
                Move-Item -LiteralPath $partial -Destination $Destination -Force
                Write-Host "Downloaded $url"
                return $url
            }
            catch {
                $lastError = $_
                Remove-Item -LiteralPath $partial -Force -ErrorAction SilentlyContinue
                if ($attempt -lt 4) {
                    Start-Sleep -Seconds ([Math]::Min(20, [Math]::Pow(2, $attempt)))
                }
            }
        }
    }

    throw "Could not download $([IO.Path]::GetFileName($Destination)): $($lastError.Exception.Message)"
}

if ($env:OS -ne "Windows_NT" -or -not [Environment]::Is64BitOperatingSystem) {
    throw "SahelFlow libsodium preparation supports Windows x64 only"
}

& bun run scripts/sync-cargo-root-lock.ts
if ($LASTEXITCODE -ne 0) {
    throw "failed to synchronize generated Cargo root package identity before libsodium preparation"
}

& cargo fetch --manifest-path $manifestPath --locked
if ($LASTEXITCODE -ne 0) {
    throw "cargo fetch failed while locating libsodium-sys-stable $crateVersion"
}

$cargoHome = if ([string]::IsNullOrWhiteSpace($env:CARGO_HOME)) {
    Join-Path ([Environment]::GetFolderPath("UserProfile")) ".cargo"
}
else {
    $env:CARGO_HOME
}
$registrySourceRoot = Join-Path $cargoHome "registry\src"
if (-not (Test-Path -LiteralPath $registrySourceRoot -PathType Container)) {
    throw "Cargo registry source directory is missing: $registrySourceRoot"
}

$crateCandidates = @(
    Get-ChildItem -LiteralPath $registrySourceRoot -Directory |
        ForEach-Object { Join-Path $_.FullName "libsodium-sys-stable-$crateVersion" } |
        Where-Object {
            (Test-Path -LiteralPath (Join-Path $_ "LATEST.tar.gz") -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $_ "LATEST.tar.gz.minisig") -PathType Leaf)
        }
)
if ($crateCandidates.Count -lt 1) {
    throw "Could not locate the fetched libsodium-sys-stable $crateVersion source package"
}
$crateRoot = $crateCandidates | Sort-Object | Select-Object -First 1

Remove-Item -LiteralPath $distDir -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $crateRoot "LATEST.tar.gz") -Destination $distDir -Force
Copy-Item -LiteralPath (Join-Path $crateRoot "LATEST.tar.gz.minisig") -Destination $distDir -Force

$releaseTag = "$libsodiumVersion-RELEASE"
$archiveUrls = @(
    "https://github.com/jedisct1/libsodium/releases/download/$releaseTag/$pointArchiveName",
    "https://download.libsodium.org/libsodium/releases/$pointArchiveName"
)
$signatureUrls = @(
    "https://github.com/jedisct1/libsodium/releases/download/$releaseTag/$pointSignatureName",
    "https://download.libsodium.org/libsodium/releases/$pointSignatureName"
)
$pointArchivePath = Join-Path $distDir $pointArchiveName
$pointSignaturePath = Join-Path $distDir $pointSignatureName
$archiveUrl = Invoke-DownloadWithFallback -Urls $archiveUrls -Destination $pointArchivePath
$signatureUrl = Invoke-DownloadWithFallback -Urls $signatureUrls -Destination $pointSignaturePath

$archiveSha256 = (Get-FileHash -LiteralPath $pointArchivePath -Algorithm SHA256).Hash.ToLowerInvariant()
if (-not [string]::IsNullOrWhiteSpace($expectedArchiveSha256) -and $archiveSha256 -cne $expectedArchiveSha256) {
    throw "libsodium archive SHA-256 mismatch: expected $expectedArchiveSha256, found $archiveSha256"
}

# libsodium-sys-stable requests the stable archive names. The immutable 1.0.22
# point-release bytes and their official minisign signature are copied under
# those expected names; the crate build script verifies the signature before
# extracting or linking anything.
Copy-Item -LiteralPath $pointArchivePath -Destination (Join-Path $distDir $buildArchiveName) -Force
Copy-Item -LiteralPath $pointSignaturePath -Destination (Join-Path $distDir $buildSignatureName) -Force

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($pointArchivePath)
try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace("\", "/") })
}
finally {
    $archive.Dispose()
}
foreach ($requiredEntry in @(
    "libsodium/x64/Debug/v143/static/libsodium.lib",
    "libsodium/x64/Release/v143/static/libsodium.lib"
)) {
    if ($entryNames -cnotcontains $requiredEntry) {
        throw "libsodium archive is missing required entry $requiredEntry"
    }
}

$sourceArchiveSha256 = (Get-FileHash -LiteralPath (Join-Path $distDir "LATEST.tar.gz") -Algorithm SHA256).Hash.ToLowerInvariant()
$provenance = [ordered]@{
    formatVersion = 1
    dependency = [ordered]@{
        crate = "libsodium-sys-stable"
        crateVersion = $crateVersion
    }
    distribution = [ordered]@{
        libsodiumVersion = $libsodiumVersion
        archive = $pointArchiveName
        archiveSha256 = $archiveSha256
        archiveUrl = $archiveUrl
        signature = $pointSignatureName
        signatureUrl = $signatureUrl
        minisignPublicKey = "RWQf6LRCGA9i53mlYecO4IzT51TGPpvWucNSCh1CBM0QTaLn73Y7GFO3"
    }
    bundledSource = [ordered]@{
        archive = "LATEST.tar.gz"
        archiveSha256 = $sourceArchiveSha256
        sourcePackage = $crateRoot
    }
    buildAliases = [ordered]@{
        archive = $buildArchiveName
        signature = $buildSignatureName
    }
}
$provenance | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $distDir "sahelflow-libsodium-build-manifest.json") -Encoding utf8

if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_ENV)) {
    "SODIUM_DIST_DIR=$distDir" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
}

Write-Host "Prepared local signed libsodium distribution for libsodium-sys-stable verification."
Write-Host "SODIUM_DIST_DIR=$distDir"
Write-Host "libsodium archive SHA-256: $archiveSha256"
