export const DEFAULT_SLIDES_DIR = 'slides';
export const DEFAULT_VALIDATE_FORMAT = 'concise';
export const VALIDATE_FORMATS = ['concise', 'json', 'json-full'];

function readOptionValue(args, index, optionName) {
  const next = args[index + 1];
  if (!next || next.startsWith('-')) {
    throw new Error(`Missing value for ${optionName}.`);
  }
  return next;
}

export function parseValidateCliArgs(args) {
  const options = {
    slidesDir: DEFAULT_SLIDES_DIR,
    format: DEFAULT_VALIDATE_FORMAT,
    help: false,
    slides: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg === '--slides-dir') {
      options.slidesDir = readOptionValue(args, i, '--slides-dir');
      i += 1;
      continue;
    }

    if (arg.startsWith('--slides-dir=')) {
      options.slidesDir = arg.slice('--slides-dir='.length);
      continue;
    }

    if (arg === '--format') {
      options.format = readOptionValue(args, i, '--format');
      i += 1;
      continue;
    }

    if (arg.startsWith('--format=')) {
      options.format = arg.slice('--format='.length);
      continue;
    }

    if (arg === '--slide') {
      options.slides.push(readOptionValue(args, i, '--slide'));
      i += 1;
      continue;
    }

    if (arg.startsWith('--slide=')) {
      options.slides.push(arg.slice('--slide='.length));
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  if (typeof options.slidesDir !== 'string' || options.slidesDir.trim() === '') {
    throw new Error('--slides-dir must be a non-empty string.');
  }

  if (typeof options.format !== 'string' || options.format.trim() === '') {
    throw new Error('--format must be a non-empty string.');
  }

  options.slidesDir = options.slidesDir.trim();
  options.format = options.format.trim();

  if (!VALIDATE_FORMATS.includes(options.format)) {
    throw new Error(`Unknown --format value: ${options.format}. Expected one of: ${VALIDATE_FORMATS.join(', ')}`);
  }

  options.slides = options.slides
    .map((slide) => String(slide).trim())
    .filter(Boolean);

  return options;
}

export function getValidateUsage() {
  return [
    'Usage: node scripts/validate-slides.js [options]',
    '',
    'Options:',
    `  --slides-dir <path>  Slide directory (default: ${DEFAULT_SLIDES_DIR})`,
    `  --format <format>   Output format: ${VALIDATE_FORMATS.join(', ')} (default: ${DEFAULT_VALIDATE_FORMAT})`,
    '  --slide <file>      Validate only the named slide file (repeatable)',
    '  -h, --help           Show this help message',
  ].join('\n');
}
