module.exports = async function ({ vscode }) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Insert Timestamp: no active editor.');
    return;
  }

  await editor.edit(builder => {
    builder.insert(editor.selection.active, new Date().toISOString());
  });
};
