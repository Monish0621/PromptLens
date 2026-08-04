/**
 * Filter: AdaptiveInvertFilter
 * Group:  ENHANCEMENT (2) — priority 15
 *
 * Automatically detects dark theme backgrounds (luminance < 128) and inverts
 * colors to present black text on a white background for optimal Tesseract recognition.
 */
import { FilterGroup } from '../filterPriorities';
import type { FilterResult, CanvasModel, ImageFilter } from '../imageFilter';
import type { FilterRecord, NormalizationOptions } from '../../types/ocrTypes';

export class AdaptiveInvertFilter implements ImageFilter {
  readonly name     = 'AdaptiveInvertFilter';
  readonly group    = FilterGroup.ENHANCEMENT;
  readonly priority = 15; // Right after upscale (10) and before grayscale (20)

  private _isDarkTheme = false;
  private _bgLuminance = 255;

  shouldRun(model: CanvasModel, _options: NormalizationOptions): [true] | [false, string] {
    const { ctx, width, height } = model;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data      = imageData.data;

    // Sample border pixels (top, bottom, left, right edges) to estimate background luminance
    let totalLum = 0;
    let samples  = 0;

    const samplePixel = (x: number, y: number) => {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      totalLum += (0.299 * r + 0.587 * g + 0.114 * b);
      samples++;
    };

    // Top & bottom edges
    const stepX = Math.max(1, Math.floor(width / 20));
    for (let x = 0; x < width; x += stepX) {
      samplePixel(x, 0);
      samplePixel(x, height - 1);
    }
    // Left & right edges
    const stepY = Math.max(1, Math.floor(height / 20));
    for (let y = 0; y < height; y += stepY) {
      samplePixel(0, y);
      samplePixel(width - 1, y);
    }

    const avgBgLum = samples > 0 ? totalLum / samples : 255;
    this._bgLuminance = Math.round(avgBgLum);
    this._isDarkTheme = avgBgLum < 128;

    if (!this._isDarkTheme) {
      return [false, `Light background detected (avg bg lum=${this._bgLuminance} ≥ 128)`];
    }
    return [true];
  }

  async execute(model: CanvasModel): Promise<FilterResult> {
    const t0                     = performance.now();
    const { ctx, width, height } = model;

    const imageData = ctx.getImageData(0, 0, width, height);
    const data      = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i]     = 255 - data[i];     // Red
      data[i + 1] = 255 - data[i + 1]; // Green
      data[i + 2] = 255 - data[i + 2]; // Blue
      // Alpha data[i + 3] untouched
    }

    ctx.putImageData(imageData, 0, 0);

    return {
      model,
      record: mkRecord(this.name, this.group, this.priority, true, parseFloat((performance.now() - t0).toFixed(2)),
        `Dark theme inverted (bg lum=${this._bgLuminance}) — ${width}×${height}px`),
    };
  }
}

function mkRecord(name: string, group: FilterGroup, priority: number, applied: boolean, elapsedMs: number, detail?: string): FilterRecord {
  return { filterName: name, group, priority, applied, skipped: false, elapsedMs, detail };
}
