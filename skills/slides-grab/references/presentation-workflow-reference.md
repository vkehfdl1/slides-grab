# Presentation Skill - Full Workflow Orchestrator

Guides you through the complete presentation pipeline from topic to exported file.

---

## Workflow

### Stage 1 — Plan

Use the installed **slides-grab-plan** skill.

1. Take user's topic, audience, and tone.
2. Create `slide-outline.md`.
3. Present `slide-outline.md` to user.
4. Revise until user explicitly approves.

**Do not proceed to Stage 2 without approval.**

### Stage 2 — Design

Use the installed **slides-grab-design** skill.

1. Read approved `slide-outline.md`.
2. Generate `slide-*.html` files in the slides workspace (default: `slides/`).
3. Run validation: `slides-grab validate --slides-dir <path>`
4. If validation fails, automatically fix the slide HTML/CSS until validation passes.
5. Build the viewer: `slides-grab build-viewer --slides-dir <path>`
6. When a slide calls for bespoke imagery, prefer `slides-grab image --prompt "<prompt>" --slides-dir <path>` so Nano Banana Pro saves a local asset under `<slides-dir>/assets/`.
7. For complex diagrams (architecture, workflows, relationship maps, multi-node concepts), prefer `tldraw`. Render a local diagram asset with `slides-grab tldraw`, store it under `<slides-dir>/assets/`, and place it into the slide with a normal `<img>`.
8. If `GOOGLE_API_KEY` or `GEMINI_API_KEY` is unavailable, or the Nano Banana API fails, ask the user for a Google API key or fall back to web search + download into `<slides-dir>/assets/`.
9. Present viewer to user for review.
10. Revise individual slides based on feedback, then re-run validation and rebuild the viewer.
11. Optionally launch the visual editor: `slides-grab edit --slides-dir <path>`

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
5. **Call out export risk clearly**: PPTX and Figma export are experimental / unstable and should be described as best-effort output.
6. **Prefer tldraw for complex diagrams**: Use `slides-grab tldraw` for diagram-heavy slides unless the user explicitly wants another rendering path.
7. **Prefer Nano Banana Pro for bespoke imagery**: Use `slides-grab image` when a slide benefits from generated imagery, and keep the result as a local asset under `<slides-dir>/assets/`.
