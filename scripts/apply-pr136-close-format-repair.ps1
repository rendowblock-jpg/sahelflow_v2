$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$harnessPath = Join-Path $repositoryRoot "scripts\verify-installed-windows-msi.ps1"
$source = Get-Content -LiteralPath $harnessPath -Raw
$updated = $source

if ($source -notmatch 'class SahelFlowWindowCloser') {
    $closePattern = '(?ms)^function Close-SahelFlowNormally \{.*?^\}\r?\n\r?\n\$existing ='
    if (-not [regex]::IsMatch($source, $closePattern)) {
        throw "Could not locate the existing Close-SahelFlowNormally function."
    }

    $closeReplacement = @'
if (-not ("SahelFlowWindowCloser" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class SahelFlowWindowCloser
{
    private delegate bool EnumWindowsProc(IntPtr window, IntPtr parameter);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);

    public static long[] FindTopLevelWindows(uint processId)
    {
        var windows = new List<long>();
        EnumWindows((window, parameter) =>
        {
            uint ownerProcessId;
            GetWindowThreadProcessId(window, out ownerProcessId);
            if (ownerProcessId == processId)
            {
                windows.Add(window.ToInt64());
            }
            return true;
        }, IntPtr.Zero);
        return windows.ToArray();
    }

    public static bool RequestClose(long handle)
    {
        const uint WM_CLOSE = 0x0010;
        return PostMessage(new IntPtr(handle), WM_CLOSE, IntPtr.Zero, IntPtr.Zero);
    }
}
"@
}

function Close-SahelFlowNormally {
    param([System.Diagnostics.Process]$Process)

    $Process.Refresh()
    if ($Process.HasExited) {
        throw "SahelFlow exited before the normal close request could be proven."
    }

    $handles = @(
        [SahelFlowWindowCloser]::FindTopLevelWindows([uint32]$Process.Id)
    )
    if ($handles.Count -eq 0) {
        $Process.Refresh()
        if ($Process.MainWindowHandle -ne [IntPtr]::Zero) {
            $handles = @($Process.MainWindowHandle.ToInt64())
        }
    }
    if ($handles.Count -eq 0) {
        throw "SahelFlow exposed no top-level window for a normal close request."
    }

    $posted = @(
        foreach ($handle in $handles) {
            if ([SahelFlowWindowCloser]::RequestClose([int64]$handle)) {
                $handle
            }
        }
    )
    if ($posted.Count -eq 0) {
        throw "Windows rejected every SahelFlow WM_CLOSE request."
    }
    Write-Host "Posted WM_CLOSE to $($posted.Count) SahelFlow top-level window(s)."

    if (-not $Process.WaitForExit(30000)) {
        throw "SahelFlow did not exit after a real GUI close request within 30 seconds."
    }

    $deadline = (Get-Date).AddSeconds(20)
    do {
        $remaining = @(
            Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
                Where-Object {
                    $_.Name -ieq "sahelflow.exe" -or
                    $_.Name -ieq "bun.exe" -or
                    $_.Name -ieq "sahelflow-whatsapp.exe"
                }
        )
        $endpointPresent = Test-Path -LiteralPath $runtimeEndpointPath -PathType Leaf
        if ($remaining.Count -eq 0 -and -not $endpointPresent) {
            return
        }
        Start-Sleep -Milliseconds 250
    } while ((Get-Date) -lt $deadline)

    $remainingSummary = if ($remaining.Count -eq 0) {
        "none"
    } else {
        ($remaining | ForEach-Object { "$($_.Name):$($_.ProcessId)" }) -join ", "
    }
    throw "Normal close was incomplete; remaining processes: $remainingSummary; runtime endpoint present: $endpointPresent"
}

$existing =
'@

    $updated = [regex]::Replace($source, $closePattern, $closeReplacement, 1)
} elseif (
    $source -notmatch 'Posted WM_CLOSE' -or
    $source -notmatch 'runtime endpoint present'
) {
    throw "The existing SahelFlowWindowCloser block is incomplete or not the approved repair."
}

$firstLaunchCleanupPattern = '(?m)^    Remove-Item -LiteralPath \$runtimeEndpointPath -Force -ErrorAction SilentlyContinue$'
if ([regex]::IsMatch($updated, $firstLaunchCleanupPattern)) {
    $updated = [regex]::Replace(
        $updated,
        $firstLaunchCleanupPattern,
        @'
    if ($attempt -eq 1) {
        Remove-Item -LiteralPath $runtimeEndpointPath -Force -ErrorAction SilentlyContinue
    }
'@,
        1
    )
}

$registryPattern = '(?ms)        if \(\$currentRegistryIdentity\.revision -ne \$registryIdentity\.revision -or\r?\n            \$currentRegistryIdentity\.activeShopId -ne \$registryIdentity\.activeShopId\) \{\r?\n            throw "Second launch changed registry authority\."\r?\n        \}'
if ([regex]::IsMatch($updated, $registryPattern)) {
    $updated = [regex]::Replace(
        $updated,
        $registryPattern,
        @'
        if ($currentRegistryIdentity.revision -ne $registryIdentity.revision -or
            $currentRegistryIdentity.activeShopId -ne $registryIdentity.activeShopId -or
            $currentRegistryIdentity.registrySha256 -ne $registryIdentity.registrySha256) {
            throw "Second launch changed registry authority."
        }
'@,
        1
    )
}

$databasePattern = '(?ms)        if \(\$currentDatabaseIdentity\.path -ne \$databaseIdentity\.path\) \{\r?\n            throw "Second launch switched the active shop database\."\r?\n        \}'
if ([regex]::IsMatch($updated, $databasePattern)) {
    $updated = [regex]::Replace(
        $updated,
        $databasePattern,
        @'
        if ($currentDatabaseIdentity.path -ne $databaseIdentity.path -or
            $currentDatabaseIdentity.length -ne $databaseIdentity.length -or
            $currentDatabaseIdentity.sha256 -ne $databaseIdentity.sha256) {
            throw "Second launch changed the active shop database identity."
        }
        if ($launches[1].endpoint.instanceId -eq $launches[0].endpoint.instanceId) {
            throw "Second launch reused the first runtime instance identity."
        }
'@,
        1
    )
}

foreach ($required in @(
    'class SahelFlowWindowCloser',
    'Posted WM_CLOSE',
    'runtime endpoint present',
    'registrySha256 -ne $registryIdentity.registrySha256',
    'sha256 -ne $databaseIdentity.sha256',
    'Second launch reused the first runtime instance identity'
)) {
    if ($updated -notlike "*$required*") {
        throw "The repaired harness is missing required proof: $required"
    }
}

Set-Content -LiteralPath $harnessPath -Value $updated -Encoding utf8NoBOM

& cargo fmt --manifest-path (Join-Path $repositoryRoot "src-tauri\Cargo.toml") --all
if ($LASTEXITCODE -ne 0) {
    throw "cargo fmt failed with exit code $LASTEXITCODE"
}

Push-Location $repositoryRoot
try {
    git diff --check
    if ($LASTEXITCODE -ne 0) {
        throw "git diff --check failed after applying the close/format repair."
    }
} finally {
    Pop-Location
}

Write-Host "Applied idempotent GUI close, endpoint cleanup, cache, registry, database, and runtime-instance proofs."
