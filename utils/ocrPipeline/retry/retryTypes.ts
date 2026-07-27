/**
 * OCR Retry Engine — Core Types & Models (v2.2 Architectural Refinements)
 *
 * Single source of truth for RetryPlan, RetryAttempt, ComparisonReport,
 * RetryBudget, RetrySkippedReason, RetryExecutionSummary, RetryProfile,
 * and RetryResult interfaces.
 */
import type { OCRConfig, OCRContext, OCRStatistics } from '../types/ocrTypes';
import type { OCRQualityReport, ConfidenceBreakdown } from '../quality/qualityTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Retry Profile Names
// ─────────────────────────────────────────────────────────────────────────────

export type RetryProfileName =
  | 'DEFAULT'
  | 'CODE'
  | 'DOCUMENT'
  | 'LOW_RESOLUTION'
  | 'HIGH_CONTRAST';

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export interface RetryProfile {
  name: RetryProfileName;
  description: string;
  configOverrides: DeepPartial<OCRConfig>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Plan Model
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryPlanStep {
  attempt: number;
  profile: RetryProfileName;
  reason:  string;
}

export interface RetryPlan {
  strategyName: string;
  steps:        RetryPlanStep[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Attempt Model
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryAttempt {
  attemptNumber:  number;
  profile:        RetryProfileName;
  decisionReason: string;
  startTime:      number;
  endTime:        number;
  durationMs:     number;
  status:         'success' | 'failure' | 'skipped';
  result:         RetryResult | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Budget
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryBudget {
  maximumAttempts:         number;
  maximumProcessingTimeMs: number;
  minimumConfidenceGain:   number;
}

export const DEFAULT_RETRY_BUDGET: RetryBudget = {
  maximumAttempts:         2,
  maximumProcessingTimeMs: 5000,
  minimumConfidenceGain:   0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Comparison Report
// ─────────────────────────────────────────────────────────────────────────────

export interface ComparisonReport {
  winner:           RetryAttempt;
  reason:           string;
  scoreDifference:  number;
  confidenceGain:   number;
  warningsReduced:  number;
  comparedAttempts: RetryAttempt[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Skipped Reason Model
// ─────────────────────────────────────────────────────────────────────────────

export type RetrySkippedReasonType =
  | 'HighConfidence'
  | 'RetryBudgetExhausted'
  | 'NoRecommendation'
  | 'ProfileAlreadyApplied'
  | 'NoApplicableProfile';

export interface RetrySkippedReason {
  type:      RetrySkippedReasonType;
  reason:    string;
  metadata?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Execution Summary
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryExecutionSummary {
  attemptCount:          number;
  profilesExecuted:      RetryProfileName[];
  winner:                RetryAttempt;
  confidenceImprovement: number;
  processingTimeMs:      number;
  comparisonReport:      ComparisonReport;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Decision Model (Backward Compatible)
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryDecision {
  shouldRetry:     boolean;
  reason:          string;
  priority:        number;
  selectedProfile: RetryProfileName;
  maximumAttempts: number;
  currentAttempt:  number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry Result Model
// ─────────────────────────────────────────────────────────────────────────────

export interface RetryResult {
  profile:             RetryProfileName;
  attempt:             number;
  qualityReport:       OCRQualityReport;
  confidenceBreakdown: ConfidenceBreakdown;
  ocrText:             string;
  statistics:          OCRStatistics | null;
  context:             OCRContext;
}
