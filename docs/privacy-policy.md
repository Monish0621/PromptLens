# Privacy Policy for PromptLens

**Effective Date**: July 26, 2026

PromptLens is committed to respecting user privacy. This Privacy Policy explains how PromptLens processes data, why browser permissions are required, and the architecture surrounding local execution.

---

## 1. Local Processing Architecture

PromptLens is designed around local in-browser processing:

- **Local Execution**: PromptLens is designed to perform OCR processing, image enhancement, layout analysis, and text extraction locally within the browser using bundled WebAssembly components.
- **No External Text Transmission**: PromptLens itself does not transmit captured screenshots or extracted OCR text to external servers during normal operation.
- **In-Memory Selection Processing**: Visual screen selections exist in volatile browser memory buffers during text extraction and are discarded after processing completes.

---

## 2. Data Handling & Storage

- PromptLens does not maintain external analytics or remote usage tracking infrastructure.
- PromptLens does not save captured screenshot images to your local disk or file system.
- Captured image buffers are processed in memory and released following pipeline completion.

---

## 3. Extension Permissions & Technical Justification

PromptLens requests specific browser permissions required for its core features:

| Permission | Technical Justification |
| :--- | :--- |
| `activeTab` | Required to display the selection overlay interface on the active tab when triggered by the user. |
| `scripting` | Required to inject the screen selection capture overlay into the active page when requested. |
| `offscreen` | Required to create an isolated background offscreen document to run the WebAssembly OCR engine without interrupting main tab performance. |

---

## 4. Operational Flow

1. **User Action**: The user initiates a screen selection via hotkey or extension action.
2. **Local Selection**: An overlay script captures the user-selected bounding box region on the screen.
3. **In-Memory OCR**: The selection buffer is passed to an isolated Chrome Offscreen document where bundled WebAssembly components extract text locally.
4. **Context Formatting & Routing**: Extracted text is formatted and routed to an active AI tab interface or copied to the system clipboard.
5. **Memory Cleanup**: Image buffers are released upon pipeline completion.

---

## 5. Third-Party Libraries

PromptLens uses bundled local dependencies, including the Tesseract WebAssembly engine binary (`tesseract-core.wasm`) and language data files located within the extension package (`public/tesseract/`). No external remote scripts are loaded at runtime.

---

## 6. Open-Source Verification

PromptLens is an open-source project. Users and developers may review the source code and local processing implementation on GitHub:

- **Repository**: [https://github.com/Monish0621/PromptLens](https://github.com/Monish0621/PromptLens)
- **Issue Tracker**: [https://github.com/Monish0621/PromptLens/issues](https://github.com/Monish0621/PromptLens/issues)
