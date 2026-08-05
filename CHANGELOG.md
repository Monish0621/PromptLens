# Changelog

All notable changes to **PromptLens** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [1.0.0] - 2026-08-05

### Added

- **Initial Public Release of PromptLens** — Capture. Understand. Prompt.
- **Privacy-First WebAssembly OCR**: In-browser offline text extraction using Tesseract WASM adapter executing inside a Manifest V3 Offscreen Document.
- **Adaptive Dark Theme Polarity Normalization (`AdaptiveInvertFilter`)**: Automatic detection of dark-background screenshots and image polarity normalization prior to OCR recognition.
- **Modular 12-Stage Pipeline Architecture**: Multi-stage OCR pipeline featuring analysis, image preprocessing, engine recognition, reading order resolution, block classification, post-processing, quality analysis, profile selection, retry decision orchestration, confidence scoring, script/language detection, and metrics statistics collection.
- **Precision Region Selection Canvas Overlay**: Interactive full-page visual capture overlay with native keyboard triggers (`Alt+S` for screenshots, `Alt+O` for OCR).
- **Multi-Tab AI Context Routing**: Auto-discovery and injection payload routing for active AI assistant tabs (ChatGPT, Claude, Gemini, Grok, and Perplexity).
- **Interactive Share Sheet Overlay**: Page-embedded context injection interface for selecting target AI tabs directly upon capture completion.
- **Browser Tab Screen Recording**: Stream recording using the `tabCapture` API with a lightweight floating controller overlay.
- **Session Snippet History**: Persistent session dashboard to inspect, re-copy, or re-route recent OCR extractions and screen clips.

### Changed

- **Temporary Injection UX**: Refactored the popup injection panel to render strictly as a temporary workflow state that automatically dismisses upon injection, cancellation, tab closing, or extension reload.
- **Code Preset Filter Bypass**: Selective bypass of aggressive median and morphology pre-processing filters for technical code presets to preserve symbol, parenthesis, and syntax legibility.
- **Device Pixel Ratio Scaling**: Normalized selection coordinates across High-DPI and Retina displays (`devicePixelRatio`) to prevent coordinate clipping or sub-pixel blurring during OCR preprocessing.
- **Production Asset & Repository Cleanup**: Purged starter templates, duplicate media assets, raw unreferenced source videos, and unused dependencies (`clsx`, `tailwind-merge`).
- **Documentation Updates**: Added comprehensive architecture specification, privacy policy, FAQ guide, and contributing guidelines.

### Fixed

- **Chrome-Native Claude Favicon Resolution**: Resolved missing favicons for client-side hydrated SPAs (such as Claude.ai) by dynamically synchronizing tab properties via Chrome's native `chrome.tabs.Tab.favIconUrl` API.
- **Selection Overlay Click Suppression**: Added capture-phase event cancellation (`preventDefault`, `stopPropagation`, and immediate `click` event interception) to prevent mouse release events from inadvertently triggering underlying DOM links or buttons after region selection.
- **Service Worker Message Routing**: Stabilized cross-context messaging between background service worker, offscreen sandbox, popup dashboard, and content script overlays.

### Performance

- **OCR Pipeline Preprocessing Optimization**: Optimized image pre-processing stages to cut region preparation time down to under 100ms.
- **Persistent Offscreen Worker Lifecycle**: Automated lazy initialization, worker instance reuse, and immediate buffer disposal for canvas contexts and MediaRecorder streams post-processing.
- **Production Bundle Optimization**: Streamlined extension output resulting in a ~2.2s build time and a compact upload footprint.

### Security

- **100% In-Browser Local Execution**: Zero remote server transmissions. All visual captures, OCR operations, and video recordings execute locally within browser memory buffers.
- **Zero Remote Script Dependencies**: Bundled WebAssembly binaries and language data files eliminate remote script injection risks and ensure full Chrome Web Store MV3 policy compliance.
- **In-Memory Capture Purging**: Visual frame buffers exist only temporarily in memory and are discarded immediately after text extraction.
