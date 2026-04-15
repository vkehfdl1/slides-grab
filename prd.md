# PRD

## Project
- Name: slides-grab
- Branch: main
- Description: Agent-first PPT framework — AI 에이전트가 HTML 슬라이드를 직접 작성하고, 3단계 파이프라인(Planning→Design→Conversion)으로 고품질 PPTX/PDF를 생성하는 프레임워크. 이번 PRD는 프레임워크의 핵심 기능 확장(VLM 검증, 차트 지원, 스타일 추출)과 배포 기반(npm 패키지, Skills 표준)을 구축한다.

## User Stories

### US-001
- Title: 팩 시스템 외부화
- Priority: 1
- Description: design-skill/SKILL.md에 내장된 디자인 정보를 design.md + theme.css 기반 팩 시스템으로 분리한다. 각 팩은 design.md(디자인 철학, CSS 패턴, 레이아웃 원칙)와 theme.css(색상, 타이포그래피 변수)로 구성되며, 에이전트가 참조하여 슬라이드를 생성한다.
- Acceptance Criteria:
  - REQ-001 `packs/` 디렉토리에 design.md + theme.css 기반 팩이 존재한다
  - REQ-002 각 팩의 theme.css에 색상, 타이포그래피 CSS 변수가 정의된다
  - REQ-003 design-skill/SKILL.md에서 인라인 디자인 코드가 제거되고, 대신 팩의 design.md와 theme.css를 참조하도록 업데이트된다
  - REQ-004 design-skill/SKILL.md의 디자인 철학, 규칙, 제약사항 섹션은 그대로 유지된다
  - REQ-005 사용자가 새 팩을 `packs/` 디렉토리에 drop-in으로 추가할 수 있다

### US-002
- Title: Playwright 기반 구조화 검증 스크립트
- Priority: 2
- Description: HTML 슬라이드 생성 후 Playwright로 렌더링하여 overflow, 텍스트 잘림, 요소 겹침 등 구조적 문제를 프로그래밍적으로 자동 탐지하는 검증 스크립트를 만든다. VLM 호출 없이 비용 0으로 기본 품질을 보장한다.
- Acceptance Criteria:
  - REQ-006 `scripts/validate-slides.js`가 존재하고, `node scripts/validate-slides.js` 명령으로 실행 가능하다
  - REQ-007 슬라이드 프레임(720pt × 405pt) 밖으로 넘치는 요소를 탐지한다 (boundingBox 검사)
  - REQ-008 `scrollHeight > clientHeight`인 텍스트 요소(텍스트 잘림)를 탐지한다
  - REQ-009 같은 레벨 요소들의 boundingBox 교차(겹침)를 탐지한다
  - REQ-010 결과를 JSON 형식으로 출력한다 (slide별 status: pass/fail, critical 이슈 목록, warning 목록, summary)
  - REQ-011 `slides/` 디렉토리의 모든 `slide-*.html` 파일을 자동으로 검증한다

### US-003
- Title: VLM Provider 표준 인터페이스 (Vercel AI SDK)
- Priority: 3
- Description: Vercel AI SDK를 사용하여 VLM(Vision Language Model)에 이미지를 보내고 분석 결과를 받는 통합 인터페이스를 구현한다. Gemini, Claude, OpenAI 프로바이더를 교체 가능하게 지원한다. JavaScript로 작성한다.
- Acceptance Criteria:
  - REQ-012 `ai`, `@ai-sdk/google`, `@ai-sdk/anthropic` 패키지가 package.json dependencies에 추가된다
  - REQ-013 `src/vlm/analyze.js`에 `analyzeImage(imagePath, prompt, config)` 함수가 존재하고 export된다
  - REQ-014 `src/vlm/analyze.js`에 `analyzeImages(imagePaths, prompt, config)` 함수가 존재하고 export된다 (여러 이미지 동시 분석)
  - REQ-015 config 객체로 `{ provider: "google"|"anthropic"|"openai", model: "모델명", maxTokens, temperature }`를 받는다
  - REQ-016 환경 변수 `GEMINI_API_KEY` 또는 `ANTHROPIC_API_KEY`로 API 키를 설정할 수 있다
  - REQ-017 반환값은 `{ content: string, usage: { inputTokens, outputTokens } }` 형태이다

### US-004
- Title: 차트/다이어그램/이미지 HTML 라이브러리 지원
- Priority: 4
- Description: design-skill이 Chart.js(차트), Mermaid(다이어그램), 인라인 SVG(아이콘), 이미지를 활용할 수 있도록 CDN 링크, 사용법 가이드, 예시 템플릿을 추가한다. html2pptx.js에서 JS 라이브러리 렌더링 대기 로직도 추가한다.
- Acceptance Criteria:
  - REQ-018 design-skill/SKILL.md에 Chart.js CDN 링크와 사용 예시(bar, line, pie 차트)가 포함된다
  - REQ-019 design-skill/SKILL.md에 Mermaid CDN 링크와 사용 예시(flowchart, sequence diagram)가 포함된다
  - REQ-020 design-skill/SKILL.md에 인라인 SVG 아이콘 작성 가이드가 포함된다
  - REQ-021 design-skill/SKILL.md에 이미지 사용 규칙(로컬 경로, URL, 플레이스홀더)이 포함된다
  - REQ-022 design-skill/SKILL.md에 Chart.js 차트가 포함된 슬라이드 예시가 문서화된다
  - REQ-023 design-skill/SKILL.md에 Mermaid 다이어그램이 포함된 슬라이드 예시가 문서화된다
  - REQ-024 html2pptx.js(또는 관련 변환 스크립트)에서 Chart.js/Mermaid 렌더링 완료를 대기하는 로직이 있다

