/**
 * Filter: SmartUpscaleFilter
 * Group:  ENHANCEMENT (2) — priority 10
 */
import { FilterGroup, FILTER_PRIORITY }             from '../filterPriorities';
import type { FilterResult, CanvasModel, ImageFilter, AnalysisResult } from '../imageFilter';
import { createCanvasModel }                         from '../imageFilter';
import type { FilterRecord, NormalizationOptions }   from '../../types/ocrTypes';

export class SmartUpscaleFilter implements ImageFilter {
  readonly name     = 'SmartUpscaleFilter';
  readonly group    = FilterGroup.ENHANCEMENT;
  readonly priority = FILTER_PRIORITY.UPSCALE;

  analyze(model: CanvasModel, options: NormalizationOptions): AnalysisResult {
    const minDim = Math.min(model.width, model.height);
    const maxDim = Math.max(model.width, model.height);
    const needsUpscale = options.enableUpscaling && minDim < options.minUpscaleDimension && maxDim < options.maxUpscaleDimension;

    let scale = 1.0;
    if (needsUpscale) {
      const rawScale = options.upscaleTargetDimension / minDim;
      scale = parseFloat(Math.min(rawScale, options.maxUpscaleScale).toFixed(4));
    }

    return {
      canRun: needsUpscale && scale > 1.0,
      data: { minDim, maxDim, scale },
    };
  }

  shouldRun(model: CanvasModel, options: NormalizationOptions, analysis?: AnalysisResult): [true] | [false, string] {
    if (!options.enableUpscaling) return [false, 'disabled in config'];
    if (!analysis?.canRun) {
      const minDim = Math.min(model.width, model.height);
      return [false, `${model.width}×${model.height} already sufficient (min=${minDim}≥${options.minUpscaleDimension})`];
    }
    return [true];
  }

  async execute(model: CanvasModel, analysis?: AnalysisResult): Promise<FilterResult> {
    const t0              = performance.now();
    const { canvas, width, height } = model;
    const scale           = (analysis?.data?.scale as number) || 1.0;
    const newW            = Math.round(width  * scale);
    const newH            = Math.round(height * scale);

    const upscaled        = createCanvasModel(newW, newH);
    upscaled.ctx.imageSmoothingEnabled = true;
    upscaled.ctx.imageSmoothingQuality = 'high';
    upscaled.ctx.drawImage(canvas, 0, 0, newW, newH);

    return {
      model:  upscaled,
      record: mkRecord(this.name, this.group, this.priority, true, parseFloat((performance.now() - t0).toFixed(2)),
        `${width}×${height} → ${newW}×${newH} (${scale.toFixed(2)}×)`),
    };
  }

  validate(model: CanvasModel) {
    return { valid: model.width >= 32 && model.height >= 32, message: `${model.width}×${model.height}px` };
  }
}

function mkRecord(name: string, group: FilterGroup, priority: number, applied: boolean, elapsedMs: number, detail?: string): FilterRecord {
  return { filterName: name, group, priority, applied, skipped: false, elapsedMs, detail };
}
