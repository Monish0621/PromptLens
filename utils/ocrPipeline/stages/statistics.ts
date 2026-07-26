/**
 * Stage 8 — StatisticsStage
 *
 * RESPONSIBILITY: Compute the final aggregate statistics for the OCR run.
 *
 * Reads:   ctx.correctedText, ctx.wordData, ctx.metadata,
 *          ctx.preprocessMetadata, ctx.stageResults (for per-stage timing),
 *          ctx.config, ctx.pipelineVersion
 * Writes:  ctx.statistics (OCRStatistics)
 *
 * This stage always runs last in the registry so that all timing data
 * from previous stages is already available in ctx.stageResults.
 *
 * Timing fields are extracted from stageResults by name.
 * If a stage was skipped or errored its elapsedMs is 0.
 */
import type { OCRStage, OCRContext, OCRStatistics } from '../types/ocrTypes';
import { ocrLog } from '../utils/ocrLogger';

export class StatisticsStage implements OCRStage {
  readonly name = 'StatisticsStage';

  async execute(ctx: OCRContext): Promise<OCRContext> {
    const text = ctx.correctedText;

    // ── Text metrics ─────────────────────────────────────────────────────────
    const words = text.trim() ? text.trim().split(/\s+/) : [];
    const lines = text.trim() ? text.split('\n')          : [];

    const wordCount = words.length;
    const charCount = text.replace(/\s/g, '').length;
    const lineCount = lines.length;

    // ── Confidence metrics ────────────────────────────────────────────────────
    const confidences = ctx.wordData.map(w => w.confidence);
    const meanWordConfidence = confidences.length
      ? parseFloat((confidences.reduce((a, b) => a + b, 0) / confidences.length).toFixed(1))
      : ctx.confidence;

    const minWordConfidence = confidences.length ? Math.min(...confidences) : 0;
    const maxWordConfidence = confidences.length ? Math.max(...confidences) : 0;
    const lowConfidenceWordCount = confidences.filter(
      c => c < ctx.config.confidence.minAcceptable
    ).length;

    // ── Content type ─────────────────────────────────────────────────────────
    let contentType: OCRStatistics['contentType'] = 'unknown';
    if (!text.trim()) {
      contentType = 'empty';
    } else if (text.startsWith('```') || text.includes('\n```')) {
      contentType = 'code';
    } else {
      contentType = 'prose';
    }

    // ── Timing — pull from stageResults ──────────────────────────────────────
    const stageMs = (name: string) => ctx.stageResults[name]?.elapsedMs ?? 0;
    const recognitionTime    = stageMs('RecognitionStage');
    const preprocessingTime  = stageMs('PreprocessStage');
    const postprocessingTime = stageMs('PostProcessStage');
    const totalProcessingTime = parseFloat(
      (performance.now() - ctx.pipelineStartedAt).toFixed(2)
    );

    // ── Image dimensions + normalization results ─────────────────────────────
    // Use normalized dimensions from preprocessMetadata when available,
    // falling back to AnalysisStage metadata (original dimensions).
    const pm                = ctx.preprocessMetadata;
    const imageWidth        = pm?.normalizedWidth   ?? ctx.metadata?.width  ?? 0;
    const imageHeight       = pm?.normalizedHeight  ?? ctx.metadata?.height ?? 0;
    const orientation       = pm?.orientation       ?? 'landscape';
    const trimApplied       = pm?.trimApplied       ?? false;
    const filtersApplied    = pm?.filtersApplied    ?? [];
    const filtersExecuted   = pm?.filtersExecuted   ?? 0;
    const filtersSkipped    = pm?.filtersSkipped    ?? 0;
    const upscaleApplied    = pm?.upscaleApplied    ?? false;
    const grayscaleApplied  = pm?.grayscaleApplied  ?? false;
    const contrastApplied   = pm?.contrastApplied   ?? false;
    const thresholdApplied  = pm?.thresholdApplied  ?? false;
    const medianApplied     = pm?.medianApplied     ?? false;
    const morphologyApplied = pm?.morphologyApplied ?? false;
    const deskewAngleDeg    = pm?.deskewAngleDeg    ?? 0;
    const sharpenApplied    = pm?.sharpenApplied    ?? false;
    const imageQualityScore = pm?.imageQualityScore ?? 0;

    const qr = ctx.qualityReport;
    const recognitionConfidence = qr?.recognitionConfidence ?? meanWordConfidence;
    const overallConfidence     = qr?.overallScore          ?? ctx.confidence;
    const qualityScore          = qr?.overallScore          ?? 0;
    const warningCount          = qr?.warnings.length       ?? ctx.warnings.length;
    const qualityAnalysisTime   = stageMs('QualityAnalysisStage');
    const finalContentType      = ctx.contentType || contentType;

    const initialScore = ctx.retryHistory[0]?.qualityReport.overallScore ?? (qr?.overallScore ?? 0);
    const bestScore    = ctx.bestRetry?.qualityReport.overallScore ?? (qr?.overallScore ?? 0);
    const confDiff     = bestScore - initialScore;

    const retryAttemptCount     = Math.max(0, (ctx.retryHistory.length || 1) - 1);
    const retryProfilesUsed     = ctx.retryHistory.map(r => r.profile);
    const bestProfile           = ctx.selectedRetryProfile || 'DEFAULT';
    const bestAttempt           = ctx.bestRetry?.attempt ?? 0;
    const retryImproved         = bestAttempt > 0 && confDiff > 0;
    const confidenceImprovement = Math.max(0, confDiff);

    const statistics: OCRStatistics = {
      wordCount,
      charCount,
      lineCount,
      meanWordConfidence,
      minWordConfidence,
      maxWordConfidence,
      lowConfidenceWordCount,
      contentType: finalContentType,
      detectedLanguage:    ctx.language,
      totalProcessingTime,
      recognitionTime,
      preprocessingTime,
      postprocessingTime,
      engine:          ctx.config.engine,
      pipelineVersion: ctx.pipelineVersion,
      imageWidth,
      imageHeight,
      orientation,
      trimApplied,
      filtersApplied,
      filtersExecuted,
      filtersSkipped,
      upscaleApplied,
      grayscaleApplied,
      contrastApplied,
      thresholdApplied,
      medianApplied,
      morphologyApplied,
      deskewAngleDeg,
      sharpenApplied,
      imageQualityScore,
      recognitionConfidence,
      overallConfidence,
      qualityScore,
      warningCount,
      qualityAnalysisTime,
      qualityPipelineVersion: qr?.qualityPipelineVersion || '2.1',
      retryAttemptCount,
      retryProfilesUsed,
      bestProfile,
      retryImproved,
      confidenceImprovement,
      bestAttempt,
      retryProcessingTime: ctx.retryExecutionSummary?.processingTimeMs ?? 0,
      comparisonScore:     ctx.comparisonReport?.winner.result?.qualityReport.overallScore ?? (qr?.overallScore ?? 0),
      retrySkippedReason:  ctx.retrySkippedReason?.reason ?? 'N/A',
      retryBudgetUsed:     ctx.retryExecutionSummary?.attemptCount ?? 0,
      executionSummary:    ctx.retryExecutionSummary,
      selectedProfile:     ctx.selectedProfile || 'DEFAULT',
      profileConfidence:   ctx.profileConfidence || 0,
      candidateCount:      ctx.profileCandidates.length || 0,
      profileSelectionTime: stageMs('ProfileSelectionStage'),
      profileVersion:      ctx.profileRecommendation?.profileEngineVersion || '1.0',
      selectedLanguage:       ctx.languageRecommendation?.selectedLanguage || ctx.language || 'English',
      script:                 ctx.script?.primaryScript || 'Latin',
      languageConfidence:     ctx.languageConfidence?.overall || 0,
      languageDetectionTime:  stageMs('LanguageStage'),
      languageCandidateCount: ctx.languageCandidates.length || 0,
      languageVersion:        ctx.languageRecommendation?.engineVersion || '1.0',
      layoutType:             ctx.advancedStatistics?.layoutType || 'document',
      layoutConfidence:       ctx.advancedStatistics?.layoutConfidence || 85,
      tableCount:             ctx.advancedStatistics?.tableCount || 0,
      regionCount:            ctx.advancedStatistics?.regionCount || 0,
      blockCount:             ctx.advancedStatistics?.blockCount || 0,
      advancedProcessingTime: stageMs('AdvancedRecognitionStage'),
    };

    ctx.statistics = statistics;

    ocrLog.info(
      `[StatisticsStage] words=${wordCount} chars=${charCount} lines=${lineCount}` +
      ` type=${contentType} confidence=${meanWordConfidence}` +
      ` orientation=${orientation} trimApplied=${trimApplied}` +
      ` total=${totalProcessingTime}ms (recognition=${recognitionTime}ms preprocess=${preprocessingTime}ms)`
    );

    return ctx;
  }
}
