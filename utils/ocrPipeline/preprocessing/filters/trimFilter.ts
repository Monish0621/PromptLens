/**
 * Filter: TrimTransparentBordersFilter
 * Group:  NORMALIZATION (1) — priority 10
 */
import { FilterGroup, FILTER_PRIORITY }             from '../filterPriorities';
import type { FilterResult, CanvasModel, ImageFilter } from '../imageFilter';
import { createCanvasModel }                        from '../imageFilter';
import type { FilterRecord, NormalizationOptions }  from '../../types/ocrTypes';

export class TrimTransparentBordersFilter implements ImageFilter {
  readonly name     = 'TrimTransparentBordersFilter';
  readonly group    = FilterGroup.NORMALIZATION;
  readonly priority = FILTER_PRIORITY.TRIM;

  shouldRun(_model: CanvasModel, options: NormalizationOptions): [true] | [false, string] {
    return options.trimTransparentBorders ? [true] : [false, 'disabled in config'];
  }

  async execute(model: CanvasModel): Promise<FilterResult> {
    const t0                             = performance.now();
    const { canvas, ctx, width, height } = model;

    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, width, height);
    } catch (err: any) {
      return noOp(this.name, this.group, this.priority, model, t0, `getImageData failed: ${err.message}`);
    }

    const data   = imageData.data;
    const stride = width * 4;
    const isTransparent = (x: number, y: number) => data[y * stride + x * 4 + 3] === 0;
    const rowTransparent = (y: number) => { for (let x = 0; x < width;  x++) if (!isTransparent(x, y)) return false; return true; };
    const colTransparent = (x: number) => { for (let y = 0; y < height; y++) if (!isTransparent(x, y)) return false; return true; };

    let top = 0, bottom = height - 1, left = 0, right = width - 1;
    while (top    <= bottom && rowTransparent(top))    top++;
    while (bottom >= top    && rowTransparent(bottom)) bottom--;
    while (left   <= right  && colTransparent(left))   left++;
    while (right  >= left   && colTransparent(right))  right--;

    const cropW = right - left + 1;
    const cropH = bottom - top + 1;
    const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));
    const bounds    = { top, right: width - 1 - right, bottom: height - 1 - bottom, left };

    if (cropW === width && cropH === height) {
      return { model, record: mkRecord(this.name, this.group, this.priority, false, elapsedMs, 'no transparent borders') };
    }

    const trimmed = createCanvasModel(cropW, cropH);
    trimmed.ctx.drawImage(canvas, left, top, cropW, cropH, 0, 0, cropW, cropH);
    return {
      model: trimmed,
      record: mkRecord(this.name, this.group, this.priority, true, elapsedMs, `t=${bounds.top} r=${bounds.right} b=${bounds.bottom} l=${bounds.left}`),
    };
  }

  validate(model: CanvasModel) {
    return { valid: model.width > 0 && model.height > 0, message: `${model.width}×${model.height}px` };
  }
}

function noOp(name: string, group: FilterGroup, priority: number, model: CanvasModel, t0: number, detail: string): FilterResult {
  return { model, record: mkRecord(name, group, priority, false, parseFloat((performance.now() - t0).toFixed(2)), detail) };
}

function mkRecord(name: string, group: FilterGroup, priority: number, applied: boolean, elapsedMs: number, detail?: string): FilterRecord {
  return { filterName: name, group, priority, applied, skipped: false, elapsedMs, detail };
}
