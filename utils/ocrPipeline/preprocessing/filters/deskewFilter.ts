/**
 * Filter: DeskewFilter
 * Group:  GEOMETRY (5) — priority 10
 *
 * Automatically detects and corrects document skew angle.
 *
 * DIGITAL SCREENSHOT DETECTION (Post-2B.3 Refinement):
 * Screenshots captured from VS Code, Cursor, Chrome, ChatGPT, GitHub, Terminal
 * are inherently axis-aligned digital images with zero rotation skew.
 * During analyze(), we evaluate edge orthogonality and pixel alignment.
 * If strongly identified as a digital screenshot, deskew is skipped immediately,
 * saving GPU/CPU computation time.
 */
import { FilterGroup, FILTER_PRIORITY }             from '../filterPriorities';
import type { FilterResult, CanvasModel, ImageFilter, AnalysisResult } from '../imageFilter';
import { createCanvasModel }                         from '../imageFilter';
import type { FilterRecord, NormalizationOptions }   from '../../types/ocrTypes';

export class DeskewFilter implements ImageFilter {
  readonly name     = 'DeskewFilter';
  readonly group    = FilterGroup.GEOMETRY;
  readonly priority = FILTER_PRIORITY.DESKEW;

  private _maxAngle  = 10;
  private _minAngle  = 0.5;
  private _angleStep = 0.5;
  private _detectedAngle = 0;

  analyze(model: CanvasModel, options: NormalizationOptions): AnalysisResult {
    const { ctx, width, height } = model;
    this._maxAngle  = options.maxDeskewAngle || 10;
    this._minAngle  = options.minDeskewAngle || 0.5;
    this._angleStep = options.deskewAngleStep || 0.5;

    // Check for Digital Screenshot characteristics (axis-aligned UI elements)
    const isDigital = isDigitalScreenshot(ctx, width, height);

    if (isDigital) {
      this._detectedAngle = 0;
      return {
        canRun: false,
        reason: 'digital screenshot detected — zero skew assumed',
        data:   { isDigitalScreenshot: true, detectedAngle: 0 },
      };
    }

    // Estimate angle for camera/scanned image
    const detectedAngle = detectSkewAngle(ctx, width, height, this._maxAngle, this._angleStep);
    this._detectedAngle = detectedAngle;
    const absAngle      = Math.abs(detectedAngle);

    return {
      canRun: absAngle >= this._minAngle,
      reason: absAngle >= this._minAngle
        ? `skew angle ${detectedAngle.toFixed(2)}° detected`
        : `detected ${detectedAngle.toFixed(2)}° < min ${this._minAngle}°`,
      data: { isDigitalScreenshot: false, detectedAngle },
    };
  }

  shouldRun(_model: CanvasModel, options: NormalizationOptions, analysis?: AnalysisResult): [true] | [false, string] {
    if (!options.deskew) return [false, 'disabled in config'];
    if (analysis && !analysis.canRun) {
      return [false, analysis.reason || 'no rotation needed'];
    }
    return [true];
  }

  async execute(model: CanvasModel, analysis?: AnalysisResult): Promise<FilterResult> {
    const t0                     = performance.now();
    const { canvas, width, height } = model;
    const detectedAngle          = (analysis?.data?.detectedAngle as number) ?? this._detectedAngle;
    const absAngle               = Math.abs(detectedAngle);

    if (absAngle < this._minAngle) {
      return {
        model,
        record: mkRecord(this.name, this.group, this.priority, false,
          parseFloat((performance.now() - t0).toFixed(2)),
          `detected ${detectedAngle.toFixed(2)}° < min ${this._minAngle}° — no rotation needed`),
      };
    }

    // Rotate canvas by -detectedAngle to correct alignment
    const radians   = (-detectedAngle * Math.PI) / 180;
    const sin       = Math.abs(Math.sin(radians));
    const cos       = Math.abs(Math.cos(radians));
    const newWidth  = Math.round(width * cos + height * sin);
    const newHeight = Math.round(width * sin + height * cos);

    const rotatedModel = createCanvasModel(newWidth, newHeight);
    const rCtx         = rotatedModel.ctx;

    rCtx.save();
    rCtx.translate(newWidth / 2, newHeight / 2);
    rCtx.rotate(radians);
    rCtx.drawImage(canvas, -width / 2, -height / 2);
    rCtx.restore();

    return {
      model: rotatedModel,
      record: mkRecord(this.name, this.group, this.priority, true,
        parseFloat((performance.now() - t0).toFixed(2)),
        `rotated ${(-detectedAngle).toFixed(2)}° (detected ${detectedAngle.toFixed(2)}°) — ${width}×${height} → ${newWidth}×${newHeight}`),
    };
  }

