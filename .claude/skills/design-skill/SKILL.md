---
name: design-skill
description: Design presentation slides as polished HTML. Use when generating slide HTML, visual design, or layout composition is needed.
---

# Design Skill - Professional Presentation Design System

A skill for designing HTML slides for top-tier business presentations.
Delivers minimal, refined design based on existing templates and theme system.

---

## Core Style Principles

- **Font**: Pretendard (CDN link below); if the pack's theme.css specifies a different font, follow the pack
- **Slide Size**: 720pt x 405pt (16:9, fixed)
- **Style**: Determined by the selected template pack

### Default Style
- Default pack: `simple_light`
- Run `slides-grab show-theme simple_light` to see current colors

### Pretendard Webfont CDN
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
```

### Typography Priority (Pack-Guided Rule)

When deciding font sizes for a slide:

1. **Pack의 design.md** → Font Pairing 섹션의 크기/웨이트를 **기준으로 사용**
2. **design.md가 없으면** → 팩의 theme.css 스케일을 참고
3. **No pack specified** → `references/design-system-full.md`의 스케일 사용

단, 콘텐츠의 특성(긴 한글 제목, 대형 숫자 강조, 다크 배경 등)에 따라
스케일을 자연스럽게 조정할 수 있다. 팩의 스케일은 "범위"이지 "고정값"이 아니다.

---

## Design Knowledge System (design.md + Type Skills)

슬라이드 디자인은 **세 계층의 디자인 지식**을 합성하여 생성한다:

### 1. Pack design.md — 팩의 디자인 철학

각 팩의 `packs/<pack-id>/design.md`에 정의된 디자인 사양서:
- **Mood**: 분위기, 톤 (예: "clean, restrained, typographic")
- **Signature Elements**: 이 팩을 이 팩답게 만드는 시각 요소
- **CSS Patterns**: 검증된 CSS 스니펫 (카드, 액센트, 스플릿 레이아웃 등)
- **Font Pairing**: 정확한 폰트 조합, 크기, 웨이트
- **Avoid**: 이 팩에서 절대 하면 안 되는 것

**사용법**: 슬라이드 생성 시작 전에 반드시 `cat packs/<pack-id>/design.md`로 읽는다.

**design.md 파일 구조** (8개 섹션):
1. **Identity** — mood 키워드 + 팩의 시각 철학 설명
2. **Signature Elements** — 이 팩을 이 팩답게 만드는 시각 모티프 목록
3. **CSS Patterns** — 검증된 CSS 스니펫 (베이스, 히어로, 카드, 스플릿 등 3–5가지)
4. **Font Pairing** — 폰트 이름, 크기, 웨이트, letter-spacing, line-height
5. **Color Usage** — Token/Value/Usage 테이블 (`--bg-primary`, `--accent` 등)
6. **Layout Principles** — 핵심 레이아웃 패턴 2–3개
7. **Avoid** — 이 팩에서 절대 하면 안 되는 것들
8. **Webfont CDN** — 웹폰트 CDN `<link>` 태그

### 2. Type Skills — 타입별 레이아웃 원칙

각 슬라이드 타입의 `skills/types/<type>.md`에 정의된 레이아웃 원칙:
- **Layout Principles**: 구조적 배치 규칙 (수평/수직, 비율, 간격)
- **Typography**: 타입별 적절한 폰트 스케일 가이드
- **Content Rules**: 콘텐츠 밀도, 분량 제한
- **Variations**: 콘텐츠 양/종류에 따른 적응 규칙
- **Avoid**: 이 타입에서 하면 안 되는 것

**사용법**: 각 슬라이드를 디자인할 때 해당 타입의 스킬을 참조한다.

### 3. theme.css — CSS 변수 값

Each pack has a `theme.css` with CSS variables (`:root { --bg-primary, --text-primary, --accent, ... }`).
- View: `slides-grab show-theme <pack-id>`
- Use `var()` references instead of hardcoded colors

### Design Resolution (3-tier)

슬라이드를 생성할 때 아래 순서로 디자인 지식을 합성한다:

```
1. design.md 읽기 → 팩의 mood, signature, avoid, CSS patterns 파악
2. type skill 읽기 → 해당 슬라이드 타입의 레이아웃 원칙 파악
3. theme.css 읽기 → 구체적 색상, 폰트, 스케일 값 확인
4. 세 계층을 합성하여 HTML 생성:
   - design.md의 mood와 signature를 따르면서
   - type skill의 레이아웃 원칙을 적용하고
   - theme.css의 값을 CSS 변수로 사용
