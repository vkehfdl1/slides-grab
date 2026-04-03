#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_SLIDES_DIR = 'slides';
const DEFAULT_OUTPUT_TEMPLATE = '%(title).80B-%(id)s.%(ext)s';

function printUsage() {
  process.stdout.write(
    [
      'Usage: node scripts/download-video.js [options]',
      '',
      'Options:',
      '  --url <url>          Video page URL to download with yt-dlp',
      `  --slides-dir <path>  Slide directory (default: ${DEFAULT_SLIDES_DIR})`,
      '  --output-name <name> Optional output stem inside <slides-dir>/assets/',
      '  -h, --help           Show this help message',
      '',
      'Examples:',
      '  node scripts/download-video.js --url https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      '  node scripts/download-video.js --url https://youtu.be/demo --slides-dir decks/q2 --output-name hero-video',
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

function sanitizeOutputName(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    return '';
  }

  const baseName = basename(trimmed).replace(/\.[^.]+$/, '');
  if (!baseName || baseName === '.' || baseName === '..') {
    throw new Error('--output-name must be a simple file stem.');
  }
  if (baseName !== trimmed.replace(/\.[^.]+$/, '')) {
    throw new Error('--output-name must not include path separators.');
  }
  return baseName;
}

export function parseCliArgs(args) {
  const options = {
    url: '',
    slidesDir: DEFAULT_SLIDES_DIR,
    outputName: '',
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--url') {
      options.url = readOptionValue(args, index, '--url');
      index += 1;
      continue;
    }

    if (arg.startsWith('--url=')) {
      options.url = arg.slice('--url='.length);
      continue;
    }

    if (arg === '--slides-dir') {
      options.slidesDir = readOptionValue(args, index, '--slides-dir');
      index += 1;
      continue;
    }

    if (arg.startsWith('--slides-dir=')) {
      options.slidesDir = arg.slice('--slides-dir='.length);
      continue;
    }

    if (arg === '--output-name') {
      options.outputName = readOptionValue(args, index, '--output-name');
      index += 1;
      continue;
    }

    if (arg.startsWith('--output-name=')) {
      options.outputName = arg.slice('--output-name='.length);
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (typeof options.slidesDir !== 'string' || options.slidesDir.trim() === '') {
    throw new Error('--slides-dir must be a non-empty string.');
  }

  options.slidesDir = options.slidesDir.trim();
  options.outputName = sanitizeOutputName(options.outputName);
  options.url = typeof options.url === 'string' ? options.url.trim() : '';

  if (!options.help && !options.url) {
    throw new Error('--url is required.');
  }

  return options;
}

function buildOutputTemplate(outputName) {
  return outputName ? `${outputName}.%(ext)s` : DEFAULT_OUTPUT_TEMPLATE;
}

export function buildYtDlpArgs({ url, assetsDir, outputName = '' }) {
  return [
    '--no-playlist',
    '--restrict-filenames',
    '--format',
    'mp4/bestvideo+bestaudio/best',
    '--merge-output-format',
    'mp4',
    '--paths',
    assetsDir,
    '--output',
    buildOutputTemplate(outputName),
    '--print',
    'after_move:filepath',
    url,
  ];
}

function runYtDlp(args) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('yt-dlp', args, {
      cwd: process.cwd(),
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
      if (error.code === 'ENOENT') {
        rejectPromise(new Error('yt-dlp is not installed or not available in PATH.'));
        return;
      }
      rejectPromise(error);
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      rejectPromise(new Error(`yt-dlp failed (${code})\n${stderr || stdout}`.trim()));
    });
  });
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const slidesDir = resolve(process.cwd(), options.slidesDir);
  const assetsDir = resolve(slidesDir, 'assets');
  await mkdir(assetsDir, { recursive: true });

  const { stdout } = await runYtDlp(buildYtDlpArgs({
    url: options.url,
    assetsDir,
    outputName: options.outputName,
  }));

  const downloadedPath = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  if (!downloadedPath) {
    throw new Error('yt-dlp completed but did not report the downloaded file path.');
  }

  const assetReference = `./assets/${basename(downloadedPath)}`;
  process.stdout.write(`Downloaded video: ${downloadedPath}\n`);
  process.stdout.write(`Use in slide HTML: ${assetReference}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
