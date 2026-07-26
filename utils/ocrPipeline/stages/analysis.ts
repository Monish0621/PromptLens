/**
 * Stage 1 — AnalysisStage
 *
 * RESPONSIBILITY: Validate the input image and extract metadata.
 *
 * Reads:   ctx.originalImage
 * Writes:  ctx.workingImage  (copy of originalImage — PreprocessStage 2B may replace it)
 *          ctx.metadata      (width, height, aspectRatio, estimatedBytes, mimeType)
 *          ctx.warnings      (if image is suspiciously small)
 *          ctx.errors        (if data URL is invalid or image is empty)
 *
 * This stage does NOT modify image data.
 */
import type { OCRStage, OCRContext, ImageMetadata } from '../types/ocrTypes';
import { ocrLog } from '../utils/ocrLogger';

export class AnalysisStage implements OCRStage {
  readonly name = 'AnalysisStage';

  async execute(ctx: OCRContext): Promise<OCRContext> {
    const dataUrl = ctx.originalImage;

    if (!dataUrl || !dataUrl.startsWith('data:')) {
      ctx.errors.push('[AnalysisStage] Input is not a valid base64 data URL');
      return ctx;
    }

    const mimeMatch = dataUrl.match(/^data:(.*?);base64,/);
    const mimeType  = mimeMatch?.[1] ?? 'image/png';

    const base64Part    = dataUrl.split(',')[1] ?? '';
    const estimatedBytes = Math.round((base64Part.length * 3) / 4);

    if (estimatedBytes === 0) {
      ctx.errors.push('[AnalysisStage] Input image appears to be empty (0 bytes)');
      return ctx;
    }

    let width = 0;
    let height = 0;
    try {
      ({ width, height } = await loadImageDimensions(dataUrl));
    } catch (err: any) {
      ctx.warnings.push(`[AnalysisStage] Could not decode image dimensions: ${err.message}`);
    }

    const metadata: ImageMetadata = {
      width,
      height,
      aspectRatio:    height > 0 ? parseFloat((width / height).toFixed(3)) : 0,
      estimatedBytes,
      mimeType,
    };

    ctx.metadata    = metadata;
    ctx.workingImage = dataUrl;  // PreprocessStage (2B) may replace this

    ocrLog.info(
      `[AnalysisStage] ${width}×${height}px` +
      ` | ~${(estimatedBytes / 1024).toFixed(1)} KB` +
      ` | ${mimeType}`
    );

    if (width > 0 && height > 0 && (width < 16 || height < 16)) {
      ctx.warnings.push(
        `[AnalysisStage] Image is very small (${width}×${height}px). OCR accuracy may be reduced.`
      );
    }

    return ctx;
  }
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img    = new Image();
    img.onload   = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror  = () => reject(new Error('Image failed to load for dimension analysis'));
    img.src      = dataUrl;
  });
}
