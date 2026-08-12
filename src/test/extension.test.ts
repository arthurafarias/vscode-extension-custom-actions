import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension activates and registers command', async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('vscode-extension-scaffold.helloWorld'));
	});
});
