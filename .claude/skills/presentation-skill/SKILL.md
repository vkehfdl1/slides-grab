---
name: presentation-skill
description: End-to-end presentation workflow. Use when making a full presentation from scratch — planning, designing slides, editing, and exporting.
---

# Presentation Skill - Full Workflow Orchestrator

Guides you through the complete presentation pipeline from topic to exported file.

---

## Workflow

### Stage 1 — Plan

Use **plan-skill** (`.claude/skills/plan-skill/SKILL.md`).

1. Take user's topic, audience, and tone.
2. Delegate outline creation to `organizer-agent`.
3. Present `slide-outline.md` to user.
4. Revise until user explicitly approves.

**Do not proceed to Stage 2 without approval.**

### Stage 2 — Design

Use **design-skill** (`.claude/skills/design-skill/SKILL.md`).

1. Read approved `slide-outline.md`.
2. Generate `slide-*.html` files in the slides workspace (default: `slides/`).
3. Build the viewer: `node scripts/build-viewer.js --slides-dir <path>`
4. Present viewer to user for review.
5. Revise individual slides based on feedback.
6. Optionally launch the visual editor: `slides-grab edit --slides-dir <path>`

**Do not proceed to Stage 3 without approval.**

### Stage 3 — Export

Use **pptx-skill** (`.claude/skills/pptx-skill/SKILL.md`).

1. Confirm user wants conversion.
2. Export to PPTX: `slides-grab convert --slides-dir <path> --output <name>.pptx`
3. Export to PDF (if requested): `slides-grab pdf --slides-dir <path> --output <name>.pdf`
4. Report results.

---

## Rules

1. **Always follow the stage order**: Plan → Design → Export.
2. **Get explicit user approval** before advancing to the next stage.
3. **Read each stage's SKILL.md** for detailed rules — this skill only orchestrates.
4. **Use `decks/<deck-name>/`** as the slides workspace for multi-deck projects.
