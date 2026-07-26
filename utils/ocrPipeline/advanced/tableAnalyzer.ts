/**
 * Table Structure Analyzer
 *
 * Lightweight table detection analyzing grid alignment, repeated column spacing,
 * and pipe/tab/space delimiters without external computer vision or ML.
 *
 * Performance target: < 1ms.
 */
import type { TableStructure } from './advancedTypes';

export function analyzeTables(text: string): TableStructure[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const lines = text.split('\n');
  const tableLines: string[] = [];

  // Look for Markdown / ASCII pipe tables (| col1 | col2 |)
  const pipeLines = lines.filter(l => l.includes('|') && (l.match(/\|/g) || []).length >= 2);

  if (pipeLines.length >= 2) {
    const grid = pipeLines
      .filter(l => !/^\s*\|?[\s:-]+\|?\s*$/.test(l)) // Exclude separator line |---|---|
      .map(l => l.split('|').map(cell => cell.trim()).filter(c => c.length > 0));

    const rows = grid.length;
    const cols = grid.reduce((max, r) => Math.max(max, r.length), 0);

    if (rows >= 2 && cols >= 2) {
      return [{
        rows,
        columns: cols,
        confidence: 92,
        grid,
      }];
    }
  }

  // Look for multi-space / tab aligned column data
  const alignedLines = lines.filter(l => /\S+\s{3,}\S+/.test(l));
  if (alignedLines.length >= 3) {
    const grid = alignedLines.map(l => l.split(/\s{3,}/).map(cell => cell.trim()));
    const rows = grid.length;
    const cols = grid.reduce((max, r) => Math.max(max, r.length), 0);

    if (rows >= 3 && cols >= 2) {
      return [{
        rows,
        columns: cols,
        confidence: 80,
        grid,
      }];
    }
  }

  return [];
}
