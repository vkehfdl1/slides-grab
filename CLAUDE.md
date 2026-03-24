# CLAUDE.md — slides-grab

> Claude Code가 세션 시작 시 자동으로 읽는 프로젝트 컨텍스트 파일입니다.
> 상세 설치 가이드: `docs/installation/claude.md`

## Setup

```bash
git clone https://github.com/vkehfdl1/slides-grab.git && cd slides-grab
npm ci && npx playwright install chromium
```

## Skill Workflow (3-stage)

1. **Plan** — `.claude/skills/plan-skill/SKILL.md`
2. **Design** — `.claude/skills/design-skill/SKILL.md`
3. **PPTX** — `.claude/skills/pptx-skill/SKILL.md`

통합 스킬: `.claude/skills/presentation-skill/SKILL.md`

## Working Directory

슬라이드 작업은 항상 `decks/<deck-name>/` 디렉토리 안에서 수행합니다.

## Validation

변환(convert/pptx) 실행 전 반드시 validate를 먼저 실행하세요:

```bash
slides-grab validate --slides-dir decks/<deck-name>
```

## Template Pack System

템플릿은 `packs/` 디렉토리에서 팩 단위로 관리됩니다. 각 팩은 고유한 시각 디자인을 제공합니다.
기본 팩은 `simple_light`입니다.

### Pack CLI Commands

```bash
slides-grab list-packs                              # 전체 팩 목록 + 색상 + 템플릿 수
slides-grab show-pack <pack-id>                      # 팩 상세 (색상, 보유 템플릿, 미보유 type)
slides-grab show-template <name> --pack <pack-id>    # 특정 팩의 템플릿 HTML 보기
slides-grab show-theme <pack-id>                     # 팩의 theme.css 보기
```

### Pack Resolution

1. `packs/<packId>/templates/<name>.html` 확인
2. 팩에 없는 type → AI가 팩의 theme.css 색상으로 직접 디자인
3. 팩 미지정 시 `simple_light` 사용

공통 type 목록은 `packs/common-types.json`에 정의.

## Slide Size

**720pt × 405pt** 고정 (HTML에서 1280×720 → scale 0.75)

## Windows 환경 주의사항

- 에디터 실행 시 환경변수 필요: `PPT_AGENT_CLAUDE_BIN="claude.cmd"`
- spawn 호출 시 반드시 `shell: true` 옵션 유지
