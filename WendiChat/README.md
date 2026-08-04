# Wendi Chat desktop prototype

This directory is a replaceable Electron shell for a Windows enterprise chat
client. Selecting the robot in the left sidebar starts the PicoClaw
`wendi-mobile-h5` launcher through the enterprise-installed Light Sandboxie
Core and embeds its desktop WebUI at `http://127.0.0.1:<port>/`.

The chat content is deliberately a UI prototype. Its message and contact
sections can later be replaced by Tailchat or an internal messaging frontend
without changing the PicoClaw runtime contract.

## Runtime flow

1. The user clicks the robot button.
2. Electron selects an available loopback port.
3. It invokes:

   ```text
   C:\Program Files\Wendi\LightSandboxie\Start.exe
     /box:PicoClawBox
     /silent
     /hide_window
     <picoclaw-launcher.exe>
     -host 127.0.0.1
     -port <port>
     -no-browser
     -console
     <config.json>
   ```

4. Electron polls `/api/auth/status`, then loads the desktop root route `/`
   in a sandboxed iframe inside the chat shell.
5. PicoClaw's existing setup/password page handles authentication.
6. Closing Wendi Chat calls `Start.exe /box:PicoClawBox /terminate`.

The packaged Windows core applies `resources/picoclaw/patches/windows-native-dns.patch`
so Windows retains its native DNS resolver. Without this platform guard,
PicoClaw mistakes Windows for Android because both lack `/etc/resolv.conf` and
overrides the system resolver with sandbox-incompatible DNS endpoints.

## Prepare PicoClaw

Build the Windows x64 binaries from:

```text
https://github.com/Anywayany/picoclaw/tree/wendi-mobile-h5
```

The verified local development payload is built from PicoClaw commit
`bc2d8ac960148146c9c289f84651ee22f6392537`. The branch currently omits the
`workspace` directory required by its `go:embed` directive, so the build uses
only the onboarding templates from PicoClaw `main` commit
`52320f48755852e53b8b6b10b1414a32c3f0a8a8`. Apart from the recorded Windows
DNS platform guard, PicoClaw application source is not modified.

The executables are intentionally ignored by this repository. Run the manual
GitHub Actions workflow `Build PicoClaw Windows payload`, then extract its
`picoclaw-windows-x64` artifact into `resources/picoclaw`. It contains:

```text
picoclaw-launcher.exe
picoclaw.exe
payload-manifest.json
LICENSE.picoclaw.txt
```

`npm run verify:payload` verifies both files are Windows x64 PE images and
checks their sizes, SHA-256 hashes, target, and source provenance against the
manifest. Packaging stops if verification fails.

Do not package `config.json`, passwords, API keys, tokens, or user workspaces.
The default config path is:

```text
%LOCALAPPDATA%\WendiChat\PicoClaw\config.json
```

Electron also sets PicoClaw's supported `PICOCLAW_HOME` environment variable
to `%LOCALAPPDATA%\WendiChat\PicoClaw`. This keeps its authentication database,
logs, workspace, and configuration under one path. PicoClawBox redirects
writes under that directory into its sandbox root.

## Development

Requirements:

- Node.js 22 or newer
- Windows 10/11 x64 for an end-to-end run
- Light Sandboxie Core already deployed by IT

Install and test:

```powershell
cd WendiChat
npm ci
npm test
npm start
```

The pure Node.js tests can run on Linux. Starting Electron/PicoClaw requires
Windows and the two executable payloads.

After enterprise IT installs Light Sandboxie Core, run the non-elevating
integration smoke test from a normal user PowerShell session:

```powershell
npm run smoke:sandbox
```

The test refuses to run if `PicoClawBox` is already occupied. It starts a
temporary PicoClaw instance, waits for `/api/auth/status`, confirms PicoClaw
PIDs are reported by `Start.exe /listpids`, verifies that the temporary home
was not written onto the host, and terminates the test instance. It does not
delete the sandbox or existing user data.

Managed deployments can override paths:

```text
WENDI_SANDBOX_NAME
WENDI_SANDBOXIE_START
WENDI_PICOCLAW_LAUNCHER
WENDI_PICOCLAW_HOME
WENDI_PICOCLAW_CONFIG
WENDI_PICOCLAW_START_TIMEOUT_MS
```

## Build the per-user installer

```powershell
cd WendiChat
npm ci
npm run dist:win
```

The NSIS configuration is x64, per-user, requests only `asInvoker`, disables
elevation, and excludes electron-builder's optional elevation helper. It does
not install a driver, Windows service, or Sandboxie Core. Sign the generated
installer and application executables before enterprise distribution.

The manual GitHub Actions workflow `Build PicoClaw Windows payload` performs
the pinned PicoClaw build and produces an unsigned installer artifact named
`wendi-chat-windows-x64-unsigned`. Production distribution must sign it with
the enterprise code-signing identity.

## Security boundary

- The whole chat renderer has Node.js integration disabled, context isolation
  enabled, and Chromium renderer sandboxing enabled.
- PicoClaw is loaded in a cross-origin iframe with only scripts, forms, and
  same-origin storage enabled. Popups and top-level navigation are not granted.
- The renderer session rejects permission requests and downloads.
- Frame navigation and renderer network requests are restricted to the
  selected `127.0.0.1` PicoClaw origin.
- The shell exposes four narrow IPC methods and validates their sender.
- PicoClaw is bound only to loopback and runs inside `PicoClawBox`.

The Electron controls reduce renderer risk but do not replace Sandboxie. The
kernel driver and service still have to be installed by enterprise IT.
