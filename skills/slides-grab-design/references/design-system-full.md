# Design Skill - Professional Presentation Design System

A skill for designing HTML slides for top-tier business presentations.
Delivers minimal, refined design with professional typography and precise layouts.

---

## Core Design Philosophy

### 1. Less is More
- Remove unnecessary decorative elements
- Content takes center stage
- Leverage whitespace aggressively
- Clear visual hierarchy

### 2. Typography-Driven Design
- Pretendard as the default font
- Font size contrast creates visual impact
- Fine-tuned letter-spacing and line-height
- Weight variations for emphasis

### 3. Strategic Color Usage
- Limited color palette (2-3 colors)
- Monotone base + accent color
- Background color sets the mood
- High contrast for readability

---

## Base Settings

### Slide Size (16:9 default)
```html
<body style="width: 720pt; height: 405pt;">
```

### Supported Aspect Ratios
| Ratio | Size | Use Case |
|-------|------|----------|
| 16:9 | 720pt x 405pt | Default, monitors/screens |
| 4:3 | 720pt x 540pt | Legacy projectors |
| 16:10 | 720pt x 450pt | MacBook |

### Default Font Stack
```css
font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Pretendard Webfont CDN
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
```

---

## Typography System

### Font Size Scale
| Purpose | Size | Weight | Example |
|---------|------|--------|---------|
| Hero Title | 72-96pt | 700-800 | Cover main title |
| Section Title | 48-60pt | 700 | Section divider heading |
| Slide Title | 32-40pt | 600-700 | Slide heading |
| Subtitle | 20-24pt | 500 | Subtitle, description |
| Body | 16-20pt | 400 | Body text |
| Caption | 12-14pt | 400 | Caption, source |
| Label | 10-12pt | 500-600 | Badge, tag |

### Letter Spacing
```css
/* Large titles: tight */
letter-spacing: -0.02em;

/* Medium titles */
letter-spacing: -0.01em;

/* Body: default */
letter-spacing: 0;

/* Captions, labels: slightly wider */
letter-spacing: 0.02em;
```

### Line Height
```css
/* Titles */
line-height: 1.2;

/* Body text */
line-height: 1.6 - 1.8;

/* Single-line text */
line-height: 1;
```

---

## Color Palette System

### 1. Executive Minimal (Recommended Default)
Refined business presentation look
- File: `themes/executive.css`

### 2. Sage Professional
Calm and trustworthy tone
- File: `themes/sage.css`

### 3. Modern Dark
High-impact dark theme
- File: `themes/modern-dark.css`

### 4. Corporate Blue
Traditional business tone
- File: `themes/corporate.css`

### 5. Warm Neutral
Warm and approachable tone
- File: `themes/warm.css`

Theme files use shared CSS variables (`:root`). Copy a theme file to create a custom theme.

---

## Layout System

### Spacing Standards (padding/margin)
```css
/* Full slide padding */
padding: 48pt;

/* Section spacing */
gap: 32pt;

/* Element spacing */
gap: 16pt;

/* Text block internal spacing */
gap: 8pt;
```

### Grid System
```css
/* 2-column layout */
display: grid;
grid-template-columns: 1fr 1fr;
gap: 32pt;

/* 3-column layout */
grid-template-columns: repeat(3, 1fr);

/* Asymmetric layout (40:60) */
grid-template-columns: 2fr 3fr;

/* Asymmetric layout (30:70) */
grid-template-columns: 1fr 2.3fr;
```

---

## Design Components

### 1. Badge/Tag
```html
<p style="
  display: inline-block;
  padding: 6pt 14pt;
  border: 1px solid #1a1a1a;
  border-radius: 20pt;
  font-size: 10pt;
  font-weight: 500;
  letter-spacing: 0.02em;
  text-transform: uppercase;
">PRESENTATION</p>
```

