# Claude Setup And Usage

This guide is for running `slides-grab` with Claude Code and shared Vercel-installed skills.

## 1) Install the npm Package

```bash
npm install slides-grab
npx playwright install chromium
```

Verify:

```bash
slides-grab --help
```

## 2) Install Claude Code Skills

From the local npm install:

```bash
npx skills add ./node_modules/slides-grab -g -a claude-code --yes --copy
```

Then restart Claude Code so the shared skills are loaded.

## 3) Developer / Repo Clone Path

If you want to work on `slides-grab` itself:

```bash
git clone https://github.com/vkehfdl1/slides-grab.git && cd slides-grab
npm ci
npx playwright install chromium
npx skills add . -g -a claude-code --yes --copy
```

Installed skill names:

- `slides-grab-plan`
- `slides-grab-design`
- `slides-grab-export`
- `slides-grab`

## 4) Run Commands During Workflow

Use one workspace folder per deck:

Prerequisite: create or generate `decks/my-deck/` with `slide-*.html` first. These commands do not work against an empty clone.

```bash
slides-grab edit --slides-dir decks/my-deck
slides-grab build-viewer --slides-dir decks/my-deck
slides-grab validate --slides-dir decks/my-deck
slides-grab image --slides-dir decks/my-deck --prompt "Editorial hero image for slide 03"
slides-grab pdf --slides-dir decks/my-deck --output decks/my-deck.pdf
slides-grab pdf --slides-dir decks/my-deck --mode print --output decks/my-deck-searchable.pdf
slides-grab convert --slides-dir decks/my-deck --output decks/my-deck.pptx
slides-grab figma --slides-dir decks/my-deck --output decks/my-deck-figma.pptx
```

> `slides-grab convert` and `slides-grab figma` are **experimental / unstable**. Treat their output as best-effort and expect manual cleanup in PowerPoint or Figma.

`slides-grab pdf` defaults to `--mode capture` for visual fidelity. Use `--mode print` when searchable/selectable text is more important than pixel-perfect browser parity.

When a slide needs bespoke generated imagery, use `slides-grab image --prompt "..." --slides-dir <path>` with `GOOGLE_API_KEY` (or `GEMINI_API_KEY`) set. If no key is available, ask for one or fall back to web search + local download into `assets/`.

## 5) Recommended Claude Kickoff Prompt

Copy-paste into Claude:

```text
Read docs/installation/claude.md first and follow it exactly. Install slides-grab with npm, install the shared skills from ./node_modules/slides-grab using Vercel Agent Skills, use slides-grab-plan/design/export (or slides-grab), keep each deck in decks/<deck-name>, and run validate before conversion.
```
