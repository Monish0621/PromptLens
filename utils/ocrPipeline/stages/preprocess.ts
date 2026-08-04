/**
 * Stage 2 — PreprocessStage
 *
 * RESPONSIBILITY: Normalize and enhance the working image before recognition.
 *
 * Reads:   ctx.workingImage, ctx.config.preprocessing, ctx.config.debug
 * Writes:  ctx.workingImage        (normalized + enhanced PNG data URL)
 *          ctx.preprocessMetadata  (full filter records + timings)
 *          ctx.preprocessSnapshots (intermediate debug images if debug.preprocessSnapshots=true)
 *          ctx.warnings            (non-fatal issues)
 *          ctx.errors              (fatal — aborts pipeline)
 */
import type { OCRStage, OCRContext } from '../types/ocrTypes';
import { normalizeImage }             from '../utils/imageNormalizer';
import { ocrLog }                     from '../utils/ocrLogger';

export class PreprocessStage implements OCRStage {
  readonly name = 'PreprocessStage';

  async execute(ctx: OCRContext): Promise<OCRContext> {
    const cfg   = ctx.config.preprocessing;
    const debug = ctx.config.debug;

    ocrLog.info('[PreprocessStage] Starting image normalization + enhancement...');

    let normResult;
    try {
      normResult = await normalizeImage(ctx.workingImage, {
        // ── Normalization (2B.1) ──────────────────────────────────────────
        trimTransparentBorders: cfg.trimTransparentBorders,
        normalizeOrientation:   cfg.normalizeOrientation,
        // ── Enhancement (2B.2) ───────────────────────────────────────────
        enableUpscaling:        cfg.enableUpscaling,
        enableGrayscale:        cfg.enableGrayscale,
        enableContrast:         cfg.enableContrast,
        enableThreshold:        cfg.enableThreshold,
        // Upscaling knobs
        minUpscaleDimension:    cfg.minUpscaleDimension,
        maxUpscaleDimension:    cfg.maxUpscaleDimension,
        upscaleTargetDimension: cfg.upscaleTargetDimension,
        maxUpscaleScale:        cfg.maxUpscaleScale,
        // Contrast knobs
        contrastLowPercentile:  cfg.contrastLowPercentile,
        contrastHighPercentile: cfg.contrastHighPercentile,
        // Threshold knobs
        thresholdBlockSize:     cfg.thresholdBlockSize,
        thresholdC:             cfg.thresholdC,
        // ── Cleanup (2B.3) ───────────────────────────────────────────────
        enableMedianFilter:     cfg.enableMedianFilter,
        medianKernelSize:       cfg.medianKernelSize,
        enableMorphology:       cfg.enableMorphology,
        morphologyOperation:    cfg.morphologyOperation,
        morphologyKernelSize:   cfg.morphologyKernelSize,
        // ── Geometry (2B.3) ──────────────────────────────────────────────
        deskew:                 cfg.deskew,
        maxDeskewAngle:         cfg.maxDeskewAngle,
        minDeskewAngle:         cfg.minDeskewAngle,
        deskewAngleStep:        cfg.deskewAngleStep,
        // ── Finalization (2B.3) ───────────────────────────────────────────
        sharpen:                cfg.sharpen,
        sharpenAmount:          cfg.sharpenAmount,
        // ── Preset ────────────────────────────────────────────────────────
        preset:                 ctx.config.preset,
        // ── Debug ────────────────────────────────────────────────────────
        preprocessSnapshots:    debug.preprocessSnapshots,
      });
    } catch (err: any) {
      ctx.errors.push(`[PreprocessStage] Image normalization failed: ${err.message}`);
      ocrLog.error('[PreprocessStage] normalizeImage() threw', err);
      return ctx;
    }

    ctx.workingImage        = normResult.dataUrl;
    ctx.preprocessMetadata  = normResult.metadata;
    ctx.preprocessSnapshots = normResult.snapshots;

    const m = normResult.metadata;

    // Warn if post-normalization image is very small
    if (m.normalizedWidth < 32 || m.normalizedHeight < 32) {
      ctx.warnings.push(
        `[PreprocessStage] Normalized image is very small ` +
        `(${m.normalizedWidth}×${m.normalizedHeight}px). ` +
        `OCR accuracy may be reduced even after upscaling.`
      );
    }

    ocrLog.info(
      `[PreprocessStage] Complete: ${m.originalWidth}×${m.originalHeight}` +
      ` → ${m.normalizedWidth}×${m.normalizedHeight}` +
      ` | executed=${m.filtersExecuted} skipped=${m.filtersSkipped}` +
      ` | applied: [${m.filtersApplied.map(f => f.replace('Filter', '')).join(', ') || 'none'}]` +
      ` | total=${m.totalPreprocessMs}ms`
    );

    return ctx;
  }
}
