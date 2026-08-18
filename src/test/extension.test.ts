import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Extension activates and registers its commands', async () => {
		const ext = vscode.extensions.getExtension('arthurafarias.vscode-extension-custom-actions');
		assert.ok(ext, 'extension not found');
		await ext.activate();

		const commands = await vscode.commands.getCommands(true);
		assert.ok(commands.includes('customActions.reload'));
		assert.ok(commands.includes('customActions.run'));
	});
});
