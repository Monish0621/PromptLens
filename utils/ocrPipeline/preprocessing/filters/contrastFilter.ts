/**
 * Filter: ContrastEnhancementFilter
 * Group:  ENHANCEMENT (2) — priority 30
 */
import { FilterGroup, FILTER_PRIORITY }             from '../filterPriorities';
import type { FilterResult, CanvasModel, ImageFilter } from '../imageFilter';
import type { FilterRecord, NormalizationOptions }   from '../../types/ocrTypes';

export class ContrastEnhancementFilter implements ImageFilter {
  readonly name     = 'ContrastEnhancementFilter';
  readonly group    = FilterGroup.ENHANCEMENT;
  readonly priority = FILTER_PRIORITY.CONTRAST;

  private _lowPct  = 2;
  private _highPct = 98;

  shouldRun(_model: CanvasModel, options: NormalizationOptions): [true] | [false, string] {
    if (!options.enableContrast) return [false, 'disabled in config'];
    this._lowPct  = options.contrastLowPercentile;
    this._highPct = options.contrastHighPercentile;
    return [true];
  }

  async execute(model: CanvasModel): Promise<FilterResult> {
    const t0                     = performance.now();
    const { ctx, width, height } = model;
    const total                  = width * height;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data      = imageData.data;

    const hist = new Int32Array(256);
    for (let i = 0; i < data.length; i += 4) hist[data[i]]++;

    const lowTarget  = (this._lowPct  / 100) * total;
    const highTarget = (this._highPct / 100) * total;
    let cumulative = 0;
    let lowCut = 0, highCut = 255;

    for (let v = 0; v < 256; v++) {
      cumulative += hist[v];
      if (cumulative >= lowTarget  && lowCut  === 0)   lowCut  = v;
      if (cumulative >= highTarget && highCut === 255) { highCut = v; break; }
    }

    if (highCut <= lowCut) {
      return { model, record: mkRecord(this.name, this.group, this.priority, false,
        parseFloat((performance.now() - t0).toFixed(2)), 'uniform image — skipped') };
    }

    const range = highCut - lowCut;
    const lut   = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      lut[v] = Math.min(255, Math.max(0, Math.round(((v - lowCut) / range) * 255)));
    }

    for (let i = 0; i < data.length; i += 4) {
      const m  = lut[data[i]];
      data[i]  = m; data[i + 1] = m; data[i + 2] = m;
    }

    ctx.putImageData(imageData, 0, 0);

    return {
      model,
      record: mkRecord(this.name, this.group, this.priority, true, parseFloat((performance.now() - t0).toFixed(2)),
        `p${this._lowPct}=${lowCut} p${this._highPct}=${highCut} → stretched`),
    };
  }
}

function mkRecord(name: string, group: FilterGroup, priority: number, applied: boolean, elapsedMs: number, detail?: string): FilterRecord {
  return { filterName: name, group, priority, applied, skipped: false, elapsedMs, detail };
}
