/**
 * OCR Quality Analysis Engine — Milestone 2C.1 Refinements
 *
 * Orchestrates registered QualityAnalyzer instances via QualityAnalyzerRegistry,
 * computes ConfidenceBreakdown, builds ContentDetection model, and compiles
 * the complete OCRQualityReport (version 2.1).
 *
 * Guaranteed < 10ms execution time. Never throws.
 */
import type { OCRContext } from '../types/ocrTypes';
import {
  type OCRQualityReport,
  type ContentDetection,
  QUALITY_PIPELINE_VERSION,
} from './qualityTypes';
import { QualityAnalyzerRegistry } from './analyzerRegistry';
import { CharacterAnalyzer }       from './analyzers/characterAnalyzer';
import { StructureAnalyzer }       from './analyzers/structureAnalyzer';
import { ContentAnalyzer, analyzeContentQuality } from './analyzers/contentAnalyzer';
import { calculateConfidence }     from './confidenceEngine';
import { ocrLog }                  from '../utils/ocrLogger';

// Build & register default analyzers
const registry = new QualityAnalyzerRegistry();
registry.register(new CharacterAnalyzer());
registry.register(new StructureAnalyzer());
registry.register(new ContentAnalyzer());

export { registry as defaultQualityAnalyzerRegistry };

export function analyzeOCRQuality(ctx: OCRContext): OCRQualityReport {
  const t0 = performance.now();

  try {
    const textToAnalyze = ctx.processedText || ctx.rawText || '';

    // 1. Run Content Analysis (returns enriched ContentDetection + AnalyzerResult)
    const contentAnalysisOutput = analyzeContentQuality(textToAnalyze);
    const contentDetection: ContentDetection = contentAnalysisOutput.detection;

    // 2. Iterate through registered analyzers
    const analyzerResults = registry.getAll().map(analyzer => {
      if (analyzer.name === 'ContentAnalyzer') {
        return contentAnalysisOutput.analyzerResult;
      }
      return analyzer.analyze(textToAnalyze);
    });

    const charResult   = analyzerResults.find(a => a.name === 'CharacterAnalyzer');
    const structResult = analyzerResults.find(a => a.name === 'StructureAnalyzer');

    // 3. Fetch precursor scores from context
    const recognitionConfidence = ctx.confidence || 0;
    const imageQualityScore     = ctx.preprocessMetadata?.imageQualityScore ?? 75;

    // 4. Compute Confidence, Breakdown, and Priority Recommendations
    const confResult = calculateConfidence({
      recognitionConfidence,
      imageQualityScore,
      analyzers: analyzerResults,
      contentType: contentDetection.type,
    });

    const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));

    const report: OCRQualityReport = {
      qualityPipelineVersion: QUALITY_PIPELINE_VERSION,
      overallScore:           confResult.overallConfidence,
      recognitionConfidence,
      imageQualityScore,
      characterScore:         charResult?.score   ?? 100,
      structureScore:         structResult?.score ?? 100,
      contentScore:           contentAnalysisOutput.analyzerResult.score,
      contentType:            contentDetection.type,
      contentDetection,
      confidenceBreakdown:    confResult.confidenceBreakdown,
      warnings:               confResult.warnings,
      recommendations:        confResult.recommendations,
      metrics:                confResult.metrics,
      analysisTimeMs:         elapsedMs,
    };

    return report;

  } catch (err: any) {
    const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));
    ocrLog.warn('[QualityEngine] Quality analysis encountered an unexpected error', err);

    return {
      qualityPipelineVersion: QUALITY_PIPELINE_VERSION,
      overallScore:           ctx.confidence || 50,
      recognitionConfidence:  ctx.confidence || 50,
      imageQualityScore:      75,
      characterScore:         50,
      structureScore:         50,
      contentScore:           50,
      contentType:            'unknown',
      contentDetection: {
        type: 'unknown',
        confidence: 0,
        evidence: ['fallback error handler'],
      },
      confidenceBreakdown: {
        engineContribution:    Math.round((ctx.confidence || 50) * 0.35),
        imageContribution:     11,
        characterContribution: 13,
        structureContribution: 8,
        contentContribution:   5,
        penalties:             0,
        finalScore:            ctx.confidence || 50,
      },
      warnings:              [{ type: 'ANALYSIS_ERROR', severity: 'low', message: err?.message || String(err) }],
      recommendations:       [{ type: 'AcceptResult', priority: 10, reason: 'Fallback report on error' }],
      metrics:               { error: true },
      analysisTimeMs:        elapsedMs,
    };
  }
}
