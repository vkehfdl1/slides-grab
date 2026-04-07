`npx slides-grab browse`
---
<h1 align="center">slides-grab</h1>

<p align="center">Select context for agents directly from AI-generated HTML slides</p>

<p align="center">
How? Just drag an area in the slides and ask the agent to edit it.<br>
Simple things like text, size, or bold can still be edited manually, just like in the 2024 era.
</p>

<p align="center">
The whole slides are HTML & CSS, the programming language (which is not) that outperformed by AI agents.<br>
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
- **Export** — One command to PDF, plus experimental / unstable PPTX and SVG

## CLI Commands

Most export/edit commands support `--slides-dir <path>` (default: `slides`). Deck-management commands use `--deck <name>` instead.

On a fresh clone, only `--help`, `list-templates`, `list-themes`, and `list-packs` work without a deck. `edit`, `build-viewer`, `validate`, `convert`, and `pdf` require an existing slides workspace containing `slide-*.html`.

**Creation & Editing:**

```bash
slides-grab create              # Start creation mode — generate a new deck from scratch
slides-grab edit                # Launch visual slide editor
slides-grab browse              # Open deck browser to view and manage all decks
slides-grab import <source>     # Import markdown, PDF, or URL into a presentation
```

**Export:**

```bash
slides-grab pdf                 # Export to PDF
slides-grab convert             # Export to experimental / unstable PPTX
slides-grab svg                 # Export to SVG (or PNG with --format png)
slides-grab build-viewer        # Build single-file viewer.html
```

**Analysis & Transformation:**

```bash
slides-grab review --deck <name>                     # Analyze deck quality & generate report
slides-grab retheme --deck <name> --pack <id>        # Redesign deck with a different pack
slides-grab split --input <file>                     # Split multi-slide HTML into individual files
slides-grab validate                                 # Validate slide HTML (Playwright-based)
```

**Template Packs:**

```bash
slides-grab list-packs                               # List all 37+ packs with colors & template counts
slides-grab show-pack <id>                           # Show pack details and templates
slides-grab show-template <name> --pack <id>         # View a template from a specific pack
slides-grab show-theme <id>                          # Show pack's theme.css
slides-grab pack init <name>                         # Scaffold a new custom pack
slides-grab pack list                                # Alias for list-packs
```

**Logo & Utilities:**

```bash
slides-grab logo set --slides-dir <path> --image <path>   # Set deck logo overlay
slides-grab logo show --slides-dir <path>                  # Show current logo config
slides-grab logo remove --slides-dir <path>                # Remove logo config
slides-grab list-templates                                 # Show available slide templates
slides-grab list-themes                                    # Show available color themes
slides-grab install-codex-skills                           # Install Codex skills to ~/.codex/skills
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

### Import

Convert an existing document (markdown, PDF, or URL) into a presentation:

```bash
slides-grab import docs/content.md --deck-name my-deck
slides-grab import report.pdf --deck-name from-pdf
slides-grab import https://example.com/article --deck-name from-web --research
slides-grab import docs/content.md --slide-count "25~30" --research
```

Options: `--deck-name`, `--slide-count`, `--research`, `--pack`, `--port`.

### Deck Browser

View, rename, duplicate, and delete all your decks in a browser UI:

```bash
slides-grab browse
slides-grab browse --port 4000
```

### Review

Analyze a presentation deck and generate a quality report:

```bash
slides-grab review --deck my-deck
slides-grab review --deck my-deck --audience investors --time 20
```

Options: `--deck` (required), `--audience`, `--time` (default: 15 minutes).

### Retheme

Re-generate a deck with a different template pack (one-click redesign):

```bash
slides-grab retheme --deck my-deck --pack aurora-gradient
slides-grab retheme --deck my-deck --pack swiss-international --save-as my-deck-swiss
```

Options: `--deck` (required), `--pack` (required), `--save-as`, `--model`.

### Split

Split a multi-slide HTML file into individual `slide-*.html` files:

```bash
slides-grab split --input combined.html --slides-dir decks/my-deck
```

Options: `--input` (required), `--slides-dir`, `--selector` (default: `.slide`), `--source-width`, `--source-height`, `--no-scale`.

### Template Packs

Packs provide different visual themes for your slides. 37+ packs available, including `simple_light`, `dark-wave`, `aurora-gradient`, `glassmorphism`, `neo-brutalism`, `swiss-international`, and more. Default pack is `simple_light`.

```bash
slides-grab list-packs                               # List all packs with colors and template counts
slides-grab show-pack dark-wave                      # Show pack details and templates
slides-grab show-template cover --pack dark-wave     # View a template from a specific pack
slides-grab pack init my-custom-pack                 # Scaffold a new custom pack
```

### Logo Management

Configure a persistent logo overlay for a deck. Logo config is stored in `deck.json`. Export commands (`pdf`, `convert`) also accept one-off `--logo` flags.

```bash
slides-grab logo set --slides-dir decks/my-deck --image assets/logo.png
slides-grab logo set --slides-dir decks/my-deck --image assets/logo.png --position bottom-left --exclude 1,15
slides-grab logo show --slides-dir decks/my-deck
slides-grab logo remove --slides-dir decks/my-deck
```

Options for `logo set`: `--slides-dir` (required), `--image` (required), `--position` (top-right, top-left, bottom-right, bottom-left; default: top-right), `--width`, `--height`, `--x`, `--y`, `--exclude`.

## Image Contract

Slides should store local image files in `<slides-dir>/assets/` and reference them as `./assets/<file>` from each `slide-XX.html`.

- Preferred: `<img src="./assets/example.png" alt="...">`
- Allowed: `data:` URLs for fully self-contained slides
- Allowed with warnings: remote `https://` images
- Unsupported: absolute filesystem paths such as `/Users/...` or `C:\...`

