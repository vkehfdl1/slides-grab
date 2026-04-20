## Base Settings

### Slide Size (16:9 default)
- Keep slide body at 720pt x 405pt.
- Use Pretendard as the default font stack.
- Include the Pretendard webfont CDN link when needed.

### 4. Image Usage Rules (Local Asset / Data URL / Remote URL / Placeholder)
- Always include alt on img tags.
- Use `./assets/<file>` as the default image and video contract for slide HTML.
- Keep slide assets in `<slides-dir>/assets/`.
- Use `tldraw`-generated assets for complex diagrams whenever possible.
- Use `slides-grab image --prompt "<prompt>" --slides-dir <path>` with Nano Banana Pro when a slide needs bespoke generated imagery.
- `data:` URLs are allowed for fully self-contained slides.
- Do not leave remote `http(s)://` image URLs in saved slide HTML; download source images into `<slides-dir>/assets/` and reference them as `./assets/<file>`.
- Store local videos under `<slides-dir>/assets/`, reference them as `./assets/<file>`, and prefer `poster="./assets/<file>"` for export-friendly thumbnails.
- If a video starts on YouTube or another supported page, use `slides-grab fetch-video --url <youtube-url> --slides-dir <path>` (or `yt-dlp` directly if needed) before saving the slide HTML.
- If `GOOGLE_API_KEY` or `GEMINI_API_KEY` is unavailable, or the Nano Banana API fails, ask the user for a Google API key or fall back to web search + download into `<slides-dir>/assets/`.
- Do not use absolute filesystem paths in slide HTML.
- Do not use non-body `background-image` for content imagery; use `<img>` instead.
- Use `data-image-placeholder` to reserve space when no image is available yet.

## Text Usage Rules
- All text must be inside `<p>`, `<h1>`-`<h6>`, `<ul>`, `<ol>`, or `<li>`.
- Never place text directly in `<div>` or `<span>`.

## Typography Scale Rules
- Body copy minimum is 14pt on a 720pt × 405pt slide; prefer 16-20pt so copy reads cleanly at presentation distance and on PDF export.
- Absolute floor for captions, labels, footnotes, and meta text is 10pt. Never render any text below 10pt.
- Display and title text should scale well above body copy — prefer 36pt or larger so the slide's main takeaway reads in 3-5 seconds.
- If content does not fit at the minimum scale, cut content. Do not shrink type to accommodate more.
- Keep at most two typefaces across the deck. One display/headline face plus one body face is enough.

## Color Usage Rules
- Pull every color from the approved style spec in `src/design-styles-data.js` or the user-provided brand tokens. Do not invent fresh standalone hex colors mid-slide.
- If the approved palette cannot cover a specific slide, extend it harmonically with `oklch()` — derive the new color from the existing accent, surface, or background — rather than picking a fresh hex from scratch.
- Keep one accent color per deck. Two background colors max across the entire deck, used to introduce rhythm between section dividers and content slides.
- Every CSS color must keep the `#` prefix and survive raster export to PPTX/PDF; avoid non-sRGB values that will flatten unexpectedly.

## Icon Usage Rules
- Prefer Lucide as the default icon library for slide UI elements, callouts, and supporting visuals.
- Do not default to emoji for iconography; reserve emoji for cases where the brief explicitly wants a playful or native-emoji tone.
- Keep icon sizing, stroke weight, and color aligned with the deck's approved design tokens.

## Workflow (Stage 2: Design + Human Review)
- After slide generation or edits, run `slides-grab validate --slides-dir <path>`.
- After validation passes, run `slides-grab build-viewer --slides-dir <path>`.
- Edit only the relevant HTML file during revision loops.
- When the brief explicitly calls for an image, the user requests one, or the slide clearly benefits from it, prefer `slides-grab image` before falling back to remote image sourcing.
- Prefer `slides-grab tldraw` + local exported assets for architecture, workflow, relationship, and other complex diagrams.
- Keep local videos and their poster thumbnails together under `<slides-dir>/assets/`.
- Never start PPTX conversion without explicit approval.
- Never forget to build the viewer after slide changes.
- Do not persist runtime-only editor/viewer injections in saved slide HTML.

## Important Notes
- CSS gradients may not export cleanly to all formats; prefer solid colors or background images when possible.
- Always include the Pretendard CDN link.
- Use `./assets/<file>` from each `slide-XX.html` for local images and videos, and avoid absolute filesystem paths.
- Always include `#` prefix in CSS colors.
- Never place text directly in `div`/`span`.
