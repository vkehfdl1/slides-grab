#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readdir, rm, writeFile, access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { analyzeImages } from '../src/vlm/analyze.js';

const DEFAULT_OUTPUT = 'style-config.md';
const DEFAULT_PROVIDER = 'google';
const DEFAULT_MODEL = 'gemini-2.0-flash';
const INPUT_EXTENSIONS = new Set(['.pptx', '.pdf']);
const SAMPLE_THRESHOLD = 10;
const SAMPLE_MIN = 5;
const SAMPLE_MAX = 8;
const SCREENSHOT_DPI = 150;
const REQUIRED_SECTIONS = [
  '컬러 팔레트',
  '폰트 시스템',
  '레이아웃 패턴',
  '슬라이드 타입',
  '전체 톤',
];

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/extract-style.js --input <file> [options]',
      '',
      'Options:',
      '  --input <path>       Input file path (.pptx or .pdf)',
      `  --output <path>      Output markdown path (default: ${DEFAULT_OUTPUT})`,
      `  --provider <name>    VLM provider (default: ${DEFAULT_PROVIDER})`,
      `  --model <name>       VLM model (default: ${DEFAULT_MODEL})`,
      '  --seed <number>      Seed for deterministic random sampling',
      '  -h, --help           Show this help message',
      '',
      'Examples:',
      '  node scripts/extract-style.js --input ./deck.pptx',
      '  node scripts/extract-style.js --input ./deck.pdf --provider anthropic --model claude-3-7-sonnet',
    ].join('\n'),
  );
  process.stdout.write('\n');
}

function readOptionValue(args, index, optionName) {
  const next = args[index + 1];
  if (!next || next.startsWith('-')) {
    throw new Error(`Missing value for ${optionName}.`);
  }
  return next;
}

