/**
 * Character Quality Analyzer
 *
 * Implements QualityAnalyzer. Analyzes character-level text quality to detect
 * Unicode replacement chars, control chars, repeated character cascades,
 * and high symbol noise.
 *
 * Performance target: < 2ms.
 */
import type { QualityAnalyzer } from '../analyzerRegistry';
import type { AnalyzerResult, QualityWarning } from '../qualityTypes';

export class CharacterAnalyzer implements QualityAnalyzer {
  readonly name = 'CharacterAnalyzer';

  analyze(text: string): AnalyzerResult {
    return analyzeCharacterQuality(text);
  }
}

export function analyzeCharacterQuality(text: string): AnalyzerResult {
  const warnings: QualityWarning[] = [];
  const details: Record<string, unknown> = {};

  if (!text || text.trim().length === 0) {
    return {
      name: 'CharacterAnalyzer',
      score: 100,
      weight: 0.25,
      warnings: [],
      details: { charCount: 0, emptyText: true },
    };
  }

  let score = 100;
  const len = text.length;

  // 1. Detect Unicode replacement character (\uFFFD)
  const replacementCharMatches = (text.match(/\uFFFD/g) || []).length;
  if (replacementCharMatches > 0) {
    score -= Math.min(35, replacementCharMatches * 10);
    warnings.push({
      type: 'REPLACEMENT_CHARACTERS',
      severity: replacementCharMatches > 3 ? 'critical' : 'high',
      message: `Detected ${replacementCharMatches} Unicode replacement character(s) ()`,
      details: { count: replacementCharMatches },
    });
  }

  // 2. Detect control characters (excluding \n, \r, \t)
  const controlCharMatches = (text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g) || []).length;
  if (controlCharMatches > 0) {
    score -= Math.min(25, controlCharMatches * 5);
    warnings.push({
      type: 'UNEXPECTED_CONTROL_CHARS',
      severity: 'medium',
      message: `Detected ${controlCharMatches} unexpected control character(s)`,
      details: { count: controlCharMatches },
    });
  }

  // 3. Detect suspicious repeated characters (e.g. IIIIII, llllll, 111111, %%%%%, _____, @@@@@)
  const suspiciousRepeatRegex = /(I{5,}|l{5,}|1{5,}|%{5,}|_{6,}|@{5,}|!{5,}|\?{5,}|,{5,}|\.{6,})/g;
  const repeatMatches = text.match(suspiciousRepeatRegex) || [];
  if (repeatMatches.length > 0) {
    const totalRepeatedChars = repeatMatches.reduce((acc, m) => acc + m.length, 0);
    score -= Math.min(30, totalRepeatedChars * 2);
    warnings.push({
      type: 'EXCESSIVE_REPEATED_CHARS',
      severity: totalRepeatedChars > 15 ? 'high' : 'medium',
      message: `Detected ${repeatMatches.length} block(s) of suspicious repeated characters (e.g. "${repeatMatches[0].substring(0, 8)}")`,
      details: { matchCount: repeatMatches.length, matches: repeatMatches.slice(0, 5) },
    });
  }

  // 4. Detect excessive symbol density
  const nonAlphaNumSpace = (text.match(/[^a-zA-Z0-9\s]/g) || []).length;
  const symbolRatio = nonAlphaNumSpace / len;
  details.symbolRatio = parseFloat(symbolRatio.toFixed(3));

  if (symbolRatio > 0.45 && len > 20) {
    score -= 15;
    warnings.push({
      type: 'HIGH_SYMBOL_DENSITY',
      severity: symbolRatio > 0.6 ? 'high' : 'medium',
      message: `High symbol density detected (${(symbolRatio * 100).toFixed(1)}% non-alphanumeric)`,
      details: { symbolRatio },
    });
  }

  // 5. Detect severe noise / gibberish lines (single-char line cascades)
  const lines = text.split('\n');
  const singleCharLines = lines.filter(l => l.trim().length === 1 && /[^a-zA-Z0-9]/.test(l.trim())).length;
  if (singleCharLines >= 3 && lines.length > 5) {
    score -= 10;
    warnings.push({
      type: 'NOISE_LINE_CASCADE',
      severity: 'medium',
      message: `Detected ${singleCharLines} single-symbol noise lines`,
      details: { singleCharLines },
    });
  }

  const finalScore = Math.max(0, Math.round(score));
  details.characterScore = finalScore;
  details.replacementCharCount = replacementCharMatches;
  details.controlCharCount = controlCharMatches;

  return {
    name: 'CharacterAnalyzer',
    score: finalScore,
    weight: 0.25,
    warnings,
    details,
  };
}
