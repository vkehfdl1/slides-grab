import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_CODEX_IMAGE_MODEL,
  DEFAULT_IMAGE_PROVIDER,
  DEFAULT_NANO_BANANA_ASPECT_RATIO,
  DEFAULT_NANO_BANANA_IMAGE_SIZE,
  DEFAULT_NANO_BANANA_MODEL,
  buildCodexImageApiRequest,
  buildNanoBananaApiRequest,
  extractGeneratedImage,
  getCodexFallbackMessage,
  getNanoBananaFallbackMessage,
  parseNanoBananaCliArgs,
  resolveCodexApiKey,
  resolveNanoBananaApiKey,
  resolveNanoBananaOutputPath,
} from '../../src/nano-banana.js';
import { main } from '../../scripts/generate-image.js';

test('parseNanoBananaCliArgs applies Codex image generation defaults', () => {
  assert.deepEqual(parseNanoBananaCliArgs(['--prompt', 'Foggy mountain road at sunrise']), {
    prompt: 'Foggy mountain road at sunrise',
    slidesDir: 'slides',
    output: '',
    name: '',
    provider: DEFAULT_IMAGE_PROVIDER,
    model: DEFAULT_CODEX_IMAGE_MODEL,
    aspectRatio: DEFAULT_NANO_BANANA_ASPECT_RATIO,
    imageSize: DEFAULT_NANO_BANANA_IMAGE_SIZE,
    help: false,
  });
});

test('parseNanoBananaCliArgs reads explicit options and rejects invalid values', () => {
  assert.deepEqual(
    parseNanoBananaCliArgs([
      '--prompt=Industrial robot arm in a dark studio',
      '--slides-dir',
      'decks/demo',
      '--output',
      'decks/demo/assets/robot-hero',
      '--name',
      'robot-hero',
      '--provider',
      'nano-banana',
      '--model',
      'gemini-3-pro-image-preview',
      '--aspect-ratio',
      '1:1',
      '--image-size',
      '2K',
    ]),
    {
      prompt: 'Industrial robot arm in a dark studio',
      slidesDir: 'decks/demo',
      output: 'decks/demo/assets/robot-hero',
      name: 'robot-hero',
      provider: 'nano-banana',
      model: 'gemini-3-pro-image-preview',
      aspectRatio: '1:1',
      imageSize: '2K',
      help: false,
    },
  );

  assert.throws(() => parseNanoBananaCliArgs([]), /--prompt must be a non-empty string/i);
  assert.throws(() => parseNanoBananaCliArgs(['--prompt', 'x', '--image-size', '8K']), /unknown --image-size/i);
  assert.throws(() => parseNanoBananaCliArgs(['--prompt', 'x', '--provider', 'banana']), /unknown --provider/i);
});

test('resolveCodexApiKey reads OPENAI_API_KEY for the default provider', () => {
  assert.deepEqual(resolveCodexApiKey({ OPENAI_API_KEY: 'openai-key' }), {
    apiKey: 'openai-key',
    source: 'OPENAI_API_KEY',
  });
  assert.deepEqual(resolveCodexApiKey({ OPENAI_API_KEY: '  ' }), {
    apiKey: '',
    source: '',
  });
});

test('resolveNanoBananaApiKey prefers GOOGLE_API_KEY and falls back to GEMINI_API_KEY', () => {
  assert.deepEqual(resolveNanoBananaApiKey({ GOOGLE_API_KEY: 'google-key', GEMINI_API_KEY: 'gemini-key' }), {
    apiKey: 'google-key',
    source: 'GOOGLE_API_KEY',
  });
  assert.deepEqual(resolveNanoBananaApiKey({ GEMINI_API_KEY: 'gemini-key' }), {
    apiKey: 'gemini-key',
    source: 'GEMINI_API_KEY',
  });
  assert.deepEqual(resolveNanoBananaApiKey({}), {
    apiKey: '',
    source: '',
  });
});

test('resolveNanoBananaOutputPath keeps generated assets under the deck assets directory', () => {
  const target = resolveNanoBananaOutputPath({
    slidesDir: path.resolve('decks/demo'),
    prompt: 'A bright banana hovering over a keynote stage',
    output: '',
    name: '',
    mimeType: 'image/png',
  });

  assert.match(target.outputPath, /decks\/demo\/assets\/nano-banana-a-bright-banana-hovering-over-a-keynote-stage\.png$/);
  assert.equal(target.relativeRef, './assets/nano-banana-a-bright-banana-hovering-over-a-keynote-stage.png');

  assert.throws(
    () => resolveNanoBananaOutputPath({
      slidesDir: path.resolve('decks/demo'),
      prompt: 'test',
      output: path.resolve('decks/outside.png'),
      mimeType: 'image/png',
    }),
    /must be saved inside .*assets/i,
  );
});

