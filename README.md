# DeepSeek Harness Shared Backend

手机与桌面共用一个 DeepSeek Harness 执行后端：实时查看同一段对话的进度，并从任一端继续工作。

这是 [skymecode/deepseek-harness-for-vscode](https://github.com/skymecode/deepseek-harness-for-vscode) **v0.6.0 的社区定制分支**，不是 DeepSeek 官方发行版。保留上游 MIT 许可。当前发布版本 **0.6.100**。

**[下载安装包](https://github.com/smartadpole/deepseek-harness-shared/releases/tag/shared-v0.6.100)** · **[部署与使用手册](docs/shared-backend/INSTALL.zh-CN.md)** · **[架构和验证边界](docs/shared-backend/DESIGN.md)** · [上游原说明](README.upstream.zh-CN.md)

## 解决什么问题

原插件在每个 VS Code 扩展宿主启动独立后端。共享历史目录只保证已保存对话可见；桌面任务执行中，另一个后端恢复同一会话会遇到写锁冲突。

本分支增加 **attach 模式**：桌面原插件继续运行唯一执行后端，远程插件连接该后端，订阅相同执行状态和输出。手机刷新或断开只取消自身订阅，不停止桌面任务；不需要关闭桌面来释放会话。

## 当前适用范围

| 角色 | 支持情况 |
|---|---|
| 执行主机 | macOS Apple Silicon，桌面 DeepSeek 扩展固定0.6.0 |
| 远程客户端 | 手机、平板或电脑浏览器，通过 VS Code Remote Tunnels 连接同一主机 |
| 远程扩展 | 本项目0.6.100，仅安装到远程 VS Code Server |
| 手机布局 | 可选 Remote DeepSeek Focus 0.1.0 自动打开宽屏主编辑区 |
| Windows / Linux / Intel Mac作为执行主机 | 本发布未提供相应安装包；共享后端发现只实现macOS |

如果只是换手机或另一台电脑访问已配置的主机，不需要重新安装。若换一台Mac作为执行主机，需要按部署手册在新主机配置。

## 发布资产

- `deepseek-harness-owner-0.6.0-darwin-arm64.vsix`：上游原版桌面owner，原始文件未修改。
- `deepseek-harness-0.6.100-darwin-arm64.vsix`：远程attach客户端，复用相同平台运行依赖。
- `remote-deepseek-focus-0.1.0.vsix`：可选手机布局助手；源码在 `companion/remote-deepseek-focus/`。
- `SHA256SUMS`：上述安装包的校验值。

两个DeepSeek包保留相同extension ID，分别安装在**桌面**和**远程**两个宿主，不能在同一宿主并装。GitHub Releases 是本项目的分发入口；未发布到 VS Code Marketplace。

## 使用边界

桌面VS Code需保持运行。手机连接断开不会停止owner，但退出桌面仍会停止它。远程端的provider/credential及需要重启profile的设置在桌面修改。手机新建对话使用共享workspace；需要隔离工作树时，先在桌面创建，再从手机打开。

已确认手机与本机状态/进度同步；隔离真实Gateway验证双客户端流式输出、断开重连与双向续聊。真实业务对话手机发送、双端同时审批、桌面跨PID重启和休眠恢复未全量验收，详见验证边界。

## 开发与来源

- 基线：上游tag `v0.6.0`，commit `b18c377193d5dc6e216f4693df274e21182a9512`。
- 主要改动：`src/runtime/shared-backend.ts`、`src/runtime/web-runtime.ts`、`src/gateway/harness-gateway-service.ts`及连接设置保护。
- 运行 `npm ci`、`npm run check-types`、`npm test`。生产打包见安装手册。
- 布局助手测试：`node --test companion/remote-deepseek-focus/focus.test.cjs`。
- 依赖与第三方许可保留在原平台包内。未包含个人配置、账号密钥、会话历史或现场排障日志。
