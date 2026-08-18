# vscode-extension-custom-actions

A VS Code extension that lets a workspace define its own Command Palette actions as plain JavaScript files, no extension packaging required.

## How it works

Drop a folder per action under `.vscode/custom-actions/`:

```
.vscode/custom-actions/
  say-hello/
    meta.json
    entry.js
```

`meta.json`:

```json
{
  "name": "Say Hello",
  "description": "Prints a greeting to the output channel.",
  "category": "Demo"
}
```

- `description` (required) — shown in the output channel when the action is registered.
- `name` (optional) — display name; defaults to the folder name.
- `category` (optional) — prefixed to the name, e.g. `Demo: Say Hello`.

`entry.js` must export a function (`module.exports = fn`, `module.exports.run`, or `module.exports.default`). It's called with a context object when the action is invoked:

```js
module.exports = async function ({ vscode, workspaceRoot, actionDir, output }) {
  output.appendLine(`Hello from ${workspaceRoot}`);
  vscode.window.showInformationMessage('Hello!');
};
```

- `vscode` — the VS Code API.
- `workspaceRoot` — absolute path to the workspace folder.
- `actionDir` — absolute path to the action's own folder.
- `output` — the extension's `Custom Actions` output channel.

Each action is registered as the command `customActions.<folder-name>`. VS Code's Command Palette only lists commands declared statically in an extension's `package.json`, so per-action commands (unknown until the directories are scanned) don't appear there directly — run `Custom Actions: Run...` instead, which opens a Quick Pick of every currently loaded action. The underlying `customActions.<folder-name>` command IDs still work for keybindings or `vscode.commands.executeCommand` from other extensions.

The extension watches the custom-actions directories and reloads automatically whenever a `meta.json`/`entry.js` is added, changed, or removed. If an action fails to load (invalid JSON, missing fields, a script that throws on load, a script that doesn't export a function, or a duplicate action name), it's skipped, and a warning notification lists which actions failed and why (full details go to the `Custom Actions` output channel). You can also trigger a manual reload with the `Custom Actions: Reload` command.

Workspace trust is required to run actions; in an untrusted workspace, invoking an action shows an error instead of executing.

### Scanning additional directories

By default only `.vscode/custom-actions` is scanned. To scan other (or additional) workspace-relative directories, set `customActions.directories` in workspace settings:

```json
{
  "customActions.directories": [
    ".vscode/custom-actions",
    "tools/actions"
  ]
}
```

Action names must be unique across all configured directories; duplicates are reported as load failures.

## Example

[examples/sample-workspace](examples/sample-workspace) is a ready-to-open workspace with a couple of working actions, a second configured actions directory, and one intentionally broken action so you can see the load-failure notification. See its [README](examples/sample-workspace/README.md) for how to launch it.

## What's included

- TypeScript build via `tsc` (`npm run compile` / `npm run watch`)
- ESLint config for `src/`
- Test scaffold using `@vscode/test-cli` / `@vscode/test-electron` ([src/test/extension.test.ts](src/test/extension.test.ts))
- GitHub Actions workflows: `test.yml` (runs on push/PR) and `release.yml` (packages a `.vsix` on tag push)
- `vsce package` / `vsce publish` scripts

## Getting started

1. Install dependencies:
   ```sh
   npm install
   ```
2. Press `F5` in VS Code to launch an Extension Development Host, or run:
   ```sh
   npm run watch
   ```
3. Run tests:
   ```sh
   npm test
   ```

## Packaging

```sh
npm run package        # produces a .vsix
npm run package:minor  # bump minor version and package
npm run package:major  # bump major version and package
```

## Releasing

Push a tag matching `v*.*.*` to trigger the `release.yml` workflow, which packages the extension and attaches the `.vsix` to a GitHub release.
