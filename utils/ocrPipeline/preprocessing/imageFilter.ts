/**
 * Image Filter Framework — Core Types & Lifecycle
 *
 * Defines the ImageFilter interface, CanvasModel, FilterResult, SnapshotReference,
 * and the 4-stage filter lifecycle (analyze -> shouldRun -> execute -> validate).
 *
 * FILTER LIFECYCLE
 * ─────────────────────────────────────────
 * 1. analyze?(model, options)     — Collect pre-execution metrics (e.g. skew angle, noise level).
 * 2. shouldRun(model, options)    — Precondition check returning [true] or [false, reason].
 * 3. execute(model)               — Perform the transformation.
 * 4. validate?(model)             — Post-execution check verifying output state.
 *
 * FILTER GROUPS & PRIORITIES
 * ─────────────────────────────────────────
 * Every filter declares `readonly group: FilterGroup` and `readonly priority: number`.
 * Execution order = group ascending -> priority ascending.
 */
import type { FilterRecord, NormalizationOptions } from '../types/ocrTypes';
import type { FilterGroup }                        from './filterPriorities';

// Re-export FilterGroup for convenience
export { FilterGroup } from './filterPriorities';

// ─────────────────────────────────────────────────────────────────────────────
// CanvasModel  (the shared image state passed between filters)
// ─────────────────────────────────────────────────────────────────────────────

export interface CanvasModel {
  canvas: HTMLCanvasElement;
  ctx:    CanvasRenderingContext2D;
  width:  number;
  height: number;
}

/** Create a blank CanvasModel of the given dimensions. */
export function createCanvasModel(width: number, height: number): CanvasModel {
  const canvas  = document.createElement('canvas');
  canvas.width  = width;
  canvas.height = height;
  const ctx     = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('[ImageFilter] Failed to obtain 2D rendering context');
  return { canvas, ctx, width, height };
}

// ─────────────────────────────────────────────────────────────────────────────
// SnapshotReference  (Memory-efficient debug snapshots)
// ─────────────────────────────────────────────────────────────────────────────

export interface SnapshotReference {
  /** Filter class name */
  filterName: string;
  /** Filter group */
  group:      FilterGroup;
  /** Image dimensions at snapshot time */
  width:      number;
  height:     number;
  /** Timestamp (performance.now()) */
  timestamp:  number;
  /** Browser Object URL (blob URL) or Base64 data URL */
  objectUrl?: string;
  dataUrl?:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter Lifecycle Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export interface AnalysisResult {
  canRun?: boolean;
  reason?: string;
  data?:   Record<string, unknown>;
}

export interface ValidationResult {
  valid:    boolean;
  message?: string;
}

export interface FilterResult {
  /** Updated canvas model (may be a new instance if dimensions changed). */
  model:  CanvasModel;
  /** Execution record for statistics and logging. */
  record: FilterRecord;
}

// ─────────────────────────────────────────────────────────────────────────────
// ImageFilter  (interface every algorithm implements)
// ─────────────────────────────────────────────────────────────────────────────

export interface ImageFilter {
  /** Class name / stable identifier */
  readonly name:     string;
  /** Filter category (NORMALIZATION -> FINALIZATION) */
  readonly group:    FilterGroup;
  /** Intra-group ordering priority */
  readonly priority: number;

  /**
   * Stage 1: Analyze image state before execution.
   * Optional. Collects data needed by shouldRun() or execute().
   */
  analyze?(model: CanvasModel, options: NormalizationOptions): Promise<AnalysisResult> | AnalysisResult;

  /**
   * Stage 2: Precondition check to determine if execute() should run.
   */
  shouldRun(
    model: CanvasModel,
    options: NormalizationOptions,
    analysis?: AnalysisResult
  ): [true] | [false, string];

  /**
   * Stage 3: Perform image transformation.
   */
  execute(model: CanvasModel, analysis?: AnalysisResult): Promise<FilterResult>;

  /**
   * Stage 4: Post-execution validation to verify output quality.
   * Optional. Returns valid: true/false and a status message.
   */
  validate?(model: CanvasModel): Promise<ValidationResult> | ValidationResult;
}
