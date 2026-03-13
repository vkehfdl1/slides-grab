---
name: design-skill
description: Design presentation slides as polished HTML. Use when generating slide HTML, visual design, or layout composition is needed.
---

# Design Skill - Professional Presentation Design System

A skill for designing HTML slides for top-tier business presentations.
Delivers minimal, refined design based on existing templates and theme system.

---

## Core Style Principles

- **Background**: White (`#ffffff`)
- **Text**: Black (`#000000`), secondary `#6b6b6b`
- **Accent**: `#FC5E20`
- **Font**: Pretendard (CDN link below)
- **Slide Size**: 720pt x 405pt (16:9, fixed)
- **Style**: Clean, minimal Figma Slides default aesthetic

### Pretendard Webfont CDN
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
```

---

## Template-First Design Rule

**Slides must be designed based on existing templates in the `templates/` directory.**

Do NOT invent custom layouts, typography scales, color systems, or component patterns from scratch.
Instead, follow the structure and styling of the matching template.

### How to use templates

1. **Check available templates**: See the full list in `CLAUDE.md` (23 templates available)
2. **View template content**: Use the CLI command to inspect a template before designing:
   ```bash
   slides-grab show-template <template-name>
   ```
   Example: `slides-grab show-template cover`, `slides-grab show-template timeline`
3. **Follow the template**: Copy the template's HTML structure, CSS patterns, and layout as the base for the slide
4. **Customize content only**: Replace placeholder text/data with actual content from `slide-outline.md`

### Theme CSS Variables

All color and styling decisions must follow the CSS variables defined in `themes/figma-default.css`.

- Read `themes/figma-default.css` to understand the available CSS custom properties
- Use these variables consistently across all slides
- Do NOT hardcode colors that conflict with the theme

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

### 3. Inline SVG Icon & Emoji Guide

#### SVG Icon 기본 사용법

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

#### Emoji vs SVG Icon 선택 기준

SVG 내보내기 시 이모지/특수문자는 자동으로 래스터 PNG로 변환된다. 벡터 품질을 유지하려면 인라인 SVG 아이콘을 우선 사용한다.

| 상황 | 권장 | 이유 |
|------|------|------|
| 불릿 마커, 상태 아이콘, 장식 요소 | **인라인 SVG** | 벡터 유지, 크기·색상 자유 제어 |
| 큰 사이즈(20pt+) 단독 아이콘 | **인라인 SVG** | 래스터 변환 시 픽셀 열화 방지 |
| 본문 텍스트 속 감정/톤 전달 | **이모지 허용** | 자연스러운 표현, 자동 래스터 처리됨 |
| 제목·슬로건의 포인트 장식 | **이모지 허용** | 시각적 임팩트, 작은 사이즈면 품질 충분 |

**핵심 원칙**: 슬라이드의 구조적 시각 요소는 SVG, 분위기·톤 보조는 이모지. 이모지를 쓸 때는 본문 폰트 사이즈(14pt 이하) 수준에서 사용하면 래스터 품질이 충분하다.

#### SVG 아이콘 스니펫 라이브러리

이모지 대신 사용할 수 있는 인라인 SVG 모음. `stroke`/`fill` 색상과 `width`/`height` 크기를 변경하여 테마에 맞춘다.

**체크 / 상태**
```html
<!-- ✓ 체크마크 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ✓ 원형 체크 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#10b981" stroke-width="2"/><path d="M9 12l2 2 4-4" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ✗ 엑스 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ✗ 원형 엑스 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="2"/><path d="M15 9l-6 6m0-6l6 6" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ⚠ 경고 삼각형 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ℹ 정보 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#3b82f6" stroke-width="2"/><path d="M12 16v-4m0-4h.01" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/></svg>

<!-- ⊘ 금지 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#ef4444" stroke-width="2"/><path d="M4.93 4.93l14.14 14.14" stroke="#ef4444" stroke-width="2"/></svg>

<!-- ● 채워진 원 (불릿) -->
<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5" fill="#1f2937"/></svg>

