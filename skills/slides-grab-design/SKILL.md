---
name: slides-grab-design
description: Stage 2 design skill for Codex. Generate and iterate slide-XX.html files in the selected slides workspace.
metadata:
  short-description: Build HTML slides and viewer for review loop
---

# slides-grab Design Skill (Codex)

Use this after `slide-outline.md` is approved.

## Goal
Generate high-quality `slide-XX.html` files in the selected slides workspace (`slides/` by default) and support revision loops.

## Inputs
- Approved `slide-outline.md`
- Theme/layout preferences
- Requested edits per slide

## Outputs
- `<slides-dir>/slide-01.html ... slide-XX.html`
- Updated `<slides-dir>/viewer.html` via build script

## Workflow
1. Read approved `slide-outline.md`.
2. Generate slide HTML files with 2-digit numbering in selected `--slides-dir`.
3. Run `slides-grab validate --slides-dir <path>` after generation or edits.
4. If validation fails, automatically fix the source slide HTML/CSS and re-run validation until it passes.
5. Run `slides-grab build-viewer --slides-dir <path>` only after validation passes.
6. Iterate on user feedback by editing only requested slide files, then re-run validation and rebuild the viewer.
7. Keep revising until user approves conversion stage.

## Rules
- Keep slide size 720pt x 405pt.
- Keep semantic text tags (`p`, `h1-h6`, `ul`, `ol`, `li`).
- Put local images under `<slides-dir>/assets/` and reference them as `./assets/<file>`.
- Allow `data:` URLs when the slide must be fully self-contained.
- Treat remote `https://` images as best-effort only, and never use absolute filesystem paths.
- Prefer `<img>` for slide imagery and `data-image-placeholder` when no final asset exists.
- Do not present slides for review until `slides-grab validate --slides-dir <path>` passes.
- Do not start conversion before approval.
- Use the packaged CLI and bundled references only; do not depend on unpublished agent-specific files.

## Reference
For full constraints and style system, follow:
- `references/design-rules.md`
- `references/detailed-design-rules.md`
- `references/design-system-full.md` — archived full design system, templates, and advanced pattern guidance
