#!/usr/bin/env node

/**
 * Standalone retheme script — re-generate deck slides with a different pack.
 * Usage: node scripts/retheme.js --deck <name> --pack <packId> [--save-as <name>] [--model <model>]
 */

import { resolve, basename, join } from 'node:path';
import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { prepareRetheme, backupDeck } from '../src/retheme.js';

const CLAUDE_BIN = process.env.PPT_AGENT_CLAUDE_BIN || 'claude';

function parseArgs(argv) {
  const opts = { deck: '', pack: '', saveAs: '', model: '' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--deck') { opts.deck = argv[++i] || ''; continue; }
    if (arg === '--pack') { opts.pack = argv[++i] || ''; continue; }
    if (arg === '--save-as') { opts.saveAs = argv[++i] || ''; continue; }
    if (arg === '--model') { opts.model = argv[++i] || ''; continue; }
  }
  return opts;
}

function spawnClaude(prompt, cwd) {
  return new Promise((res, rej) => {
    const args = ['--print', '--allowedTools', 'Write,Edit,Read,Bash(mkdir:*)', '--model', opts.model || 'claude-sonnet-4-6'];
    const child = spawn(CLAUDE_BIN, args, {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdout = '';
    child.stdout.on('data', (d) => {
      const chunk = d.toString();
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (d) => process.stderr.write(d));

    child.stdin.write(prompt);
    child.stdin.end();

    child.on('error', rej);
    child.on('close', (code) => res({ code, stdout }));
  });
}

const opts = parseArgs(process.argv.slice(2));

if (!opts.deck) {
  console.error('Error: --deck <name> is required.');
  process.exit(1);
}
if (!opts.pack) {
  console.error('Error: --pack <id> is required.');
  process.exit(1);
}

const deckDir = resolve(process.cwd(), 'decks', opts.deck);
if (!existsSync(deckDir)) {
  console.error(`Error: Deck not found: ${deckDir}`);
  process.exit(1);
}

const targetDeckName = opts.saveAs || opts.deck;
const targetDeckDir = resolve(process.cwd(), 'decks', targetDeckName);

console.log(`\n  Retheme: ${opts.deck} → ${opts.pack}`);
if (targetDeckName !== opts.deck) {
  console.log(`  Save as: ${targetDeckName}`);
}
console.log('  ─────────────────────────────────────\n');

try {
  // Back up existing slides before retheme (only when overwriting)
  if (targetDeckName === opts.deck) {
    console.log('[0/3] Backing up existing slides...');
    const backupPath = await backupDeck(deckDir);
    if (backupPath) {
      console.log(`      Backup saved: ${backupPath}`);
    }
  }

  console.log('[1/3] Preparing retheme data...');
  const { prompt, outline } = await prepareRetheme({
    deckDir,
    targetPackId: opts.pack,
  });

  // Create target dir if needed
  if (targetDeckName !== opts.deck) {
    await mkdir(targetDeckDir, { recursive: true });
  }

  // Save updated outline
  await writeFile(join(targetDeckDir, 'slide-outline.md'), outline, 'utf-8');
  console.log('[2/3] Generating slides with AI...\n');

  const result = await spawnClaude(prompt, process.cwd());

  if (result.code === 0) {
    console.log(`\n[3/3] Done! Deck "${targetDeckName}" has been redesigned with "${opts.pack}" pack.`);
  } else {
    console.error(`\n[Error] Claude exited with code ${result.code}.`);
    process.exit(1);
  }
} catch (err) {
  console.error(`[Error] ${err.message}`);
  process.exit(1);
}
