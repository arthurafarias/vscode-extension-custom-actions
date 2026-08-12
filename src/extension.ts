import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
	const helloWorld = vscode.commands.registerCommand('vscode-extension-scaffold.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from vscode-extension-scaffold!');
	});

	context.subscriptions.push(helloWorld);
}

export function deactivate() {}
