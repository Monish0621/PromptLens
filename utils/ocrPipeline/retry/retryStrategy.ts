/**
 * Retry Strategy Interface & Threshold Implementation
 *
 * Separates retry planning and decision policies from RetryEngine orchestrator.
 * ThresholdRetryStrategy inspects OCRQualityReport and recommendations to
 * produce a structured RetryPlan.
 */
import type { OCRContext } from '../types/ocrTypes';
import {
  type RetryBudget,
  type RetryPlan,
  type RetryPlanStep,
  type RetryProfileName,
  type RetrySkippedReason,
  DEFAULT_RETRY_BUDGET,
} from './retryTypes';

export interface RetryStrategy {
  readonly name: string;
  shouldRetry(ctx: OCRContext, budget?: RetryBudget): boolean;
  generateRetryPlan(ctx: OCRContext, budget?: RetryBudget): RetryPlan;
  getSkippedReason(ctx: OCRContext, budget?: RetryBudget): RetrySkippedReason | null;
}

export class ThresholdRetryStrategy implements RetryStrategy {
  readonly name = 'ThresholdRetryStrategy';

  shouldRetry(ctx: OCRContext, budget: RetryBudget = DEFAULT_RETRY_BUDGET): boolean {
    const reason = this.getSkippedReason(ctx, budget);
    return reason === null;
  }

  getSkippedReason(ctx: OCRContext, budget: RetryBudget = DEFAULT_RETRY_BUDGET): RetrySkippedReason | null {
    const qr              = ctx.qualityReport;
    const recommendations = ctx.recommendations || [];
    const overallScore    = qr?.overallScore ?? ctx.confidence ?? 0;
    const hasCritical     = qr?.warnings.some(w => w.severity === 'critical') ?? false;

    if (overallScore >= 80 && !hasCritical) {
      return {
        type:     'HighConfidence',
        reason:   `High overall confidence (${overallScore}/100) — score exceeds threshold 80`,
        metadata: { overallScore },
      };
    }

    const topRec = recommendations[0];
    if (!topRec || topRec.type === 'AcceptResult' || topRec.priority <= 10) {
      return {
        type:     'NoRecommendation',
        reason:   'Quality Engine recommendations accepted current result',
        metadata: { topRecType: topRec?.type, priority: topRec?.priority },
      };
    }

    return null; // Should retry!
  }

  generateRetryPlan(ctx: OCRContext, budget: RetryBudget = DEFAULT_RETRY_BUDGET): RetryPlan {
    const steps: RetryPlanStep[] = [];
    const maxAttempts = budget.maximumAttempts;

    const rec          = ctx.profileRecommendation;
    const primaryName  = (rec?.selectedProfile || ctx.selectedProfile || 'CODE').toUpperCase() as RetryProfileName;
    const alternatives = rec?.alternatives || ['DOCUMENT', 'LOW_RESOLUTION'];

    // Map specific profile variants (e.g. JSON, HTML, YAML, TERMINAL, MARKDOWN) to valid RetryProfileNames
    const mapToRetryProfileName = (name: string): RetryProfileName => {
      const upper = name.toUpperCase();
      if (['DEFAULT', 'CODE', 'DOCUMENT', 'LOW_RESOLUTION', 'HIGH_CONTRAST'].includes(upper)) {
        return upper as RetryProfileName;
      }
      if (['JSON', 'TERMINAL', 'YAML'].includes(upper)) return 'CODE';
      if (['MARKDOWN', 'HTML'].includes(upper)) return 'DOCUMENT';
      return 'CODE';
    };

    const profile1 = mapToRetryProfileName(primaryName);

    steps.push({
      attempt: 1,
      profile: profile1,
      reason:  `Attempt #1: ProfileSelector recommendation [${primaryName}] (${rec?.confidence ?? 90}% confidence)`,
    });

    // Step 2 Profile Selection (if budget allows 2 attempts)
    if (maxAttempts >= 2) {
      let secondaryRaw = alternatives[0] || 'DOCUMENT';
      let profile2 = mapToRetryProfileName(secondaryRaw);

      if (profile2 === profile1) {
        const alt2 = alternatives[1] || 'LOW_RESOLUTION';
        profile2 = mapToRetryProfileName(alt2);
      }

      if (profile2 === profile1) {
        profile2 = profile1 === 'CODE' ? 'DOCUMENT' : 'CODE';
      }

      steps.push({
        attempt: 2,
        profile: profile2,
        reason:  `Attempt #2: ProfileSelector alternative candidate [${profile2}]`,
      });
    }

    return {
      strategyName: this.name,
      steps,
    };
  }
}
