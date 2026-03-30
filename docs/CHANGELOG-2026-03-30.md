# slides-grab 개선 사항 (2026-03-30)

16개 기능이 추가/개선되었습니다. 아래 가이드를 따라 하나씩 테스트해보세요.

---

## 1. Undo/Redo (실행 취소 / 다시 실행)

**사용법:**
- `Ctrl+Z` (Mac: `Cmd+Z`) — 실행 취소
- `Ctrl+Shift+Z` 또는 `Ctrl+Y` — 다시 실행

**테스트 방법:**
1. `slides-grab edit --slides-dir decks/<deck-name>` 으로 에디터를 엽니다
2. Select 모드에서 텍스트를 선택하고 색상을 변경합니다
3. `Ctrl+Z`를 누르면 변경 전으로 돌아갑니다
4. `Ctrl+Shift+Z`를 누르면 다시 변경된 상태로 복구됩니다
5. AI 편집(bbox 선택 후 Send) 후에도 Undo가 동작합니다

---

## 2. 키보드 단축키 확장

**새로 추가된 단축키:**

| 키 | 동작 |
|----|------|
| `←` / `→` | 이전/다음 슬라이드 |
| `D` | Draw 모드 (bbox 그리기) |
| `S` | Select 모드 (객체 선택) |
| `F5` | 프레젠테이션 모드 진입 |
| `Ctrl+Z` | 실행 취소 |
| `Ctrl+Shift+Z` | 다시 실행 |
| `?` | 단축키 도움말 |

**테스트 방법:**
1. 에디터에서 `?` 키를 누르면 전체 단축키 목록이 표시됩니다
2. `D` → Draw 모드, `S` → Select 모드로 전환됩니다
3. `←` / `→`로 슬라이드를 이동합니다

---

## 3. 슬라이드 복제/삭제

**사용법:**
- `POST /api/slides/:file/duplicate` — 슬라이드 복제
- `DELETE /api/slides/:file` — 슬라이드 삭제
- 복제/삭제 후 자동으로 파일명이 재정렬됩니다 (slide-01, slide-02, ...)

**테스트 방법:**
1. 에디터에서 슬라이드를 열고, 브라우저 개발자 도구 콘솔에서:
   ```js
   // 현재 슬라이드 복제
   fetch('/api/slides/slide-01.html/duplicate', { method: 'POST' })
     .then(r => r.json()).then(console.log)

   // 슬라이드 삭제
   fetch('/api/slides/slide-03.html', { method: 'DELETE' })
     .then(r => r.json()).then(console.log)
   ```
2. 복제 후 슬라이드 수가 1개 늘어나고, 삭제 후 1개 줄어듭니다
3. 파일명이 항상 slide-01, slide-02, ... 순서로 유지됩니다

---

## 4. 슬라이드 순서 변경 (Drag & Drop)

**사용법:**
에디터 하단의 썸네일 스트립에서 슬라이드를 드래그하여 순서를 변경합니다.

**테스트 방법:**
1. 에디터를 열면 하단에 슬라이드 썸네일이 보입니다
2. 썸네일을 마우스로 잡고 다른 위치로 드래그합니다
3. 드래그 중인 썸네일은 반투명해지고, 놓을 위치에 테두리가 표시됩니다
4. 놓으면 서버에서 파일명이 재정렬되고 슬라이드 순서가 변경됩니다

---

## 5. 비주얼 썸네일 프리뷰

**변경 내용:**
기존에 번호만 표시되던 썸네일이 실제 슬라이드의 축소 미리보기로 변경되었습니다.

**테스트 방법:**
1. 에디터를 열면 하단 썸네일 스트립에 각 슬라이드의 미니 프리뷰가 보입니다
2. 각 썸네일 우측 하단에 슬라이드 번호가 표시됩니다
3. 클릭하면 해당 슬라이드로 이동합니다

---

## 6. Presenter Notes (발표자 노트)

**사용법:**
각 슬라이드에 발표 시 참고할 메모를 작성할 수 있습니다.

