import { mkdir, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';

import { getSlidesDir } from './resolve.js';

export const DEFAULT_NANO_BANANA_MODEL = 'gemini-3-pro-image-preview';
export const DEFAULT_NANO_BANANA_ASPECT_RATIO = '16:9';
export const DEFAULT_NANO_BANANA_IMAGE_SIZE = '4K';
const VALID_IMAGE_SIZES = new Set(['2K', '4K']);

const MIME_TYPE_TO_EXTENSION = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
]);

function readOptionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${option} is missing a value.`);
  }
  return value;
}

export function getNanoBananaUsage() {
  return [
    'Usage: slides-grab image --prompt <text> [options]',
    '',
    'Generate a deck-local image asset with Nano Banana Pro and save it into <slides-dir>/assets/.',
    '',
    'Options:',
    '  --prompt <text>         Required text prompt for image generation',
    '  --slides-dir <path>     Slides directory (default: slides)',
    '  --output <path>         Optional explicit output path inside <slides-dir>/assets/',
    '  --name <slug>           Optional asset basename without extension',
    `  --model <id>            Model id (default: ${DEFAULT_NANO_BANANA_MODEL})`,
    `  --aspect-ratio <ratio>  Image aspect ratio (default: ${DEFAULT_NANO_BANANA_ASPECT_RATIO})`,
    `  --image-size <size>     Image size preset: 2K or 4K (default: ${DEFAULT_NANO_BANANA_IMAGE_SIZE})`,
    '  -h, --help              Show this help text',
    '',
    'Auth:',
    '  Set GOOGLE_API_KEY or GEMINI_API_KEY before running this command.',
  ].join('\n');
}

export function parseNanoBananaCliArgs(argv) {
  const parsed = {
    prompt: '',
    slidesDir: 'slides',
    output: '',
    name: '',
    model: DEFAULT_NANO_BANANA_MODEL,
    aspectRatio: DEFAULT_NANO_BANANA_ASPECT_RATIO,
    imageSize: DEFAULT_NANO_BANANA_IMAGE_SIZE,
    help: false,
  };

  const args = Array.isArray(argv) ? [...argv] : [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }

    if (arg === '--prompt') {
      parsed.prompt = readOptionValue(args, i, '--prompt');
      i += 1;
      continue;
    }
    if (arg.startsWith('--prompt=')) {
      parsed.prompt = arg.slice('--prompt='.length);
      continue;
    }

    if (arg === '--slides-dir') {
      parsed.slidesDir = readOptionValue(args, i, '--slides-dir');
      i += 1;
      continue;
    }
    if (arg.startsWith('--slides-dir=')) {
      parsed.slidesDir = arg.slice('--slides-dir='.length);
      continue;
    }

    if (arg === '--output') {
      parsed.output = readOptionValue(args, i, '--output');
      i += 1;
      continue;
    }
    if (arg.startsWith('--output=')) {
      parsed.output = arg.slice('--output='.length);
      continue;
    }

    if (arg === '--name') {
      parsed.name = readOptionValue(args, i, '--name');
      i += 1;
      continue;
    }
    if (arg.startsWith('--name=')) {
      parsed.name = arg.slice('--name='.length);
      continue;
    }

    if (arg === '--model') {
      parsed.model = readOptionValue(args, i, '--model');
      i += 1;
      continue;
    }
    if (arg.startsWith('--model=')) {
      parsed.model = arg.slice('--model='.length);
      continue;
    }

    if (arg === '--aspect-ratio') {
      parsed.aspectRatio = readOptionValue(args, i, '--aspect-ratio');
      i += 1;
      continue;
    }
    if (arg.startsWith('--aspect-ratio=')) {
      parsed.aspectRatio = arg.slice('--aspect-ratio='.length);
      continue;
    }

    if (arg === '--image-size') {
      parsed.imageSize = readOptionValue(args, i, '--image-size').toUpperCase();
      i += 1;
      continue;
    }
    if (arg.startsWith('--image-size=')) {
      parsed.imageSize = arg.slice('--image-size='.length).toUpperCase();
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (parsed.help) {
    return parsed;
  }

  if (typeof parsed.prompt !== 'string' || parsed.prompt.trim() === '') {
    throw new Error('--prompt must be a non-empty string.');
  }
  parsed.prompt = parsed.prompt.trim();

  if (typeof parsed.slidesDir !== 'string' || parsed.slidesDir.trim() === '') {
    throw new Error('--slides-dir must be a non-empty string.');
  }
  parsed.slidesDir = parsed.slidesDir.trim();

  if (typeof parsed.output !== 'string') {
    throw new Error('--output must be a string.');
  }
  parsed.output = parsed.output.trim();

  if (typeof parsed.name !== 'string') {
    throw new Error('--name must be a string.');
  }
  parsed.name = parsed.name.trim();

  if (typeof parsed.model !== 'string' || parsed.model.trim() === '') {
    throw new Error('--model must be a non-empty string.');
  }
  parsed.model = parsed.model.trim();

  if (typeof parsed.aspectRatio !== 'string' || parsed.aspectRatio.trim() === '') {
    throw new Error('--aspect-ratio must be a non-empty string.');
  }
  parsed.aspectRatio = parsed.aspectRatio.trim();

  if (!VALID_IMAGE_SIZES.has(parsed.imageSize)) {
    throw new Error(`Unknown --image-size value: ${parsed.imageSize}. Expected 2K or 4K.`);
  }

  return parsed;
}

export function resolveNanoBananaApiKey(env = process.env) {
  const googleApiKey = typeof env?.GOOGLE_API_KEY === 'string' ? env.GOOGLE_API_KEY.trim() : '';
  if (googleApiKey) {
    return { apiKey: googleApiKey, source: 'GOOGLE_API_KEY' };
  }

  const geminiApiKey = typeof env?.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY.trim() : '';
  if (geminiApiKey) {
    return { apiKey: geminiApiKey, source: 'GEMINI_API_KEY' };
  }

  return { apiKey: '', source: '' };
}

export function getNanoBananaFallbackMessage(reason) {
  const summary = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Nano Banana image generation failed.';
  return `${summary} Ask the user to provide GOOGLE_API_KEY (or GEMINI_API_KEY), or fall back to web search + download the chosen image into ./assets/<file>.`;
}

export function buildNanoBananaApiRequest({ prompt, aspectRatio, imageSize }) {
  return {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      imageConfig: {
        aspectRatio,
        imageSize,
      },
    },
  };
}

function sanitizeAssetName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 80);
}

function pickAssetBaseName({ prompt, name }) {
  const preferred = sanitizeAssetName(name || '');
  if (preferred) return preferred;

  const fromPrompt = sanitizeAssetName(prompt);
  return fromPrompt ? `nano-banana-${fromPrompt}` : 'nano-banana-generated-image';
}

function getExtensionFromMimeType(mimeType) {
  return MIME_TYPE_TO_EXTENSION.get((mimeType || '').toLowerCase()) || '.png';
}

function ensureInsideDirectory(filePath, directoryPath) {
  const relativePath = relative(directoryPath, filePath);
  return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath);
}

function resolveRequestedOutputPath(output, assetsDir) {
  const trimmed = output.trim();
  if (isAbsolute(trimmed)) {
    return resolve(trimmed);
  }

  const isBareFileName = !/[\\/]/.test(trimmed);
  if (isBareFileName) {
    return resolve(assetsDir, trimmed);
  }

  if (/^(?:\.\/)?assets[\\/]/.test(trimmed)) {
    const normalized = trimmed
      .replace(/^[.][\\/]/, '')
      .replace(/^assets[\\/]/, '');
    return resolve(assetsDir, normalized);
  }

  const cwdRelativePath = resolve(trimmed);
  if (ensureInsideDirectory(cwdRelativePath, assetsDir)) {
    return cwdRelativePath;
  }

  return resolve(assetsDir, trimmed);
}

export function resolveNanoBananaOutputPath({
  slidesDir,
  prompt,
  output = '',
  name = '',
  mimeType = 'image/png',
}) {
  const absoluteSlidesDir = resolve(slidesDir);
  const assetsDir = join(absoluteSlidesDir, 'assets');
  const extension = getExtensionFromMimeType(mimeType);

  let outputPath;
  if (output) {
    const requestedPath = resolveRequestedOutputPath(output, assetsDir);
    if (!ensureInsideDirectory(requestedPath, assetsDir)) {
      throw new Error(`Generated images must be saved inside ${assetsDir}.`);
    }
    outputPath = extname(requestedPath) ? requestedPath : `${requestedPath}${extension}`;
  } else {
    outputPath = join(assetsDir, `${pickAssetBaseName({ prompt, name })}${extension}`);
  }

  if (!ensureInsideDirectory(outputPath, assetsDir)) {
    throw new Error(`Generated images must be saved inside ${assetsDir}.`);
  }

  return {
    assetsDir,
    outputPath,
    relativeRef: `./assets/${relative(assetsDir, outputPath).replace(/\\/g, '/')}`,
  };
}

export function extractGeneratedImage(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inlineData = part?.inlineData || part?.inline_data;
      if (!inlineData?.data) continue;

      return {
        mimeType: inlineData.mimeType || inlineData.mime_type || 'image/png',
        bytes: Buffer.from(inlineData.data, 'base64'),
      };
    }
  }

  throw new Error('Nano Banana API response did not include an image payload.');
}

function buildNanoBananaEndpoint(model) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

function getApiErrorMessage(payload, status) {
  const message = payload?.error?.message || payload?.message;
  if (typeof message === 'string' && message.trim()) {
    return message.trim();
  }
  return `HTTP ${status}`;
}

export async function generateNanoBananaImage({
  prompt,
  apiKey,
  model = DEFAULT_NANO_BANANA_MODEL,
  aspectRatio = DEFAULT_NANO_BANANA_ASPECT_RATIO,
  imageSize = DEFAULT_NANO_BANANA_IMAGE_SIZE,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch is unavailable in this runtime.');
  }

  try {
    const response = await fetchImpl(buildNanoBananaEndpoint(model), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(buildNanoBananaApiRequest({ prompt, aspectRatio, imageSize })),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(`Nano Banana API request failed: ${getApiErrorMessage(payload, response.status)}.`);
    }

    return extractGeneratedImage(payload);
  } catch (error) {
    throw new Error(getNanoBananaFallbackMessage(error.message));
  }
}

export async function saveNanoBananaImage({
  prompt,
  slidesDir,
  output = '',
  name = '',
  mimeType,
  bytes,
}) {
  const target = resolveNanoBananaOutputPath({ slidesDir, prompt, output, name, mimeType });
  await mkdir(target.assetsDir, { recursive: true });
  await writeFile(target.outputPath, bytes);
  return target;
}

export async function runNanoBananaCli(argv = process.argv.slice(2), {
  env = process.env,
  fetchImpl = globalThis.fetch,
  stdout = process.stdout,
} = {}) {
  const options = parseNanoBananaCliArgs(argv);
  if (options.help) {
    stdout.write(`${getNanoBananaUsage()}\n`);
    return null;
  }

  const { apiKey } = resolveNanoBananaApiKey(env);
  if (!apiKey) {
    throw new Error(getNanoBananaFallbackMessage('Nano Banana image generation requires GOOGLE_API_KEY or GEMINI_API_KEY.'));
  }

  const generated = await generateNanoBananaImage({
    prompt: options.prompt,
    apiKey,
    model: options.model,
    aspectRatio: options.aspectRatio,
    imageSize: options.imageSize,
    fetchImpl,
  });

  const target = await saveNanoBananaImage({
    prompt: options.prompt,
    slidesDir: getSlidesDir(options.slidesDir),
    output: options.output,
    name: options.name,
    mimeType: generated.mimeType,
    bytes: generated.bytes,
  });

  stdout.write(`Saved generated image to ${target.outputPath}\n`);
  stdout.write(`Reference it from slide HTML as ${target.relativeRef}\n`);
  return target;
}
