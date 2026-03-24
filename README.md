<h1 align="center">slides-grab</h1>

<p align="center">Select context for agents directly from AI-generated HTML slides</p>

<p align="center">
How? Just drag an area in the slides and ask the agent to edit it.<br>
Simple things like text, size, or bold can still be edited manually, just like in the 2024 era.
</p>

<p align="center">
The whole slides are HTML & CSS, the programming langauge (which is not) that outperformed by AI agents.<br>
So the slides are beautiful, easily editable by AI agents, and can be converted to PDF or to experimental / unstable PPTX formats.
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
Read https://raw.githubusercontent.com/vkehfdl1/slides-grab/main/docs/installation/claude.md and follow every step.
```

**Codex:**

```
Read https://raw.githubusercontent.com/vkehfdl1/slides-grab/main/docs/installation/codex.md and follow every step.
```

Or clone manually:

```bash
git clone https://github.com/vkehfdl1/slides-grab.git && cd slides-grab
npm ci && npx playwright install chromium
```

> Requires **Node.js >= 18**.

### No-clone install

```bash
npm install slides-grab
npx playwright install chromium
npx skills add ./node_modules/slides-grab -g -a codex -a claude-code --yes --copy
```

## Why This Project?

There are many AI tools that generate slide HTML. Almost none let you **visually point at what you want changed** and iterate in-place. slides-grab fills that gap:

- **Plan** — Agent creates a structured slide outline from your topic/files
- **Design** — Agent generates each slide as a self-contained HTML file
- **Edit** — Browser-based editor with bbox selection, direct text editing, and agent-powered rewrites
- **Export** — One command to PDF, plus experimental / unstable PPTX or Figma-export flows

## CLI Commands

All commands support `--slides-dir <path>` (default: `slides`).

On a fresh clone, only `--help`, `list-templates`, `list-themes`, and `list-packs` work without a deck. `edit`, `build-viewer`, `validate`, `convert`, and `pdf` require an existing slides workspace containing `slide-*.html`.

```bash
slides-grab create              # Start creation mode — generate a new deck from scratch
slides-grab edit                # Launch visual slide editor
slides-grab browse              # Open deck browser to view and manage all decks
slides-grab import <md-file>    # Import markdown file into a presentation
slides-grab build-viewer        # Build single-file viewer.html
slides-grab validate            # Validate slide HTML (Playwright-based)
slides-grab convert             # Export to experimental / unstable PPTX
slides-grab convert --resolution 2160p  # Higher-resolution raster PPTX export
slides-grab figma               # Export an experimental / unstable Figma Slides importable PPTX
slides-grab pdf                 # Export PDF in capture mode (default)
slides-grab pdf --resolution 2160p  # Higher-resolution image-backed PDF export
slides-grab pdf --mode print    # Export searchable/selectable text PDF
slides-grab svg                 # Export to SVG
slides-grab list-templates      # Show available slide templates
slides-grab list-themes         # Show available color themes
slides-grab list-packs          # Show available template packs
slides-grab show-pack <id>      # Show details of a specific pack
```

### Create Mode

Generate a full presentation from a topic, without writing any HTML yourself.

```bash
slides-grab create                                # Interactive — enter topic in browser
slides-grab create --deck-name my-deck            # Pre-set the deck folder name
slides-grab create --deck-name my-deck --port 4000  # Use a custom port
```

**Workflow:**

1. Run `slides-grab create` — the editor opens in **creation mode**
2. Enter your **topic** and optional requirements, pick a slide count and model
3. AI generates an **outline** — review it in editable cards
4. **Revise** individual slides or the whole outline with feedback, or **Approve & Generate**
5. Once generated, the editor switches to normal edit mode with your new slides

### Import Markdown

Convert an existing markdown file into a presentation:

```bash
slides-grab import docs/content.md --deck-name my-deck
slides-grab import docs/content.md --slide-count "25~30" --research
```

### Deck Browser

View, rename, duplicate, and delete all your decks in a browser UI:

```bash
slides-grab browse
slides-grab browse --port 4000
```

### Template Packs

Packs provide different visual themes for your slides. Default pack is `simple_light`.

```bash
slides-grab list-packs              # List all packs with colors and template counts
slides-grab show-pack midnight      # Show pack details and templates
slides-grab show-template cover --pack midnight  # View a template from a specific pack
```

## Image Contract

Slides should store local image files in `<slides-dir>/assets/` and reference them as `./assets/<file>` from each `slide-XX.html`.

- Preferred: `<img src="./assets/example.png" alt="...">`
- Allowed: `data:` URLs for fully self-contained slides
- Allowed with warnings: remote `https://` images
- Unsupported: absolute filesystem paths such as `/Users/...` or `C:\...`

Run `slides-grab validate --slides-dir <path>` before export to catch missing local assets and discouraged path forms.

`slides-grab pdf` now defaults to `--mode capture`, which rasterizes each rendered slide into the PDF for better visual fidelity. Use `--mode print` when searchable/selectable browser text matters more than pixel-perfect parity.

`slides-grab pdf` and `slides-grab convert` now default to `2160p` / `4k` raster output for sharper exports. You can still override with `--resolution <preset>` using `720p`, `1080p`, `1440p`, `2160p`, or `4k` when you want smaller or faster artifacts.

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

> **Warning:** `slides-grab convert` and `slides-grab figma` are currently **experimental / unstable**. Expect best-effort output, layout shifts, and manual cleanup in PowerPoint or Figma.

### Figma Workflow

```bash
slides-grab figma --slides-dir decks/my-deck --output decks/my-deck-figma.pptx
```

This command reuses the HTML to PPTX pipeline and emits a `.pptx` deck intended for manual import into Figma Slides via `Import`. It does not upload to Figma directly. The Figma export path is **experimental / unstable** and should be treated as best-effort only.

### npm Scripts (Shortcuts)

If you cloned the repo, you can use shorter `npm run` aliases:

```bash
npm run edit   -- --slides-dir decks/my-deck          # Launch editor
npm run create -- --deck-name my-deck                  # Create new deck
npm run pdf    -- --slides-dir decks/my-deck --output out.pdf  # Export PDF
npm run pptx   -- --slides-dir decks/my-deck --output out.pptx # Export PPTX
```

## Installation Guides

- [Claude detailed guide](docs/installation/claude.md)
- [Codex detailed guide](docs/installation/codex.md)

## npm Package

Also available as an npm package for standalone CLI + skill usage:

```bash
npm install slides-grab
```

Install shared agent skills with Vercel Agent Skills:

```bash
npx skills add ./node_modules/slides-grab -g -a codex -a claude-code --yes --copy
```

This npm-install path is enough for normal usage. Clone the repo only when you want to modify or contribute to `slides-grab` itself.

## Project Structure

```
bin/              CLI entry point
src/editor/       Visual editor (HTML + JS client modules)
scripts/          Build, validate, convert, editor server
packs/            Template packs (simple_light, midnight, corporate, creative)
decks/            Your presentation decks (one folder per deck)
skills/           Shared agent skills + references
.claude/skills/   Claude Code skill definitions
docs/             Installation & usage guides
```

## License

[MIT](LICENSE)


## Acknowledgment

This project is built based on the [ppt_team_agent](https://github.com/uxjoseph/ppt_team_agent) by Builder Josh. Huge thanks to him!