<!-- ○ 빈 원 (불릿) -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="5" stroke="#1f2937" stroke-width="2"/></svg>
```

**화살표 / 방향**
```html
<!-- → 오른쪽 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-7-7l7 7-7 7" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ← 왼쪽 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5m7 7l-7-7 7-7" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ↑ 위 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5m-7 7l7-7 7 7" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ↓ 아래 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14m7-7l-7 7-7-7" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ↗ 성장/상승 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 17L17 7m0 0H7m10 0v10" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ↘ 하락 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 7l10 10m0 0V7m0 10H7" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ↔ 양방향 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M8 8l-4 4 4 4m8-8l4 4-4 4" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🔄 순환/리프레시 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M23 4v6h-6M1 20v-6h6" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ▶ 재생/진행 -->
<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3l15 9-15 9V3z" fill="#1f2937"/></svg>
```

**비즈니스 / 금융**
```html
<!-- 💼 서류가방 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2" stroke="#1f2937" stroke-width="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 📊 막대그래프 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 20V10M12 20V4M6 20v-6" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 📈 상승 차트 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 12l-4-4-6 6-4-4-6 6" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 6v6h-6" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 📉 하락 차트 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 18l-4 4-6-6-4 4-6-6" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 24v-6h-6" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🪙 동전/코인 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#f59e0b" stroke-width="2"/><path d="M12 6v12m-3-9h6a2 2 0 010 4h-6" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 💳 카드 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="1" y="4" width="22" height="16" rx="2" stroke="#1f2937" stroke-width="2"/><path d="M1 10h22" stroke="#1f2937" stroke-width="2"/></svg>

<!-- 🏢 빌딩 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 21h18M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 7h1m4 0h1M9 11h1m4 0h1M9 15h1m4 0h1" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 🤝 악수/파트너십 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22s-4-2-4-6V8l4-3 4 3v8c0 4-4 6-4 6z" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 8H4l-2 2v4h4M16 8h4l2 2v4h-4" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🏷️ 가격표/태그 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="7" r="1" fill="#1f2937"/></svg>

<!-- 🛒 쇼핑카트 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="21" r="1" stroke="#1f2937" stroke-width="2"/><circle cx="20" cy="21" r="1" stroke="#1f2937" stroke-width="2"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

**시간 / 일정**
```html
<!-- ⏰ 시계 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#1f2937" stroke-width="2"/><path d="M12 6v6l4 2" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 📅 캘린더 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" stroke="#1f2937" stroke-width="2"/><path d="M16 2v4M8 2v4M3 10h18" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- ⏳ 모래시계 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 2h12M6 22h12M7 2v4a5 5 0 005 5 5 5 0 005-5V2M7 22v-4a5 5 0 015-5 5 5 0 015 5v4" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ⏱ 스톱워치/타이머 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="13" r="9" stroke="#1f2937" stroke-width="2"/><path d="M12 9v4l2 2M10 2h4M21 5l-2 2" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 🔔 알림/벨 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

**커뮤니케이션**
```html
<!-- 💬 말풍선 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 💬 대화 (복수) -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 📧 이메일 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" stroke="#1f2937" stroke-width="2"/><path d="M22 7l-10 7L2 7" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 📢 메가폰/스피커 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 11v2a1 1 0 001 1h2l5 5V6L6 11H4a1 1 0 00-1 1z" stroke="#1f2937" stroke-width="2" stroke-linejoin="round"/><path d="M16 7a5 5 0 010 10" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 📞 전화 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 📱 스마트폰 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" stroke="#1f2937" stroke-width="2"/><path d="M12 18h.01" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 🌐 글로브/웹 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#1f2937" stroke-width="2"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" stroke="#1f2937" stroke-width="2"/></svg>

<!-- 📡 와이파이/신호 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ✉ 보내기/발신 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

