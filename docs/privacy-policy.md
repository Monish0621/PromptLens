# Privacy Policy for PromptLens

**Effective Date**: July 26, 2026

PromptLens is committed to respecting user privacy. This Privacy Policy explains how PromptLens processes data, why specific browser permissions are required, how local storage is used, and the handling of user-initiated third-party AI context routing.

---

## 1. Local Processing Architecture

PromptLens is designed around a local-first processing model:

- **Local WebAssembly OCR**: All text extraction, image preprocessing, layout analysis, and character recognition execute locally within your browser using bundled WebAssembly components (`tesseract-core.wasm`).
- **No PromptLens Remote Servers**: PromptLens does not operate external backend servers, cloud OCR endpoints, telemetry trackers, or remote analytics services.
- **In-Memory Image Buffering**: Visual screen selections exist temporarily in volatile browser memory buffers during extraction and are discarded immediately after processing.

---

## 2. Data Handling, Storage & Retention

- **Screen Captures**: Screenshot regions are held in memory during OCR processing and are not written to your permanent disk or file system by PromptLens.
- **OCR Text & Session History**: Extracted text snippets are stored locally on your device in `chrome.storage.local` under session history (capped at a maximum of 20 items) so you can review or re-copy recent clips. You can clear your session history at any time.
- **Tab Screen Recording**: Browser tab screen recordings (`tabCapture`) are processed locally in an offscreen MediaRecorder context. Recording streams are held temporarily in local storage/memory for user review or download and are never transmitted to PromptLens servers.
- **Clipboard Operations**: PromptLens copies extracted text or screen capture images to your system clipboard strictly when you explicitly trigger the copy action.

---

## 3. Browser Tab Information & AI Destination Routing

PromptLens inspects open browser tabs locally to identify active AI assistant destinations:

- **Supported AI Services**: OpenAI ChatGPT (`chatgpt.com`), Anthropic Claude (`claude.ai`), Google Gemini (`gemini.google.com`), xAI Grok (`grok.com`), and Perplexity AI (`perplexity.ai`).
- **Domain Matching**: PromptLens queries open tab URLs locally using Chrome's native `tabs` API solely to match supported AI provider domains for candidate destination selection.
- **Non-AI Tab Privacy**: URLs, titles, and activity from non-matching browser tabs are ignored, never recorded, and never stored.
- **User-Initiated Context Routing**: Selected OCR text or screen capture context is delivered to a supported AI service ONLY when you explicitly select a destination tab and click to inject or send. PromptLens never automatically transmits data to third-party services.

---

## 4. Extension Permissions & Technical Justifications

PromptLens requests only the permissions necessary to deliver its core single-purpose features:

| Permission | User-Facing Technical Justification |
| :--- | :--- |
| `activeTab` | Allows PromptLens to capture the visible page region when you explicitly trigger a screenshot or OCR selection. |
| `tabs` | Allows PromptLens to inspect open tab URLs locally to discover active AI destinations (ChatGPT, Claude, Gemini, Grok, Perplexity) for prompt routing. |
| `scripting` | Allows PromptLens to render visual selection overlays and floating recording controls on the active page. |
| `offscreen` | Allows PromptLens to run WebAssembly OCR extraction and tab recording streams in an isolated background document. |
| `storage` | Allows PromptLens to persist user preferences, AI tab destination options, and recent clip history locally using `chrome.storage.local`. |
| `tabCapture` | Allows PromptLens to capture browser tab video streams when you explicitly start a screen recording workflow. |
| `clipboardWrite` | Allows PromptLens to copy extracted OCR text or screenshots to your system clipboard upon your explicit action. |
| `<all_urls>` | Required to display the interactive visual selection overlay across web pages when you press a hotkey or trigger capture. |

---

## 5. Third-Party Data Sharing & Limited Use Compliance

- **No Data Selling**: PromptLens does not sell, rent, or trade your personal data or screen content to third parties.
- **No Advertising or Profiling**: PromptLens does not collect or use your data for advertising, targeted marketing, credit evaluation, or user profiling.
- **No Remote Telemetry**: PromptLens does not contain tracking pixels, analytics SDKs, or background surveillance code.
- **Chrome Web Store Limited Use Statement**: PromptLens limits its use and transfer of user data strictly to providing and improving the extension's disclosed single purpose and user-facing features, in full compliance with the Chrome Web Store User Data Policy and Limited Use requirements.

---

## 6. Open-Source Verification & Contact

PromptLens is an open-source project. Users and security researchers may inspect the complete source code, permission definitions, and local processing implementation on GitHub:

- **Repository**: [https://github.com/Monish0621/PromptLens](https://github.com/Monish0621/PromptLens)
- **Issue Tracker**: [https://github.com/Monish0621/PromptLens/issues](https://github.com/Monish0621/PromptLens/issues)