```

**design.md가 없는 팩**: theme.css만 참고하여 디자인. `simple_light`의 design.md를 기본 참조로 사용 가능.
**type skill이 없는 타입**: `packs/common-types.json`의 설명을 참고하여 자유 디자인.

---

## Template Pack System

Templates are organized into **packs** in the `packs/` directory. Each pack provides a different visual design.

All packs share a common set of template type names defined in `packs/common-types.json`.

### How to use packs

1. **Check available packs**: `slides-grab list-packs`
2. **Read design spec**: `cat packs/<pack-id>/design.md` (mood, signature, CSS patterns, avoid)
3. **View pack colors**: `slides-grab show-theme <pack-id>`
4. **Read type skill**: `cat skills/types/<type>.md` (layout principles for each slide type)
5. **Follow the pack's design language** consistently across all slides.

### Pack Resolution

1. **Pack has design.md** → 디자인 사양서의 mood, signature, CSS patterns를 따라 생성
2. **Pack doesn't have design.md** → theme.css 색상 + simple_light design.md를 기본 참조로 사용
3. **HTML 템플릿은 선택적 참조** → `show-template <type> --pack <pack-id>`로 참고할 수 있지만, 복사가 아닌 원칙 이해 목적

---

## Core Production Principles

> These are non-negotiable. Every slide must satisfy ALL of these.

1. **Strictly follow the pack's design.md** — background, font, layout, colors를 정확히 따른다. 근사치가 아닌 명시된 값 그대로.
2. **모든 슬라이드에 최소 1개의 시각 요소** — 도형, 컬러 블록, 구분선, 카드, 배경 패턴 등. 텍스트만 있는 슬라이드는 금지.
3. **Signature element를 매 슬라이드에 반복** — 팩의 정체성을 일관되게 유지한다. (예: neo-brutalism의 하드 그림자, dark-academia의 금색 테두리, editorial-magazine의 빨간 rule)
4. **Font pairing을 정확히 매칭** — 타이포그래피가 스타일 인상의 50%를 결정한다. design.md의 폰트 이름, 크기, 웨이트를 그대로 사용. 유사 폰트로 대체하지 않는다.
5. **정확한 HEX 값 사용** — 근사치 색상은 미학을 깨뜨린다. theme.css의 CSS 변수 또는 design.md의 CSS 패턴 값을 그대로 사용.
6. **텍스트만 있는 슬라이드 금지** — 색상, 형태, 공간으로 디자인을 표현한다. cover와 closing도 시각 요소가 있어야 한다.

---

## Design Principles

**핵심: 복사가 아니라 합성이다.**

- design.md의 mood와 avoid를 먼저 내면화한다
- type skill의 레이아웃 원칙을 콘텐츠에 맞게 적용한다
- design.md의 CSS 스니펫을 기반으로 시각 효과를 구현한다
- accent 색상(--accent)을 적극 활용: 섹션 라벨, 핵심 수치, 강조 문구
- 슬라이드마다 콘텐츠에 최적화된 레이아웃을 선택. 같은 패턴을 3장 이상 반복하지 않기

**팩은 "디자인 철학"이고, 타입 스킬은 "구조적 지식"이다. 둘을 합쳐서 콘텐츠에 맞는 슬라이드를 창작한다.**

---

## Style Recommendation Matrix

사용자가 팩을 선택하지 않았을 때, 주제/청중에 따라 추천한다:

| 발표 목적 | 추천 팩 |
|-----------|---------|
| 테크 / AI / 스타트업 | glassmorphism, aurora-neon-glow, cyberpunk-outline, scifi-holographic |
| 기업 / 컨설팅 / 금융 | swiss-international, monochrome-minimal, editorial-magazine, simple_light |
| 교육 / 연구 / 학술 | dark-academia, nordic-minimalism, brutalist-newspaper |
| 브랜드 / 마케팅 | gradient-mesh, typographic-bold, duotone-split, risograph-print |
| 제품 / 앱 / UX | bento-grid, claymorphism, pastel-soft-ui, liquid-blob |
| 엔터테인먼트 / 게이밍 | retro-y2k, dark-neon-miami, vaporwave, memphis-pop |
| 에코 / 웰니스 / 문화 | handcrafted-organic, nordic-minimalism, dark-forest, stained-glass-mosaic |
| IT 인프라 / 아키텍처 | isometric-3d-flat, architectural-blueprint, cyberpunk-outline |
| 포트폴리오 / 아트 / 크리에이티브 | monochrome-minimal, editorial-magazine, maximalist-collage, risograph-print |
| 피치덱 / 전략 | neo-brutalism, duotone-split, bento-grid, simple_light |
| 럭셔리 / 이벤트 / 갈라 | art-deco-luxe, monochrome-minimal, dark-academia |
| 바이오 / 혁신 / 과학 | liquid-blob, scifi-holographic, aurora-neon-glow |

---

## Reference Files

For detailed rules, examples, and patterns, consult:

- **`references/design-rules.md`** — slide spec, asset rules, pack system, review loop
- **`references/detailed-design-rules.md`** — image/text usage rules, workflow constraints
- **`references/beautiful-slide-defaults.md`** — art direction: visual thesis, narrative sequence, review litmus
- **`references/design-system-full.md`** — typography scale, layout system, design components, chart/diagram/icon library
- **`references/charts-icons-library.md`** — Chart.js, Mermaid, SVG icon snippets (arrow, check, star, etc.)

These files are located at `skills/slides-grab-design/references/`.

---

## Output and File Structure

### File Save Rules
```
<slides-dir>/
  slide-01.html  (Cover)
  slide-02.html  (Contents)
  slide-03.html  (Section Divider)
  slide-04.html  (Content)
  ...
  slide-XX.html  (Closing)
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
2. **Validate**: After generation or edits, run:
   ```bash
   slides-grab validate --slides-dir <path>
   ```
   If validation fails, fix the source slide HTML/CSS and re-run until it passes.
