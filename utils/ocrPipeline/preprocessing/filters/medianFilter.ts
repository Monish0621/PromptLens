/**
 * Filter: MedianNoiseReductionFilter
 * Group:  CLEANUP (4) — priority 10
 */
import { FilterGroup, FILTER_PRIORITY }             from '../filterPriorities';
import type { FilterResult, CanvasModel, ImageFilter } from '../imageFilter';
import type { FilterRecord, NormalizationOptions }   from '../../types/ocrTypes';

export class MedianNoiseReductionFilter implements ImageFilter {
  readonly name     = 'MedianNoiseReductionFilter';
  readonly group    = FilterGroup.CLEANUP;
  readonly priority = FILTER_PRIORITY.MEDIAN;

  private _kernelSize = 3;

  shouldRun(_model: CanvasModel, options: NormalizationOptions): [true] | [false, string] {
    if (!options.enableMedianFilter) return [false, 'disabled in config'];
    if (options.preset === 'code') return [false, 'Bypassed for code preset to preserve thin punctuation'];
    const k = options.medianKernelSize;
    this._kernelSize = (k === 5) ? 5 : 3;
    return [true];
  }

  async execute(model: CanvasModel): Promise<FilterResult> {
    const t0                     = performance.now();
    const { ctx, width, height } = model;
    const k                      = this._kernelSize;
    const half                   = (k - 1) >> 1;
    const neighborCount          = k * k;
    const medianIdx              = (neighborCount - 1) >> 1;

    const imageData = ctx.getImageData(0, 0, width, height);
    const src       = imageData.data;
    const dst       = new Uint8ClampedArray(src);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const neighbors: number[] = new Array(neighborCount);
        let   idx = 0;

        for (let dy = -half; dy <= half; dy++) {
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          for (let dx = -half; dx <= half; dx++) {
            const nx = Math.min(width  - 1, Math.max(0, x + dx));
            neighbors[idx++] = src[(ny * width + nx) * 4];
          }
        }

        neighbors.sort((a, b) => a - b);
        const medVal = neighbors[medianIdx];

        const dstIdx      = (y * width + x) * 4;
        dst[dstIdx]       = medVal;
        dst[dstIdx + 1]   = medVal;
        dst[dstIdx + 2]   = medVal;
        dst[dstIdx + 3]   = src[dstIdx + 3];
      }
    }

    const result = ctx.createImageData(width, height);
    result.data.set(dst);
    ctx.putImageData(result, 0, 0);

    return {
      model,
      record: mkRecord(this.name, this.group, this.priority, true, parseFloat((performance.now() - t0).toFixed(2)),
        `${k}×${k} kernel — ${width}×${height}px`),
    };
  }
}

function mkRecord(name: string, group: FilterGroup, priority: number, applied: boolean, elapsedMs: number, detail?: string): FilterRecord {
  return { filterName: name, group, priority, applied, skipped: false, elapsedMs, detail };
}
