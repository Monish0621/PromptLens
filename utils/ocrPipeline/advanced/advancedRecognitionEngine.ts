/**
 * Advanced Recognition Engine
 *
 * Main orchestrator for the Advanced OCR Framework.
 * Coordinates RegionAnalyzer, LayoutAnalyzer, TextBlockAnalyzer,
 * TableAnalyzer, ReadingOrderResolver, and RecognitionMerger to produce
 * a canonical OCRDocument and AdvancedOCRStatistics.
 *
 * Performance target: < 5ms. Guaranteed fault-tolerant.
 */
import type { OCRContext } from '../types/ocrTypes';
import type { AdvancedOCRStatistics, OCRDocument } from './advancedTypes';
import { analyzeBoundingRegions }                  from './regionAnalyzer';
import { analyzeLayout }                           from './layoutAnalyzer';
import { analyzeTextBlocks }                       from './textBlockAnalyzer';
import { analyzeTables }                           from './tableAnalyzer';
import { resolveReadingOrder }                     from './readingOrderResolver';
import { mergeToOCRDocument }                      from './recognitionMerger';
import { ocrLog }                                  from '../utils/ocrLogger';

export interface AdvancedRecognitionResult {
  ocrDocument:        OCRDocument;
  advancedStatistics: AdvancedOCRStatistics;
  elapsedMs:          number;
}

export function processAdvancedRecognition(ctx: OCRContext): AdvancedRecognitionResult {
  const t0 = performance.now();

  try {
    const rawText = ctx.processedText || ctx.rawText || '';

    // 1. Spatial Region Analysis
    const regions = analyzeBoundingRegions(ctx);

    // 2. Layout Analysis
    const layout = analyzeLayout(ctx, regions);

    // 3. Text Block Segmentation
    const blocks = analyzeTextBlocks(ctx, regions);

    // 4. Table Structure Detection
    const tables = analyzeTables(rawText);

    // 5. Reading Order Resolution
    const roResult = resolveReadingOrder(blocks);
    layout.readingOrder = roResult.readingOrder;

    // 6. Merge into Canonical OCRDocument
    const ocrDocument = mergeToOCRDocument(ctx, layout, blocks, tables);

    const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));

    const advancedStatistics: AdvancedOCRStatistics = {
      regionCount:            regions.length,
      blockCount:             blocks.length,
      tableCount:             tables.length,
      layoutType:             layout.layoutType,
      layoutConfidence:       layout.confidence,
      processingTimeMs:       elapsedMs,
      readingOrderConfidence: roResult.confidence,
    };

    return {
      ocrDocument,
      advancedStatistics,
      elapsedMs,
    };

  } catch (err: any) {
    const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));
    ocrLog.warn('[AdvancedRecognitionEngine] Unexpected failure — fallback to empty OCRDocument', err);

    const fallbackLayout = { layoutType: 'unknown' as const, confidence: 50, regions: [], readingOrder: [] };
    const fallbackDoc: OCRDocument = {
      layout: fallbackLayout,
      blocks: [],
      tables: [],
      metadata: { error: err?.message || String(err) },
    };

    return {
      ocrDocument: fallbackDoc,
      advancedStatistics: {
        regionCount: 0,
        blockCount: 0,
        tableCount: 0,
        layoutType: 'unknown',
        layoutConfidence: 50,
        processingTimeMs: elapsedMs,
        readingOrderConfidence: 50,
      },
      elapsedMs,
    };
  }
}