test('resolveNanoBananaOutputPath preserves explicit cwd-relative deck asset paths', () => {
  const target = resolveNanoBananaOutputPath({
    slidesDir: path.resolve('decks/demo'),
    prompt: 'test',
    output: 'decks/demo/assets/robot-hero',
    mimeType: 'image/png',
  });

  assert.match(target.outputPath, /decks\/demo\/assets\/robot-hero\.png$/);
  assert.equal(target.relativeRef, './assets/robot-hero.png');
});

test('resolveNanoBananaOutputPath treats relative --output values as assets-relative paths', () => {
  const slidesDir = path.resolve('decks/demo');
  const target = resolveNanoBananaOutputPath({
    slidesDir,
    prompt: 'test',
    output: 'hero-image',
    mimeType: 'image/png',
  });

  assert.equal(target.outputPath, path.join(slidesDir, 'assets', 'hero-image.png'));
  assert.equal(target.relativeRef, './assets/hero-image.png');
});

test('resolveNanoBananaOutputPath treats assets-prefixed relative output values as assets-relative paths', () => {
  const slidesDir = path.resolve('decks/demo');
  const target = resolveNanoBananaOutputPath({
    slidesDir,
    prompt: 'test',
    output: 'assets/hero-image',
    mimeType: 'image/png',
  });

  assert.equal(target.outputPath, path.join(slidesDir, 'assets', 'hero-image.png'));
  assert.equal(target.relativeRef, './assets/hero-image.png');
});

test('resolveNanoBananaOutputPath keeps nested asset-relative output values inside assets', () => {
  const slidesDir = path.resolve('decks/demo');
  const target = resolveNanoBananaOutputPath({
    slidesDir,
    prompt: 'test',
    output: 'nested/hero-image',
    mimeType: 'image/png',
  });

  assert.equal(target.outputPath, path.join(slidesDir, 'assets', 'nested', 'hero-image.png'));
  assert.equal(target.relativeRef, './assets/nested/hero-image.png');
});

test('buildCodexImageApiRequest maps slide aspect ratios to supported OpenAI landscape sizes', () => {
  assert.deepEqual(
    buildCodexImageApiRequest({
      prompt: 'Generate a premium fintech dashboard hero image.',
      model: DEFAULT_CODEX_IMAGE_MODEL,
      aspectRatio: '16:9',
    }),
    {
      model: DEFAULT_CODEX_IMAGE_MODEL,
      prompt: 'Generate a premium fintech dashboard hero image.',
      size: '1536x1024',
    },
  );

  assert.deepEqual(
    buildCodexImageApiRequest({
      prompt: 'Generate a square app icon.',
      model: DEFAULT_CODEX_IMAGE_MODEL,
      aspectRatio: '1:1',
    }),
    {
      model: DEFAULT_CODEX_IMAGE_MODEL,
      prompt: 'Generate a square app icon.',
      size: '1024x1024',
    },
  );
});

test('buildNanoBananaApiRequest matches the documented Gemini image request shape', () => {
  assert.deepEqual(
    buildNanoBananaApiRequest({
      prompt: 'Generate a premium fintech dashboard hero image.',
      aspectRatio: '16:9',
      imageSize: '4K',
    }),
    {
      contents: [
        {
          parts: [{ text: 'Generate a premium fintech dashboard hero image.' }],
        },
      ],
      generationConfig: {
        imageConfig: {
          aspectRatio: '16:9',
          imageSize: '4K',
        },
      },
    },
  );
});

test('extractGeneratedImage returns the first inline image part', () => {
  const payload = extractGeneratedImage({
    candidates: [
      {
        content: {
          parts: [
            { text: 'drafted image' },
            {
              inlineData: {
                mimeType: 'image/png',
                data: Buffer.from('png-bytes').toString('base64'),
              },
            },
          ],
        },
      },
    ],
  });

  assert.equal(payload.mimeType, 'image/png');
  assert.equal(Buffer.from(payload.bytes).toString(), 'png-bytes');
});

