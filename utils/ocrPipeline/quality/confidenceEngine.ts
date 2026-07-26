/**
 * Confidence Engine & Recommendation Generator — Milestone 2C.1 Refinements
 *
 * Implements configurable QualityAnalyzerWeights, detailed ConfidenceBreakdown,
 * and priority-ranked QualityRecommendation objects.
 *
 * Performance target: < 1ms.
 */
import {
  type AnalyzerResult,
  type ConfidenceBreakdown,
  type ContentType,
  type QualityRecommendation,
  type QualityWarning,
  type QualityAnalyzerWeights,
  DEFAULT_QUALITY_WEIGHTS,
  RECOMMENDATION_PRIORITY,
} from './qualityTypes';

export interface ConfidenceCalculationParams {
  recognitionConfidence: number; // 0-100 from engine
  imageQualityScore:     number; // 0-100 from preprocessing
  analyzers:             AnalyzerResult[];
  contentType:           ContentType;
  weights?:              QualityAnalyzerWeights;
}

export interface ConfidenceEngineResult {
  overallConfidence:   number;
  confidenceBreakdown: ConfidenceBreakdown;
  warnings:            QualityWarning[];
  recommendations:     QualityRecommendation[];
  metrics:             Record<string, unknown>;
}

export function calculateConfidence(
  params: ConfidenceCalculationParams
): ConfidenceEngineResult {
  const {
    recognitionConfidence,
    imageQualityScore,
    analyzers,
    contentType,
    weights = DEFAULT_QUALITY_WEIGHTS,
  } = params;

  // Extract analyzer scores
  const charAnalyzer    = analyzers.find(a => a.name === 'CharacterAnalyzer');
  const structAnalyzer  = analyzers.find(a => a.name === 'StructureAnalyzer');
  const contentAnalyzer = analyzers.find(a => a.name === 'ContentAnalyzer');

  const charScore    = charAnalyzer?.score   ?? 100;
  const structScore  = structAnalyzer?.score ?? 100;
  const contentScore = contentAnalyzer?.score ?? 100;

  // Collect all warnings
  const warnings: QualityWarning[] = [];
  for (const a of analyzers) {
    warnings.push(...a.warnings);
  }

  // ── Calculate Weighted Contributions ─────────────────────────────────────
  const engineContrib = Math.round(recognitionConfidence * weights.engineConfidence);
  const imageContrib  = Math.round(imageQualityScore     * weights.imageQuality);
  const charContrib   = Math.round(charScore             * weights.characterQuality);
  const structContrib = Math.round(structScore           * weights.structureQuality);
  const contentContrib= Math.round(contentScore          * weights.contentQuality);

  const baseScore =
      recognitionConfidence * weights.engineConfidence
    + imageQualityScore     * weights.imageQuality
    + charScore             * weights.characterQuality
    + structScore           * weights.structureQuality
    + contentScore          * weights.contentQuality;

  // ── Apply Penalty Rules ───────────────────────────────────────────────────
  let totalPenalty = 0;
  for (const w of warnings) {
    if (w.severity === 'critical')     totalPenalty += 25;
    else if (w.severity === 'high')   totalPenalty += 12;
    else if (w.severity === 'medium') totalPenalty += 5;
    else if (w.severity === 'low')    totalPenalty += 2;
  }

  const overallConfidence = Math.max(
    0,
    Math.min(100, Math.round(baseScore - totalPenalty))
  );

  const confidenceBreakdown: ConfidenceBreakdown = {
    engineContribution:    engineContrib,
    imageContribution:     imageContrib,
    characterContribution: charContrib,
    structureContribution: structContrib,
    contentContribution:   contentContrib,
    penalties:             totalPenalty,
    finalScore:            overallConfidence,
  };

  // ── Generate Recommendations with Priority ───────────────────────────────
  const recommendations: QualityRecommendation[] = [];

  // Recommendation 1: Accept vs Retry
  if (overallConfidence >= 80) {
    recommendations.push({
      type:     'AcceptResult',
      priority: RECOMMENDATION_PRIORITY.AcceptResult,
      reason:   `High overall confidence (${overallConfidence}/100)`,
      metadata: { overallConfidence },
    });
  } else if (overallConfidence < 65) {
    recommendations.push({
      type:     'RetryRecommended',
      priority: RECOMMENDATION_PRIORITY.RetryRecommended,
      reason:   `Overall confidence (${overallConfidence}/100) below threshold (65)`,
      metadata: { overallConfidence, imageQualityScore },
    });
  }

  // Recommendation 2: Profile Selection
  if (contentType === 'code' || contentType === 'json') {
    recommendations.push({
      type:             'UseCodeProfile',
      priority:         RECOMMENDATION_PRIORITY.UseCodeProfile,
      reason:           `Detected ${contentType.toUpperCase()} content type — monospaced code profile suggested`,
      suggestedProfile: 'code',
      metadata:         { contentType },
    });
  } else if (contentType === 'prose' || contentType === 'markdown') {
    recommendations.push({
      type:             'UseDocumentProfile',
      priority:         RECOMMENDATION_PRIORITY.UseDocumentProfile,
      reason:           `Detected ${contentType.toUpperCase()} content type — document profile suggested`,
      suggestedProfile: 'document',
      metadata:         { contentType },
    });
  }

  // Recommendation 3: Preprocessing Adjustments
  if (imageQualityScore < 50) {
    recommendations.push({
      type:     'IncreaseContrast',
      priority: RECOMMENDATION_PRIORITY.IncreaseContrast,
      reason:   `Low image quality score (${imageQualityScore}/100) — enhanced contrast recommended`,
      metadata: { imageQualityScore },
    });
    recommendations.push({
      type:     'UpscaleImage',
      priority: RECOMMENDATION_PRIORITY.UpscaleImage,
      reason:   `Low image quality score (${imageQualityScore}/100) — higher scale factor recommended`,
      metadata: { imageQualityScore },
    });
  }

  // Recommendation 4: Low Confidence Tag
  if (overallConfidence < 50) {
    recommendations.push({
      type:     'LowConfidence',
      priority: RECOMMENDATION_PRIORITY.LowConfidence,
      reason:   `Result flagged as low confidence (${overallConfidence}/100)`,
      metadata: { overallConfidence },
    });
  }

  // Sort recommendations by priority descending (highest priority recommendation first)
  recommendations.sort((a, b) => b.priority - a.priority);

  const metrics = {
    baseScore: parseFloat(baseScore.toFixed(2)),
    totalPenalty,
    recognitionConfidence,
    imageQualityScore,
    charScore,
    structScore,
    contentScore,
  };

  return {
    overallConfidence,
    confidenceBreakdown,
    warnings,
    recommendations,
    metrics,
  };
}
