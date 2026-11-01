# Markdown Preview for Paseo

The Crossnote 0.9.31 renderer used by our VS Code Markdown Preview Enhanced setup,
adapted to a Paseo workspace plugin. Open **Command Center → Open Markdown Preview**,
then choose a Markdown file from the dropdown. The plugin opens one preview tab;
it does not open an editor or split the workspace.

Task checkboxes save directly to the source file. The preview refreshes when the
file changes, and stale checkbox edits are rejected rather than overwriting newer
contents. Tables, highlighted code, KaTeX math, Mermaid diagrams, local images,
image enlargement, local Markdown links, and a source/preview toggle are included.

## Supported installation

This version supports **directory installation**, on Paseo 0.14.x desktop/web on
the same machine as the daemon. Native mobile and remote clients receive a
platform/host explanation; the HTML renderer uses a loopback listener and is
not exposed to the LAN or relay.

```bash
git clone https://github.com/papag00se/paseo-markdown-preview.git
cd paseo-markdown-preview
npm ci --legacy-peer-deps
npm run typecheck
npm test
paseo plugin install "$PWD"
```

Targets Paseo 0.14.x with the SDK pinned to 0.14.0 for typechecking (all 19 regressions pass);
earlier validation was on a Paseo 0.11.2 daemon. The plugin reported `running` after hot reload; its live
RPC opened a preview and rendered this README successfully. Backend and browser regressions cover workspace and external-file previews. The daemon does not need restarting for a plugin upgrade.
The preview listener starts on demand and is closed by plugin cleanup.

If you move this directory, run `npm run prepare` before loading/reloading the plugin.
Preparation records the local dependency location because Paseo's server bundler
does not preserve Crossnote's original module directory. Git/npm distribution
needs a relocatable asset/dependency contract before it can be supported.

## Development

```bash
npm run preview -- /absolute/path/to/workspace
```

Open the printed URL in a browser. Stop with Ctrl+C. The standalone runner and
tests use isolated listeners and never change the production daemon.

The browser test uses `/usr/bin/chromium`; set `CHROMIUM_PATH` to another installed
Chromium executable. It tests the real DOM bridge inside a React Native Web View,
then follows the visible file-preview journey. Screenshots land in `test-results/`.
Backend tests exercise the actual renderer, source mapping, UTF-8/CRLF task writes,
stale revisions, workspace confinement, and edit-origin checks.

## Current limits

- In Jesse's Paseo fork, the desktop app's built-in Markdown file tab uses this renderer for its **Preview** view whenever this plugin is installed; **Source** stays Paseo's editor. The workspace-wide picker remains available through Command Center.
- The Markdown file list is capped at 2,000 files/20,000 entries and skips hidden,
  dependency, and vendor directories. Preview files are limited to 2 MiB.
- MDX is rendered as Markdown; JSX is not executed. Repository `.crossnote` config
  and parser hooks, embedded scripts, and executable code chunks are disabled.
- Remote imports and advanced external diagram engines are not validated. Basic
  Mermaid and KaTeX use installed local assets.
- Live refresh tracks the selected source file. Changes in imported documents
  require an explicit refresh; full VS Code editing and export commands are not ported.
- Task edits are serialized within the plugin and recheck the full file revision
  immediately before writing one byte. An external writer racing that final write
  remains outside the plugin's synchronization.

The renderer remains the upstream Crossnote package. This plugin ports the
preview-only layout and file-saving checkbox behavior from a local Markdown
Preview Enhanced setup without modifying the original VS Code extensions.

## File tab contract

For files inside the workspace, the Paseo fork calls `preview.open` with `workspaceId`, `filePath`, and `embedded: true`. Workspace traversal and escaping symlinks remain rejected.

A Markdown file tab outside its workspace calls `preview.file.open` with the file's absolute `filePath`; no workspace registration is required. The returned `filePath` is the selected filename used in the preview URL. This creates a single-document grant, not a workspace rooted at the file's parent directory. Only that resolved Markdown document can be listed, rendered, read, or edited. Local images must stay inside its resolved parent directory (including subdirectories); escaping image symlinks are rejected. Other documents cannot be imported. PDF imports require a workspace preview because Crossnote's converter bypasses its filesystem adapter. Existing size, origin, revision, script/config, and session-lifetime restrictions still apply.

Embedded previews hide the picker and post local Markdown link clicks as absolute host paths to the parent page. In a file tab, the fork's Preview opens the clicked file in a Paseo tab. A click never expands the current session's grant. Relative images and links resolve beside the canonical document, including when the opened path is a symlink. `preview.close` releases the session when the view unmounts. The panel displays the actual failure with a Retry action.

Workspace panels own their preview sessions: closing a panel calls `preview.close`; reopening always allocates a fresh URL. Mounted panels renew after seven hours, before the host’s eight-hour expiry. They recheck that deadline when the page becomes visible or resumes focus, so suspended browser timers do not leave an expired URL cached. Failed opens or renewals expose Retry, which releases any previous session and starts again. Theme changes only remount the iframe and preserve the current session.
