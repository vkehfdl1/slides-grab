## Base Settings

### Slide Size (16:9 default)
- Keep slide body at 720pt x 405pt.
- Use Pretendard as the default font stack.
- Include the Pretendard webfont CDN link when needed.

### 4. Image Usage Rules (Local Asset / Data URL / Remote URL / Placeholder)
- Always include alt on img tags.
- Use `./assets/<file>` as the default image contract for slide HTML.
- Keep slide assets in `<slides-dir>/assets/`.
- `data:` URLs are allowed for fully self-contained slides.
- Remote `https://` URLs are allowed but non-deterministic and fallback only.
- Do not use absolute filesystem paths in slide HTML.
- Do not use non-body `background-image` for content imagery; use `<img>` instead.
- Use `data-image-placeholder` to reserve space when no image is available yet.

## Text Usage Rules
- All text must be inside `<p>`, `<h1>`-`<h6>`, `<ul>`, `<ol>`, or `<li>`.
- Never place text directly in `<div>` or `<span>`.

## Workflow (Stage 2: Design + Human Review)
- After slide generation or edits, run `slides-grab validate --slides-dir <path>`.
- After validation passes, run `slides-grab build-viewer --slides-dir <path>`.
- Edit only the relevant HTML file during revision loops.
- Never start PPTX conversion without explicit approval.
- Never forget to build the viewer after slide changes.
- Do not persist runtime-only editor/viewer injections in saved slide HTML.

## Important Notes
- CSS gradients are not supported in PowerPoint conversion; replace them with background images.
- Always include the Pretendard CDN link.
- Use `./assets/<file>` from each `slide-XX.html` and avoid absolute filesystem paths.
- Always include `#` prefix in CSS colors.
- Never place text directly in `div`/`span`.
