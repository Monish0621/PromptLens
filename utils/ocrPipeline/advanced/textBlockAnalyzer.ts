/**
 * Text Block Analyzer
 *
 * Segments text into structured TextBlock[] with id, type ('paragraph' | 'heading' | 'code' | 'terminal' | 'table' | 'quote' | 'inline' | 'unknown'),
 * bounding region, line count, and confidence scores.
 *
 * Performance target: < 1ms.
 */
import type { OCRContext }                      from '../types/ocrTypes';
import type { BoundingBox, TextBlock, TextBlockType } from './advancedTypes';

export function analyzeTextBlocks(ctx: OCRContext, regions: BoundingBox[]): TextBlock[] {
  const text = ctx.processedText || ctx.rawText || '';

  if (!text || text.trim().length === 0) {
    return [];
  }

  const lines = text.split('\n');
  const blocks: TextBlock[] = [];
  let currentLines: string[] = [];
  let currentType: TextBlockType = 'paragraph';

  const flushBlock = (regionIdx: number) => {
    if (currentLines.length === 0) return;

    const blockContent = currentLines.join('\n');
    const bbox: BoundingBox = regions[regionIdx % Math.max(1, regions.length)] || {
      x: 0,
      y: regionIdx * 30,
      width: 600,
      height: currentLines.length * 20,
    };

    blocks.push({
      id:             `block_${blocks.length + 1}`,
      type:           currentType,
      boundingRegion: bbox,
      lineCount:      currentLines.length,
      confidence:     Math.round(ctx.confidence || 85),
      content:        blockContent,
      lines:          [...currentLines],
    });

    currentLines = [];
  };

  const contentType = ctx.contentType || 'unknown';

  if (contentType === 'code' || contentType === 'json' || contentType === 'yaml') {
    // Treat code snippets as a code block
    currentType = 'code';
    currentLines = lines;
    flushBlock(0);
    return blocks;
  }

  if (contentType === 'terminal') {
    currentType = 'terminal';
    currentLines = lines;
    flushBlock(0);
    return blocks;
  }

  // Parse multi-block markdown / document structures
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().length === 0) {
      flushBlock(blocks.length);
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      flushBlock(blocks.length);
      currentType = 'heading';
      currentLines.push(line);
      flushBlock(blocks.length);
      currentType = 'paragraph';
      continue;
    }

    if (/^```/.test(line)) {
      flushBlock(blocks.length);
      currentType = 'code';
      currentLines.push(line);
      continue;
    }

    if (/^\s*>\s+/.test(line)) {
      if (currentType !== 'quote') {
        flushBlock(blocks.length);
        currentType = 'quote';
      }
      currentLines.push(line);
      continue;
    }

    currentLines.push(line);
  }

  flushBlock(blocks.length);

  return blocks;
}
