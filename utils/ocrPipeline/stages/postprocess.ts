/**
 * Stage 4 — PostProcessStage
 *
 * RESPONSIBILITY: Clean and format raw OCR text.
 *
 * Reads:   ctx.rawText
 * Writes:  ctx.processedText  (trimmed, optionally wrapped in markdown code block)
 *
 * This stage is the new home of formatOcrResult() from offscreen/main.ts.
 * The logic is identical — only the location has changed.
 *
 * What this stage does:
 *   1. Trims whitespace from the raw text.
 *   2. Applies code-detection heuristics (regex pattern matching).
 *   3. If code is detected, wraps the text in a markdown fenced code block
 *      with an inferred language tag.
 *   4. Otherwise returns the cleaned plain text.
 *
 * Milestone 2B may add line-merge / whitespace-normalisation here.
 * Milestone 2D may add AST-aware formatting.
 *
 * Language identification logic was deliberately kept here (not in
 * LanguageStage) because it is tightly coupled to the markdown wrapping
 * heuristic. Milestone 2C will introduce real language detection in
 * LanguageStage and the two can be decoupled at that point.
 */
import type { OCRStage, OCRContext } from '../types/ocrTypes';
import { ocrLog } from '../utils/ocrLogger';

export class PostProcessStage implements OCRStage {
  readonly name = 'PostProcessStage';

  async execute(ctx: OCRContext): Promise<OCRContext> {
    ctx.processedText = formatOcrText(ctx.rawText);

    ocrLog.info(
      `[PostProcessStage] Input length: ${ctx.rawText.length}` +
      ` → Output length: ${ctx.processedText.length}`
    );

    if (!ctx.processedText) {
      ctx.warnings.push('[PostProcessStage] Processed text is empty after formatting');
    }

    return ctx;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// formatOcrText — moved verbatim from offscreen/main.ts: formatOcrResult()
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Heuristically formats OCR output.
 * Detects programming code and wraps it in a markdown fenced code block.
 * Returns plain trimmed text for non-code content.
 *
 * Source: offscreen/main.ts > formatOcrResult()  (moved here, not rewritten)
 */
export function formatOcrText(text: string): string {
  const cleaned = text.trim();
  if (!cleaned) return '';

  const codePatterns = [
    /const\s+\w+\s*=/,  /let\s+\w+\s*=/,  /var\s+\w+\s*=/,
    /function\s+\w+\(/,  /import\s+.*\s+from/,  /export\s+(const|default|class|interface)/,
    /class\s+\w+/,  /interface\s+\w+/,  /public\s+class\s+\w+/,
    /def\s+\w+\(/,  /import\s+\w+/,  /from\s+\w+\s+import/,
    /console\.log\(/,  /print\(/,  /#include\s+<\w+>/,
    /using\s+namespace\s+std;/,  /System\.out\.println/,
    /<\/?[a-z][a-z0-9]*[^<>]*>/i,  // HTML tags
    /\{\s*$/m,  /\}\s*$/m,          // Curly brackets at end of lines
  ];

  const matchCount  = codePatterns.filter(p => p.test(cleaned)).length;
  const semiColons  = (cleaned.match(/;/g)    || []).length;
  const braces      = (cleaned.match(/[{}]/g) || []).length;

  const isCode = matchCount >= 2 || (semiColons >= 3 && braces >= 2);

  if (isCode) {
    const lang = detectLanguage(cleaned.toLowerCase());
    ocrLog.debug(`[PostProcessStage] Code detected. Language: "${lang || 'text'}"`);
    return `\`\`\`${lang}\n${cleaned}\n\`\`\``;
  }

  return cleaned;
}

/** Infer a markdown language tag from text content. */
function detectLanguage(lower: string): string {
  if (lower.includes('import react') || lower.includes("from 'react'") ||
      lower.includes('const [')      || lower.includes('useeffect')) {
    return 'tsx';
  }
  if (lower.includes('interface ')  ||
      (lower.includes('type ')      && (lower.includes(': string') || lower.includes(': number')))) {
    return 'typescript';
  }
  if (lower.includes('def ')        || lower.includes('import sys') || lower.includes('print(')) {
    return 'python';
  }
  if (lower.includes('<html>')      || lower.includes('<!doctype')  || lower.includes('href=')) {
    return 'html';
  }
  if (lower.includes('function ')   || lower.includes('const ')    || lower.includes('console.log')) {
    return 'javascript';
  }
  if (lower.includes('#include')    || lower.includes('std::')     || lower.includes('int main(')) {
    return 'cpp';
  }
  if (lower.includes('public class ')|| lower.includes('system.out.print')) {
    return 'java';
  }
  if (lower.includes('body {')      || lower.includes('@media')    || lower.includes('padding:')) {
    return 'css';
  }
  return '';
}
