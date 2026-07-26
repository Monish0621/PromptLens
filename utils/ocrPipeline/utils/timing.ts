/**
 * OCR Pipeline — Stage Timing Runner
 *
 * runStage() is the single entry point for every stage execution.
 * No stage measures its own timing. No stage handles its own top-level exceptions.
 *
 * What runStage() does automatically for every stage:
 *   1. Records performance.now() before and after execute().
 *   2. Writes a StageResult into ctx.stageResults[stage.name].
 *   3. Catches unexpected throws → pushes to ctx.errors → never propagates.
 *   4. Logs a structured summary line via ocrLog.stageSummary().
 *
 * Abort-on-error policy:
 *   The orchestrator (pipeline.ts) checks ctx.errors.length after each
 *   runStage() call and stops the loop if errors are present.  runStage()
 *   itself never stops the pipeline — that decision belongs to the orchestrator.
 */
import type { OCRContext, OCRStage, StageStatus } from '../types/ocrTypes';
import { ocrLog } from './ocrLogger';

export async function runStage(stage: OCRStage, ctx: OCRContext): Promise<OCRContext> {
  const startedAt = performance.now();

  try {
    ctx = await stage.execute(ctx);
  } catch (err: any) {
    const errorMsg = err?.message ?? String(err);
    ctx.errors.push(`[${stage.name}] Unexpected exception: ${errorMsg}`);
    ocrLog.error(`[${stage.name}] Threw unexpectedly: ${errorMsg}`, err);
  }

  const finishedAt = performance.now();
  const elapsedMs  = parseFloat((finishedAt - startedAt).toFixed(2));

  // Determine status: if this stage added to ctx.errors, mark as error.
  // If it added to ctx.warnings, mark as warning.
  // Otherwise success.
  const prevErrorCount   = ctx.stageResults[stage.name]?.error ? 1 : 0;
  const hasError         = ctx.errors.some(e => e.startsWith(`[${stage.name}]`));
  const hasWarning       = ctx.warnings.some(w => w.startsWith(`[${stage.name}]`));
  const status: StageStatus = hasError   ? 'error'
                            : hasWarning ? 'warning'
                            : 'success';

  ctx.stageResults[stage.name] = {
    stageName:  stage.name,
    status,
    startedAt,
    finishedAt,
    elapsedMs,
  };

  if (ctx.config.debug.logTimings) {
    ocrLog.stageSummary(stage.name, status, elapsedMs);
  }

  return ctx;
}
