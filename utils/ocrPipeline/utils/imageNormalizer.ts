/**
 * Image Normalizer — Milestone 2B.3 Refinements
 *
 * DESIGN: Decode-once → Group & Priority Filter Registry → Image Quality Scoring → Encode-once.
 */
import type { PreprocessMetadata, ImageOrientation, NormalizationOptions } from '../types/ocrTypes';
import { createCanvasModel, type SnapshotReference, type CanvasModel }      from '../preprocessing/imageFilter';
import { runFilters }                                                        from '../preprocessing/filterRunner';
import { TrimTransparentBordersFilter }                                      from '../preprocessing/filters/trimFilter';
import { SmartUpscaleFilter }                                                from '../preprocessing/filters/upscaleFilter';
import { AdaptiveGrayscaleFilter }                                           from '../preprocessing/filters/grayscaleFilter';
import { ContrastEnhancementFilter }                                         from '../preprocessing/filters/contrastFilter';
import { AdaptiveThresholdFilter }                                           from '../preprocessing/filters/thresholdFilter';
import { MedianNoiseReductionFilter }                                        from '../preprocessing/filters/medianFilter';
import { MorphologyCleanupFilter }                                           from '../preprocessing/filters/morphologyFilter';
import { DeskewFilter }                                                      from '../preprocessing/filters/deskewFilter';
import { SharpenFilter }                                                     from '../preprocessing/filters/sharpenFilter';
import { AdaptiveInvertFilter }                                           from '../preprocessing/filters/invertFilter';
import { ocrLog }                                                            from './ocrLogger';

export type { CanvasModel, SnapshotReference } from '../preprocessing/imageFilter';
export type { NormalizationOptions }           from '../types/ocrTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizationResult {
  /** Final normalized + enhanced image as a PNG data URL. */
  dataUrl:   string;
  metadata:  PreprocessMetadata;
  /** Debug snapshot references map (filterName -> SnapshotReference). */
  snapshots: Record<string, SnapshotReference>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public Entry Point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validate, normalise, and enhance an image data URL using the priority-driven filter registry.
 *
 * @param dataUrl  Base64 PNG/JPEG data URL of the captured screenshot region.
 * @param options  Preprocessing flags and tuning knobs from OCRConfig.
 * @returns        Processed data URL, full PreprocessMetadata, and debug snapshots.
 */
