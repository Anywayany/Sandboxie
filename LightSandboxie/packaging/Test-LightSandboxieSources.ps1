[CmdletBinding()]
param()

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$repositoryRoot = Split-Path -Parent $projectRoot
$policyPath = Join-Path $projectRoot "config\Sandboxie.ini"
$settingsPath = Join-Path $repositoryRoot "Sandboxie\install\SbieSettings.ini"

$failures = New-Object System.Collections.Generic.List[string]

Get-ChildItem -LiteralPath $scriptRoot -Filter "*.ps1" -File | ForEach-Object {
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile(
        $_.FullName,
        [ref]$tokens,
        [ref]$parseErrors
    ) | Out-Null

    foreach ($parseError in $parseErrors) {
        $failures.Add(
            "$($_.Name):$($parseError.Extent.StartLineNumber): $($parseError.Message)"
        )
    }
}

if (-not (Test-Path -LiteralPath $policyPath -PathType Leaf)) {
    $failures.Add("Missing policy: $policyPath")
}
if (-not (Test-Path -LiteralPath $settingsPath -PathType Leaf)) {
    $failures.Add("Missing Sandboxie setting catalog: $settingsPath")
}

if ($failures.Count -eq 0) {
    $knownSettings = @{}
    Get-Content -LiteralPath $settingsPath | ForEach-Object {
        if ($_ -match "^\[([A-Za-z][A-Za-z0-9_]*)\]$") {
            $knownSettings[$Matches[1].ToLowerInvariant()] = $true
        }
    }

    Get-Content -LiteralPath $policyPath | ForEach-Object {
        if ($_ -match "^([A-Za-z][A-Za-z0-9_]*)=") {
            $setting = $Matches[1]
            if (-not $knownSettings.ContainsKey($setting.ToLowerInvariant())) {
                $failures.Add("Unknown Sandboxie setting in policy: $setting")
            }
        }
    }

    $policyText = Get-Content -LiteralPath $policyPath -Raw
    foreach ($required in @(
        "[PicoClawBox]",
        "UsePrivacyMode=y",
        "UseSecurityMode=y",
        "BlockNetworkFiles=y",
        "NetworkAccess=*,Block"
    )) {
        if (-not $policyText.Contains($required)) {
            $failures.Add("Policy does not contain required baseline: $required")
        }
    }
}

if ($failures.Count -gt 0) {
    foreach ($failure in $failures) {
        Write-Error $failure -ErrorAction Continue
    }
    exit 1
}

Write-Host "Light Sandboxie deployment source validation passed."
exit 0
