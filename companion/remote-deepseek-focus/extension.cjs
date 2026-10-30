'use strict';
const vscode = require('vscode');
const { createController } = require('./focus.cjs');
function activate(context) {
  const controller = createController(vscode);
  if (!controller.supported()) return;
  const output = vscode.window.createOutputChannel('Remote DeepSeek Focus');
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
  let timer;
  let disposed = false;
  function render(focused) {
    status.text = focused ? '$(layout) 普通布局' : '$(comment-discussion) DeepSeek';
    status.tooltip = focused ? '显示文件浏览器；下次打开网页仍自动聚焦 DeepSeek' : '打开 DeepSeek 宽屏工作台';
    status.command = focused ? 'remoteDeepSeekFocus.restore' : 'remoteDeepSeekFocus.apply';
    status.show();
  }
  async function apply() {
    clearTimeout(timer);
    try {
      const focused = await controller.apply();
      if (!disposed) render(focused);
      output.appendLine(focused ? 'Focus applied: DeepSeek editor, one group, sidebars and panel hidden.' : 'Automatic focus disabled.');
    } catch (error) {
      output.appendLine(`Focus failed: ${error.message}`);
      if (!disposed) render(false);
    }
  }
  async function restore() {
    clearTimeout(timer);
    await controller.restore();
    if (!disposed) render(false);
    output.appendLine('Ordinary layout: Explorer shown; no files or conversations closed.');
  }
  context.subscriptions.push(output, status,
    {dispose(){disposed=true;clearTimeout(timer);}},
    vscode.commands.registerCommand('remoteDeepSeekFocus.apply', apply),
    vscode.commands.registerCommand('remoteDeepSeekFocus.restore', restore),
    vscode.commands.registerCommand('remoteDeepSeekFocus.disable', async () => {
      clearTimeout(timer);
      await vscode.workspace.getConfiguration('remoteDeepSeekFocus').update('enabled', false, vscode.ConfigurationTarget.Global);
      await restore();
    }));
  render(false);
  // One startup action only. Never poll or steal the layout back during a conversation.
  timer = setTimeout(apply, 1200);
}
exports.activate = activate;
