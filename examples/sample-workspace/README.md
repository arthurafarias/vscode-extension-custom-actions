# Sample workspace

A workspace for trying out the Custom Actions extension.

## Try it

1. Open this folder (`examples/sample-workspace`) in VS Code.
2. Press `F5` from the extension's repo root with this folder set as the debug workspace (or run `code --extensionDevelopmentPath=<repo-root> examples/sample-workspace` from the repo root), to launch an Extension Development Host with this folder open.
3. On startup you should see a warning notification: `1 custom action(s) failed to load: broken-example (...)`. That's [.vscode/custom-actions/broken-example](.vscode/custom-actions/broken-example) — it throws on purpose so you can see the failure-reporting path. Delete that folder (or fix its `entry.js`) and run `Custom Actions: Reload` to see it disappear from the failure list.
4. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run `Custom Actions: Run...`. Pick one from the list:
   - `Demo: Say Hello` — writes to the `Custom Actions` output channel and shows an information message.
   - `Demo: Insert Timestamp` — inserts an ISO timestamp at the cursor (open any file first).
   - `Demo: Count Workspace Files` — loaded from `tools/actions` instead of `.vscode/custom-actions`, enabled via the `customActions.directories` setting in [.vscode/settings.json](.vscode/settings.json).

## Layout

```
.vscode/
  settings.json                        # customActions.directories = [.vscode/custom-actions, tools/actions]
  custom-actions/
    say-hello/{meta.json,entry.js}
    insert-timestamp/{meta.json,entry.js}
    broken-example/{meta.json,entry.js} # intentionally broken, demonstrates failure notifications
tools/
  actions/
    count-workspace-files/{meta.json,entry.js}  # loaded via the extra configured directory
```

Edit any `meta.json` or `entry.js`, save, and the extension reloads automatically — check the `Custom Actions` output channel for load logs.
