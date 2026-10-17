# SahelFlow diagnostics collector
#
# READ-ONLY. It does not change Windows Defender, adds no exclusions, does not touch your
# shop data, and sends nothing anywhere. It writes ONE text file, SahelFlow-diagnostics.txt,
# to your Desktop. Send me that file.
#
# Works in the Windows PowerShell 5.1 that is built into Windows. No administrator rights
# needed (run it as administrator only if you also want to see Defender's folder exclusions).
# Takes about 30 seconds. Close SahelFlow first for the cleanest numbers.

# Test hook only: point at another install folder. Normal use leaves this empty.
$InstallRoot = $env:SF_DIAG_INSTALL_ROOT

$ErrorActionPreference = 'Continue'
$lines = New-Object System.Collections.Generic.List[string]

function Say([string]$text) { [void]$lines.Add($text) }
function Section([string]$title) { Say ''; Say ('=== ' + $title + ' ===') }
function Invoke-Safely([string]$label, [scriptblock]$work) {
    try { & $work } catch { Say ('{0}: unavailable ({1})' -f $label, $_.Exception.Message) }
}

function Get-Stat([System.Collections.Generic.List[double]]$values) {
    $a = $values.ToArray()
    if ($a.Length -eq 0) { return 'no samples' }
    [Array]::Sort($a)
    $n = $a.Length
    $median = $a[[int][math]::Floor(($n - 1) * 0.5)]
    $p95 = $a[[int][math]::Floor(($n - 1) * 0.95)]
    $sum = 0.0
    foreach ($v in $a) { $sum += $v }
    return ('n={0}  median={1:N1} ms  p95={2:N1} ms  max={3:N1} ms  total={4:N0} ms' -f $n, $median, $p95, $a[$n - 1], $sum)
}

$onWindows = ($env:OS -eq 'Windows_NT')

Say 'SahelFlow diagnostics'
Say ('Collected (UTC): {0}' -f ([DateTime]::UtcNow.ToString('yyyy-MM-dd HH:mm:ss')))
Say ('PowerShell: {0}' -f $PSVersionTable.PSVersion.ToString())

# ---------------------------------------------------------------- machine
Section 'Machine'
Invoke-Safely 'Windows' {
    $os = Get-CimInstance Win32_OperatingSystem
    Say ('Windows: {0} build {1}' -f $os.Caption, $os.BuildNumber)
}
Invoke-Safely 'CPU' {
    $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
    Say ('CPU: {0} ({1} cores, {2} threads)' -f $cpu.Name.Trim(), $cpu.NumberOfCores, $cpu.NumberOfLogicalProcessors)
}
Invoke-Safely 'RAM' {
    $cs = Get-CimInstance Win32_ComputerSystem
    Say ('RAM: {0} GB' -f [math]::Round($cs.TotalPhysicalMemory / 1GB, 1))
}
Invoke-Safely 'Power plan' {
    $plan = & powercfg /getactivescheme
    Say ('Power plan: {0}' -f ($plan -join ' '))
}
Invoke-Safely 'Battery' {
    $battery = Get-CimInstance Win32_Battery | Select-Object -First 1
    if ($battery) {
        Say ('Battery: status code {0} (1 = running on battery, 2 = plugged in), charge {1}%' -f $battery.BatteryStatus, $battery.EstimatedChargeRemaining)
    } else {
        Say 'Battery: none (desktop PC)'
    }
}

# ---------------------------------------------------------------- disk
Section 'Disk'
Invoke-Safely 'Physical disks' {
    Get-PhysicalDisk | ForEach-Object {
        Say ('Disk: {0} | media {1} | bus {2} | {3} GB | health {4}' -f $_.FriendlyName, $_.MediaType, $_.BusType, [math]::Round($_.Size / 1GB), $_.HealthStatus)
    }
}
Invoke-Safely 'System volume' {
    $letter = $env:SystemDrive.Substring(0, 1)
    $v = Get-Volume -DriveLetter $letter
    $usedPercent = [math]::Round(100 * ($v.Size - $v.SizeRemaining) / $v.Size)
    Say ('System drive {0}: {1} GB, {2}% used, {3} GB free, file system {4}' -f $env:SystemDrive, [math]::Round($v.Size / 1GB), $usedPercent, [math]::Round($v.SizeRemaining / 1GB), $v.FileSystem)
}

# ---------------------------------------------------------------- security software
Section 'Security software'
Invoke-Safely 'Defender status' {
    $m = Get-MpComputerStatus
    Say ('Defender real-time protection: {0}' -f $m.RealTimeProtectionEnabled)
    Say ('Defender on-access protection: {0}' -f $m.OnAccessProtectionEnabled)
    Say ('Defender behavior monitoring: {0}' -f $m.BehaviorMonitorEnabled)
    Say ('Defender is the active antivirus: {0}' -f $m.AntivirusEnabled)
    Say ('Defender signature version: {0}' -f $m.AntivirusSignatureVersion)
}
Invoke-Safely 'Defender exclusions' {
    $preference = Get-MpPreference
    $paths = @($preference.ExclusionPath | Where-Object { $_ })
    if ($paths.Count -eq 1 -and $paths[0] -like 'N/A*') {
        Say 'Defender folder exclusions: hidden (run as administrator to see them)'
    } else {
        $mentionSahelFlow = @($paths | Where-Object { $_ -like '*SahelFlow*' }).Count
        Say ('Defender folder exclusions configured: {0} (of which mention SahelFlow: {1})' -f $paths.Count, $mentionSahelFlow)
    }
}
Invoke-Safely 'Registered antivirus products' {
    Get-CimInstance -Namespace 'root/SecurityCenter2' -ClassName AntiVirusProduct | ForEach-Object {
        Say ('Antivirus product registered with Windows: {0}' -f $_.displayName)
    }
}

