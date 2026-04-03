import { getCommonTypes, listPackTemplates } from '../../src/resolve.js';

/**
 * Append outline format example + pack/type instructions to prompt lines.
 * Shared by /api/import-md and /api/plan.
 */
export function appendOutlinePrompt(promptLines, packId, { includePresenterNote = false, existingDeckNames = [] } = {}) {
  promptLines.push('아웃라인 형식:');
  promptLines.push('```');
  promptLines.push('# 발표 제목');
  promptLines.push('');
  promptLines.push('## Meta');
  promptLines.push('- deck-name: <kebab-case-name>');
  promptLines.push('- slide-count: N');
  if (packId) {
    promptLines.push(`- pack: ${packId}`);
  }
  promptLines.push('');
  promptLines.push('## Slides');
  promptLines.push('### Slide 1');
  promptLines.push('- type: cover');
  promptLines.push('- title: 제목');
  promptLines.push('- content: 부제 또는 설명');
  promptLines.push('- style: dark-background (시각적 힌트가 있는 경우에만)');
  if (includePresenterNote) {
    promptLines.push('- presenter-note: 발표 내용');
  }
  promptLines.push('');
  promptLines.push('### Slide 2');
  promptLines.push('- type: split-layout');
  promptLines.push('- title: 슬라이드 제목');
  promptLines.push('- content:');
  promptLines.push('  - left: 왼쪽 영역 내용');
  promptLines.push('  - right: 오른쪽 영역 내용 (항목1, 항목2, 항목3)');
  promptLines.push('  - bottom: 하단 핵심 메시지');
  promptLines.push('...');
  promptLines.push('```');
  promptLines.push('');
  promptLines.push('아웃라인 작성 규칙:');
  promptLines.push('- content가 단순하면 한 줄: `- content: 설명 텍스트`');
  promptLines.push('- content가 구조화되면 들여쓴 하위 bullet 사용:');
  promptLines.push('  ```');
  promptLines.push('  - content:');
  promptLines.push('    - left: 왼쪽 내용');
  promptLines.push('    - right: 오른쪽 내용');
  promptLines.push('  ```');
  promptLines.push('- YAML `|` 멀티라인 구문은 절대 사용하지 마세요');
  promptLines.push('- presenter-note는 항상 한 줄로 작성하세요');
  promptLines.push('');

  const allTypeNames = Object.keys(getCommonTypes());
  if (packId) {
    const packTemplates = listPackTemplates(packId, { includeFallback: true });
    promptLines.push(`사용할 팩: ${packId}`);
    promptLines.push(`이 팩이 보유한 type: ${packTemplates.join(', ')}`);
    promptLines.push(`전체 공통 type: ${allTypeNames.join(', ')}`);
    promptLines.push('');
    promptLines.push('팩이 보유한 템플릿을 최대한 사용하세요.');
    promptLines.push('팩에 없는 type의 슬라이드는, AI가 팩의 theme 색상으로 직접 디자인합니다.');
  } else {
    promptLines.push(`type은 다음 중 하나: ${allTypeNames.join(', ')}`);
  }
  promptLines.push('');
  promptLines.push('중요: slide-outline.md 파일만 생성하세요. HTML 파일은 생성하지 마세요.');

  if (existingDeckNames.length > 0) {
    promptLines.push('');
    promptLines.push('중복 방지 규칙:');
    promptLines.push(`다음 이름의 덱 폴더가 이미 존재합니다: ${existingDeckNames.join(', ')}`);
    promptLines.push('이미 존재하는 이름을 사용하지 마세요. 중복 시 이름 뒤에 -2, -3 등을 붙이세요.');
    promptLines.push('예: ai-trends가 이미 있으면 → ai-trends-2');
  }
}

export function parseOutline(content, deckName) {
  const lines = content.split('\n');
  const outline = { title: '', deckName: deckName || '', pack: '', slides: [], rawHeader: '', rawFooter: '' };

  for (const line of lines) {
    if (!outline.title) {
      const h1 = line.match(/^#\s+(.+)/);
      if (h1) { outline.title = h1[1].trim().replace(/<[^>]*>/g, ''); }
    }
    const plain = line.replace(/\*\*(.*?)\*\*/g, '$1');
    if (!outline.deckName || outline.deckName === deckName) {
      const dm = plain.match(/^-\s*deck-name:\s*(.+)/i);
      if (dm) { outline.deckName = dm[1].trim(); }
    }
    if (!outline.pack) {
      const pm = plain.match(/^-\s*pack:\s*(.+)/i);
      if (pm) { outline.pack = pm[1].trim(); }
    }
    if (outline.title && outline.deckName !== (deckName || '') && outline.pack) break;
  }

  const slideStarts = [];
  let footerStart = -1;
  let foundFirstSlide = false;

  for (let i = 0; i < lines.length; i++) {
    if (/^###\s+Slide\s+\d+/i.test(lines[i])) {
      slideStarts.push(i);
      foundFirstSlide = true;
    } else if (foundFirstSlide && /^#{1,2}\s/.test(lines[i]) && !/^###/.test(lines[i])) {
      if (footerStart < 0) footerStart = i;
    }
  }

  if (slideStarts.length === 0) {
    outline.rawHeader = content;
    return outline;
  }

  outline.rawHeader = lines.slice(0, slideStarts[0]).join('\n');
  if (outline.rawHeader) outline.rawHeader += '\n';

  const contentEnd = footerStart >= 0 ? footerStart : lines.length;

  for (let si = 0; si < slideStarts.length; si++) {
    const start = slideStarts[si];
    const end = si + 1 < slideStarts.length ? slideStarts[si + 1] : contentEnd;

    const rawBlock = lines.slice(start, end).join('\n') + '\n';
    const headerLine = lines[start];
    const slideMatch = headerLine.match(/^###\s+Slide\s+\d+\s*(?:[-–—]\s*(.+))?/i);

    const cur = {
      type: '',
      title: (slideMatch?.[1] || '').trim(),
      style: '',
      details: [],
      rawBlock,
    };

    for (let j = start + 1; j < end; j++) {
      const line = lines[j];
      if (/^---\s*$/.test(line)) continue;

      const plain = line.replace(/\*\*(.*?)\*\*/g, '$1');
      const tm = plain.match(/^-\s*type:\s*(.+)/i);
      const tt = plain.match(/^-\s*title:\s*(.+)/i);
      const ts = plain.match(/^-\s*style:\s*(.+)/i);

      if (tm) { cur.type = tm[1].trim(); }
      else if (tt) { cur.title = tt[1].trim(); }
      else if (ts) { cur.style = ts[1].trim(); }
      else {
        const trimmed = line.trimEnd();
        if (trimmed) cur.details.push(trimmed);
      }
    }

    outline.slides.push(cur);
  }

  if (footerStart >= 0) {
    outline.rawFooter = lines.slice(footerStart).join('\n');
  }

  return outline;
}
