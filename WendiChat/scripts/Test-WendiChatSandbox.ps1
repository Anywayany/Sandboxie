[CmdletBinding()]
param(
    [string]$StartExe = "$env:ProgramFiles\Wendi\LightSandboxie\Start.exe",
    [string]$LauncherExe = "",
    [string]$SandboxName = "PicoClawBox",
    [int]$TimeoutSeconds = 45
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($LauncherExe)) {
    $LauncherExe = Join-Path $env:LOCALAPPDATA `
        "Programs\wendi-chat-desktop\resources\picoclaw\picoclaw-launcher.exe"
}

function Invoke-SandboxieStart {
    param(
        [string[]]$Arguments,
        [switch]$CaptureOutput
    )

    # Start.exe is a GUI-subsystem executable. Direct invocation from Windows
    # PowerShell neither waits reliably nor provides it with capturable standard
    # handles, so use ProcessStartInfo with explicit redirection instead.
    $argumentLine = ($Arguments | ForEach-Object {
        if ($_ -match '[\s"]') {
            '"' + $_.Replace('"', '\"') + '"'
        } else {
            $_
        }
    }) -join " "
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $StartExe
    $startInfo.Arguments = $argumentLine
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = [bool]$CaptureOutput
    $startInfo.RedirectStandardError = [bool]$CaptureOutput
    $process = [System.Diagnostics.Process]::Start($startInfo)
    $stdout = ""
    $stderr = ""
    if ($CaptureOutput) {
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
    }
    $process.WaitForExit()
    $output = @(
        $stdout -split "`r?`n" | Where-Object { $_.Length -gt 0 }
    )
    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        Output = $output
        ErrorOutput = $stderr.Trim()
    }
}

function Assert-WindowsX64 {
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw "Wendi Chat supports only Windows 10/11 x64."
    }
    if ([Environment]::OSVersion.Version.Major -lt 10) {
        throw "Wendi Chat supports only Windows 10/11 x64."
    }
}

function Get-SandboxProcessIds {
    $result = Invoke-SandboxieStart `
        -Arguments @("/box:$SandboxName", "/silent", "/listpids") `
        -CaptureOutput
    if ($result.ExitCode -ne 0) {
        throw "Start.exe /listpids failed with exit code $($result.ExitCode)."
    }

    $numbers = New-Object System.Collections.Generic.List[int]
    foreach ($line in $result.Output) {
        $value = 0
        if ([int]::TryParse(([string]$line).Trim(), [ref]$value)) {
            $numbers.Add($value)
        }
    }
    if ($numbers.Count -eq 0) {
        throw "Start.exe /listpids returned no process count."
    }

    $reportedCount = $numbers[0]
    $processIds = @($numbers | Select-Object -Skip 1)
    if ($reportedCount -ne $processIds.Count) {
        throw "Sandbox PID count mismatch: reported $reportedCount, received $($processIds.Count)."
    }
    return $processIds
}

function Get-AvailableLoopbackPort {
    $listener = New-Object Net.Sockets.TcpListener(
        [Net.IPAddress]::Loopback,
        0
    )
    try {
        $listener.Start()
        return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
    } finally {
        $listener.Stop()
    }
}

function Wait-PicoClawReady {
    param([string]$StatusUrl)

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    do {
        try {
            $response = Invoke-WebRequest `
                -Uri $StatusUrl `
                -UseBasicParsing `
                -TimeoutSec 2
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return
            }
        } catch {
            Start-Sleep -Milliseconds 250
        }
    } while ([DateTime]::UtcNow -lt $deadline)

    throw "PicoClaw did not become ready within $TimeoutSeconds seconds."
}

Assert-WindowsX64

foreach ($requiredFile in @($StartExe, $LauncherExe)) {
    if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
        throw "Required executable is missing: $requiredFile"
    }
}
if ($TimeoutSeconds -lt 1) {
    throw "TimeoutSeconds must be positive."
}

$service = Get-Service -Name "SbieSvc" -ErrorAction SilentlyContinue
if ($null -eq $service -or $service.Status -ne "Running") {
    throw "The enterprise-installed SbieSvc service is not running."
}
if ($null -eq (Get-Service -Name "SbieDrv" -ErrorAction SilentlyContinue)) {
    throw "The enterprise-installed SbieDrv driver service is missing."
}

$existingProcessIds = @(Get-SandboxProcessIds)
if ($existingProcessIds.Count -ne 0) {
    throw "$SandboxName is already in use; close Wendi Chat before the smoke test."
}

$testId = [Guid]::NewGuid().ToString("N")
$picoClawHome = Join-Path $env:LOCALAPPDATA "WendiChat\PicoClaw\SmokeTest-$testId"
$configPath = Join-Path $picoClawHome "config.json"
$port = Get-AvailableLoopbackPort
$statusUrl = "http://127.0.0.1:$port/api/auth/status"
$previousPicoClawHome = [Environment]::GetEnvironmentVariable(
    "PICOCLAW_HOME",
    "Process"
)
$started = $false

try {
    [Environment]::SetEnvironmentVariable(
        "PICOCLAW_HOME",
        $picoClawHome,
        "Process"
    )
    $launchResult = Invoke-SandboxieStart @(
        "/box:$SandboxName",
        "/silent",
        "/hide_window",
        $LauncherExe,
        "-host", "127.0.0.1",
        "-port", ([string]$port),
        "-no-browser",
        "-console",
        $configPath
    )
    if ($launchResult.ExitCode -ne 0) {
        throw "Sandboxed PicoClaw launch failed with exit code $($launchResult.ExitCode)."
    }
    $started = $true

    Wait-PicoClawReady $statusUrl

    $sandboxProcessIds = @(Get-SandboxProcessIds)
    if ($sandboxProcessIds.Count -eq 0) {
        throw "PicoClaw is reachable, but PicoClawBox contains no processes."
    }

    $processNames = @(
        foreach ($processId in $sandboxProcessIds) {
            try {
                (Get-Process -Id $processId -ErrorAction Stop).ProcessName
            } catch {
                "pid-$processId"
            }
        }
    )
    $picoClawProcesses = @(
        $processNames | Where-Object {
            $_ -in @("picoclaw-launcher", "picoclaw")
        }
    )
    if ($picoClawProcesses.Count -eq 0) {
        throw "PicoClawBox does not contain a PicoClaw process: $($processNames -join ', ')"
    }

    if (Test-Path -LiteralPath $picoClawHome) {
        throw "Isolation failure: PicoClaw wrote its smoke-test home to the host."
    }

    Write-Host "Wendi Chat sandbox smoke test passed."
    Write-Host "Endpoint: $statusUrl"
    Write-Host "Sandboxed processes: $($processNames -join ', ')"
} finally {
    if ($started) {
        $terminateResult = Invoke-SandboxieStart @(
            "/box:$SandboxName",
            "/silent",
            "/terminate"
        )
        if ($terminateResult.ExitCode -ne 0) {
            Write-Warning "Could not terminate $SandboxName (exit code $($terminateResult.ExitCode))."
        }
    }
    [Environment]::SetEnvironmentVariable(
        "PICOCLAW_HOME",
        $previousPicoClawHome,
        "Process"
    )
}
