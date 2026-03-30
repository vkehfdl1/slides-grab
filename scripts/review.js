#!/usr/bin/env node

/**
 * Standalone review script — analyze a presentation deck and output a report.
 * Usage: node scripts/review.js --deck <name> [--audience <type>] [--time <minutes>]
 */

import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { analyzeDeck } from '../src/review.js';

function parseArgs(argv) {
  const opts = { deck: '', audience: '', time: 15 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--deck') { opts.deck = argv[++i] || ''; continue; }
    if (arg === '--audience') { opts.audience = argv[++i] || ''; continue; }
    if (arg === '--time') { opts.time = parseInt(argv[++i], 10) || 15; continue; }
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));

if (!opts.deck) {
  console.error('Error: --deck <name> is required.');
  process.exit(1);
}

const deckDir = resolve(process.cwd(), 'decks', opts.deck);
if (!existsSync(deckDir)) {
  console.error(`Error: Deck not found: ${deckDir}`);
  process.exit(1);
}

console.log(`\n  Presentation Review: ${opts.deck}`);
console.log('  ─────────────────────────────────────\n');

const result = await analyzeDeck(deckDir, {
  audience: opts.audience || undefined,
  timeMinutes: opts.time,
});

// Score bar
const filled = Math.round(result.score / 5);
const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
console.log(`  Overall: ${result.grade} (${result.score}/100)`);
console.log(`  ${bar}\n`);

// Categories
for (const [, cat] of Object.entries(result.categories)) {
  const stars = '★'.repeat(Math.round(cat.score / 20)) + '☆'.repeat(5 - Math.round(cat.score / 20));
  console.log(`  ${cat.label.padEnd(12)} ${stars}  (${cat.score})`);
}

console.log(`\n  Slides: ${result.slideCount}`);
console.log(`  Types: ${Object.entries(result.typeCounts).map(([t, c]) => `${t}(${c})`).join(', ')}`);

// Issues
if (result.issues.length > 0) {
  console.log('\n  ─── Issues ───\n');
  for (const issue of result.issues) {
    const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warn' ? '⚠' : 'ℹ';
    const loc = issue.slide ? `Slide ${issue.slide}: ` : '';
    console.log(`  ${icon} ${loc}${issue.message}`);
  }
}

// Strengths
if (result.strengths.length > 0) {
  console.log('\n  ─── Strengths ───\n');
  for (const s of result.strengths) {
    console.log(`  ✅ ${s}`);
  }
}

// Consistency summary
if (result.consistency) {
  const cs = result.consistency.summary;
  console.log('\n  ─── Consistency ───\n');
  if (cs.consistent) {
    console.log('  ✅ All slides are visually consistent.');
  } else {
    console.log(`  ${cs.issueCount} consistency issue(s) detected (included in issues above).`);
  }
}

console.log('');