function parseInteger(value, optionName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${optionName} must be an integer.`);
  }
  return parsed;
}

export function parseCliArgs(args) {
  const options = {
    input: '',
    output: DEFAULT_OUTPUT,
    provider: DEFAULT_PROVIDER,
    model: DEFAULT_MODEL,
    help: false,
    seed: null,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--input') {
      options.input = readOptionValue(args, i, '--input');
      i += 1;
      continue;
    }

    if (arg.startsWith('--input=')) {
      options.input = arg.slice('--input='.length);
      continue;
    }

    if (arg === '--output') {
      options.output = readOptionValue(args, i, '--output');
      i += 1;
      continue;
    }

    if (arg.startsWith('--output=')) {
      options.output = arg.slice('--output='.length);
      continue;
    }

    if (arg === '--provider') {
      options.provider = readOptionValue(args, i, '--provider');
      i += 1;
      continue;
    }

    if (arg.startsWith('--provider=')) {
      options.provider = arg.slice('--provider='.length);
      continue;
    }

    if (arg === '--model') {
      options.model = readOptionValue(args, i, '--model');
      i += 1;
      continue;
    }

    if (arg.startsWith('--model=')) {
      options.model = arg.slice('--model='.length);
      continue;
    }

    if (arg === '--seed') {
      options.seed = parseInteger(readOptionValue(args, i, '--seed'), '--seed');
      i += 1;
      continue;
    }

    if (arg.startsWith('--seed=')) {
      options.seed = parseInteger(arg.slice('--seed='.length), '--seed');
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (!options.help) {
    if (typeof options.input !== 'string' || options.input.trim() === '') {
      throw new Error('--input is required and must be a non-empty string.');
    }
  }

  if (typeof options.output !== 'string' || options.output.trim() === '') {
    throw new Error('--output must be a non-empty string.');
  }

  if (typeof options.provider !== 'string' || options.provider.trim() === '') {
    throw new Error('--provider must be a non-empty string.');
  }

  if (typeof options.model !== 'string' || options.model.trim() === '') {
    throw new Error('--model must be a non-empty string.');
  }

  options.input = options.input.trim();
  options.output = options.output.trim();
  options.provider = options.provider.trim().toLowerCase();
  options.model = options.model.trim();

  return options;
}

function createSeededRandom(seed) {
  let state = (seed >>> 0) || 0x12345678;

  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function toSlideOrder(fileName) {
  const match = fileName.match(/-(\d+)\.(?:png|jpg|jpeg)$/i);
  return match ? Number.parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

function sortSlideImages(a, b) {
  const orderA = toSlideOrder(a);
  const orderB = toSlideOrder(b);
  if (orderA !== orderB) return orderA - orderB;
  return a.localeCompare(b);
}

export function sampleSlidesForAnalysis(slideImagePaths, randomFn = Math.random) {
  if (!Array.isArray(slideImagePaths) || slideImagePaths.length === 0) {
    throw new Error('slideImagePaths must be a non-empty array.');
  }

  if (slideImagePaths.length < SAMPLE_THRESHOLD) {
    return [...slideImagePaths];
  }

  const rawSize = SAMPLE_MIN + Math.floor(randomFn() * (SAMPLE_MAX - SAMPLE_MIN + 1));
  const targetSize = Math.min(rawSize, slideImagePaths.length);

  const middleIndices = Array.from(
    { length: Math.max(0, slideImagePaths.length - 2) },
    (_, index) => index + 1,
  );

  for (let i = middleIndices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [middleIndices[i], middleIndices[j]] = [middleIndices[j], middleIndices[i]];
  }

  const selectedMiddle = middleIndices
    .slice(0, Math.max(0, targetSize - 2))
    .sort((a, b) => a - b);

  const selectedIndices = [0, ...selectedMiddle, slideImagePaths.length - 1];
  return selectedIndices.map((index) => slideImagePaths[index]);
}

function runCommand(command, args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (error && error.code === 'ENOENT') {
        rejectPromise(new Error(`Required command not found: ${command}`));
        return;
      }

      rejectPromise(error instanceof Error ? error : new Error(String(error)));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      const details = stderr.trim() || stdout.trim() || `Exit code ${code}`;
      rejectPromise(new Error(`${command} failed: ${details}`));
    });
  });
}

async function pathExists(targetPath) {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function convertPptxToPdf(inputPath, workingDir, commandRunner = runCommand) {
  await commandRunner('soffice', [
    '--headless',
    '--convert-to',
    'pdf',
    '--outdir',
    workingDir,
    inputPath,
  ]);

  const expectedPdf = join(workingDir, `${basename(inputPath, extname(inputPath))}.pdf`);
  if (await pathExists(expectedPdf)) {
    return expectedPdf;
  }

  const entries = await readdir(workingDir, { withFileTypes: true });
  const pdfEntry = entries.find((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.pdf');

  if (!pdfEntry) {
    throw new Error('PPTX to PDF conversion completed, but PDF output was not found.');
  }

  return join(workingDir, pdfEntry.name);
}

async function convertPdfToSlideImages(pdfPath, outputDir, commandRunner = runCommand) {
  const outputPrefix = join(outputDir, 'slide');

  await commandRunner('pdftoppm', [
    '-png',
    '-r',
    String(SCREENSHOT_DPI),
    pdfPath,
    outputPrefix,
  ]);

  const entries = await readdir(outputDir, { withFileTypes: true });
  const imageFiles = entries
    .filter((entry) => entry.isFile() && /^slide-\d+\.png$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort(sortSlideImages)
    .map((fileName) => join(outputDir, fileName));

  if (imageFiles.length === 0) {
    throw new Error('No slide screenshots were generated from the PDF.');
  }

  return imageFiles;
}

function buildStylePrompt({ sourceType, totalSlides, sampledSlides }) {
  return [
    '당신은 프레젠테이션 디자인 시스템 분석가입니다.',
    `${sourceType.toUpperCase()} 원본 슬라이드 스크린샷 ${sampledSlides}장을 분석해 스타일 시스템을 추출하세요.`,
    `전체 슬라이드 수: ${totalSlides}, 분석 샘플 수: ${sampledSlides}`,
    '',
    '반드시 JSON만 반환하세요 (markdown/code fence 금지).',
    '다음 스키마를 그대로 따르세요:',
    '{',
    '  "colorPalette": [{"name":"", "hex":"", "usage":""}],',
    '  "fontSystem": {',
    '    "primary":"",',
    '    "secondary":"",',
    '    "accent":"",',
    '    "scale": [""]',
    '  },',
    '  "layoutPatterns": [{"pattern":"", "description":""}],',
    '  "slideTypes": [{"type":"", "purpose":"", "frequency":""}],',
    '  "overallTone": {',
    '    "keywords": [""],',
    '    "summary": "",',
    '    "designPrinciples": [""]',
    '  }',
    '}',
    '',
    '주의사항:',
    '- hex는 #RRGGBB 형식 사용',
    '- 추정이 필요한 경우 confidence가 낮다는 뉘앙스를 문장에 포함',
    '- 결과는 한국어로 작성',
  ].join('\n');
}

function extractJsonObject(content) {
  if (typeof content !== 'string' || content.trim() === '') {
    throw new Error('VLM response is empty.');
  }

  const trimmed = content.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error('No JSON object found in VLM response.');
}

function parseStyleAnalysis(content) {
  const jsonText = extractJsonObject(content);

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Failed to parse style analysis JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Style analysis JSON root must be an object.');
  }

  return parsed;
}

function formatColorPalette(colorPalette) {
  if (!Array.isArray(colorPalette) || colorPalette.length === 0) {
    return '- 주요 색상 정보를 추출하지 못했습니다.';
  }

  return colorPalette
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return '- (형식 오류)';
      }

      const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : 'Unnamed';
      const hex = typeof entry.hex === 'string' && entry.hex.trim() ? entry.hex.trim() : 'N/A';
      const usage = typeof entry.usage === 'string' && entry.usage.trim() ? entry.usage.trim() : '용도 정보 없음';
      return `- ${name}: ${hex} — ${usage}`;
    })
    .join('\n');
}

function formatFontSystem(fontSystem) {
  if (!fontSystem || typeof fontSystem !== 'object' || Array.isArray(fontSystem)) {
    return '- 폰트 시스템 정보를 추출하지 못했습니다.';
  }

  const lines = [];

  lines.push(`- Primary: ${fontSystem.primary || '정보 없음'}`);
  lines.push(`- Secondary: ${fontSystem.secondary || '정보 없음'}`);
  lines.push(`- Accent: ${fontSystem.accent || '정보 없음'}`);

  if (Array.isArray(fontSystem.scale) && fontSystem.scale.length > 0) {
    lines.push(`- Scale: ${fontSystem.scale.join(', ')}`);
  } else {
    lines.push('- Scale: 정보 없음');
  }

  return lines.join('\n');
}

function formatObjectArray(items, fieldMapping, emptyMessage) {
  if (!Array.isArray(items) || items.length === 0) {
    return emptyMessage;
  }

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '- (형식 오류)';
      }

      const fragments = fieldMapping
        .map(([label, key]) => {
          const value = item[key];
          if (typeof value === 'string' && value.trim() !== '') {
            return `${label}: ${value.trim()}`;
          }
          return `${label}: 정보 없음`;
        })
        .join(' | ');

      return `- ${fragments}`;
    })
    .join('\n');
}

function formatOverallTone(overallTone) {
  if (!overallTone || typeof overallTone !== 'object' || Array.isArray(overallTone)) {
    return '- 전체 톤 정보를 추출하지 못했습니다.';
  }

  const lines = [];

  if (Array.isArray(overallTone.keywords) && overallTone.keywords.length > 0) {
    lines.push(`- Keywords: ${overallTone.keywords.join(', ')}`);
  } else {
    lines.push('- Keywords: 정보 없음');
  }

  if (typeof overallTone.summary === 'string' && overallTone.summary.trim() !== '') {
    lines.push(`- Summary: ${overallTone.summary.trim()}`);
  } else {
    lines.push('- Summary: 정보 없음');
  }

  if (Array.isArray(overallTone.designPrinciples) && overallTone.designPrinciples.length > 0) {
    lines.push(`- Design Principles: ${overallTone.designPrinciples.join(' / ')}`);
  } else {
    lines.push('- Design Principles: 정보 없음');
  }

  return lines.join('\n');
}

function ensureRequiredSections(markdown) {
  const missingSections = REQUIRED_SECTIONS.filter(
    (section) => !new RegExp(`^##\\s+${section}\\s*$`, 'mi').test(markdown),
  );

  if (missingSections.length === 0) {
    return markdown;
  }

  const additions = missingSections.map((section) => `## ${section}\n- 섹션 누락으로 인해 자동 보완됨`).join('\n\n');
  return `${markdown.trim()}\n\n${additions}\n`;
}

