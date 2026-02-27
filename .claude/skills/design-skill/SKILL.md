---
name: design-skill
description: 프레젠테이션 슬라이드를 미려한 HTML로 디자인. 슬라이드 HTML 생성, 시각적 디자인, 레이아웃 구성이 필요할 때 사용.
---

# Design Skill - 프로페셔널 프레젠테이션 디자인 시스템

최고 수준의 비즈니스 프레젠테이션을 위한 HTML 슬라이드 디자인 스킬입니다.
미니멀하고 세련된 디자인, 전문적인 타이포그래피, 정교한 레이아웃을 제공합니다.

---

## 핵심 디자인 철학

### 1. Less is More
- 불필요한 장식 요소 제거
- 콘텐츠가 주인공이 되는 디자인
- 여백(Whitespace)을 적극 활용
- 시각적 계층 구조 명확화

### 2. 타이포그래피 중심 디자인
- Pretendard를 기본 폰트로 사용
- 폰트 크기 대비로 시각적 임팩트 생성
- 자간과 행간의 섬세한 조절
- 웨이트 변화로 강조점 표현

### 3. 전략적 색상 사용
- 제한된 색상 팔레트 (2-3색)
- 모노톤 기반 + 포인트 컬러
- 배경색으로 분위기 연출
- 고대비로 가독성 확보

---

## 기본 설정

### 슬라이드 크기 (16:9 기본)
```html
<body style="width: 720pt; height: 405pt;">
```

### 지원 비율
| 비율 | 크기 | 용도 |
|------|------|------|
| 16:9 | 720pt × 405pt | 기본, 모니터/화면 |
| 4:3 | 720pt × 540pt | 구형 프로젝터 |
| 16:10 | 720pt × 450pt | 맥북 |

### 기본 폰트 스택
```css
font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

### Pretendard 웹폰트 CDN
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
```

---

## 타이포그래피 시스템

### 폰트 크기 스케일
| 용도 | 크기 | 웨이트 | 사용 예시 |
|------|------|--------|----------|
| Hero Title | 72-96pt | 700-800 | 표지 메인 타이틀 |
| Section Title | 48-60pt | 700 | 섹션 구분 제목 |
| Slide Title | 32-40pt | 600-700 | 슬라이드 제목 |
| Subtitle | 20-24pt | 500 | 부제목, 설명 |
| Body | 16-20pt | 400 | 본문 텍스트 |
| Caption | 12-14pt | 400 | 캡션, 출처 |
| Label | 10-12pt | 500-600 | 뱃지, 태그 |

### 자간 설정 (letter-spacing)
```css
/* 대형 제목: 타이트하게 */
letter-spacing: -0.02em;

/* 중형 제목 */
letter-spacing: -0.01em;

/* 본문: 기본 */
letter-spacing: 0;

/* 캡션, 레이블: 약간 넓게 */
letter-spacing: 0.02em;
```

### 행간 설정 (line-height)
```css
/* 제목 */
line-height: 1.2;

/* 본문 */
line-height: 1.6 - 1.8;

/* 한 줄 텍스트 */
line-height: 1;
```

---

## 색상 팔레트 시스템

### 1. Executive Minimal (기본 권장)
세련된 비즈니스 프레젠테이션용
- 파일: `themes/executive.css`

### 2. Sage Professional
차분하고 신뢰감 있는 톤
- 파일: `themes/sage.css`

### 3. Modern Dark
임팩트 있는 다크 테마
- 파일: `themes/modern-dark.css`

### 4. Corporate Blue
전통적 비즈니스 톤
- 파일: `themes/corporate.css`

### 5. Warm Neutral
따뜻하고 친근한 톤
- 파일: `themes/warm.css`

테마 파일은 공통 CSS 변수(`:root`) 형태로 관리됩니다. 필요 시 테마 파일을 복사해 사용자 커스텀 테마로 확장하세요.

---

## 레이아웃 시스템

### 여백 기준 (padding/margin)
```css
/* 슬라이드 전체 여백 */
padding: 48pt;

/* 섹션 간 여백 */
gap: 32pt;

/* 요소 간 여백 */
gap: 16pt;

/* 텍스트 블록 내 여백 */
gap: 8pt;
```

### 그리드 시스템
```css
/* 2단 레이아웃 */
display: grid;
grid-template-columns: 1fr 1fr;
gap: 32pt;

/* 3단 레이아웃 */
grid-template-columns: repeat(3, 1fr);

/* 비대칭 레이아웃 (40:60) */
grid-template-columns: 2fr 3fr;

/* 비대칭 레이아웃 (30:70) */
grid-template-columns: 1fr 2.3fr;
```

---

## 디자인 컴포넌트

### 1. 뱃지/태그
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

### 2. 섹션 넘버
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

### 3. 로고 영역
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

### 4. 아이콘 버튼
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
  <p style="font-size: 14pt;">↗</p>
</div>
```

### 5. 구분선
```html
<div style="
  width: 100%;
  height: 1pt;
  background: #d4d4d0;
