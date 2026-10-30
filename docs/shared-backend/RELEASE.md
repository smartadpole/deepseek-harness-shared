# shared-v0.6.101 — 多端共享 DeepSeek 后端

共享后端可移植性修正版：手机/其他电脑通过VS Code Tunnel附着桌面现有DeepSeek Gateway，实时查看同一会话并续聊，不需要关闭桌面释放会话。

- 基于skymecode v0.6.0，保留MIT许可；不是DeepSeek官方发行版。
- 本发布的主机包仅支持macOS Apple Silicon，桌面owner固定0.6.0；Windows/Linux主机模式尚未实现。
- 修复手工VSIX安装目录没有平台后缀时无法发现桌面owner的问题；仍严格校验版本、桌面目录、同用户与认证。
- 桌面原包沿用[0.6.0基础资产](https://github.com/smartadpole/deepseek-harness-shared/releases/download/shared-v0.6.100/deepseek-harness-owner-0.6.0-darwin-arm64.vsix)，远程定制包与可选布局助手见本版附件；具体宿主与安装顺序见[部署手册](https://github.com/smartadpole/deepseek-harness-shared/blob/macpro/docs/shared-backend/INSTALL.zh-CN.md)。
- 不升级历史格式；不停止当前桌面owner；attach断开只清理自身连接。
- 类型与生产构建通过，628测试通过18跳过；独立Gateway双客户端输出、断开重连、双向续聊验证通过；用户已确认手机状态与进度同步。
- 实际业务手机续聊、跨PID真实桌面重启、双端同时审批与休眠恢复尚未全量验收。桌面退出会停止owner。

下载后在安装包目录运行 `shasum -a 256 -c SHA256SUMS`。两个DeepSeek安装包保留同一ID，分别用于桌面/远程宿主，不能在同一宿主并装。

源码基线：上游v0.6.0 / b18c377193d5dc6e216f4693df274e21182a9512。原平台包及其第三方license完整保留。手机布局助手为可选组件，不调用模型或复制密钥。
