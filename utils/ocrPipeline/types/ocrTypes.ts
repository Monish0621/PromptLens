/**
 * OCR Pipeline — Core Type Definitions
 *
 * This file is the single source of truth for every data shape in the OCR
 * pipeline.  No stage, adapter, or orchestrator defines its own types.
 *
 * Design principles:
 *   • Every stage receives OCRContext and returns OCRContext.
 *   • OCREngine is a pure interface — the pipeline never knows which engine runs.
 *   • OCRResult is the structured object returned to callers.
 *   • OCRConfig is forward-compatible through Milestones 2B / 2C / 2D.
 */

// ─────────────────────────────────────────────────────────────────────────────
// OCR Engine Interface  (Milestone 2D: PaddleOCR / Cloud adapters implement this)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Word-level data returned by recognition engines that support it.
 * Confidence is 0–100.
 */
export interface WordData {
  text: string;
  confidence: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Preprocessing Enums  (Milestone 2B.3 Refinements)
// ─────────────────────────────────────────────────────────────────────────────

export enum FilterGroup {
  NORMALIZATION = 1,
  ENHANCEMENT   = 2,
  BINARIZATION  = 3,
  CLEANUP       = 4,
  GEOMETRY      = 5,
  FINALIZATION  = 6,
}

export enum MorphologyOperation {
  EROSION  = 'erosion',
  DILATION = 'dilation',
  OPENING  = 'opening',
  CLOSING  = 'closing',
}

/**
 * Structured output from any OCR engine.
 * RecognitionStage populates OCRContext from this object.
 *
 * engineMetadata  — engine-specific extra data (e.g. Tesseract hocr output).
 *                   Opaque to the pipeline; stored for debugging.
 */
export interface RecognitionResult {
  /** Full extracted text as returned by the engine. */
  text: string;

  /** Word-level confidence data (empty array if engine does not provide it). */
  words: WordData[];

  /**
   * Engine-specific raw data.
   * Milestone 2C can read Tesseract's hOCR from here for line-level analysis.
   */
  engineMetadata: Record<string, unknown>;
}

/**
 * Every OCR engine adapter implements this interface.
 *
 * This is the ONLY coupling point between the pipeline and any OCR library.
 * Swapping Tesseract for another engine = new class, zero other changes.
 */
export interface OCREngine {
  /** Human-readable name used in logs and OCRStatistics.engine */
  readonly engineName: string;

