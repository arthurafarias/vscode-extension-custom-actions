const fs = require('fs');

module.exports = async function ({ vscode, workspaceRoot }) {
  const count = fs.readdirSync(workspaceRoot).length;
  vscode.window.showInformationMessage(`Workspace root has ${count} entries.`);
};
