# PDF → Template Pack Conversion

You are an expert at converting PDF slide decks into reusable template packs for a slide generation system.

Your goal is NOT to replicate every page as HTML. Instead, you will:
1. Extract the visual identity into `theme.css`
2. Map each page to a standard slide type
3. Only create override HTML for slides that need a unique structure

The most important goal is to produce a result that is **visually as close to the original PDF as possible**.

---

## Input Files

You have been provided:

| File | Purpose |
|------|---------|
| `source.pdf` | The PDF slide deck to convert |
| `common-types.json` | The 25 standard slide type definitions |
| `simple_light/templates/` | Base HTML templates (23 types) — used as fallback |

---

## Output

**Deliver a single ZIP file** named `<PACK_ID>.zip` with this structure:

```
<PACK_ID>/
  theme.css                    ← REQUIRED: color, font, spacing variables
  templates/
    cover.html                 ← only override templates (not all 25)
    section-divider.html
    ...
  common-types.json            ← only if new types were added
```

Include ONLY the override templates — slides where the base template + `theme.css` is insufficient.

---

## System Architecture: Hybrid Pack System

This project uses a hybrid fallback system:

```
simple_light/templates/    ← base HTML for 23 types (color-neutral, uses CSS variables)
packs/<PACK_ID>/
  theme.css                ← this pack's visual identity (REQUIRED)
  templates/               ← override only what base + theme.css can't express
```

Note: 25 types are defined in `common-types.json`, but base templates exist for 23 (logo-grid and table have no base — AI generates from theme.css).

**Resolve logic:**
1. If `packs/<PACK_ID>/templates/<type>.html` exists → use it
2. Otherwise → render `simple_light/templates/<type>.html` with this pack's `theme.css` injected

Base templates contain NO hardcoded colors — only layout structure + CSS variable references. The pack's `theme.css` provides all colors, fonts, and typography values.

**Override IS needed when:**
- The slide has glow, glassmorphism, or visual effects not in the base
- The layout structure itself differs (e.g., centered hero vs left-aligned)
- Decorative elements or unique arrangements exist

**Override is NOT needed when:**
- Only colors, fonts, or spacing differ → `theme.css` handles it
- Only content differs

---

## Step-by-Step Workflow

Always follow this order:

### Step 1: Analyze the PDF

Scan all pages. Identify the visual language: colors, fonts, spacing, gradients, mood.

### Step 2: Build the Mapping Table

Before writing any code, produce this table:

```
| Page | Common Type      | Override Needed | Reason                                      |
|------|------------------|-----------------|---------------------------------------------|
| 1    | cover            | ✅ Yes          | Gradient glow + centered layout, differs from base |
| 2    | contents         | ❌ No           | Standard structure, theme.css sufficient     |
| 3    | content          | ❌ No           | Title + body, standard                      |
| 4    | split-layout     | ✅ Yes          | Unique image frame treatment                 |
| ...  | ...              | ...             | ...                                         |
```

### Step 3: Write theme.css

### Step 4: Create override HTML (only where needed)

### Step 5: Package as ZIP and deliver

---

## theme.css Specification (REQUIRED)

Every pack MUST have a `theme.css`. This defines the pack's visual identity.

### Variable Structure

```css
:root {
  /* === Colors === */
  --bg-primary: #...;
  --bg-secondary: #...;
  --bg-elevated: #...;
  --text-primary: #...;
  --text-secondary: #...;
  --accent: #...;
  --border: #...;

  /* === Font === */
  --font-sans: 'Pretendard', -apple-system, sans-serif;
  --font-display: 'Pretendard', -apple-system, sans-serif;  /* optional */
  --font-accent: inherit;                                    /* optional */

  /* === Typography Scale === */
  --title-hero: 64pt;
  --title-section: 44pt;
  --title-slide: 32pt;
  --text-subtitle: 20pt;
  --text-body: 16pt;
  --text-caption: 11pt;
  --text-label: 10pt;
}
```

### Variable Names Are Fixed

The variable names above (`--bg-primary`, `--bg-secondary`, `--bg-elevated`, `--text-primary`, `--text-secondary`, `--accent`, `--border`, `--font-sans`, `--title-hero` through `--text-label`) are project standards. You MUST use these exact names. You MAY add extra variables if needed, but never rename or omit the standard ones.

### Extract Colors from PDF

