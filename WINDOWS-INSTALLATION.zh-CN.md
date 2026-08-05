# 在新 Windows 电脑安装 Light Sandboxie Core、Wendi 和 PicoClaw

本文适用于个人测试环境中的 Windows 10/11 x64。安装顺序必须是：

1. 以管理员身份安装 Light Sandboxie Core；
2. 以日常用户身份安装 Wendi；
3. 在 Wendi 中打开 PicoClaw，完成登录和模型配置；
4. 验证 PicoClaw 确实运行在 `PicoClawBox` 中。

> Light Sandboxie Core 包含内核驱动和系统服务。只使用自己构建或从可信设备复制、且签名与哈希验证通过的包。不要通过关闭驱动签名、关闭 Defender 或加入排除项来绕过安装错误。

## 1. 系统要求

- Windows 10 或 Windows 11，x64；
- Windows 已安装最新安全更新；
- 安装 Core 时具有本机管理员权限；
- 能访问 GitHub 和所使用的模型 API；
- Wendi 与 Core 使用同一个 Windows 用户进行首次测试；
- Core 使用 `v3` 或更新的安装包；
- Wendi 使用 commit `572d3c3` 或更新版本构建的安装器。

在目标电脑检查系统架构：

```powershell
[Environment]::Is64BitOperatingSystem
[Environment]::OSVersion.Version
```

第一条必须返回 `True`。

## 2. 准备两个安装产物

| 产物 | 用途 | 推荐来源 |
|---|---|---|
| `Wendi-LightSandboxie-Core-x64-v3` 或更新版本 | 安装驱动、服务、策略和 `Start.exe` | 从已经验证成功的电脑复制 |
| `Wendi Chat Setup 0.1.5.exe` 或更新版本 | 安装 Wendi、PicoClaw launcher 和 core | GitHub Actions 或可信构建机 |

### 2.1 准备 Light Sandboxie Core

仓库不会提交 Core 二进制和本地 `artifacts` 目录，因此仅克隆 GitHub 仓库不足以安装 Core。

最简单的方式是从已经测试成功的电脑复制以下目录：

```text
C:\Users\Admin\Documents\light-sandboxie\artifacts\Wendi-LightSandboxie-Core-x64-v3
```

该目录至少应包含：

```text
Install-LightSandboxieCore.ps1
Uninstall-LightSandboxieCore.ps1
Test-LightSandboxieCore.ps1
Sandboxie.ini
payload-manifest.json
payload\SbieDrv.sys
payload\SbieSvc.exe
payload\Start.exe
payload\Templates.ini
```

在原电脑上可将整个目录压缩后再复制：

```powershell
Set-Location C:\Users\Admin\Documents\light-sandboxie

Compress-Archive `
  -LiteralPath .\artifacts\Wendi-LightSandboxie-Core-x64-v3 `
  -DestinationPath .\Wendi-LightSandboxie-Core-x64-v3.zip `
  -Force

Get-FileHash .\Wendi-LightSandboxie-Core-x64-v3.zip -Algorithm SHA256
```

记录输出的 SHA-256，并在新电脑上重新计算、人工比较。

如果必须从源码重新生成 Core，请参阅 `LightSandboxie/README.md`。生产包需要有效的 Authenticode 签名、Sandboxie `.sig` 文件以及可由 Windows 接受的驱动签名；不要在普通个人电脑上使用 `-AllowUnsigned`。

### 2.2 下载 Wendi 安装器

1. 打开仓库的 [Build PicoClaw Windows payload](https://github.com/Anywayany/Sandboxie/actions/workflows/build-picoclaw-payload.yml?query=branch%3Alight-sandboxie) 工作流；
2. 选择 `light-sandboxie` 分支最新的成功运行；
3. 下载 artifact：`wendi-chat-windows-x64-unsigned`；
4. 解压后应得到 Wendi 安装器和 `SHA256SUMS.txt`；
5. 计算安装器哈希并与 `SHA256SUMS.txt` 比较。

```powershell
Get-FileHash '.\Wendi Chat Setup 0.1.5.exe' -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

该 Actions artifact 是未签名的测试构建。正式分发前应使用组织的代码签名证书签名。只有当安装器确实来自自己的仓库构建且哈希匹配时，才应继续个人测试。

## 3. 将文件复制到新电脑

建议创建临时安装目录：

```text
C:\WendiInstall\
├─ Wendi-LightSandboxie-Core-x64-v3.zip
├─ Wendi Chat Setup 0.1.5.exe
└─ SHA256SUMS.txt
```

