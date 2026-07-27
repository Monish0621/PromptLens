/**
 * Retry Executor
 *
 * Executes a full retry pass with a specified RetryProfile override.
 *
 * Sequence for each retry attempt:
 *   Apply config overrides → PreprocessStage → RecognitionStage → PostProcessStage → QualityAnalysisStage
 *
 * Fault tolerant: Returns null on failure without throwing or aborting the main pipeline.
 */
import type { OCRContext, OCRConfig, OCREngine } from '../types/ocrTypes';
import type { RetryProfile, RetryResult } from './retryTypes';
import { PreprocessStage }              from '../stages/preprocess';
import { RecognitionStage }             from '../stages/recognition';
import { PostProcessStage }             from '../stages/postprocess';
import { QualityAnalysisStage }         from '../stages/qualityAnalysis';
import { ocrLog }                       from '../utils/ocrLogger';

export async function executeRetryPass(
  initialCtx: OCRContext,
  profile:    RetryProfile,
  attempt:    number,
  engine:     OCREngine
): Promise<RetryResult | null> {
  const t0 = performance.now();

  try {
    ocrLog.info(`[RetryExecutor] Starting Retry Pass #${attempt} [Profile: ${profile.name}]...`);

    // Merge config overrides
    const newConfig: OCRConfig = mergeConfigOverrides(initialCtx.config, profile.configOverrides as Partial<OCRConfig>);

    // Create a new context clone for this retry attempt
    let retryCtx: OCRContext = {
      ...initialCtx,
      config: newConfig,
      workingImage: initialCtx.originalImage, // Re-start from original image
      stageResults: { ...initialCtx.stageResults },
      warnings: [],
      errors: [],
    };

    // Execute pipeline stages sequentially
    const preprocessStage  = new PreprocessStage();
    const recognitionStage = new RecognitionStage(engine);
    const postprocessStage = new PostProcessStage();
    const qualityStage     = new QualityAnalysisStage();

    retryCtx = await preprocessStage.execute(retryCtx);
    if (retryCtx.errors.length > 0) return null;

    retryCtx = await recognitionStage.execute(retryCtx);
    if (retryCtx.errors.length > 0) return null;

    retryCtx = await postprocessStage.execute(retryCtx);
    if (retryCtx.errors.length > 0) return null;

    retryCtx = await qualityStage.execute(retryCtx);

    const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));
    ocrLog.info(
      `[RetryExecutor] Retry Pass #${attempt} [${profile.name}] Complete (${elapsedMs}ms)` +
      ` | Overall Confidence: ${retryCtx.qualityReport?.overallScore ?? 0}`
    );

    if (!retryCtx.qualityReport || !retryCtx.confidenceBreakdown) {
      return null;
    }

    const ocrText = retryCtx.correctedText || retryCtx.processedText || retryCtx.rawText;

    const result: RetryResult = {
      profile:             profile.name,
      attempt,
      qualityReport:       retryCtx.qualityReport,
      confidenceBreakdown: retryCtx.confidenceBreakdown,
      ocrText,
      statistics:          retryCtx.statistics,
      context:             retryCtx,
    };

    return result;

  } catch (err: any) {
    ocrLog.warn(`[RetryExecutor] Retry Pass #${attempt} failed with an error`, err);
    return null;
  }
}

/** Merge profile config overrides deeply into base config */
function mergeConfigOverrides(base: OCRConfig, overrides: Partial<OCRConfig>): OCRConfig {
  return {
    ...base,
    preprocessing: {
      ...base.preprocessing,
      ...(overrides.preprocessing || {}),
    },
    engineOptions: {
      ...(base.engineOptions || {}),
      ...(overrides.engineOptions || {}),
    },
    confidence: {
      ...base.confidence,
      ...(overrides.confidence || {}),
    },
    debug: {
      ...base.debug,
      ...(overrides.debug || {}),
    },
  };
}
