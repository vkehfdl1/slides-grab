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

## Available Templates

`templates/` 디렉토리에서 사용 가능한 템플릿 (23종):

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
