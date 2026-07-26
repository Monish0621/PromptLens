/**
 * Filter: AdaptiveGrayscaleFilter
 * Group:  ENHANCEMENT (2) — priority 20
 */
import { FilterGroup, FILTER_PRIORITY }             from '../filterPriorities';
import type { FilterResult, CanvasModel, ImageFilter } from '../imageFilter';
import type { FilterRecord, NormalizationOptions }   from '../../types/ocrTypes';

const LUM_R = 0.299;
const LUM_G = 0.587;
const LUM_B = 0.114;

export class AdaptiveGrayscaleFilter implements ImageFilter {
  readonly name     = 'AdaptiveGrayscaleFilter';
  readonly group    = FilterGroup.ENHANCEMENT;
  readonly priority = FILTER_PRIORITY.GRAYSCALE;

  shouldRun(_model: CanvasModel, options: NormalizationOptions): [true] | [false, string] {
    return options.enableGrayscale ? [true] : [false, 'disabled in config'];
  }

  async execute(model: CanvasModel): Promise<FilterResult> {
    const t0                     = performance.now();
    const { ctx, width, height } = model;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data      = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const y     = (LUM_R * data[i] + LUM_G * data[i + 1] + LUM_B * data[i + 2]) | 0;
      data[i]     = y;
      data[i + 1] = y;
      data[i + 2] = y;
    }

    ctx.putImageData(imageData, 0, 0);

    return {
      model,
      record: mkRecord(this.name, this.group, this.priority, true, parseFloat((performance.now() - t0).toFixed(2)),
        `BT.601 — ${width}×${height}px`),
    };
  }
}

function mkRecord(name: string, group: FilterGroup, priority: number, applied: boolean, elapsedMs: number, detail?: string): FilterRecord {
  return { filterName: name, group, priority, applied, skipped: false, elapsedMs, detail };
}
