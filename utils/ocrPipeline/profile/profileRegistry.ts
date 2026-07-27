/**
 * OCR Profile Registry
 *
 * Stores and manages all registered OCRProfile definitions.
 * ProfileSelector queries this registry dynamically — zero hardcoded profile rules.
 */
import type { OCRProfile } from './profileTypes';

export class OCRProfileRegistry {
  private profiles: Map<string, OCRProfile> = new Map();

  register(profile: OCRProfile): void {
    this.profiles.set(profile.name, profile);
  }

  get(name: string): OCRProfile | undefined {
    return this.profiles.get(name);
  }

  getAll(): OCRProfile[] {
    return Array.from(this.profiles.values());
  }

  clear(): void {
    this.profiles.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard Registered Profiles
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_PROFILE: OCRProfile = {
  name: 'DEFAULT',
  description: 'Standard balanced OCR profile for general text captures',
  supportedContentTypes: ['prose', 'mixed', 'unknown', 'empty', 'code', 'markdown', 'json', 'html', 'yaml', 'terminal'],
  supportedImageConditions: ['normal'],
  priority: 10,
  configurationOverrides: {},
};

export const CODE_PROFILE: OCRProfile = {
  name: 'CODE',
  description: 'Optimized for source code snippets with monospaced font handling & PSM 6',
  supportedContentTypes: ['code', 'json', 'yaml', 'terminal'],
  supportedImageConditions: ['normal', 'code_snippet'],
  priority: 90,
  configurationOverrides: {
    preprocessing: {
      enableUpscaling: true,
      upscaleTargetDimension: 800,
      thresholdBlockSize: 15,
      thresholdC: 8,
      sharpen: true,
      sharpenAmount: 0.6,
    },
    engineOptions: { psm: 6, oem: 1, lang: 'eng' },
  },
};

export const DOCUMENT_PROFILE: OCRProfile = {
  name: 'DOCUMENT',
  description: 'Optimized for prose & document blocks with automatic page segmentation PSM 3',
  supportedContentTypes: ['prose', 'markdown', 'html'],
  supportedImageConditions: ['normal', 'document_page'],
  priority: 80,
  configurationOverrides: {
    preprocessing: {
      enableUpscaling: true,
      upscaleTargetDimension: 600,
      thresholdBlockSize: 25,
      thresholdC: 12,
      enableMedianFilter: true,
    },
    engineOptions: { psm: 3, oem: 1, lang: 'eng' },
  },
};

export const LOW_RESOLUTION_PROFILE: OCRProfile = {
  name: 'LOW_RESOLUTION',
  description: 'High-ratio upscaling & sharpening for small or low-DPI cropped regions',
  supportedContentTypes: ['code', 'prose', 'markdown', 'json', 'html', 'yaml', 'terminal', 'mixed', 'unknown'],
  supportedImageConditions: ['low_resolution', 'small_crop'],
  priority: 75,
  configurationOverrides: {
    preprocessing: {
      enableUpscaling: true,
      upscaleTargetDimension: 1200,
      maxUpscaleScale: 3.5,
      sharpen: true,
      sharpenAmount: 0.85,
    },
    engineOptions: { psm: 6, oem: 1, lang: 'eng' },
  },
};

export const HIGH_CONTRAST_PROFILE: OCRProfile = {
  name: 'HIGH_CONTRAST',
  description: 'Percentile histogram stretching for low-contrast text/background blending',
  supportedContentTypes: ['code', 'prose', 'markdown', 'json', 'html', 'yaml', 'terminal', 'mixed', 'unknown'],
  supportedImageConditions: ['low_contrast', 'faded_text'],
  priority: 75,
  configurationOverrides: {
    preprocessing: {
      enableContrast: true,
      contrastLowPercentile: 5,
      contrastHighPercentile: 95,
      thresholdC: 16,
    },
    engineOptions: { psm: 6, oem: 1, lang: 'eng' },
  },
};

export const TERMINAL_PROFILE: OCRProfile = {
  name: 'TERMINAL',
  description: 'Tuned for dark-mode command prompt & CLI terminal logs',
  supportedContentTypes: ['terminal'],
  supportedImageConditions: ['dark_mode', 'monospaced'],
  priority: 85,
  configurationOverrides: {
    preprocessing: {
      enableUpscaling: true,
      upscaleTargetDimension: 850,
      thresholdBlockSize: 17,
      thresholdC: 10,
    },
    engineOptions: { psm: 6, oem: 1, lang: 'eng' },
  },
};

export const MARKDOWN_PROFILE: OCRProfile = {
  name: 'MARKDOWN',
  description: 'Preserves markdown headers, code block fences, and list structure',
  supportedContentTypes: ['markdown'],
  supportedImageConditions: ['formatted_text'],
  priority: 85,
  configurationOverrides: {
    preprocessing: {
      enableUpscaling: true,
      upscaleTargetDimension: 700,
      thresholdBlockSize: 21,
      thresholdC: 10,
    },
    engineOptions: { psm: 3, oem: 1, lang: 'eng' },
  },
};

export const JSON_PROFILE: OCRProfile = {
  name: 'JSON',
  description: 'Strict brace and key-value punctuation preservation for JSON payloads',
  supportedContentTypes: ['json'],
  supportedImageConditions: ['structured_data'],
  priority: 90,
  configurationOverrides: {
    preprocessing: {
      enableUpscaling: true,
      upscaleTargetDimension: 850,
      thresholdBlockSize: 15,
      thresholdC: 7,
    },
    engineOptions: { psm: 6, oem: 1, lang: 'eng' },
  },
};

export const HTML_PROFILE: OCRProfile = {
  name: 'HTML',
  description: 'Preserves HTML/XML angle bracket tags and attribute markup',
  supportedContentTypes: ['html'],
  supportedImageConditions: ['web_markup'],
  priority: 85,
  configurationOverrides: {
    preprocessing: {
      enableUpscaling: true,
      upscaleTargetDimension: 750,
      thresholdBlockSize: 19,
      thresholdC: 9,
    },
    engineOptions: { psm: 6, oem: 1, lang: 'eng' },
  },
};

export const YAML_PROFILE: OCRProfile = {
  name: 'YAML',
  description: 'Indentation-sensitive profile for YAML config files',
  supportedContentTypes: ['yaml'],
  supportedImageConditions: ['indented_text'],
  priority: 85,
  configurationOverrides: {
    preprocessing: {
      enableUpscaling: true,
      upscaleTargetDimension: 800,
      thresholdBlockSize: 19,
      thresholdC: 9,
    },
    engineOptions: { psm: 6, oem: 1, lang: 'eng' },
  },
};

// ── Default Global Profile Registry Instance ────────────────────────────────
const defaultRegistry = new OCRProfileRegistry();
defaultRegistry.register(DEFAULT_PROFILE);
defaultRegistry.register(CODE_PROFILE);
defaultRegistry.register(DOCUMENT_PROFILE);
defaultRegistry.register(LOW_RESOLUTION_PROFILE);
defaultRegistry.register(HIGH_CONTRAST_PROFILE);
defaultRegistry.register(TERMINAL_PROFILE);
defaultRegistry.register(MARKDOWN_PROFILE);
defaultRegistry.register(JSON_PROFILE);
defaultRegistry.register(HTML_PROFILE);
defaultRegistry.register(YAML_PROFILE);

export { defaultRegistry as defaultOCRProfileRegistry };
