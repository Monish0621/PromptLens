/**
 * Retry Result Comparator (Refinements v2.2)
 *
 * Consumes RetryAttempt[] and uses defaultComparatorRegistry to generate
 * a structured ComparisonReport detailing winner selection, score differences,
 * confidence gains, and warning reductions.
 */
import type { ComparisonReport, RetryAttempt, RetryResult } from './retryTypes';
import { defaultComparatorRegistry }                       from './comparatorRegistry';
import { ocrLog }                                         from '../utils/ocrLogger';

export function compareRetryAttempts(attempts: RetryAttempt[]): ComparisonReport {
  const report = defaultComparatorRegistry.evaluateComparison(attempts);

  ocrLog.info(
    `[RetryComparator] Evaluated ${attempts.length} attempt(s). ` +
    `Winner: Attempt #${report.winner.attemptNumber} [${report.winner.profile}] ` +
    `(${report.reason})`
  );

  return report;
}

/** Legacy wrapper for backward compatibility with 2C.2 code */
export function selectBestResult(candidates: RetryResult[]): RetryResult {
  const attempts: RetryAttempt[] = candidates.map(c => ({
    attemptNumber:  c.attempt,
    profile:        c.profile,
    decisionReason: 'legacy wrapper',
    startTime:      0,
    endTime:        0,
    durationMs:     0,
    status:         'success',
    result:         c,
  }));

  const report = compareRetryAttempts(attempts);
  return report.winner.result!;
}
