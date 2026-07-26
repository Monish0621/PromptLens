/**
 * Language Intelligence Engine
 *
 * Orchestrates ScriptDetector, LanguageRegistry, and LanguageAnalyzerRegistry to
 * determine natural language candidates, script distribution, selection confidence,
 * and structured LanguageRecommendation model.
 *
 * Performance target: < 3ms. Guaranteed fault-tolerant.
 */
import type { OCRContext } from '../types/ocrTypes';
import {
  type LanguageCandidate,
  type LanguageConfidence,
  type LanguageRecommendation,
  type ScriptDetection,
  LANGUAGE_ENGINE_VERSION,
} from './languageTypes';
import { defaultLanguageRegistry, ENGLISH_LANG } from './languageRegistry';
import { detectScript }                          from './scriptDetector';
import { defaultLanguageAnalyzerRegistry }       from './languageAnalyzers';
import { ocrLog }                                from '../utils/ocrLogger';

export interface LanguageDetectionResult {
  recommendation:    LanguageRecommendation;
  confidence:        LanguageConfidence;
  scriptDetection:   ScriptDetection;
  selectedCandidate: LanguageCandidate;
  candidates:        LanguageCandidate[];
  elapsedMs:         number;
}

export function detectOCRTextLanguage(ctx: OCRContext): LanguageDetectionResult {
  const t0 = performance.now();

  try {
    const text = ctx.correctedText || ctx.processedText || ctx.rawText || '';

    // 1. Run Script Detection
    const scriptDet = detectScript(text);

    // 2. Score Language Candidates
    const languages  = defaultLanguageRegistry.getAll();
    const candidates = languages.map(lang =>
      defaultLanguageAnalyzerRegistry.evaluateCandidate(lang, text, ctx, scriptDet)
    );

    // Sort candidates by score descending
    candidates.sort((a, b) => b.score - a.score);

    const winner = candidates[0];
    const alts   = candidates.slice(1, 4).map(c => c.language.displayName);

    // Calculate Ambiguity and Confidence
    const runnerUpScore = candidates[1]?.score ?? 40;
    const margin        = winner.score - runnerUpScore;
    const ambiguity     = Math.max(0, Math.min(100, 100 - Math.round(margin * 2)));

    const langConfidence: LanguageConfidence = {
      overall:            winner.confidence,
      scriptConfidence:   scriptDet.confidence,
      languageConfidence: winner.confidence,
      ambiguity,
    };

    const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));

    const recommendation: LanguageRecommendation = {
      selectedLanguage: winner.language.displayName,
      confidence:       winner.confidence,
      script:           scriptDet.primaryScript,
      alternatives:     alts,
      reason:           winner.reason || `Selected language ${winner.language.displayName} (${winner.score}/100)`,
      engineVersion:    LANGUAGE_ENGINE_VERSION,
    };

    return {
      recommendation,
      confidence: langConfidence,
      scriptDetection: scriptDet,
      selectedCandidate: winner,
      candidates,
      elapsedMs,
    };

  } catch (err: any) {
    const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));
    ocrLog.warn('[LanguageEngine] Unexpected error in language engine — fallback to English', err);

    const fallbackCandidate: LanguageCandidate = {
      language:   ENGLISH_LANG,
      score:      50,
      confidence: 50,
      script:     'Latin',
      reason:     `Fallback on error: ${err?.message || String(err)}`,
    };

    return {
      recommendation: {
        selectedLanguage: 'English',
        confidence:       50,
        script:           'Latin',
        alternatives:     ['Unknown'],
        reason:           'Fallback on error',
        engineVersion:    LANGUAGE_ENGINE_VERSION,
      },
      confidence: {
        overall: 50,
        scriptConfidence: 50,
        languageConfidence: 50,
        ambiguity: 50,
      },
      scriptDetection: {
        primaryScript: 'Latin',
        confidence: 50,
        scriptDistribution: { Latin: 100 } as any,
      },
      selectedCandidate: fallbackCandidate,
      candidates:        [fallbackCandidate],
      elapsedMs,
    };
  }
}