**기술 / 개발**
```html
<!-- </> 코드 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ⚙ 설정/기어 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3" stroke="#1f2937" stroke-width="2"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ☁ 클라우드 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z" stroke="#1f2937" stroke-width="2" stroke-linejoin="round"/></svg>

<!-- 🖥 모니터 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" stroke="#1f2937" stroke-width="2"/><path d="M8 21h8m-4-4v4" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 🗄 서버/데이터베이스 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><ellipse cx="12" cy="5" rx="9" ry="3" stroke="#1f2937" stroke-width="2"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3M21 5v14c0 1.66-4 3-9 3s-9-1.34-9-3V5" stroke="#1f2937" stroke-width="2"/></svg>

<!-- 🔌 플러그/API -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22v-5M9 7V2m6 5V2M5 12h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2 2v1a2 2 0 002 2z" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 📶 시그널/성능 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 20v-4m4 4v-8m4 8v-12m4 12V4" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 🔧 렌치/도구 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🧪 실험/테스트 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 3h6m-5 0v6L4 20h16L14 9V3" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🤖 로봇/AI -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="8" width="16" height="12" rx="2" stroke="#1f2937" stroke-width="2"/><path d="M12 8V4m-4 8h.01M16 12h.01" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/><path d="M9 16h6" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>
```

**문서 / 파일**
```html
<!-- 📄 문서 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="#1f2937" stroke-width="2" stroke-linejoin="round"/><path d="M14 2v6h6M16 13H8m8 4H8m2-8H8" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 📁 폴더 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 📋 클립보드 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/><rect x="8" y="2" width="8" height="4" rx="1" stroke="#1f2937" stroke-width="2"/></svg>

<!-- 📌 핀 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 4.5l-4 7.5H5l7 7v-6.5l4-7.5M9 15l-5 5" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ✏ 연필/편집 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🗑 휴지통/삭제 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18m-2 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🔍 검색/돋보기 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="8" stroke="#1f2937" stroke-width="2"/><path d="M21 21l-4.35-4.35" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- ⬇ 다운로드 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4m4-5l5 5 5-5m-5 5V3" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ⬆ 업로드 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4m14-7l-5-5-5 5m5-5v12" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 📎 클립/첨부 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>
```

**사람 / 소셜**
```html
<!-- 👤 사람 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" stroke="#1f2937" stroke-width="2"/></svg>

<!-- 👥 그룹/팀 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="#1f2937" stroke-width="2"/><path d="M23 21v-2a4 4 0 00-3-3.87m-4-12a4 4 0 010 7.75" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 👤+ 사용자 추가 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="#1f2937" stroke-width="2"/><path d="M20 8v6m3-3h-6" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 🗣 발표/프레젠테이션 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" stroke="#1f2937" stroke-width="2"/><path d="M8 21l4-4 4 4" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🙌 하이파이브/협력 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 11l-4 4m14-4l4 4M12 3v7M8 4l1 4m7-4l-1 4" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="14" r="4" stroke="#1f2937" stroke-width="2"/><path d="M12 18v4" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>
```

**성과 / 평가**
```html
<!-- 🏆 트로피 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9H3a1 1 0 01-1-1V6a1 1 0 011-1h3M18 9h3a1 1 0 001-1V6a1 1 0 00-1-1h-3M8 21h8m-4-4v4" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 5v5a6 6 0 0012 0V5" stroke="#f59e0b" stroke-width="2"/></svg>

<!-- 👍 엄지척 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 9V5a3 3 0 00-6 0v4H2v10h4m8-14h4.76a2 2 0 012 2.22l-1.13 8A2 2 0 0118.63 17H6" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 👎 엄지 아래 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 15v4a3 3 0 006 0v-4h6V5h-4m-8 14H5.24a2 2 0 01-2-2.22l1.13-8A2 2 0 015.37 7H18" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🔥 불꽃/인기 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22c4.97 0 8-3.58 8-8 0-3.5-2-6.5-4-8-.5 2.5-2 4-4 5-1.5-2-2.5-4.5-2-7-3 2-5 6-5 10 0 4.42 3.03 8 7 8z" fill="#ef4444"/></svg>

<!-- 🎖 메달 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="15" r="5" stroke="#f59e0b" stroke-width="2"/><path d="M8.21 13.89L7 2h10l-1.21 11.89" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 👑 왕관 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 17l3-11 5 6 2-8 2 8 5-6 3 11H2z" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/><path d="M2 20h20" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 🎉 파티/축하 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 21l1-6 5 5-6 1zM9 15l-4-4M5 11l4.5 4.5M15 9l2-6M21 3l-6 2M17 7l-2 2M10 5l1 1m5 8l1 1" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ★ 별 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" fill="#f59e0b"/></svg>

<!-- ☆ 빈 별 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/></svg>
```

