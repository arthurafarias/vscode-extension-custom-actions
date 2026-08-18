import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const CONFIG_SECTION = 'customActions';
const CONFIG_DIRECTORIES = 'directories';
const DEFAULT_ACTIONS_DIR = '.vscode/custom-actions';
const RELOAD_COMMAND = 'customActions.reload';
const RUN_COMMAND = 'customActions.run';
const META_FILE = 'meta.json';
const ENTRY_FILE = 'entry.js';

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
	actionInfo.set(commandId, { label: displayLabel, description: meta.description });
	output.appendLine(`Registered custom action ${commandId} -> ${displayLabel}: ${meta.description}`);
}

export function deactivate() {}
