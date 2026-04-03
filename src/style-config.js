import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { DESIGN_STYLES_SOURCE, getDesignStyle, requireDesignStyle } from './design-styles.js';

export const STYLE_CONFIG_FILE = 'style-config.json';

export function getStyleConfigPath(cwd = process.cwd()) {
  return resolve(cwd, STYLE_CONFIG_FILE);
}

export async function readSelectedStyleConfig(cwd = process.cwd(), options = {}) {
  try {
    const { allowInvalidSelection = false } = options;
    const configPath = getStyleConfigPath(cwd);
    const rawText = await readFile(configPath, 'utf-8');
    const parsed = JSON.parse(rawText);
    const selectedStyleId = parsed.selectedStyleId ?? parsed.style?.id ?? null;
    const style = selectedStyleId ? getDesignStyle(selectedStyleId) : null;

    if (selectedStyleId && !style && !allowInvalidSelection) {
      requireDesignStyle(selectedStyleId);
    }

    return {
      ...parsed,
      path: configPath,
      selectedStyleId,
      style,
      invalidSelectedStyleId: selectedStyleId && !style ? selectedStyleId : null,
    };
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeSelectedStyleConfig({ cwd = process.cwd(), style }) {
  const selectedStyle = typeof style === 'string' ? requireDesignStyle(style) : requireDesignStyle(style?.id);
  const configPath = getStyleConfigPath(cwd);
  const config = {
    selectedStyleId: selectedStyle.id,
    updatedAt: new Date().toISOString(),
    source: DESIGN_STYLES_SOURCE,
    style: selectedStyle,
  };

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

  return {
    ...config,
    path: configPath,
  };
}