3. **Revision loop**: When the user requests changes to specific slides:
   - Edit only the relevant HTML file
   - Re-run `slides-grab validate --slides-dir <path>`
   - Guide user to review again
4. **Completion**: Repeat the revision loop until the user signals approval for conversion

### Absolute Rules
- **Never start conversion without approval** -- Conversion is the responsibility of `pptx-skill` and requires explicit user approval.
- **Never skip validation** -- Run `slides-grab validate` after every generation/edit pass.
- **Run the review litmus** from `references/beautiful-slide-defaults.md` before presenting the deck.

---

## Important Notes

1. **CSS gradients**: Not supported in PowerPoint conversion -- replace with background images
2. **Webfonts**: Always include the Pretendard CDN link (unless pack specifies a different font)
3. **Image contract**: Store local assets in `<slides-dir>/assets/` and reference as `./assets/<file>`. Download remote images before saving. Allow `data:` URLs for self-contained slides. Never use absolute filesystem paths.
4. **Colors**: Always include `#` prefix in CSS
5. **Text rules**: Never place text directly in div/span
6. **Korean text wrapping**: Always set `word-break: keep-all; overflow-wrap: break-word;` on body. Additionally, use `&nbsp;` to join words that must not be separated: verb+auxiliary (전달하지\&nbsp;않는다), short word chains (왜\&nbsp;그\&nbsp;값인지), negations (창작이\&nbsp;아니라). Natural break points are after commas and periods — prevent breaks only within semantic units.
6. **SVG export**: Emoji/special characters are auto-rasterized to PNG in SVG export — quality is sufficient for slides. Use emoji freely for visual richness. Only use inline SVG icons from `references/charts-icons-library.md` when precise color control or large hero icons (24pt+) are needed.
