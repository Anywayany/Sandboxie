[CmdletBinding()]
param(
    [string]$InstallPath = "$env:ProgramFiles\Wendi\LightSandboxie",
    [string]$PolicyPath = "$env:ProgramData\Wendi\LightSandboxie\Sandboxie.ini",
    [switch]$AllowUnsigned
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$driverName = "SbieDrv"
$serviceName = "SbieSvc"
$filterAltitude = "86900"

function Assert-ElevatedDeploymentContext {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Light Sandboxie Core must be deployed by enterprise IT as Administrator or SYSTEM. This script does not self-elevate."
    }
}

function Assert-X64Windows {
    if (-not [Environment]::Is64BitOperatingSystem) {
        throw "Only Windows 10/11 x64 is supported."
    }
    if (-not [Environment]::Is64BitProcess) {
        throw "Run the deployment with 64-bit Windows PowerShell."
    }
    $version = [Environment]::OSVersion.Version
    if ($version.Major -lt 10) {
        throw "Only Windows 10/11 x64 is supported."
    }
}

function Invoke-KmdUtil {
    param([string[]]$Arguments)

    $tool = Join-Path $InstallPath "KmdUtil.exe"
    & $tool @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "KmdUtil failed with exit code $LASTEXITCODE: $($Arguments -join ' ')"
    }
}

function Stop-ExistingService {
    param([string]$Name)

    $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
    if ($null -ne $service -and $service.Status -ne "Stopped") {
        Invoke-KmdUtil @("stop", $Name)
    }
}

function Assert-PayloadManifest {
    param([string]$PackageRoot)

    $manifestPath = Join-Path $PackageRoot "payload-manifest.json"
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        throw "Package manifest is missing: $manifestPath"
    }

    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    if ($manifest.schema -ne 1 -or $manifest.architecture -ne "x64") {
        throw "Unsupported payload manifest."
    }
    if ($manifest.allow_unsigned -and -not $AllowUnsigned) {
        throw "The package was built with AllowUnsigned. Production installation rejected it."
    }

    $packagedPolicy = Join-Path $PackageRoot "Sandboxie.ini"
    if (-not (Test-Path -LiteralPath $packagedPolicy -PathType Leaf)) {
        throw "Sandboxie policy is missing: $packagedPolicy"
    }
    $expectedPolicyHash = [string]$manifest.policy_sha256
    if ([string]::IsNullOrWhiteSpace($expectedPolicyHash)) {
        throw "Payload manifest does not contain a policy hash."
    }
    $policyHash = (Get-FileHash -LiteralPath $packagedPolicy -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($policyHash -ne $expectedPolicyHash.ToLowerInvariant()) {
        throw "Sandboxie policy hash mismatch."
    }

    $manifestPaths = @{}
    foreach ($entry in $manifest.files) {
        $relative = ([string]$entry.path).Replace("/", "\")
        if ([IO.Path]::IsPathRooted($relative) -or $relative.Contains("..")) {
            throw "Unsafe manifest path: $relative"
        }
        $normalizedRelative = $relative.ToLowerInvariant()
        if ($manifestPaths.ContainsKey($normalizedRelative)) {
            throw "Duplicate manifest path: $relative"
        }
        $manifestPaths[$normalizedRelative] = $true
        $path = Join-Path (Join-Path $PackageRoot "payload") $relative
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "Payload file is missing: $relative"
        }
        $file = Get-Item -LiteralPath $path
        if ($file.Length -ne [long]$entry.size) {
            throw "Payload size mismatch: $relative"
        }
        $actualHash = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actualHash -ne ([string]$entry.sha256).ToLowerInvariant()) {
            throw "Payload hash mismatch: $relative"
        }
    }

    $payloadRoot = Join-Path $PackageRoot "payload"
    Get-ChildItem -LiteralPath $payloadRoot -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($payloadRoot.Length).TrimStart("\", "/")
        if (-not $manifestPaths.ContainsKey($relative.ToLowerInvariant())) {
            throw "Payload contains an unlisted file: $relative"
        }
    }

    $requiredPayloadFiles = @(
        "SbieDrv.sys",
        "SbieSvc.exe",
        "SbieDll.dll",
        "SbieMsg.dll",
        "Start.exe",
        "KmdUtil.exe",
        "SandboxieRpcSs.exe",
        "SandboxieDcomLaunch.exe",
        "SandboxieCrypto.exe",
        "32\SbieSvc.exe",
        "32\SbieDll.dll"
    )
    if (-not $AllowUnsigned) {
        $requiredPayloadFiles += @("SbieSvc.exe.sig", "Start.exe.sig")
    }
    foreach ($requiredPayloadFile in $requiredPayloadFiles) {
        if (-not $manifestPaths.ContainsKey($requiredPayloadFile.ToLowerInvariant())) {
            throw "Manifest does not contain required payload: $requiredPayloadFile"
        }
    }
}

function Assert-ProductionSignatures {
    param([string]$PayloadRoot)

    if ($AllowUnsigned) {
        return
    }

    Get-ChildItem -LiteralPath $PayloadRoot -Recurse -File |
        Where-Object { @(".exe", ".dll", ".sys") -contains $_.Extension.ToLowerInvariant() } |
        ForEach-Object {
            $signature = Get-AuthenticodeSignature -LiteralPath $_.FullName
            if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
                throw "Invalid production signature: $($_.FullName) ($($signature.Status))"
            }
        }
}