### 2. Section Number
```html
<p style="
  display: inline-block;
  padding: 4pt 12pt;
  background: #1a1a1a;
  color: #ffffff;
  border-radius: 4pt;
  font-size: 10pt;
  font-weight: 600;
">SECTION 1</p>
```

### 3. Logo Area
```html
<div style="display: flex; align-items: center; gap: 8pt;">
  <div style="
    width: 20pt;
    height: 20pt;
    background: #1a1a1a;
    border-radius: 4pt;
    display: flex;
    align-items: center;
    justify-content: center;
  ">
    <p style="color: #fff; font-size: 12pt;">*</p>
  </div>
  <p style="font-size: 12pt; font-weight: 600;">LogoName</p>
</div>
```

### 4. Icon Button
```html
<div style="
  width: 32pt;
  height: 32pt;
  border: 1px solid #1a1a1a;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
">
  <p style="font-size: 14pt;">&#x2197;</p>
</div>
```

### 5. Divider Line
```html
<div style="
  width: 100%;
  height: 1pt;
  background: #d4d4d0;
"></div>
```

### 6. Info Grid
```html
<div style="display: flex; gap: 48pt;">
  <div>
    <p style="font-size: 10pt; color: #999; margin-bottom: 4pt;">Contact</p>
    <p style="font-size: 12pt; font-weight: 500;">334556774</p>
  </div>
  <div>
    <p style="font-size: 10pt; color: #999; margin-bottom: 4pt;">Date</p>
    <p style="font-size: 12pt; font-weight: 500;">March 2025</p>
  </div>
</div>
```

---

## Slide Templates

### 1. Cover Slide
- Template file: `templates/cover.html`

### 2. Table of Contents (Contents)
- Template file: `templates/contents.html`

### 3. Section Divider
- Template file: `templates/section-divider.html`

### 4. Content Slide
- Template file: `templates/content.html`

### 5. Statistics/Data Slide
- Template file: `templates/statistics.html`

### 6. Image + Text (Split Layout)
- Template file: `templates/split-layout.html`

### 7. Team Introduction
- Template file: `templates/team.html`

### 8. Quote Slide
- Template file: `templates/quote.html`

### 9. Timeline Slide
- Template file: `templates/timeline.html`

### 10. Closing Slide
- Template file: `templates/closing.html`

### 11. Chart Slide
- Template file: `templates/chart.html`

### 12. Diagram Slide
- Template file: `templates/diagram.html`

### Custom Templates
- Custom template directory: `templates/custom/`
- Users can add template files as drop-in for reuse.

---

## Advanced Design Patterns

### Asymmetric Layout
Eye-catching compositions
```css
/* Golden ratio */
grid-template-columns: 1fr 1.618fr;

/* Extreme asymmetry */
grid-template-columns: 1fr 3fr;
```

### Overlay Text
Text placed over images
```html
<div style="position: relative;">
  <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.5);"></div>
  <div style="position: relative; z-index: 1;">
    <h2 style="color: #fff;">Overlay Text</h2>
  </div>
</div>
```

### Gradient Overlay
```html
<div style="
  background: linear-gradient(to right, #1a1a1a 0%, transparent 60%);
  position: absolute;
  inset: 0;
"></div>
```

### Card Style
```html
<div style="
  background: #ffffff;
  border-radius: 12pt;
  padding: 24pt;
  box-shadow: 0 2pt 8pt rgba(0,0,0,0.08);
"></div>
```

---

## Chart / Diagram / Image Library Guide

### 1. Chart.js (Bar / Line / Pie)

