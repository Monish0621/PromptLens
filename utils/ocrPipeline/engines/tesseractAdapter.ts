/**
 * OCR Engine Adapter — Tesseract.js
 *
 * TesseractAdapter implements the OCREngine interface from ocrTypes.ts.
 *
 * DEPENDENCY INJECTION BOUNDARY
 * ──────────────────────────────
 * RecognitionStage calls: engine.recognize(image, config)
 *                                 │
 *                         OCREngine (interface)
 *                                 │
 *                         TesseractAdapter  ← this file
 *
 * Milestone 2D adds PaddleOCRAdapter / CloudOCRAdapter by:
 *   1. Implementing OCREngine in a new file here in engines/
 *   2. Updating createEngineAdapter() below
 *   3. Zero changes to RecognitionStage or any other stage
 *
 * Chrome MV3 constraints (handled here, nowhere else):
 *   • workerBlobURL: false  — CSP blocks Blob-URL workers
 *   • explicit workerPath, corePath, langPath pointing into extension assets
 *   • wasm-unsafe-eval must be in manifest CSP for WebAssembly.instantiate()
 */
import { createWorker } from 'tesseract.js';
import type { OCREngine, RecognitionResult, OCRConfig } from '../types/ocrTypes';
import { ocrLog } from '../utils/ocrLogger';

// ─────────────────────────────────────────────────────────────────────────────
// Tesseract Adapter
// ─────────────────────────────────────────────────────────────────────────────

export class TesseractAdapter implements OCREngine {
  readonly engineName = 'tesseract';

  async recognize(imageDataUrl: string, config: OCRConfig): Promise<RecognitionResult> {
    ocrLog.info(
      `[TesseractAdapter] Creating worker` +
      ` (lang=${config.language}, oem=${config.ocrEngineMode})`
    );

    const worker = await createWorker(config.language, config.ocrEngineMode, {
      workerPath:    chrome.runtime.getURL('tesseract/worker.min.js'),
      corePath:      chrome.runtime.getURL('tesseract/tesseract-core.wasm.js'),
      langPath:      chrome.runtime.getURL('tesseract'),
      workerBlobURL: false,
      logger: (m: { status: string; progress: number }) => {
        ocrLog.debug(`[TesseractAdapter] ${m.status} | ${(m.progress * 100).toFixed(0)}%`);
      },
    }).catch((err: any) => {
      ocrLog.error('[TesseractAdapter] Worker creation failed', err);
      throw err;
    });

    ocrLog.info('[TesseractAdapter] Worker ready. Running recognition...');

    try {
      const result = await worker.recognize(imageDataUrl);

      // Map Tesseract word data to our generic WordData shape.
      // Tesseract v5+ exposes result.data.words[].confidence and .text.
      const words = (((result.data as any).words ?? []) as any[]).map((w: any) => ({
        text:       typeof w.text === 'string' ? w.text : '',
        confidence: typeof w.confidence === 'number' ? w.confidence : 0,
      }));

      // Store the full Tesseract data object as engineMetadata for
      // Milestone 2C consumers that may want hOCR, blocks, lines, etc.
      const engineMetadata: Record<string, unknown> = {
        confidence: result.data.confidence,
        blocks:     result.data.blocks?.length ?? 0,
      };

      ocrLog.info(
        `[TesseractAdapter] Recognition complete.` +
        ` Words: ${words.length}, confidence: ${result.data.confidence?.toFixed(1) ?? '?'}`
      );

      return {
        text:           result.data.text ?? '',
        words,
        engineMetadata,
      };

    } finally {
      ocrLog.info('[TesseractAdapter] Terminating worker');
      await worker.terminate();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Engine Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the correct OCREngine adapter for the given config.
 * Milestone 2D extends this switch with 'paddle', 'cloud', 'hybrid'.
 */
export function createEngineAdapter(config: OCRConfig): OCREngine {
  switch (config.engine) {
    case 'tesseract':
    default:
      return new TesseractAdapter();
  }
}
