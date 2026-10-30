# 部署与日常使用

## A. 只是换手机或电脑，仍访问已配置的Mac

打开 `https://vscode.dev/tunnel/<你的隧道名>`，使用获授权的同一GitHub账号，打开与桌面相同的项目根目录和DeepSeek原对话。无需在手机安装VSIX，也无需重新配置后端。

## B. 在另一台Apple Silicon Mac部署

### 1. 下载并核对

从 [shared-v0.6.101 Release](https://github.com/smartadpole/deepseek-harness-shared/releases/tag/shared-v0.6.101) 下载远程/布局助手两个VSIX和SHA256SUMS，并从[基础发行包](https://github.com/smartadpole/deepseek-harness-shared/releases/download/shared-v0.6.100/deepseek-harness-owner-0.6.0-darwin-arm64.vsix)下载桌面owner VSIX，保存在该Mac约定的工具目录。在包含这些文件的目录运行：

```sh
shasum -a 256 -c SHA256SUMS
```

此版本固定桌面0.6.0。新主机尚未使用DeepSeek时可按下文安装；已有更高版本或V4历史时，先做版本/历史兼容评估，不能直接用 `--force` 降级现用桌面profile。安装到远程宿主的0.6.101也不会替你迁移桌面profile。

### 2. 桌面安装owner，启用远程入口

在Mac本机终端，将安装包路径换成实际位置：

```sh
VSCODE_CLI='/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code'
"$VSCODE_CLI" --install-extension '/实际路径/deepseek-harness-owner-0.6.0-darwin-arm64.vsix'
"$VSCODE_CLI" tunnel user login --provider github
```

由本人完成设备登录。按 [Remote Tunnels官方文档](https://code.visualstudio.com/docs/remote/tunnels) 阅读许可并安装或启动后台隧道，使用这台新主机独有的名称，例如 `my-mac`。不要把另一台主机的隧道名照搬过来。首次远程Server下载可能需要数分钟。

在桌面VS Code打开目标项目根目录、打开DeepSeek工作台，配置自己的模型账号，确认桌面可用。桌面必须保持运行且Mac保持联网/唤醒。

### 3. 让远程Server初始化

浏览器打开隧道地址，连接一次并打开同一个项目。桌面和远程窗口必须指向相同的真实项目根目录。等VS Code Server初始化完成再安装远程包。

在Mac终端列出已有server CLI：

```sh
ls "$HOME"/.vscode/cli/servers/Stable-*/server/bin/code-server
```

选取本次隧道实际使用版本的CLI。如果出现多个版本，结合隧道日志确认当前版本。先完成下一步私有绑定，再安装远程插件，确保首次激活就使用attach模式。

### 4. 绑定此Mac的项目

以下命令在Mac终端执行。先把第一行换为自己的项目绝对路径；使用标准JSON读写，若现有settings.json包含JSONC注释会停止并保留原文件，此时先手工创建描述文件（内容为 `{"version":1,"workspace":"你的项目绝对路径"}`，权限0600），再在远程“打开远程设置(JSON)”里手动添加描述文件绝对路径对应的同名键。

```sh
PROJECT='/你的项目绝对路径'
python3 - "$PROJECT" <<'PY'
import json, os, sys
from pathlib import Path
project = Path(sys.argv[1]).expanduser().resolve(strict=True)
if not project.is_dir():
    raise SystemExit('Project must be a directory')
home = Path.home()
settings = home / '.vscode-server/data/Machine/settings.json'
current = json.loads(settings.read_text()) if settings.exists() else {}
if not isinstance(current, dict):
    raise SystemExit('Remote settings must be a JSON object')
descriptor = home / '.dsh/vscode/shared-backend.json'
if descriptor.exists():
    raise SystemExit('Descriptor already exists; inspect it instead of overwriting another binding')
descriptor.parent.mkdir(parents=True, exist_ok=True)
fd = os.open(descriptor, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    json.dump({'version': 1, 'workspace': str(project)}, f, indent=2)
    f.write('\n')
settings.parent.mkdir(parents=True, exist_ok=True)
backup = settings.with_name('settings.json.before-shared-backend')
if settings.exists() and not backup.exists():
    backup.write_bytes(settings.read_bytes())
    backup.chmod(0o600)
current['deepseekHarness.sharedBackendConnectionFile'] = str(descriptor)
settings.write_text(json.dumps(current, ensure_ascii=False, indent=2) + '\n')
print('Remote binding saved:', descriptor)
PY
```

描述文件不放token或API Key。只有一个匹配workspace的桌面后端时无需PID；如果同项目开了多个桌面窗口，可在确认目标进程后加入整数 `preferredPid`。重启后PID可能变化；只有一个新owner时可自动重新发现，多owner歧义时需重新选定。

当前绑定适用于一个项目，其他目录会拒绝连接。切换项目时先按实际项目与owner重配描述文件，不能把所有窗口强行指向同一个后端。

### 5. 安装远程客户端

选取本次隧道实际使用版本的CLI。如果出现多个版本，结合 `~/.vscode/cli/tunnel-service.log` 确认当前版本，不随便选一个。把该路径填入变量：

```sh
REMOTE_CODE_SERVER='/实际server路径/bin/code-server'
"$REMOTE_CODE_SERVER" --extensions-dir "$HOME/.vscode-server/extensions" \
  --install-extension '/实际路径/deepseek-harness-0.6.101-darwin-arm64.vsix' --force
"$REMOTE_CODE_SERVER" --extensions-dir "$HOME/.vscode-server/extensions" \
  --install-extension '/实际路径/remote-deepseek-focus-0.1.0.vsix'
```

布局助手可省略。**这里必须用远程server CLI，不能把0.6.101装到负责执行任务的桌面宿主。** 不需重启隧道或桌面后端。

### 6. 刷新浏览器并验收

1. 手机刷新远程窗口，打开原对话，确认状态和桌面一致。
2. 桌面正常产生新输出时，确认手机持续更新。
3. 在下一条本来就需要的业务消息中，从手机续聊，确认两端都看到同一条消息与结果。
4. 刷新手机不应中断桌面执行；不要通过删除session.lock“修复”。

远程输出面板“DeepSeek Harness”应出现 `[attach] Connected to existing desktop owner PID ...; no child runtime started.`。这条记录与用户实际看到更新共同构成加载验证。

## C. 手机布局与日常操作

可选布局助手只在Web远程窗口生效，自动把DeepSeek移到主编辑区并收起侧栏。状态栏“普通布局”恢复文件浏览器，“DeepSeek”再次聚焦。命令“远程工作台：关闭自动聚焦”或 `remoteDeepSeekFocus.enabled=false` 可永久停用。

若希望隐藏内置Copilot，可在远程设置添加 `"chat.disableAIFeatures": true`；这是可选偏好，勿覆盖原设置。浏览器导航栏不受VS Code控制。

手机和电脑通过同一owner发送消息；不用来回关闭释放。模型provider/credential、插件安装等可能重启profile的操作在桌面执行。两端同时操作审批未全量验证，重要审批避免同时点击。

## D. 常见问题

| 现象 | 检查 |
|---|---|
| 一直Connecting | 先看隧道Connected、远程组件下载和extension host是否启动 |
| 手机仍显示会话占用/失败 | 核对远程版本0.6.101、描述路径和 `[attach]` 日志；通常仍加载旧独立后端 |
| No running desktop backend | 桌面0.6.0工作台是否打开、项目是否匹配；不要启动第二个竞争后端 |
| Multiple desktop backends | 相同项目多个桌面owner；核对目标PID后显式绑定 |
| workspace does not match | 远程窗口与描述文件是否指向同一项目真实目录 |
| private file (0600) | 描述文件属于当前用户，并执行 `chmod 600 <描述文件>` |
| 手机无法修改连接设置 | attach模式的预期边界，在桌面owner修改 |
| 桌面退出后手机掉线 | 本版依附桌面进程；独立常驻服务未实现 |

排障只分享去除token/账号/会话正文后的错误摘要，不能上传完整Gateway启动日志。

## E. 撤销与升级

关闭共享模式：仅删除远程Machine的 `deepseekHarness.sharedBackendConnectionFile` 键，再用**远程server CLI**强制安装保留的原0.6.0包并刷新。原设置备份可用于核对，不要覆盖后来新增的其他设置。布局助手可独立卸载。保留 `~/.dsh` 历史与写锁。

升级后必须重新验证桌面版本、日志发现/认证、流式订阅、发送和生命周期。此定制版保留上游扩展ID；后续Marketplace升级可能覆盖定制行为，建议在远程扩展页关闭该扩展的自动更新，并按本仓库Release主动升级。

## F. 从源码重建

```sh
npm ci
npm run check-types
npm test
node esbuild.mjs --production
python3 scripts/package-shared-backend.py \
  '/可信原0.6.0-darwin-arm64.vsix' '/新的输出路径.vsix'
```

重打包脚本核对原包身份、版本及依赖，只替换构建文件和manifest，保留原平台runtime。新包哈希可能随打包时间不同；验证运行代码与发布源码是否一致。发布包的最终校验值以GitHub Release的SHA256SUMS为准。