**테스트 방법:**
1. 에디터 사이드바에 "Presenter Notes" 섹션이 있습니다
2. 텍스트를 입력하면 자동으로 저장됩니다 (1초 후 또는 포커스 이탈 시)
3. 다른 슬라이드로 이동했다가 돌아오면 노트가 유지됩니다
4. 노트는 `decks/<deck>/slide-01.notes.md` 파일에 저장됩니다:
   ```bash
   cat decks/<deck-name>/slide-01.notes.md
   ```

---

## 7. 프레젠테이션 모드

**사용법:**
- `F5` 키 또는 상단 네비게이션의 **Play 버튼**을 클릭합니다

**테스트 방법:**
1. 에디터에서 `F5`를 누르면 전체화면으로 전환됩니다
2. `→` / `Space` — 다음 슬라이드 (0.3초 fade 전환)
3. `←` — 이전 슬라이드
4. `N` — 발표자 노트 토글 (하단에 표시)
5. `Escape` — 프레젠테이션 모드 종료
6. 우측 하단에 "3 / 12" 형태의 슬라이드 카운터가 표시됩니다

---

## 8. 에디터 Hot Reload (개발자용)

**사용법:**
소스 코드에서 개발할 때 자동으로 브라우저가 새로고침됩니다.

**테스트 방법:**
1. `slides-grab edit`으로 에디터를 실행합니다
2. `src/editor/js/` 내 JS 파일이나 `src/editor/editor.css`를 수정합니다
3. 저장 후 약 300ms 뒤 브라우저가 자동으로 새로고침됩니다
4. 이 기능은 개발 환경(`.git` 폴더가 있는 경우)에서만 활성화됩니다

---

## 9. CSS 외부 분리 (구조 개선)

**변경 내용:**
- `editor.html`: 4,557줄 → 589줄 (CSS를 `editor.css`로 분리)
- `browser.html`: 942줄 → 364줄 (CSS를 `browser.css`로 분리)

**테스트 방법:**
1. 에디터를 열고 모든 스타일이 정상 적용되는지 확인합니다
2. 다크/라이트 테마 토글이 정상 동작하는지 확인합니다
3. 브라우저 개발자 도구 Network 탭에서 `editor.css`가 로드되는지 확인합니다

---

## 10. 서버 모듈 분리 (구조 개선)

**변경 내용:**
- `editor-server.js`: 3,051줄 → 297줄
- 18개 모듈로 분리 (`scripts/server/routes/`, `scripts/server/`)
- 모든 모듈 300줄 이하

**테스트 방법:**
1. `slides-grab edit`, `slides-grab browse`, `slides-grab create` 등 모든 명령이 정상 동작합니다
2. 에디터에서 슬라이드 편집, AI 편집, 내보내기 등이 모두 동작합니다

---

## 11. 접근성 검증

**사용법:**
```bash
slides-grab validate --slides-dir decks/<deck-name>
```

**새로 추가된 검사:**
- **대비 비율 (WCAG 2.1)**: 텍스트 색상과 배경 색상의 대비가 4.5:1 미만이면 경고
- **이미지 alt 텍스트**: `<img>`에 alt 속성이 없으면 경고

**테스트 방법:**
1. 대비가 낮은 슬라이드를 만듭니다 (예: 밝은 회색 배경에 흰색 텍스트)
2. `slides-grab validate`를 실행하면 `low-contrast` 경고가 표시됩니다
3. `<img>` 태그에서 alt 속성을 제거하면 `missing-alt-text` 경고가 표시됩니다

---

## 12. 커스텀 Pack 생성 CLI

**사용법:**
```bash
slides-grab pack init my-custom-pack
```

**테스트 방법:**
1. 위 명령어를 실행합니다
2. `packs/my-custom-pack/` 디렉토리가 생성됩니다:
   ```
   packs/my-custom-pack/
   ├── theme.css        # CSS 변수 (색상, 폰트 등)
   └── templates/       # 빈 디렉토리 (템플릿 추가용)
   ```
