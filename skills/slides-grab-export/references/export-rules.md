# slides-grab Export Reference

These are the packaged export rules for installable `slides-grab` skills.

## Package-first commands
- PPTX export: `slides-grab convert --slides-dir <path> --output <name>.pptx`
- PDF export: `slides-grab pdf --slides-dir <path> --output <name>.pdf`
- Figma export: `slides-grab figma --slides-dir <path> --output <name>-figma.pptx`

## Export stage rules
- Only export after the user approves the reviewed HTML slides.
- Do not modify slide content during export unless explicitly requested.
- If export fails, fix the root cause in the source HTML/CSS or packaged runtime path.

## User-facing caveats
- PPTX export is experimental / unstable.
- Figma export is experimental / unstable.
- Best-effort output may still require manual cleanup after export.

## Runtime source of truth
- Export behavior must come from the packaged CLI/runtime in `bin/`, `scripts/`, and `src/`.
- Installable skills must not require scripts from inside a skill directory.
