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
- Optional approved `style-config.json`
- Theme/layout preferences
- Requested edits per slide

## Outputs
- `<slides-dir>/slide-01.html ... slide-XX.html`
- Updated `<slides-dir>/viewer.html` via build script

## Workflow
1. Read approved `slide-outline.md`.
2. If `style-config.json` exists, read it before deciding the visual direction. When the design direction is still open, suggest `slides-grab list-styles`, optionally `slides-grab preview-styles --style <id>`, and confirm the user-approved style before generation.
3. Before generating slides, write a quick **visual thesis** (mood/material/energy), a **content plan** (opener → support/proof → detail/story → close/CTA), and the core design tokens (background, surface, text, muted, accent + display/headline/body/caption roles).
4. Generate slide HTML files with 2-digit numbering in selected `--slides-dir`.
5. When a slide explicitly needs bespoke imagery, when the user asks for an image, or when stronger imagery would materially improve the slide, prefer `slides-grab image --prompt "<prompt>" --slides-dir <path>` to generate a local asset with Nano Banana Pro and save it under `<slides-dir>/assets/`.
6. If the deck needs a complex diagram (architecture, workflows, relationship maps, multi-node concepts), create the diagram in `tldraw`, export it with `slides-grab tldraw`, and treat the result as a local slide asset under `<slides-dir>/assets/`.
7. If the slide needs a local video, store the video under `<slides-dir>/assets/`, reference it as `./assets/<file>`, and prefer a `poster="./assets/<file>"` thumbnail so PDF export uses a stable still image.
8. If the source video starts on YouTube or another supported page, use `slides-grab fetch-video --url <youtube-url> --slides-dir <path>` (or `yt-dlp` directly if needed) to download it into `<slides-dir>/assets/` before saving the slide HTML.
9. Run `slides-grab validate --slides-dir <path>` after generation or edits.
10. If validation fails, automatically fix the source slide HTML/CSS and re-run validation until it passes.
11. Run the slide litmus check from `references/beautiful-slide-defaults.md` before presenting the deck for review.
12. Launch the interactive editor for visual review: `slides-grab edit --slides-dir <path>`
13. Iterate on user feedback by editing only requested slide files, then re-run validation after each edit round.
14. When the user confirms editing is complete, suggest: build the viewer (`slides-grab build-viewer --slides-dir <path>`) for a final read-only preview, or proceed to export (PDF/PPTX).
15. Keep revising until user approves conversion stage.

## Rules
- Keep slide size 720pt x 405pt.
- Keep semantic text tags (`p`, `h1-h6`, `ul`, `ol`, `li`).
- Put local images and videos under `<slides-dir>/assets/` and reference them as `./assets/<file>`.
- Allow `data:` URLs when the slide must be fully self-contained.
- Do not leave remote `http(s)://` image URLs in saved slide HTML; download source images into `<slides-dir>/assets/` and reference them as `./assets/<file>`.
- Prefer `slides-grab image` with Nano Banana Pro for bespoke slide imagery before reaching for remote URLs.
- If `GOOGLE_API_KEY` (or `GEMINI_API_KEY`) is unavailable or the Nano Banana API fails, ask the user for a Google API key or fall back to web search + download into `<slides-dir>/assets/`.
- Prefer local videos with a `poster="./assets/<file>"` thumbnail so PDF export uses the still image.
- Use `slides-grab fetch-video` or `yt-dlp` to pull supported web videos into `<slides-dir>/assets/` before saving slide HTML.
- Prefer `<img>` for slide imagery and `data-image-placeholder` when no final asset exists.
- Default to one job per slide, one dominant visual anchor, and copy that scans in seconds.
- Treat opening slides and section dividers like posters, not dashboards.
- Default to cardless layouts; only add a card when it improves structure or comprehension.
- Use whitespace, alignment, scale, cropping, and contrast before adding decorative chrome.
- Prefer `tldraw` for complex diagrams instead of recreating dense node/edge diagrams directly in HTML/CSS.
- Use `slides-grab tldraw` plus `templates/diagram-tldraw.html` when that gives a cleaner, more export-friendly result.
- Do not present slides for review until `slides-grab validate --slides-dir <path>` passes.
- Do not start conversion before approval.
- Use the packaged CLI and bundled references only; do not depend on unpublished agent-specific files.

## Reference
For full constraints and style system, follow:
- `references/design-rules.md`
- `references/detailed-design-rules.md`
- `references/beautiful-slide-defaults.md` — slide-specific art direction defaults adapted from OpenAI's frontend design guidance
- `references/design-system-full.md` — archived full design system, templates, and advanced pattern guidance
