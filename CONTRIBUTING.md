# Contributing to PromptLens

Thank you for your interest in contributing to **PromptLens**! 

PromptLens is an open-source, privacy-first Chrome Extension designed to convert screen selections into clean, AI-ready context. We welcome contributions from developers, researchers, and technical writers.

---

## Development Setup

### Prerequisites

- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Browser**: Google Chrome, Brave, Edge, or Arc

### Environment Initialization

1. **Fork and Clone the Repository**:
   ```bash
   git clone https://github.com/YOUR-USERNAME/LLM-Context-Capture.git
   cd LLM-Context-Capture
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Launch Live Development Build**:
   ```bash
   npm run dev
   ```

4. **Load Unpacked Extension into Chrome**:
   - Go to `chrome://extensions/` in Google Chrome.
   - Enable **Developer mode** (top right).
   - Click **Load unpacked**.
   - Select the `.output/chrome-mv3` folder inside your project directory.

5. **Verify Production Build**:
   Before submitting changes, ensure the production bundle compiles with zero errors:
   ```bash
   npx wxt build
   ```

---

## Architecture Principles & Coding Standards

When contributing code to PromptLens, adhere to the following architectural guidelines:

1. **Local Processing First**:
   - PromptLens itself does not transmit captured screenshots or extracted OCR text to external servers during normal operation.
   - All image processing and text extraction are designed to run locally inside the browser process.

2. **Pipeline Stage Scoping**:
   - The OCR Pipeline (`utils/ocrPipeline/`) follows a strict 12-stage pipeline pattern.
   - Stages read from and write to the shared `OCRContext`.
   - Stages **must never throw exceptions** to the top-level orchestrator; catch stage-level errors, populate `ctx.warnings`, and return `ctx` gracefully.

3. **TypeScript Strictness**:
   - Write strongly-typed TypeScript code. Avoid using `any` where explicit types or interfaces can be defined.
   - Ensure all public exports have explicit return types.

4. **Zero-Storage Memory Policy**:
   - Never write captured screenshot blobs or image base64 strings to `chrome.storage.local` or disk.
   - Process image data URLs using memory canvases and release memory allocations when processing finishes.

---

## Commit Message Guidelines

PromptLens follows the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <short summary>

[optional body]
```

### Allowed Types

- `feat`: A new user-facing feature or pipeline capability (e.g., `feat(ocr): add adaptive threshold filter`).
- `fix`: A bug fix (e.g., `fix(overlay): resolve capture selection coordinate offset`).
- `docs`: Documentation changes (e.g., `docs(architecture): update 12-stage diagram`).
- `perf`: Performance improvements (e.g., `perf(language): optimize script detection regex`).
- `refactor`: Code restructuring without changing functionality.
- `test`: Adding or updating test suites.
- `chore`: Maintenance tasks or build configuration updates.

---

## Branch Naming Guidelines

Name topic branches using standard prefixes:

- `feature/description` (e.g., `feature/custom-ocr-profiles`)
- `bugfix/issue-description` (e.g., `bugfix/canvas-memory-leak`)
- `docs/topic` (e.g., `docs/faq-update`)
- `refactor/component` (e.g., `refactor/quality-engine`)

---

## Pull Request Guidelines

1. **Keep Pull Requests Focused**: Limit PRs to a single logical feature, fix, or documentation update.
2. **Verify Build**: Run `npx wxt build` to ensure the project compiles cleanly without TypeScript errors or bundling failures.
3. **Write Clear Descriptions**: Describe what problem the PR solves, what changes were made, and how to manually verify the functionality.
4. **No Breaking API Changes**: Maintain backward compatibility with `handleOcr() -> { success, text }` public message contracts.

---

## Reporting Issues

When reporting an issue on GitHub, please include:

- **Browser Name & Version**: (e.g., Chrome 124.0)
- **OS Platform**: (e.g., Windows 11, macOS Sonoma, Ubuntu 24.04)
- **Clear Steps to Reproduce**: Detailed instructions to trigger the issue.
- **Expected vs Actual Behavior**: What you expected to happen vs what actually occurred.
- **Console Logs / Error Tracebacks**: Relevant non-sensitive logs from the background worker or offscreen console.

---

## Code Review Expectations

All submissions are reviewed by maintainers. Reviews evaluate:
- Adherence to privacy & zero-storage principles.
- Code readability, design aesthetics, and architectural consistency.
- Proper handling of edge cases and non-blocking failure recovery.
- Verification of zero build warnings or errors.
