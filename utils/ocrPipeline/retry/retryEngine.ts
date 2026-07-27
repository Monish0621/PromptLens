/**
 * OCR Retry Engine (Refinements v2.2)
 *
 * Orchestrates the Intelligent OCR Retry loop:
 *   1. Consumes a RetryStrategy (default ThresholdRetryStrategy) and RetryBudget.
 *   2. Evaluates strategy.shouldRetry() and strategy.generateRetryPlan().
 *   3. Executes steps from RetryPlan, recording each attempt in RetryAttempt models.
 *   4. Evaluates all attempts via compareRetryAttempts() to produce a ComparisonReport.
 *   5. Compiles RetryExecutionSummary and injects winning context back into OCRContext.
 *
 * Performance target: < 1ms orchestration overhead. Fault tolerant — never throws.
 */
import type { OCRContext, OCREngine } from '../types/ocrTypes';
import {
  type ComparisonReport,
  type RetryAttempt,
  type RetryBudget,
  type RetryExecutionSummary,
  type RetryPlan,
  type RetryProfileName,
  type RetryResult,
  type RetrySkippedReason,
  DEFAULT_RETRY_BUDGET,
} from './retryTypes';
import { type RetryStrategy, ThresholdRetryStrategy } from './retryStrategy';
import { getRetryProfile }                             from './retryProfiles';
import { executeRetryPass }                            from './retryExecutor';
import { compareRetryAttempts }                        from './retryComparator';
import { ocrLog }                                      from '../utils/ocrLogger';

