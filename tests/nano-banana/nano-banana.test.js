import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_NANO_BANANA_ASPECT_RATIO,
  DEFAULT_NANO_BANANA_IMAGE_SIZE,
  DEFAULT_NANO_BANANA_MODEL,
  buildNanoBananaApiRequest,
  extractGeneratedImage,
  getNanoBananaFallbackMessage,
  parseNanoBananaCliArgs,
  resolveNanoBananaApiKey,
  resolveNanoBananaOutputPath,
} from '../../src/nano-banana.js';
import { main } from '../../scripts/generate-image.js';

test('parseNanoBananaCliArgs applies defaults', () => {
  assert.deepEqual(parseNanoBananaCliArgs(['--prompt', 'Foggy mountain road at sunrise']), {
    prompt: 'Foggy mountain road at sunrise',
    slidesDir: 'slides',
    output: '',
    name: '',
    model: DEFAULT_NANO_BANANA_MODEL,
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
      model: 'gemini-3-pro-image-preview',
      aspectRatio: '1:1',
      imageSize: '2K',
      help: false,
    },
  );

  assert.throws(() => parseNanoBananaCliArgs([]), /--prompt must be a non-empty string/i);
  assert.throws(() => parseNanoBananaCliArgs(['--prompt', 'x', '--image-size', '8K']), /unknown --image-size/i);
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

test('getNanoBananaFallbackMessage tells the agent to ask for a key or fall back to web search', () => {
  assert.match(
    getNanoBananaFallbackMessage('Missing API key.'),
    /GOOGLE_API_KEY|GEMINI_API_KEY/i,
  );
  assert.match(
    getNanoBananaFallbackMessage('Missing API key.'),
    /web search/i,
  );
  assert.match(
    getNanoBananaFallbackMessage('Missing API key.'),
    /\.\/assets\//,
  );
});

test('main writes the generated image into slides/assets and logs the local reference', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'nano-banana-test-'));
  const output = [];
  const calls = [];

  try {
    await main(
      ['--prompt', 'Studio portrait of a founder with warm rim light', '--slides-dir', workspace],
      {
        env: { GOOGLE_API_KEY: 'test-key' },
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
                            data: Buffer.from('fake-image-bytes').toString('base64'),
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
        stdout: {
          write(chunk) {
            output.push(String(chunk));
          },
        },
      },
    );

    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /models\/gemini-3-pro-image-preview:generateContent$/);
    const requestBody = JSON.parse(calls[0].init.body);
    assert.equal(requestBody.contents[0].parts[0].text, 'Studio portrait of a founder with warm rim light');
    assert.deepEqual(requestBody.generationConfig.imageConfig, {
      aspectRatio: '16:9',
      imageSize: '4K',
    });

    const assetDir = path.join(workspace, 'assets');
    const files = await readFile(path.join(assetDir, 'nano-banana-studio-portrait-of-a-founder-with-warm-rim-light.png'));
    assert.equal(files.toString(), 'fake-image-bytes');
    assert.match(output.join(''), /\.\/assets\/nano-banana-studio-portrait-of-a-founder-with-warm-rim-light\.png/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test('main throws an actionable fallback error when no API key is configured', async () => {
  await assert.rejects(
    () => main(['--prompt', 'A floating product render'], { env: {}, fetchImpl: async () => {
      throw new Error('fetch should not be called');
    } }),
    /web search/i,
  );
});

test('main wraps network failures in the actionable fallback guidance', async () => {
  await assert.rejects(
    () => main(
      ['--prompt', 'A floating product render'],
      {
        env: { GOOGLE_API_KEY: 'test-key' },
        fetchImpl: async () => {
          throw new Error('network down');
        },
      },
    ),
    /web search/i,
  );
});
