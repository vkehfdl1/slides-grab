# Pack Creation Prompt

> Paste this prompt (with your inputs filled in) into a new Claude session to create a pack from a PDF or HTML source.
> Process one pack per session.

---

## Prompt

```
Create a new template pack for the slides-grab project.

## Project Context

- Project: /Users/usuhwa/_workspace/bootstrap/slides-grab
- Read CLAUDE.md first
- Pack system: MD-based (design.md + pack.json + theme.css + preview.css)
- Slide size: 720pt × 405pt (fixed)
- Existing packs: `slides-grab list-packs`

## Input

- Source file: <path to PDF or HTML>
- Pack name: <PACK_ID> (lowercase, hyphens only — e.g. `nordic-light`) or "decide from source"

## What to Create

Create these files under `packs/<PACK_ID>/`:

```
packs/<PACK_ID>/
  ├── pack.json       ← metadata
  ├── design.md       ← design philosophy (the most important file)
  ├── theme.css       ← CSS variables
  └── preview.css     ← gallery card thumbnail
```

Do NOT run `slides-grab pack init`. Create files directly.

---

## Step 1: Analyze the Source

Read/view the PDF or HTML carefully. Extract:

- **Color palette**: exact hex values for background, text, accent, borders
- **Typography**: font family names, sizes, weights used for titles/body/labels
- **Mood**: 2–4 adjectives (e.g. "clean, bold, corporate, trustworthy")
- **Signature elements**: the visual motifs that make this design distinct (e.g. red rule lines, rounded white cards, gradient orbs, hard drop shadows)
- **Layout patterns**: how content is typically arranged (hero centered, left-aligned, grid cards, etc.)
- **What to avoid**: what would break the design feel

---

## Step 2: Create `pack.json`

```json
{
  "name": "한국어 팩 이름 (e.g. 심플 다크, 오로라 그래디언트)",
  "mood": ["word1", "word2", "word3"],
  "bestFor": "Type of presentations this pack suits best",
  "order": 99,
  "description": "One-line description of the visual identity",
  "tags": ["tag1", "tag2", "tag3"]
}
```

**`order`**: pick a number that fits among existing packs. Run `slides-grab list-packs` to see current ordering.

---

## Step 3: Create `design.md` (most important)

This file is the design brain of the pack. The design-skill reads it before generating any slide. Write it thoroughly.

### Structure

```markdown
# <Pack Name> Design Spec

## Identity

**Mood**: word1, word2, word3
**Best For**: <use cases>

<2–4 sentence description of the visual philosophy — what this pack IS and what makes it distinct>

---

## Signature Elements

- **<Element name>**: <description with exact values where possible>
- **<Element name>**: <description>
- ... (4–8 elements)

---

## CSS Patterns

### Base Slide

```css
body {
  width: 720pt;
  height: 405pt;
  font-family: var(--font-sans);
  background: var(--bg-primary);
  color: var(--text-primary);
  padding: 56pt 72pt;
  word-break: keep-all;
  overflow-wrap: break-word;
}
```

### <Pattern Name> (e.g. Hero, Card Grid, Split Layout)

```css
/* verified CSS snippet for this pattern */
```

(Provide 3–5 patterns that cover the most common slide layouts for this pack)

---

## Font Pairing

Use a table or bullet list — choose what's clearest for this pack.

| Role | Font | Size | Weight | letter-spacing | line-height |
|------|------|------|--------|---------------|------------|
| Hero Title | <font name> | <pt> | <weight> | <em> | <value> |
| Section Title | <font name> | <pt> | <weight> | <em> | <value> |
| Slide Title | <font name> | <pt> | <weight> | <em> | <value> |
| Subtitle | <font name> | <pt> | <weight> | <em> | <value> |
| Body | <font name> | <pt> | <weight> | <em> | <value> |
| Caption | <font name> | <pt> | <weight> | <em> | <value> |
| Label | <font name> | <pt> | <weight> | <em> | <value> |

---

## Color Usage

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#...` | Main slide background |
| `--bg-secondary` | `#...` | Secondary background areas |
| `--bg-elevated` | `#...` | Card / elevated surface backgrounds |
| `--text-primary` | `#...` | Headings and primary text |
| `--text-secondary` | `#...` | Subtitles, descriptions |
| `--accent` | `#...` | Accent color — labels, highlights, key numbers |
| `--border` | `#...` | Dividers, borders (use sparingly) |

<Any additional color notes — e.g. specific rgba values, when to use hardcoded hex vs variables>

---

## Layout Principles