# ---------------------------------------------------------------- SahelFlow
Section 'SahelFlow'
$install = $null
if ($InstallRoot -and (Test-Path -LiteralPath $InstallRoot)) {
    $install = $InstallRoot
} else {
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'SahelFlow') }
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'SahelFlow') }
    if ($env:LOCALAPPDATA) { $candidates += (Join-Path (Join-Path $env:LOCALAPPDATA 'Programs') 'SahelFlow') }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate) { $install = $candidate; break }
    }
}
if ($install) {
    Say ('Install folder: {0}' -f $install)
    $exe = Join-Path $install 'sahelflow.exe'
    if (Test-Path -LiteralPath $exe) {
        Say ('App version: {0}' -f (Get-Item -LiteralPath $exe).VersionInfo.ProductVersion)
    }
} else {
    Say 'Install folder: not found'
}

Invoke-Safely 'Processes' {
    foreach ($name in @('sahelflow', 'sahelflow-whatsapp', 'sahelflow-mcp', 'node', 'msedgewebview2')) {
        $found = @(Get-Process -Name $name -ErrorAction SilentlyContinue)
        if ($found.Count -gt 0) {
            $bytes = ($found | Measure-Object -Property WorkingSet64 -Sum).Sum
            Say ('Running now: {0} x{1}, {2} MB' -f $name, $found.Count, [math]::Round($bytes / 1MB))
        }
    }
}

$data = $null
if ($env:APPDATA) { $data = Join-Path $env:APPDATA 'com.sahelflow.desktop' }

if ($data -and (Test-Path -LiteralPath $data)) {
    Invoke-Safely 'Data folder sizes' {
        Say 'Data folders (name, files, MB):'
        Get-ChildItem -LiteralPath $data -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            $all = @(Get-ChildItem -LiteralPath $_.FullName -Recurse -File -ErrorAction SilentlyContinue)
            $bytes = ($all | Measure-Object -Property Length -Sum).Sum
            if (-not $bytes) { $bytes = 0 }
            Say ('  {0}: {1} files, {2:N1} MB' -f $_.Name, $all.Count, ($bytes / 1MB))
        }
    }

    Section 'Startup trace (last launch)'
    $trace = Join-Path $data 'startup-trace.json'
    if (Test-Path -LiteralPath $trace) {
        Invoke-Safely 'Startup trace' {
            $t = Get-Content -LiteralPath $trace -Raw | ConvertFrom-Json
            $first = $null
            $previous = $null
            foreach ($e in ($t.events | Sort-Object createdAtUnixMilliseconds)) {
                $ms = [double]$e.createdAtUnixMilliseconds
                if ($null -eq $first) { $first = $ms }
                $step = 0
                if ($null -ne $previous) { $step = ($ms - $previous) / 1000 }
                Say ('{0,8:N1}s  +{1,6:N1}s  {2}' -f (($ms - $first) / 1000), $step, $e.stage)
                $previous = $ms
            }
            Say ('App version in trace: {0}' -f $t.appVersion)
        }
    } else {
        Say 'startup-trace.json not found'
    }

    Section 'WhatsApp diagnostics (last 150 lines; phone numbers and chat ids are already removed)'
    $waLog = Join-Path (Join-Path $data 'logs') 'whatsapp-diagnostics.log'
    if (Test-Path -LiteralPath $waLog) {
        Invoke-Safely 'WhatsApp log' {
            Get-Content -LiteralPath $waLog -Tail 150 | ForEach-Object { Say $_ }
        }
    } else {
        Say 'whatsapp-diagnostics.log not found'
    }
} else {
    Say 'Data folder: not found'
}

# ---------------------------------------------------------------- speed tests
Section 'Speed tests on this PC (about 20 seconds)'

