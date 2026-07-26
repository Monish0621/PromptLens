/**
 * Dynamic OCR Profile Intelligence — Core Types
 *
 * Single source of truth for OCRProfile, ProfileCandidate,
 * ProfileRecommendation, and ProfileSelectionHistory interfaces.
 *
 * Engine Version: 1.0
 */
import type { OCRConfig } from '../types/ocrTypes';
import type { ContentType } from '../quality/qualityTypes';

export const PROFILE_ENGINE_VERSION = '1.0';

// ─────────────────────────────────────────────────────────────────────────────
// OCR Profile Definition Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface OCRProfile {
  /** Machine-readable profile identifier */
  name: string;
  /** Human-readable explanation of profile intent */
  description: string;
  /** Content types supported by this profile */
  supportedContentTypes: ContentType[];
  /** Preprocessing image conditions supported (e.g. 'low_resolution', 'low_contrast') */
  supportedImageConditions: string[];
  /** Base priority weight (0–100) */
  priority: number;
  /** OCRConfig parameters overridden when this profile is active */
  configurationOverrides: Partial<OCRConfig>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile Candidate Scoring Result
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileCandidate {
  /** The evaluated OCRProfile definition */
  profile: OCRProfile;
  /** Composite suitability score (0–100) */
  score: number;
  /** Selection confidence percentage (0–100) */
  confidence: number;
  /** Detailed scoring justification */
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile Recommendation Model
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileRecommendation {
  /** Winning profile name (e.g. 'CODE', 'MARKDOWN', 'JSON', 'DEFAULT') */
  selectedProfile: string;
  /** Confidence score of winning profile selection (0–100) */
  confidence: number;
  /** Explanation for why this profile was chosen */
  reason: string;
  /** Top 3 alternative profiles in order of score */
  alternatives: string[];
  /** Profile engine version string */
  profileEngineVersion: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile Selection History Entry
// ─────────────────────────────────────────────────────────────────────────────

export interface ProfileSelectionHistory {
  selectedProfile: string;
  confidence:      number;
  alternatives:    string[];
  reason:          string;
  timestamp:       number;
}
