/**
 * Stage 4 — AdvancedRecognitionStage
 *
 * RESPONSIBILITY: Perform structured layout analysis, text block segmentation,
 * reading order resolution, table detection, and canonical OCRDocument compilation.
 *
 * Position in Pipeline:
 *   AnalysisStage → PreprocessStage → RecognitionStage → [AdvancedRecognitionStage] → PostProcessStage → QualityAnalysisStage → ProfileSelectionStage → RetryDecisionStage → ConfidenceStage → LanguageStage → CorrectionStage → StatisticsStage
 *
 * Reads:   ctx.rawText, ctx.wordData, ctx.metadata, ctx.contentType
 * Writes:  ctx.ocrDocument         (canonical OCRDocument model)
 *          ctx.layoutAnalysis      (LayoutAnalysis object)
 *          ctx.textBlocks          (TextBlock[] array)
 *          ctx.detectedTables      (TableStructure[] array)
 *          ctx.readingOrder        (string[] block ID array)
 *          ctx.advancedStatistics  (AdvancedOCRStatistics object)
 *
 * Additive only — NEVER mutates raw OCR text output.
 * Never throws — catches any unexpected error, logs warning, returns ctx.
 */
import type { OCRStage, OCRContext }  from '../types/ocrTypes';
import { processAdvancedRecognition } from '../advanced/advancedRecognitionEngine';
import { ocrLog }                     from '../utils/ocrLogger';

export class AdvancedRecognitionStage implements OCRStage {
  readonly name = 'AdvancedRecognitionStage';

  async execute(ctx: OCRContext): Promise<OCRContext> {
    ocrLog.info('[AdvancedOCR] Running Advanced Recognition...');

    try {
      const res = processAdvancedRecognition(ctx);
      const doc = res.ocrDocument;
      const stats = res.advancedStatistics;

      ctx.ocrDocument        = doc;
      ctx.layoutAnalysis     = doc.layout;
      ctx.textBlocks         = doc.blocks;
      ctx.detectedTables     = doc.tables;
      ctx.readingOrder       = doc.layout.readingOrder;
      ctx.advancedStatistics = stats;

      // Capitalize layout name for clean logging display
      const layoutLabel = stats.layoutType.charAt(0).toUpperCase() + stats.layoutType.slice(1).replace('_', '');

      ocrLog.info(`[AdvancedOCR] Layout ............... ${layoutLabel}`);
      ocrLog.info(`[AdvancedOCR] Confidence ........... ${stats.layoutConfidence}%`);
      ocrLog.info(`[AdvancedOCR] Blocks ............... ${stats.blockCount}`);
      ocrLog.info(`[AdvancedOCR] Tables ............... ${stats.tableCount}`);
      ocrLog.info(`[AdvancedOCR] Reading Order ........ TopDown`);
      ocrLog.info(`[AdvancedOCR] Regions .............. ${stats.regionCount}`);
      ocrLog.info(`[AdvancedOCR] Processing Time ...... ${res.elapsedMs}ms`);

    } catch (err: any) {
      ocrLog.warn('[AdvancedRecognitionStage] Unexpected failure in advanced recognition stage', err);
      ctx.warnings.push(`[AdvancedRecognitionStage] Processing failed: ${err?.message || String(err)}`);
    }

    return ctx;
  }
}
