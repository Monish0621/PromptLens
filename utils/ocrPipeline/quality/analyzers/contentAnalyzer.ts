/**
 * Content Classification & Quality Analyzer
 *
 * Implements QualityAnalyzer. Classifies text into ContentDetection model
 * (type, confidence %, evidence tags) and computes content quality score.
 *
 * Performance target: < 3ms.
 */
import type { QualityAnalyzer } from '../analyzerRegistry';
import type { AnalyzerResult, ContentDetection, ContentType, QualityWarning } from '../qualityTypes';

export interface ContentAnalysisOutput {
  detection: ContentDetection;
  analyzerResult: AnalyzerResult;
}

export class ContentAnalyzer implements QualityAnalyzer {
  readonly name = 'ContentAnalyzer';

  analyze(text: string): AnalyzerResult {
    return analyzeContentQuality(text).analyzerResult;
  }
}

export function analyzeContentQuality(text: string): ContentAnalysisOutput {
  const warnings: QualityWarning[] = [];
  const details: Record<string, unknown> = {};
  const evidence: string[] = [];

  if (!text || text.trim().length === 0) {
    const detection: ContentDetection = {
      type: 'empty',
      confidence: 100,
      evidence: ['empty input string'],
    };
    const res: AnalyzerResult = {
      name: 'ContentAnalyzer',
      score: 100,
      weight: 0.10,
      warnings: [],
      details: { detection },
    };
    return { detection, analyzerResult: res };
  }

  const trimmed = text.trim();
  let score = 100;
  let detectedType: ContentType = 'prose';
  let detectionConfidence = 70;

  // ── 1. JSON Detection ─────────────────────────────────────────────────────
  const isJsonCandidate = (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                          (trimmed.startsWith('[') && trimmed.endsWith(']'));
  if (isJsonCandidate) {
    detectedType = 'json';
    evidence.push('outer braces/brackets');
    try {
      JSON.parse(trimmed);
      detectionConfidence = 98;
      evidence.push('valid JSON parse');
      details.jsonValid = true;
    } catch (e: any) {
      detectionConfidence = 85;
      score -= 25;
      evidence.push('invalid JSON syntax');
      details.jsonValid = false;
      warnings.push({
        type: 'MALFORMED_JSON',
        severity: 'high',
        message: `JSON structure detected but syntax is invalid: ${e.message}`,
        details: { jsonError: e.message },
      });
    }
  }

  // ── 2. HTML / XML Detection ──────────────────────────────────────────────
  else if (/^\s*<!DOCTYPE html>/i.test(trimmed) || /<\/(html|div|body|span|p|table|script)>/i.test(trimmed)) {
    detectedType = 'html';
    detectionConfidence = 95;
    evidence.push('HTML doctype/closing tags');
  }

  // ── 3. Terminal Output Detection ──────────────────────────────────────────
  else if (/^(\$ |> |c:\\>|user@[a-z0-9-]+:~\$)/im.test(trimmed) || /\b(npm run|git commit|sudo apt|yarn add|pnpm install)\b/i.test(trimmed)) {
    detectedType = 'terminal';
    detectionConfidence = 90;
    evidence.push('shell prompt / CLI command patterns');
  }

  // ── 4. YAML Detection ─────────────────────────────────────────────────────
  else if (/^[a-zA-Z0-9_-]+:\s+["'a-zA-Z0-9]/m.test(trimmed) && /^-\s+[a-zA-Z0-9]/m.test(trimmed) && !/[;{}]/.test(trimmed)) {
    detectedType = 'yaml';
    detectionConfidence = 88;
    evidence.push('YAML key-value pairs and hyphenated list items');
  }

  // ── 5. Code Detection ─────────────────────────────────────────────────────
  else {
    const codeKeywords = [
      'const', 'function', 'class', 'import', 'export', 'return', 'interface',
      'type', 'struct', 'public', 'private', 'async', 'await', 'def', 'self',
      'fn', 'let', 'mut', 'var', 'if', 'else', 'for', 'while', 'switch', 'case',
      'include', 'package', 'namespace'
    ];
    const words = trimmed.split(/\s+/);
    const matchedKeywords = words.filter(w => codeKeywords.includes(w));
    const keywordCount    = matchedKeywords.length;
    const semicolonLines  = (trimmed.match(/;\s*$/gm) || []).length;
    const codeSymbolCount = (trimmed.match(/(\=>|\-\>|\{\}|\(\)|\[\]|==|===|!=|!==|&&|\|\||\${)/g) || []).length;

    if (keywordCount > 0)    evidence.push(`keywords: ${Array.from(new Set(matchedKeywords)).slice(0, 3).join(', ')}`);
    if (semicolonLines > 0)  evidence.push('multiple line-ending semicolons');
    if (codeSymbolCount > 0) evidence.push('balanced code operator symbols');

    const codeSignals = keywordCount + semicolonLines + codeSymbolCount;

    if (codeSignals >= 3 || (keywordCount >= 1 && codeSymbolCount >= 2)) {
      detectedType = 'code';
      detectionConfidence = Math.min(98, 75 + codeSignals * 4);
    } else {
      // ── 6. Markdown Detection ────────────────────────────────────────────
      const mdSignals = (trimmed.match(/^#{1,6}\s+|^\s*[-*+]\s+|```|\*\*|\[.*\]\(.*\)/gm) || []).length;
      if (mdSignals >= 2) {
        detectedType = 'markdown';
        detectionConfidence = 85;
        evidence.push('markdown headers/fences/lists');
      } else if (keywordCount >= 1 && mdSignals >= 1) {
        detectedType = 'mixed';
        detectionConfidence = 75;
        evidence.push('mixed code and documentation markers');
      } else {
        detectedType = 'prose';
        detectionConfidence = 80;
        evidence.push('natural prose / dictionary word patterns');
      }
    }
  }

  const detection: ContentDetection = {
    type:       detectedType,
    confidence: Math.round(detectionConfidence),
    evidence,
  };

  details.detection = detection;

  const finalScore = Math.max(0, Math.round(score));

  const analyzerResult: AnalyzerResult = {
    name:     'ContentAnalyzer',
    score:    finalScore,
    weight:   0.10,
    warnings,
    details,
  };

  return { detection, analyzerResult };
}
