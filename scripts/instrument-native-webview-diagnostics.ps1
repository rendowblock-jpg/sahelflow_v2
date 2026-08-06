param(
    [Parameter(Mandatory = $true)]
    [string]$TemplateRoot,
    [string]$RepositoryRoot,
    [string]$ExpectedSource = "b0fec61d574f6ef8eb2a0231da54762bfd99b3c5"
)

$ErrorActionPreference = "Stop"

if ($env:GITHUB_ACTIONS -cne "true") {
    throw "Native WebView instrumentation is restricted to an ephemeral GitHub Actions runner."
}

$repositoryRoot = if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
    (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
    (Resolve-Path $RepositoryRoot).Path
}
$actualSource = (& git -C $repositoryRoot rev-parse HEAD).Trim()
if ($actualSource -cne $ExpectedSource) {
    throw "Native WebView instrumentation expected $ExpectedSource, found $actualSource."
}

function Replace-ExactText {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Needle,
        [Parameter(Mandatory = $true)][string]$Replacement
    )

    $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
    $normalizedText = $text.Replace("`r`n", "`n")
    $normalizedNeedle = $Needle.Replace("`r`n", "`n")
    $normalizedReplacement = $Replacement.Replace("`r`n", "`n")
    $matches = [regex]::Matches($normalizedText, [regex]::Escape($normalizedNeedle)).Count
    if ($matches -ne 1) {
        throw "Expected one instrumentation anchor in $Path, found $matches."
    }
    $updated = $normalizedText.Replace($normalizedNeedle, $normalizedReplacement)
    [System.IO.File]::WriteAllText($Path, $updated, [System.Text.UTF8Encoding]::new($false))
}

$libPath = Join-Path $repositoryRoot "src-tauri\src\lib.rs"
$builderNeedle = "    let builder = tauri::Builder::default();"
$builderReplacement = @'
    let builder = tauri::Builder::default()
        .append_invoke_initialization_script(include_str!("runtime_webview_diagnostic.js"))
        .on_page_load(|webview, payload| {
            if webview.label() != "main" {
                return;
            }
            let url = payload.url();
            let destination = if url.scheme() == "data" {
                "data"
            } else if matches!(url.host_str(), Some("127.0.0.1" | "localhost")) {
                if url.path() == "/" {
                    "loopback-root"
                } else {
                    "loopback-other"
                }
            } else {
                "other"
            };
            let transition = match payload.event() {
                tauri::webview::PageLoadEvent::Started => "started",
                tauri::webview::PageLoadEvent::Finished => "finished",
            };
            if let Ok(app_data_dir) = webview.app_handle().path().app_data_dir() {
                startup_recovery::record_startup_stage(
                    &app_data_dir,
                    &format!("webview-page-{transition}-{destination}"),
                    None,
                );
            }
        });
'@
Replace-ExactText -Path $libPath -Needle $builderNeedle -Replacement $builderReplacement

$serverEnvironmentNeedle = @'
        ("NODE_ENV".to_string(), "production".to_string()),
        (
            "SF_INSTALLATION_ROOT_SOURCE".to_string(),
'@
$serverEnvironmentReplacement = @'
        ("NODE_ENV".to_string(), "production".to_string()),
        ("SF_RUNTIME_DIAGNOSTICS".to_string(), "1".to_string()),
        (
            "SF_INSTALLATION_ROOT_SOURCE".to_string(),
'@
Replace-ExactText `
    -Path $libPath `
    -Needle $serverEnvironmentNeedle `
    -Replacement $serverEnvironmentReplacement

$handoffPath = Join-Path $repositoryRoot "src-tauri\src\startup_recovery\proven.rs"
$handoffNeedle = @'
    window.hide()?;
    window.set_cookie(runtime_cookie(&handoff.host, &handoff.token)?)?;
    window.navigate(handoff.workspace_url)?;
'@
$handoffReplacement = @'
    window.hide()?;
    window.set_cookie(runtime_cookie(&handoff.host, &handoff.token)?)?;
    record_startup_stage(&app_data_dir, "ui-cookie-set-returned", None);
    record_startup_stage(&app_data_dir, "ui-navigation-dispatching", None);
    window.navigate(handoff.workspace_url)?;
    record_startup_stage(&app_data_dir, "ui-navigation-returned", None);
'@
Replace-ExactText -Path $handoffPath -Needle $handoffNeedle -Replacement $handoffReplacement

$proxyPath = Join-Path $repositoryRoot "src\proxy.ts"
$proxyNeedle = @'
    pathname === RUNTIME_BOOTSTRAP_CONFIRM_PATH ||
    pathname === RUNTIME_UI_READY_PATH
'@
$proxyReplacement = @'
    pathname === RUNTIME_BOOTSTRAP_CONFIRM_PATH ||
    pathname === RUNTIME_UI_READY_PATH ||
    pathname === "/api/internal/runtime-browser-diagnostic"
'@
Replace-ExactText -Path $proxyPath -Needle $proxyNeedle -Replacement $proxyReplacement

$initializationSource = Join-Path $TemplateRoot "runtime-webview-initialization.js"
$routeSource = Join-Path $TemplateRoot "runtime-browser-diagnostic-route.ts"
$initializationDestination = Join-Path $repositoryRoot "src-tauri\src\runtime_webview_diagnostic.js"
$routeDestination = Join-Path $repositoryRoot "src\app\api\internal\runtime-browser-diagnostic\route.ts"
New-Item -ItemType Directory -Path (Split-Path -Parent $routeDestination) -Force | Out-Null
Copy-Item -LiteralPath $initializationSource -Destination $initializationDestination -Force
Copy-Item -LiteralPath $routeSource -Destination $routeDestination -Force

Write-Host "Applied observation-only native WebView instrumentation to exact source $actualSource."
