# slides-grab Design Reference

These are the packaged design rules for `slides-grab` skills.

## CLI commands
- Validate slides: `slides-grab validate --slides-dir <path>`
- Launch editor: `slides-grab edit --slides-dir <path>`

## Slide spec
- Slide size: `720pt x 405pt` (16:9, fixed)
- Font: Pretendard by default; if the pack's theme.css specifies a different font, follow the pack
- Semantic text tags only: `p`, `h1-h6`, `ul`, `ol`, `li`
- CSS colors must include `#`
- Avoid CSS gradients for PPTX-targeted decks

## Asset rules
- Store deck-local assets in `<slides-dir>/assets/`
- Reference deck-local assets as `./assets/<file>`
- If an image comes from the web, download it into `<slides-dir>/assets/` before referencing it
- Do not leave remote `http(s)://` image URLs in saved slide HTML
- Allow `data:` URLs only when the slide must be fully self-contained
- Never use absolute filesystem paths

## Pack System

Packs are organized in `packs/`. Each pack provides a different visual design defined by `design.md` and `theme.css`.

### Discovering packs

Run `slides-grab list-packs` to see all available packs with colors and slide type counts.
Default pack is `simple_light`.

### Pack CLI commands
```bash
slides-grab list-packs                              # List all packs
slides-grab show-pack <pack-id>                     # View pack details
cat packs/<pack-id>/design.md                        # Read pack's design specification
```

### Pack resolution (design.md-based)
1. **Pack has design.md** → follow the mood, signature elements, CSS patterns, Color Usage, and avoid rules from `design.md`
2. **Pack doesn't have design.md** → use simple_light design.md as a baseline, adapting colors from that pack's own Color Usage if available

### Design specification
Each pack has a `design.md` with Color Usage table, CSS Patterns, Font Pairing, and Avoid rules.
Use the values specified in design.md when generating slides.

### Common slide types
Defined in `packs/common-types.json`. Each pack implements a subset.
Check pack coverage: `slides-grab show-pack <pack-id>`

## Review loop
- Generate or edit only the needed slide files.
- Prefer `tldraw` for complex diagrams instead of hand-building dense diagram geometry in HTML/CSS.
- Re-run validation after every generation/edit pass.
- Do not move to export until the user approves the reviewed deck.