在新电脑重新检查 Core 压缩包哈希，然后解压：

```powershell
Set-Location C:\WendiInstall
Get-FileHash .\Wendi-LightSandboxie-Core-x64-v3.zip -Algorithm SHA256

Expand-Archive `
  -LiteralPath .\Wendi-LightSandboxie-Core-x64-v3.zip `
  -DestinationPath .\Core `
  -Force
```

确认实际脚本路径。例如：

```text
C:\WendiInstall\Core\Wendi-LightSandboxie-Core-x64-v3\Install-LightSandboxieCore.ps1
```

## 4. 安装 Light Sandboxie Core

在开始菜单中找到“Windows PowerShell”，右键选择“以管理员身份运行”。不要使用普通权限窗口。

执行：

```powershell
$CoreDir = 'C:\WendiInstall\Core\Wendi-LightSandboxie-Core-x64-v3'

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "$CoreDir\Install-LightSandboxieCore.ps1"
```

成功时应看到：

```text
Wendi Light Sandboxie Core health check passed.
Wendi Light Sandboxie Core installed successfully.
```

默认安装位置：

```text
Core:      C:\Program Files\Wendi\LightSandboxie
Policy:    C:\ProgramData\Wendi\LightSandboxie\Sandboxie.ini
Box data:  C:\ProgramData\Wendi\Sandbox\<用户名>\PicoClawBox
```

### 4.1 验证 Core

仍在管理员 PowerShell 中执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "$CoreDir\Test-LightSandboxieCore.ps1"

Get-Service SbieSvc
sc.exe query SbieDrv

Get-ItemProperty `
  'HKLM:\SYSTEM\CurrentControlSet\Services\SbieDrv' `
  -Name IniPath
```

预期结果：

- `SbieSvc` 为 `Running`；
- `SbieDrv` 已安装；
- `IniPath` 指向 `C:\ProgramData\Wendi\LightSandboxie\Sandboxie.ini`；
- 健康检查显示 `passed`。

如果安装脚本提示正在使用中的驱动无法替换，请重新启动 Windows，然后再次运行同一安装脚本。

## 5. 安装 Wendi

关闭管理员 PowerShell，回到日常 Windows 用户。Wendi 是按用户安装，不需要管理员权限。

```powershell
Set-Location C:\WendiInstall
Start-Process '.\Wendi Chat Setup 0.1.5.exe' -Wait
```

默认安装位置：

```text
%LOCALAPPDATA%\Programs\wendi-chat-desktop
```

安装后从开始菜单或桌面启动 `Wendi Chat`。

## 6. 首次启动 PicoClaw

1. 打开 Wendi；
2. 点击左侧机器人图标“PicoClaw 智能体”；
3. 等待“正在通过 Light Sandboxie Core 启动 PicoClaw”；
4. 出现 PicoClaw 登录页后，输入控制台密码并登录；
5. 登录和密码操作必须由使用者本人完成。

PicoClaw 的配置、日志和工作区位于沙箱映射下。逻辑配置目录为：

```text
%LOCALAPPDATA%\WendiChat\PicoClaw
```

不要把 API Key、密码或 `config.json` 放进安装包或 Git 仓库。

## 7. 配置模型

以 DeepSeek 为例：

```text
Provider: DeepSeek
API Base: https://api.deepseek.com/v1
API Key:  使用者自己的密钥
Model:    选择账号/API 当前可用的模型
```

保存后发送测试消息：

```text
仅回复 OK
```

只要模型返回 `OK`，即可确认 DNS、HTTPS、模型配置和沙箱网络策略均正常。

## 8. 验证 PicoClaw 位于沙箱中

先在 Wendi 中打开 PicoClaw 页面，等待登录页或对话页加载完成，并在验证期间保持页面开启。

> 以下代码块只包含需要执行的命令。不要复制 PowerShell 提示符（例如 `PS C:\Users\Admin>`、`>>`），也不要把上一次执行产生的表格或 PID 再粘贴回 PowerShell。

### 8.1 查看正在运行的 PicoClaw 进程

```powershell
Get-Process picoclaw* -ErrorAction SilentlyContinue
```

记下 `picoclaw` 和 `picoclaw-launcher` 的 PID。这个命令只能证明进程正在运行，还不能证明它们位于沙箱内。

### 8.2 向 Sandboxie 查询盒内 PID