function Set-ProtectedDirectoryAcl {
    param([string]$Path, [bool]$UsersMayRead)

    $acl = New-Object System.Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true, $false)

    $inherit = [Security.AccessControl.InheritanceFlags]"ContainerInherit, ObjectInherit"
    $propagation = [Security.AccessControl.PropagationFlags]::None
    $allow = [Security.AccessControl.AccessControlType]::Allow

    $systemSid = New-Object -TypeName Security.Principal.SecurityIdentifier -ArgumentList "S-1-5-18"
    $adminSid = New-Object -TypeName Security.Principal.SecurityIdentifier -ArgumentList "S-1-5-32-544"
    $usersSid = New-Object -TypeName Security.Principal.SecurityIdentifier -ArgumentList "S-1-5-32-545"

    $systemRule = New-Object Security.AccessControl.FileSystemAccessRule(
        $systemSid, "FullControl", $inherit, $propagation, $allow)
    $adminRule = New-Object Security.AccessControl.FileSystemAccessRule(
        $adminSid, "FullControl", $inherit, $propagation, $allow)
    $acl.AddAccessRule($systemRule)
    $acl.AddAccessRule($adminRule)

    if ($UsersMayRead) {
        $userRule = New-Object Security.AccessControl.FileSystemAccessRule(
            $usersSid, "ReadAndExecute", $inherit, $propagation, $allow)
        $acl.AddAccessRule($userRule)
    }

    Set-Acl -LiteralPath $Path -AclObject $acl
}

Assert-ElevatedDeploymentContext
Assert-X64Windows

$packageRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$payloadRoot = Join-Path $packageRoot "payload"
$sourcePolicy = Join-Path $packageRoot "Sandboxie.ini"

Assert-PayloadManifest $packageRoot
Assert-ProductionSignatures $payloadRoot

if (-not (Test-Path -LiteralPath $sourcePolicy -PathType Leaf)) {
    throw "Sandboxie policy is missing: $sourcePolicy"
}

if (-not (Test-Path -LiteralPath $InstallPath)) {
    New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
}

# Stop components before replacing files. A driver that cannot be stopped must
# be handled by IT with a controlled reboot; do not schedule opaque replacements.
if (Test-Path -LiteralPath (Join-Path $InstallPath "KmdUtil.exe")) {
    Stop-ExistingService $serviceName
    Stop-ExistingService $driverName
}

Get-ChildItem -LiteralPath $payloadRoot -Force |
    Copy-Item -Destination $InstallPath -Recurse -Force

$policyDirectory = Split-Path -Parent $PolicyPath
if (-not (Test-Path -LiteralPath $policyDirectory)) {
    New-Item -ItemType Directory -Path $policyDirectory -Force | Out-Null
}
Copy-Item -LiteralPath $sourcePolicy -Destination $PolicyPath -Force

$sandboxRoot = Join-Path $env:ProgramData "Wendi\Sandbox"
if (-not (Test-Path -LiteralPath $sandboxRoot)) {
    New-Item -ItemType Directory -Path $sandboxRoot -Force | Out-Null
}

Set-ProtectedDirectoryAcl $InstallPath $true
Set-ProtectedDirectoryAcl $policyDirectory $true

$driverPath = Join-Path $InstallPath "SbieDrv.sys"
$servicePath = Join-Path $InstallPath "SbieSvc.exe"
$messagePath = Join-Path $InstallPath "SbieMsg.dll"

Invoke-KmdUtil @(
    "install", $driverName, $driverPath,
    "type=kernel", "start=demand", "msgfile=$messagePath",
    "altitude=$filterAltitude"
)
Invoke-KmdUtil @(
    "install", $serviceName, $servicePath,
    "type=own", "start=auto", "display=Wendi Light Sandboxie Service",
    "group=UIGroup", "msgfile=$messagePath"
)

$driverRegistryPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$driverName"
$serviceRegistryPath = "HKLM:\SYSTEM\CurrentControlSet\Services\$serviceName"
New-ItemProperty -LiteralPath $driverRegistryPath -Name "IniPath" -PropertyType String -Value $PolicyPath -Force | Out-Null
New-ItemProperty -LiteralPath $serviceRegistryPath -Name "Language" -PropertyType DWord -Value 1033 -Force | Out-Null
New-ItemProperty -LiteralPath $serviceRegistryPath -Name "PreferExternalManifest" -PropertyType DWord -Value 1 -Force | Out-Null

Invoke-KmdUtil @("start", $serviceName)

$healthScript = Join-Path $packageRoot "Test-LightSandboxieCore.ps1"
$windowsPowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$healthArguments = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $healthScript,
    "-InstallPath", $InstallPath,
    "-PolicyPath", $PolicyPath
)
if ($AllowUnsigned) {
    $healthArguments += "-AllowUnsigned"
}
& $windowsPowerShell @healthArguments
$healthExitCode = $LASTEXITCODE
if ($healthExitCode -ne 0) {
    throw "Post-install health check failed."
}

Write-Host "Wendi Light Sandboxie Core installed successfully."
