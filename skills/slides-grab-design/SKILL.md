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
3. When a slide explicitly needs bespoke imagery, when the user asks for an image, or when stronger imagery would materially improve the slide, prefer `slides-grab image --prompt "<prompt>" --slides-dir <path>` to generate a local asset with Nano Banana Pro and save it under `<slides-dir>/assets/`.
4. If the deck needs a complex diagram (architecture, workflows, relationship maps), create the diagram in `tldraw`, export it with `slides-grab tldraw`, and treat the result as a local slide asset under `<slides-dir>/assets/`.
5. Run `slides-grab validate --slides-dir <path>` after generation or edits.
6. If validation fails, automatically fix the source slide HTML/CSS and re-run validation until it passes.
7. Run `slides-grab build-viewer --slides-dir <path>` only after validation passes.
8. Iterate on user feedback by editing only requested slide files, then re-run validation and rebuild the viewer.
9. Keep revising until user approves conversion stage.

## Rules
- Keep slide size 720pt x 405pt.
- Keep semantic text tags (`p`, `h1-h6`, `ul`, `ol`, `li`).
- Put local images under `<slides-dir>/assets/` and reference them as `./assets/<file>`.
- Allow `data:` URLs when the slide must be fully self-contained.
- Do not leave remote `http(s)://` image URLs in saved slide HTML; download source images into `<slides-dir>/assets/` and reference them as `./assets/<file>`.
- Prefer `slides-grab image` with Nano Banana Pro for bespoke slide imagery before reaching for remote URLs.
- If `GOOGLE_API_KEY` (or `GEMINI_API_KEY`) is unavailable or the Nano Banana API fails, ask the user for a Google API key or fall back to web search + download into `<slides-dir>/assets/`.
- Prefer `<img>` for slide imagery and `data-image-placeholder` when no final asset exists.
- Do not present slides for review until `slides-grab validate --slides-dir <path>` passes.
- Do not start conversion before approval.
- Design slides based on the pack's design.md specifications and theme.css — synthesize mood, signature elements, and CSS patterns into each slide.

## Reference
For full constraints and style system, follow:
- `references/design-rules.md` — pack system, slide spec, template list, review loop
- `references/detailed-design-rules.md` — image/text/workflow rules
- `references/design-system-full.md` — full design system, typography, color palettes, advanced patterns
- `references/charts-icons-library.md` — Chart.js, Mermaid, SVG icon snippets, image usage patterns
