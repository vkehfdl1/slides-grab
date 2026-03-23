# slides-grab Design Reference

These are the packaged design rules for installable `slides-grab` skills.

## Package-first commands
- Validate slides: `slides-grab validate --slides-dir <path>`
- Build review viewer: `slides-grab build-viewer --slides-dir <path>`
- Launch editor: `slides-grab edit --slides-dir <path>`

## Slide spec
- Slide size: `720pt x 405pt` (16:9)
- Font: Pretendard
- Semantic text tags only: `p`, `h1-h6`, `ul`, `ol`, `li`
- CSS colors must include `#`
- Avoid CSS gradients for PPTX-targeted decks

## Asset rules
- Store deck-local assets in `<slides-dir>/assets/`
- Reference deck-local assets as `./assets/<file>`
- Allow `data:` URLs only when the slide must be fully self-contained
- Never use absolute filesystem paths

## Template Pack System

Templates are organized into **packs** in `packs/`. Each pack provides a different visual design.

### Available packs
| Pack | Concept |
|------|---------|
| `figma-default` | White + black + orange (default) |
| `midnight` | Deep navy + gold, premium dark |
| `corporate` | White + navy/blue, business |
| `creative` | Gradient + pink/indigo, creative |

### Pack CLI commands
```bash
slides-grab list-packs                              # List all packs
slides-grab show-pack <pack-id>                     # View pack details
slides-grab show-template <name> --pack <pack-id>   # View a template from a specific pack
```

### Pack resolution
1. `packs/<packId>/templates/<name>.html` — pack-owned template
2. Falls back to `packs/figma-default/templates/<name>.html`
3. When using a fallback template, adapt colors/style to match the selected pack

### Theme CSS variables
Each pack has a `theme.css` defining `:root { --bg-primary, --text-primary, --accent, ... }`.
Templates use `var()` references. Copy the `:root` block when generating slides.

### Core 7 templates (all packs)
`cover`, `content`, `contents`, `two-columns`, `section-divider`, `highlight`, `closing`

### Full 23 templates (figma-default)
`big-metric`, `chart`, `closing`, `content`, `contents`, `cover`, `diagram`, `funnel`,
`highlight`, `image-description`, `image-text`, `key-metrics`, `matrix`, `principles`,
`quote`, `quotes-grid`, `section-divider`, `simple-list`, `split-layout`, `statistics`,
`team`, `timeline`, `two-columns`

## Legacy theme references
- `themes/executive.css`
- `themes/sage.css`
- `themes/modern-dark.css`
- `themes/corporate.css`
- `themes/warm.css`

## Review loop
- Generate or edit only the needed slide files.
- Re-run validation after every generation/edit pass.
- Rebuild the viewer only after validation passes.
- Do not move to export until the user approves the reviewed deck.
