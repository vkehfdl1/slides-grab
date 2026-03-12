#!/usr/bin/env node

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildValidationFailure,
  parseCliArgs,
  printUsage,
  validateSlides,
} from '../src/validator/index.js';

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const slidesDir = resolve(process.cwd(), options.slidesDir);
  const result = await validateSlides(slidesDir);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (result.summary.failedSlides > 0) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify(buildValidationFailure(error), null, 2)}\n`);
    process.exit(1);
  });
}
