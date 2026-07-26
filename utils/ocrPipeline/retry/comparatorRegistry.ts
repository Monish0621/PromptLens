/**
 * Comparator Registry Architecture
 *
 * Mirrors the Analyzer Registry pattern. Decouples result comparison metrics
 * into registered AttemptComparator modules (ConfidenceComparator, WarningComparator,
 * StructureComparator, PenaltyComparator).
 *
 * ADDING A NEW COMPARISON METRIC IN THE FUTURE:
 * 1. Create class implementing AttemptComparator.
 * 2. Register with comparatorRegistry.register().
 * Done — zero changes to RetryComparator or RetryEngine.
 */
import type { ComparisonReport, RetryAttempt } from './retryTypes';

export interface AttemptComparator {
  readonly name: string;
  readonly weight: number;
  /** Returns positive if B is superior to A, negative if A is superior to B, or 0 if equal */
  compare(a: RetryAttempt, b: RetryAttempt): number;
}

export class ConfidenceComparator implements AttemptComparator {
  readonly name = 'ConfidenceComparator';
  readonly weight = 0.40;

  compare(a: RetryAttempt, b: RetryAttempt): number {
    const scoreA = a.result?.qualityReport.overallScore ?? 0;
    const scoreB = b.result?.qualityReport.overallScore ?? 0;
    return scoreB - scoreA;
  }
}

export class WarningComparator implements AttemptComparator {
  readonly name = 'WarningComparator';
  readonly weight = 0.25;

  compare(a: RetryAttempt, b: RetryAttempt): number {
    const warnA = a.result?.qualityReport.warnings.filter(w => w.severity === 'high' || w.severity === 'critical').length ?? 0;
    const warnB = b.result?.qualityReport.warnings.filter(w => w.severity === 'high' || w.severity === 'critical').length ?? 0;
    return warnA - warnB; // Fewer warnings = better (positive if B has fewer warnings)
  }
}

export class StructureComparator implements AttemptComparator {
  readonly name = 'StructureComparator';
  readonly weight = 0.20;

  compare(a: RetryAttempt, b: RetryAttempt): number {
    const structA = (a.result?.qualityReport.characterScore ?? 0) + (a.result?.qualityReport.structureScore ?? 0);
    const structB = (b.result?.qualityReport.characterScore ?? 0) + (b.result?.qualityReport.structureScore ?? 0);
    return structB - structA;
  }
}

export class PenaltyComparator implements AttemptComparator {
  readonly name = 'PenaltyComparator';
  readonly weight = 0.15;

  compare(a: RetryAttempt, b: RetryAttempt): number {
    const penA = a.result?.confidenceBreakdown.penalties ?? 0;
    const penB = b.result?.confidenceBreakdown.penalties ?? 0;
    return penA - penB; // Fewer penalties = better
  }
}

export class ComparatorRegistry {
  private comparators: Map<string, AttemptComparator> = new Map();

  register(comparator: AttemptComparator): void {
    this.comparators.set(comparator.name, comparator);
  }

  getAll(): AttemptComparator[] {
    return Array.from(this.comparators.values());
  }

  evaluateComparison(attempts: RetryAttempt[]): ComparisonReport {
    const valid = attempts.filter(a => a.status === 'success' && a.result !== null);

    if (valid.length === 0) {
      throw new Error('[ComparatorRegistry] No successful retry attempts available for comparison');
    }

    if (valid.length === 1) {
      const single = valid[0];
      return {
        winner:           single,
        reason:           'Single successful attempt — retained as winner',
        scoreDifference:  0,
        confidenceGain:   0,
        warningsReduced:  0,
        comparedAttempts: valid,
      };
    }

    const comparators = this.getAll();

    // Sort valid attempts by weighted comparison
    const sorted = [...valid].sort((a, b) => {
      let total = 0;
      for (const comp of comparators) {
        const diff = comp.compare(a, b);
        total += diff * comp.weight;
      }
      return total < 0 ? -1 : total > 0 ? 1 : 0;
    });

    const winner  = sorted[0];
    const initial = valid[0];

    const initialScore = initial.result?.qualityReport.overallScore ?? 0;
    const winnerScore  = winner.result?.qualityReport.overallScore ?? 0;
    const scoreDiff    = winnerScore - initialScore;

    const initialWarns = initial.result?.qualityReport.warnings.filter(w => w.severity === 'high' || w.severity === 'critical').length ?? 0;
    const winnerWarns  = winner.result?.qualityReport.warnings.filter(w => w.severity === 'high' || w.severity === 'critical').length ?? 0;
    const warnsReduced = initialWarns - winnerWarns;

    const isImproved = winner.attemptNumber !== initial.attemptNumber;
    const reason = isImproved
      ? `Attempt #${winner.attemptNumber} [${winner.profile}] won with overall score ${winnerScore}/100 (+${scoreDiff} gain)`
      : `Initial Attempt #0 retained as winner (overall score ${winnerScore}/100)`;

    return {
      winner,
      reason,
      scoreDifference:  scoreDiff,
      confidenceGain:   Math.max(0, scoreDiff),
      warningsReduced:  Math.max(0, warnsReduced),
      comparedAttempts: valid,
    };
  }
}

// Build and export default registry
const defaultRegistry = new ComparatorRegistry();
defaultRegistry.register(new ConfidenceComparator());
defaultRegistry.register(new WarningComparator());
defaultRegistry.register(new StructureComparator());
defaultRegistry.register(new PenaltyComparator());

export { defaultRegistry as defaultComparatorRegistry };
