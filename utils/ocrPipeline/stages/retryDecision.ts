/**
 * Stage 6 — RetryDecisionStage
 *
 * RESPONSIBILITY: Orchestrate Intelligent OCR Retries using metadata & quality analysis.
 *
 * Position in Pipeline:
 *   AnalysisStage → PreprocessStage → RecognitionStage → PostProcessStage → QualityAnalysisStage → [RetryDecisionStage] → ConfidenceStage → LanguageStage → CorrectionStage → StatisticsStage
 *
 * Reads:   ctx.qualityReport, ctx.recommendations, ctx.contentType
 * Writes:  ctx.retryDecision, ctx.retryHistory, ctx.bestRetry, ctx.selectedRetryProfile
 *          (and updates winning text/confidence if retry improved results)
 *
 * Never throws — catches any error, logs warning, returns ctx.
 */
import type { OCRStage, OCRContext, OCREngine } from '../types/ocrTypes';
import { runRetryEngine }            from '../retry/retryEngine';
import { ocrLog }                    from '../utils/ocrLogger';

export class RetryDecisionStage implements OCRStage {
  readonly name = 'RetryDecisionStage';

  private engine: OCREngine;

  constructor(engine: OCREngine) {
    this.engine = engine;
  }

  async execute(ctx: OCRContext): Promise<OCRContext> {
    ocrLog.info('[RetryDecisionStage] Starting Retry Decision evaluation...');

    try {
      ctx = await runRetryEngine(ctx, this.engine);
    } catch (err: any) {
      ocrLog.warn('[RetryDecisionStage] Unexpected failure during retry execution', err);
      ctx.warnings.push(`[RetryDecisionStage] Retry evaluation failed: ${err?.message || String(err)}`);
    }

    return ctx;
  }
}