#### CDN Link
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```

#### Usage Example
```html
<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16pt;">
  <div style="border: 1px solid #e5e5e0; border-radius: 10pt; padding: 10pt;">
    <p style="font-size: 10pt; margin-bottom: 6pt;">Bar Chart</p>
    <canvas id="barChart" style="width: 100%; height: 120pt;"></canvas>
  </div>
  <div style="border: 1px solid #e5e5e0; border-radius: 10pt; padding: 10pt;">
    <p style="font-size: 10pt; margin-bottom: 6pt;">Line Chart</p>
    <canvas id="lineChart" style="width: 100%; height: 120pt;"></canvas>
  </div>
  <div style="border: 1px solid #e5e5e0; border-radius: 10pt; padding: 10pt;">
    <p style="font-size: 10pt; margin-bottom: 6pt;">Pie Chart</p>
    <canvas id="pieChart" style="width: 100%; height: 120pt;"></canvas>
  </div>
</div>

<script>
  const labels = ['Q1', 'Q2', 'Q3', 'Q4'];
  const values = [12, 19, 15, 23];

  new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: ['#1f2937', '#2563eb', '#10b981', '#f59e0b'] }] },
    options: { animation: false, responsive: true, maintainAspectRatio: false }
  });

  new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: { labels, datasets: [{ data: values, borderColor: '#2563eb', backgroundColor: '#93c5fd', fill: true }] },
    options: { animation: false, responsive: true, maintainAspectRatio: false }
  });

  new Chart(document.getElementById('pieChart'), {
    type: 'pie',
    data: { labels, datasets: [{ data: [35, 28, 22, 15], backgroundColor: ['#2563eb', '#10b981', '#f59e0b', '#ef4444'] }] },
    options: { animation: false, responsive: true, maintainAspectRatio: false }
  });
</script>
```

Recommendations:
- Use `options.animation: false` for stable PPTX conversion.
- Set explicit width/height on `canvas` elements.

### 2. Mermaid (Flowchart / Sequence Diagram)

#### CDN Link
```html
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
```

#### Usage Example
```html
<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20pt;">
  <div style="border: 1px solid #e5e5e0; border-radius: 10pt; padding: 10pt;">
    <p style="font-size: 10pt; margin-bottom: 6pt;">Flowchart</p>
    <pre class="mermaid">
flowchart LR
  A[Plan] --> B[Design]
  B --> C[Review]
  C --> D[Convert]
    </pre>
  </div>
  <div style="border: 1px solid #e5e5e0; border-radius: 10pt; padding: 10pt;">
    <p style="font-size: 10pt; margin-bottom: 6pt;">Sequence Diagram</p>
    <pre class="mermaid">
sequenceDiagram
  participant U as User
  participant A as Agent
  U->>A: Request slide
  A->>U: Return HTML
    </pre>
  </div>
</div>

<script>
  mermaid.initialize({ startOnLoad: true, securityLevel: 'loose' });
</script>
```

Recommendations:
- Write Mermaid DSL inside `<pre class="mermaid">`.
- Fix the diagram container size for stable layout.

### 3. Inline SVG Icon Guide

```html
<div style="display: flex; align-items: center; gap: 8pt;">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12h14M12 5l7 7-7 7" stroke="#1f2937" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
  </svg>
  <p style="font-size: 12pt; color: #1f2937;">Next step</p>
</div>
```

Rules:
- Always specify `viewBox`.
- Set explicit size via `width`/`height`.
- Use HEX values with `#` prefix for `stroke`/`fill` colors.
- Place text outside SVG using `<p>`, `<h1>`-`<h6>` tags.

### 4. Image Usage Rules (Local Asset / Data URL / Remote URL / Placeholder)

#### Canonical Local Asset Image
```html
<img src="./assets/team-photo.png" alt="Team photo" style="width: 220pt; height: 140pt; object-fit: cover;">
```

Store the image at `<slides-dir>/assets/team-photo.png`.

#### Self-Contained Fallback (`data:` URL)
```html
<img src="data:image/svg+xml;base64,..." alt="Illustration" style="width: 220pt; height: 140pt; object-fit: cover;">
```

#### Remote URL (Best-Effort Only)
```html
<img src="https://images.example.com/hero.png" alt="Hero image" style="width: 220pt; height: 140pt; object-fit: cover;">
```

