import { RAW_DESIGN_STYLES } from './design-styles-data.js';

export const DESIGN_STYLES_SOURCE = Object.freeze({
  name: 'PPT Design Collections',
  repo: 'corazzon/pptx-design-styles',
  url: 'https://github.com/corazzon/pptx-design-styles',
  previewUrl: 'https://corazzon.github.io/pptx-design-styles/preview/modern-pptx-designs-30.html',
  references: [
    'README.md',
    'preview/modern-pptx-designs-30.html',
    'references/styles.md',
  ],
  license: 'MIT',
  citation: 'Design collections derived from corazzon/pptx-design-styles.',
});

const STYLE_GUIDE = Object.freeze([
  {
    goal: 'Tech / AI / Startup',
    recommended: ['glassmorphism', 'aurora-neon-glow', 'cyberpunk-outline-hud', 'scifi-holographic-data'],
  },
  {
    goal: 'Corporate / Finance',
    recommended: ['swiss-international', 'monochrome-minimal', 'editorial-magazine'],
  },
  {
    goal: 'Brand / Marketing',
    recommended: ['gradient-mesh', 'typographic-bold', 'duotone-color-split'],
  },
  {
    goal: 'Product / App / UX',
    recommended: ['bento-grid', 'claymorphism', 'pastel-soft-ui'],
  },
  {
    goal: 'Entertainment / Gaming',
    recommended: ['retro-y2k', 'dark-neon-miami', 'vaporwave', 'memphis-pop-pattern'],
  },
  {
    goal: 'Eco / Wellness',
    recommended: ['hand-crafted-organic', 'nordic-minimalism', 'dark-forest-nature'],
  },
  {
    goal: 'Luxury / Premium',
    recommended: ['art-deco-luxe', 'monochrome-minimal', 'dark-academia'],
  },
  {
    goal: 'Science / Biotech',
    recommended: ['liquid-blob-morphing', 'scifi-holographic-data', 'aurora-neon-glow'],
  },
]);

const DESIGN_STYLES = RAW_DESIGN_STYLES.map((style) => Object.freeze({
  ...style,
  source: DESIGN_STYLES_SOURCE,
}));

const DESIGN_STYLES_BY_ID = new Map(DESIGN_STYLES.map((style) => [style.id, style]));

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderList(items = []) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join('');
}

function renderPalette(colors = []) {
  return colors.map((color) => `
    <li class="palette-item">
      <span class="swatch" style="background:${escapeHtml(color.hex)}"></span>
      <div>
        <strong>${escapeHtml(color.label)}</strong>
        <div>${escapeHtml(color.role)} · ${escapeHtml(color.hex)}</div>
      </div>
    </li>
  `).join('');
}

function renderStyleCard(style, selectedStyleId) {
  const isSelected = style.id === selectedStyleId;
  return `
    <article class="style-card${isSelected ? ' style-card-selected' : ''}">
      <div class="style-card-header">
        <div>
          <p class="eyebrow">Style ${escapeHtml(style.number)}</p>
          <h2>${escapeHtml(style.title)}</h2>
          <p class="meta">${escapeHtml(style.id)} · ${escapeHtml(style.mood)} · Best for ${escapeHtml(style.bestFor)}</p>
        </div>
        ${isSelected ? '<p class="selected-badge">Selected style</p>' : ''}
      </div>
      <section>
        <h3>Background</h3>
        <ul>${renderList(style.background)}</ul>
      </section>
      <section>
        <h3>Palette</h3>
        <ul class="palette">${renderPalette(style.colors)}</ul>
      </section>
      <section>
        <h3>Fonts</h3>
        <ul>${renderList(style.fonts)}</ul>
      </section>
      <section>
        <h3>Layout</h3>
        <ul>${renderList(style.layout)}</ul>
      </section>
      <section>
        <h3>Signature elements</h3>
        <ul>${renderList(style.signature)}</ul>
      </section>
      <section>
        <h3>Avoid</h3>
        <ul>${renderList(style.avoid)}</ul>
      </section>
      <div class="style-card-footer">
        <code>slides-grab preview-styles --style ${escapeHtml(style.id)}</code>
        <code>slides-grab select-style ${escapeHtml(style.id)}</code>
      </div>
    </article>
  `;
}

function renderSelectionGuide() {
  return STYLE_GUIDE.map((entry) => `
    <li>
      <strong>${escapeHtml(entry.goal)}</strong>
      <span>${escapeHtml(entry.recommended.join(', '))}</span>
    </li>
  `).join('');
}

export function listDesignStyles() {
  return DESIGN_STYLES;
}

export function getDesignStyle(styleId) {
  if (!styleId) {
    return null;
  }
  return DESIGN_STYLES_BY_ID.get(styleId) ?? null;
}

export function requireDesignStyle(styleId) {
  const style = getDesignStyle(styleId);
  if (!style) {
    throw new Error(`Unknown style "${styleId}". Run "slides-grab list-styles" to inspect the bundled collection.`);
  }
  return style;
}