Analyze the PDF's color palette and map it to the variables. Do not invent colors that aren't in the PDF.

### Typography Scale Reference

| Role | Size Range | Weight | letter-spacing | line-height |
|------|-----------|--------|---------------|-------------|
| Hero Title | 56–72pt | 700–800 | -0.02em | 1.2 |
| Section Title | 40–48pt | 700 | -0.02em | 1.2 |
| Slide Title | 28–36pt | 600–700 | -0.01em | 1.2 |
| Subtitle | 18–22pt | 500 | 0 | 1.4 |
| Body | 14–18pt | 400 | 0 | 1.6 |
| Caption | 10–12pt | 400 | 0.02em | 1.4 |
| Label | 9–11pt | 500–600 | 0.02em | 1.0 |

These ranges are guidelines. Adjust to match the PDF's visual impression, but stay within reasonable bounds.

---

## Font Rules

### Core Principle

**Always use Korean fonts as the base**, even if the PDF is in English. Korean fonts include English glyphs and ensure consistency when the templates are used with Korean content later.

### Font Variables

| Variable | Purpose | Allowed Pool | Required |
|----------|---------|-------------|----------|
| `--font-sans` | Body text | Korean pool | Yes |
| `--font-display` | Headlines | Korean pool | Optional (defaults to --font-sans) |
| `--font-accent` | Quotes, decorative text | Korean + English pool | Optional |

### Korean Font Pool

| Font | CDN | Character |
|------|-----|-----------|
| Pretendard | `cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css` | Neutral, most versatile (default) |
| Noto Sans KR | Google Fonts | Google ecosystem compatible |
| Spoqa Han Sans Neo | `spoqa.github.io/spoqa-han-sans/css/SpoqaHanSansNeo.css` | Clean, minimal |
| Wanted Sans | `cdn.jsdelivr.net/gh/wanteddev/wanted-sans@v1.0.3/packages/wanted-sans/fonts/webfonts/variable/split/WantedSansVariable.min.css` | Modern, strong for headlines |
| SUIT | `cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/variable/woff2/SUIT-Variable.css` | Pretendard variant |

### English Font Pool (accent only)

| Font | CDN | Character |
|------|-----|-----------|
| Inter | Google Fonts | Clean sans-serif |
| Playfair Display | Google Fonts | Classic serif, good for quotes |
| Space Grotesk | Google Fonts | Tech/modern feel |

### Selection Rules

- Choose the Korean font closest to the PDF's original typeface.
- If the font can't be identified, use Pretendard as default.
- Use `--font-display` separately only if headlines have a distinctly different feel from body text.
- `--font-accent` is only for quotes (`quote`, `quotes-grid` templates) or decorative text.

---

## Filename Rules (common-types.json)

### Absolute Rules

- Filenames MUST use only keys from `common-types.json`.
- Map every page to an existing common-type first.
- Even if the structure looks slightly different, check if an existing type can absorb it.
- Do NOT invent names like `goals`, `strategy`, `hero`, `section-hero`, `feature-showcase`, `priority-callout`.
- Do NOT create compound names like `chart-table.html` or `team-columns.html`.
- Do NOT include page numbers or content titles in filenames.

### Suffix Exception

If the same type has a clearly different structural variant, you may add a suffix:
- `content-centered.html`
- `split-layout-wide.html`

But the base filename MUST be a common-types key. Prefer extending `common-types.json` over inventing suffixes.

### Adding New Types

1. Only when no existing type can describe the structure.
2. Add the new entry to `common-types.json` FIRST.
3. Then use that key as the filename.
4. Include the updated `common-types.json` in the ZIP output.

---

## Slide Canvas

All templates use **720pt × 405pt (16:9)**.

### Layout Standards

```css
padding: 48pt;                          /* slide padding */
gap: 32pt;                              /* section gaps */
gap: 16pt;                              /* element gaps */
gap: 8pt;                               /* text block internal gaps */
grid-template-columns: 1fr 1fr;         /* 2-col equal */
grid-template-columns: 2fr 3fr;         /* 40:60 split */
grid-template-columns: repeat(3, 1fr);  /* 3-col */
```

These are defaults. Adjust if the PDF uses different proportions, but keep the general framework.

### 720pt Rebalancing (CRITICAL)

720pt is the canvas size. It does NOT mean "scale everything down proportionally."

**NEVER:**
- Mechanically shrink all elements by the same ratio
- Let headlines, cards, or placeholders become too small