#### Placeholder (Image Stand-In)
```html
<div data-image-placeholder style="width: 220pt; height: 140pt; border: 1px dashed #c7c7c7; background: #f3f4f6; display: flex; align-items: center; justify-content: center;">
  <p style="font-size: 10pt; color: #6b7280; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;">Image Placeholder</p>
</div>
```

Rules:
- Always include `alt` on `img` tags.
- Use `./assets/<file>` as the default image contract for slide HTML.
- Keep slide assets in `<slides-dir>/assets/`.
- `data:` URLs are allowed for fully self-contained slides.
- Remote `https://` URLs are allowed but non-deterministic and should be treated as fallback only.
- Do not use absolute filesystem paths in slide HTML.
- Do not use non-body `background-image` for content imagery; use `<img>` instead.
- Use `data-image-placeholder` to reserve space when no image is available yet.
- Use high-resolution originals and fit with `object-fit`.

---

## Text Usage Rules

### Required Tags
```html
<!-- All text MUST be inside these tags -->
<p>, <h1>-<h6>, <ul>, <ol>, <li>

<!-- Forbidden - ignored in PowerPoint conversion -->
<div>text here</div>
<span>text here</span>
```

### Recommended Usage
```html
<!-- Good -->
<h1 style="...">Title</h1>
<p style="...">Body text</p>

<!-- Bad -->
<div style="...">Text directly in div</div>
```

---

## Output and File Structure

### File Save Rules
```
<slides-dir>/   (default: slides/)
├── slide-01.html  (Cover)
├── slide-02.html  (Contents)
├── slide-03.html  (Section Divider)
├── slide-04.html  (Content)
├── ...
└── slide-XX.html  (Closing)
```

### File Naming Rules
- Use 2-digit numbers: `slide-01.html`, `slide-02.html`
- Name sequentially
- No special characters or spaces

---

## Workflow (Stage 2: Design + Human Review)

This skill is **Stage 2**. It works from the `slide-outline.md` approved by the user in Stage 1 (plan-skill).

### Prerequisites
- `slide-outline.md` must exist and be approved by the user.

### Steps

1. **Analyze + Design**: Read `slide-outline.md`, decide theme/layout, generate HTML slides
2. **Validate slides**: After slide generation or edits, automatically run:
   ```bash
   slides-grab validate --slides-dir <path>
   ```
3. **Auto-fix validation issues**: If validation fails, fix the source HTML/CSS and re-run validation until it passes
4. **Auto-build viewer**: After validation passes, automatically run:
   ```bash
   node scripts/build-viewer.js --slides-dir <path>
   ```
5. **Guide user to review**: Tell the user to check slides in the browser:
   ```
   open <slides-dir>/viewer.html
   ```
6. **Revision loop**: When the user requests changes to specific slides:
   - Edit only the relevant HTML file
   - Re-run `slides-grab validate --slides-dir <path>` and fix any failures
   - Re-run `node scripts/build-viewer.js --slides-dir <path>` to rebuild the viewer
   - Guide user to review again
7. **Completion**: Repeat the revision loop until the user signals approval for PPTX conversion

### Absolute Rules
- **Never start PPTX conversion without approval** — PPTX conversion is the responsibility of `pptx-skill` and requires explicit user approval.
- **Never skip validation** — Run `slides-grab validate --slides-dir <path>` after generation or edits and fix failures before review.
- **Never forget to build the viewer** — Run `node scripts/build-viewer.js --slides-dir <path>` every time slides are generated or modified.

---

## Important Notes

1. **CSS gradients**: Not supported in PowerPoint conversion — replace with background images
2. **Webfonts**: Always include the Pretendard CDN link
3. **Image paths**: Use `./assets/<file>` from each `slide-XX.html`; avoid absolute filesystem paths
4. **Colors**: Always include `#` prefix in CSS
5. **Text rules**: Never place text directly in div/span
