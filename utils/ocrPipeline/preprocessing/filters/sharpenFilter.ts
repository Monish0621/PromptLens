/**
 * Filter: SharpenFilter
 * Group:  FINALIZATION (6) — priority 10
 */
import { FilterGroup, FILTER_PRIORITY }             from '../filterPriorities';
import type { FilterResult, CanvasModel, ImageFilter } from '../imageFilter';
import type { FilterRecord, NormalizationOptions }   from '../../types/ocrTypes';

export class SharpenFilter implements ImageFilter {
  readonly name     = 'SharpenFilter';
  readonly group    = FilterGroup.FINALIZATION;
  readonly priority = FILTER_PRIORITY.SHARPEN;

  private _amount = 0.5;

  shouldRun(_model: CanvasModel, options: NormalizationOptions): [true] | [false, string] {
    if (!options.sharpen) return [false, 'disabled in config'];
    this._amount = options.sharpenAmount ?? 0.5;
    return [true];
  }

  async execute(model: CanvasModel): Promise<FilterResult> {
    const t0                     = performance.now();
    const { ctx, width, height } = model;
    const amount                 = this._amount;

    const imageData = ctx.getImageData(0, 0, width, height);
    const src       = imageData.data;
    const len       = src.length;

    const blurred = new Uint8ClampedArray(len);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sumR = 0, sumG = 0, sumB = 0;
        let count = 0;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -1; dx <= 1; dx++) {
            const nx = Math.min(width - 1, Math.max(0, x + dx));
            const idx = (ny * width + nx) * 4;
            sumR += src[idx];
            sumG += src[idx + 1];
            sumB += src[idx + 2];
            count++;
          }
        }

        const dstIdx        = (y * width + x) * 4;
        blurred[dstIdx]     = (sumR / count) | 0;
        blurred[dstIdx + 1] = (sumG / count) | 0;
        blurred[dstIdx + 2] = (sumB / count) | 0;
        blurred[dstIdx + 3] = src[dstIdx + 3];
      }
    }

    for (let i = 0; i < len; i += 4) {
      const origR = src[i];
      const origG = src[i + 1];
      const origB = src[i + 2];

      const diffR = origR - blurred[i];
      const diffG = origG - blurred[i + 1];
      const diffB = origB - blurred[i + 2];

      src[i]     = Math.min(255, Math.max(0, Math.round(origR + amount * diffR)));
      src[i + 1] = Math.min(255, Math.max(0, Math.round(origG + amount * diffG)));
      src[i + 2] = Math.min(255, Math.max(0, Math.round(origB + amount * diffB)));
    }

    ctx.putImageData(imageData, 0, 0);

    return {
      model,
      record: mkRecord(this.name, this.group, this.priority, true, parseFloat((performance.now() - t0).toFixed(2)),
        `unsharp mask (amount=${amount.toFixed(2)}) — ${width}×${height}px`),
    };
  }
}

function mkRecord(name: string, group: FilterGroup, priority: number, applied: boolean, elapsedMs: number, detail?: string): FilterRecord {
  return { filterName: name, group, priority, applied, skipped: false, elapsedMs, detail };
}
