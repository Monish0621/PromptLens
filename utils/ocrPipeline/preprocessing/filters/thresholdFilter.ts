/**
 * Filter: AdaptiveThresholdFilter
 * Group:  BINARIZATION (3) — priority 10
 */
import { FilterGroup, FILTER_PRIORITY }             from '../filterPriorities';
import type { FilterResult, CanvasModel, ImageFilter } from '../imageFilter';
import type { FilterRecord, NormalizationOptions }   from '../../types/ocrTypes';

export class AdaptiveThresholdFilter implements ImageFilter {
  readonly name     = 'AdaptiveThresholdFilter';
  readonly group    = FilterGroup.BINARIZATION;
  readonly priority = FILTER_PRIORITY.THRESHOLD;

  private _blockSize = 21;
  private _C         = 10;

  shouldRun(_model: CanvasModel, options: NormalizationOptions): [true] | [false, string] {
    if (!options.enableThreshold) return [false, 'disabled in config'];
    this._blockSize = Math.max(3, options.thresholdBlockSize % 2 === 0
      ? options.thresholdBlockSize + 1 : options.thresholdBlockSize);
    this._C = options.thresholdC;
    return [true];
  }

  async execute(model: CanvasModel): Promise<FilterResult> {
    const t0                     = performance.now();
    const { ctx, width, height } = model;
    const blockSize              = this._blockSize;
    const half                   = (blockSize - 1) >> 1;
    const C                      = this._C;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data      = imageData.data;

    // Build integral image
    const W1       = width + 1;
    const integral = new Int32Array(W1 * (height + 1));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelVal = data[(y * width + x) * 4];
        integral[(y + 1) * W1 + (x + 1)] =
            pixelVal
          + integral[y       * W1 + (x + 1)]
          + integral[(y + 1) * W1 + x      ]
          - integral[y       * W1 + x      ];
      }
    }

    // Threshold pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const x1    = Math.max(0, x - half);
        const x2    = Math.min(width  - 1, x + half);
        const y1    = Math.max(0, y - half);
        const y2    = Math.min(height - 1, y + half);
        const count = (x2 - x1 + 1) * (y2 - y1 + 1);
        const sum   =   integral[(y2 + 1) * W1 + (x2 + 1)]
                      - integral[y1       * W1 + (x2 + 1)]
                      - integral[(y2 + 1) * W1 + x1      ]
                      + integral[y1       * W1 + x1      ];
        const mean  = sum / count;
        const idx   = (y * width + x) * 4;
        const val   = data[idx] < (mean - C) ? 0 : 255;
        data[idx] = data[idx + 1] = data[idx + 2] = val;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    return {
      model,
      record: mkRecord(this.name, this.group, this.priority, true, parseFloat((performance.now() - t0).toFixed(2)),
        `blockSize=${blockSize} C=${C} — ${width}×${height}px`),
    };
  }
}

function mkRecord(name: string, group: FilterGroup, priority: number, applied: boolean, elapsedMs: number, detail?: string): FilterRecord {
  return { filterName: name, group, priority, applied, skipped: false, elapsedMs, detail };
}
