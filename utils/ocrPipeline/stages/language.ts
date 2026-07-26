/**
 * Stage 8 — LanguageStage (Upgraded for Milestone 2C.4 Language Intelligence)
 *
 * RESPONSIBILITY: Evaluate OCR text, detect script distribution (Latin, Devanagari,
 * Kannada, Tamil, Telugu, Arabic, CJK, Mixed), score language candidates, and build
 * structured LanguageRecommendation model.
 *
 * Position in Pipeline:
 *   AnalysisStage → PreprocessStage → RecognitionStage → PostProcessStage → QualityAnalysisStage → ProfileSelectionStage → RetryDecisionStage → ConfidenceStage → [LanguageStage] → CorrectionStage → StatisticsStage
 *
 * Reads:   ctx.processedText, ctx.rawText, ctx.correctedText, ctx.contentType
 * Writes:  ctx.language               (BCP-47 language tag or display name e.g. 'English')
 *          ctx.languageRecommendation (LanguageRecommendation model)
 *          ctx.languageCandidates     (LanguageCandidate[] list)
 *          ctx.script                 (ScriptDetection object)
 *          ctx.languageConfidence     (LanguageConfidence object)
 *          ctx.languageHistory        (appends LanguageSelectionHistory entry)
 *
 * Never throws — catches any unexpected error, logs warning, returns ctx with fallback.
 */
import type { OCRStage, OCRContext }    from '../types/ocrTypes';
import type { LanguageSelectionHistory } from '../language/languageTypes';
import { detectOCRTextLanguage }        from '../language/languageEngine';
import { ocrLog }                       from '../utils/ocrLogger';

export class LanguageStage implements OCRStage {
  readonly name = 'LanguageStage';

  async execute(ctx: OCRContext): Promise<OCRContext> {
    ocrLog.info('[Language] Running Language Intelligence...');

    try {
      const res = detectOCRTextLanguage(ctx);
      const rec = res.recommendation;

      ctx.language               = rec.selectedLanguage;
      ctx.languageRecommendation = rec;
      ctx.languageCandidates     = res.candidates;
      ctx.script                 = res.scriptDetection;
      ctx.languageConfidence     = res.confidence;

      const historyEntry: LanguageSelectionHistory = {
        selectedLanguage: rec.selectedLanguage,
        confidence:      rec.confidence,
        script:          res.scriptDetection.primaryScript,
        timestamp:       Date.now(),
      };

      ctx.languageHistory.push(historyEntry);

      // Formatted logging output as requested
      const scriptStr = `${res.scriptDetection.primaryScript} (${res.scriptDetection.confidence}%)`;

      ocrLog.info(`[Language] Script ............... ${scriptStr}`);
      ocrLog.info('[Language] Candidate Scores:');

      for (const cand of res.candidates.slice(0, 4)) {
        ocrLog.info(`[Language]   ${cand.language.displayName.padEnd(20, '.')} ${cand.score}`);
      }

      ocrLog.info(`[Language] Selected Language: ${rec.selectedLanguage}`);
      ocrLog.info(`[Language] Confidence: ${rec.confidence}%`);
      ocrLog.info(`[Language] Alternatives: ${rec.alternatives.join(', ')}`);
      ocrLog.info(`[Language] Detection Time: ${res.elapsedMs}ms`);

    } catch (err: any) {
      ocrLog.warn('[LanguageStage] Unexpected failure in language intelligence stage', err);
      ctx.warnings.push(`[LanguageStage] Detection failed: ${err?.message || String(err)}`);
      ctx.language = ctx.config.languageDetection.fallback || 'unknown';
    }

    return ctx;
  }
}
