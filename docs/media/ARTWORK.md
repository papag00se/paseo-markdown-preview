# Artwork

Original hero illustration generated with OpenAI image generation for this repository.

## Prompt

Premium wide GitHub README hero: midnight ink, tactile cream Markdown document sheets, connected diagram and blue checkbox. Editorial 3D papercraft; no text or logos.

## Preview screenshots

`desktop-preview.png`, `compact-preview.png`, and `dark-preview.png` are Chromium captures of the actual Markdown Preview service. They show the [Atlas delivery brief](../showcase/README.md), a dedicated documentation fixture with illustrative release metrics, Mermaid, KaTeX, task checkboxes, and highlighted YAML. The original [latency chart](../showcase/delivery-latency.svg) is a local SVG image embedded by ordinary Markdown, not a UI mockup.

Regenerate from the repository root after installing dependencies:

```bash
node --import tsx scripts/capture-showcase.mts
```

Set `CHROMIUM_PATH` if Chromium is not at `/usr/bin/chromium`. An optional destination argument writes to a different directory:

```bash
node --import tsx scripts/capture-showcase.mts /tmp/markdown-showcase
```

The script opens a disposable copy of the fixture through `createPreviewService`, waits for Mermaid, images, and fonts, and captures the complete page with light wide (1440 px), light compact (680 px), and dark wide (1440 px) viewports. It verifies table data, persisted checkbox changes, the local image viewer, local Markdown navigation, theme application, and absence of browser errors. The fixture stays unchanged. Browser-journey test fixtures and their screenshots remain separate.
