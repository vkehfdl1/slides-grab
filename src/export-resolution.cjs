const RESOLUTION_PRESETS = Object.freeze({
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '1440p': { width: 2560, height: 1440 },
  '2160p': { width: 3840, height: 2160 },
});

const RESOLUTION_ALIASES = Object.freeze({
  '4k': '2160p',
  uhd: '2160p',
});

function getResolutionChoices() {
  return Object.keys(RESOLUTION_PRESETS);
}

function normalizeResolutionPreset(value, options = {}) {
  const { allowEmpty = true } = options;

  if (typeof value !== 'string') {
    if (allowEmpty) {
      return '';
    }
    throw new Error(`--resolution must be one of: ${getResolutionChoices().join(', ')}, 4k`);
  }

  const trimmed = value.trim().toLowerCase();
  if (trimmed === '') {
    if (allowEmpty) {
      return '';
    }
    throw new Error(`--resolution must be one of: ${getResolutionChoices().join(', ')}, 4k`);
  }

  const normalized = RESOLUTION_ALIASES[trimmed] || trimmed;
  if (!RESOLUTION_PRESETS[normalized]) {
    throw new Error(`Unknown resolution "${value}". Expected one of: ${getResolutionChoices().join(', ')}, 4k`);
  }

  return normalized;
}

function getResolutionSize(value) {
  const normalized = normalizeResolutionPreset(value);
  if (!normalized) {
    return null;
  }

  const preset = RESOLUTION_PRESETS[normalized];
  return { width: preset.width, height: preset.height };
}

module.exports = {
  RESOLUTION_PRESETS,
  getResolutionChoices,
  getResolutionSize,
  normalizeResolutionPreset,
};
