/**
 * Stage 3 — RecognitionStage
 *
 * RESPONSIBILITY: Run OCR recognition using the injected OCREngine.
 *
 * Reads:   ctx.workingImage (the image to recognize — possibly preprocessed)
 *          ctx.config       (passed to the engine for language / OEM)
 * Writes:  ctx.rawText      (full text as returned by the engine)
 *          ctx.wordData     (word-level confidence array)
 *          ctx.engineMetadata (engine-specific raw data for Milestone 2C)
 *          ctx.errors       (if recognition throws)
 *
 * DEPENDENCY INJECTION
 * ─────────────────────
 * RecognitionStage receives an OCREngine in its constructor.
 * It calls only engine.recognize() — it never imports Tesseract or any
 * concrete adapter.  Swapping the engine = change the adapter passed in.
 *
 *   const stage = new RecognitionStage(new TesseractAdapter());
 *   // or later:
 *   const stage = new RecognitionStage(new PaddleOCRAdapter());
 */
import type { OCRStage, OCRContext, OCREngine } from '../types/ocrTypes';
import { ocrLog } from '../utils/ocrLogger';

export class RecognitionStage implements OCRStage {
  readonly name = 'RecognitionStage';

  constructor(private readonly engine: OCREngine) {}

  async execute(ctx: OCRContext): Promise<OCRContext> {
    if (!ctx.workingImage) {
      ctx.errors.push('[RecognitionStage] No working image available for recognition');
      return ctx;
    }

    ocrLog.info(`[RecognitionStage] Running recognition via engine: ${this.engine.engineName}`);

    let result;
    try {
      result = await this.engine.recognize(ctx.workingImage, ctx.config);
    } catch (err: any) {
      ctx.errors.push(`[RecognitionStage] Engine "${this.engine.engineName}" threw: ${err.message}`);
      ocrLog.error(`[RecognitionStage] Recognition failed`, err);
      return ctx;
    }

    ctx.rawText       = result.text;
    ctx.wordData      = result.words;
    ctx.engineMetadata = result.engineMetadata;

    ocrLog.info(
      `[RecognitionStage] Raw text length: ${result.text.length} chars` +
      ` | Words with confidence data: ${result.words.length}`
    );

    return ctx;
  }
}