`Start.exe` 是 GUI 子系统程序。直接执行 `& Start.exe /listpids` 时，Windows PowerShell 可能不等待程序结束，也可能不给它提供可写的标准输出句柄，结果会显示为空。请使用下面经过实测的显式重定向方式：

```powershell
$StartExe = 'C:\Program Files\Wendi\LightSandboxie\Start.exe'
$StartInfo = New-Object System.Diagnostics.ProcessStartInfo
$StartInfo.FileName = $StartExe
$StartInfo.Arguments = '/box:PicoClawBox /silent /listpids'
$StartInfo.UseShellExecute = $false
$StartInfo.CreateNoWindow = $true
$StartInfo.RedirectStandardOutput = $true
$StartInfo.RedirectStandardError = $true

$Process = [System.Diagnostics.Process]::Start($StartInfo)
$Output = $Process.StandardOutput.ReadToEnd()
$ErrorOutput = $Process.StandardError.ReadToEnd()
$Process.WaitForExit()

"ExitCode=$($Process.ExitCode)"
"Sandbox PIDs:"
$Output
if ($ErrorOutput) { "STDERR: $ErrorOutput" }
```

`ExitCode=0` 表示查询命令执行成功。`Sandbox PIDs:` 后的第一行数字是盒内进程数量，后续各行是 PID。一次实际结果如下：

```text
ExitCode=0
Sandbox PIDs:
6
18420
18572
17052
11468
14604
18164
```

如果进程数量返回 `0`，表示执行查询的这一刻 `PicoClawBox` 内没有进程。请确认 Wendi 中的 PicoClaw 页面仍处于已启动状态，然后重新查询。直接调用 `Start.exe` 时完全没有输出通常只是控制台捕获问题，不能据此判断沙箱为空。

### 8.3 将盒内 PID 映射为进程名称

继续在同一个 PowerShell 窗口执行：

```powershell
$Lines = @($Output -split "`r?`n" | Where-Object { $_ -match '^\d+$' })
$SandboxPids = @($Lines | Select-Object -Skip 1 | ForEach-Object { [int]$_ })
$SandboxPids | ForEach-Object {
  Get-Process -Id $_ -ErrorAction SilentlyContinue
} | Select-Object Id, ProcessName, Path
```

正常结果类似：

```text
   Id ProcessName         Path
   -- -----------         ----
18420 SandboxieCrypto     C:\Program Files\Wendi\LightSandboxie\SandboxieCrypto.exe
18572 SandboxieDcomLaunch C:\Program Files\Wendi\LightSandboxie\SandboxieDcomLaunch.exe
17052 picoclaw            C:\Users\...\resources\picoclaw\picoclaw.exe
11468 SandboxieRpcSs      C:\Program Files\Wendi\LightSandboxie\SandboxieRpcSs.exe
14604 picoclaw-launcher   C:\Users\...\resources\picoclaw\picoclaw-launcher.exe
```

`SandboxieCrypto`、`SandboxieDcomLaunch` 和 `SandboxieRpcSs` 是正常的沙箱辅助进程。某个短生命周期 PID 如果在查询和显示之间已经退出，可能不会出现在最终表格中，这也是正常现象。

验证成功需要同时满足：

1. 查询返回 `ExitCode=0`；
2. 盒内进程数量大于 `0`；
3. 第 8.1 步看到的 `picoclaw` 和 `picoclaw-launcher` PID，也出现在 Sandboxie 返回的 PID 列表中；
4. PID 映射结果包含 `picoclaw` 和 `picoclaw-launcher`。

满足以上条件即可确认 PicoClaw 通过 Wendi 启动，并运行在 `PicoClawBox` 中。

## 9. 验证安装的 PicoClaw 载荷

Wendi 安装目录内包含 `payload-manifest.json`。可比较安装后二进制与清单：

```powershell
$PicoDir = Join-Path $env:LOCALAPPDATA `
  'Programs\wendi-chat-desktop\resources\picoclaw'

$Manifest = Get-Content `
  (Join-Path $PicoDir 'payload-manifest.json') `
  -Raw | ConvertFrom-Json

$Expected = ($Manifest.files |
  Where-Object name -eq 'picoclaw.exe').sha256

$Actual = (Get-FileHash `
  (Join-Path $PicoDir 'picoclaw.exe') `
  -Algorithm SHA256).Hash.ToLowerInvariant()

