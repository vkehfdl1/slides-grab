# Codex Setup And Usage

This guide is for running `slides-grab` with Codex and repo-local Codex skills.

## 1) Clone and Install

```bash
git clone https://github.com/vkehfdl1/slides-grab.git && cd slides-grab
npm ci && npx playwright install chromium
```

Verify:

```bash
npm exec -- slides-grab --help
```

## 2) Install Codex Skills

Install project skills into `~/.codex/skills`:

```bash
npm exec -- slides-grab install-codex-skills --force
```

Then restart Codex so skills are loaded.

## 3) Codex Workflow

Codex skill references:

- `skills/ppt-plan-skill/SKILL.md`
- `skills/ppt-design-skill/SKILL.md`
- `skills/ppt-pptx-skill/SKILL.md`

Or use the integrated skill: `skills/ppt-presentation-skill/SKILL.md`

Run one deck per workspace folder:

```bash
slides-grab edit --slides-dir decks/my-deck
slides-grab build-viewer --slides-dir decks/my-deck
slides-grab validate --slides-dir decks/my-deck
slides-grab pdf --slides-dir decks/my-deck --output decks/my-deck.pdf
slides-grab convert --slides-dir decks/my-deck --output decks/my-deck.pptx
slides-grab figma --slides-dir decks/my-deck --output decks/my-deck-figma.pptx
```

## 4) Recommended Codex Kickoff Prompt

Copy-paste into Codex:

```text
Read docs/installation/codex.md first and follow it exactly. Use Codex skills (ppt-plan-skill, ppt-design-skill, ppt-pptx-skill), keep each deck in decks/<deck-name>, and run validate before convert/pdf.
```
