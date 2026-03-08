# slides-grab

Agent-first presentation framework for **Claude Code** and **Codex**.

AI agents plan your slide outline, generate production-ready HTML slides, and export to PPTX/PDF — but the real differentiator is the **visual editor**: open it in your browser, draw bounding boxes on any element, type a prompt, and the agent rewrites only that region. No more re-generating the entire deck for a one-word fix.

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

Or install manually:

```bash
npm install slides-grab && npx playwright install chromium
npx slides-grab --help
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

```bash
slides-grab edit              # Launch visual slide editor
slides-grab build-viewer      # Build single-file viewer.html
slides-grab validate          # Validate slide HTML (Playwright-based)
slides-grab convert           # Export to PPTX
slides-grab pdf               # Export to PDF
slides-grab list-templates    # Show available slide templates
slides-grab list-themes       # Show available color themes
```

### Multi-Deck Workflow

```bash
slides-grab edit       --slides-dir decks/my-deck
slides-grab validate   --slides-dir decks/my-deck
slides-grab pdf        --slides-dir decks/my-deck --output decks/my-deck.pdf
slides-grab convert    --slides-dir decks/my-deck --output decks/my-deck.pptx
```

## Installation Guides

- [Claude Code setup](docs/prompts/setup-claude.md)
- [Codex setup](docs/prompts/setup-codex.md)
- [Claude detailed guide](docs/installation/claude.md)
- [Codex detailed guide](docs/installation/codex.md)

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
