/**
 * Stage 6 — ConfidenceStage
 *
 * RESPONSIBILITY: Set final pipeline confidence score.
 *
 * Position in Pipeline:
 *   AnalysisStage → PreprocessStage → RecognitionStage → PostProcessStage → QualityAnalysisStage → [ConfidenceStage] → LanguageStage → StatisticsStage
 *
 * Reads:   ctx.wordData, ctx.qualityReport, ctx.config.confidence
 * Writes:  ctx.confidence   (overall confidence score 0–100)
 *          ctx.warnings     (if confidence is below config.confidence.minAcceptable)
 */
import type { OCRStage, OCRContext } from '../types/ocrTypes';
import { ocrLog }                     from '../utils/ocrLogger';

export class ConfidenceStage implements OCRStage {
  readonly name = 'ConfidenceStage';

  async execute(ctx: OCRContext): Promise<OCRContext> {
    if (ctx.qualityReport) {
      // Use multi-factor overall confidence score calculated by QualityAnalysisStage
      ctx.confidence = ctx.qualityReport.overallScore;

      ocrLog.info(
        `[ConfidenceStage] Final overall confidence: ${ctx.confidence}` +
        ` (Engine: ${ctx.qualityReport.recognitionConfidence}, Quality: ${ctx.qualityReport.overallScore})`
      );
    } else {
      // Fallback: mean word confidence from raw engine output
      const words = ctx.wordData;
      if (words.length === 0) {
        ctx.confidence = 0;
        ctx.warnings.push('[ConfidenceStage] No word-level confidence data available.');
      } else {
        const sum  = words.reduce((acc, w) => acc + w.confidence, 0);
        ctx.confidence = parseFloat((sum / words.length).toFixed(1));
      }
    }

    if (ctx.confidence < ctx.config.confidence.minAcceptable) {
      ctx.warnings.push(
        `[ConfidenceStage] Confidence ${ctx.confidence} is below threshold ${ctx.config.confidence.minAcceptable}.`
      );
    }

    return ctx;
  }
}
