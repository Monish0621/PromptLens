/**
 * Layout Analyzer
 *
 * Classifies document layout type ('code', 'terminal', 'table', 'document',
 * 'multi_column', 'single_column') and layout confidence using geometric and structural signals.
 *
 * Performance target: < 0.5ms. Pure metadata analysis.
 */
import type { OCRContext } from '../types/ocrTypes';
import type { BoundingBox, LayoutAnalysis, LayoutType } from './advancedTypes';

export function analyzeLayout(ctx: OCRContext, regions: BoundingBox[]): LayoutAnalysis {
  const contentType = ctx.contentType || 'unknown';

  let layoutType: LayoutType = 'document';
  let confidence = 85;

  if (contentType === 'code' || contentType === 'json' || contentType === 'yaml') {
    layoutType = 'code';
    confidence = 95;
  } else if (contentType === 'terminal') {
    layoutType = 'terminal';
    confidence = 92;
  } else {
    // Spatial column analysis: Check if regions overlap horizontally in 2 distinct columns
    const imgWidth = ctx.metadata?.width ?? 1000;
    const midX = imgWidth / 2;

    const leftRegions  = regions.filter(r => (r.x + r.width / 2) < midX).length;
    const rightRegions = regions.filter(r => (r.x + r.width / 2) >= midX).length;

    if (leftRegions > 3 && rightRegions > 3 && Math.abs(leftRegions - rightRegions) < leftRegions * 0.6) {
      layoutType = 'multi_column';
      confidence = 88;
    } else {
      layoutType = 'single_column';
      confidence = 90;
    }
  }

  const readingOrder = regions.map((_, idx) => `block_${idx + 1}`);

  return {
    layoutType,
    confidence,
    regions,
    readingOrder,
  };
}