export async function normalizeImage(
  dataUrl: string,
  options: NormalizationOptions
): Promise<NormalizationResult> {
  const totalStart = performance.now();

  // ── Step 1: Validate ──────────────────────────────────────────────────────
  const validateStart = performance.now();
  validateDataUrl(dataUrl);
  const validationMs = parseFloat((performance.now() - validateStart).toFixed(2));
  ocrLog.debug(`[Normalizer] Validation OK (${validationMs}ms)`);

  // ── Step 2: Decode → CanvasModel (ONCE) ───────────────────────────────────
  const decodeStart    = performance.now();
  const img            = await loadImage(dataUrl);
  const originalWidth  = img.naturalWidth;
  const originalHeight = img.naturalHeight;

  let model = createCanvasModel(originalWidth, originalHeight);
  model.ctx.drawImage(img, 0, 0);
  const decodeMs              = parseFloat((performance.now() - decodeStart).toFixed(2));
  const orientationMs         = 0;
  const orientationNormalized = options.normalizeOrientation;

  ocrLog.debug(
    `[Normalizer] Decoded + drawn: ${originalWidth}×${originalHeight}px (${decodeMs}ms)`
  );
  ocrLog.pipeline('Enhancement Started');

  // ── Step 3: Build filter registry and run all filters via runner ───────────
  const deskewFilterInstance = new DeskewFilter();
  const filters = [
    new TrimTransparentBordersFilter(),
    new SmartUpscaleFilter(),
    new AdaptiveInvertFilter(),
    new AdaptiveGrayscaleFilter(),
    new ContrastEnhancementFilter(),
    new AdaptiveThresholdFilter(),
    new MedianNoiseReductionFilter(),
    new MorphologyCleanupFilter(),
    deskewFilterInstance,
    new SharpenFilter(),
  ];

  const { model: finalModel, records, snapshots } = await runFilters(model, filters, options);

  // ── Step 4: Encode → data URL (ONCE) ──────────────────────────────────────
  const encodeStart  = performance.now();
  const finalDataUrl = finalModel.canvas.toDataURL('image/png');
  const encodeMs     = parseFloat((performance.now() - encodeStart).toFixed(2));
  ocrLog.debug(`[Normalizer] Encoded to PNG (${encodeMs}ms)`);

  // ── Step 5: Calculate Image Quality Score (0–100) ──────────────────────────
  const normalizedWidth   = finalModel.width;
  const normalizedHeight  = finalModel.height;
  const imageQualityScore = calculateImageQualityScore(finalModel, originalWidth, originalHeight);
  const totalPreprocessMs = parseFloat((performance.now() - totalStart).toFixed(2));
  const orientation       = detectOrientation(normalizedWidth, normalizedHeight);

  const filtersApplied    = records.filter(r => r.applied).map(r => r.filterName);
  const filtersExecuted   = records.filter(r => !r.skipped).length;
  const filtersSkipped    = records.filter(r => r.skipped).length;

  const findApplied       = (name: string) => records.find(r => r.filterName === name)?.applied ?? false;

  const trimRecord        = records.find(r => r.filterName === 'TrimTransparentBordersFilter');
  const upscaleRecord     = records.find(r => r.filterName === 'SmartUpscaleFilter');

  let upscaleFactorX = 1;
  let upscaleFactorY = 1;
  if (upscaleRecord?.applied && upscaleRecord.detail) {
    const match = upscaleRecord.detail.match(/\((\d+\.\d+)×\)/);
    if (match) upscaleFactorX = upscaleFactorY = parseFloat(match[1]);
  }

  const trimBounds = trimRecord?.applied && trimRecord.detail
    ? parseTrimBounds(trimRecord.detail)
    : { top: 0, right: 0, bottom: 0, left: 0 };

  const metadata: PreprocessMetadata = {
    // Dimensions
    originalWidth,
    originalHeight,
    normalizedWidth,
    normalizedHeight,
    pixelCount:   normalizedWidth * normalizedHeight,
    aspectRatio:  normalizedHeight > 0
      ? parseFloat((normalizedWidth / normalizedHeight).toFixed(3))
      : 0,
    orientation,
    // Normalization
    orientationNormalized,
    trimAttempted:  options.trimTransparentBorders,
    trimApplied:    findApplied('TrimTransparentBordersFilter'),
    trimBounds,
    // Enhancement
    filterRecords:    records,
    filtersApplied,
    filtersExecuted,
    filtersSkipped,
    upscaleApplied:   findApplied('SmartUpscaleFilter'),
    upscaleFactorX,
    upscaleFactorY,
    grayscaleApplied: findApplied('AdaptiveGrayscaleFilter'),
    contrastApplied:  findApplied('ContrastEnhancementFilter'),
    thresholdApplied: findApplied('AdaptiveThresholdFilter'),
    // Cleanup + Geometry + Finalization
    medianApplied:     findApplied('MedianNoiseReductionFilter'),
    morphologyApplied: findApplied('MorphologyCleanupFilter'),
    deskewAngleDeg:    deskewFilterInstance.detectedAngle,
    sharpenApplied:    findApplied('SharpenFilter'),
    // Quality Score
    imageQualityScore,
    // Timing
    validationMs,
    decodeMs,
    orientationMs,
    encodeMs,
    totalPreprocessMs,
  };

  ocrLog.pipeline('Enhancement Complete');
  ocrLog.info(
    `[Normalizer] ${originalWidth}×${originalHeight} → ${normalizedWidth}×${normalizedHeight}` +
    ` | qualityScore=${imageQualityScore}/100` +
    ` | executed=${filtersExecuted} skipped=${filtersSkipped}` +
    ` | applied: [${filtersApplied.map(f => f.replace('Filter', '')).join(', ') || 'none'}]` +
    ` | total=${totalPreprocessMs}ms`
  );

  return { dataUrl: finalDataUrl, metadata, snapshots };
}