test('getCodexFallbackMessage includes API key, Nano Banana fallback, and web search guidance', () => {
  const message = getCodexFallbackMessage('Missing API key.');
  assert.match(message, /OPENAI_API_KEY/i);
  assert.match(message, /GOOGLE_API_KEY|GEMINI_API_KEY/i);
  assert.match(message, /web search/i);
  assert.match(message, /\.\/assets\//);
});

test('getNanoBananaFallbackMessage tells the agent to ask for a key or fall back to web search', () => {
  assert.match(
    getNanoBananaFallbackMessage('Missing API key.'),
    /GOOGLE_API_KEY|GEMINI_API_KEY/i,
  );
  assert.match(
    getNanoBananaFallbackMessage('Missing API key.'),
    /Nano Banana/i,
  );
  assert.match(
    getNanoBananaFallbackMessage('Missing API key.'),
    /\.\/assets\//,
  );
});

test('main defaults to Codex image generation and writes the generated image into slides/assets', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'codex-image-test-'));
  const output = [];
  const calls = [];

  try {
    await main(
      ['--prompt', 'Studio portrait of a founder with warm rim light', '--slides-dir', workspace],
      {
        env: { OPENAI_API_KEY: 'test-key' },
        fetchImpl: async (url, init) => {
          calls.push({ url, init });
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                data: [
                  {
                    b64_json: Buffer.from('fake-image-bytes').toString('base64'),
                  },
                ],
              };
            },
          };
        },
        stdout: {
          write(chunk) {
            output.push(String(chunk));
          },
        },
      },
    );

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.openai.com/v1/images/generations');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer test-key');
    const requestBody = JSON.parse(calls[0].init.body);
    assert.equal(requestBody.model, DEFAULT_CODEX_IMAGE_MODEL);
    assert.equal(requestBody.prompt, 'Studio portrait of a founder with warm rim light');
    assert.equal(requestBody.size, '1536x1024');

    const assetDir = path.join(workspace, 'assets');
    const files = await readFile(path.join(assetDir, 'codex-studio-portrait-of-a-founder-with-warm-rim-light.png'));
    assert.equal(files.toString(), 'fake-image-bytes');
    assert.match(output.join(''), /\.\/assets\/codex-studio-portrait-of-a-founder-with-warm-rim-light\.png/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('main maps explicit square aspect ratio to OpenAI square size', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'codex-image-square-test-'));
  const calls = [];

  try {
    await main(
      ['--prompt', 'A centered product icon', '--slides-dir', workspace, '--aspect-ratio', '1:1'],
      {
        env: { OPENAI_API_KEY: 'test-key' },
        fetchImpl: async (url, init) => {
          calls.push({ url, init });
          return {
            ok: true,
            status: 200,
            async json() {
              return { data: [{ b64_json: Buffer.from('square-image-bytes').toString('base64') }] };
            },
          };
        },
        stdout: { write() {} },
      },
    );

    assert.equal(JSON.parse(calls[0].init.body).size, '1024x1024');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('main rejects Codex image-size presets because they are Nano Banana only', async () => {
  await assert.rejects(
    () => main(
      ['--prompt', 'A floating product render', '--image-size', '2K'],
      {
        env: { OPENAI_API_KEY: 'test-key' },
        fetchImpl: async () => {
          throw new Error('fetch should not be called');
        },
      },
    ),
    /--image-size.*Nano Banana/i,
  );
});

test('main falls back to Nano Banana when OPENAI_API_KEY is unavailable but GOOGLE_API_KEY is configured', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'codex-image-fallback-test-'));
  const calls = [];

  try {
    await main(
      ['--prompt', 'A floating product render', '--slides-dir', workspace],
      {
        env: { GOOGLE_API_KEY: 'google-key' },
        fetchImpl: async (url, init) => {
          calls.push({ url, init });
          return {
            ok: true,
            status: 200,
            async json() {
              return {
                candidates: [
                  {
                    content: {
                      parts: [
                        {
                          inlineData: {
                            mimeType: 'image/png',
                            data: Buffer.from('fallback-image-bytes').toString('base64'),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            },
          };
        },
        stdout: { write() {} },
      },
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /models\/gemini-3-pro-image-preview:generateContent$/);
    const files = await readFile(path.join(workspace, 'assets', 'nano-banana-a-floating-product-render.png'));
    assert.equal(files.toString(), 'fallback-image-bytes');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('main throws an actionable fallback error when no API key is configured', async () => {
  await assert.rejects(
    () => main(['--prompt', 'A floating product render'], { env: {}, fetchImpl: async () => {
      throw new Error('fetch should not be called');
    } }),
    /OPENAI_API_KEY/i,
  );
});

test('main wraps network failures in the actionable fallback guidance', async () => {
  await assert.rejects(
    () => main(
      ['--prompt', 'A floating product render'],
      {
        env: { OPENAI_API_KEY: 'test-key' },
        fetchImpl: async () => {
          throw new Error('network down');
        },
      },
    ),
    /Nano Banana/i,
  );
});
