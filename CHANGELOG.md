# Changelog

All notable changes to **PromptLens** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned
- Custom user-configurable OCR profiles and threshold parameters in extension popup options.
- Support for additional offline Tesseract language packs (Spanish, French, German, Japanese, Chinese).
- Batch region capture mode for multi-selection workflows.

---

## [1.0.0] - 2026-07-26

### Added
- **Initial Public Release of PromptLens** — Capture. Understand. Prompt.
- **Privacy-First WebAssembly OCR**: In-browser offline text extraction using Tesseract WASM adapter running in Chrome Offscreen Canvas / Web Worker contexts.
- **Modular 12-Stage Pipeline Architecture**:
  - `AnalysisStage`: Metadata calculation and dimension validation.
  - `PreprocessStage`: Automated image normalization, orientation correction, smart upscaling, adaptive grayscale, contrast enhancement, adaptive thresholding, deskewing, median denoising, and sharpening.
  - `RecognitionStage`: Pluggable engine interface wrapping Tesseract WASM driver.
  - `AdvancedRecognitionStage`: Bounding region grouping, text block classification (`code`, `paragraph`, `terminal`, `heading`, `table`, `quote`), top-down/column-aware reading order resolution, and lightweight table structure grid detection.
  - `PostProcessStage`: Code block wrapping, markdown fence formatting, and whitespace normalization.
  - `QualityAnalysisStage`: Multi-factor quality engine measuring character cascade density, syntax fence balance, structural integrity, penalties, and recommendations.
  - `ProfileSelectionStage`: Dynamic scoring engine selecting targeted OCR profiles (`CODE`, `DOCUMENT`, `JSON`, `TERMINAL`, `MARKDOWN`, `LOW_RESOLUTION`, `HIGH_CONTRAST`) before retries occur.
  - `RetryDecisionStage`: Intelligent multi-pass retry orchestrator executing fallback profile attempts constrained by `RetryBudget` and `RetryStrategy`.
  - `ConfidenceStage`: Aggregate word-level and block-level confidence scoring.
  - `LanguageStage`: Script detector classifying text into 8 Unicode block categories (`Latin`, `Devanagari`, `Kannada`, `Tamil`, `Telugu`, `Arabic`, `CJK`, `Mixed`) and scoring candidate languages using lightweight script classification rules.
  - `CorrectionStage`: Post-processing text corrections.
  - `StatisticsStage`: Aggregate timing metrics breakdown and performance collection.
- **Screen Selection Overlay UI**: Interactive visual capture tool with hotkey trigger support.
- **Direct AI Context Injection**: Context routing for popular Web AI interfaces (ChatGPT, Claude, VS Code, etc.) with automatic clipboard fallback.
- **Zero-Storage Architecture**: Screen selections are captured to transient memory canvases and garbage-collected immediately following OCR extraction.
