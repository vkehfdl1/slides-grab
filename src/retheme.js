/**
 * Retheme module — re-generate a deck's slides with a different pack.
 *
 * Strategy:
 *   1. If slide-outline.md exists → reuse outline, swap pack
 *   2. If no outline → extract text from each HTML, reconstruct minimal outline
 *   3. AI regenerates slides with the target pack's templates + theme.css
 */

import { readFile, readdir, writeFile, mkdir, copyFile, stat, unlink } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { getPackInfo, resolvePackTheme, resolvePack, getCommonTypes } from './resolve.js';

/**
 * Read the slide-outline.md from a deck, if it exists.
 * @param {string} deckDir - Absolute path to deck directory
 * @returns {Promise<string|null>}
 */
export async function readOutline(deckDir) {
  const outlinePath = join(deckDir, 'slide-outline.md');
  try {
    return await readFile(outlinePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * List slide HTML files in a deck directory, sorted.
 * @param {string} deckDir
 * @returns {Promise<string[]>} sorted file names
 */
export async function listSlideFiles(deckDir) {
  const entries = await readdir(deckDir);
  return entries
    .filter(f => /^slide-\d+.*\.html$/i.test(f))
    .sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)?.[0] || '0', 10);
      const numB = parseInt(b.match(/\d+/)?.[0] || '0', 10);
      return numA - numB;
    });
}

/**
 * Extract visible text from a slide HTML file (rough extraction for outline reconstruction).
 * @param {string} html
 * @returns {{ title: string, body: string }}
 */
export function extractTextFromSlide(html) {
  // Remove style and script tags
  let clean = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Remove HTML tags
  clean = clean.replace(/<[^>]+>/g, ' ');
  // Decode HTML entities
  clean = clean.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  // Normalize whitespace
  clean = clean.replace(/\s+/g, ' ').trim();

  // Try to detect title (first meaningful chunk, usually short)
  const words = clean.split(' ');
  // Heuristic: first "sentence" up to 60 chars is the title
  let title = '';
  let body = clean;
  let acc = '';
  for (const w of words) {
    acc += (acc ? ' ' : '') + w;
    if (acc.length >= 15) {
      title = acc;
      body = clean.slice(acc.length).trim();
      break;
    }
  }
  if (!title) {
    title = clean.slice(0, 60);
    body = clean.slice(60).trim();
  }

  return { title, body };
}

/**
 * Reconstruct a minimal outline from slide HTML files when no outline exists.
 * @param {string} deckDir
 * @param {string[]} slideFiles
 * @returns {Promise<string>}
 */
