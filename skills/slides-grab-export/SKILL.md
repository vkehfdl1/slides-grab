---
name: slides-grab-export
description: Stage 3 conversion skill for Codex. Convert approved HTML slides to PDF and to experimental / unstable PPTX/Figma outputs, then validate artifacts.
metadata:
  short-description: Convert slides and run conversion checks
---

# slides-grab Export Skill (Codex)

Use this only after the user approves design output.

## Goal
Convert reviewed slide HTML into PDF reliably, and into experimental / unstable PPTX/Figma outputs on a best-effort basis.

## Inputs
- Approved `<slides-dir>/slide-*.html`
- Optional output path settings

## Outputs
- Presentation artifact (`.pptx` or `.pdf`)

## Workflow
1. Confirm user approval for conversion.
2. Run conversion command:
   - `slides-grab convert --slides-dir <path> --output <name>.pptx` (**experimental / unstable**)
3. If requested, run PDF conversion:
   - `slides-grab pdf --slides-dir <path> --output <name>.pdf`
4. If requested, run Figma export:
   - `slides-grab figma --slides-dir <path> --output <name>-figma.pptx`
5. Report success/failure with actionable errors.

## Rules
- Do not modify slide content during conversion stage unless explicitly requested.
- If conversion fails, diagnose and fix root causes in source HTML/CSS.
- Always tell the user that PPTX and Figma export are experimental / unstable and may require manual cleanup.
- Use the packaged CLI and bundled references only; do not depend on unpublished agent-specific files.

## Reference
For detailed conversion behavior and tools, use:
- `references/export-rules.md`
- `references/pptx-skill-reference.md` — archived full PPTX workflow guidance
- `references/html2pptx.md` — archived converter usage guide
- `references/ooxml.md` — archived OOXML reference
