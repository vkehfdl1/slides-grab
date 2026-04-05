# slides-grab Design Reference

These are the packaged design rules for installable `slides-grab` skills.

## Package-first commands
- Validate slides: `slides-grab validate --slides-dir <path>`
- Build review viewer: `slides-grab build-viewer --slides-dir <path>`
- Launch editor: `slides-grab edit --slides-dir <path>`
- Generate a bespoke image asset: `slides-grab image --prompt "<prompt>" --slides-dir <path>`
- Download a web video into slide assets: `slides-grab fetch-video --url <youtube-url> --slides-dir <path>`
- Render `tldraw` diagrams: `slides-grab tldraw --input <path> --output <path>`
- List bundled design collections: `slides-grab list-styles`
- Open the visual style gallery in browser: `slides-grab preview-styles`

## Slide spec
- Slide size: `720pt x 405pt` (16:9)
- Font: Pretendard
- Semantic text tags only: `p`, `h1-h6`, `ul`, `ol`, `li`
- CSS colors must include `#`
- Avoid CSS gradients for PPTX-targeted decks

## Asset rules
- Store deck-local assets in `<slides-dir>/assets/`
- Reference deck-local assets as `./assets/<file>`
- Use `slides-grab image --prompt "<prompt>" --slides-dir <path>` with Nano Banana Pro for bespoke generated images when helpful
- If an image comes from the web, download it into `<slides-dir>/assets/` before referencing it
- If a video comes from YouTube or another supported page, use `slides-grab fetch-video` (or `yt-dlp` directly) to download it into `<slides-dir>/assets/` before referencing it
- Keep local videos and their poster thumbnails together under `<slides-dir>/assets/`
- If `GOOGLE_API_KEY` / `GEMINI_API_KEY` is unavailable, ask the user for a Google API key or fall back to web search + download
- Use `tldraw`-generated local assets for complex diagrams when possible
- Allow `data:` URLs only when the slide must be fully self-contained
- Do not leave remote `http(s)://` image URLs in saved slide HTML
- Never use absolute filesystem paths

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
- `templates/design-styles/README.md` — bundled design collection reference derived from `corazzon/pptx-design-styles`
- `templates/design-styles/preview.html` — visual gallery of all 35 styles (open with `slides-grab preview-styles`)
- `src/design-styles-data.js` — full style specs (colors, fonts, layout, signature elements, things to avoid) for all 35 bundled styles; read this after the user picks a style to ground your design tokens

## Review loop
- The design style is chosen in Stage 1 (Plan) and recorded in `slide-outline.md`'s meta section (`style: <id>`). Do not re-open style selection in Stage 2 — read and apply the already-approved style.
- Generate or edit only the needed slide files.
- Prefer `slides-grab image` before remote image sourcing when the slide needs bespoke imagery.
- Prefer `tldraw` for complex diagrams instead of hand-building dense diagram geometry in HTML/CSS.
- Re-run validation after every generation/edit pass.
- Rebuild the viewer only after validation passes.
- Do not move to export until the user approves the reviewed deck.
