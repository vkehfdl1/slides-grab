# New Pack Creation Prompt

> Use this prompt in a new session to create a template pack from scratch.
> Process one pack at a time.

---

## Prompt

```
Create a new template pack for the slides-grab project.

## Project Context

- Project: /Users/usuhwa/_workspace/bootstrap/slides-grab
- Read CLAUDE.md first  
- Design spec: skills/slides-grab-design/references/design-system-full.md
- Art direction: skills/slides-grab-design/references/beautiful-slide-defaults.md
- Charts/Icons: skills/slides-grab-design/references/charts-icons-library.md
- Slide size: 720pt x 405pt (fixed)
- Existing packs: run `slides-grab list-packs` to see

## New Pack Info

- Pack name: `<PACK_ID>` (lowercase, underscores only)
- Concept: <describe mood/purpose, e.g. "dark background with neon accents, for tech startup pitches">
- Color direction: <desired colors or "up to you">

## Workflow

### Step 1: Initialize the pack

```bash
slides-grab pack init <PACK_ID>
```

This creates `packs/<PACK_ID>/theme.css` and `packs/<PACK_ID>/templates/`.

### Step 2: Write theme.css

Define the pack's colors and typography:

```css
:root {
  /* Colors */
  --bg-primary: #...;
  --bg-secondary: #...;
  --text-primary: #...;
  --text-secondary: #...;
  --text-muted: #...;
  --accent: #...;
  --border-color: #...;

  /* Font */
  --font-sans: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;

  /* Typography scale (standard baseline, adjust to fit pack character) */
  --title-hero: 64pt;
  --title-section: 44pt;
  --title-slide: 32pt;
  --text-subtitle: 20pt;
  --text-body: 16pt;
  --text-caption: 11pt;
  --text-label: 10pt;
}
```

### Step 3: Create override templates (only when needed)

`simple_light` serves as the base — all 25 common types are covered by fallback.
Only create a template override when the base layout does NOT work with your pack's theme.css.

**When to create an override:**
- The pack needs a unique HTML structure (e.g. glow effects, device mockups, glass cards)
- The base layout breaks visually with the pack's colors/fonts
- The pack has a distinctive visual language that CSS variables alone can't express

**When NOT to create an override:**
- The base template + your theme.css looks fine
- You only need different font sizes or colors (use theme.css variables)

**Common overrides:** `cover.html`, `section-divider.html` (these tend to be most pack-specific)

### Step 4: Validate

```bash
slides-grab validate --slides-dir <test-slides>
slides-grab show-pack <PACK_ID>
```

## Template HTML Structure

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <style>
    :root {
      /* inline copy of theme.css variables */
    }
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
  </style>
</head>
<body>
  <div class="slide">
    <!-- slide content -->
  </div>
</body>
</html>
```

## Text Rules
- All text must be inside `<p>`, `<h1>`-`<h6>`, `<ul>`, `<ol>`, or `<li>`
- Never place text directly in `<div>` or `<span>`
- Reason: text outside semantic tags is lost during PPTX conversion

## Image Rules
- Use `<img src="./assets/<file>" alt="description">` for images
- `background-image` is allowed on body only (not for content images)
- Use `<div data-image-placeholder>` for image placeholders

## Color Rules
- Use CSS variable references like `var(--accent)` throughout
- Always include `#` prefix for hardcoded hex colors
- Avoid CSS gradients — they are not supported in PPTX conversion

## Typography Scale

| Role | Size Range | Weight | letter-spacing | line-height |
|------|-----------|--------|---------------|------------|
| Hero Title | 56-72pt | 700-800 | -0.02em | 1.2 |
| Section Title | 40-48pt | 700 | -0.02em | 1.2 |
| Slide Title | 28-36pt | 600-700 | -0.01em | 1.2 |
| Subtitle | 18-22pt | 500 | 0 | 1.4 |
| Body | 14-18pt | 400 | 0 | 1.6 |
| Caption | 10-12pt | 400 | 0.02em | 1.4 |
| Label | 9-11pt | 500-600 | 0.02em | 1.0 |

Adjust within ranges to match the pack's character. Keep sizes consistent across all templates in the pack.

## Layout Standards

```css
/* Slide padding */
padding: 48pt;

/* Section gaps */
gap: 32pt;

/* Element gaps */
gap: 16pt;

/* Text block internal gaps */
gap: 8pt;

/* Grid layouts */
grid-template-columns: 1fr 1fr;       /* 2-col equal */
grid-template-columns: 2fr 3fr;       /* 40:60 */
grid-template-columns: repeat(3, 1fr); /* 3-col */
```

## Art Direction Checklist

Before marking the pack as complete, verify:

- [ ] Each slide has one job and one dominant visual anchor
- [ ] Main message is graspable in 3-5 seconds
- [ ] Looks premium without shadows, cards, or extra chrome
- [ ] Sufficient whitespace (padding >= 48pt)
- [ ] No decorative elements that can be removed without losing meaning
- [ ] Cover slide has poster-like impact
- [ ] Color palette stays within 2-3 colors

## Reference: Well-made existing packs

```bash
# simple_light — most complete pack (23 templates)
slides-grab show-pack simple_light
slides-grab show-template cover --pack simple_light

# simple_dark — good CSS variable usage
slides-grab show-pack simple_dark
slides-grab show-template cover --pack simple_dark
```

Reference existing pack structure, but create a unique design language for the new pack.

## Done Criteria

- [ ] theme.css defines all standard variables (colors + --font-sans + typography scale)
- [ ] Override templates created only where base layout is insufficient
- [ ] All text inside semantic tags (in override templates)
- [ ] Typography scale values suit the pack's character
- [ ] `slides-grab show-pack <PACK_ID>` shows correct info
- [ ] Base template fallback works: `slides-grab show-template content --pack <PACK_ID>` loads simple_light version
- [ ] Validation passes
```

---

## Usage

1. Open a new session and paste the prompt above
2. Replace `<PACK_ID>` with your desired pack name
3. Fill in the concept and color direction
4. Process one pack per session (8-15 templates x 50-80 lines = significant volume)

## Example

```
Pack name: neon_dark
Concept: Deep navy background with cyan/magenta neon accents. For tech startup pitches. Futuristic and high-impact.
Color direction: background #0a0e1a, text #e8eaf0, accent #00e5ff / #ff00e5
```
