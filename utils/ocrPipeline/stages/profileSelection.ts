/**
 * Stage 6 — ProfileSelectionStage
 *
 * RESPONSIBILITY: Automatically evaluate OCR intelligence and select the optimal
 * OCR profile BEFORE retries occur.
 *
 * Position in Pipeline:
 *   AnalysisStage → PreprocessStage → RecognitionStage → PostProcessStage → QualityAnalysisStage → [ProfileSelectionStage] → RetryDecisionStage → ConfidenceStage → LanguageStage → CorrectionStage → StatisticsStage
 *
 * Reads:   ctx.qualityReport, ctx.contentType, ctx.contentDetection, ctx.preprocessMetadata
 * Writes:  ctx.profileRecommendation (ProfileRecommendation model)
 *          ctx.selectedProfile        (winning profile name string)
 *          ctx.profileCandidates     (ProfileCandidate[] list)
 *          ctx.profileConfidence     (selection confidence %)
 *          ctx.profileHistory        (appends ProfileSelectionHistory entry)
 *
 * Never throws — catches any unexpected error, logs warning, returns ctx with DEFAULT profile.
 */
import type { OCRStage, OCRContext }  from '../types/ocrTypes';
import type { ProfileSelectionHistory } from '../profile/profileTypes';
import { selectOCRProfile }           from '../profile/profileSelector';
import { ocrLog }                     from '../utils/ocrLogger';

export class ProfileSelectionStage implements OCRStage {
  readonly name = 'ProfileSelectionStage';

  async execute(ctx: OCRContext): Promise<OCRContext> {
    ocrLog.info('[ProfileSelection] Running Profile Selection Engine...');

    try {
      const res = selectOCRProfile(ctx);
      const rec = res.recommendation;

      ctx.profileRecommendation = rec;
      ctx.selectedProfile        = rec.selectedProfile;
      ctx.profileCandidates     = res.candidates;
      ctx.profileConfidence     = rec.confidence;

      const historyEntry: ProfileSelectionHistory = {
        selectedProfile: rec.selectedProfile,
        confidence:      rec.confidence,
        alternatives:    rec.alternatives,
        reason:          rec.reason,
        timestamp:       Date.now(),
      };

      ctx.profileHistory.push(historyEntry);

      // Formatted logging output as requested
      const cd         = ctx.contentDetection;
      const contentTypeStr = cd ? `${cd.type.toUpperCase()} (${cd.confidence}%)` : (ctx.contentType || 'UNKNOWN').toUpperCase();
      const imgQuality = ctx.preprocessMetadata?.imageQualityScore ?? 75;
      const structScore = ctx.qualityReport?.structureScore ?? 100;
      const warnCount   = ctx.qualityReport?.warnings.length ?? 0;

      ocrLog.info(`[ProfileSelection] Content Detection ......... ${contentTypeStr}`);
      ocrLog.info(`[ProfileSelection] Image Quality ............. ${imgQuality}`);
      ocrLog.info(`[ProfileSelection] Structure Score ........... ${structScore}`);
      ocrLog.info(`[ProfileSelection] Warnings .................. ${warnCount}`);
      ocrLog.info('[ProfileSelection] ---------------------------------------');
      ocrLog.info('[ProfileSelection] Candidate Scores:');

      for (const cand of res.candidates.slice(0, 5)) {
        ocrLog.info(`[ProfileSelection]   ${cand.profile.name.padEnd(18, '.')} ${cand.score}`);
      }

      ocrLog.info('[ProfileSelection] ---------------------------------------');
      ocrLog.info(`[ProfileSelection] Selected Profile: ${rec.selectedProfile}`);
      ocrLog.info(`[ProfileSelection] Confidence: ${rec.confidence}%`);
      ocrLog.info(`[ProfileSelection] Alternatives: ${rec.alternatives.join(', ')}`);
      ocrLog.info(`[ProfileSelection] Selection Time: ${res.elapsedMs}ms`);

    } catch (err: any) {
      ocrLog.warn('[ProfileSelectionStage] Unexpected failure in profile selection stage', err);
      ctx.warnings.push(`[ProfileSelectionStage] Selection failed: ${err?.message || String(err)}`);
      ctx.selectedProfile = 'DEFAULT';
    }

    return ctx;
  }
}
