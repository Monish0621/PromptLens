# Frequently Asked Questions (FAQ)

### What is PromptLens?
PromptLens is a privacy-first Chrome Extension designed to transform screen selections into clean, structured, AI-ready text using local WebAssembly OCR. It helps developers, students, and technical professionals capture visual code snippets, terminal output, structured data, or documentation and route it into AI prompts.

---

### How does OCR processing work in PromptLens?
PromptLens uses a modular 12-stage OCR pipeline powered by a bundled Tesseract WebAssembly (`.wasm`) engine running inside an offscreen browser document context. Visual selections undergo automated image preprocessing (upscaling, adaptive thresholding, deskewing, noise reduction), layout analysis, text block segmentation, quality evaluation, and dynamic profile retries to extract structured text.

---

### Is my data uploaded to external servers?
PromptLens itself does not transmit captured screenshots or extracted OCR text to external servers during normal operation. Text extraction and layout analysis are performed locally within the browser using bundled WebAssembly components.

---

### Are screenshots saved to my local hard drive?
No automatic screenshot saving is performed. PromptLens processes visual selections directly in memory buffers, which are released after text extraction completes.

---

### Does PromptLens work offline?
PromptLens is designed to perform text extraction offline because the WebAssembly OCR engine and language data files are bundled locally inside the extension package.

---

### Which languages and character sets are supported?
PromptLens includes script detection for **Latin**, **Devanagari**, **Kannada**, **Tamil**, **Telugu**, **Arabic**, and **CJK** character sets, alongside candidate scoring for common natural languages. The pipeline uses English as its primary default language with fallback handling.

---

### Which web browsers are supported?
PromptLens is developed and tested on Google Chrome (Manifest V3). Other Chromium-based browsers may be compatible depending on support for the required extension APIs.

---

### Who is PromptLens designed for?
- **Developers & Engineers**: Extracting code snippets from video tutorials, webinars, or image tracebacks.
- **Students & Researchers**: Capturing non-selectable text from lecture slides, PDFs, or diagrams.
- **AI Users**: Rapidly transferring visual context into ChatGPT, Claude, or local LLM interfaces.
- **QA Engineers & Technical Writers**: Extracting terminal logs and structured error messages for bug reports.

---

### How can I contribute to PromptLens?
We welcome community contributions! You can contribute by opening issues, testing edge cases, or submitting pull requests. Please refer to our [CONTRIBUTING.md](../CONTRIBUTING.md) guide for setup instructions and coding guidelines.
