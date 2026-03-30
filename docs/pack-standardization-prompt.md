# Pack Template Standardization Prompt

> Use this prompt in a new session to update existing pack templates to the standard typography scale.
> Process one pack at a time.

---

## Prompt

```
Standardize the template pack in the slides-grab project to match the design typography spec.

## Project Context

- Project: /Users/usuhwa/_workspace/bootstrap/slides-grab
- Read CLAUDE.md and TASKS.md first
- Design spec: skills/slides-grab-design/references/design-system-full.md
- Slide size: 720pt x 405pt (fixed)

## Target Pack

Pack: `packs/<PACK_ID>/`

## Standard Typography Scale

All pack templates must conform to these size ranges:

| Role | Size | Weight | Usage |
|------|------|--------|-------|
| Hero Title | 56-72pt | 700-800 | Cover slide main title |
| Section Title | 40-48pt | 700 | Section divider heading |
| Slide Title | 28-36pt | 600-700 | General slide heading (h1/h2) |
| Subtitle | 18-22pt | 500 | Subtitle, description |
| Body | 14-18pt | 400 | Body text |
| Caption | 10-12pt | 400 | Caption, source |
| Label | 9-11pt | 500-600 | Badge, tag, number |

### letter-spacing
- Large titles (Hero, Section): -0.02em
- Medium titles (Slide Title): -0.01em
- Body: 0
- Caption/Label: 0.02em

### line-height
- Titles: 1.2
- Body: 1.6
- Single line: 1.0

## Font Rules

- If the pack's theme.css defines --font-sans, use that font
- Otherwise default to Pretendard
- Do not change the pack's existing font family (packs using Inter keep Inter)

## Color Rules

- Use the pack's theme.css CSS variables as-is
- Replace hardcoded colors with var() references where possible
- Do not change any color values

## Workflow

1. Run `slides-grab show-pack <PACK_ID>` to list pack's templates
2. Run `slides-grab show-theme <PACK_ID>` to see CSS variables
3. Read each template HTML and audit current font sizes
4. Adjust to the standard scale:
   - cover.html: Hero Title -> 56-72pt, subtitle -> 18-22pt
   - section-divider.html: Section Title -> 40-48pt
   - content.html: Slide Title -> 28-36pt, Body -> 14-18pt
   - Other templates: adjust by role
5. Validate: `slides-grab validate --slides-dir <test-slides>`
6. Provide a before/after comparison table

## Constraints

- Do NOT change layout structure (flexbox, grid)
- Do NOT change colors
- Do NOT change font family
- ONLY adjust font-size, font-weight, letter-spacing, line-height
- Fine-tune padding/margin only if needed to accommodate size changes
- Verify no visual breakage after changes

## CSS Variable Standardization (Optional)

If possible, add these variables to the pack's theme.css and reference them in templates:

```css
:root {
  /* Typography scale */
  --title-hero: 64pt;
  --title-section: 44pt;
  --title-slide: 32pt;
  --text-subtitle: 20pt;
  --text-body: 16pt;
  --text-caption: 11pt;
  --text-label: 10pt;
}
```

This allows adjusting the entire pack's sizing from one place.
If existing variables like --title-xl exist, keep the names but update values to match the standard.

## Done Criteria

- [ ] All Hero Titles within 56-72pt range
- [ ] All Slide Titles within 28-36pt range
- [ ] All Body text within 14-18pt range
- [ ] letter-spacing and line-height standards applied
- [ ] Validation passes
- [ ] No color or layout changes
```

---

## Recommended Pack Order

1. `simple_light` — most templates (23), reference pack
2. `simple_dark` — already has CSS variables, adjust values only
3. `corporate` — business default
4. `bold_minimal` — has base.css class structure
5. `green` — Inter font pack
6. `black_rainbow` — Inter font pack
7. `grab` — already 72pt Hero, minor tweaks
8. `midnight` — dark theme
9. `creative` — distinctive pack
10. `mobile_strategy` — specialized pack

## Note: Process 1-2 packs per session

Each pack has 7-23 templates, so processing too many in one session may exhaust the context window. Work through 1-2 packs at a time.