**위치 / 공간**
```html
<!-- 📍 지도핀/위치 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" stroke="#ef4444" stroke-width="2"/><circle cx="12" cy="10" r="3" stroke="#ef4444" stroke-width="2"/></svg>

<!-- 🏠 집/홈 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 22V12h6v10" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🗺 지도/네비게이션 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" stroke="#1f2937" stroke-width="2" stroke-linejoin="round"/><path d="M8 2v16m8-12v16" stroke="#1f2937" stroke-width="2"/></svg>

<!-- 🧭 나침반 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#1f2937" stroke-width="2"/><path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

**보안 / 접근**
```html
<!-- 🔒 잠금 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#1f2937" stroke-width="2"/><path d="M7 11V7a5 5 0 0110 0v4" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 🔓 열림 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" stroke="#1f2937" stroke-width="2"/><path d="M7 11V7a5 5 0 019.9-1" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 🛡 방패/보안 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#1f2937" stroke-width="2" stroke-linejoin="round"/></svg>

<!-- 🛡✓ 방패+체크 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#10b981" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🔑 열쇠 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 11-7.78 7.78 5.5 5.5 0 017.78-7.78zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 👁 보기/공개 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="#1f2937" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="#1f2937" stroke-width="2"/></svg>

<!-- 👁‍🗨 숨기기 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>
```

**개념 / 추상**
```html
<!-- 💡 전구/아이디어 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 21h6m-6-3h6a6 6 0 00-6-12 6 6 0 00-6 12z" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🎯 과녁/목표 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#1f2937" stroke-width="2"/><circle cx="12" cy="12" r="6" stroke="#1f2937" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="#FC5E20"/></svg>

<!-- ❤ 하트 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z" fill="#ef4444"/></svg>

<!-- ⚡ 번개/빠름 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="#f59e0b"/></svg>

<!-- 🔗 링크/연결 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 🧩 퍼즐/통합 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 16v4a2 2 0 01-2 2h-4m0 0a3 3 0 110-4m0 4H6a2 2 0 01-2-2v-4m0 0a3 3 0 110-4m0 4V6a2 2 0 012-2h4m0 0a3 3 0 110 4m0-4h4a2 2 0 012 2v4m0 0a3 3 0 110 4" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- ♻ 순환/재활용 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 19H4.815a1.83 1.83 0 01-1.57-.881 1.785 1.785 0 01-.004-1.784L7.196 9.5M16.5 9.5l4 7m-11 3.5l2 2 2-2M7.5 4l-2-2-2 2m4.5 1.5l-4-7M17 5h2.186a1.83 1.83 0 011.57.881c.317.547.32 1.22.004 1.784L16.804 14.5M20 14.5l-2 2-2-2" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- 🎨 팔레트/디자인 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#1f2937" stroke-width="2"/><circle cx="12" cy="7" r="1.5" fill="#ef4444"/><circle cx="7.5" cy="11" r="1.5" fill="#3b82f6"/><circle cx="9" cy="16" r="1.5" fill="#10b981"/><circle cx="16.5" cy="11" r="1.5" fill="#f59e0b"/></svg>

<!-- 📐 자/측정 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 20L20 2l2 2L4 22l-2-2z" stroke="#1f2937" stroke-width="2" stroke-linejoin="round"/><path d="M7 17l2-2m2-2l2-2m2-2l2-2" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- ∞ 무한/반복 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.18 8a5 5 0 010 8 5 5 0 01-7.07 0L12 12l-.89-.89M5.82 16a5 5 0 010-8 5 5 0 017.07 0" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>