### US-005
- Title: VLM 기반 슬라이드 자동 포맷 검증
- Priority: 5
- Description: VLM Provider 인터페이스(US-003)를 사용하여 슬라이드 스크린샷을 VLM에 보내고, 시각적 포맷 문제(overflow, 단어 잘림, 겹침, 가독성)를 탐지하는 검증 스크립트를 만든다. 사용자가 명시적으로 요청할 때만 실행되며, 최대 반복 횟수를 설정할 수 있다. 사용자는 뷰어에서 직접 VLM을 통해 수정을 요구할 수 있다.
- Acceptance Criteria:
  - REQ-025 `scripts/vlm-validate.js`가 존재하고 실행 가능하다
  - REQ-026 각 슬라이드를 Playwright로 스크린샷(1600×900px)하여 VLM에 전송한다
  - REQ-027 VLM 피드백을 구조화된 JSON으로 파싱한다 (slide, issues 배열, pass/fail)
  - REQ-028 `--max-iterations` 옵션으로 최대 반복 횟수를 설정할 수 있다 (기본값 3)
  - REQ-029 `--provider`와 `--model` 옵션으로 VLM 프로바이더와 모델을 지정할 수 있다 (기본값 google/gemini-2.0-flash)
  - REQ-030 US-003의 `analyzeImage()` 함수를 사용한다

### US-006
- Title: PDF 출력 지원
- Priority: 6
- Description: HTML 슬라이드를 PDF로 변환하는 스크립트를 만든다. Playwright의 page.pdf()를 사용하여 각 슬라이드를 PDF로 렌더링하고, pdf-lib로 하나의 PDF로 병합한다.
- Acceptance Criteria:
  - REQ-031 `pdf-lib` 패키지가 package.json dependencies에 추가된다
  - REQ-032 `scripts/html2pdf.js`가 존재하고 `node scripts/html2pdf.js` 명령으로 실행 가능하다
  - REQ-033 slides/ 디렉토리의 모든 slide-*.html을 순서대로 PDF로 변환한다
  - REQ-034 `printBackground: true` 옵션으로 배경색이 보존된다 (다크 테마에서 필수)
  - REQ-035 개별 슬라이드 PDF를 하나의 파일로 병합하여 최종 PDF를 출력한다
  - REQ-036 `--output` 옵션으로 출력 파일 경로를 지정할 수 있다

### US-007
- Title: VLM 기반 사용자 스타일 추출
- Priority: 7
- Description: 사용자가 제공한 PPTX 또는 PDF 파일에서 슬라이드를 스크린샷하고, VLM으로 디자인 시스템(컬러, 폰트, 레이아웃, 톤)을 분석하여 style-config.md로 출력한다. 긴 프레젠테이션은 랜덤 샘플링으로 비용을 최적화한다.
- Acceptance Criteria:
  - REQ-037 `scripts/extract-style.js`가 존재하고 실행 가능하다
  - REQ-038 PPTX 파일을 입력받아 슬라이드별 스크린샷을 생성할 수 있다 (LibreOffice 또는 Playwright 활용)
  - REQ-039 PDF 파일을 입력받아 페이지별 스크린샷을 생성할 수 있다 (Poppler pdftoppm 활용)
  - REQ-040 슬라이드가 10장 이상이면 랜덤 샘플링(5~8장)을 수행한다. 첫 번째(표지)와 마지막(마무리) 슬라이드는 항상 포함한다
  - REQ-041 US-003의 `analyzeImages()` 함수를 사용하여 VLM에 분석을 요청한다
  - REQ-042 결과를 `style-config.md`로 출력한다 (컬러 팔레트, 폰트 시스템, 레이아웃 패턴, 슬라이드 타입, 전체 톤 포함)

### US-008
- Title: 프로젝트 패키징 기반 구조
- Priority: 8
- Description: slides-grab를 npm 패키지로 배포하기 위한 기반 구조를 구축한다. SETUP.md 작성, README.md 업데이트, CLI 기본 뼈대, agentskills.io 표준 SKILL.md frontmatter 적용. npm publish 자체는 이번 범위에 포함하지 않는다.
- Acceptance Criteria:
  - REQ-043 `SETUP.md`가 존재하고, macOS(brew), Ubuntu(apt), Windows(winget) 별 원라이너 설치 명령이 포함된다
  - REQ-044 `README.md`에 SETUP.md 내용이 포함되어 사용자가 복붙으로 설치할 수 있다
  - REQ-045 `bin/slides-grab.js`에 CLI 기본 뼈대가 존재한다 (commander 패키지 사용, `slides-grab --help` 출력 가능)
  - REQ-046 CLI에 `build-viewer`, `validate`, `convert` 서브커맨드가 정의된다 (각 스크립트를 호출하는 래퍼)
  - REQ-047 package.json에 `"bin": { "slides-grab": "./bin/slides-grab.js" }`가 설정된다
  - REQ-048 모든 SKILL.md 파일에 agentskills.io 표준 frontmatter(name, description)가 포함된다
