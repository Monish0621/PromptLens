/**
 * Recognition Merger
 *
 * Combines raw OCR text, layout analysis, text blocks, table structures, and
 * reading order into canonical OCRDocument representation.
 *
 * Pure additive compiler — NEVER mutates raw OCR text output.
 */
import type { OCRContext } from '../types/ocrTypes';
import type { LayoutAnalysis, OCRDocument, TableStructure, TextBlock } from './advancedTypes';

export function mergeToOCRDocument(
  ctx: OCRContext,
  layout: LayoutAnalysis,
  blocks: TextBlock[],
  tables: TableStructure[]
): OCRDocument {
  const metadata: Record<string, unknown> = {
    contentType:  ctx.contentType || 'unknown',
    imageWidth:   ctx.metadata?.width ?? 0,
    imageHeight:  ctx.metadata?.height ?? 0,
    wordCount:    ctx.wordData.length,
    charCount:    (ctx.processedText || ctx.rawText || '').length,
    confidence:   ctx.confidence || 0,
  };

  return {
    layout,
    blocks,
    tables,
    metadata,
  };
}
