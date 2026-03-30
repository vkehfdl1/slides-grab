/**
 * Presentation review engine — rule-based structure analysis.
 *
 * Analyzes a deck's slides for structure, content density, and type diversity,
 * returning a score + specific issues + suggestions.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

import { checkConsistency } from './consistency.js';

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * List slide HTML files in a deck directory, sorted numerically.
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
 * Extract visible text from slide HTML (strip tags, scripts, styles).
 */
function extractText(html) {
  let clean = html.replace(/<style[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<[^>]+>/g, ' ');
  clean = clean.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Detect slide type from HTML content heuristics.
 */
function detectSlideType(html, index, total) {
  const lower = html.toLowerCase();
  if (index === 0) return 'cover';
  if (index === total - 1 && /thank|end|closing|감사|마무리|q\s*&\s*a/i.test(lower)) return 'closing';
  if (/class=".*chart/i.test(html) || /Chart\s*\(/i.test(html) || /canvas/i.test(html)) return 'chart';
  if (/class=".*table/i.test(html) || /<table/i.test(html)) return 'table';
  if (/class=".*timeline/i.test(html)) return 'timeline';
  if (/class=".*metric/i.test(html) || /class=".*stat/i.test(html)) return 'data';
  if (/class=".*split/i.test(html) || /class=".*two-col/i.test(html)) return 'layout';
  if (/class=".*quote/i.test(html)) return 'quote';
  if (/\bimg\b|\bimage\b|background-image/i.test(html)) return 'image';
  return 'content';
}

// ── Analysis Functions ──────────────────────────────────────────────

/**
 * Analyze a deck and return structured review results.
 * @param {string} deckDir - Absolute path to deck directory
 * @param {object} [context] - Optional context
 * @param {string} [context.audience] - Target audience (e.g., 'investors', 'technical')
 * @param {number} [context.timeMinutes] - Presentation time in minutes
 * @returns {Promise<ReviewResult>}
 */
export async function analyzeDeck(deckDir, context = {}) {
  const slideFiles = await listSlideFiles(deckDir);
  if (slideFiles.length === 0) {
    return {
      deckName: basename(deckDir),
      score: 0, grade: 'F',
      categories: {},
      issues: [{ severity: 'error', slide: null, message: '슬라이드가 없습니다.', category: 'structure' }],
      strengths: [],
      slideCount: 0,
    };
  }

  const slides = [];
  for (const file of slideFiles) {
    const html = await readFile(join(deckDir, file), 'utf-8');
    const text = extractText(html);
    slides.push({
      file,
      html,
      text,
      wordCount: text.split(/\s+/).filter(Boolean).length,
      charCount: text.length,
      type: detectSlideType(html, slides.length, slideFiles.length),
    });
  }

  const issues = [];
  const strengths = [];
  const scores = { structure: 100, content: 100, visual: 100, impact: 100 };

  // ── Structure Analysis ──

  // Cover check
  const hasCover = slides[0]?.type === 'cover';
  if (!hasCover) {
    issues.push({ severity: 'warn', slide: 1, message: '첫 슬라이드가 커버가 아닙니다.', category: 'structure' });
    scores.structure -= 10;
  } else {
    strengths.push('커버 슬라이드가 존재합니다.');
  }

  // Closing check
  const lastSlide = slides[slides.length - 1];
  const hasClosing = lastSlide?.type === 'closing';
  if (!hasClosing) {
    issues.push({ severity: 'info', slide: slides.length, message: '마지막 슬라이드에 명확한 클로징이 없습니다. CTA나 마무리 메시지를 추가하세요.', category: 'impact' });
    scores.impact -= 10;
  } else {
    strengths.push('클로징 슬라이드로 마무리합니다.');
  }

  // Slide count appropriateness
  const timeMinutes = context.timeMinutes || 15;
  const idealMin = Math.max(3, Math.floor(timeMinutes * 0.6));
  const idealMax = Math.ceil(timeMinutes * 2);
  if (slides.length < idealMin) {
    issues.push({
      severity: 'warn',
      slide: null,
      message: `슬라이드 수(${slides.length})가 ${timeMinutes}분 발표에 너무 적습니다. (권장: ${idealMin}~${idealMax}장)`,
      category: 'structure',
    });
    scores.structure -= 15;
  } else if (slides.length > idealMax) {
    issues.push({
      severity: 'warn',
      slide: null,
      message: `슬라이드 수(${slides.length})가 ${timeMinutes}분 발표에 너무 많습니다. (권장: ${idealMin}~${idealMax}장)`,
      category: 'structure',
    });
    scores.structure -= 10;
  }

  // ── Content Analysis ──

  // Text density per slide
  const avgWordCount = slides.reduce((s, sl) => s + sl.wordCount, 0) / slides.length;
  for (let i = 0; i < slides.length; i++) {
    const sl = slides[i];
    if (sl.type === 'cover' || sl.type === 'closing') continue;

    if (sl.wordCount > 150) {
      issues.push({
        severity: 'warn',
        slide: i + 1,
        message: `텍스트 과다 (${sl.wordCount}단어). 핵심만 남기고 요약하세요.`,
        category: 'content',
      });
      scores.content -= 5;
    } else if (sl.wordCount < 5 && sl.type === 'content') {
      issues.push({
        severity: 'info',
        slide: i + 1,
        message: '텍스트가 거의 없습니다. 시각 자료가 충분한지 확인하세요.',
        category: 'content',
      });
    }
  }

  // ── Type Diversity ──

  const typeCounts = {};
  for (const sl of slides) {
    typeCounts[sl.type] = (typeCounts[sl.type] || 0) + 1;
  }

  // Check for monotony (same type > 60% of non-structural slides)
  const contentSlides = slides.filter(s => s.type !== 'cover' && s.type !== 'closing');
  for (const [type, count] of Object.entries(typeCounts)) {
    if (type === 'cover' || type === 'closing') continue;
    if (contentSlides.length > 3 && count / contentSlides.length > 0.6) {
      issues.push({
        severity: 'warn',
        slide: null,
        message: `"${type}" 타입이 ${count}/${contentSlides.length}장으로 단조롭습니다. 차트, 리스트, 이미지 등 다양한 유형을 섞으세요.`,
        category: 'visual',
      });
      scores.visual -= 15;
    }
  }

  // Data slides present?
  const hasData = slides.some(s => ['chart', 'table', 'data'].includes(s.type));
  if (hasData) {
    strengths.push('데이터 시각화 슬라이드가 포함되어 있습니다.');
  }

  // ── Audience Context ──

  if (context.audience === 'investors') {
    if (!hasData) {
      issues.push({
        severity: 'warn',
        slide: null,
        message: '투자자 대상 발표인데 데이터/수치 슬라이드가 없습니다.',
        category: 'impact',
      });
      scores.impact -= 15;
    }
  }

  if (context.audience === 'technical') {
    const avgChars = slides.reduce((s, sl) => s + sl.charCount, 0) / slides.length;
    if (avgChars < 50) {
      issues.push({
        severity: 'info',
        slide: null,
        message: '기술 발표인데 텍스트가 전반적으로 적습니다. 코드/아키텍처 설명을 보강하세요.',
        category: 'content',
      });
    }
  }

  // ── Scoring ──

  // Clamp scores to 0-100
  for (const key of Object.keys(scores)) {
    scores[key] = Math.max(0, Math.min(100, scores[key]));
  }

  // ── Consistency Analysis ──

  let consistency = null;
  try {
    consistency = await checkConsistency(deckDir);
    for (const ci of consistency.issues) {
      issues.push({
        severity: ci.severity,
        slide: null,
        message: ci.message,
        category: 'visual',
      });
      if (ci.severity === 'warn') scores.visual -= 5;
    }
    if (consistency.summary.consistent) {
      strengths.push('Cross-slide style consistency is maintained.');
    }
  } catch { /* consistency check is non-blocking */ }

  // Reclamp visual score after consistency penalties
  scores.visual = Math.max(0, Math.min(100, scores.visual));

  // Recalculate overall score after consistency adjustments
  const overallFinal = Math.round(
    scores.structure * 0.25 +
    scores.content * 0.30 +
    scores.visual * 0.20 +
    scores.impact * 0.25
  );

  const gradeFinal = overallFinal >= 90 ? 'A' : overallFinal >= 80 ? 'B+' : overallFinal >= 70 ? 'B' : overallFinal >= 60 ? 'C' : overallFinal >= 50 ? 'D' : 'F';

  // Sort issues: error > warn > info
  const severityOrder = { error: 0, warn: 1, info: 2 };
  issues.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));

  return {
    deckName: basename(deckDir),
    score: overallFinal,
    grade: gradeFinal,
    categories: {
      structure: { score: scores.structure, label: 'Structure' },
      content: { score: scores.content, label: 'Content' },
      visual: { score: scores.visual, label: 'Visual' },
      impact: { score: scores.impact, label: 'Impact' },
    },
    issues,
    strengths,
    slideCount: slides.length,
    typeCounts,
    consistency,
  };
}

/**
 * Build an AI review prompt for deeper content/logic analysis.
 * @param {string} deckDir
 * @param {object} ruleResult - Result from analyzeDeck()
 * @param {object} [context]
 * @returns {Promise<string>}
 */
export async function buildAIReviewPrompt(deckDir, ruleResult, context = {}) {
  const slideFiles = await listSlideFiles(deckDir);
  const slideSummaries = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const html = await readFile(join(deckDir, slideFiles[i]), 'utf-8');
    const text = extractText(html);
    slideSummaries.push(`Slide ${i + 1} (${slideFiles[i]}): ${text.slice(0, 300)}`);
  }

  const lines = [
    '프레젠테이션을 분석하고 개선 제안을 해주세요.',
    '',
    `덱: ${ruleResult.deckName}`,
    `슬라이드 수: ${ruleResult.slideCount}`,
    context.audience ? `대상 청중: ${context.audience}` : '',
    context.timeMinutes ? `발표 시간: ${context.timeMinutes}분` : '',
    '',
    '=== 슬라이드 내용 요약 ===',
    ...slideSummaries,
    '=== 슬라이드 내용 끝 ===',
    '',
    '=== 규칙 기반 분석 결과 ===',
    `총점: ${ruleResult.score}/100 (${ruleResult.grade})`,
    `구조: ${ruleResult.categories.structure?.score}`,
    `콘텐츠: ${ruleResult.categories.content?.score}`,
    `시각: ${ruleResult.categories.visual?.score}`,
    `임팩트: ${ruleResult.categories.impact?.score}`,
    '',
    '이미 발견된 이슈:',
    ...ruleResult.issues.map(i => `- [${i.severity}] ${i.slide ? `Slide ${i.slide}: ` : ''}${i.message}`),
    '===',
    '',
    '다음을 분석해주세요:',
    '1. **논리 흐름**: 슬라이드 순서의 스토리 아크가 자연스러운가?',
    '2. **핵심 메시지**: 각 슬라이드의 핵심이 명확한가?',
    '3. **반복/중복**: 비슷한 내용이 반복되는 슬라이드가 있는가?',
    '4. **임팩트**: 오프닝과 클로징의 강도, CTA 명확성',
    '5. **개선 제안**: 구체적으로 어떤 슬라이드를 어떻게 개선할지',
    '',
    'JSON 형식으로 응답하세요:',
    '```json',
    '{',
    '  "logicFlow": { "score": 0-100, "feedback": "..." },',
    '  "messageClarity": { "score": 0-100, "feedback": "..." },',
    '  "redundancy": { "issues": [{ "slides": [N, M], "description": "..." }] },',
    '  "suggestions": [',
    '    { "slide": N, "action": "rewrite|split|merge|add|remove", "description": "..." }',
    '  ],',
    '  "overallFeedback": "1-2문장 요약"',
    '}',
    '```',
  ].filter(Boolean);

  return lines.join('\n');
}
