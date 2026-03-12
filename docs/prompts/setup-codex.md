# slides-grab — Codex Setup

Follow every step below. Run each command and verify before moving on.

## 1. Clone and install

```bash
git clone https://github.com/vkehfdl1/slides-grab.git && cd slides-grab
npm ci && npx playwright install chromium
```

## 2. Install Codex skills

```bash
npm exec -- slides-grab install-codex-skills --force
```

Then restart Codex so the skills are loaded.

## 3. Verify

```bash
npm exec -- slides-grab --help
```

You should see the CLI help output with commands: edit, build-viewer, validate, convert, figma, pdf, etc. Actual export commands require a deck directory containing `slide-*.html`.

## 4. How to use

This project uses a 3-stage skill workflow under `skills/`:

| Stage | Skill | What it does |
|-------|-------|-------------|
| 1. Plan | `skills/ppt-plan-skill/SKILL.md` | Create slide-outline.md, get user approval |
| 2. Design | `skills/ppt-design-skill/SKILL.md` | Generate slide HTML files |
| 3. Export | `skills/ppt-pptx-skill/SKILL.md` | Convert to PPTX/PDF |

Or use the integrated skill `skills/ppt-presentation-skill/SKILL.md` to go through all stages end-to-end.

### Key CLI commands

```bash
slides-grab edit --slides-dir <path>         # Visual editor
slides-grab build-viewer --slides-dir <path> # Build viewer.html
slides-grab validate --slides-dir <path>     # Validate slides
slides-grab convert --slides-dir <path>      # Export PPTX
slides-grab figma --slides-dir <path>        # Export Figma-importable PPTX
slides-grab pdf --slides-dir <path>          # Export PDF in capture mode (default)
slides-grab pdf --slides-dir <path> --mode print
```

Use `decks/<deck-name>/` as the slides workspace. Default is `slides/`.

`--mode capture` maximizes visual fidelity. `--mode print` keeps searchable/selectable PDF text.

Setup complete. Ready to create presentations.
