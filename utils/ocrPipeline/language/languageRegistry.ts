/**
 * Language Registry
 *
 * Data-driven registry managing supported OCRLanguage definitions.
 * LanguageEngine queries this registry — zero hardcoded language strings throughout the pipeline.
 */
import type { OCRLanguage } from './languageTypes';

export class LanguageRegistry {
  private languages: Map<string, OCRLanguage> = new Map();

  register(language: OCRLanguage): void {
    this.languages.set(language.languageCode.toLowerCase(), language);
  }

  get(code: string): OCRLanguage | undefined {
    return this.languages.get(code.toLowerCase());
  }

  getAll(): OCRLanguage[] {
    return Array.from(this.languages.values());
  }

  clear(): void {
    this.languages.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard Registered Languages
// ─────────────────────────────────────────────────────────────────────────────

export const ENGLISH_LANG: OCRLanguage = {
  languageCode: 'en',
  displayName: 'English',
  supportedScripts: ['Latin'],
  tesseractLanguageCode: 'eng',
  priority: 95,
  aliases: ['english', 'eng'],
};

export const HINDI_LANG: OCRLanguage = {
  languageCode: 'hi',
  displayName: 'Hindi',
  supportedScripts: ['Devanagari'],
  tesseractLanguageCode: 'hin',
  priority: 80,
  aliases: ['hindi', 'hin', 'devanagari'],
};

export const KANNADA_LANG: OCRLanguage = {
  languageCode: 'kn',
  displayName: 'Kannada',
  supportedScripts: ['Kannada'],
  tesseractLanguageCode: 'kan',
  priority: 80,
  aliases: ['kannada', 'kan'],
};

export const TAMIL_LANG: OCRLanguage = {
  languageCode: 'ta',
  displayName: 'Tamil',
  supportedScripts: ['Tamil'],
  tesseractLanguageCode: 'tam',
  priority: 80,
  aliases: ['tamil', 'tam'],
};

export const TELUGU_LANG: OCRLanguage = {
  languageCode: 'te',
  displayName: 'Telugu',
  supportedScripts: ['Telugu'],
  tesseractLanguageCode: 'tel',
  priority: 80,
  aliases: ['telugu', 'tel'],
};

export const JAPANESE_LANG: OCRLanguage = {
  languageCode: 'ja',
  displayName: 'Japanese',
  supportedScripts: ['CJK'],
  tesseractLanguageCode: 'jpn',
  priority: 75,
  aliases: ['japanese', 'jpn'],
};

export const CHINESE_LANG: OCRLanguage = {
  languageCode: 'zh',
  displayName: 'Chinese',
  supportedScripts: ['CJK'],
  tesseractLanguageCode: 'chi_sim',
  priority: 75,
  aliases: ['chinese', 'zh-cn', 'chi_sim'],
};

export const ARABIC_LANG: OCRLanguage = {
  languageCode: 'ar',
  displayName: 'Arabic',
  supportedScripts: ['Arabic'],
  tesseractLanguageCode: 'ara',
  priority: 75,
  aliases: ['arabic', 'ara'],
};

export const SPANISH_LANG: OCRLanguage = {
  languageCode: 'es',
  displayName: 'Spanish',
  supportedScripts: ['Latin'],
  tesseractLanguageCode: 'spa',
  priority: 70,
  aliases: ['spanish', 'spa'],
};

export const FRENCH_LANG: OCRLanguage = {
  languageCode: 'fr',
  displayName: 'French',
  supportedScripts: ['Latin'],
  tesseractLanguageCode: 'fra',
  priority: 70,
  aliases: ['french', 'fra'],
};

export const GERMAN_LANG: OCRLanguage = {
  languageCode: 'de',
  displayName: 'German',
  supportedScripts: ['Latin'],
  tesseractLanguageCode: 'deu',
  priority: 70,
  aliases: ['german', 'deu'],
};

// ── Default Global Registry Instance ────────────────────────────────────────
const defaultRegistry = new LanguageRegistry();
defaultRegistry.register(ENGLISH_LANG);
defaultRegistry.register(HINDI_LANG);
defaultRegistry.register(KANNADA_LANG);
defaultRegistry.register(TAMIL_LANG);
defaultRegistry.register(TELUGU_LANG);
defaultRegistry.register(JAPANESE_LANG);
defaultRegistry.register(CHINESE_LANG);
defaultRegistry.register(ARABIC_LANG);
defaultRegistry.register(SPANISH_LANG);
defaultRegistry.register(FRENCH_LANG);
defaultRegistry.register(GERMAN_LANG);

export { defaultRegistry as defaultLanguageRegistry };