[pscustomobject]@{
  Expected = $Expected
  Actual   = $Actual
  Match    = ($Expected -eq $Actual)
}
```

`Match` 必须为 `True`。

## 10. 常见问题

### 安装脚本出现 `$LASTEXITCODE:` ParserError

使用了早期 Core 包。删除旧解压目录，重新复制 `v3` 或更新版本，不要手工继续修改旧脚本。

### 提示“检索不到变量 `$LASTEXITCODE`”

同样是早期 Core 包问题。使用 `v3` 或更新版本。

### `SbieDrv` 无法启动

常见原因是驱动签名无效、系统架构不符或 Windows 需要重启。不要关闭驱动签名强制或安全软件；改用签名有效的 Core 包。

### Wendi 提示找不到 Light Sandboxie Core

确认以下文件存在：

```text
C:\Program Files\Wendi\LightSandboxie\Start.exe
```

然后重新运行 Core 健康检查。

### 对话出现 DNS 连接 `8.8.8.8:53` 或 `127.0.0.1:53` 超时

安装了旧版 PicoClaw/Wendi。下载由 commit `572d3c3` 或更新版本生成的 Actions artifact，覆盖安装 Wendi，然后重新发送一条新消息。旧会话中的错误记录不会自动消失。

### 返回 HTTP 401、403 或模型不存在

DNS 已正常，问题位于 API Key、余额、模型名、API Base 或账号权限。不要把完整 API Key 粘贴到日志或聊天中。

### 查看 PicoClaw 日志

```powershell
$Log = "C:\ProgramData\Wendi\Sandbox\$env:USERNAME\PicoClawBox\user\current\AppData\Local\WendiChat\PicoClaw\logs\gateway.log"
Get-Content -LiteralPath $Log -Tail 80
```

分享日志前请删除 API Key、Authorization、Bearer token、会话标识和其他个人信息。

## 11. 更新

更新顺序：

1. 退出 Wendi；
2. 以管理员身份运行新 Core 包的 `Install-LightSandboxieCore.ps1`；
3. 按脚本提示重新启动 Windows（如果需要）；
4. 以普通用户运行新的 Wendi 安装器进行覆盖安装；
5. 重新执行 Core 健康检查和“仅回复 OK”测试。

不要把旧 Core 包中的单个 DLL 或驱动手工复制到新版本目录中。

## 12. 卸载

### 12.1 卸载 Wendi

在 Windows“设置 → 应用”中卸载 `Wendi Chat`。

### 12.2 卸载 Light Sandboxie Core

以管理员身份运行：

```powershell
$CoreDir = 'C:\WendiInstall\Core\Wendi-LightSandboxie-Core-x64-v3'

powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "$CoreDir\Uninstall-LightSandboxieCore.ps1"
```

默认卸载不会主动删除策略和沙箱数据。只有在确认不再需要配置、日志和工作区后，才使用：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File "$CoreDir\Uninstall-LightSandboxieCore.ps1" `
  -RemovePolicy `
  -RemoveSandboxData
```

`-RemoveSandboxData` 会删除沙箱内的 PicoClaw 配置、日志和工作区，操作不可逆，应先备份必要数据并妥善保护其中的凭据。

## 13. 验收清单

- [ ] Windows 10/11 x64；
- [ ] Core 包为 `v3` 或更新版本；
- [ ] Core 清单中 `allow_unsigned` 为 `false`；
- [ ] `Test-LightSandboxieCore.ps1` 通过；
- [ ] `SbieSvc` 为 `Running`；
- [ ] Wendi 来自 commit `572d3c3` 或更新构建；
- [ ] `picoclaw.exe` 与 `payload-manifest.json` 哈希一致；
- [ ] PicoClaw 登录成功；
- [ ] 模型返回测试消息；
- [ ] `Start.exe /box:PicoClawBox /listpids` 能看到 PicoClaw 进程。

## 14. 当前已验证参考版本

以下值只适用于 2026-08-05 在本仓库本地生成并验证的文件；重新运行 Actions 后安装器哈希可能变化，应以该次 artifact 内的 `SHA256SUMS.txt` 为准。

```text
Branch:                  light-sandboxie
Commit:                  572d3c3863dbd2799682131b5b75b9d8e9d63bc6
Core package:            Wendi-LightSandboxie-Core-x64-v3
Core allow_unsigned:     false
Local Wendi installer:   Wendi Chat Setup 0.1.5.exe
Local installer SHA-256: 8BF0841A0C1BF4CEA396676B4C552C028E2A8E0D5B05E321CD4ED3E5120DAED1
```
