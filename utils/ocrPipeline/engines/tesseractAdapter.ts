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
// Persistent Singleton Tesseract Worker Instance
// ─────────────────────────────────────────────────────────────────────────────
let sharedWorker: any = null;
let sharedWorkerPromise: Promise<any> | null = null;
let sharedWorkerConfigKey = '';
let workerIdleTimer: any = null;
const WORKER_IDLE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

async function getOrCreatePersistentWorker(language: string, oem: number): Promise<any> {
  const configKey = `${language}:${oem}`;

  // Reset idle timer on active use
  if (workerIdleTimer) {
    clearTimeout(workerIdleTimer);
    workerIdleTimer = null;
  }

  // If existing worker matches configuration, reuse immediately
  if (sharedWorker && sharedWorkerConfigKey === configKey) {
    ocrLog.info('[TesseractAdapter] Reusing persistent Tesseract worker instance');
    scheduleWorkerIdleCleanup();
    return sharedWorker;
  }

  // If worker is currently initializing, await promise
  if (sharedWorkerPromise && sharedWorkerConfigKey === configKey) {
    ocrLog.info('[TesseractAdapter] Awaiting active worker initialization promise');
    return sharedWorkerPromise;
  }

  // If configuration changed or worker crashed, terminate old instance
  if (sharedWorker) {
    ocrLog.info('[TesseractAdapter] Terminating previous worker due to config change');
    try { await sharedWorker.terminate(); } catch {}
    sharedWorker = null;
  }

  ocrLog.info(`[TesseractAdapter] Creating persistent Tesseract worker (lang=${language}, oem=${oem})`);
  sharedWorkerConfigKey = configKey;

  sharedWorkerPromise = (async () => {
    try {
      const worker = await createWorker(language, oem, {
        workerPath:    chrome.runtime.getURL('tesseract/worker.min.js'),
        corePath:      chrome.runtime.getURL('tesseract/tesseract-core.wasm.js'),
        langPath:      chrome.runtime.getURL('tesseract'),
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => {
          ocrLog.debug(`[TesseractAdapter] ${m.status} | ${(m.progress * 100).toFixed(0)}%`);
        },
      });

      sharedWorker = worker;
      scheduleWorkerIdleCleanup();
      return worker;
    } catch (err: any) {
      ocrLog.error('[TesseractAdapter] Persistent worker creation failed', err);
      sharedWorker = null;
      sharedWorkerConfigKey = '';
      throw err;
    } finally {
      sharedWorkerPromise = null;
    }
  })();

  return sharedWorkerPromise;
}

function scheduleWorkerIdleCleanup() {
  if (workerIdleTimer) clearTimeout(workerIdleTimer);
  workerIdleTimer = setTimeout(async () => {
    if (sharedWorker) {
      ocrLog.info('[TesseractAdapter] Idle timeout (5m) reached — terminating persistent worker');
      try { await sharedWorker.terminate(); } catch {}
      sharedWorker = null;
      sharedWorkerConfigKey = '';
    }
    workerIdleTimer = null;
  }, WORKER_IDLE_TIMEOUT_MS);
}

export class TesseractAdapter implements OCREngine {
  readonly engineName = 'tesseract';

  async recognize(imageDataUrl: string, config: OCRConfig): Promise<RecognitionResult> {
    const worker = await getOrCreatePersistentWorker(config.language, config.ocrEngineMode);

    ocrLog.info('[TesseractAdapter] Worker ready. Running recognition...');

    try {
      const result = await worker.recognize(imageDataUrl);

      // Map Tesseract word data to our generic WordData shape.
      const words = (((result.data as any).words ?? []) as any[]).map((w: any) => ({
        text:       typeof w.text === 'string' ? w.text : '',
        confidence: typeof w.confidence === 'number' ? w.confidence : 0,
      }));

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

    } catch (err) {
      ocrLog.error('[TesseractAdapter] Worker recognition failed, resetting worker instance', err);
      if (sharedWorker) {
        try { await sharedWorker.terminate(); } catch {}
        sharedWorker = null;
        sharedWorkerConfigKey = '';
      }
      throw err;
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
