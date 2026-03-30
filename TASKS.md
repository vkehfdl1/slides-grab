# slides-grab 개선 TASKS

> 2026-03-30 생성. 우선순위 높은 항목부터 Phase별 진행.

---

## Phase 1: Foundation — 독립적 병렬 작업

서버 코드를 건드리지 않는 독립 모듈. 전부 병렬 진행 가능.

### 1A. Architecture
- [x] 6.4 `editor.html` CSS 외부 분리 → `editor.css`
- [x] 7.2 PPTX 변환 테스트 추가 (`html2pptx.cjs` 스냅샷 테스트)

### 1B. Features (Editor JS Only)
- [x] 1.1 Undo/Redo 히스토리 스택 (per-slide HTML 스냅샷)
- [x] 2.5 키보드 단축키 확장 (D=Draw, S=Select, Arrow, Undo/Redo)

### 1C. Validation & CLI
- [x] 5.1 접근성 검증 (contrast ratio, alt text)
- [x] 4.2 커스텀 Pack 생성 CLI (`slides-grab pack init <name>`)

---

## Phase 2: Server Modularization

Phase 1과 병렬로 진행하되, 별도 브랜치에서 신중하게 작업.

- [ ] 6.1 `editor-server.js` (3,046줄) → Express Router 모듈 분리
  - [ ] routes/slides.js (슬라이드 CRUD)
  - [ ] routes/decks.js (덱 관리)
  - [ ] routes/export.js (PDF/SVG/Figma 내보내기)
  - [ ] routes/plan.js (플랜/생성/아웃라인)
  - [ ] routes/events.js (SSE 이벤트)
  - [ ] middleware/ (공통 미들웨어)
  - [ ] 기존 기능 회귀 테스트 통과 확인

---

## Phase 3: Server-Dependent Features

Phase 2 머지 후 진행. 새 라우트 모듈에 엔드포인트 추가.

### 3A. Core Slide Operations
- [ ] 1.3 슬라이드 복제/삭제 (UI + API)
- [ ] 1.2 슬라이드 순서 변경 — Drag & Drop (UI + API)
- [ ] 2.1 비주얼 썸네일 프리뷰 (스크린샷 기반)

### 3B. Presenter & Presentation
- [ ] 1.4 Presenter Notes 지원 (저장 형식 + UI + 내보내기 연동)
- [ ] NEW: 프레젠테이션 모드 (전체화면 + fade 전환 + 노트 뷰)

### 3C. DX
- [ ] 7.1 에디터 Hot Reload (fsWatch → SSE reload 이벤트)

---

## Phase 4: Conversion & Design

독립적으로 병렬 가능.

### 4A. PPTX Quality
- [ ] 3.1 벡터 기반 PPTX 개선 (opentype.js 폰트 메트릭)
- [ ] 3.2 CSS 그래디언트 자동 래스터화

### 4B. Pack System
- [ ] 4.1 Pack 갤러리/프리뷰 페이지
- [ ] NEW: 슬라이드 생성 시 일관성 가이드 (크로스-슬라이드 스타일 규칙)

---

## Notes
- 각 태스크 완료 시 Quality Gate (테스트, 린트, 빌드) 통과 필수
- Phase 경계에서 기존 기능 회귀 없음을 확인
- 병렬 작업은 worktree 격리로 파일 충돌 방지
