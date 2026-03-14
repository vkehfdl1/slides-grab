# Gemini Setup And Usage

This guide is for running `slides-grab` with Gemini-based workflow files under `.gemini/skills/`.

## 1) Clone and Install

```bash
git clone https://github.com/vkehfdl1/slides-grab.git && cd slides-grab
npm ci && npx playwright install chromium
```

Verify:

```bash
npm exec -- slides-grab --help
```

## 2) Gemini Skill Workflow

Use the 3-stage workflow in `.gemini/skills/`:

1. Planning stage
2. Design stage
3. Conversion stage

Core references:

- `.gemini/skills/plan-skill/SKILL.md`
- `.gemini/skills/design-skill/SKILL.md`
- `.gemini/skills/pptx-skill/SKILL.md`

Or use the integrated skill: `.gemini/skills/presentation-skill/SKILL.md`

## 3) Run Commands During Workflow

Use one workspace folder per deck:

Prerequisite: create or generate `decks/my-deck/` with `slide-*.html` first. These commands do not work against an empty clone.

```bash
slides-grab edit --slides-dir decks/my-deck
slides-grab build-viewer --slides-dir decks/my-deck
slides-grab validate --slides-dir decks/my-deck
slides-grab pdf --slides-dir decks/my-deck --output decks/my-deck.pdf
slides-grab pdf --slides-dir decks/my-deck --mode print --output decks/my-deck-searchable.pdf
slides-grab convert --slides-dir decks/my-deck --output decks/my-deck.pptx
slides-grab figma --slides-dir decks/my-deck --output decks/my-deck-figma.pptx
```

`slides-grab pdf` defaults to `--mode capture` for visual fidelity. Use `--mode print` when searchable/selectable text is more important than pixel-perfect browser parity.

## 4) Recommended Gemini Kickoff Prompt

Copy-paste into Gemini CLI:

```text
Read docs/installation/gemini.md first and follow it exactly. Use the 3-stage Gemini skills workflow (.gemini/skills/plan-skill, design-skill, pptx-skill). Use decks/<deck-name> as the slides workspace and run validate before conversion.
```
