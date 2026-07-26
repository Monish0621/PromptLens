/**
 * Quality Analyzer Registry
 *
 * Implements the Analyzer Registry architecture.
 * QualityEngine iterates over all registered QualityAnalyzer instances
 * rather than hardcoding analyzer function calls.
 *
 * ADDING A NEW ANALYZER IN THE FUTURE:
 * 1. Create class implementing QualityAnalyzer in quality/analyzers/.
 * 2. Call defaultAnalyzerRegistry.register(new MyAnalyzer()).
 * Done — zero changes to QualityEngine.
 */
import type { AnalyzerResult } from './qualityTypes';

export interface QualityAnalyzer {
  readonly name: string;
  analyze(text: string, options?: Record<string, unknown>): AnalyzerResult;
}

export class QualityAnalyzerRegistry {
  private analyzers: Map<string, QualityAnalyzer> = new Map();

  register(analyzer: QualityAnalyzer): void {
    this.analyzers.set(analyzer.name, analyzer);
  }

  get(name: string): QualityAnalyzer | undefined {
    return this.analyzers.get(name);
  }

  getAll(): QualityAnalyzer[] {
    return Array.from(this.analyzers.values());
  }

  clear(): void {
    this.analyzers.clear();
  }
}
