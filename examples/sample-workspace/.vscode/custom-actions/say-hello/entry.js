module.exports = async function ({ vscode, workspaceRoot, output }) {
  output.appendLine(`Hello from ${workspaceRoot}`);
  vscode.window.showInformationMessage('Hello from a custom action!');
};
