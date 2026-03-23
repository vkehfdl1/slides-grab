---
name: slides-grab
description: End-to-end presentation workflow for Codex. Use when making a full presentation from scratch — planning, designing slides, editing, and exporting. PDF is preferred; PPTX/Figma export is experimental / unstable.
metadata:
  short-description: Full pipeline from topic to PDF + experimental / unstable PPTX/Figma export
---

# slides-grab Skill (Codex) - Full Workflow Orchestrator

Guides you through the complete presentation pipeline from topic to exported file.

---

## Workflow

### Stage 1 — Plan

Use the installed **slides-grab-plan** skill.

1. Take user's topic, audience, and tone.
2. Create `slide-outline.md`.
3. Present outline to user.
4. Revise until user explicitly approves.

**Do not proceed to Stage 2 without approval.**

### Stage 2 — Design

Use the installed **slides-grab-design** skill.

1. Read approved `slide-outline.md`.
2. Generate `slide-*.html` files in the slides workspace (default: `slides/`).
3. Run validation: `slides-grab validate --slides-dir <path>`
4. If validation fails, automatically fix the slide HTML/CSS until validation passes.
5. Build the viewer: `slides-grab build-viewer --slides-dir <path>`
6. Present viewer to user for review.
7. Revise individual slides based on feedback, then re-run validation and rebuild the viewer.
8. Optionally launch the visual editor: `slides-grab edit --slides-dir <path>`

**Do not proceed to Stage 3 without approval.**

### Stage 3 — Export

Use the installed **slides-grab-export** skill.

1. Confirm user wants conversion.
2. Export to PPTX: `slides-grab convert --slides-dir <path> --output <name>.pptx` (**experimental / unstable**)
3. Export to PDF (if requested): `slides-grab pdf --slides-dir <path> --output <name>.pdf`
4. Report results.

---

## Rules

1. **Always follow the stage order**: Plan → Design → Export.
2. **Get explicit user approval** before advancing to the next stage.
3. **Read each stage's SKILL.md** for detailed rules — this skill only orchestrates.
4. **Use `decks/<deck-name>/`** as the slides workspace for multi-deck projects.
5. **Call out export risk clearly**: PPTX and Figma export are experimental / unstable and must be described as best-effort output.
6. Use the stage skills as the source of truth for plan, design, and export rules.

## Reference
- `references/presentation-workflow-reference.md` — archived end-to-end workflow guidance from the legacy skill set
