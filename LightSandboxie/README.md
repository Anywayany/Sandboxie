# Wendi Light Sandboxie Core

This directory contains the enterprise deployment layer used to run PicoClaw
inside a fixed Sandboxie box without installing the Sandboxie user interfaces.

The package is split deliberately:

- Enterprise IT installs or updates the core once as Administrator or SYSTEM.
- The per-user Electron installer never elevates.
- The Electron client starts PicoClaw through `Start.exe /box:PicoClawBox`.
- The centrally installed policy is writable only by SYSTEM and Administrators.

This is not a user-mode or portable Sandboxie replacement. `SbieDrv` and
`SbieSvc` remain required.

## Supported target

- Windows 10 or Windows 11
- x64 operating system
- x64 PicoClaw launcher and core
- Optional 32-bit child processes

## Package contents

`Build-LightSandboxiePackage.ps1` creates the following layout:

```text
Wendi-LightSandboxie-Core-x64/
|-- Install-LightSandboxieCore.ps1
|-- Uninstall-LightSandboxieCore.ps1
|-- Test-LightSandboxieCore.ps1
|-- Sandboxie.ini
|-- payload-manifest.json
`-- payload/
    |-- SbieDrv.sys
    |-- SbieSvc.exe
    |-- SbieSvc.exe.sig
    |-- SbieDll.dll
    |-- SbieMsg.dll
    |-- Start.exe
    |-- Start.exe.sig
    |-- KmdUtil.exe
    |-- SandboxieRpcSs.exe
    |-- SandboxieDcomLaunch.exe
    |-- SandboxieCrypto.exe
    `-- 32/
        |-- SbieSvc.exe
        `-- SbieDll.dll
```

PDB files, Classic/Plus user interfaces, Qt, shell extensions, update tools,
encrypted-box tools, and troubleshooting archives are intentionally excluded.

## Build the package

Run from an x64 Windows build machine after building `Sandboxie/Sandbox.sln`
for x64 and Win32:

```powershell
.\LightSandboxie\packaging\Build-LightSandboxiePackage.ps1 `
  -X64BuildPath .\Sandboxie\Bin\x64\SbieRelease `
  -Win32BuildPath .\Sandboxie\Bin\Win32\SbieRelease `
  -OutputPath .\artifacts\Wendi-LightSandboxie-Core-x64
```

The build script rejects missing files and writes SHA-256 hashes to
`payload-manifest.json`. It does not sign binaries or the final package
container; enterprise distribution must add that outer signature.

Validate the deployment sources without installing the driver:

```powershell
.\LightSandboxie\packaging\Test-LightSandboxieSources.ps1
```

The same validation runs on `windows-latest` when LightSandboxie files change.

For production, sign all user-mode binaries, generate Sandboxie's
`SbieSvc.exe.sig` and `Start.exe.sig` sidecars, and obtain a valid Microsoft
signature for `SbieDrv.sys` before building the package. Use `-AllowUnsigned`
only for isolated development machines running Windows test-signing mode.

For the first enterprise prototype, prefer an approved, unmodified official
Sandboxie core and its matching signature files. A self-built core requires
replacing/managing Sandboxie's custom signing key as well as Microsoft-signing
the resulting kernel driver; Authenticode signing alone is not sufficient.

## Enterprise installation

The install script does not self-elevate or display UAC. Deploy it from an
already elevated management context such as Intune, Configuration Manager,
Group Policy startup scripts, or another software-management agent:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File .\Install-LightSandboxieCore.ps1
```

Default locations:

```text
Core:       C:\Program Files\Wendi\LightSandboxie
Policy:     C:\ProgramData\Wendi\LightSandboxie\Sandboxie.ini
Box roots:  C:\ProgramData\Wendi\Sandbox\<user>\PicoClawBox
```

The install script:

1. verifies the package hashes and production signatures;
2. copies the immutable core payload;
3. installs the demand-start `SbieDrv` kernel service;
4. installs the automatic `SbieSvc` LocalSystem service;
5. points `SbieDrv` at the centrally managed policy;
6. locks the core and policy ACLs;
7. starts `SbieSvc` and validates both services.

Updates should be deployed by IT. Replacing a loaded driver can require a
restart; the script fails rather than silently scheduling an unverified file
replacement.

## Electron launch contract

The Electron main process chooses an available TCP port and launches the
unmodified PicoClaw build:

```text
"C:\Program Files\Wendi\LightSandboxie\Start.exe"
  /box:PicoClawBox
  /silent
  /hide_window
  "...\picoclaw-launcher.exe"
  -host 127.0.0.1
  -port <selected-port>
  -no-browser
  -console
  "...\config.json"
```

Electron sets `PICOCLAW_HOME` to
`%LOCALAPPDATA%\WendiChat\PicoClaw`, keeping PicoClaw's authentication
database, logs, workspace, and configuration under the policy-managed path.

Then it waits for the HTTP endpoint and loads:

```text
http://127.0.0.1:<selected-port>/
```

On application exit:

```text
"C:\Program Files\Wendi\LightSandboxie\Start.exe"
  /box:PicoClawBox
  /terminate
```

## Policy notes

The supplied policy is a secure baseline, not a complete enterprise DLP
policy. In particular:

- only PicoClaw binaries receive outbound loopback, DNS, HTTP, and HTTPS;
- custom model endpoints require explicit additional `NetworkAccess` rules;
- PicoClaw's per-user directory is visible but writes remain sandboxed;
- user data is protected by privacy mode;
- direct network-file access and automatic recovery are disabled.

`UsePrivacyMode` and `UseSecurityMode` are Sandboxie Plus features. Commercial
deployment must include the appropriate Sandboxie business certificate and
must comply with `LICENSE.Plus` and `LICENSE.Classic`.
