/**
 * Filter Runner — Milestone 2B.3 Refinements
 *
 * Implements the 4-stage filter lifecycle, group-based priority sorting,
 * memory-efficient debug snapshot references, and structured logs.
 *
 * LIFECYCLE FOR EACH FILTER:
 *   1. Analyze   — filter.analyze?(model, options)
 *   2. ShouldRun — filter.shouldRun(model, options, analysis)
 *   3. Execute   — filter.execute(model, analysis)
 *   4. Validate  — filter.validate?(model)
 *
 * SORTING ORDER:
 *   Group (ascending) → Priority (ascending)
 */
import type { FilterRecord, NormalizationOptions } from '../types/ocrTypes';
import type { ImageFilter, CanvasModel, SnapshotReference, AnalysisResult } from './imageFilter';
import { filterGroupLabel } from './filterPriorities';
import { ocrLog }           from '../utils/ocrLogger';

// ─────────────────────────────────────────────────────────────────────────────
// Public Result
// ─────────────────────────────────────────────────────────────────────────────

export interface FilterRunResult {
  /** Final canvas model after all filters. */
  model:     CanvasModel;
  /** Per-filter execution records in execution order. */
  records:   FilterRecord[];
  /** Debug snapshots map (filterName -> SnapshotReference). */
  snapshots: Record<string, SnapshotReference>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Runner
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute an ordered list of image filters on a CanvasModel.
 *
 * Filters are sorted by Group then Priority before execution.
 *
 * @param model    Starting canvas model.
 * @param filters  Unsorted filter registry.
 * @param options  Full NormalizationOptions.
 * @returns        Final CanvasModel + FilterRecord[] + SnapshotReferences.
 */
export async function runFilters(
  model:   CanvasModel,
  filters: ImageFilter[],
  options: NormalizationOptions
): Promise<FilterRunResult> {
  const records:   FilterRecord[]                  = [];
  const snapshots: Record<string, SnapshotReference> = {};

  // ── Sort by Group ascending, then Priority ascending ─────────────────────
  const sorted = [...filters].sort((a, b) => {
    if (a.group !== b.group) return a.group - b.group;
    return a.priority - b.priority;
  });

  ocrLog.debug(
    `[FilterRunner] Execution plan: ${sorted.map(f => `${filterGroupLabel(f.group)}:${f.name}(P${f.priority})`).join(' → ')}`
  );

  let currentGroup = -1;

  for (const filter of sorted) {
    // Log group headers when crossing group boundaries
    if (filter.group !== currentGroup) {
      currentGroup = filter.group;
      ocrLog.debug(`[FilterRunner] ── Group ${currentGroup}: ${filterGroupLabel(filter.group)} ──`);
    }

    // ── Stage 1: Analyze ───────────────────────────────────────────────────
    let analysis: AnalysisResult | undefined;
    let analyzeMs = 0;
    if (typeof filter.analyze === 'function') {
      const tAnalyze = performance.now();
      try {
        analysis = await filter.analyze(model, options);
      } catch (err: any) {
        ocrLog.warn(`[FilterRunner] ${filter.name}.analyze() threw`, err);
      }
      analyzeMs = parseFloat((performance.now() - tAnalyze).toFixed(2));
    }

    // ── Stage 2: ShouldRun ─────────────────────────────────────────────────
    const shouldRunResult = filter.shouldRun(model, options, analysis);
    if (shouldRunResult[0] === false) {
      const skipReason = shouldRunResult[1];
      const record: FilterRecord = {
        filterName: filter.name,
        group:      filter.group,
        priority:   filter.priority,
        applied:    false,
        skipped:    true,
        skipReason,
        elapsedMs:  0,
        analyzeMs,
      };
      records.push(record);
      ocrLog.debug(
        `[FilterRunner] ○ ${filter.name.padEnd(28)} SKIPPED   (${skipReason})`
      );
      continue;
    }

    // ── Stage 3: Execute ───────────────────────────────────────────────────
    const t0 = performance.now();
    let result;
    try {
      result = await filter.execute(model, analysis);
    } catch (err: any) {
      const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));
      const record: FilterRecord = {
        filterName: filter.name,
        group:      filter.group,
        priority:   filter.priority,
        applied:    false,
        skipped:    false,
        skipReason: undefined,
        elapsedMs,
        analyzeMs,
        detail:     `Error: ${err?.message ?? String(err)}`,
      };
      records.push(record);
      ocrLog.error(`[FilterRunner] ${filter.name}.execute() threw unexpectedly`, err);
      continue;
    }

    const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));
    model = result.model;

    // ── Stage 4: Validate ──────────────────────────────────────────────────
    let validateMs = 0;
    let validateMsg = '';
    if (typeof filter.validate === 'function') {
      const tValidate = performance.now();
      try {
        const valRes = await filter.validate(model);
        validateMsg  = valRes.valid ? 'VALID' : `INVALID (${valRes.message || 'failed'})`;
      } catch (err: any) {
        validateMsg = `VALIDATION_ERROR (${err.message})`;
      }
      validateMs = parseFloat((performance.now() - tValidate).toFixed(2));
    }

    // Update execution record
    const record: FilterRecord = {
      filterName: filter.name,
      group:      filter.group,
      priority:   filter.priority,
      applied:    result.record.applied,
      skipped:    false,
      skipReason: undefined,
      elapsedMs,
      analyzeMs,
      validateMs,
      detail:     result.record.detail,
    };
    records.push(record);

    // ── Debug SnapshotReference ───────────────────────────────────────────
    if (options.preprocessSnapshots) {
      snapshots[filter.name] = createSnapshotReference(filter, model);
    }

    // ── Structured Logging ────────────────────────────────────────────────
    const icon     = result.record.applied ? '✔' : '○';
    const status   = result.record.applied ? 'SUCCESS' : 'NO-OP  ';
    const analyzeStr  = analyzeMs > 0 ? ` analyze=${analyzeMs}ms` : '';
    const validateStr = validateMs > 0 ? ` validate=${validateMs}ms (${validateMsg})` : '';
    const detailStr   = result.record.detail ? ` (${result.record.detail})` : '';

    ocrLog.info(
      `[FilterRunner] ${icon} [${filterGroupLabel(filter.group)}] ${filter.name.padEnd(26)} ${status} ${elapsedMs}ms${analyzeStr}${validateStr}${detailStr}`
    );
  }

  return { model, records, snapshots };
}

/**
 * Memory-efficient SnapshotReference creator using HTMLCanvasElement / dataUrl.
 */
function createSnapshotReference(filter: ImageFilter, model: CanvasModel): SnapshotReference {
  const dataUrl = model.canvas.toDataURL('image/png');
  return {
    filterName: filter.name,
    group:      filter.group,
    width:      model.width,
    height:     model.height,
    timestamp:  parseFloat(performance.now().toFixed(2)),
    dataUrl,
  };
}
