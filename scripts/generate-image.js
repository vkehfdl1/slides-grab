#!/usr/bin/env node

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DEFAULT_CODEX_IMAGE_MODEL,
  DEFAULT_CODEX_IMAGE_SIZE,
  DEFAULT_IMAGE_PROVIDER,
  DEFAULT_NANO_BANANA_ASPECT_RATIO,
  DEFAULT_NANO_BANANA_IMAGE_SIZE,
  DEFAULT_NANO_BANANA_MODEL,
  buildCodexImageApiRequest,
  buildNanoBananaApiRequest,
  extractCodexGeneratedImage,
  extractGeneratedImage,
  generateCodexImage,
  generateNanoBananaImage,
  getCodexFallbackMessage,
  getNanoBananaFallbackMessage,
  getNanoBananaUsage,
  parseNanoBananaCliArgs,
  resolveCodexApiKey,
  resolveNanoBananaApiKey,
  resolveNanoBananaOutputPath,
  runNanoBananaCli,
  saveNanoBananaImage,
} from '../src/nano-banana.js';

export {
  DEFAULT_CODEX_IMAGE_MODEL,
  DEFAULT_CODEX_IMAGE_SIZE,
  DEFAULT_IMAGE_PROVIDER,
  DEFAULT_NANO_BANANA_ASPECT_RATIO,
  DEFAULT_NANO_BANANA_IMAGE_SIZE,
  DEFAULT_NANO_BANANA_MODEL,
  buildCodexImageApiRequest,
  buildNanoBananaApiRequest,
  extractCodexGeneratedImage,
  extractGeneratedImage,
  generateCodexImage,
  generateNanoBananaImage,
  getCodexFallbackMessage,
  getNanoBananaFallbackMessage,
  getNanoBananaUsage,
  parseNanoBananaCliArgs,
  resolveCodexApiKey,
  resolveNanoBananaApiKey,
  resolveNanoBananaOutputPath,
  runNanoBananaCli,
  saveNanoBananaImage,
};

export async function main(argv = process.argv.slice(2), options = {}) {
  return runNanoBananaCli(argv, options);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  main().catch((error) => {
    console.error(`[slides-grab] ${error.message}`);
    process.exit(1);
  });
}
