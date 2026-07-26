/**
 * Profile Analyzers
 *
 * Modular analyzer implementations for profile candidate scoring:
 *   1. ContentProfileAnalyzer  (evaluates content classification & evidence)
 *   2. ImageProfileAnalyzer    (evaluates image quality & dimensions)
 *   3. QualityProfileAnalyzer  (evaluates character/structure quality & warnings)
 *
 * Performance target: < 1ms combined execution time. Pure metadata analysis.
 */
import type { OCRContext } from '../types/ocrTypes';
import type { OCRProfile, ProfileCandidate } from './profileTypes';

export interface ProfileAnalyzer {
  readonly name: string;
  evaluate(profile: OCRProfile, ctx: OCRContext): { scoreAdjustment: number; reason: string };
}

export class ContentProfileAnalyzer implements ProfileAnalyzer {
  readonly name = 'ContentProfileAnalyzer';

  evaluate(profile: OCRProfile, ctx: OCRContext): { scoreAdjustment: number; reason: string } {
    const contentType = ctx.contentType || 'unknown';
    const detection   = ctx.contentDetection;
    const detConf     = detection?.confidence ?? 70;

    // Exact name match bonus (e.g. JSON profile for JSON content type)
    if (profile.name.toLowerCase() === contentType.toLowerCase()) {
      const bonus = Math.round(50 + (detConf * 0.3));
      return {
        scoreAdjustment: bonus,
        reason: `Exact content type match [${contentType.toUpperCase()}] (${detConf}% detection confidence)`,
      };
    }

    // Supported content type category match (e.g. CODE profile for JSON/YAML)
    if (profile.supportedContentTypes.includes(contentType as any)) {
      const bonus = Math.round(30 + (detConf * 0.2));
      return {
        scoreAdjustment: bonus,
        reason: `Supported content type category match [${contentType.toUpperCase()}]`,
      };
    }

    return { scoreAdjustment: 0, reason: 'Content type not directly supported' };
  }
}

export class ImageProfileAnalyzer implements ProfileAnalyzer {
  readonly name = 'ImageProfileAnalyzer';

  evaluate(profile: OCRProfile, ctx: OCRContext): { scoreAdjustment: number; reason: string } {
    const pm         = ctx.preprocessMetadata;
    const imgQuality = pm?.imageQualityScore ?? 75;
    const origWidth  = pm?.originalWidth ?? 1000;

    if (profile.name === 'LOW_RESOLUTION') {
      if (origWidth < 400 || imgQuality < 45) {
        return {
          scoreAdjustment: 40,
          reason: `Low resolution image detected (width: ${origWidth}px, quality: ${imgQuality}/100)`,
        };
      }
    }

    if (profile.name === 'HIGH_CONTRAST') {
      if (imgQuality < 50) {
        return {
          scoreAdjustment: 35,
          reason: `Low contrast image detected (quality score: ${imgQuality}/100)`,
        };
      }
    }

    return { scoreAdjustment: 0, reason: 'Image condition baseline' };
  }
}

export class QualityProfileAnalyzer implements ProfileAnalyzer {
  readonly name = 'QualityProfileAnalyzer';

  evaluate(profile: OCRProfile, ctx: OCRContext): { scoreAdjustment: number; reason: string } {
    const recs = ctx.recommendations || [];
    const topRec = recs[0];

    if (topRec?.type === 'UseCodeProfile' && ['CODE', 'JSON', 'TERMINAL', 'YAML'].includes(profile.name)) {
      return {
        scoreAdjustment: 20,
        reason: `Quality Engine recommendation suggested code profile (${topRec.reason})`,
      };
    }

    if (topRec?.type === 'UseDocumentProfile' && ['DOCUMENT', 'MARKDOWN'].includes(profile.name)) {
      return {
        scoreAdjustment: 20,
        reason: `Quality Engine recommendation suggested document profile (${topRec.reason})`,
      };
    }

    return { scoreAdjustment: 0, reason: 'Quality profile baseline' };
  }
}

export function scoreProfileCandidate(profile: OCRProfile, ctx: OCRContext): ProfileCandidate {
  const contentAnalyzer = new ContentProfileAnalyzer();
  const imageAnalyzer   = new ImageProfileAnalyzer();
  const qualityAnalyzer = new QualityProfileAnalyzer();

  const resContent = contentAnalyzer.evaluate(profile, ctx);
  const resImage   = imageAnalyzer.evaluate(profile, ctx);
  const resQuality = qualityAnalyzer.evaluate(profile, ctx);

  let rawScore = profile.priority + resContent.scoreAdjustment + resImage.scoreAdjustment + resQuality.scoreAdjustment;
  const score  = Math.max(0, Math.min(100, Math.round(rawScore)));

  const reasons = [resContent.reason, resImage.reason, resQuality.reason]
    .filter(r => !r.includes('baseline') && !r.includes('not directly'))
    .join('; ');

  const confidence = Math.min(99, Math.round(score * 0.95));

  return {
    profile,
    score,
    confidence,
    reason: reasons || `${profile.description} (priority ${profile.priority})`,
  };
}
