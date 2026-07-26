/**
 * Region Analyzer
 *
 * Divides OCR word data & text line structures into spatial BoundingBox regions.
 *
 * Performance target: < 0.5ms. Pure geometric bounding box calculation.
 */
import type { OCRContext, WordData } from '../types/ocrTypes';
import type { BoundingBox }          from './advancedTypes';

export function analyzeBoundingRegions(ctx: OCRContext): BoundingBox[] {
  const words: WordData[] = ctx.wordData || [];

  if (words.length === 0) {
    const w = ctx.metadata?.width ?? 800;
    const h = ctx.metadata?.height ?? 600;
    return [{ x: 0, y: 0, width: w, height: h }];
  }

  // Group words into lines based on vertical overlap (bbox.y)
  const lineGroups: WordData[][] = [];
  const sortedWords = [...words].sort((a, b) => (a.bbox?.y0 ?? 0) - (b.bbox?.y0 ?? 0));

  for (const word of sortedWords) {
    if (!word.bbox) continue;
    const wordY = word.bbox.y0;

    let placed = false;
    for (const group of lineGroups) {
      const avgY = group.reduce((acc, w) => acc + (w.bbox?.y0 ?? 0), 0) / group.length;
      if (Math.abs(wordY - avgY) < 12) {
        group.push(word);
        placed = true;
        break;
      }
    }

    if (!placed) {
      lineGroups.push([word]);
    }
  }

  // Convert line groups into BoundingBox regions
  const regions: BoundingBox[] = [];

  for (const group of lineGroups) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const w of group) {
      if (!w.bbox) continue;
      if (w.bbox.x0 < minX) minX = w.bbox.x0;
      if (w.bbox.y0 < minY) minY = w.bbox.y0;
      if (w.bbox.x1 > maxX) maxX = w.bbox.x1;
      if (w.bbox.y1 > maxY) maxY = w.bbox.y1;
    }

    if (minX !== Infinity) {
      regions.push({
        x: Math.round(minX),
        y: Math.round(minY),
        width: Math.max(1, Math.round(maxX - minX)),
        height: Math.max(1, Math.round(maxY - minY)),
      });
    }
  }

  if (regions.length === 0) {
    const w = ctx.metadata?.width ?? 800;
    const h = ctx.metadata?.height ?? 600;
    return [{ x: 0, y: 0, width: w, height: h }];
  }

  return regions;
}
