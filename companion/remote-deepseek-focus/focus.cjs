'use strict';
const OPEN = 'deepseekHarness.openChatWindow';
const LAYOUT = ['workbench.action.joinAllGroups', 'workbench.action.closeSidebar',
  'workbench.action.closeAuxiliaryBar', 'workbench.action.closePanel'];
function createController(vscode) {
  let pending;
  const supported = () => vscode.env.uiKind === vscode.UIKind.Web && !!vscode.env.remoteName;
  async function applyOnce() {
    if (!supported() || !vscode.workspace.getConfiguration('remoteDeepSeekFocus').get('enabled', true)) return false;
    const deepseek = vscode.extensions.getExtension('skymecode.deepseek-harness-for-vscode');
    if (!deepseek) throw new Error('DeepSeek Harness is not installed in this remote host.');
    await deepseek.activate();
    const available = new Set(await vscode.commands.getCommands(true));
    for (const id of [OPEN, ...LAYOUT]) {
      if (!available.has(id)) throw new Error(`Required command is unavailable: ${id}`);
    }
    // Opening must succeed before hiding anything. These commands set state; none toggle it.
    await vscode.commands.executeCommand(OPEN);
    for (const id of LAYOUT) await vscode.commands.executeCommand(id);
    return true;
  }
  return {
    supported,
    apply() {
      if (!pending) pending = applyOnce().finally(() => { pending = undefined; });
      return pending;
    },
    async restore() {
      if (!supported()) return;
      // Wait for an in-flight startup before restoring, so startup cannot undo the user's click.
      if (pending) await pending.catch(() => {});
      await vscode.commands.executeCommand('workbench.view.explorer');
    }
  };
}
exports.createController = createController;
