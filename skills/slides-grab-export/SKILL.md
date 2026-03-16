---
name: slides-grab-export
description: Stage 3 conversion skill for Codex. Convert approved HTML slides to PPTX/PDF and validate artifacts.
metadata:
  short-description: Convert slides and run conversion checks
---

# slides-grab Export Skill (Codex)

Use this only after the user approves design output.

## Goal
Convert reviewed slide HTML into PPTX (and optional PDF) reliably.

## Inputs
- Approved `<slides-dir>/slide-*.html`
- Optional output path settings

## Outputs
- Presentation artifact (`.pptx` or `.pdf`)

## Workflow
1. Confirm user approval for conversion.
2. Run conversion command:
   - `node .claude/skills/pptx-skill/scripts/html2pptx.js`
   - or `slides-grab convert --slides-dir <path>`
3. If requested, run PDF conversion:
   - `slides-grab pdf --slides-dir <path>`
4. Report success/failure with actionable errors.

## Rules
- Do not modify slide content during conversion stage unless explicitly requested.
- If conversion fails, diagnose and fix root causes in source HTML/CSS.

## Reference
For detailed conversion behavior and tools, use:
- `.claude/skills/pptx-skill/SKILL.md`
