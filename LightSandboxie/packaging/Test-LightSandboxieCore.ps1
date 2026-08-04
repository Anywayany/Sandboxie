[CmdletBinding()]
param(
    [string]$InstallPath = "$env:ProgramFiles\Wendi\LightSandboxie",
    [string]$PolicyPath = "$env:ProgramData\Wendi\LightSandboxie\Sandboxie.ini",
    [switch]$AllowUnsigned
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$requiredFiles = @(
    "SbieDrv.sys",
    "SbieSvc.exe",
    "SbieDll.dll",
    "SbieMsg.dll",
    "Start.exe",
    "KmdUtil.exe",
    "SandboxieRpcSs.exe",
    "SandboxieDcomLaunch.exe",
    "SandboxieCrypto.exe",
    "Templates.ini",
    "32\SbieSvc.exe",
    "32\SbieDll.dll"
)

$failures = New-Object System.Collections.Generic.List[string]

foreach ($relative in $requiredFiles) {
    $path = Join-Path $InstallPath $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        $failures.Add("Missing file: $path")
    }
}

if (-not $AllowUnsigned) {
    foreach ($signatureFile in @("SbieSvc.exe.sig", "Start.exe.sig")) {
        $path = Join-Path $InstallPath $signatureFile
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            $failures.Add("Missing Sandboxie signature: $path")
        }
    }
}

if (-not (Test-Path -LiteralPath $PolicyPath -PathType Leaf)) {
    $failures.Add("Missing policy: $PolicyPath")
} else {
    $policyText = Get-Content -LiteralPath $PolicyPath -Raw
    foreach ($requiredPolicy in @(
        "[PicoClawBox]",
        "UsePrivacyMode=y",
        "UseSecurityMode=y",
        "BlockNetworkFiles=y",
        "NetworkAccess=*,Block"
    )) {
        if (-not $policyText.Contains($requiredPolicy)) {
            $failures.Add("Policy does not contain: $requiredPolicy")
        }
    }
}

$driver = Get-Service -Name "SbieDrv" -ErrorAction SilentlyContinue
if ($null -eq $driver) {
    $failures.Add("SbieDrv is not installed.")
}

$service = Get-Service -Name "SbieSvc" -ErrorAction SilentlyContinue
if ($null -eq $service) {
    $failures.Add("SbieSvc is not installed.")
} elseif ($service.Status -ne "Running") {
    $failures.Add("SbieSvc is not running (status: $($service.Status)).")
}

$driverRegistry = Get-ItemProperty `
    -LiteralPath "HKLM:\SYSTEM\CurrentControlSet\Services\SbieDrv" `
    -Name "IniPath" `
    -ErrorAction SilentlyContinue
$configuredIni = $null
if ($null -ne $driverRegistry) {
    $configuredIni = $driverRegistry.IniPath
}
if ($configuredIni -ne $PolicyPath) {
    $failures.Add("SbieDrv IniPath mismatch: '$configuredIni'")
}

if ($failures.Count -gt 0) {
    foreach ($failure in $failures) {
        Write-Error $failure -ErrorAction Continue
    }
    exit 1
}

Write-Host "Wendi Light Sandboxie Core health check passed."
exit 0
