# PromptLens Typography Specification

> **A modern, legibility-first typographic scale optimized for technical content, monospaced code blocks, and crisp UI displays.**

---

## 1. Font Family Selections & Justification

### 1. Logo & Brand Typeface: **Inter Display / Outfit**
- **Primary Choice**: `Inter Display` (fallback: `Outfit`, `system-ui`)
- **Rationale**: `Inter Display` features tight tracking and optical metrics crafted specifically for prominent display headlines. It communicates modern software precision without decorative distraction.

### 2. User Interface Typeface: **Inter**
- **Primary Choice**: `Inter` (fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`)
- **Rationale**: Designed by Rasmus Andersson specifically for computer screens. `Inter` provides exceptional legibility at small point sizes (11px–14px), distinct number glyphs, and extensive tall x-heights ideal for extension popup menus and dense data overlays.

### 3. Code & Monospaced Typeface: **JetBrains Mono**
- **Primary Choice**: `"JetBrains Mono"` (fallback: `"Fira Code", "SF Mono", Consolas, monospace`)
- **Rationale**: `JetBrains Mono` features expanded letter height, ligatures for programming operators (`=>`, `===`, `!=`), and unambiguous distinction between `0` / `O` and `1` / `l` / `I`. Critical for presenting extracted OCR code snippets accurately.

### 4. Documentation & Long-Form Reading: **Inter / System Serif Fallback**
- **Primary Choice**: `Inter`
- **Rationale**: Maintains visual continuity across the product ecosystem, GitHub documentation, and web documentation pages.

---

## 2. Typographic Hierarchy & Scale

Defined using a **1.250 Major Third** modular scale for visual rhythm.

| Level | Size (px) | Rem | Weight | Line Height | Letter Spacing | Target Elements |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Display / Hero** | `32px` | `2.0rem` | `700 (Bold)` | `1.2` | `-0.02em` | GitHub Banner Headline, Main Landing Header |
| **H1 (Header 1)** | `24px` | `1.5rem` | `600 (SemiBold)`| `1.3` | `-0.015em` | Page titles, primary modal headers |
| **H2 (Header 2)** | `18px` | `1.125rem`| `600 (SemiBold)`| `1.4` | `-0.01em` | Section headers, card titles |
| **H3 (Header 3)** | `15px` | `0.9375rem`| `500 (Medium)`  | `1.4` | `0em` | Subsection titles, fieldset legends |
| **Body (Regular)** | `13px` | `0.8125rem`| `400 (Regular)` | `1.5` | `0em` | Standard text, paragraph descriptions |
| **Body (Medium)** | `13px` | `0.8125rem`| `500 (Medium)`  | `1.5` | `0em` | Emphasized UI text, label headers |
| **Code / Mono** | `12px` | `0.75rem`  | `400 (Regular)` | `1.6` | `0em` | Extracted code text, terminal outputs, JSON payload display |
| **Caption / Small**| `11px` | `0.6875rem`| `400 (Regular)` | `1.4` | `0.01em` | Metadata values, timestamp logs, status pill badges |
| **Button Text** | `13px` | `0.8125rem`| `500 (Medium)`  | `1.0` | `0.01em` | Interactive CTA button labels |

---

## 3. CSS Font Stack Declarations

```css
:root {
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --font-display: 'Inter Display', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, Monaco, 'Andale Mono', monospace;
}
```
