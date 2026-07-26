/**
 * Retry Decision Engine
 *
 * Consumes structured OCR intelligence (OCRQualityReport, Recommendations,
 * ContentDetection, ImageQualityScore) to deterministically decide:
 *   1. Whether a retry pass should execute.
 *   2. Which RetryProfile should be selected.
 *
 * Strictly NEVER inspects raw text directly — relies 100% on metadata.
 */
import type { OCRContext } from '../types/ocrTypes';
import type { RetryDecision, RetryProfileName } from './retryTypes';

const MAX_RETRY_ATTEMPTS = 2;

export function evaluateRetryDecision(ctx: OCRContext, currentAttempt: number = 0): RetryDecision {
  const qr              = ctx.qualityReport;
  const recommendations = ctx.recommendations || [];
  const contentType     = ctx.contentType || 'unknown';
  const imgQuality      = ctx.preprocessMetadata?.imageQualityScore ?? 75;

  // ── Rule 1: Maximum Retries Hard Limit ────────────────────────────────────
  if (currentAttempt >= MAX_RETRY_ATTEMPTS) {
    return {
      shouldRetry:     false,
      reason:          `Maximum retry attempts limit reached (${MAX_RETRY_ATTEMPTS})`,
      priority:        0,
      selectedProfile: 'DEFAULT',
      maximumAttempts: MAX_RETRY_ATTEMPTS,
      currentAttempt,
    };
  }

  // ── Rule 2: High Confidence Cutoff (Zero Retry Cost) ──────────────────────
  const overallScore = qr?.overallScore ?? ctx.confidence ?? 0;
  const hasCriticalWarning = qr?.warnings.some(w => w.severity === 'critical') ?? false;

  if (overallScore >= 80 && !hasCriticalWarning) {
    return {
      shouldRetry:     false,
      reason:          `High overall confidence (${overallScore}/100) — no retry required`,
      priority:        10,
      selectedProfile: 'DEFAULT',
      maximumAttempts: MAX_RETRY_ATTEMPTS,
      currentAttempt,
    };
  }

  // ── Rule 3: Evaluate Recommendations ─────────────────────────────────────
  const topRec = recommendations[0];

  if (!topRec || topRec.type === 'AcceptResult' || topRec.priority <= 10) {
    return {
      shouldRetry:     false,
      reason:          `Quality Engine recommendations accepted result (score: ${overallScore})`,
      priority:        topRec?.priority ?? 10,
      selectedProfile: 'DEFAULT',
      maximumAttempts: MAX_RETRY_ATTEMPTS,
      currentAttempt,
    };
  }

  // ── Rule 4: Profile Selection Heuristic ──────────────────────────────────
  let selectedProfile: RetryProfileName = 'DEFAULT';

  if (contentType === 'code' || contentType === 'json' || contentType === 'terminal') {
    selectedProfile = 'CODE';
  } else if (contentType === 'prose' || contentType === 'markdown' || contentType === 'html') {
    selectedProfile = 'DOCUMENT';
  } else if (imgQuality < 50) {
    const origW = ctx.preprocessMetadata?.originalWidth ?? 1000;
    selectedProfile = origW < 400 ? 'LOW_RESOLUTION' : 'HIGH_CONTRAST';
  } else if (topRec.type === 'UseCodeProfile') {
    selectedProfile = 'CODE';
  } else if (topRec.type === 'UseDocumentProfile') {
    selectedProfile = 'DOCUMENT';
  } else if (topRec.type === 'UpscaleImage') {
    selectedProfile = 'LOW_RESOLUTION';
  } else if (topRec.type === 'IncreaseContrast') {
    selectedProfile = 'HIGH_CONTRAST';
  } else {
    selectedProfile = 'CODE'; // Default code profile fallback for snippets
  }

  return {
    shouldRetry:     true,
    reason:          `Overall confidence (${overallScore}/100) below threshold — profile [${selectedProfile}] selected via recommendation [${topRec.type}]`,
    priority:        topRec.priority,
    selectedProfile,
    maximumAttempts: MAX_RETRY_ATTEMPTS,
    currentAttempt,
  };
}
