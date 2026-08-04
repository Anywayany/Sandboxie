[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = "High")]
param(
    [string]$InstallPath = "$env:ProgramFiles\Wendi\LightSandboxie",
    [string]$PolicyDirectory = "$env:ProgramData\Wendi\LightSandboxie",
    [switch]$RemovePolicy,
    [switch]$RemoveSandboxData
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Assert-ElevatedDeploymentContext {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Uninstall must run as Administrator or SYSTEM. This script does not self-elevate."
    }
}

function Invoke-KmdUtilIfPresent {
    param([string[]]$Arguments)

    $tool = Join-Path $InstallPath "KmdUtil.exe"
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
        throw "Cannot safely remove installed services because KmdUtil is missing: $tool"
    }
    $argumentLine = ($Arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join " "
    $process = Start-Process -FilePath $tool -ArgumentList $argumentLine -Wait -PassThru -NoNewWindow
    if ($process.ExitCode -ne 0) {
        throw "KmdUtil failed with exit code $($process.ExitCode): $($Arguments -join ' ')"
    }
}

function Test-ServiceInstalled {
    param([string]$Name)
    return $null -ne (Get-Service -Name $Name -ErrorAction SilentlyContinue)
}

Assert-ElevatedDeploymentContext

if ($PSCmdlet.ShouldProcess("SbieSvc and SbieDrv", "Stop and delete services")) {
    if (Test-ServiceInstalled "SbieSvc") {
        Invoke-KmdUtilIfPresent @("stop", "SbieSvc")
        Invoke-KmdUtilIfPresent @("delete", "SbieSvc")
    }
    if (Test-ServiceInstalled "SbieDrv") {
        Invoke-KmdUtilIfPresent @("stop", "SbieDrv")
        Invoke-KmdUtilIfPresent @("delete", "SbieDrv")
    }
}

if (Test-Path -LiteralPath $InstallPath) {
    if ($PSCmdlet.ShouldProcess($InstallPath, "Remove Light Sandboxie core files")) {
        Remove-Item -LiteralPath $InstallPath -Recurse -Force
    }
}

if ($RemovePolicy -and (Test-Path -LiteralPath $PolicyDirectory)) {
    if ($PSCmdlet.ShouldProcess($PolicyDirectory, "Remove centrally managed policy")) {
        Remove-Item -LiteralPath $PolicyDirectory -Recurse -Force
    }
}

$sandboxRoot = "$env:ProgramData\Wendi\Sandbox"
if ($RemoveSandboxData -and (Test-Path -LiteralPath $sandboxRoot)) {
    if ($PSCmdlet.ShouldProcess($sandboxRoot, "Permanently remove all PicoClaw sandbox data")) {
        Remove-Item -LiteralPath $sandboxRoot -Recurse -Force
    }
}

Write-Host "Wendi Light Sandboxie Core uninstall completed."