export async function runRetryEngine(
  ctx: OCRContext,
  engine: OCREngine,
  strategy: RetryStrategy = new ThresholdRetryStrategy(),
  budget: RetryBudget = DEFAULT_RETRY_BUDGET
): Promise<OCRContext> {
  const t0 = performance.now();

  try {
    ctx.retryBudget = budget;

    // ── 1. Build Attempt #0 (Initial Pass) Model ────────────────────────────
    const initialReport    = ctx.qualityReport;
    const initialBreakdown = ctx.confidenceBreakdown;
    const initialText      = ctx.correctedText || ctx.processedText || ctx.rawText;
    const initialScore     = initialReport?.overallScore ?? ctx.confidence ?? 0;

    const initialResult: RetryResult = {
      profile:             'DEFAULT',
      attempt:             0,
      qualityReport:       initialReport || {
        qualityPipelineVersion: '2.1',
        overallScore: initialScore,
        recognitionConfidence: ctx.confidence,
        imageQualityScore: 75,
        characterScore: 50,
        structureScore: 50,
        contentScore: 50,
        contentType: (ctx.contentType as any) || 'unknown',
        contentDetection: { type: 'unknown', confidence: 0, evidence: [] },
        confidenceBreakdown: initialBreakdown || {
          engineContribution: Math.round(ctx.confidence * 0.35),
          imageContribution: 11,
          characterContribution: 13,
          structureContribution: 8,
          contentContribution: 5,
          penalties: 0,
          finalScore: initialScore,
        },
        warnings: [],
        recommendations: [],
        metrics: {},
        analysisTimeMs: 0,
      },
      confidenceBreakdown: initialBreakdown || {
        engineContribution: Math.round(ctx.confidence * 0.35),
        imageContribution: 11,
        characterContribution: 13,
        structureContribution: 8,
        contentContribution: 5,
        penalties: 0,
        finalScore: initialScore,
      },
      ocrText:    initialText,
      statistics: ctx.statistics,
      context:    ctx,
    };

    const initialAttempt: RetryAttempt = {
      attemptNumber:  0,
      profile:        'DEFAULT',
      decisionReason: 'Initial OCR execution pass',
      startTime:      t0,
      endTime:        t0,
      durationMs:     0,
      status:         'success',
      result:         initialResult,
    };

    // ── 2. Check Strategy Decision ──────────────────────────────────────────
    const shouldRetry = strategy.shouldRetry(ctx, budget);

    if (!shouldRetry) {
      const skippedReason: RetrySkippedReason = strategy.getSkippedReason(ctx, budget) || {
        type:   'HighConfidence',
        reason: 'Skipped by strategy',
      };

      const comparisonReport: ComparisonReport = {
        winner:           initialAttempt,
        reason:           `Retries skipped: ${skippedReason.reason}`,
        scoreDifference:  0,
        confidenceGain:   0,
        warningsReduced:  0,
        comparedAttempts: [initialAttempt],
      };

      const summary: RetryExecutionSummary = {
        attemptCount:          0,
        profilesExecuted:      [],
        winner:                initialAttempt,
        confidenceImprovement: 0,
        processingTimeMs:      0,
        comparisonReport,
      };

      ctx.retryPlan              = { strategyName: strategy.name, steps: [] };
      ctx.retrySkippedReason     = skippedReason;
      ctx.retryExecutionSummary  = summary;
      ctx.comparisonReport       = comparisonReport;
      ctx.retryHistory           = [initialResult];
      ctx.bestRetry              = initialResult;
      ctx.selectedRetryProfile   = 'DEFAULT';

      ocrLog.info(`[Retry] Strategy ................. ${strategy.name}`);
      ocrLog.info(`[Retry] Budget ................... Attempts=${budget.maximumAttempts}`);
      ocrLog.info(`[Retry] Attempt #0 ............... DEFAULT`);
      ocrLog.info(`[Retry] Confidence ............... ${initialScore}`);
      ocrLog.info(`[Retry] Attempt #1 ............... SKIPPED`);
      ocrLog.info(`[Retry] Reason ................... ${skippedReason.reason}`);
      ocrLog.info(`[Retry] Winner ................... Attempt #0`);
      ocrLog.info(`[Retry] Processing Time .......... 0ms`);

      return ctx;
    }

    // ── 3. Generate & Log RetryPlan ─────────────────────────────────────────
    const plan = strategy.generateRetryPlan(ctx, budget);
    ctx.retryPlan = plan;

    const planStr = plan.steps.map(s => s.profile).join(' → ');
    ocrLog.info(`[Retry] Strategy ................. ${strategy.name}`);
    ocrLog.info(`[Retry] Retry Plan ............... ${planStr}`);
    ocrLog.info(`[Retry] Budget ................... Attempts=${budget.maximumAttempts}`);

    // ── 4. Execute Steps from RetryPlan ─────────────────────────────────────
    const attempts: RetryAttempt[] = [initialAttempt];
    const profilesExecuted: RetryProfileName[] = [];
    let currentScore = initialScore;

    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];

      // Check if previous attempt already achieved high confidence (>= 80)
      if (currentScore >= 80) {
        ocrLog.info(`[Retry] Attempt #${step.attempt} ............... SKIPPED`);
        ocrLog.info(`[Retry] Reason ................... Confidence gain exceeded threshold (score: ${currentScore})`);

        attempts.push({
          attemptNumber:  step.attempt,
          profile:        step.profile,
          decisionReason: `Skipped: Previous attempt achieved score ${currentScore} >= 80`,
          startTime:      performance.now(),
          endTime:        performance.now(),
          durationMs:     0,
          status:         'skipped',
          result:         null,
        });
        continue;
      }

      ocrLog.info(`[Retry] Attempt #${step.attempt} ............... ${step.profile}`);
      const stepT0 = performance.now();
      const profile = getRetryProfile(step.profile);
      profilesExecuted.push(step.profile);

      const retryRes = await executeRetryPass(ctx, profile, step.attempt, engine);
      const stepT1 = performance.now();
      const stepDuration = parseFloat((stepT1 - stepT0).toFixed(2));

      if (retryRes) {
        const attemptScore = retryRes.qualityReport.overallScore;
        currentScore = Math.max(currentScore, attemptScore);

        ocrLog.info(`[Retry] Confidence ............... ${attemptScore}`);

        attempts.push({
          attemptNumber:  step.attempt,
          profile:        step.profile,
          decisionReason: step.reason,
          startTime:      stepT0,
          endTime:        stepT1,
          durationMs:     stepDuration,
          status:         'success',
          result:         retryRes,
        });
      } else {
        ocrLog.warn(`[Retry] Attempt #${step.attempt} [${step.profile}] failed — recording failure`);
        attempts.push({
          attemptNumber:  step.attempt,
          profile:        step.profile,
          decisionReason: `${step.reason} (failed execution)`,
          startTime:      stepT0,
          endTime:        stepT1,
          durationMs:     stepDuration,
          status:         'failure',
          result:         null,
        });
      }
    }

    // ── 5. Compare Attempts & Compile Summary ───────────────────────────────
    const comparisonReport = compareRetryAttempts(attempts);
    ctx.comparisonReport  = comparisonReport;

    const winnerAttempt = comparisonReport.winner;
    const winnerResult  = winnerAttempt.result!;
    const totalDuration = parseFloat((performance.now() - t0).toFixed(2));

    const summary: RetryExecutionSummary = {
      attemptCount:          profilesExecuted.length,
      profilesExecuted,
      winner:                winnerAttempt,
      confidenceImprovement: comparisonReport.confidenceGain,
      processingTimeMs:      totalDuration,
      comparisonReport,
    };

    ctx.retryExecutionSummary = summary;
    ctx.retrySkippedReason    = null;

    const winnerLabel = winnerAttempt.attemptNumber === 0 ? 'Attempt #0' : `Attempt #${winnerAttempt.attemptNumber}`;
    ocrLog.info(`[Retry] Winner ................... ${winnerLabel}`);
    ocrLog.info(`[Retry] Processing Time .......... ${Math.round(totalDuration)}ms`);

    // ── 6. Apply Winner Context to Main Context ─────────────────────────────
    ctx.workingImage           = winnerResult.context.workingImage;
    ctx.preprocessMetadata     = winnerResult.context.preprocessMetadata;
    ctx.rawText                = winnerResult.context.rawText;
    ctx.wordData               = winnerResult.context.wordData;
    ctx.processedText          = winnerResult.context.processedText;
    ctx.correctedText          = winnerResult.context.correctedText;
    ctx.qualityReport          = winnerResult.qualityReport;
    ctx.confidenceBreakdown    = winnerResult.confidenceBreakdown;
    ctx.contentType            = winnerResult.context.contentType;
    ctx.contentDetection       = winnerResult.context.contentDetection;
    ctx.qualityPipelineVersion = winnerResult.context.qualityPipelineVersion;
    ctx.confidence             = winnerResult.qualityReport.overallScore;
    ctx.retryHistory           = attempts.filter(a => a.result !== null).map(a => a.result!);
    ctx.bestRetry              = winnerResult;
    ctx.selectedRetryProfile   = winnerResult.profile;

    return ctx;

  } catch (err: any) {
    ocrLog.warn('[RetryEngine] Unexpected error in retry engine — preserving original result', err);
    return ctx;
  }
}
