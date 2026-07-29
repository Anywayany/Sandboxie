[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$X64BuildPath,

    [Parameter(Mandatory = $true)]
    [string]$Win32BuildPath,

    [Parameter(Mandatory = $true)]
    [string]$OutputPath,

    [switch]$AllowUnsigned
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

function Resolve-ExistingDirectory {
    param([string]$Path, [string]$Name)

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        throw "$Name does not exist or is not a directory: $Path"
    }
    return (Resolve-Path -LiteralPath $Path).Path
}

function Copy-RequiredFile {
    param([string]$SourceRoot, [string]$RelativePath, [string]$DestinationRoot)

    $source = Join-Path $SourceRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
        throw "Required build output is missing: $source"
    }

    $destination = Join-Path $DestinationRoot $RelativePath
    $destinationDirectory = Split-Path -Parent $destination
    if (-not (Test-Path -LiteralPath $destinationDirectory)) {
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
    }
    Copy-Item -LiteralPath $source -Destination $destination -Force
}

function Assert-AuthenticodeSignature {
    param([string]$Path)

    if ($AllowUnsigned) {
        return
    }

    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
        throw "Production package requires a valid Authenticode signature: $Path ($($signature.Status))"
    }
}

$x64Root = Resolve-ExistingDirectory $X64BuildPath "X64BuildPath"
$win32Root = Resolve-ExistingDirectory $Win32BuildPath "Win32BuildPath"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$policyPath = Join-Path $projectRoot "config\Sandboxie.ini"

if (-not (Test-Path -LiteralPath $policyPath -PathType Leaf)) {
    throw "Policy file is missing: $policyPath"
}

if (Test-Path -LiteralPath $OutputPath) {
    throw "OutputPath already exists; choose a new empty path: $OutputPath"
}

$outputRoot = [System.IO.Path]::GetFullPath($OutputPath)
$payloadRoot = Join-Path $outputRoot "payload"
New-Item -ItemType Directory -Path $payloadRoot -Force | Out-Null

$x64Files = @(
    "SbieDrv.sys",
    "SbieSvc.exe",
    "SbieDll.dll",
    "SbieMsg.dll",
    "Start.exe",
    "KmdUtil.exe",
    "SandboxieRpcSs.exe",
    "SandboxieDcomLaunch.exe",
    "SandboxieCrypto.exe"
)

$win32Files = @(
    "SbieSvc.exe",
    "SbieDll.dll"
)

foreach ($file in $x64Files) {
    Copy-RequiredFile $x64Root $file $payloadRoot
}
foreach ($file in $win32Files) {
    Copy-RequiredFile $win32Root $file (Join-Path $payloadRoot "32")
}

$sandboxieSignatureFiles = @(
    "SbieSvc.exe.sig",
    "Start.exe.sig"
)
foreach ($file in $sandboxieSignatureFiles) {
    $signatureSource = Join-Path $x64Root $file
    if (Test-Path -LiteralPath $signatureSource -PathType Leaf) {
        Copy-RequiredFile $x64Root $file $payloadRoot
    } elseif (-not $AllowUnsigned) {
        throw "Production package requires Sandboxie's signature sidecar: $signatureSource"
    }
}

Copy-Item -LiteralPath $policyPath -Destination (Join-Path $outputRoot "Sandboxie.ini")
Copy-Item -LiteralPath (Join-Path $scriptRoot "Install-LightSandboxieCore.ps1") -Destination $outputRoot
Copy-Item -LiteralPath (Join-Path $scriptRoot "Uninstall-LightSandboxieCore.ps1") -Destination $outputRoot
Copy-Item -LiteralPath (Join-Path $scriptRoot "Test-LightSandboxieCore.ps1") -Destination $outputRoot

$signedExtensions = @(".exe", ".dll", ".sys")
Get-ChildItem -LiteralPath $payloadRoot -Recurse -File |
    Where-Object { $signedExtensions -contains $_.Extension.ToLowerInvariant() } |
    ForEach-Object { Assert-AuthenticodeSignature $_.FullName }

$manifestEntries = @()
Get-ChildItem -LiteralPath $payloadRoot -Recurse -File |
    Sort-Object FullName |
    ForEach-Object {
        $relative = $_.FullName.Substring($payloadRoot.Length).TrimStart("\", "/")
        $hash = Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256
        $manifestEntries += [ordered]@{
            path = $relative.Replace("\", "/")
            size = $_.Length
            sha256 = $hash.Hash.ToLowerInvariant()
        }
    }

$manifest = [ordered]@{
    schema = 1
    architecture = "x64"
    created_utc = [DateTime]::UtcNow.ToString("o")
    allow_unsigned = [bool]$AllowUnsigned
    policy_sha256 = (Get-FileHash -LiteralPath (Join-Path $outputRoot "Sandboxie.ini") -Algorithm SHA256).Hash.ToLowerInvariant()
    files = $manifestEntries
}

$manifest |
    ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath (Join-Path $outputRoot "payload-manifest.json") -Encoding UTF8

Write-Host "Created Light Sandboxie package: $outputRoot"