  validate(model: CanvasModel) {
    return { valid: model.width > 0 && model.height > 0, message: `${model.width}×${model.height}px` };
  }

  get detectedAngle(): number {
    return this._detectedAngle;
  }
}

/**
 * Detect digital screenshot characteristics:
 * Digital UI captures (IDE, browser, terminal) have 100% axis-aligned horizontal/vertical lines.
 * Sample row/column pixel differences — if > 92% of gradient transitions are strictly vertical/horizontal,
 * it is a digital screenshot with zero rotation skew.
 */
function isDigitalScreenshot(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const sampleW = Math.min(w, 200);
  const sampleH = Math.min(h, 200);
  const imageData = ctx.getImageData(0, 0, sampleW, sampleH);
  const data = imageData.data;

  let axisAlignedTransitions = 0;
  let totalTransitions       = 0;

  for (let y = 1; y < sampleH - 1; y += 2) {
    for (let x = 1; x < sampleW - 1; x += 2) {
      const idx  = (y * sampleW + x) * 4;
      const r    = data[idx];
      const rR   = data[idx + 4]; // right neighbor
      const rD   = data[(idx + sampleW * 4)]; // down neighbor

      const diffX = Math.abs(r - rR);
      const diffY = Math.abs(r - rD);

      if (diffX > 30 || diffY > 30) {
        totalTransitions++;
        // Sharp single-axis step change indicates digital UI element boundary
        if ((diffX > 30 && diffY < 5) || (diffY > 30 && diffX < 5)) {
          axisAlignedTransitions++;
        }
      }
    }
  }

  if (totalTransitions < 10) return true; // Very clean/uniform image (digital)
  const ratio = axisAlignedTransitions / totalTransitions;
  return ratio >= 0.70; // High proportion of perfect axis-aligned UI edges
}

function detectSkewAngle(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  maxAngle: number,
  step: number
): number {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data      = imageData.data;

  const sampleScale = Math.max(1, Math.floor(Math.max(w, h) / 300));
  const sw          = Math.floor(w / sampleScale);
  const sh          = Math.floor(h / sampleScale);

  const grid = new Uint8Array(sw * sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const srcIdx = ((y * sampleScale) * w + (x * sampleScale)) * 4;
      const val    = data[srcIdx];
      grid[y * sw + x] = val < 128 ? 1 : 0;
    }
  }

  let maxVariance = -1;
  let bestAngle   = 0;

  for (let angle = -maxAngle; angle <= maxAngle; angle += step) {
    const rad = (angle * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const proj = new Float64Array(sh);

    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        if (grid[y * sw + x] === 1) {
          const ry = Math.round(-x * sin + y * cos);
          if (ry >= 0 && ry < sh) {
            proj[ry]++;
          }
        }
      }
    }

    let sum = 0, sumSq = 0;
    for (let i = 0; i < sh; i++) {
      sum   += proj[i];
      sumSq += proj[i] * proj[i];
    }
    const mean     = sum / sh;
    const variance = (sumSq / sh) - (mean * mean);

    if (variance > maxVariance) {
      maxVariance = variance;
      bestAngle   = angle;
    }
  }

  return parseFloat(bestAngle.toFixed(2));
}

function mkRecord(name: string, group: FilterGroup, priority: number, applied: boolean, elapsedMs: number, detail?: string): FilterRecord {
  return { filterName: name, group, priority, applied, skipped: false, elapsedMs, detail };
}