# 1. Opening files that already exist: what Node does for every file it loads at start.
$probeRoot = $null
if ($install) {
    $probeRoot = Join-Path (Join-Path (Join-Path (Join-Path (Join-Path $install 'standalone') 'node_modules') 'next') 'dist') 'server'
}
if ($probeRoot -and (Test-Path -LiteralPath $probeRoot)) {
    Invoke-Safely 'Open-file test' {
        $files = @(Get-ChildItem -LiteralPath $probeRoot -Recurse -File -ErrorAction SilentlyContinue | Sort-Object FullName | Select-Object -First 300)
        $sw = New-Object System.Diagnostics.Stopwatch
        $buffer = New-Object byte[] 1
        $pass1 = New-Object 'System.Collections.Generic.List[double]'
        $pass2 = New-Object 'System.Collections.Generic.List[double]'
        foreach ($f in $files) {
            $sw.Restart()
            $stream = [System.IO.File]::OpenRead($f.FullName)
            [void]$stream.Read($buffer, 0, 1)
            $stream.Dispose()
            $sw.Stop()
            $pass1.Add($sw.Elapsed.TotalMilliseconds)
        }
        foreach ($f in $files) {
            $sw.Restart()
            $stream = [System.IO.File]::OpenRead($f.FullName)
            [void]$stream.Read($buffer, 0, 1)
            $stream.Dispose()
            $sw.Stop()
            $pass2.Add($sw.Elapsed.TotalMilliseconds)
        }
        Say 'Opening program files (as they are cached right now):'
        Say ('  first pass : ' + (Get-Stat $pass1))
        Say ('  second pass: ' + (Get-Stat $pass2))
    }
} else {
    Say 'Opening program files: skipped (install folder not found)'
}

# 2. Saving a WhatsApp key: create, write, flush to disk, rename, re-open, flush again.
#    This is the exact sequence the sidecar runs for every key it saves.
$bench = Join-Path ([System.IO.Path]::GetTempPath()) ('sf-bench-' + [guid]::NewGuid().ToString('N'))
try {
    [void](New-Item -ItemType Directory -Path $bench)
    $payload = [System.Text.Encoding]::UTF8.GetBytes(('x' * 600))
    $sw = New-Object System.Diagnostics.Stopwatch
    $writes = New-Object 'System.Collections.Generic.List[double]'
    for ($i = 0; $i -lt 30; $i++) {
        $final = Join-Path $bench ('record{0}.sfauth' -f $i)
        $temporary = Join-Path $bench ('.{0}.tmp' -f $i)
        $sw.Restart()
        $stream = New-Object System.IO.FileStream($temporary, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        $stream.Write($payload, 0, $payload.Length)
        $stream.Flush($true)
        $stream.Dispose()
        [System.IO.File]::Move($temporary, $final)
        $again = New-Object System.IO.FileStream($final, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        $again.Flush($true)
        $again.Dispose()
        $sw.Stop()
        $writes.Add($sw.Elapsed.TotalMilliseconds)
    }
    Say 'Saving one WhatsApp key (create, flush, rename, re-open, flush), 30 times:'
    Say ('  ' + (Get-Stat $writes))

    $reads = New-Object 'System.Collections.Generic.List[double]'
    for ($i = 0; $i -lt 30; $i++) {
        $final = Join-Path $bench ('record{0}.sfauth' -f $i)
        $sw.Restart()
        [void][System.IO.File]::ReadAllBytes($final)
        $sw.Stop()
        $reads.Add($sw.Elapsed.TotalMilliseconds)
    }
    Say 'Reading one WhatsApp key file, 30 times:'
    Say ('  ' + (Get-Stat $reads))
} catch {
    Say ('Key-file speed test failed: {0}' -f $_.Exception.Message)
} finally {
    if (Test-Path -LiteralPath $bench) { Remove-Item -LiteralPath $bench -Recurse -Force -ErrorAction SilentlyContinue }
}

# 3. Unlocking the WhatsApp storage key: the sidecar starts Windows PowerShell and asks Windows
#    to decrypt with DPAPI. This runs the same kind of call on a dummy value (nothing is stored).
if ($onWindows) {
    Invoke-Safely 'PowerShell unlock test' {
        $powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $command = 'Add-Type -AssemblyName System.Security; $b = [System.Text.Encoding]::UTF8.GetBytes(''x''); [void][System.Security.Cryptography.ProtectedData]::Protect($b, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)'
        $times = New-Object 'System.Collections.Generic.List[double]'
        for ($i = 0; $i -lt 3; $i++) {
            $sw = [System.Diagnostics.Stopwatch]::StartNew()
            $info = New-Object System.Diagnostics.ProcessStartInfo
            $info.FileName = $powershell
            $info.Arguments = '-NoProfile -NonInteractive -Command "' + $command + '"'
            $info.UseShellExecute = $false
            $info.CreateNoWindow = $true
            $process = [System.Diagnostics.Process]::Start($info)
            [void]$process.WaitForExit(30000)
            $sw.Stop()
            $times.Add($sw.Elapsed.TotalMilliseconds)
        }
        Say 'Starting Windows PowerShell and unlocking with DPAPI, 3 times:'
        Say ('  ' + (Get-Stat $times))
    }
}

# ---------------------------------------------------------------- write the report
$desktop = [Environment]::GetFolderPath('Desktop')
if (-not $desktop) { $desktop = [System.IO.Path]::GetTempPath() }
$report = Join-Path $desktop 'SahelFlow-diagnostics.txt'
Set-Content -LiteralPath $report -Value $lines -Encoding UTF8
Write-Host ''
Write-Host ('Done. Please send me this file: ' + $report)
if ($onWindows -and $Host.Name -eq 'ConsoleHost') { [void](Read-Host 'Press Enter to close') }
