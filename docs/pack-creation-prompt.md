# 새 Pack 생성 프롬프트

> 이 프롬프트를 새 세션에서 사용하여 template pack을 처음부터 만듭니다.
> 한 번에 1개 팩씩 진행하세요.

---

## 프롬프트

```
slides-grab 프로젝트에 새로운 template pack을 만들어줘.

## 프로젝트 컨텍스트

- 프로젝트: /Users/usuhwa/_workspace/bootstrap/slides-grab
- CLAUDE.md를 먼저 읽어
- 디자인 규격: skills/slides-grab-design/references/design-system-full.md
- 아트 디렉션: skills/slides-grab-design/references/beautiful-slide-defaults.md
- 차트/아이콘: skills/slides-grab-design/references/charts-icons-library.md
- 슬라이드 크기: 720pt × 405pt (고정)
- 기존 팩 참고: `slides-grab list-packs`로 확인

## 새 팩 정보

- 팩 이름: `<PACK_ID>` (소문자, 언더스코어만 허용)
- 컨셉: <분위기/용도를 설명. 예: "어두운 배경에 네온 액센트, 테크 스타트업 피칭용">
- 색상 방향: <원하는 색상 또는 "자유롭게">

## 작업 순서

### 1단계: 팩 초기화

```bash
slides-grab pack init <PACK_ID>
```

이 명령이 `packs/<PACK_ID>/theme.css`와 `packs/<PACK_ID>/templates/` 디렉토리를 생성한다.

### 2단계: theme.css 작성

팩의 색상과 타이포그래피를 정의한다:

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

  /* Typography scale (표준 스케일 기준, 팩 성격에 맞게 조정 가능) */
  --title-hero: 64pt;      /* cover 메인 타이틀 */
  --title-section: 44pt;   /* section-divider 제목 */
  --title-slide: 32pt;     /* 일반 슬라이드 제목 */
  --text-subtitle: 20pt;   /* 부제목 */
  --text-body: 16pt;       /* 본문 */
  --text-caption: 11pt;    /* 캡션 */
  --text-label: 10pt;      /* 배지, 태그 */
}
```

### 3단계: 템플릿 HTML 생성

`packs/common-types.json`에 정의된 26개 타입 중 최소 아래 핵심 템플릿을 만든다:

**필수 (8개):**
1. `cover.html` — 표지
2. `contents.html` — 목차
3. `section-divider.html` — 섹션 구분
4. `content.html` — 일반 콘텐츠
5. `split-layout.html` — 이미지+텍스트 분할
6. `statistics.html` — 통계/데이터
7. `quote.html` — 인용구
8. `closing.html` — 마무리

**권장 추가 (선택):**
- `timeline.html`, `team.html`, `chart.html`, `diagram.html`
- `comparison.html`, `funnel.html`, `matrix.html`
- `logo-grid.html`, `table.html`, `process.html`

### 4단계: 검증

```bash
slides-grab validate --slides-dir <테스트용 슬라이드>
slides-grab show-pack <PACK_ID>
```

## 템플릿 HTML 작성 규칙

### 구조
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
  <style>
    :root {
      /* theme.css의 변수를 여기에 인라인 복사 */
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
    <!-- 슬라이드 내용 -->
  </div>
</body>
</html>
```

### 텍스트 규칙
- 모든 텍스트는 `<p>`, `<h1>`-`<h6>`, `<ul>`, `<ol>`, `<li>` 안에
- `<div>`나 `<span>`에 직접 텍스트 금지
- 이유: PPTX 변환 시 태그 밖 텍스트는 손실됨

### 이미지 규칙
- `<img src="./assets/<file>" alt="설명">` 형태
- `background-image`는 body에만 허용 (콘텐츠 이미지에 사용 금지)
- 이미지 자리 비워둘 때: `<div data-image-placeholder>` 사용

### 색상 규칙
- `var(--accent)` 같은 CSS 변수 참조 사용
- 하드코딩 시 반드시 `#` prefix 포함
- CSS gradient는 PPTX 변환에서 지원 안 됨 — 가급적 피할 것

### 타이포그래피 스케일

| 역할 | 크기 범위 | 굵기 | letter-spacing | line-height |
|------|----------|------|---------------|------------|
| Hero Title | 56-72pt | 700-800 | -0.02em | 1.2 |
| Section Title | 40-48pt | 700 | -0.02em | 1.2 |
| Slide Title | 28-36pt | 600-700 | -0.01em | 1.2 |
| Subtitle | 18-22pt | 500 | 0 | 1.4 |
| Body | 14-18pt | 400 | 0 | 1.6 |
| Caption | 10-12pt | 400 | 0.02em | 1.4 |
| Label | 9-11pt | 500-600 | 0.02em | 1.0 |

팩 성격에 맞게 범위 내에서 조정하되, 모든 템플릿에서 일관되게 사용.

### 레이아웃 기준

```css
/* 슬라이드 기본 padding */
padding: 48pt;

/* 요소 간격 */
gap: 32pt;  /* 섹션 */
gap: 16pt;  /* 요소 */
gap: 8pt;   /* 텍스트 블록 내부 */

/* 그리드 */
grid-template-columns: 1fr 1fr;       /* 2열 균등 */
grid-template-columns: 2fr 3fr;       /* 40:60 */
grid-template-columns: repeat(3, 1fr); /* 3열 */
```

## 아트 디렉션 체크리스트

템플릿 완성 후 아래를 확인:

- [ ] 슬라이드마다 하나의 job, 하나의 visual anchor인가?
- [ ] 3-5초 안에 핵심 메시지를 파악할 수 있는가?
- [ ] 카드/그림자 없이도 프리미엄 느낌이 나는가?
- [ ] 여백이 충분한가? (padding 48pt 이상)
- [ ] 제거할 수 있는 장식 요소가 있는가?
- [ ] cover는 포스터처럼 임팩트 있는가?
- [ ] 색상이 2-3가지 이내인가?

## 참고: 잘 만들어진 기존 팩

```bash
# simple_light — 가장 완성도 높은 팩 (23개 템플릿)
slides-grab show-pack simple_light
slides-grab show-template cover --pack simple_light

# simple_dark — CSS 변수 활용이 잘 된 팩
slides-grab show-pack simple_dark
slides-grab show-template cover --pack simple_dark
```

기존 팩의 구조를 참고하되, 디자인 언어(색상, 분위기)는 새 팩 고유의 것으로.

## 완료 기준

- [ ] theme.css에 색상 + 타이포 변수 정의
- [ ] 최소 8개 필수 템플릿 생성
- [ ] 모든 텍스트가 시맨틱 태그 안에
- [ ] 타이포 스케일이 일관적
- [ ] `slides-grab show-pack <PACK_ID>`에서 정상 표시
- [ ] validation 통과
```

---

## 사용법

1. 새 세션을 열고 위 프롬프트를 붙여넣기
2. `<PACK_ID>`를 원하는 팩 이름으로 교체
3. 컨셉과 색상 방향을 자유롭게 작성
4. 한 세션에 1개 팩만 진행 (8-15개 템플릿 × 50-80줄 = 상당한 양)

## 예시

```
팩 이름: neon_dark
컨셉: 깊은 네이비 배경에 시안/마젠타 네온 액센트. 테크 스타트업 피칭용. 미래지향적이고 임팩트 있는 느낌.
색상 방향: 배경 #0a0e1a, 텍스트 #e8eaf0, 액센트 #00e5ff / #ff00e5
```
