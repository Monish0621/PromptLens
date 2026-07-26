/**
 * Lightweight Unicode Script Detector
 *
 * Classifies OCR text characters into ScriptType categories ('Latin', 'Devanagari',
 * 'Kannada', 'Tamil', 'Telugu', 'Arabic', 'CJK', 'Mixed', 'Unknown') using regex ranges.
 *
 * Performance target: < 0.5ms. Pure character block frequency math.
 */
import type { ScriptDetection, ScriptType } from './languageTypes';

const SCRIPT_REGEXES: Record<Exclude<ScriptType, 'Mixed' | 'Unknown'>, RegExp> = {
  Latin:      /[\u0041-\u005A\u0061-\u007A\u00C0-\u024F]/g,
  Devanagari: /[\u0900-\u097F]/g,
  Kannada:    /[\u0C80-\u0CFF]/g,
  Tamil:      /[\u0B80-\u0BFF]/g,
  Telugu:     /[\u0C00-\u0C7F]/g,
  Arabic:     /[\u0600-\u06FF\u0750-\u077F]/g,
  CJK:        /[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g,
};

export function detectScript(text: string): ScriptDetection {
  const emptyResult: ScriptDetection = {
    primaryScript: 'Unknown',
    confidence: 0,
    scriptDistribution: {
      Latin: 0, Devanagari: 0, Kannada: 0, Tamil: 0,
      Telugu: 0, Arabic: 0, CJK: 0, Mixed: 0, Unknown: 100,
    },
  };

  if (!text || text.trim().length === 0) {
    return emptyResult;
  }

  const counts: Record<ScriptType, number> = {
    Latin: 0, Devanagari: 0, Kannada: 0, Tamil: 0,
    Telugu: 0, Arabic: 0, CJK: 0, Mixed: 0, Unknown: 0,
  };

  let totalLetters = 0;

  for (const [script, regex] of Object.entries(SCRIPT_REGEXES)) {
    const matches = text.match(regex);
    if (matches) {
      counts[script as ScriptType] = matches.length;
      totalLetters += matches.length;
    }
  }

  if (totalLetters === 0) {
    return emptyResult;
  }

  const scriptDistribution: Record<ScriptType, number> = {
    Latin:      parseFloat(((counts.Latin      / totalLetters) * 100).toFixed(1)),
    Devanagari: parseFloat(((counts.Devanagari / totalLetters) * 100).toFixed(1)),
    Kannada:    parseFloat(((counts.Kannada    / totalLetters) * 100).toFixed(1)),
    Tamil:      parseFloat(((counts.Tamil      / totalLetters) * 100).toFixed(1)),
    Telugu:     parseFloat(((counts.Telugu     / totalLetters) * 100).toFixed(1)),
    Arabic:     parseFloat(((counts.Arabic     / totalLetters) * 100).toFixed(1)),
    CJK:        parseFloat(((counts.CJK        / totalLetters) * 100).toFixed(1)),
    Mixed:      0,
    Unknown:    0,
  };

  // Find top scripts
  const sorted = (Object.keys(scriptDistribution) as ScriptType[])
    .map(s => ({ script: s, pct: scriptDistribution[s] }))
    .sort((a, b) => b.pct - a.pct);

  const top1 = sorted[0];
  const top2 = sorted[1];

  let primaryScript: ScriptType = top1.script;
  let confidence = Math.round(top1.pct);

  // Check for mixed script (e.g. English + Devanagari or English + Kannada)
  if (top2 && top2.pct >= 20.0 && top1.pct < 80.0) {
    primaryScript = 'Mixed';
    confidence    = Math.round(top1.pct + top2.pct);
    scriptDistribution.Mixed = confidence;
  }

  return {
    primaryScript,
    confidence: Math.min(99, Math.max(50, confidence)),
    scriptDistribution,
  };
}
