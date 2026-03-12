import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { inflateRawSync } from 'node:zlib';

test('slides-grab convert creates missing parent directories and preserves repo-standard deck size', () => {
  const root = mkdtempSync(join(tmpdir(), 'slides-grab-convert-cli-'));
  const slidesDir = join(root, 'slides');
  const outputPath = join(root, 'nested', 'exports', 'deck.pptx');

  try {
    mkdirSync(slidesDir, { recursive: true });
    writeFileSync(join(slidesDir, 'slide-01.html'), createTestSlideHtml(), 'utf-8');

    execFileSync(
      process.execPath,
      [
        'bin/ppt-agent.js',
        'convert',
        '--slides-dir',
        slidesDir,
        '--output',
        outputPath,
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
      },
    );

    assert.equal(existsSync(outputPath), true);

    const presentationXml = extractZipEntry(readFileSync(outputPath), 'ppt/presentation.xml').toString('utf-8');
    assert.match(presentationXml, /cx="9144000"/);
    assert.match(presentationXml, /cy="5143500"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function extractZipEntry(zipBuffer, entryName) {
  let offset = 0;

  while (offset + 30 <= zipBuffer.length) {
    const signature = zipBuffer.readUInt32LE(offset);
    if (signature !== 0x04034b50) {
      break;
    }

    const compressionMethod = zipBuffer.readUInt16LE(offset + 8);
    const compressedSize = zipBuffer.readUInt32LE(offset + 18);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 26);
    const extraFieldLength = zipBuffer.readUInt16LE(offset + 28);
    const fileNameStart = offset + 30;
    const fileNameEnd = fileNameStart + fileNameLength;
    const dataStart = fileNameEnd + extraFieldLength;
    const dataEnd = dataStart + compressedSize;
    const fileName = zipBuffer.subarray(fileNameStart, fileNameEnd).toString('utf-8');

    if (fileName === entryName) {
      const payload = zipBuffer.subarray(dataStart, dataEnd);
      if (compressionMethod === 0) return payload;
      if (compressionMethod === 8) return inflateRawSync(payload);
      throw new Error(`Unsupported ZIP compression method ${compressionMethod} for ${entryName}`);
    }

    offset = dataEnd;
  }

  throw new Error(`ZIP entry not found: ${entryName}`);
}

function createTestSlideHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { box-sizing: border-box; }
    body {
      width: 720pt;
      height: 405pt;
      margin: 0;
      padding: 36pt;
      font-family: Pretendard, sans-serif;
      background: #ffffff;
    }
    .frame {
      width: 100%;
      height: 100%;
      border: 1pt solid #222222;
      padding: 24pt;
    }
    h1 {
      margin: 0 0 12pt;
      font-size: 24pt;
      color: #111111;
    }
    p {
      margin: 0;
      font-size: 14pt;
      color: #444444;
    }
  </style>
</head>
<body>
  <div class="frame">
    <h1>Convert Export Proof</h1>
    <p>Repo-standard slide dimensions should be preserved.</p>
  </div>
</body>
</html>`;
}
