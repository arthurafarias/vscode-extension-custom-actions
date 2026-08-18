import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const CONFIG_SECTION = 'customActions';
const CONFIG_DIRECTORIES = 'directories';
const DEFAULT_ACTIONS_DIR = '.vscode/custom-actions';
const RELOAD_COMMAND = 'customActions.reload';
const RUN_COMMAND = 'customActions.run';
const EDIT_COMMAND = 'customActions.edit';
const NEW_COMMAND = 'customActions.new';
const META_FILE = 'meta.json';
const ENTRY_FILE = 'entry.js';
const VALID_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

interface ActionMeta {
	name?: string;
	description: string;
	category?: string;
}

interface LoadFailure {
	action: string;
	reason: string;
}

interface ActionInfo {
	label: string;
	description: string;
	actionDir: string;
}

export function activate(context: vscode.ExtensionContext) {
	const output = vscode.window.createOutputChannel('Custom Actions');
	context.subscriptions.push(output);

	const registered = new Map<string, vscode.Disposable>();
	const actionInfo = new Map<string, ActionInfo>();
	let watchers: vscode.Disposable[] = [];
	let reloadTimer: NodeJS.Timeout | undefined;

	const getConfiguredDirectories = (): string[] => {
		const dirs = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string[]>(CONFIG_DIRECTORIES);
		if (!Array.isArray(dirs) || dirs.length === 0) {
			return [DEFAULT_ACTIONS_DIR];
		}
		return dirs;
	};

	const loadActions = () => {
		for (const d of registered.values()) {
			d.dispose();
		}
		registered.clear();
		actionInfo.clear();

		const wsFolder = vscode.workspace.workspaceFolders?.[0];
		if (!wsFolder) {
			output.appendLine('No workspace open; skipping custom action load.');
			return;
		}

		const root = wsFolder.uri.fsPath;
		const failures: LoadFailure[] = [];
		const sourceByAction = new Map<string, string>();
		let loaded = 0;

		for (const relDir of getConfiguredDirectories()) {
			const actionsDir = path.join(root, relDir);

			if (!fs.existsSync(actionsDir) || !fs.statSync(actionsDir).isDirectory()) {
				output.appendLine(`Custom actions directory not found: ${actionsDir}`);
				continue;
			}

			const entries = fs.readdirSync(actionsDir, { withFileTypes: true }).filter(e => e.isDirectory());

			for (const entry of entries) {
				const actionName = entry.name;
				try {
					if (sourceByAction.has(actionName)) {
						throw new Error(`duplicate action name; already loaded from ${sourceByAction.get(actionName)}`);
					}
					registerCustomAction(actionName, path.join(actionsDir, actionName), root, output, context, registered, actionInfo);
					sourceByAction.set(actionName, actionsDir);
					loaded++;
				} catch (err: any) {
					const reason = err?.message ?? String(err);
					failures.push({ action: actionName, reason });
					output.appendLine(`Failed to load custom action "${actionName}": ${reason}`);
				}
			}
		}

		output.appendLine(`Loaded ${loaded} custom action(s)${failures.length ? `, ${failures.length} failed` : ''}.`);

		if (failures.length > 0) {
			const summary = failures.map(f => `${f.action} (${f.reason})`).join(', ');
			vscode.window.showWarningMessage(
				`${failures.length} custom action(s) failed to load: ${summary}`,
				'Show Output'
			).then(choice => {
				if (choice === 'Show Output') {
					output.show();
				}
			});
		}
	};

	const scheduleReload = (reason: string) => {
		output.appendLine(reason);
		if (reloadTimer) {
			clearTimeout(reloadTimer);
		}
		reloadTimer = setTimeout(loadActions, 150);
	};

	const setupWatchers = () => {
		for (const w of watchers) {
			w.dispose();
		}
		watchers = [];

		const wsFolder = vscode.workspace.workspaceFolders?.[0];
		if (!wsFolder) {
			return;
		}

		for (const relDir of getConfiguredDirectories()) {
			const pattern = new vscode.RelativePattern(wsFolder, `${relDir}/**`);
			const watcher = vscode.workspace.createFileSystemWatcher(pattern);
			watcher.onDidChange(uri => scheduleReload(`Changed: ${uri.fsPath}`));
			watcher.onDidCreate(uri => scheduleReload(`Created: ${uri.fsPath}`));
			watcher.onDidDelete(uri => scheduleReload(`Deleted: ${uri.fsPath}`));
			watchers.push(watcher);
			context.subscriptions.push(watcher);
		}
	};

	loadActions();
	setupWatchers();

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_DIRECTORIES}`)) {
			output.appendLine('customActions.directories setting changed; reloading.');
			setupWatchers();
			loadActions();
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
		setupWatchers();
		loadActions();
	}));

	context.subscriptions.push(vscode.commands.registerCommand(RELOAD_COMMAND, () => loadActions()));

	context.subscriptions.push(vscode.commands.registerCommand(RUN_COMMAND, async () => {
		if (actionInfo.size === 0) {
			vscode.window.showInformationMessage('No custom actions loaded. Check the "Custom Actions" output channel, or add one under .vscode/custom-actions.');
			return;
		}

		const items = Array.from(actionInfo.entries()).map(([commandId, info]) => ({
			label: info.label,
			description: info.description,
			commandId
		}));

		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a custom action to run',
			matchOnDescription: true
		});

		if (picked) {
			await vscode.commands.executeCommand(picked.commandId);
		}
	}));

	const revealAndOpenEntry = async (entryPath: string) => {
		const entryUri = vscode.Uri.file(entryPath);
		await vscode.commands.executeCommand('revealInExplorer', entryUri);
		const doc = await vscode.workspace.openTextDocument(entryUri);
		await vscode.window.showTextDocument(doc);
	};

	context.subscriptions.push(vscode.commands.registerCommand(EDIT_COMMAND, async () => {
		if (actionInfo.size === 0) {
			vscode.window.showInformationMessage('No custom actions loaded. Check the "Custom Actions" output channel, or add one under .vscode/custom-actions.');
			return;
		}

		const items = Array.from(actionInfo.values()).map(info => ({
			label: info.label,
			description: info.description,
			actionDir: info.actionDir
		}));

		const picked = await vscode.window.showQuickPick(items, {
			placeHolder: 'Select a custom action to edit',
			matchOnDescription: true
		});

		if (picked) {
			await revealAndOpenEntry(path.join(picked.actionDir, ENTRY_FILE));
		}
	}));

	context.subscriptions.push(vscode.commands.registerCommand(NEW_COMMAND, async () => {
		const wsFolder = vscode.workspace.workspaceFolders?.[0];
		if (!wsFolder) {
			vscode.window.showErrorMessage('No workspace open; cannot create a custom action.');
			return;
		}

		const root = wsFolder.uri.fsPath;
		const configuredDirs = getConfiguredDirectories();

		let targetRelDir: string;
		if (configuredDirs.length === 1) {
			targetRelDir = configuredDirs[0];
		} else {
			const dirPick = await vscode.window.showQuickPick(configuredDirs, {
				placeHolder: 'Select a directory to create the new action in'
			});
			if (!dirPick) {
				return;
			}
			targetRelDir = dirPick;
		}

		const targetDir = path.join(root, targetRelDir);

		const actionName = await vscode.window.showInputBox({
			prompt: 'Enter a name for the new action (used as the folder name)',
			validateInput: value => {
				if (!value || !value.trim()) {
					return 'Name is required';
				}
				if (!VALID_NAME_PATTERN.test(value)) {
					return 'Only letters, numbers, hyphens, and underscores are allowed';
				}
				if (fs.existsSync(path.join(targetDir, value))) {
					return 'An action with this name already exists';
				}
				return undefined;
			}
		});

		if (!actionName) {
			return;
		}

		const description = await vscode.window.showInputBox({
			prompt: 'Enter a short description for this action',
			validateInput: value => (!value || !value.trim()) ? 'Description is required' : undefined
		});

		if (!description) {
			return;
		}

		const actionDir = path.join(targetDir, actionName);
		fs.mkdirSync(actionDir, { recursive: true });

		const meta: ActionMeta = { name: actionName, description };
		fs.writeFileSync(path.join(actionDir, META_FILE), JSON.stringify(meta, null, 2) + '\n', 'utf8');

		const entryTemplate = `module.exports = async function ({ vscode, workspaceRoot, actionDir, output }) {\n\t// TODO: implement "${actionName}"\n};\n`;
		fs.writeFileSync(path.join(actionDir, ENTRY_FILE), entryTemplate, 'utf8');

		output.appendLine(`Created new custom action "${actionName}" at ${actionDir}`);

		await revealAndOpenEntry(path.join(actionDir, ENTRY_FILE));
	}));
}

