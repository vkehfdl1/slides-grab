import { build, context } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const isWatch = process.argv.includes('--watch');

// Build code.ts (Figma sandbox)
const codeBuild = {
  entryPoints: ['src/code.ts'],
  outfile: 'dist/code.js',
  bundle: true,
  platform: 'neutral',
  target: 'es2020',
  format: 'iife',
};

// Build ui.ts and inline into ui.html
const uiBuild = {
  entryPoints: ['src/ui.ts'],
  outfile: 'dist/ui.bundle.js',
  bundle: true,
  platform: 'browser',
  target: 'es2020',
  format: 'iife',
};

async function buildUI() {
  await build(uiBuild);
  const html = await readFile('src/ui.html', 'utf-8');
  const js = await readFile('dist/ui.bundle.js', 'utf-8');
  const output = html.replace('/* __INLINE_SCRIPT__ */', js);
  await writeFile('dist/ui.html', output, 'utf-8');
  console.log('[build] dist/ui.html created');
}

if (isWatch) {
  const codeCtx = await context(codeBuild);
  const uiCtx = await context({
    ...uiBuild,
    plugins: [{
      name: 'rebuild-ui-html',
      setup(b) {
        b.onEnd(async () => {
          await buildUI().catch(console.error);
        });
      },
    }],
  });
  await codeCtx.watch();
  await uiCtx.watch();
  console.log('[watch] Watching for changes...');
} else {
  await build(codeBuild);
  await buildUI();
  console.log('[build] Done.');
}