<!-- ⊕ 플러스 원형 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#1f2937" stroke-width="2"/><path d="M12 8v8m-4-4h8" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- ⊖ 마이너스 원형 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#1f2937" stroke-width="2"/><path d="M8 12h8" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/></svg>

<!-- 📊 파이차트/비율 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21.21 15.89A10 10 0 118 2.83" stroke="#1f2937" stroke-width="2" stroke-linecap="round"/><path d="M22 12A10 10 0 0012 2v10z" stroke="#1f2937" stroke-width="2" stroke-linejoin="round"/></svg>

<!-- 🏗 구조/빌드 -->
<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M2 20h20M5 20V8l7-5 7 5v12" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 20v-6h4v6" stroke="#1f2937" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
```

**숫자 불릿 (① ② ③ 대체)**
```html
<!-- 번호 원형 불릿 — 숫자와 색상을 변경하여 사용 -->
<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#FC5E20"/><text x="12" y="16" text-anchor="middle" fill="#fff" font-size="13" font-family="Pretendard, sans-serif" font-weight="600">1</text></svg>

<!-- 번호 테두리 불릿 (빈 스타일) -->
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#FC5E20" stroke-width="2"/><text x="12" y="16" text-anchor="middle" fill="#FC5E20" font-size="13" font-family="Pretendard, sans-serif" font-weight="600">1</text></svg>

<!-- A/B/C 알파벳 불릿 -->
<svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1f2937"/><text x="12" y="16" text-anchor="middle" fill="#fff" font-size="13" font-family="Pretendard, sans-serif" font-weight="600">A</text></svg>
```

### 4. Image Usage Rules (Local Path / URL / Placeholder)

#### Local Path Image
```html
<img src="/Users/yourname/projects/assets/team-photo.png" alt="Team photo" style="width: 220pt; height: 140pt; object-fit: cover;">
```

#### URL Image
```html
<img src="https://images.example.com/hero.png" alt="Hero image" style="width: 220pt; height: 140pt; object-fit: cover;">
```

#### Placeholder (Image Stand-In)
```html
<div data-image-placeholder style="width: 220pt; height: 140pt; border: 1px dashed #c7c7c7; background: #f3f4f6;"></div>
```

Rules:
- Always include `alt` on `img` tags.
- Prefer local paths; URL images risk network failures.
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
2. **Auto-build viewer**: After slide generation, automatically run:
   ```bash
   node scripts/build-viewer.js --slides-dir <path>
   ```
3. **Guide user to review**: Tell the user to check slides in the browser:
   ```
   open <slides-dir>/viewer.html
   ```
4. **Revision loop**: When the user requests changes to specific slides:
   - Edit only the relevant HTML file
   - Re-run `node scripts/build-viewer.js --slides-dir <path>` to rebuild the viewer
   - Guide user to review again
5. **Completion**: Repeat the revision loop until the user signals approval for PPTX conversion

### Absolute Rules
- **Never start PPTX conversion without approval** — PPTX conversion is the responsibility of `pptx-skill` and requires explicit user approval.
- **Never forget to build the viewer** — Run `node scripts/build-viewer.js --slides-dir <path>` every time slides are generated or modified.

---

## Important Notes

1. **CSS gradients**: Not supported in PowerPoint conversion — replace with background images
2. **Webfonts**: Always include the Pretendard CDN link
3. **Image paths**: Use absolute paths or URLs
4. **Colors**: Always include `#` prefix in CSS
5. **Text rules**: Never place text directly in div/span
6. **SVG 내보내기와 이모지**: 이모지·특수문자(✓ ① ▶ 등)는 SVG 내보내기 시 래스터 PNG로 자동 변환됨. 벡터 품질이 중요한 경우 위 "SVG 아이콘 스니펫"의 인라인 SVG를 사용