function readMeta(metaPath: string): ActionMeta {
	if (!fs.existsSync(metaPath)) {
		throw new Error(`${META_FILE} not found`);
	}

	let json: any;
	try {
		json = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
	} catch (err: any) {
		throw new Error(`invalid ${META_FILE}: ${err.message}`);
	}

	if (typeof json.description !== 'string' || json.description.trim() === '') {
		throw new Error(`${META_FILE} missing required string field "description"`);
	}

	return {
		name: typeof json.name === 'string' && json.name.trim() !== '' ? json.name : undefined,
		description: json.description,
		category: typeof json.category === 'string' && json.category.trim() !== '' ? json.category : undefined
	};
}

function registerCustomAction(
	actionName: string,
	actionDir: string,
	workspaceRoot: string,
	output: vscode.OutputChannel,
	context: vscode.ExtensionContext,
	registered: Map<string, vscode.Disposable>,
	actionInfo: Map<string, ActionInfo>
) {
	const meta = readMeta(path.join(actionDir, META_FILE));

	const entryPath = path.join(actionDir, ENTRY_FILE);
	if (!fs.existsSync(entryPath)) {
		throw new Error(`${ENTRY_FILE} not found`);
	}

	let entryModule: any;
	try {
		delete require.cache[require.resolve(entryPath)];
		entryModule = require(entryPath);
	} catch (err: any) {
		throw new Error(`failed to load ${ENTRY_FILE}: ${err?.message ?? err}`);
	}

	const run = typeof entryModule === 'function' ? entryModule
		: typeof entryModule?.run === 'function' ? entryModule.run
		: typeof entryModule?.default === 'function' ? entryModule.default
		: undefined;

	if (!run) {
		throw new Error(`${ENTRY_FILE} must export a function (module.exports = fn, module.exports.run, or module.exports.default)`);
	}

	const displayName = meta.name ?? actionName;
	const displayLabel = meta.category ? `${meta.category}: ${displayName}` : displayName;
	const commandId = `customActions.${actionName}`;

	const disposable = vscode.commands.registerCommand(commandId, async () => {
		output.appendLine(`Invoked custom action "${commandId}" (${displayLabel})`);

		const isTrusted = (vscode.workspace as any).isTrusted ?? true;
		if (!isTrusted) {
			vscode.window.showErrorMessage(`Workspace is untrusted; cannot run custom action "${displayLabel}"`);
			return;
		}

		try {
			await run({ vscode, workspaceRoot, actionDir, output });
		} catch (err: any) {
			output.appendLine(`Custom action "${actionName}" threw: ${err?.stack ?? err?.message ?? err}`);
			vscode.window.showErrorMessage(`Custom action "${displayLabel}" failed: ${err?.message ?? err}`);
		}
	});

	context.subscriptions.push(disposable);
	registered.set(commandId, disposable);
	actionInfo.set(commandId, { label: displayLabel, description: meta.description, actionDir });
	output.appendLine(`Registered custom action ${commandId} -> ${displayLabel}: ${meta.description}`);
}

export function deactivate() {}
