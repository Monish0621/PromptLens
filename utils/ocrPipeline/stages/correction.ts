/**
 * Stage 7 — CorrectionStage  [STUB — Milestone 2D]
 *
 * RESPONSIBILITY: Apply post-recognition text correction.
 *
 * Reads:   ctx.processedText, ctx.config.correction
 * Writes:  ctx.correctedText  (corrected text, or processedText unchanged)
 *
 * Today: pass-through. Sets ctx.correctedText = ctx.processedText.
 * Correction is disabled in config by default.
 *
 * Milestone 2D will implement:
 *   • 'ast'  strategy: parse code AST and fix bracket/indentation errors
 *   • 'llm'  strategy: route low-confidence regions to an LLM for correction
 */
import type { OCRStage, OCRContext } from '../types/ocrTypes';
import { ocrLog } from '../utils/ocrLogger';

export class CorrectionStage implements OCRStage {
  readonly name = 'CorrectionStage';

  async execute(ctx: OCRContext): Promise<OCRContext> {
    if (!ctx.config.correction.enabled) {
      ctx.correctedText = ctx.processedText;
      ocrLog.debug('[CorrectionStage] Correction disabled. Pass-through.');
      return ctx;
    }

    // Milestone 2D: implement correction strategies here.
    ctx.correctedText = ctx.processedText;
    ctx.warnings.push(
      `[CorrectionStage] Correction strategy "${ctx.config.correction.strategy}" ` +
      `enabled in config but not yet implemented. Milestone 2D will implement this.`
    );
    ocrLog.warn(
      `[CorrectionStage] Stub — strategy "${ctx.config.correction.strategy}" not implemented. Pass-through.`
    );

    return ctx;
  }
}