3. `theme.css`를 열어 색상을 수정합니다
4. `slides-grab create --pack my-custom-pack` 으로 커스텀 팩을 사용합니다
5. 잘못된 이름 (대문자, 특수문자) 은 거부됩니다:
   ```bash
   slides-grab pack init "My Pack"   # 에러
   slides-grab pack init _invalid    # 에러
   ```

---

## 13. CSS 그래디언트 자동 래스터화

**변경 내용:**
PPTX 내보내기 시 CSS 그래디언트(`linear-gradient`, `radial-gradient`)가 자동으로 PNG 이미지로 변환됩니다. 이전에는 단색으로 표시되었습니다.

**테스트 방법:**
1. 그래디언트 배경을 사용하는 슬라이드를 만듭니다 (예: `creative` 또는 `midnight` 팩)
2. PPTX로 내보냅니다
3. PowerPoint에서 열면 그래디언트가 정상적으로 표시됩니다

---

## 14. PPTX 텍스트 폭 개선 (opentype.js)

**변경 내용:**
PPTX 내보내기 시 텍스트 폭을 opentype.js 폰트 메트릭으로 정확하게 계산합니다. 이전의 2% 보정 해킹 대신 실제 글꼴 너비를 측정합니다.

**테스트 방법:**
1. 긴 제목이 있는 슬라이드를 PPTX로 내보냅니다
2. PowerPoint에서 열어 텍스트가 잘리지 않는지 확인합니다
3. 시스템에 Arial, Helvetica 등의 폰트가 설치되어 있으면 더 정확한 결과를 얻습니다
4. 폰트를 찾을 수 없으면 기존 2% 보정이 자동 적용됩니다 (graceful fallback)

---

## 15. Pack 갤러리 프리뷰 페이지

**사용법:**
에디터에서 접근하거나 직접 URL로 접근합니다.

**테스트 방법:**
1. 에디터를 실행합니다: `slides-grab edit --slides-dir decks/<deck-name>`
2. Create 모드에서 팩 선택 섹션 아래 **"Browse all packs"** 링크를 클릭합니다
3. 또는 직접 `http://localhost:3456/packs-gallery` 에 접속합니다
4. 모든 팩이 카드 형태로 표시됩니다:
   - 커버 템플릿의 실제 미리보기
   - 색상 팔레트 (배경, 텍스트, 액센트)
   - 보유 템플릿 목록
5. 다크/라이트 테마 토글이 동작합니다

---

## 16. 크로스-슬라이드 일관성 검사

**사용법:**
```bash
slides-grab review --deck <deck-name>
```

**새로 추가된 검사 항목:**
- 슬라이드 간 **제목 폰트 크기** 편차 (2pt 초과 시 경고)
- 슬라이드 간 **본문 폰트 크기** 편차 (1pt 초과 시 경고)
- **색상 사용** 일관성 (테마 외 4개 초과 색상 사용 시 경고)
- **패딩 패턴** 일관성 (3가지 초과 패딩 패턴 시 경고)

**테스트 방법:**
1. 여러 슬라이드가 있는 덱에서 실행합니다:
   ```bash
   slides-grab review --deck my-deck
   ```
2. 출력에 **Consistency** 섹션이 추가되어 일관성 상태를 보여줍니다
3. 일관성 문제가 있으면 Visual 점수에 반영됩니다

---

## PPTX 변환 테스트 (개발자용)

122개 자동화 테스트가 추가되었습니다:

```bash
# 전체 테스트 실행
npm test

# 개별 테스트
node --test tests/pptx/html2pptx.test.js          # PPTX 변환 (62개)
node --test tests/validation/accessibility.test.js  # 접근성 검증 (26개)
node --test tests/editor/editor-history.test.js     # Undo/Redo (13개)
node --test tests/validation/consistency.test.js    # 일관성 검사 (9개)
node --test tests/pack/pack-init.test.js            # Pack CLI (18개)
```
