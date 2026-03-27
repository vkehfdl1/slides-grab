# slides-grab Design Reference

These are the packaged design rules for installable `slides-grab` skills.

## Package-first commands
- Validate slides: `slides-grab validate --slides-dir <path>`
- Build review viewer: `slides-grab build-viewer --slides-dir <path>`
- Launch editor: `slides-grab edit --slides-dir <path>`
- Render `tldraw` diagrams: `slides-grab tldraw --input <path> --output <path>`

## Slide spec
- Slide size: `720pt x 405pt` (16:9)
- Font: Pretendard
- Semantic text tags only: `p`, `h1-h6`, `ul`, `ol`, `li`
- CSS colors must include `#`
- Avoid CSS gradients for PPTX-targeted decks

## Asset rules
- Store deck-local assets in `<slides-dir>/assets/`
- Reference deck-local assets as `./assets/<file>`
- Use `tldraw`-generated local assets for complex diagrams when possible
- Allow `data:` URLs only when the slide must be fully self-contained
- Never use absolute filesystem paths

## Package-published theme references
- `themes/executive.css`
- `themes/sage.css`
- `themes/modern-dark.css`
- `themes/corporate.css`
- `themes/warm.css`

## Package-published template references
- `templates/cover.html`
- `templates/contents.html`
- `templates/section-divider.html`
- `templates/content.html`
- `templates/statistics.html`
- `templates/split-layout.html`
- `templates/team.html`
- `templates/quote.html`
- `templates/timeline.html`
- `templates/closing.html`
- `templates/chart.html`
- `templates/diagram.html`
- `templates/diagram-tldraw.html`
- `templates/custom/`

## Review loop
- Generate or edit only the needed slide files.
- Prefer `tldraw` for complex diagrams instead of hand-building dense diagram geometry in HTML/CSS.
- Re-run validation after every generation/edit pass.
- Rebuild the viewer only after validation passes.
- Do not move to export until the user approves the reviewed deck.