export async function reconstructOutline(deckDir, slideFiles) {
  const lines = ['# Reconstructed Outline', '', '## Meta', `- deck-name: ${basename(deckDir)}`, `- slide-count: ${slideFiles.length}`, '', '## Slides'];

  for (let i = 0; i < slideFiles.length; i++) {
    const html = await readFile(join(deckDir, slideFiles[i]), 'utf-8');
    const { title, body } = extractTextFromSlide(html);

    lines.push('');
    lines.push(`### Slide ${i + 1}`);
    // Guess type from slide position
    if (i === 0) {
      lines.push('- type: cover');
    } else if (i === slideFiles.length - 1) {
      lines.push('- type: closing');
    } else {
      lines.push('- type: content');
    }
    lines.push(`- title: ${title}`);
    if (body) {
      lines.push(`- content: ${body.slice(0, 500)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Replace the pack reference in an outline's Meta section.
 * @param {string} outline - Original outline text
 * @param {string} newPackId - Target pack ID
 * @returns {string}
 */
export function swapOutlinePack(outline, newPackId) {
  // Replace existing pack line
  if (/^- pack:.*/m.test(outline)) {
    return outline.replace(/^- pack:.*/m, `- pack: ${newPackId}`);
  }
  // Insert pack after slide-count or deck-name
  return outline.replace(
    /^(- (?:slide-count|deck-name):.*)/m,
    `$1\n- pack: ${newPackId}`
  );
}

/**
 * Build the retheme prompt for AI regeneration.
 * @param {object} opts
 * @param {string} opts.outline - The outline text (with pack already swapped)
 * @param {string} opts.targetPackId - Target pack ID
 * @param {string} opts.deckName - Deck folder name
 * @param {string} opts.themeCss - Target pack's theme.css content
 * @param {string} [opts.designMd] - Target pack's design.md content
 * @param {string[]} opts.allTypes - All common types
 * @returns {string}
 */
export function buildRethemePrompt({ outline, targetPackId, deckName, themeCss, designMd, allTypes }) {
  const lines = [
    `기존 프레젠테이션을 "${targetPackId}" 팩으로 리디자인하세요.`,
    '',
    '=== 아웃라인 ===',
    outline,
    '=== 아웃라인 끝 ===',
    '',
    `타겟 팩: ${targetPackId}`,
    `전체 type: ${allTypes.join(', ')}`,
  ];

  if (designMd) {
    lines.push(
      '',
      '=== 팩 디자인 스펙 (design.md) ===',
      designMd,
      '=== 디자인 스펙 끝 ===',
      '',
      '★ 위 design.md의 CSS Patterns, Color Usage, Layout Principles, Avoid 섹션을 반드시 따르세요.',
      '★ 특히 커버/클로징 슬라이드는 design.md의 Cover 패턴을 정확히 구현하세요.',
    );
  }

  lines.push(
    '',
    '타겟 팩의 theme.css:',
    '```css',
    themeCss,
    '```',
    '',
    '규칙:',
    '1. 아웃라인의 각 슬라이드를 새 팩의 색상 체계와 타이포그래피로 HTML 파일을 생성하세요.',
    '2. design.md에 정의된 CSS 패턴과 레이아웃 원칙을 우선 적용하세요.',
    '3. 아웃라인에 스타일 힌트(배경색, 레이아웃 지시 등)가 있으면 팩 기본 스타일보다 우선 적용하세요.',
    '4. accent 색상(--accent)을 적극 활용: 섹션 라벨, 핵심 수치, 강조 문구, CTA 등.',
    '5. 슬라이드마다 콘텐츠에 최적화된 레이아웃을 선택하세요. 같은 패턴을 반복하지 마세요.',
    '6. 컨텐츠(텍스트, 데이터)는 아웃라인의 것을 그대로 사용하세요.',
    '7. 슬라이드 크기: 720pt × 405pt',
    '8. 각 슬라이드를 slide-01.html, slide-02.html, ... 형식으로 생성하세요.',
    `9. 파일 경로: decks/${deckName}/slide-01.html 등`,
    '10. theme.css와 base.css는 link 태그로 참조하지 말고, 스타일을 인라인으로 포함하세요.',
    '',
    '디자인 가이드:',
    '- 섹션 디바이더에 "PART N" 등 라벨을 accent 색상으로 추가',
    '- 큰 숫자/메트릭은 accent 색상으로 강조',
    '- 인용구는 출처를 accent 색상으로 표시',
    '- 요약 슬라이드는 카드보다 번호 리스트가 더 효과적일 수 있음',
    '',
    '중요: HTML 슬라이드 파일만 생성하세요. 다른 파일은 수정하지 마세요.',
  );

  return lines.join('\n');
}

/**
 * Prepare retheme data — gather outline, pack info, and build prompt.
 * @param {object} opts
 * @param {string} opts.deckDir - Absolute path to deck directory
 * @param {string} opts.targetPackId - Target pack ID
 * @param {string} [opts.targetDeckName] - Override deck name for output path (defaults to basename of deckDir)
 * @returns {Promise<{ prompt: string, deckName: string, outline: string }>}
 */
export async function prepareRetheme({ deckDir, targetPackId, targetDeckName }) {
  const deckName = targetDeckName || basename(deckDir);

  // Get pack info
  const packInfo = getPackInfo(targetPackId);
  if (!packInfo) {
    throw new Error(`Pack "${targetPackId}" not found.`);
  }

  // Get theme CSS
  const themeResult = resolvePackTheme(targetPackId);
  let themeCss = '';
  if (themeResult) {
    themeCss = await readFile(themeResult.path, 'utf-8');
  }

  // Get design.md (pack design specification)
  let designMd = '';
  const packResolved = resolvePack(targetPackId);
  if (packResolved) {
    const designPath = join(packResolved.path, 'design.md');
    try {
      designMd = await readFile(designPath, 'utf-8');
    } catch { /* design.md is optional */ }
  }

  const allTypes = Object.keys(getCommonTypes());

  // Get or reconstruct outline
  let outline = await readOutline(deckDir);
  if (!outline) {
    const slideFiles = await listSlideFiles(deckDir);
    if (slideFiles.length === 0) {
      throw new Error(`No slides found in ${deckDir}`);
    }
    outline = await reconstructOutline(deckDir, slideFiles);
  }

  // Swap pack in outline
  outline = swapOutlinePack(outline, targetPackId);

  // Build prompt
  const prompt = buildRethemePrompt({
    outline,
    targetPackId,
    deckName,
    themeCss,
    designMd,
    allTypes,
  });

  return { prompt, deckName, outline };
}

/**
 * Back up existing slide HTML files into a timestamped subdirectory.
 * e.g. decks/my-deck/backup/2026-03-20_143052/slide-01.html ...
 * Returns the backup directory path, or null if there was nothing to back up.
 * @param {string} deckDir - Absolute path to deck directory
 * @param {{ deleteOriginals?: boolean }} [opts]
 * @returns {Promise<string|null>}
 */
export async function backupDeck(deckDir, { deleteOriginals = false } = {}) {
  const slideFiles = await listSlideFiles(deckDir);
  if (slideFiles.length === 0) return null;

  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const backupDir = join(deckDir, 'backup', ts);
  await mkdir(backupDir, { recursive: true });

  await Promise.all(
    slideFiles.map((f) => copyFile(join(deckDir, f), join(backupDir, f))),
  );

  if (deleteOriginals) {
    await Promise.all(
      slideFiles.map((f) => unlink(join(deckDir, f))),
    );
  }

  console.log(`Backed up ${slideFiles.length} slides → ${backupDir}${deleteOriginals ? ' (originals removed)' : ''}`);
  return backupDir;
}

/**
 * List available backups for a deck, sorted newest-first.
 * @param {string} deckDir - Absolute path to deck directory
 * @returns {Promise<{ timestamp: string, label: string, path: string }[]>}
 */
export async function listBackups(deckDir) {
  const backupRoot = join(deckDir, 'backup');

  let entries;
  try {
    entries = await readdir(backupRoot);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }

  // Parallel stat to find directories
  const stats = await Promise.all(
    entries.map(e => stat(join(backupRoot, e)).catch(() => null)),
  );
  const dirs = entries.filter((_, i) => stats[i]?.isDirectory());

  // Parallel readdir to count slides in each backup
  const fileLists = await Promise.all(
    dirs.map(d => readdir(join(backupRoot, d))),
  );

  const results = [];
  for (let i = 0; i < dirs.length; i++) {
    const slideCount = fileLists[i].filter(f => /^slide-\d+.*\.html$/i.test(f)).length;
    if (slideCount === 0) continue;

    const entry = dirs[i];
    // Parse timestamp for display: 2026-03-20_143052 → 2026-03-20 14:30:52
    const label = entry.replace(/_(\d{2})(\d{2})(\d{2})$/, ' $1:$2:$3');
    results.push({ timestamp: entry, label, path: join(backupRoot, entry), slideCount });
  }

  // Sort newest first
  results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return results;
}

/**
 * Restore a backup — copy backup slides to deck root, replacing current slides.
 * @param {string} deckDir - Absolute path to deck directory
 * @param {string} timestamp - Backup timestamp folder name
 * @returns {Promise<{ restored: number }>}
 */
export async function restoreBackup(deckDir, timestamp) {
  // Validate timestamp format to prevent path traversal
  if (!/^\d{4}-\d{2}-\d{2}_\d{6}$/.test(timestamp)) {
    throw new Error(`Invalid backup timestamp format: ${timestamp}`);
  }

  const backupDir = join(deckDir, 'backup', timestamp);

  // Read backup files and current slides in parallel
  let backupFiles;
  try {
    backupFiles = await readdir(backupDir);
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`Backup not found: ${timestamp}`);
    throw err;
  }

  const slideFiles = backupFiles.filter(f => /^slide-\d+.*\.html$/i.test(f));
  if (slideFiles.length === 0) {
    throw new Error(`No slide files in backup: ${timestamp}`);
  }

  // Remove current slides
  const currentSlides = await listSlideFiles(deckDir);
  await Promise.all(
    currentSlides.map((f) => unlink(join(deckDir, f)).catch(() => {})),
  );

  // Copy backup slides to deck root
  await Promise.all(
    slideFiles.map((f) => copyFile(join(backupDir, f), join(deckDir, f))),
  );

  console.log(`Restored ${slideFiles.length} slides from backup ${timestamp}`);
  return { restored: slideFiles.length };
}
