<h1 align="center">slides-grab</h1>

<p align="center">Select context for agents directly from AI-generated HTML slides</p>

<p align="center">
How? Just drag an area in the slides and ask the agent to edit it.<br>
Simple things like text, size, or bold can still be edited manually, just like in the 2024 era.
</p>

<p align="center">
The whole slides are HTML & CSS, the programming langauge (which is not) that outperformed by AI agents.<br>
So the slides are beautiful, easily editable by AI agents, and can be converted to pdf and pptx.
</p>

<p align="center">
The editor is pure javascript file. You can easily add up new features like adding new coding agents, changing designs, etc.
</p>

<p align="center">
  <a href="https://github.com/vkehfdl1/slides-grab/releases/download/v0.0.1-demo/demo.mp4">
    <img src="docs/assets/demo.gif" alt="slides-grab demo" width="720">
  </a>
</p>

---

## Quick Start

Paste one of these into your coding agent:

**Claude Code:**

```
Read https://raw.githubusercontent.com/vkehfdl1/slides-grab/main/docs/prompts/setup-claude.md and follow every step.
```

**Codex:**

```
Read https://raw.githubusercontent.com/vkehfdl1/slides-grab/main/docs/prompts/setup-codex.md and follow every step.
```

Or clone manually:

```bash
git clone https://github.com/vkehfdl1/slides-grab.git && cd slides-grab
npm ci && npx playwright install chromium
```

> Requires **Node.js >= 18**.

## Why This Project?

There are many AI tools that generate slide HTML. Almost none let you **visually point at what you want changed** and iterate in-place. slides-grab fills that gap:

- **Plan** — Agent creates a structured slide outline from your topic/files
- **Design** — Agent generates each slide as a self-contained HTML file
- **Edit** — Browser-based editor with bbox selection, direct text editing, and agent-powered rewrites
- **Export** — One command to PPTX or PDF

## CLI Commands

All commands support `--slides-dir <path>` (default: `slides`).

On a fresh clone, only `--help`, `list-templates`, and `list-themes` work without a deck. `edit`, `build-viewer`, `validate`, `convert`, and `pdf` require an existing slides workspace containing `slide-*.html`.

```bash
slides-grab edit              # Launch visual slide editor
slides-grab build-viewer      # Build single-file viewer.html
slides-grab validate          # Validate slide HTML (Playwright-based)
slides-grab convert           # Export to PPTX
slides-grab figma             # Export a Figma Slides importable PPTX
slides-grab pdf               # Export PDF in capture mode (default)
slides-grab pdf --mode print  # Export searchable/selectable text PDF
slides-grab list-templates    # Show available slide templates
slides-grab list-themes       # Show available color themes
```

`slides-grab pdf` now defaults to `--mode capture`, which rasterizes each rendered slide into the PDF for better visual fidelity. Use `--mode print` when searchable/selectable browser text matters more than pixel-perfect parity.

### Multi-Deck Workflow

Prerequisite: create or generate a deck in `decks/my-deck/` first.

```bash
slides-grab edit       --slides-dir decks/my-deck
slides-grab validate   --slides-dir decks/my-deck
slides-grab pdf        --slides-dir decks/my-deck --output decks/my-deck.pdf
slides-grab pdf        --slides-dir decks/my-deck --mode print --output decks/my-deck-searchable.pdf
slides-grab convert    --slides-dir decks/my-deck --output decks/my-deck.pptx
slides-grab figma      --slides-dir decks/my-deck --output decks/my-deck-figma.pptx
```

### Figma Workflow

```bash
slides-grab figma --slides-dir decks/my-deck --output decks/my-deck-figma.pptx
```

This command reuses the HTML to PPTX pipeline and emits a `.pptx` deck intended for manual import into Figma Slides via `Import`. It does not upload to Figma directly.

## Installation Guides

- [Claude Code setup](docs/prompts/setup-claude.md)
- [Codex setup](docs/prompts/setup-codex.md)
- [Claude detailed guide](docs/installation/claude.md)
- [Codex detailed guide](docs/installation/codex.md)

## npm Package

Also available as an npm package for standalone CLI usage:

```bash
npm install slides-grab
```

## Project Structure

```
bin/              CLI entry point
src/editor/       Visual editor (HTML + JS client modules)
scripts/          Build, validate, convert, editor server
templates/        Slide HTML templates (cover, content, chart, ...)
themes/           Color themes (modern-dark, executive, sage, ...)
.claude/skills/   Claude Code skill definitions
skills/           Codex skill definitions
docs/             Installation & usage guides
```

## License

[MIT](LICENSE)


## Acknowledgment

This project is built based on the [ppt_team_agent](https://github.com/uxjoseph/ppt_team_agent) by Builder Josh. Huge thanks to him!