function formatStyleConfigMarkdown(meta, parsed, rawContent) {
  const content = [
    '# Style Configuration',
    '',
    `- Source File: ${meta.inputPath}`,
    `- Source Type: ${meta.sourceType}`,
    `- Total Slides: ${meta.totalSlides}`,
    `- Sampled Slides: ${meta.sampledSlides}`,
    `- Generated At: ${new Date().toISOString()}`,
    '',
    '## 컬러 팔레트',
    formatColorPalette(parsed.colorPalette),
    '',
    '## 폰트 시스템',
    formatFontSystem(parsed.fontSystem),
    '',
    '## 레이아웃 패턴',
    formatObjectArray(
      parsed.layoutPatterns,
      [
        ['Pattern', 'pattern'],
        ['Description', 'description'],
      ],
      '- 레이아웃 패턴 정보를 추출하지 못했습니다.',
    ),
    '',
    '## 슬라이드 타입',
    formatObjectArray(
      parsed.slideTypes,
      [
        ['Type', 'type'],
        ['Purpose', 'purpose'],
        ['Frequency', 'frequency'],
      ],
      '- 슬라이드 타입 정보를 추출하지 못했습니다.',
    ),
    '',
    '## 전체 톤',
    formatOverallTone(parsed.overallTone),
    '',
    '## 분석 원문',
    '```json',
    typeof rawContent === 'string' && rawContent.trim() ? rawContent.trim() : '{}',
    '```',
    '',
  ].join('\n');

  return ensureRequiredSections(content);
}

