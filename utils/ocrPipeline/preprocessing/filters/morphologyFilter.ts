/**
 * Filter: MorphologyCleanupFilter
 * Group:  CLEANUP (4) — priority 20
 *
 * Implements binary erosion, dilation, opening, and closing operations.
 */
import { FilterGroup, FILTER_PRIORITY }             from '../filterPriorities';
import type { FilterResult, CanvasModel, ImageFilter } from '../imageFilter';
import { MorphologyOperation, type FilterRecord, type NormalizationOptions } from '../../types/ocrTypes';

export class MorphologyCleanupFilter implements ImageFilter {
  readonly name     = 'MorphologyCleanupFilter';
  readonly group    = FilterGroup.CLEANUP;
  readonly priority = FILTER_PRIORITY.MORPHOLOGY;

  private _operation: MorphologyOperation | 'both' = MorphologyOperation.OPENING;
  private _kernelSize = 3;

  shouldRun(_model: CanvasModel, options: NormalizationOptions): [true] | [false, string] {
    if (!options.enableMorphology) return [false, 'disabled in config'];
    if (options.preset === 'code') return [false, 'Bypassed for code preset to preserve thin punctuation'];
    const opStr = options.morphologyOperation as string;
    if (opStr === MorphologyOperation.EROSION)  this._operation = MorphologyOperation.EROSION;
    else if (opStr === MorphologyOperation.DILATION) this._operation = MorphologyOperation.DILATION;
    else if (opStr === MorphologyOperation.CLOSING)  this._operation = MorphologyOperation.CLOSING;
    else if (opStr === 'both')                      this._operation = 'both';
    else                                            this._operation = MorphologyOperation.OPENING;

    this._kernelSize = options.morphologyKernelSize <= 3 ? 3 : 5;
    return [true];
  }

  async execute(model: CanvasModel): Promise<FilterResult> {
    const t0                     = performance.now();
    const { ctx, width, height } = model;

    const imageData = ctx.getImageData(0, 0, width, height);
    const src       = new Uint8ClampedArray(imageData.data);
    const k         = this._kernelSize;
    const op        = this._operation;

    let pixels: Uint8ClampedArray;

    if (op === MorphologyOperation.EROSION) {
      pixels = erode(src, width, height, k);
    } else if (op === MorphologyOperation.DILATION) {
      pixels = dilate(src, width, height, k);
    } else if (op === MorphologyOperation.OPENING) {
      pixels = dilate(erode(src, width, height, k), width, height, k);
    } else if (op === MorphologyOperation.CLOSING) {
      pixels = erode(dilate(src, width, height, k), width, height, k);
    } else {
      // 'both': opening then closing
      const opened = dilate(erode(src,    width, height, k), width, height, k);
      pixels       = erode(dilate(opened, width, height, k), width, height, k);
    }

    const result = ctx.createImageData(width, height);
    result.data.set(pixels);
    ctx.putImageData(result, 0, 0);

    return {
      model,
      record: mkRecord(this.name, this.group, this.priority, true, parseFloat((performance.now() - t0).toFixed(2)),
        `${op} — ${k}×${k} — ${width}×${height}px`),
    };
  }
}

function erode(src: Uint8ClampedArray, w: number, h: number, k: number): Uint8ClampedArray {
  const dst  = new Uint8ClampedArray(src.length);
  const half = (k - 1) >> 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let minVal = 255;
      for (let dy = -half; dy <= half; dy++) {
        const ny = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -half; dx <= half; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          const v  = src[(ny * w + nx) * 4];
          if (v < minVal) minVal = v;
        }
      }
      const idx = (y * w + x) * 4;
      dst[idx] = dst[idx + 1] = dst[idx + 2] = minVal;
      dst[idx + 3] = src[idx + 3];
    }
  }
  return dst;
}

function dilate(src: Uint8ClampedArray, w: number, h: number, k: number): Uint8ClampedArray {
  const dst  = new Uint8ClampedArray(src.length);
  const half = (k - 1) >> 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let maxVal = 0;
      for (let dy = -half; dy <= half; dy++) {
        const ny = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -half; dx <= half; dx++) {
          const nx = Math.min(w - 1, Math.max(0, x + dx));
          const v  = src[(ny * w + nx) * 4];
          if (v > maxVal) maxVal = v;
        }
      }
      const idx = (y * w + x) * 4;
      dst[idx] = dst[idx + 1] = dst[idx + 2] = maxVal;
      dst[idx + 3] = src[idx + 3];
    }
  }
  return dst;
}

function mkRecord(name: string, group: FilterGroup, priority: number, applied: boolean, elapsedMs: number, detail?: string): FilterRecord {
  return { filterName: name, group, priority, applied, skipped: false, elapsedMs, detail };
}
