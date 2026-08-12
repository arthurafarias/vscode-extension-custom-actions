# vscode-extension-scaffold

A minimal starting point for building a new VS Code extension in TypeScript.

## What's included

- TypeScript build via `tsc` (`npm run compile` / `npm run watch`)
- ESLint config for `src/`
- A single sample command (`vscode-extension-scaffold.helloWorld`) wired up in [src/extension.ts](src/extension.ts)
- Test scaffold using `@vscode/test-cli` / `@vscode/test-electron` ([src/test/extension.test.ts](src/test/extension.test.ts))
- `.vscode/launch.json` + `tasks.json` for F5 debugging
- GitHub Actions workflows: `test.yml` (runs on push/PR) and `release.yml` (packages a `.vsix` on tag push)
- `vsce package` / `vsce publish` scripts

## Getting started

1. Rename the extension: update `name`, `displayName`, `publisher`, and `repository.url` in [package.json](package.json), and rename the command id(s) to match (`vscode-extension-scaffold.*` → `yourExtension.*`) in both `package.json` and `src/extension.ts`.
2. Install dependencies:
   ```sh
   npm install
   ```
3. Press `F5` in VS Code to launch an Extension Development Host, or run:
   ```sh
   npm run watch
   ```
4. Run tests:
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
