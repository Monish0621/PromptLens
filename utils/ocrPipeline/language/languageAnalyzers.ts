/**
 * Language Analyzers
 *
 * Modular analyzer implementations for scoring language candidates:
 *   1. ScriptAnalyzer      (matches language supported scripts with detected script)
 *   2. KeywordAnalyzer     (checks common English / Latin stop word frequencies)
 *   3. ContextAnalyzer     (evaluates contentType signals e.g. code/json implies English)
 *
 * Performance target: < 1ms combined execution time. Pure metadata & frequency analysis.
 */
import type { OCRContext } from '../types/ocrTypes';
import type { OCRLanguage, LanguageCandidate, ScriptDetection } from './languageTypes';

export interface LanguageAnalyzer {
  readonly name: string;
  evaluate(lang: OCRLanguage, text: string, ctx: OCRContext, scriptDet: ScriptDetection): { scoreAdjustment: number; reason: string };
}

export class ScriptAnalyzer implements LanguageAnalyzer {
  readonly name = 'ScriptAnalyzer';

  evaluate(lang: OCRLanguage, text: string, ctx: OCRContext, scriptDet: ScriptDetection): { scoreAdjustment: number; reason: string } {
    const primary = scriptDet.primaryScript;

    if (lang.supportedScripts.includes(primary)) {
      const bonus = Math.round(50 + (scriptDet.confidence * 0.25));
      return {
        scoreAdjustment: bonus,
        reason: `Primary script match [${primary}] (${scriptDet.confidence}% script confidence)`,
      };
    }

    if (primary === 'Mixed' && (lang.languageCode === 'en' || lang.supportedScripts.some(s => scriptDet.scriptDistribution[s] > 15))) {
      return {
        scoreAdjustment: 40,
        reason: `Mixed script match — language [${lang.displayName}] detected in text`,
      };
    }

    return { scoreAdjustment: -35, reason: `Script mismatch (text is ${primary}, language uses ${lang.supportedScripts.join('/')})` };
  }
}

export class KeywordAnalyzer implements LanguageAnalyzer {
  readonly name = 'KeywordAnalyzer';

  evaluate(lang: OCRLanguage, text: string, ctx: OCRContext, scriptDet: ScriptDetection): { scoreAdjustment: number; reason: string } {
    if (lang.languageCode === 'en' && scriptDet.primaryScript === 'Latin') {
      const stopWords = ['the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'i', 'it', 'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'is', 'const', 'function', 'import', 'export', 'return'];
      const words     = text.toLowerCase().split(/\W+/);
      const matchCount = words.filter(w => stopWords.includes(w)).length;

      if (matchCount >= 2) {
        return {
          scoreAdjustment: Math.min(25, matchCount * 5),
          reason: `Matched ${matchCount} common English keywords / code tokens`,
        };
      }
    }

    return { scoreAdjustment: 0, reason: 'Keyword baseline' };
  }
}

export class ContextAnalyzer implements LanguageAnalyzer {
  readonly name = 'ContextAnalyzer';

  evaluate(lang: OCRLanguage, text: string, ctx: OCRContext, scriptDet: ScriptDetection): { scoreAdjustment: number; reason: string } {
    const contentType = ctx.contentType || 'unknown';

    if (lang.languageCode === 'en' && ['code', 'json', 'yaml', 'terminal', 'html', 'markdown'].includes(contentType)) {
      return {
        scoreAdjustment: 20,
        reason: `Content type [${contentType.toUpperCase()}] implies English/ASCII technical text`,
      };
    }

    return { scoreAdjustment: 0, reason: 'Context baseline' };
  }
}

export class LanguageAnalyzerRegistry {
  private analyzers: LanguageAnalyzer[] = [
    new ScriptAnalyzer(),
    new KeywordAnalyzer(),
    new ContextAnalyzer(),
  ];

  evaluateCandidate(lang: OCRLanguage, text: string, ctx: OCRContext, scriptDet: ScriptDetection): LanguageCandidate {
    let score = lang.priority;
    const reasons: string[] = [];

    for (const analyzer of this.analyzers) {
      const res = analyzer.evaluate(lang, text, ctx, scriptDet);
      score += res.scoreAdjustment;
      if (!res.reason.includes('baseline')) {
        reasons.push(res.reason);
      }
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    const confidence = Math.min(99, Math.max(50, Math.round(finalScore * 0.96)));

    return {
      language: lang,
      score: finalScore,
      confidence,
      script: scriptDet.primaryScript,
      reason: reasons.join('; ') || `${lang.displayName} baseline`,
    };
  }
}

const defaultLanguageAnalyzerRegistry = new LanguageAnalyzerRegistry();
export { defaultLanguageAnalyzerRegistry };