// ─────────────────────────────────────────────────────────────────────────────
// Image Quality Score Calculator (0–100)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates a composite Image Quality Score (0–100) for OCR readability.
 *
 * Metrics:
 *   1. Resolution Score (0–30):  Evaluates minimum image dimensions.
 *   2. Contrast Score   (0–35):  Evaluates bimodal text/background histogram separation.
 *   3. Edge Sharpness   (0–35):  Evaluates gradient magnitude at character boundaries.
 */
function calculateImageQualityScore(model: CanvasModel, origW: number, origH: number): number {
  const { ctx, width, height } = model;
  const minDim = Math.min(width, height);

  // 1. Resolution Score (0–30)
  let resScore = 30;
  if (minDim < 200)       resScore = 10;
  else if (minDim < 400)  resScore = 20;

  // Sample pixels for contrast & sharpness calculation (max 150x150 sample grid)
  const sampleW = Math.min(width, 150);
  const sampleH = Math.min(height, 150);
  const imageData = ctx.getImageData(0, 0, sampleW, sampleH);
  const data = imageData.data;

  // 2. Contrast Score (0–35)
  let minLum = 255, maxLum = 0;
  let edgeGradSum = 0;
  let edgeCount = 0;

  for (let y = 0; y < sampleH; y++) {
    for (let x = 0; x < sampleW; x++) {
      const idx = (y * sampleW + x) * 4;
      const lum = data[idx]; // R channel
      if (lum < minLum) minLum = lum;
      if (lum > maxLum) maxLum = lum;

      // Sample horizontal gradient for edge sharpness
      if (x < sampleW - 1) {
        const nextLum = data[idx + 4];
        const diff = Math.abs(lum - nextLum);
        if (diff > 20) {
          edgeGradSum += diff;
          edgeCount++;
        }
      }
    }
  }

  const contrastSpread = maxLum - minLum;
  const contrastScore  = Math.min(35, Math.round((contrastSpread / 255) * 35));

  // 3. Sharpness Score (0–35)
  const avgEdgeGrad    = edgeCount > 0 ? (edgeGradSum / edgeCount) : 0;
  const sharpnessScore = Math.min(35, Math.round((avgEdgeGrad / 255) * 35 * 1.5));

  const totalScore = Math.min(100, Math.max(0, Math.round(resScore + contrastScore + sharpnessScore)));
  return totalScore;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function validateDataUrl(dataUrl: string): void {
  if (!dataUrl || typeof dataUrl !== 'string')
    throw new Error('[Normalizer] Input is null or not a string');
  if (!dataUrl.startsWith('data:'))
    throw new Error('[Normalizer] Input does not start with "data:"');
  if (!dataUrl.includes(';base64,'))
    throw new Error('[Normalizer] Input is not a valid base64 data URL');
  if (dataUrl.split(',')[1]?.length === 0)
    throw new Error('[Normalizer] Input base64 payload is empty');
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img   = new Image();
    img.onload  = () => {
      if (img.naturalWidth === 0 || img.naturalHeight === 0)
        reject(new Error('[Normalizer] Image loaded with zero dimensions'));
      else
        resolve(img);
    };
    img.onerror = () => reject(new Error('[Normalizer] Image failed to load'));
    img.src     = dataUrl;
  });
}

function detectOrientation(w: number, h: number): ImageOrientation {
  if (w > h) return 'landscape';
  if (h > w) return 'portrait';
  return 'square';
}

function parseTrimBounds(detail: string) {
  const get = (key: string) => {
    const m = detail.match(new RegExp(`${key}=(\\d+)`));
    return m ? parseInt(m[1], 10) : 0;
  };
  return { top: get('t'), right: get('r'), bottom: get('b'), left: get('l') };
}
