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
5. For bespoke slide imagery, use `slides-grab image --prompt "<prompt>" --slides-dir <path>` so Nano Banana Pro saves a local asset under `<slides-dir>/assets/`.
6. For complex diagrams (architecture, workflows, relationship maps, multi-node concepts), prefer `tldraw` over hand-built HTML/CSS diagrams. Render the asset with `slides-grab tldraw`, store it under `<slides-dir>/assets/`, and place it in the slide with a normal `<img>`.
7. Keep local videos under `<slides-dir>/assets/`, prefer `poster="./assets/<file>"` thumbnails, and use `slides-grab fetch-video --url <youtube-url> --slides-dir <path>` (or `yt-dlp` directly) when the source starts on a supported web page.
8. If `GOOGLE_API_KEY` (or `GEMINI_API_KEY`) is unavailable or Nano Banana is down, ask the user for a Google API key or fall back to web search/download into `<slides-dir>/assets/`.
9. Launch the interactive editor for review: `slides-grab edit --slides-dir <path>`
10. Revise slides based on user feedback via the editor, then re-run validation after each edit round.
11. When the user confirms editing is complete, suggest next steps: build the viewer (`slides-grab build-viewer --slides-dir <path>`) for a final preview, or proceed directly to Stage 3 for PDF/PPTX export.

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
7. When a slide needs a complex diagram, default to a `tldraw`-generated asset unless the user explicitly asks for a different approach.
8. When a slide needs bespoke imagery, prefer Nano Banana Pro via `slides-grab image` and keep the saved asset local under `<slides-dir>/assets/`.

## Reference
- `references/presentation-workflow-reference.md` — archived end-to-end workflow guidance from the legacy skill set
