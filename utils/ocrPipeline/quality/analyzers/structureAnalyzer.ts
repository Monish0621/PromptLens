/**
 * Structure & Layout Analyzer
 *
 * Implements QualityAnalyzer. Analyzes OCR text layout, paragraph consistency,
 * line length distributions, code fence integrity, JSON brace balance, and HTML tag balance.
 *
 * Performance target: < 3ms.
 */
import type { QualityAnalyzer } from '../analyzerRegistry';
import type { AnalyzerResult, QualityWarning } from '../qualityTypes';

export class StructureAnalyzer implements QualityAnalyzer {
  readonly name = 'StructureAnalyzer';

  analyze(text: string): AnalyzerResult {
    return analyzeStructureQuality(text);
  }
}

export function analyzeStructureQuality(text: string): AnalyzerResult {
  const warnings: QualityWarning[] = [];
  const details: Record<string, unknown> = {};

  if (!text || text.trim().length === 0) {
    return {
      name: 'StructureAnalyzer',
      score: 100,
      weight: 0.15,
      warnings: [],
      details: { lineCount: 0, emptyText: true },
    };
  }

  let score = 100;
  const lines = text.split('\n');
  const lineCount = lines.length;
  details.lineCount = lineCount;

  // 1. Markdown code fence integrity (must be even count of ```)
  const codeFences = (text.match(/^```/gm) || []).length;
  if (codeFences % 2 !== 0) {
    score -= 15;
    warnings.push({
      type: 'BROKEN_MARKDOWN_FENCES',
      severity: 'high',
      message: `Unbalanced Markdown code fences (${codeFences} fence tag(s) found)`,
      details: { codeFenceCount: codeFences },
    });
  }

  // 2. JSON / Code Brace Balance ({}, [])
  const openBraces  = (text.match(/\{/g) || []).length;
  const closeBraces = (text.match(/\}/g) || []).length;
  const openBrackets  = (text.match(/\[/g) || []).length;
  const closeBrackets = (text.match(/\]/g) || []).length;

  const braceDiff   = Math.abs(openBraces - closeBraces);
  const bracketDiff = Math.abs(openBrackets - closeBrackets);

  details.braceBalance   = { open: openBraces, close: closeBraces };
  details.bracketBalance = { open: openBrackets, close: closeBrackets };

  if (braceDiff > 0 && (openBraces > 1 || closeBraces > 1)) {
    score -= Math.min(20, braceDiff * 5);
    warnings.push({
      type: 'UNBALANCED_CURLY_BRACES',
      severity: braceDiff > 2 ? 'high' : 'medium',
      message: `Unbalanced curly braces ({: ${openBraces}, }: ${closeBraces})`,
      details: { openBraces, closeBraces, diff: braceDiff },
    });
  }

  if (bracketDiff > 0 && (openBrackets > 2 || closeBrackets > 2)) {
    score -= Math.min(15, bracketDiff * 3);
    warnings.push({
      type: 'UNBALANCED_SQUARE_BRACKETS',
      severity: 'medium',
      message: `Unbalanced square brackets ([: ${openBrackets}, ]: ${closeBrackets})`,
      details: { openBrackets, closeBrackets, diff: bracketDiff },
    });
  }

  // 3. HTML / XML tag balance
  const openTags  = (text.match(/<[a-zA-Z][a-zA-Z0-9]*\b[^>]*>/g) || []).length;
  const closeTags = (text.match(/<\/[a-zA-Z][a-zA-Z0-9]*>/g) || []).length;
  if (openTags > 2 && Math.abs(openTags - closeTags) > 2) {
    score -= 10;
    warnings.push({
      type: 'UNBALANCED_HTML_TAGS',
      severity: 'medium',
      message: `HTML/XML tag mismatch (${openTags} opening vs ${closeTags} closing tags)`,
      details: { openTags, closeTags },
    });
  }

  // 4. Empty line ratio check
  const emptyLines = lines.filter(l => l.trim().length === 0).length;
  const emptyRatio = emptyLines / lineCount;
  details.emptyLineRatio = parseFloat(emptyRatio.toFixed(3));

  if (emptyRatio > 0.6 && lineCount > 4) {
    score -= 15;
    warnings.push({
      type: 'EXCESSIVE_EMPTY_LINES',
      severity: 'medium',
      message: `Excessive empty lines (${(emptyRatio * 100).toFixed(0)}% empty)`,
      details: { emptyLines, lineCount, emptyRatio },
    });
  }

  // 5. Line length variance (checks for choppy single-word broken lines)
  const nonEmpLines = lines.filter(l => l.trim().length > 0);
  if (nonEmpLines.length >= 4) {
    const lengths = nonEmpLines.map(l => l.length);
    const avgLen  = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const shortLines = lengths.filter(l => l < 4).length;
    details.avgLineLength = parseFloat(avgLen.toFixed(1));

    if (shortLines / nonEmpLines.length > 0.5 && avgLen < 10) {
      score -= 15;
      warnings.push({
        type: 'CHOPPY_LINE_STRUCTURE',
        severity: 'medium',
        message: `Choppy line structure detected (average line length: ${avgLen.toFixed(1)} chars)`,
        details: { avgLen, shortLineRatio: shortLines / nonEmpLines.length },
      });
    }
  }

  const finalScore = Math.max(0, Math.round(score));
  details.structureScore = finalScore;

  return {
    name: 'StructureAnalyzer',
    score: finalScore,
    weight: 0.15,
    warnings,
    details,
  };
}
