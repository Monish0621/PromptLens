/**
 * Dynamic Profile Selector
 *
 * Orchestrates OCRProfileRegistry, scores all registered profile candidates
 * using modular analyzers, selects the winning profile, and generates a
 * structured ProfileRecommendation model.
 *
 * Performance target: < 3ms. Guaranteed fault-tolerant.
 */
import type { OCRContext } from '../types/ocrTypes';
import {
  type ProfileCandidate,
  type ProfileRecommendation,
  PROFILE_ENGINE_VERSION,
} from './profileTypes';
import { defaultOCRProfileRegistry, DEFAULT_PROFILE } from './profileRegistry';
import { scoreProfileCandidate }                      from './profileAnalyzers';
import { ocrLog }                                     from '../utils/ocrLogger';

export interface ProfileSelectionResult {
  recommendation:    ProfileRecommendation;
  selectedCandidate: ProfileCandidate;
  candidates:        ProfileCandidate[];
  elapsedMs:         number;
}

export function selectOCRProfile(ctx: OCRContext): ProfileSelectionResult {
  const t0 = performance.now();

  try {
    const profiles   = defaultOCRProfileRegistry.getAll();
    const candidates: ProfileCandidate[] = profiles.map(p => scoreProfileCandidate(p, ctx));

    // Sort candidates by score descending
    candidates.sort((a, b) => b.score - a.score);

    const winner = candidates[0];
    const alts   = candidates.slice(1, 4).map(c => c.profile.name);

    // Calculate selection confidence percentage
    const nextScore = candidates[1]?.score ?? 50;
    const margin    = winner.score - nextScore;
    const confidence = Math.min(99, Math.max(60, Math.round(winner.confidence + margin * 0.5)));

    const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));

    const recommendation: ProfileRecommendation = {
      selectedProfile:       winner.profile.name,
      confidence,
      reason:                winner.reason || `Selected profile ${winner.profile.name} with score ${winner.score}`,
      alternatives:          alts,
      profileEngineVersion: PROFILE_ENGINE_VERSION,
    };

    return {
      recommendation,
      selectedCandidate: winner,
      candidates,
      elapsedMs,
    };

  } catch (err: any) {
    const elapsedMs = parseFloat((performance.now() - t0).toFixed(2));
    ocrLog.warn('[ProfileSelector] Unexpected failure during profile selection — fallback to DEFAULT', err);

    const fallbackCandidate: ProfileCandidate = {
      profile:    DEFAULT_PROFILE,
      score:      50,
      confidence: 50,
      reason:     `Fallback on error: ${err?.message || String(err)}`,
    };

    return {
      recommendation: {
        selectedProfile:       'DEFAULT',
        confidence:            50,
        reason:                'Fallback to DEFAULT on error',
        alternatives:          ['CODE', 'DOCUMENT'],
        profileEngineVersion: PROFILE_ENGINE_VERSION,
      },
      selectedCandidate: fallbackCandidate,
      candidates:        [fallbackCandidate],
      elapsedMs,
    };
  }
}