  recognize(imageDataUrl: string, config: OCRConfig): Promise<RecognitionResult>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration  (nested sections for stable forward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OCR engine selection.
 * Milestone 2D adds: 'paddle' | 'cloud' | 'hybrid'
 */
export type OCREngineType = 'tesseract';

/**
 * Named recognition preset.
 * Milestone 2B defines what each preset means for preprocessing.
 */
export type OCRPreset = 'default' | 'code' | 'document' | 'screenshot';

/**
 * Full OCR configuration object.
 *
 * Structured into sections so each milestone can add to its own section
 * without touching the others.
 *
 * ┌─ engine          Which adapter to use (Milestone 2D adds options)
 * ├─ preset          Named preset that controls multiple settings at once
 * ├─ preprocessing   Image preprocessing options (Milestone 2B)
 * ├─ confidence      Confidence thresholds and retry policy (Milestone 2C)
 * ├─ languageDetection  Language detection options (Milestone 2C)
 * ├─ correction      Post-recognition correction options (Milestone 2D)
 * └─ debug           Developer diagnostics
 */
export interface OCRConfig {
  // ── Core ────────────────────────────────────────────────────────────────────
  /** Tesseract language code(s). Default: 'eng'. */
  language: string;

  /** Tesseract OEM mode. 1 = LSTM only (default). */
  ocrEngineMode: number;

  /** Which engine adapter to instantiate. */
  engine: OCREngineType;

  /** Named recognition preset. */
  preset: OCRPreset;

  /** Generic engine-agnostic adapter options. */
  engineOptions?: Record<string, unknown>;

  // ── Preprocessing (Milestone 2B) ─────────────────────────────────────────
  preprocessing: {
    // ── Normalization (2B.1) — always runs ─────────────────────────────────
    /** Trim fully-transparent border pixels from the image. Default: true. */
    trimTransparentBorders: boolean;
    /** Normalize canvas orientation so the image is always upright. Default: true. */
    normalizeOrientation: boolean;

    // ── Enhancement (2B.2) ────────────────────────────────────────────────
    /** Smart upscaling: only upscales images below the minimum dimension. Default: true. */
    enableUpscaling: boolean;
    /** Luminance-based grayscale conversion. Default: true. */
    enableGrayscale: boolean;
    /** Histogram-stretching contrast enhancement. Default: true. */
    enableContrast:  boolean;
    /** Adaptive (Sauvola/integral-image) thresholding. Default: true. */
    enableThreshold: boolean;

    // Upscaling knobs
    /** Upscale when smallest dimension < this (px). Default: 300. */
    minUpscaleDimension:   number;
    /** Never upscale if largest dimension already exceeds this (px). Default: 4000. */
    maxUpscaleDimension:   number;
    /** Target size for the smallest dimension after upscaling (px). Default: 900. */
    upscaleTargetDimension: number;
    /** Maximum scale multiplier. Default: 3.0. */
    maxUpscaleScale:       number;

    // Contrast knobs
    /** Histogram percentile to use for lower clip point. Default: 2 (= 2nd percentile). */
    contrastLowPercentile:  number;
    /** Histogram percentile to use for upper clip point. Default: 98. */
    contrastHighPercentile: number;

    // Threshold knobs
    /** Local window side length for adaptive threshold (must be odd). Default: 21. */
    thresholdBlockSize: number;
    /** Constant subtracted from local mean. Higher = more black. Default: 10. */
    thresholdC:         number;

    // ── Cleanup (2B.3) ────────────────────────────────────────────────────
    /** Median noise reduction. Default: true. */
    enableMedianFilter:  boolean;
    /** Median kernel side length (3 or 5). Default: 3. */
    medianKernelSize:    number;
    /** Morphological cleanup (opening/closing/both). Default: true. */
    enableMorphology:    boolean;
    /** Morphological operation to apply. Default: 'opening'. */
    morphologyOperation: 'opening' | 'closing' | 'both';
    /** Structuring element side length (3). Default: 3. */
    morphologyKernelSize: number;

    // ── Geometry (2B.3) ──────────────────────────────────────────────────
    /** Run deskew correction. Default: true. */
    deskew: boolean;
    /** Maximum skew angle to detect and correct (degrees). Default: 10. */
    maxDeskewAngle:  number;
    /** Minimum angle to actually apply rotation (degrees). Default: 0.5. */
    minDeskewAngle:  number;
    /** Detection step size (degrees). Default: 0.5. */
    deskewAngleStep: number;

    // ── Finalization (2B.3) ───────────────────────────────────────────────
    /** Apply unsharp-mask sharpening. Default: true. */
    sharpen:      boolean;
    /** Unsharp mask strength (0.0–1.0). Default: 0.5. */
    sharpenAmount: number;
  };

  // ── Confidence (Milestone 2C) ─────────────────────────────────────────────
  confidence: {
    /**
     * If aggregate confidence falls below this value the result is tagged
     * as low-confidence.  Milestone 2C adds automatic retry logic here.
     */
    minAcceptable: number;
    /** Maximum number of preprocessing+recognition retries. Default: 0. */
    maxRetries: number;
  };

  // ── Language Detection (Milestone 2C) ────────────────────────────────────
  languageDetection: {
    /** Enable automatic language detection. Default: false. */
    enabled: boolean;
    /** BCP-47 tag to report when detection is disabled. Default: 'unknown'. */
    fallback: string;
  };

  // ── Correction (Milestone 2D) ─────────────────────────────────────────────
  correction: {
    /** Enable post-recognition text correction. Default: false. */
    enabled: boolean;
    /** Correction strategy. Default: 'none'. */
    strategy: 'none' | 'ast' | 'llm';
  };

  // ── Debug ─────────────────────────────────────────────────────────────────────
  debug: {
    /** Log per-stage timing to console. Default: true. */
    logTimings: boolean;
    /** Attach full OCRContext to OCRResult.context. Default: true. */
    attachContext: boolean;
    /**
     * Save a PNG data URL snapshot of the canvas after every filter.
     * Stored in OCRContext.preprocessSnapshots (filterName → dataUrl).
     * Default: false. Disabled has ZERO production overhead.
     */
    preprocessSnapshots: boolean;
  };
}

/** Returns the default OCR configuration used when no config is supplied. */
export function defaultOCRConfig(): OCRConfig {
  return {
    language:     'eng',
    ocrEngineMode: 1,
    engine:       'tesseract',
    preset:       'default',

    preprocessing: {
      // Normalization
      trimTransparentBorders: true,
      normalizeOrientation:   true,
      // Enhancement (2B.2)
      enableUpscaling:         true,
      enableGrayscale:         true,
      enableContrast:          true,
      enableThreshold:         true,
      // Upscaling knobs
      minUpscaleDimension:     300,
      maxUpscaleDimension:     4000,
      upscaleTargetDimension:  900,
      maxUpscaleScale:         3.0,
      // Contrast knobs
      contrastLowPercentile:   2,
      contrastHighPercentile:  98,
      // Threshold knobs
      thresholdBlockSize:      21,
      thresholdC:              10,
      // Cleanup (2B.3)
      enableMedianFilter:      true,
      medianKernelSize:        3,
      enableMorphology:        true,
      morphologyOperation:     'opening' as const,
      morphologyKernelSize:    3,
      // Geometry (2B.3)
      deskew:                  true,
      maxDeskewAngle:          10,
      minDeskewAngle:          0.5,
      deskewAngleStep:         0.5,
      // Finalization (2B.3)
      sharpen:                 true,
      sharpenAmount:           0.5,
    },

    confidence: {
      minAcceptable: 40,
      maxRetries:    0,
    },

    languageDetection: {
      enabled:  false,
      fallback: 'unknown',
    },

    correction: {
      enabled:  false,
      strategy: 'none',
    },

    debug: {
      logTimings:          true,
      attachContext:       true,
      preprocessSnapshots: false,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Image Metadata  (set by AnalysisStage)
// ─────────────────────────────────────────────────────────────────────────────

export interface ImageMetadata {
  width:          number;
  height:         number;
  aspectRatio:    number;
  /** Estimated file size derived from base64 string length. */
  estimatedBytes: number;
  /** MIME type from the data URL prefix. */
  mimeType:       string;
}

// ─────────────────────────────────────────────────────────────────────────────
// NormalizationOptions  (flat mirror of OCRConfig.preprocessing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Flat options object passed to normalizeImage() and to every filter's
 * shouldRun() method. Mirrors OCRConfig.preprocessing exactly.
 *
 * Defined here (in ocrTypes) so that imageFilter.ts can reference it
 * without creating a circular import with imageNormalizer.ts.
 */
export interface NormalizationOptions {
  // Normalization (2B.1)
  trimTransparentBorders: boolean;
  normalizeOrientation:   boolean;
  // Enhancement (2B.2)
  enableUpscaling:        boolean;
  enableGrayscale:        boolean;
  enableContrast:         boolean;
  enableThreshold:        boolean;
  minUpscaleDimension:    number;
  maxUpscaleDimension:    number;
  upscaleTargetDimension: number;
  maxUpscaleScale:        number;
  contrastLowPercentile:  number;
  contrastHighPercentile: number;
  thresholdBlockSize:     number;
  thresholdC:             number;
  // Cleanup (2B.3)
  enableMedianFilter:     boolean;
  medianKernelSize:       number;
  enableMorphology:       boolean;
  morphologyOperation:    'opening' | 'closing' | 'both';
  morphologyKernelSize:   number;
  // Geometry (2B.3)
  deskew:                 boolean;
  maxDeskewAngle:         number;
  minDeskewAngle:         number;
  deskewAngleStep:        number;
  // Finalization (2B.3)
  sharpen:                boolean;
  sharpenAmount:          number;
  // Debug
  preprocessSnapshots:    boolean;
}


// ─────────────────────────────────────────────────────────────────────────────
// Preprocessing Metadata  (set by PreprocessStage)
// ─────────────────────────────────────────────────────────────────────────────

/** Detected orientation of the image. */
export type ImageOrientation = 'portrait' | 'landscape' | 'square';

/**
 * Record of a single filter execution inside the image enhancement pipeline.
 * Collected by runFilters() and stored in PreprocessMetadata.filterRecords.
 */
export interface FilterRecord {
  /** Filter class name — matches ImageFilter.name. */
  filterName:  string;
  /** Filter group enum. */
  group:       FilterGroup;
  /** The filter's intra-group priority value at time of execution. */
  priority:    number;
  /** Filter ran and actually modified the image. */
  applied:     boolean;
  /** Filter was skipped (shouldRun() returned false). */
  skipped:     boolean;
  /** Human-readable reason for skipping (e.g. "disabled in config", "already high-res"). */
  skipReason?: string;
  /** Wall-clock execution time in ms (0 if skipped). */
  elapsedMs:   number;
  /** Time spent in analyze() phase in ms. */
  analyzeMs?:  number;
  /** Time spent in validate() phase in ms. */
  validateMs?: number;
  /** Human-readable description of what was done (e.g. "scale 1.5×", "trim t=5 l=3"). */
  detail?:     string;
}

/**
 * Detailed record of every normalization operation the PreprocessStage applied.
 * Stored in OCRContext.preprocessMetadata for debugging and statistics.
 */
export interface PreprocessMetadata {
  // ── Dimensions ─────────────────────────────────────────────────────────────
  originalWidth:    number;
  originalHeight:   number;
  normalizedWidth:  number;
  normalizedHeight: number;
  pixelCount:       number;
  aspectRatio:      number;
  orientation:      ImageOrientation;

  // ── Normalization operations (2B.1) ─────────────────────────────────────
  orientationNormalized: boolean;
  trimAttempted:         boolean;
  trimApplied:           boolean;
  trimBounds: { top: number; right: number; bottom: number; left: number };

  // ── Enhancement filter results (2B.2) ─────────────────────────────────
  /** Per-filter execution records in priority order. */
  filterRecords:   FilterRecord[];
  /** Names of filters where applied=true (for quick lookup). */
  filtersApplied:  string[];
  /** Total number of filters that executed (shouldRun returned true). */
  filtersExecuted: number;
  /** Total number of filters that were skipped (shouldRun returned false). */
  filtersSkipped:  number;
  upscaleApplied:  boolean;
  upscaleFactorX:  number;
  upscaleFactorY:  number;
  grayscaleApplied:  boolean;
  contrastApplied:   boolean;
  thresholdApplied:  boolean;

  // ── Cleanup + Geometry + Finalization (2B.3) ───────────────────────────
  medianApplied:     boolean;
  morphologyApplied: boolean;
  deskewAngleDeg:    number;
  sharpenApplied:    boolean;

  // ── Quality Score (2B.3 Refinement) ────────────────────────────────────
  /** Overall image quality score 0–100 computed post-preprocessing. */
  imageQualityScore: number;

  // ── Timing ─────────────────────────────────────────────────────────────────
  validationMs:      number;
  decodeMs:          number;
  orientationMs:     number;
  encodeMs:          number;
  totalPreprocessMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Statistics  (set by StatisticsStage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate statistics for one OCR run.
 *
 * Timing fields are populated by the orchestrator from ctx.stageResults.
 * Image dimensions are copied from ctx.metadata.
 * Most fields are available after Milestone 2A; a few are stubs for 2C/2D.
 */
export interface OCRStatistics {
  // ── Text ───────────────────────────────────────────────────────────────────
  wordCount:  number;
  charCount:  number;
  lineCount:  number;

  // ── Confidence ─────────────────────────────────────────────────────────────
  meanWordConfidence: number;
  minWordConfidence:  number;
  maxWordConfidence:  number;
  /** Words with confidence below OCRConfig.confidence.minAcceptable */
  lowConfidenceWordCount: number;

  // ── Content ────────────────────────────────────────────────────────────────
  /** Heuristic content classification. */
  contentType: string;
  /** BCP-47 tag. 'unknown' until Milestone 2C. */
  detectedLanguage: string;

  // ── Timing (ms) ────────────────────────────────────────────────────────────
  totalProcessingTime:   number;
  recognitionTime:       number;
  preprocessingTime:     number;
  postprocessingTime:    number;

  // ── Engine ─────────────────────────────────────────────────────────────────
  engine:          string;
  pipelineVersion: string;

  // ── Image + Preprocessing summary ─────────────────────────────────────────
  imageWidth:  number;
  imageHeight: number;
  orientation: ImageOrientation;
  trimApplied:      boolean;
  filtersApplied:   string[];
  filtersExecuted:  number;
  filtersSkipped:   number;
  upscaleApplied:   boolean;
  grayscaleApplied: boolean;
  contrastApplied:  boolean;
  thresholdApplied: boolean;
  medianApplied:    boolean;
  morphologyApplied: boolean;
  deskewAngleDeg:   number;
  sharpenApplied:   boolean;
  /** Overall image quality score 0–100 computed post-preprocessing. */
  imageQualityScore: number;

  // ── Quality Analysis (Milestone 2C.1) ───────────────────────────────────
  recognitionConfidence:  number;
  overallConfidence:      number;
  qualityScore:           number;
  warningCount:           number;
  qualityAnalysisTime:    number;
  qualityPipelineVersion: string;

  // ── Retry Engine (Milestone 2C.2) ───────────────────────────────────────
  retryAttemptCount:     number;
  retryProfilesUsed:     string[];
  bestProfile:           string;
  retryImproved:         boolean;
  confidenceImprovement: number;
  bestAttempt:           number;
  retryProcessingTime:   number;
  comparisonScore:       number;
  retrySkippedReason:    string;
  retryBudgetUsed:       number;
  executionSummary:      import('../retry/retryTypes').RetryExecutionSummary | null;

  // ── Profile Intelligence (Milestone 2C.3) ─────────────────────────────────
  selectedProfile:      string;
  profileConfidence:    number;
  candidateCount:       number;
  profileSelectionTime: number;
  profileVersion:       string;

  // ── Language Intelligence (Milestone 2C.4) ────────────────────────────────
  selectedLanguage:       string;
  script:                 string;
  languageConfidence:     number;
  languageDetectionTime:  number;
  languageCandidateCount: number;
  languageVersion:        string;

  // ── Advanced OCR Framework (Milestone 2D) ─────────────────────────────────
  layoutType:             string;
  layoutConfidence:       number;
  tableCount:             number;
  regionCount:            number;
  blockCount:             number;
  advancedProcessingTime: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-stage result  (recorded by the timing wrapper)
// ─────────────────────────────────────────────────────────────────────────────

export type StageStatus = 'success' | 'warning' | 'error' | 'skipped';

export interface StageResult {
  stageName:  string;
  status:     StageStatus;
  startedAt:  number;    // performance.now()
  finishedAt: number;    // performance.now()
  elapsedMs:  number;
  message?:   string;
  error?:     string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipeline Context  (the shared mutable state that flows through every stage)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OCRContext is created once by the orchestrator and passed sequentially
 * through every stage.  Each stage reads what it needs and writes to its
 * own designated fields.
 *
 * Field ownership map:
 *   originalImage   → set once by orchestrator (never mutated)
 *   workingImage    → set by AnalysisStage; PreprocessStage (2B) may replace it
 *   metadata        → set by AnalysisStage
 *   rawText         → set by RecognitionStage
 *   wordData        → set by RecognitionStage
 *   engineMetadata  → set by RecognitionStage
 *   processedText   → set by PostProcessStage
 *   confidence      → set by ConfidenceStage
 *   language        → set by LanguageStage
 *   correctedText   → set by CorrectionStage
 *   statistics      → set by StatisticsStage
 *   stageResults    → appended by runStage() timing wrapper
 *   warnings        → appended by any stage (non-fatal)
 *   errors          → appended by any stage (fatal — pipeline stops)
 */
export interface OCRContext {
  // ── Image ──────────────────────────────────────────────────────────────────
  /** Original unmodified input. Never reassigned after creation. */
  readonly originalImage: string;
  /** Current working image. May be replaced by PreprocessStage. */
  workingImage:        string;
  metadata:            ImageMetadata | null;
  /** Detailed record of preprocessing operations. Set by PreprocessStage. */
  preprocessMetadata:  PreprocessMetadata | null;

  // ── Recognition output ─────────────────────────────────────────────────────
  rawText:        string;
  wordData:       WordData[];
  /** Engine-specific raw output stored for Milestone 2C analysis. */
  engineMetadata: Record<string, unknown>;

  // ── Post-processing ────────────────────────────────────────────────────────
  /** Text after PostProcessStage (trimmed, code-block wrapped). */
  processedText:  string;
  /** Mean aggregate confidence (0–100). Set by ConfidenceStage. */
  confidence:     number;
  /** BCP-47 language tag. 'unknown' until Milestone 2C. */
  language:       string;
  /** Final text after CorrectionStage. Pass-through until Milestone 2D. */
  correctedText:  string;

  // ── Quality Analysis (Milestone 2C.1) ───────────────────────────────────
  qualityReport:          import('../quality/qualityTypes').OCRQualityReport | null;
  contentType:            string;
  contentDetection:       import('../quality/qualityTypes').ContentDetection | null;
  confidenceBreakdown:    import('../quality/qualityTypes').ConfidenceBreakdown | null;
  qualityPipelineVersion: string;
  recommendations:        import('../quality/qualityTypes').QualityRecommendation[];

  // ── Retry Engine (Milestone 2C.2) ───────────────────────────────────────
  retryDecision:          import('../retry/retryTypes').RetryDecision | null;
  retryHistory:           import('../retry/retryTypes').RetryResult[];
  bestRetry:              import('../retry/retryTypes').RetryResult | null;
  selectedRetryProfile:   string;
  retryPlan:              import('../retry/retryTypes').RetryPlan | null;
  retryBudget:            import('../retry/retryTypes').RetryBudget;
  comparisonReport:       import('../retry/retryTypes').ComparisonReport | null;
  retryExecutionSummary:  import('../retry/retryTypes').RetryExecutionSummary | null;
  retrySkippedReason:     import('../retry/retryTypes').RetrySkippedReason | null;

  // ── Profile Intelligence (Milestone 2C.3) ─────────────────────────────────
  profileRecommendation: import('../profile/profileTypes').ProfileRecommendation | null;
  selectedProfile:       string;
  profileCandidates:     import('../profile/profileTypes').ProfileCandidate[];
  profileHistory:        import('../profile/profileTypes').ProfileSelectionHistory[];
  profileConfidence:     number;

  // ── Language Intelligence (Milestone 2C.4) ────────────────────────────────
  languageRecommendation: import('../language/languageTypes').LanguageRecommendation | null;
  languageCandidates:     import('../language/languageTypes').LanguageCandidate[];
  script:                 import('../language/languageTypes').ScriptDetection | null;
  languageConfidence:     import('../language/languageTypes').LanguageConfidence | null;
  languageHistory:        import('../language/languageTypes').LanguageSelectionHistory[];

  // ── Advanced OCR Framework (Milestone 2D) ─────────────────────────────────
  ocrDocument:        import('../advanced/advancedTypes').OCRDocument | null;
  layoutAnalysis:     import('../advanced/advancedTypes').LayoutAnalysis | null;
  textBlocks:         import('../advanced/advancedTypes').TextBlock[];
  detectedTables:     import('../advanced/advancedTypes').TableStructure[];
  readingOrder:       string[];
  advancedStatistics: import('../advanced/advancedTypes').AdvancedOCRStatistics | null;

  // ── Pipeline metadata ──────────────────────────────────────────────────────
  statistics:     OCRStatistics | null;
  stageResults:   Record<string, StageResult>;
  warnings:       string[];
  errors:         string[];
  pipelineStartedAt: number;
  pipelineVersion:   string;
  config:            OCRConfig;
  /**
   * Intermediate preprocessing debug snapshots (filterName → SnapshotReference).
   * Only populated when config.debug.preprocessSnapshots = true.
   */
  preprocessSnapshots: Record<string, import('../preprocessing/imageFilter').SnapshotReference>;
}

/** Create a zero-value OCRContext for the orchestrator to populate. */
export function createOCRContext(image: string, config: OCRConfig): OCRContext {
  return {
    originalImage:       image,
    workingImage:        image,
    metadata:            null,
    preprocessMetadata:  null,
    rawText:             '',
    wordData:            [],
    engineMetadata:      {},
    processedText:       '',
    confidence:          0,
    language:            config.languageDetection.fallback,
    correctedText:       '',
    qualityReport:          null,
    contentType:            'unknown',
    contentDetection:       null,
    confidenceBreakdown:    null,
    qualityPipelineVersion: '2.1',
    recommendations:        [],
    retryDecision:          null,
    retryHistory:           [],
    bestRetry:              null,
    selectedRetryProfile:   'DEFAULT',
    retryPlan:              null,
    retryBudget:            { maximumAttempts: 2, maximumProcessingTimeMs: 5000, minimumConfidenceGain: 0 },
    comparisonReport:       null,
    retryExecutionSummary:  null,
    retrySkippedReason:     null,
    profileRecommendation: null,
    selectedProfile:       'DEFAULT',
    profileCandidates:     [],
    profileHistory:        [],
    profileConfidence:     0,
    languageRecommendation: null,
    languageCandidates:     [],
    script:                 null,
    languageConfidence:     null,
    languageHistory:        [],
    ocrDocument:        null,
    layoutAnalysis:     null,
    textBlocks:         [],
    detectedTables:     [],
    readingOrder:       [],
    advancedStatistics: null,
    statistics:          null,
    stageResults:        {},
    warnings:            [],
    errors:              [],
    pipelineStartedAt:   performance.now(),
    pipelineVersion:     '2.0.0',
    config,
    preprocessSnapshots: {},
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stage Interface  (every pipeline stage implements this)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every pipeline stage implements OCRStage.
 *
 * CONTRACT:
 *   • Receive OCRContext.
 *   • Perform exactly ONE responsibility.
 *   • Return the updated OCRContext (same object reference is fine).
 *   • Never throw — push to ctx.errors and return instead.
 *   • Never call another stage directly.
 *   • Never depend on a specific OCR engine — only on the OCREngine interface.
 */
export interface OCRStage {
  /** Human-readable name. Used in logs and stageResults keys. */
  readonly name: string;
  execute(ctx: OCRContext): Promise<OCRContext>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Final Result  (returned by performOCR() to callers)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured output of the OCR pipeline.
 *
 * Callers that only need text:
 *   const text = result.text;
 *
 * Callers that need quality signals (Milestone 2C UI, developer panel):
 *   result.confidence, result.statistics, result.warnings
 *
 * The full context is attached when config.debug.attachContext = true.
 */
export interface OCRResult {
  /** Final text ready for injection (post-processed and corrected). */
  text:        string;

  /** Aggregate confidence 0–100. */
  confidence:  number;

  /** BCP-47 language tag. */
  language:    string;

  /** Detailed per-run statistics. */
  statistics:  OCRStatistics | null;

  /** Image metadata from AnalysisStage. */
  metadata:    ImageMetadata | null;

  /** Per-stage timing records. */
  stageTimings: Record<string, StageResult>;

  /** Total pipeline time in ms (context creation → result returned). */
  totalElapsedMs: number;

  /** Non-fatal warnings accumulated across all stages. */
  warnings:    string[];

  /** Fatal errors that caused stage(s) to fail. */
  errors:      string[];

  /** Semver of the pipeline that produced this result. */
  pipelineVersion: string;

  /** Full context snapshot. Attached when config.debug.attachContext = true. */
  context:     OCRContext | null;
}
