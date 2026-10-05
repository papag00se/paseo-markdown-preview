<div align="center">

![Paseo Markdown Preview — illustrated project cover](docs/media/hero.png)

# Paseo Markdown Preview

![Paseo compatibility](https://img.shields.io/badge/Paseo-0.9.1-22c55e?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Desktop%20%26%20web-64748b?style=flat-square)

[Features](#features) · [Getting started](#getting-started) · [Compatibility](#compatibility) · [Reference](docs/REFERENCE.md)

</div>

Read Markdown as a document, with diagrams, math, images, and task checkboxes that save back to the file. This plugin brings the Crossnote renderer behind Markdown Preview Enhanced into a Paseo workspace tab.

## Features

| Feature | What you get |
| --- | --- |
| Preview-only tab | One document view, with a file selector and source toggle |
| Interactive tasks | Checkboxes save to the original file; stale edits are rejected |
| Rich Markdown | Tables, highlighted code, KaTeX math, and Mermaid diagrams |
| Local navigation | Follow Markdown links and enlarge workspace images |
| Live updates | Changes to the selected source file appear automatically |
| Light and dark | Rendering follows the Paseo panel theme where available |

![A real browser test showing Markdown, a saved checkbox, a table, math, and a Mermaid diagram](docs/media/desktop-preview.png)

<details>
<summary>Compact layout and dark theme</summary>

![Compact preview](docs/media/compact-preview.png)

![Dark preview](docs/media/dark-preview.png)

</details>

## How it fits

```mermaid
flowchart LR
    A[Workspace Markdown file] --> B[Crossnote on the daemon host]
    B --> C[Preview workspace tab]
    C -->|Save a checkbox| A
```

## Getting started

Requires Node.js, npm, Paseo 0.9.1, and plugins enabled on the target daemon. Clone the repository and install it as a directory:

```bash
git clone https://github.com/papag00se/paseo-markdown-preview.git
cd paseo-markdown-preview
npm ci --legacy-peer-deps
npm run typecheck
paseo plugin install "$PWD"
```

In a workspace, open **Command Center → Open Markdown Preview**, then choose a file. There is no need to open the source editor.

## Compatibility

Desktop/web clients must run on the daemon machine: the renderer uses a loopback-only service. Native mobile and remote clients are not supported by this renderer. Ordinary Explorer clicks still use Paseo's built-in preview; default-preview and right-click integration need a Paseo fork change and are not part of this release.

This version supports **directory installation**. Crossnote's assets and native dependencies require a generated local dependency path; run `npm run prepare` after moving the checkout. Direct Git/npm acquisition is not supported yet.

## Development

```bash
npm run typecheck
npm test
npm run preview -- /absolute/path/to/workspace
```

The five tests cover the browser journey, actual Crossnote rendering, task persistence, UTF-8/BOM/CRLF preservation, stale revisions, and workspace confinement. Browser tests use `/usr/bin/chromium` or `CHROMIUM_PATH`.

[Rendering limits and implementation notes →](docs/REFERENCE.md)