"></div>
```

### 6. 정보 그리드
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

## 슬라이드 템플릿

### 1. 표지 슬라이드 (Cover)
- 템플릿 파일: `templates/cover.html`

### 2. 목차 슬라이드 (Contents)
- 템플릿 파일: `templates/contents.html`

### 3. 섹션 구분 슬라이드 (Section Divider)
- 템플릿 파일: `templates/section-divider.html`

### 4. 콘텐츠 슬라이드 (Content)
- 템플릿 파일: `templates/content.html`

### 5. 통계/데이터 슬라이드 (Statistics)
- 템플릿 파일: `templates/statistics.html`

### 6. 이미지 + 텍스트 슬라이드 (Split Layout)
- 템플릿 파일: `templates/split-layout.html`

### 7. 팀 소개 슬라이드 (Team)
- 템플릿 파일: `templates/team.html`

### 8. 인용문 슬라이드 (Quote)
- 템플릿 파일: `templates/quote.html`

### 9. 타임라인 슬라이드 (Timeline)
- 템플릿 파일: `templates/timeline.html`

### 10. 마무리 슬라이드 (Closing)
- 템플릿 파일: `templates/closing.html`

### 커스텀 템플릿
- 커스텀 템플릿 저장 경로: `templates/custom/`
- 사용자가 템플릿 파일을 drop-in 방식으로 추가하여 재사용할 수 있습니다.

---

## 고급 디자인 패턴

### 비대칭 레이아웃
시선을 끄는 독창적인 구성
```css
/* 황금비율 기반 */
grid-template-columns: 1fr 1.618fr;

/* 극단적 비대칭 */
grid-template-columns: 1fr 3fr;
```

### 오버레이 텍스트
이미지 위 텍스트 배치
```html
<div style="position: relative;">
  <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.5);"></div>
  <div style="position: relative; z-index: 1;">
    <h2 style="color: #fff;">Overlay Text</h2>
  </div>
</div>
```

### 그라데이션 오버레이
```html
<div style="
  background: linear-gradient(to right, #1a1a1a 0%, transparent 60%);
  position: absolute;
  inset: 0;
"></div>
```

### 카드 스타일
```html
<div style="
  background: #ffffff;
  border-radius: 12pt;
  padding: 24pt;
  box-shadow: 0 2pt 8pt rgba(0,0,0,0.08);
"></div>
```

---

## 텍스트 사용 규칙

### 필수 태그
```html
<!-- 모든 텍스트는 반드시 다음 태그 안에 -->
<p>, <h1>-<h6>, <ul>, <ol>, <li>

<!-- 금지 - PowerPoint에서 무시됨 -->
<div>텍스트</div>
<span>텍스트</span>
```

### 권장 사용법
```html
<!-- 좋은 예 -->
<h1 style="...">제목</h1>
<p style="...">본문 텍스트</p>

<!-- 나쁜 예 -->
<div style="...">텍스트 직접 입력</div>
```

---

## 출력 및 파일 구조

### 파일 저장 규칙
```
slides/
├── slide-01.html  (표지)
├── slide-02.html  (목차)
├── slide-03.html  (섹션 구분)
├── slide-04.html  (내용)
├── ...
└── slide-XX.html  (마무리)
```

### 파일 명명 규칙
- 2자리 숫자 사용: `slide-01.html`, `slide-02.html`
- 순서대로 명명
- 특수문자, 공백 사용 금지

---

## 워크플로우 (Stage 2: 디자인 + 인간 개입)

이 스킬은 **Stage 2**에 해당합니다. Stage 1(plan-skill)에서 사용자가 승인한 `slide-outline.md`를 기반으로 작업합니다.

### 전제조건
- `slide-outline.md`가 존재하고 사용자에 의해 승인된 상태여야 합니다.

### 단계

1. **분석 + 디자인**: `slide-outline.md` 읽고 테마/레이아웃 결정 후 HTML 슬라이드 생성
2. **뷰어 자동 빌드**: 슬라이드 생성 완료 후 자동으로 실행:
   ```bash
   node scripts/build-viewer.js
   ```
3. **사용자 확인 안내**: 사용자에게 브라우저에서 슬라이드를 확인하도록 안내:
   ```
   open slides/viewer.html
   ```
4. **수정 루프**: 사용자가 특정 슬라이드 수정을 요청하면:
   - 해당 HTML 파일만 수정
   - `node scripts/build-viewer.js` 재실행하여 뷰어 재빌드
   - 사용자에게 다시 확인 안내
5. **완료**: 사용자가 "PPTX 변환" 또는 유사한 승인 의사를 밝힐 때까지 수정 루프를 반복

### 절대 규칙
- **승인 없이 PPTX 변환을 시작하지 않음** - PPTX 변환은 `pptx-skill`의 역할이며, 사용자의 명시적 승인이 필요합니다.
- **뷰어 빌드를 잊지 않음** - 슬라이드를 생성하거나 수정할 때마다 `node scripts/build-viewer.js`를 실행합니다.

---

## 주의사항

1. **CSS 그라데이션**: PowerPoint 변환 시 지원 안됨 - 배경 이미지로 대체
2. **웹폰트**: Pretendard CDN 링크 항상 포함
3. **이미지 경로**: 절대 경로 또는 URL 사용
4. **호환성**: 모든 색상에 # 포함
5. **텍스트 규칙**: div/span에 직접 텍스트 금지
