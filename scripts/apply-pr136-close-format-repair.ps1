$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$harnessPath = Join-Path $repositoryRoot "scripts\verify-installed-windows-msi.ps1"
$source = (Get-Content -LiteralPath $harnessPath -Raw) -replace "`r`n", "`n"
$updated = $source

if (-not $updated.Contains('class SahelFlowWindowCloser')) {
    $closePattern = '(?ms)^function Close-SahelFlowNormally \{.*?^\}\n\n\$existing ='
    $closeRegex = [regex]::new($closePattern)
    if (-not $closeRegex.IsMatch($updated)) {
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

    $updated = $closeRegex.Replace($updated, $closeReplacement, 1)
} elseif (
    -not $updated.Contains('Posted WM_CLOSE') -or
    -not $updated.Contains('runtime endpoint present')
) {
    throw "The existing SahelFlowWindowCloser block is incomplete or not the approved repair."
}

$oldCleanup = '    Remove-Item -LiteralPath $runtimeEndpointPath -Force -ErrorAction SilentlyContinue'
$newCleanup = @'
    if ($attempt -eq 1) {
        Remove-Item -LiteralPath $runtimeEndpointPath -Force -ErrorAction SilentlyContinue
    }
'@
if ($updated.Contains($oldCleanup)) {
    $updated = $updated.Replace($oldCleanup, $newCleanup.TrimEnd())
} elseif (-not $updated.Contains('if ($attempt -eq 1)')) {
    throw "Could not establish first-launch-only stale endpoint cleanup."
}

$oldRegistryProof = @'
        if ($currentRegistryIdentity.revision -ne $registryIdentity.revision -or
            $currentRegistryIdentity.activeShopId -ne $registryIdentity.activeShopId) {
            throw "Second launch changed registry authority."
        }
'@
$newRegistryProof = @'
        if ($currentRegistryIdentity.revision -ne $registryIdentity.revision -or
            $currentRegistryIdentity.activeShopId -ne $registryIdentity.activeShopId -or
            $currentRegistryIdentity.registrySha256 -ne $registryIdentity.registrySha256) {
            throw "Second launch changed registry authority."
        }
'@
if ($updated.Contains($oldRegistryProof)) {
    $updated = $updated.Replace($oldRegistryProof, $newRegistryProof)
} elseif (-not $updated.Contains('registrySha256 -ne $registryIdentity.registrySha256')) {
    throw "Could not establish registry byte-preservation proof."
}

$oldDatabaseProof = @'
        if ($currentDatabaseIdentity.path -ne $databaseIdentity.path) {
            throw "Second launch switched the active shop database."
        }
'@
$newDatabaseProof = @'
        if ($currentDatabaseIdentity.path -ne $databaseIdentity.path -or
            $currentDatabaseIdentity.length -ne $databaseIdentity.length -or
            $currentDatabaseIdentity.sha256 -ne $databaseIdentity.sha256) {
            throw "Second launch changed the active shop database identity."
        }
        if ($launches[1].endpoint.instanceId -eq $launches[0].endpoint.instanceId) {
            throw "Second launch reused the first runtime instance identity."
        }
'@
if ($updated.Contains($oldDatabaseProof)) {
    $updated = $updated.Replace($oldDatabaseProof, $newDatabaseProof)
} elseif (-not $updated.Contains('sha256 -ne $databaseIdentity.sha256')) {
    throw "Could not establish database byte-preservation proof."
}

foreach ($required in @(
    'class SahelFlowWindowCloser',
    'Posted WM_CLOSE',
    'runtime endpoint present',
    'if ($attempt -eq 1)',
    'registrySha256 -ne $registryIdentity.registrySha256',
    'sha256 -ne $databaseIdentity.sha256',
    'Second launch reused the first runtime instance identity'
)) {
    if (-not $updated.Contains($required)) {
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

Write-Host "Applied deterministic GUI close, endpoint cleanup, cache, registry, database, and runtime-instance proofs."
