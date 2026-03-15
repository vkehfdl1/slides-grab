---
name: ppt-design-skill
description: Stage 2 design skill for Codex. Generate and iterate slide-XX.html files in the selected slides workspace.
metadata:
  short-description: Build HTML slides and viewer for review loop
---

# PPT Design Skill (Codex)

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
3. Run `node scripts/build-viewer.js --slides-dir <path>` after generation or edits.
4. Run `slides-grab lint --slides-dir <path>` after generation or edits. Use this CLI entrypoint for validation, not direct script paths.
5. Iterate on user feedback by editing only requested slide files.
6. Keep revising until user approves conversion stage.

## Rules
- Keep slide size 720pt x 405pt.
- Keep semantic text tags (`p`, `h1-h6`, `ul`, `ol`, `li`).
- Use `slides-grab lint` as the canonical validation command after each edit loop.
- Do not start conversion before approval.

## Reference
For full constraints and style system, follow:
- `.claude/skills/design-skill/SKILL.md`