Describe 2–3 core layout patterns with brief explanations. ASCII mockups are helpful but optional.

### Pattern A — <Name> (e.g. Hero / Full-bleed)

<Description of when and how to use this layout>

### Pattern B — <Name>

...

### Pattern C — <Name>

...

---

## Avoid

- <What breaks this pack's visual feel>
- <Color or style not to use>
- <Layout patterns incompatible with this pack>

---

## Webfont CDN

```html
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet">
```

(Update URL if the pack uses a different webfont. Keep Pretendard as fallback.)
```

---

## Step 4: Create `theme.css`

```css
:root {
  /* === Background === */
  --bg-primary: #...;
  --bg-secondary: #...;
  --bg-elevated: #...;

  /* === Text === */
  --text-primary: #...;
  --text-secondary: #...;

  /* === Accent === */
  --accent: #...;

  /* === Border === */
  --border: #...;

  /* === Font === */
  --font-sans: 'Font Name', 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;

  /* === Typography scale === */
  --title-hero: 64pt;      /* adjust to match pack character */
  --title-section: 44pt;
  --title-slide: 32pt;
  --text-subtitle: 20pt;
  --text-body: 16pt;
  --text-caption: 11pt;
  --text-label: 10pt;
}
```

**Font policy**: Prefer Korean-compatible fonts (Pretendard, Noto Sans KR, Spoqa Han Sans Neo). If source PDF uses a Latin-only font, pair it with Pretendard as fallback.

**Required tokens**: All 7 background/text/accent/border variables + `--font-sans` + all 7 typography scale variables.

---

## Step 5: Create `preview.css`

This generates the miniature thumbnail shown in the pack gallery card.
The preview card is approximately **234px × 132px**, class name: `.preview-<PACK_ID>`.

Use absolutely-positioned `div` elements (`.el-1`, `.el-2`, `.el-3`) to represent the visual identity at a glance. Keep it abstract — convey the color palette and signature element, not actual slide content.

```css
/* <Pack Name> — <one-line visual description> */
.preview-<PACK_ID> {
  background: <bg-primary hex>;
}

/* Element 1 — e.g. title bar */
.preview-<PACK_ID> .el-1 {
  position: absolute;
  top: 40px;
  left: 32px;
  width: 150px;
  height: 16px;
  background: <text-primary or accent hex>;
  border-radius: 2px;
}

/* Element 2 — e.g. subtitle bar */
.preview-<PACK_ID> .el-2 {
  position: absolute;
  top: 68px;
  left: 32px;
  width: 90px;
  height: 8px;
  background: <text-secondary hex>;
  border-radius: 1px;
}

/* Element 3 — e.g. card or decorative shape */
.preview-<PACK_ID> .el-3 {
  position: absolute;
  bottom: 28px;
  left: 32px;
  width: 170px;
  height: 36px;
  background: <bg-elevated or accent hex>;
  border-radius: 6px;
}
```

You can add `::before` and `::after` pseudo-elements on `.el-3` for additional detail. Keep the total element count to 3–5 to stay readable at thumbnail size.

---

## Step 6: Validate

```bash
slides-grab show-pack <PACK_ID>
```

Check that:
- Pack name, mood, and tags appear correctly
- Color swatches display the right palette

---

## Reference: Well-made existing packs

```bash
# Browse all packs
slides-grab list-packs

# Inspect a specific pack
cat packs/simple-dark/design.md
cat packs/simple-dark/theme.css
cat packs/simple-dark/preview.css

# See full design philosophy of a different style
cat packs/neo-brutalism/design.md
cat packs/glassmorphism/design.md
```

---

## Done Criteria

- [ ] `pack.json` — all required fields present (`name`, `mood`, `bestFor`, `order`, `description`, `tags`)
- [ ] `design.md` — all 8 sections present (Identity, Signature Elements, CSS Patterns, Font Pairing, Color Usage, Layout Principles, Avoid, Webfont CDN)
- [ ] `theme.css` — all 7 color tokens + `--font-sans` + all 7 typography scale tokens
- [ ] `preview.css` — `.preview-<PACK_ID>` class with at least 3 elements representing the visual identity
- [ ] `slides-grab show-pack <PACK_ID>` shows correct info without errors
- [ ] All text content in design.md is accurate to the source (no invented colors or fonts)
```

---

## Example Usage

```
Source file: /path/to/brand-deck.pdf
Pack name: decide from source

(AI analyzes the PDF and picks an appropriate pack ID)
```

Or with explicit name:

```
Source file: /path/to/corporate-slides.pdf
Pack name: executive-blue
```
