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

### Available Packs (6종)

| ID | 이름 | 컨셉 | 보유 템플릿 |
|---|---|---|---|
| `figma-default` | Figma Default | 흰 배경 + 검정 + 오렌지 (기본값) | 23개 전체 |
| `midnight` | Midnight | 딥 네이비 + 골드. 프리미엄 다크 | 핵심 7개 |
| `corporate` | Corporate | 화이트 + 네이비/블루. 비즈니스 | 핵심 7개 |
| `creative` | Creative | 그라디언트 + 핑크/인디고. 크리에이티브 | 핵심 7개 |
| `grab` | Grab | 모던 비즈니스. 인라인 스타일 | 12개 |
| `mobile_strategy` | Mobile Strategy | 다크 로즈 + 핑크. 모바일 전략 | 11개 |

### Pack CLI Commands

```bash
# 팩 목록 보기
slides-grab list-packs

# 팩 상세 보기
slides-grab show-pack midnight

# 팩 전용 템플릿 보기 (없으면 figma-default fallback)
slides-grab show-template cover --pack midnight
```

### Pack Resolution

1. `packs/<packId>/templates/<name>.html` 확인
2. 팩에 없는 type → AI가 팩의 theme.css 색상으로 직접 디자인
3. 팩 미지정 시 figma-default 사용

공통 type 목록은 `packs/common-types.json`에 정의. 각 팩의 보유 템플릿은 `slides-grab show-pack <id>`로 확인.

## Available Templates (23종)

| 템플릿 | 설명 |
|--------|------|
| `big-metric` | 큰 숫자/지표 강조 |
| `chart` | 차트 레이아웃 |
| `closing` | 마무리 슬라이드 |
| `content` | 일반 콘텐츠 |
| `contents` | 목차 |
| `cover` | 표지 |
| `diagram` | 다이어그램 |
| `funnel` | 퍼널 차트 |
| `highlight` | 하이라이트/강조 |
| `image-description` | 이미지 + 설명 |
| `image-text` | 이미지 + 텍스트 |
| `key-metrics` | 핵심 지표 모음 |
| `matrix` | 매트릭스/격자 |
| `principles` | 원칙/가이드 나열 |
| `quote` | 인용문 |
| `quotes-grid` | 인용문 그리드 |
| `section-divider` | 섹션 구분 |
| `simple-list` | 심플 리스트 |
| `split-layout` | 좌우 분할 |
| `statistics` | 통계 수치 |
| `team` | 팀 소개 |
| `timeline` | 타임라인 |
| `two-columns` | 2단 레이아웃 |

## Default Theme: figma-default

- 배경: `#ffffff`
- 텍스트: `#000000`
- 보조 텍스트: `#6b6b6b`
- 강조색: `#FC5E20`

## Slide Size

**720pt × 405pt** 고정 (HTML에서 1280×720 → scale 0.75)

## Windows 환경 주의사항

- 에디터 실행 시 환경변수 필요: `PPT_AGENT_CLAUDE_BIN="claude.cmd"`
- spawn 호출 시 반드시 `shell: true` 옵션 유지