Run `slides-grab validate --slides-dir <path>` before export to catch missing local assets and discouraged path forms.

> PDF export internally uses capture mode with high-resolution rasterization for visual fidelity. For advanced control (`--mode`, `--resolution`), invoke `node scripts/html2pdf.js` directly.

### Multi-Deck Workflow

Prerequisite: create or generate a deck in `decks/my-deck/` first.

```bash
slides-grab edit       --slides-dir decks/my-deck
slides-grab validate   --slides-dir decks/my-deck
slides-grab pdf        --slides-dir decks/my-deck --output decks/my-deck.pdf
slides-grab convert    --slides-dir decks/my-deck --output decks/my-deck.pptx
slides-grab svg        --slides-dir decks/my-deck --output decks/my-deck-svg
slides-grab review     --deck my-deck --audience investors
slides-grab retheme    --deck my-deck --pack dark-wave --save-as my-deck-dark
```

> **Warning:** `slides-grab convert` is currently **experimental / unstable**. Expect best-effort output, layout shifts, and manual cleanup in PowerPoint.

### npm Scripts (Shortcuts)

If you cloned the repo, you can use shorter `npm run` aliases:

```bash
npm run edit   -- --slides-dir decks/my-deck          # Launch editor
npm run create -- --deck-name my-deck                  # Create new deck
npm run pdf    -- --slides-dir decks/my-deck --output out.pdf   # Export PDF
npm run pptx   -- --slides-dir decks/my-deck --output out.pptx  # Export PPTX
npm run svg    -- --slides-dir decks/my-deck --output out/       # Export SVG
npm run split  -- --input combined.html                          # Split HTML
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
bin/              CLI entry point (ppt-agent.js)
src/              Core modules (resolve, logo, pack-init, retheme, review, etc.)
  editor/         Visual editor client (HTML + JS modules)
scripts/          Build, validate, convert, editor server, review, retheme
packs/            37+ template packs (simple_light, dark-wave, aurora-gradient, glassmorphism, etc.)
decks/            Your presentation decks (one folder per deck)
skills/           Shared agent skills (Codex)
.claude/skills/   Claude Code skill definitions (plan, design, pptx, presentation)
plugins/          Figma plugin (slides-to-figma)
docs/             Installation guides, prompts, power-user docs
tests/            Test suites (editor, pdf, svg, pptx, pack, validation)
```

## License

[MIT](LICENSE)


## Acknowledgment

This project is built based on the [ppt_team_agent](https://github.com/uxjoseph/ppt_team_agent) by Builder Josh. Huge thanks to him!
