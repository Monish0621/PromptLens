/**
 * Stage 5 — QualityAnalysisStage (Refinements v2.1)
 *
 * RESPONSIBILITY: Evaluate OCR quality, analyze layout/characters/content,
 * compute overall confidence score breakdown, generate warnings and priority recommendations.
 *
 * Position in Pipeline:
 *   AnalysisStage → PreprocessStage → RecognitionStage → PostProcessStage → [QualityAnalysisStage] → ConfidenceStage → LanguageStage → StatisticsStage
 *
 * Reads:   ctx.processedText, ctx.rawText, ctx.confidence, ctx.preprocessMetadata
 * Writes:  ctx.qualityReport          (full OCRQualityReport v2.1)
 *          ctx.contentType            (detected content type classification)
 *          ctx.contentDetection       (ContentDetection model)
 *          ctx.confidenceBreakdown    (ConfidenceBreakdown object)
 *          ctx.qualityPipelineVersion ('2.1')
 *          ctx.recommendations        (priority-ranked QualityRecommendation[])
 *          ctx.warnings               (appends critical/high quality warnings)
 *
 * Never throws — catches any unexpected internal error and logs a warning.
 * Never modifies OCR text.
 */
import type { OCRStage, OCRContext } from '../types/ocrTypes';
import { analyzeOCRQuality }          from '../quality/qualityEngine';
import { ocrLog }                     from '../utils/ocrLogger';

export class QualityAnalysisStage implements OCRStage {
  readonly name = 'QualityAnalysisStage';

  async execute(ctx: OCRContext): Promise<OCRContext> {
    ocrLog.info('[QualityAnalysisStage] Starting OCR Quality Analysis (v2.1)...');

    try {
      const report = analyzeOCRQuality(ctx);

      ctx.qualityReport          = report;
      ctx.contentType            = report.contentType;
      ctx.contentDetection       = report.contentDetection;
      ctx.confidenceBreakdown    = report.confidenceBreakdown;
      ctx.qualityPipelineVersion = report.qualityPipelineVersion;
      ctx.recommendations        = report.recommendations;

      // Append high/critical quality warnings to ctx.warnings
      for (const w of report.warnings) {
        if (w.severity === 'high' || w.severity === 'critical') {
          ctx.warnings.push(`[QualityAnalysis] [${w.severity.toUpperCase()}] ${w.type}: ${w.message}`);
        }
      }

      // Column-aligned log output for debugging
      const bd = report.confidenceBreakdown;
      const cd = report.contentDetection;

      ocrLog.info(`[QualityAnalysis] ── Quality Score Breakdown (v${report.qualityPipelineVersion}) ───────────`);
      ocrLog.info(`[QualityAnalysis]   Engine Contribution .... +${bd.engineContribution}`);
      ocrLog.info(`[QualityAnalysis]   Image Contribution ..... +${bd.imageContribution}`);
      ocrLog.info(`[QualityAnalysis]   Character Contribution . +${bd.characterContribution}`);
      ocrLog.info(`[QualityAnalysis]   Structure Contribution . +${bd.structureContribution}`);
      ocrLog.info(`[QualityAnalysis]   Content Contribution ... +${bd.contentContribution}`);
      ocrLog.info(`[QualityAnalysis]   Penalties .............. -${bd.penalties}`);
      ocrLog.info(`[QualityAnalysis] ─────────────────────────────────────────────`);
      ocrLog.info(`[QualityAnalysis]   Final Confidence ....... ${bd.finalScore}/100`);
      ocrLog.info(`[QualityAnalysis]   Content Detection ...... ${cd.type.toUpperCase()} (${cd.confidence}% confidence)`);

      if (cd.evidence.length > 0) {
        ocrLog.info(`[QualityAnalysis]   Evidence ............... [${cd.evidence.join(', ')}]`);
      }

      ocrLog.info('[QualityAnalysis] Recommendations:');
      for (const rec of report.recommendations) {
        ocrLog.info(`[QualityAnalysis]   • ${rec.type.padEnd(20)} (P${rec.priority}) - ${rec.reason}`);
      }

    } catch (err: any) {
      ocrLog.warn('[QualityAnalysisStage] Unexpected failure during quality analysis', err);
      ctx.warnings.push(`[QualityAnalysisStage] Analysis failed: ${err?.message || String(err)}`);
    }

    return ctx;
  }
}
