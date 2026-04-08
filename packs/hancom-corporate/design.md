# Hancom Corporate Design Spec

## Identity

**Mood**: corporate, professional, bold, structured
**Best For**: 기업 제안서, 서비스 소개, 내부 보고, 기술 발표

한컴 브랜드 스타일의 기업용 프레젠테이션. 깨끗한 흰 배경 위에 주황(#FC5D19) 수평선이 구조를 만들고,
다크 그레이(#303030) 블록이 무게감을 더한다. 커버와 클로징은 비대칭 분할 레이아웃(흰+다크그레이 80% | 주황 20%)으로
브랜드 정체성을 각인시킨다. 내지(content) 슬라이드는 좌측 정렬 Bold 타이틀 + 주황 구분선 + 밝은 회색 카드의
3요소로 정보를 깔끔하게 전달한다. 장식은 최소화하되 주황 액센트가 시선을 이끈다.

---

## Signature Elements

- **주황 수평선 (#FC5D19)**: 페이지 타이틀 바로 아래에 가로 전폭(좌 패딩~우 패딩) 3pt 높이 구분선. 이 팩의 가장 강력한 시각 표식.
- **커버 비대칭 분할**: 좌측 82%는 흰 상단(타이틀+부제, 검정 텍스트) + 다크 그레이 하단(#303030, 텍스트 없음), 우측 18%는 상단 60%만 주황(#FC5D19) + 하단 40%는 흰색. 최상단에 얇은 다크 그레이(#454545) 바.
- **밝은 회색 카드 (#F7F7F7)**: 둥근 모서리(12pt radius), 미묘한 보더(#D9D9D9 1pt) 또는 보더 없이 배경색만으로 구분. 정보 그루핑의 기본 단위.
- **네이비 라벨 바 (#020B2F)**: 표나 비교 레이아웃에서 카테고리/상태를 표시하는 진한 네이비 바. border-radius 6pt, 흰색 텍스트.
- **Bold 좌측 정렬 타이틀**: 30pt weight 900 검정 타이틀이 좌상단에 고정. 페이지 구조의 앵커.
- **다크 그레이 블록 (#303030)**: 커버/클로징 하단 40%를 채우는 무게감 있는 다크 영역.

---

## CSS Patterns

### Base Slide

```css
body {
  width: 720pt;
  height: 405pt;
  font-family: var(--font-sans);
  background: var(--bg-primary);   /* #FFFFFF */
  color: var(--text-primary);      /* #000000 */
  padding: 48pt 56pt;
  display: flex;
  flex-direction: column;
  word-break: keep-all;
  overflow-wrap: break-word;
}
```

### Content Slide Header (Orange Rule)

```css
.slide-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0;
}
.slide-header h1 {
  font-size: 30pt;
  font-weight: 900;
  color: #000000;
  letter-spacing: -0.02em;
}
.orange-rule {
  width: 100%;
  height: 3pt;
  background: var(--accent);   /* #FC5D19 */
  margin-top: 8pt;
  margin-bottom: 24pt;
  border-radius: 0;
}
/* Every content slide has: bold title → orange horizontal line → content area */
```

### Cover / Closing Slide

**핵심: 타이틀 영역은 반드시 흰색 배경(#FFFFFF) + 검정 텍스트(#000000). 절대 다크 배경에 흰 텍스트로 만들지 않는다.**

레이아웃은 4개의 절대 배치 블록으로 구성:

```
┌─────────────────────────┬──────────┐
│ ■■ #454545 bar (10%) ■■ │          │
├─────────────────────────┤ ■■■■■■■■ │
│                         │ ■ orange ■│
│  Title (36pt, 검정)      │ ■#FC5D19■│ ← 우측 18%, 10%~68%
│  Subtitle (14pt, 회색)   │ ■■■■■■■■ │
│ ★ 흰색 배경 (#FFFFFF) ★  ├──────────┤
├─────────────────────────┤          │
│ ■ #303030 (텍스트없음)  ■│  흰색    │ ← 하단 32%
└─────────────────────────┴──────────┘
  ← 좌측 82% →              ← 18% →

★ 모서리 정렬: top-bar 하단 = orange 상단 = title-area 상단 (10%)
★ 모서리 정렬: title-area 하단 = orange 하단 = bottom-block 상단 (68%)
```

```css
body {
  padding: 0;
  position: relative;
  overflow: hidden;
  background: #FFFFFF;   /* ★ 전체 배경 흰색 */
}

/* 1) 최상단 바 — 0~10% */
.top-bar {
  position: absolute;
  top: 0; left: 0;
  width: 82%; height: 10%;
  background: #454545;
}

/* 2) 타이틀 영역 — 10~68% ★ 반드시 흰색 배경 + 검정 텍스트 ★ */
.title-area {
  position: absolute;
  top: 10%; left: 0;
  width: 82%; height: 58%;
  background: #FFFFFF;          /* 흰색! */
  display: flex;
  flex-direction: column;
  justify-content: flex-end;   /* 타이틀을 하단에 배치 (다크 블록 경계 근처) */
  padding: 0 56pt 16pt;
}
.title-area h1 {
  font-size: 36pt;
  font-weight: 900;
  color: #000000;               /* 검정 텍스트! */
  letter-spacing: -0.02em;
  line-height: 1.25;
}
.title-area .subtitle {
  font-size: 14pt;
  font-weight: 400;
  color: #434343;               /* 회색 부제 */
  margin-top: 6pt;
}

/* 3) 하단 다크 블록 — 68~100%, 텍스트 없음, 장식용 */
.bottom-block {
  position: absolute;
  bottom: 0; left: 0;
  width: 82%; height: 32%;
  background: #303030;
}

/* 4) 우측 주황 블록 — 10~68% (top-bar 하단 ~ bottom-block 상단, 모서리 정렬) */
.orange-block {
  position: absolute;
  top: 10%; right: 0;
  width: 18%; height: 58%;
  background: #FC5D19;
}
/* 우측 상단(0~10%)과 하단(68~100%)은 body 흰색 배경이 그대로 보임 */
```

### Card Grid

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20pt;
  flex: 1;
}
.card {
  background: var(--bg-secondary);   /* #F7F7F7 */
  border-radius: 12pt;
  padding: 24pt;
}
.card h3 {
  font-size: 16pt;
  font-weight: 700;
  color: #000000;
  margin-bottom: 12pt;
}
.card p {
  font-size: 14pt;
  font-weight: 400;
  color: var(--text-secondary);   /* #434343 */
  line-height: 1.6;
}
/* Rounded light-gray cards on white background. No shadow, no border by default. */
```

### Comparison Layout (As-Is / To-Be)

```css
.comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24pt;
  flex: 1;
}
.comparison-panel {
  background: var(--bg-secondary);
  border-radius: 12pt;
  padding: 0;
  overflow: hidden;
}
.comparison-label {
  padding: 10pt 20pt;
  font-size: 14pt;
  font-weight: 700;
  color: #FFFFFF;
  text-align: center;
  border-radius: 8pt;
  margin: 16pt 16pt 0;
}
.comparison-label.as-is {
  background: #303030;   /* dark gray for As-Is */
}
.comparison-label.to-be {
  background: var(--accent);   /* #FC5D19 orange for To-Be */
}
.comparison-body {
  padding: 16pt 20pt;
}
/* Two-panel comparison. Dark label for current state, orange label for target state. */
```

### Navy Label Bar

```css
.label-bar {
  background: #020B2F;
  color: #FFFFFF;
  font-size: 12pt;
  font-weight: 600;
  padding: 8pt 16pt;
  border-radius: 6pt;
  text-align: center;
}
/* Dark navy bars for category labels in tables and data slides. */
```

### Table / Data Row

```css
.data-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0 6pt;
}
.data-table tr {
  background: var(--bg-secondary);   /* #F7F7F7 */
  border-radius: 8pt;
}
.data-table td {
  padding: 12pt 16pt;
  font-size: 13pt;
  color: var(--text-secondary);
  line-height: 1.5;
}
.data-table td:first-child {
  font-weight: 700;
  color: var(--text-primary);
}
/* Striped-feel with light gray row backgrounds. No hard borders. */
```

---

## Font Pairing

| Role | Font | Size | Weight | letter-spacing | line-height |
|------|------|------|--------|---------------|-------------|
| Hero Title | Pretendard | 48pt | 900 | -0.03em | 1.2 |
| Section Title | Pretendard | 40pt | 900 | -0.02em | 1.2 |
| Slide Title | Pretendard | 30pt | 900 | -0.02em | 1.25 |
| Subtitle | Pretendard | 20pt | 700 | -0.01em | 1.4 |
| Body | Pretendard | 15pt | 400 | 0 | 1.65 |
| Caption | Pretendard | 11pt | 400 | 0 | 1.5 |
| Label | Pretendard | 10pt | 600 | 0.02em | 1.4 |

Weight progression: **900** (titles) → **700** (subtitle) → **600** (labels) → **400** (body).
타이틀은 항상 weight 900으로 강한 존재감. 본문과의 무게 대비가 핵심.

### Korean Text Wrapping (Critical)

`word-break: keep-all`만으로는 자연스러운 한국어 줄바꿈이 보장되지 않는다.
끊기면 부자연스러운 구절은 `&nbsp;`로 묶어서 한 단위로 유지한다:

| 패턴 | 예시 | 처리 |
|------|------|------|
| 용언 + 보조용언 | 전달하지 않는다, 할 수 있다 | 전달하지\&nbsp;않는다 |
| 동사 + 보조 | 만들어야 하는지, 해야 해 | 만들어야\&nbsp;하는지 |
| 부사 + 서술어 | 항상 나빠진다, 정말 중요하다 | 항상\&nbsp;나빠진다 |
| 짧은 단어 연결 | 왜 그 값인지, 할 수 없다 | 왜\&nbsp;그\&nbsp;값인지 |
| 부정 표현 | 아니라, 없다, 못한다 | 창작이\&nbsp;아니라 |

**원칙**: 쉼표(,)나 마침표(.) 뒤에서 끊기는 건 자연스럽다. 의미 단위 중간에서 끊기는 것만 방지한다.

---

## Color Usage

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#FFFFFF` | 메인 슬라이드 배경. 깨끗한 흰색. |
| `--bg-secondary` | `#F7F7F7` | 카드, 테이블 행, 섹션 배경. 미묘한 밝은 회색. |
| `--bg-elevated` | `#FFFFFF` | 카드 표면 (보더로 구분할 때). |
| `--text-primary` | `#000000` | 제목, 헤딩. 진한 검정. |
| `--text-secondary` | `#434343` | 본문, 부제목, 설명 텍스트. |
| `--accent` | `#FC5D19` | 한컴 주황. 구분선, 강조 라벨, To-Be 배지. |
| `--border` | `#D9D9D9` | 카드 보더, 구분선. |

### Additional Colors (Hardcoded)

- **다크 그레이 (#303030)**: 커버/클로징 하단 블록, As-Is 라벨 배경
- **미디엄 그레이 (#454545)**: 커버 상단 바
- **네이비 (#020B2F / #04165F)**: 데이터 테이블 카테고리 라벨 바
- **옐로우 (#F6FF00)**: 체크마크, 상태 표시 (테이블 전용, 최소 사용)

**Rule**: 주황은 구분선과 강조에만. 면적 넓게 쓰는 곳은 커버/클로징 우측 블록뿐. 내지에서 주황 배경 면적을 과도하게 사용하지 않는다.

---

## Layout Principles

### Pattern A — Cover / Closing (비대칭 분할)

커버와 클로징 슬라이드 전용. 페이지를 좌(82%) / 우(18%)로 분할.

```
┌─────────────────────────┬──────────┐
│ ■■ #454545 bar (10%) ■■ │  흰색    │
├─────────────────────────┤ ■ orange ■│
│  Title (36pt, 검정)      │ ■ 58%h  ■│
│  Subtitle (14pt, 회색)   │ ■■■■■■■■ │
│  ★ 흰색 배경 ★           ├──────────┤
├─────────────────────────┤  흰색    │
│ ■ #303030 (텍스트 없음) ■│          │
└─────────────────────────┴──────────┘
```

좌측 82%: 상단 다크 그레이 바(#454545, 10%) → **흰색 영역(타이틀 36pt + 부제 14pt, 검정 텍스트, 58%)** → 다크 그레이 하단(#303030, 32%).
우측 18%: 상단 10%는 흰색 → 중간 58%가 주황(#FC5D19) → 하단 32%는 흰색.
**모서리 정렬**: top-bar↔orange↔title-area 상단(10%), title-area↔orange↔bottom-block 하단(68%).
**중요**: 타이틀 영역은 반드시 **흰색 배경 + 검정 텍스트**. 다크 그레이 하단에 텍스트를 넣지 않는다.

### Pattern B — Content (타이틀 + 주황선 + 본문)

대부분의 내지 슬라이드에 적용. 3단 구조:

```
[ title 1                            ]
[ ================================== ]   ← orange rule (3pt)
[                                     ]
[   subtitle                          ]
[   body text                         ]
[                                     ]
[   [ card ]    [ card ]              ]
[                                     ]
```

1. 좌측 Bold 타이틀 (30pt, 900)
2. 주황 수평선 (전폭, 3pt)
3. 본문 영역: 중앙/좌측 정렬 서브타이틀 + 카드/표/콘텐츠

### Pattern C — Comparison / Split

As-Is vs To-Be 등 비교 레이아웃:

```
[ title 1                            ]
[ ================================== ]
[                                     ]
[  [  As-Is (dark) ]  [ To-Be (org)  ]
[  [  content      ]  [ content      ]
[  [  ......       ]  [ ......       ]
[                                    ]
```

2열 그리드. 라벨 색상으로 상태 구분 (다크 그레이 = 현재, 주황 = 목표).

---

## Avoid

- **그라데이션 금지** — 배경, 텍스트, 카드 어디에도 그라데이션 없음. 모든 색상은 단색(flat).
- **그림자 금지** — box-shadow, text-shadow 없음. 카드 구분은 배경색 또는 보더로.
- **주황 면적 과다 사용 금지** — 내지에서 주황은 구분선(3pt)과 라벨 배지에만. 넓은 주황 배경은 커버/클로징 전용.
- **커버 레이아웃을 내지에 사용하지 않음** — 비대칭 분할(80:20)은 커버/클로징 전용. 내지는 전폭 흰 배경.
- **둥근 모서리 > 12pt 금지** — 카드 radius는 12pt가 최대. 과도한 라운딩은 이 팩의 기업 분위기를 해친다.
- **가벼운 타이틀 금지** — 타이틀은 항상 900 weight. 500이나 600은 사용하지 않는다.
- **다크 모드 흉내 금지** — 이 팩은 라이트 모드 전용. 검정 배경 슬라이드를 만들지 않는다 (커버 하단 블록은 장식 요소이지 배경이 아님).
- **네이비/옐로우 남용 금지** — 네이비 라벨과 옐로우 체크마크는 데이터/테이블 슬라이드에서만 사용.

---

## Webfont CDN

```html
<link href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" rel="stylesheet">
```