export function buildStylePreviewHtml({ styleId, styles, selectedStyleId } = {}) {
  const resolvedStyles = styles ?? (styleId ? [requireDesignStyle(styleId)] : listDesignStyles());
  const resolvedSelectedStyleId = selectedStyleId ?? styleId ?? null;
  const selectedStyle = resolvedSelectedStyleId ? getDesignStyle(resolvedSelectedStyleId) : null;
  const title = resolvedStyles.length === 1
    ? `${resolvedStyles[0].title} — slides-grab design preview`
    : `Previewing ${resolvedStyles.length} bundled design styles`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0b1020;
      --surface: rgba(11, 16, 32, 0.8);
      --surface-strong: rgba(17, 24, 39, 0.95);
      --border: rgba(148, 163, 184, 0.24);
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #7dd3fc;
      --accent-strong: #38bdf8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 32px;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background:
        radial-gradient(circle at top left, rgba(56, 189, 248, 0.22), transparent 28%),
        radial-gradient(circle at top right, rgba(167, 139, 250, 0.18), transparent 24%),
        linear-gradient(180deg, #020617 0%, var(--bg) 100%);
      color: var(--text);
      line-height: 1.6;
    }
    a { color: var(--accent); }
    code {
      display: inline-block;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--border);
      font-size: 0.92rem;
    }
    .hero {
      display: grid;
      gap: 18px;
      margin-bottom: 28px;
      padding: 24px;
      border-radius: 24px;
      background: var(--surface);
      border: 1px solid var(--border);
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.4);
      backdrop-filter: blur(18px);
    }
    .hero h1 {
      margin: 0;
      font-size: clamp(2rem, 5vw, 3.4rem);
      line-height: 1.05;
    }
    .hero p {
      margin: 0;
      color: var(--muted);
      max-width: 70ch;
    }
    .hero-grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }
    .hero-panel {
      padding: 18px;
      border-radius: 20px;
      background: var(--surface-strong);
      border: 1px solid var(--border);
    }
    .hero-panel h2,
    .hero-panel h3,
    .style-card h3 {
      margin: 0 0 8px;
      font-size: 1rem;
      letter-spacing: 0.01em;
    }
    .hero-panel ul,
    .style-card ul {
      margin: 0;
      padding-left: 18px;
    }
    .hero-panel li,
    .style-card li { color: var(--muted); }
    .selection-guide {
      display: grid;
      gap: 10px;
      padding-left: 0;
      list-style: none;
    }
    .selection-guide li {
      display: grid;
      gap: 4px;
      padding: 12px 14px;
      border-radius: 16px;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid var(--border);
    }
    .styles-grid {
      display: grid;
      gap: 18px;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      align-items: start;
    }
    .style-card {
      padding: 22px;
      border-radius: 22px;
      background: rgba(15, 23, 42, 0.78);
      border: 1px solid var(--border);
      box-shadow: 0 18px 56px rgba(2, 6, 23, 0.25);
    }
    .style-card-selected {
      border-color: rgba(125, 211, 252, 0.85);
      box-shadow: 0 0 0 1px rgba(125, 211, 252, 0.55), 0 18px 56px rgba(2, 6, 23, 0.25);
    }
    .style-card-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      margin-bottom: 18px;
    }
    .style-card h2 {
      margin: 0 0 6px;
      font-size: 1.55rem;
      line-height: 1.1;
    }
    .style-card .meta,
    .eyebrow {
      margin: 0;
      color: var(--muted);
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: 0.72rem;
      margin-bottom: 8px;
    }
    .selected-badge {
      margin: 0;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.4);
      color: var(--accent);
      white-space: nowrap;
      font-weight: 700;
    }
    .palette {
      display: grid;
      gap: 12px;
      padding-left: 0;
      list-style: none;
    }
    .palette-item {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    .swatch {
      width: 26px;
      height: 26px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      flex: none;
    }
    .style-card-footer {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 18px;
    }
    footer {
      margin-top: 28px;
      color: var(--muted);
      font-size: 0.95rem;
    }
    @media (max-width: 720px) {
      body { padding: 18px; }
      .style-card-header { flex-direction: column; }
    }
  </style>
</head>
<body>
  <section class="hero">
    <div>
      <p class="eyebrow">slides-grab design collections</p>
      <h1>${escapeHtml(title)}</h1>
      <p>
        Bundled style references derived from <a href="${escapeHtml(DESIGN_STYLES_SOURCE.url)}">${escapeHtml(DESIGN_STYLES_SOURCE.repo)}</a>.
        This keeps the design-library idea in scope without adding a separate GUI: list styles in the CLI, generate this local preview page when needed, and persist one choice in <code>style-config.json</code> before slide generation.
      </p>
    </div>
    <div class="hero-grid">
      <section class="hero-panel">
        <h2>Suggested workflow</h2>
        <ul>
          <li>Ask the agent to shortlist 2–4 styles based on mood and best-for notes.</li>
          <li>Run <code>slides-grab preview-styles</code> or <code>slides-grab preview-styles --style &lt;id&gt;</code> for a local HTML gallery.</li>
          <li>Approve one direction with <code>slides-grab select-style &lt;id&gt;</code> before generating slides.</li>
          <li>Change the selection anytime before regenerating or revising slides.</li>
        </ul>
      </section>
      <section class="hero-panel">
        <h3>Selection guide</h3>
        <ul class="selection-guide">${renderSelectionGuide()}</ul>
      </section>
      <section class="hero-panel">
        <h3>Current selection</h3>
        <p>${selectedStyle ? `${escapeHtml(selectedStyle.title)} (${escapeHtml(selectedStyle.id)})` : 'No style selected yet.'}</p>
        <p>Reference sources: ${DESIGN_STYLES_SOURCE.references.map((item) => `<code>${escapeHtml(item)}</code>`).join(' ')}</p>
      </section>
    </div>
  </section>
  <section class="styles-grid">
    ${resolvedStyles.map((style) => renderStyleCard(style, resolvedSelectedStyleId)).join('')}
  </section>
  <footer>
    <p>Attribution preserved from ${escapeHtml(DESIGN_STYLES_SOURCE.repo)} (${escapeHtml(DESIGN_STYLES_SOURCE.license)}). Preview source: <a href="${escapeHtml(DESIGN_STYLES_SOURCE.previewUrl)}">${escapeHtml(DESIGN_STYLES_SOURCE.previewUrl)}</a>.</p>
  </footer>
</body>
</html>`;
}
