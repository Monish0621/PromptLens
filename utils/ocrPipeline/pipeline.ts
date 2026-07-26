import {
  type OCRConfig,
  type OCRResult,
  type OCRStage,
  createOCRContext,
  defaultOCRConfig,
} from './types/ocrTypes';

import { AnalysisStage }            from './stages/analysis';
import { PreprocessStage }          from './stages/preprocess';
import { RecognitionStage }         from './stages/recognition';
import { AdvancedRecognitionStage } from './stages/advancedRecognition';
import { PostProcessStage }         from './stages/postprocess';
import { QualityAnalysisStage }     from './stages/qualityAnalysis';
import { ProfileSelectionStage }    from './stages/profileSelection';
import { RetryDecisionStage }       from './stages/retryDecision';
import { ConfidenceStage }          from './stages/confidence';
import { LanguageStage }            from './stages/language';
import { CorrectionStage }          from './stages/correction';
import { StatisticsStage }          from './stages/statistics';
import { createEngineAdapter }      from './engines/tesseractAdapter';
import { runStage }                 from './utils/timing';
import { ocrLog }                   from './utils/ocrLogger';

const PIPELINE_VERSION = '2.4.0';

export async function performOCR(
  imageDataUrl: string,
  config: OCRConfig = defaultOCRConfig()
): Promise<OCRResult> {

  ocrLog.pipeline('Pipeline Started');

  let ctx = createOCRContext(imageDataUrl, config);
  ctx = { ...ctx, pipelineVersion: PIPELINE_VERSION };

  const engine = createEngineAdapter(config);

  const stages: OCRStage[] = [
    new AnalysisStage(),
    new PreprocessStage(),
    new RecognitionStage(engine),
    new AdvancedRecognitionStage(),
    new PostProcessStage(),
    new QualityAnalysisStage(),
    new ProfileSelectionStage(),
    new RetryDecisionStage(engine),
    new ConfidenceStage(),
    new LanguageStage(),
    new CorrectionStage(),
    new StatisticsStage(),
  ];

  for (const stage of stages) {
    ctx = await runStage(stage, ctx);

    if (ctx.errors.length > 0) {
      ocrLog.error(
        'Pipeline aborted after stage [' + stage.name + ']. Errors: ' + ctx.errors.join('; ')
      );
      break;
    }
  }

  const text = ctx.correctedText || ctx.processedText || ctx.rawText || '';

  ocrLog.pipeline('Pipeline Finished - text length: ' + text.length + ', confidence: ' + ctx.confidence);

  return {
    text,
    confidence: ctx.confidence,
    statistics: ctx.statistics!,
    timings:    ctx.stageResults,
    warnings:   ctx.warnings,
    errors:     ctx.errors,
  };
}