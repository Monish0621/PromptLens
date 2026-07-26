/**
 * Language Intelligence Engine — Core Types
 *
 * Single source of truth for OCRLanguage, ScriptDetection, LanguageCandidate,
 * LanguageConfidence, LanguageRecommendation, and LanguageSelectionHistory.
 *
 * Engine Version: 1.0
 */

export const LANGUAGE_ENGINE_VERSION = '1.0';

export type ScriptType =
  | 'Latin'
  | 'Devanagari'
  | 'Kannada'
  | 'Tamil'
  | 'Telugu'
  | 'Arabic'
  | 'CJK'
  | 'Mixed'
  | 'Unknown';

export interface ScriptDetection {
  primaryScript:      ScriptType;
  confidence:         number;
  scriptDistribution: Record<ScriptType, number>;
}

export interface OCRLanguage {
  languageCode:          string; // BCP-47 (e.g. 'en', 'hi', 'kn', 'ta', 'te', 'ja', 'zh', 'ar', 'es', 'fr', 'de')
  displayName:           string;
  supportedScripts:      ScriptType[];
  tesseractLanguageCode: string; // e.g. 'eng', 'hin', 'kan', 'tam', 'tel', 'jpn', 'chi_sim', 'ara', 'spa', 'fra', 'deu'
  priority:              number;
  aliases:               string[];
}

export interface LanguageCandidate {
  language:   OCRLanguage;
  score:      number;
  confidence: number;
  script:     ScriptType;
  reason:     string;
}

export interface LanguageConfidence {
  overall:            number;
  scriptConfidence:   number;
  languageConfidence: number;
  ambiguity:          number;
}

export interface LanguageRecommendation {
  selectedLanguage: string;
  confidence:       number;
  script:           ScriptType;
  alternatives:     string[];
  reason:           string;
  engineVersion:    string;
}

export interface LanguageSelectionHistory {
  selectedLanguage: string;
  confidence:       number;
  script:           ScriptType;
  timestamp:        number;
}
