/**
 * Line & Indentation Analyzer
 *
 * Analyzes line structure, indentation levels, line spacing, and wrapped line signals.
 * Useful for code, markdown, and terminal log formatting preservation.
 */
export interface LineAnalysisResult {
  totalLines:      number;
  indentedLines:   number;
  avgIndentation:  number;
  maxIndentation:  number;
  emptyLines:      number;
  lines:           string[];
}

export function analyzeLines(text: string): LineAnalysisResult {
  if (!text) {
    return { totalLines: 0, indentedLines: 0, avgIndentation: 0, maxIndentation: 0, emptyLines: 0, lines: [] };
  }

  const lines = text.split('\n');
  let indentedCount = 0;
  let totalIndent = 0;
  let maxIndent = 0;
  let emptyCount = 0;

  for (const line of lines) {
    if (line.trim().length === 0) {
      emptyCount++;
      continue;
    }

    const match = line.match(/^(\s+)/);
    if (match) {
      indentedCount++;
      const len = match[1].length;
      totalIndent += len;
      if (len > maxIndent) maxIndent = len;
    }
  }

  const avgIndentation = indentedCount > 0 ? parseFloat((totalIndent / indentedCount).toFixed(1)) : 0;

  return {
    totalLines: lines.length,
    indentedLines: indentedCount,
    avgIndentation,
    maxIndentation,
    emptyLines: emptyCount,
    lines,
  };
}