**ALWAYS:**
- Rebalance elements for visual presence at 720pt
- Headlines should be bold and dominant
- Cards, shapes, and placeholders should maintain their visual weight
- The result should feel like the original PDF, not a shrunken version

**Failure criteria — if any of these look too small compared to the original, it's wrong:**
- Cover / section-divider headlines
- Split-layout images or placeholders
- Highlight key messages
- Key-metrics / principles cards
- Chart / diagram readability

---

## HTML Template Rules

### Document Structure

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="[FONT CDN URL]">
  <link rel="stylesheet" href="./theme.css">
  <style>
    body {
      margin: 0;
      width: 720pt;
      height: 405pt;
      font-family: var(--font-sans);
      background: var(--bg-primary);
      color: var(--text-primary);
      overflow: hidden;
    }
    .slide {
      width: 720pt;
      height: 405pt;
      padding: 48pt;
      box-sizing: border-box;
      position: relative;
    }
    /* template-specific styles */
  </style>
</head>
<body>
  <div class="slide">
    <!-- slide content with data-slot attributes -->
  </div>
</body>
</html>
```

### Text Rules (PPTX Compatibility)

- All text MUST be inside `<p>`, `<h1>`–`<h6>`, `<ul>`, `<ol>`, or `<li>`.
- NEVER place text directly in `<div>` or `<span>`.
- Reason: text outside semantic tags is lost during PPTX conversion.

### Image Rules

- Content images: `<img src="./assets/<file>" alt="description">`
- Placeholders: `<div data-image-placeholder></div>`
- `background-image` is allowed on `body` only (not for content images).

### Gradient Rules

- If the PDF has gradients, **reproduce them in CSS** (radial-gradient, linear-gradient).
- Gradients are for **backgrounds only** (body, .slide).
- Do NOT use gradients on content elements (cards, text boxes) — they break in PPTX conversion.
- For cover, section-divider, closing: combine multiple radial-gradients for depth and glow.

### data-slot Attributes (AI Editability)

Add `data-slot` to key elements for downstream AI editing:

```html
<h1 class="slide-title" data-slot="title">Title</h1>
<p class="slide-subtitle" data-slot="subtitle">Subtitle</p>
<p class="slide-body" data-slot="body">Body copy</p>
<div class="media-slot" data-slot="image"></div>
```

Recommended slots: `title`, `subtitle`, `body`, `image`, `caption`, `quote`, `author`, `metric`, `label`

---

## Gradient / Hero Page Treatment

Dark-background cover / section-divider / closing slides require detailed treatment:

- Do NOT flatten to a single solid color.
- Combine multiple `radial-gradient` layers for light bloom and depth.
- Add `linear-gradient` overlays if needed.
- Match the original PDF's atmosphere and color feel.
- Adjust headline size, subtitle, spacing, and footer text alongside the background — not just the background alone.

Remember: gradients are background-only (PPTX compatibility).

---

## Consolidation Principle

Do NOT create one HTML per PDF page. Group pages by layout structure.

Examples:
- Goals / Strategy / Design Concepts / Q&A → all `section-divider` if the layout is the same
- Agenda → `contents`
- Title + body text → `content`
- Left text + right image → `split-layout`
- Single bold message → `highlight`

**Even if the content meaning differs, if the layout structure is the same, normalize to the same common-type.**

---

## Art Direction Checklist

Before finalizing:

- [ ] Each slide has one clear visual anchor
- [ ] Key message is graspable in 3–5 seconds
- [ ] Looks premium without unnecessary decoration
- [ ] Sufficient whitespace (padding ≥ 48pt)
- [ ] Color palette stays within 2–3 colors
- [ ] Visually matches the original PDF's impression
- [ ] Cover slide has poster-like impact

---

## Final Deliverable

**Deliver a ZIP file** containing:

```
<PACK_ID>/
  theme.css
  templates/
    [override templates only]
  common-types.json          ← only if modified
```

Along with the ZIP, provide a brief summary:

1. **File list** — what's in the ZIP
2. **Mapping table** — every PDF page → common-type → override yes/no
3. **Consolidation notes** — which pages were grouped into the same template
4. **New types** — if any were added to common-types.json, explain why
5. **Calibration notes** — what was adjusted (headline sizes, placeholder ratios, gradient treatment, etc.)

**The code is the deliverable. Do not skip code in favor of explanations.**