async function collectSlideImagesFromInput(inputPath, sourceType, tempDir, commandRunner = runCommand) {
  const screenshotDir = join(tempDir, 'screenshots');
  await mkdir(screenshotDir, { recursive: true });

  if (sourceType === 'pdf') {
    const imagePaths = await convertPdfToSlideImages(inputPath, screenshotDir, commandRunner);
    return { imagePaths, intermediatePdf: null };
  }

  const pdfPath = await convertPptxToPdf(inputPath, tempDir, commandRunner);
  const imagePaths = await convertPdfToSlideImages(pdfPath, screenshotDir, commandRunner);

  return { imagePaths, intermediatePdf: pdfPath };
}

export async function runExtractStyle(args = process.argv.slice(2), internals = {}) {
  const analyzeImagesFn = internals.analyzeImagesFn ?? analyzeImages;
  const commandRunner = internals.commandRunner ?? runCommand;

  const options = parseCliArgs(args);

  if (options.help) {
    printUsage();
    return {
      generatedAt: new Date().toISOString(),
      options,
      summary: {
        totalSlides: 0,
        sampledSlides: 0,
      },
      outputPath: null,
    };
  }

  const inputPath = resolve(process.cwd(), options.input);
  const sourceType = extname(inputPath).toLowerCase().replace('.', '');

  if (!INPUT_EXTENSIONS.has(`.${sourceType}`)) {
    throw new Error('Only .pptx and .pdf inputs are supported.');
  }

  if (!(await pathExists(inputPath))) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const tempDir = await mkdtemp(join(os.tmpdir(), 'extract-style-'));

  try {
    const { imagePaths } = await collectSlideImagesFromInput(inputPath, sourceType, tempDir, commandRunner);

    const randomFn = options.seed === null ? Math.random : createSeededRandom(options.seed);
    const sampledImagePaths = sampleSlidesForAnalysis(imagePaths, randomFn);

    const prompt = buildStylePrompt({
      sourceType,
      totalSlides: imagePaths.length,
      sampledSlides: sampledImagePaths.length,
    });

    const response = await analyzeImagesFn(sampledImagePaths, prompt, {
      provider: options.provider,
      model: options.model,
      temperature: 0,
      maxTokens: 2400,
    });

    const parsed = parseStyleAnalysis(response.content);

    const outputPath = resolve(process.cwd(), options.output);
    const markdown = formatStyleConfigMarkdown(
      {
        inputPath,
        sourceType,
        totalSlides: imagePaths.length,
        sampledSlides: sampledImagePaths.length,
      },
      parsed,
      response.content,
    );

    await writeFile(outputPath, markdown, 'utf8');

    const result = {
      generatedAt: new Date().toISOString(),
      options: {
        input: inputPath,
        output: outputPath,
        provider: options.provider,
        model: options.model,
        seed: options.seed,
      },
      summary: {
        totalSlides: imagePaths.length,
        sampledSlides: sampledImagePaths.length,
      },
      usage: response.usage,
      outputPath,
    };

    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function isExecutedAsScript() {
  if (!process.argv[1]) return false;
  return resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isExecutedAsScript()) {
  runExtractStyle().catch((error) => {
    const failure = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalSlides: 0,
        sampledSlides: 0,
      },
      error: error instanceof Error ? error.message : String(error),
    };

    process.stdout.write(`${JSON.stringify(failure, null, 2)}\n`);
    process.exit(1);
  });
}

export { printUsage };
