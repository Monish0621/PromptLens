# PromptLens GitHub Hero Banner Specification

> **Design blueprint for the official GitHub repository README header banner (`1200x630 px` aspect ratio / `1200x400 px` compact hero).**

---

## 1. Canvas Dimensions & Grid Layout

- **Canvas Dimensions**: `1200 px` width $\times$ `460 px` height (Optimal for GitHub README light/dark themes and social preview open-graph cards).
- **Layout Structure**: 2-Column Split Layout (`55%` Left Content / `45%` Right Perspective Demo).
- **Safe Margins**: `64px` top/bottom/left/right padding to prevent clipping on mobile displays.

```
+-----------------------------------------------------------------------------------+
|  [64px Safe Margin]                                                               |
|                                                                                   |
|  LEFT COLUMN (55% Width)                  RIGHT COLUMN (45% Width)                |
|  -----------------------                  ------------------------                |
|  [Badge: PRIVACY-FIRST LOCAL OCR]         [Perspectived Interface Mockup]         |
|                                           +------------------------------------+  |
|  PromptLens                               |  Overlay Selection Framing         |  |
|  Capture. Understand. Prompt.             |  +------------------------------+  |  |
|                                           |  |  const rawText = "ocr";      |  |  |
|  Turn any screen selection into           |  +------------------------------+  |  |
|  clean, AI-ready context.                 |  [Structured Code Block Card]      |  |
|                                           +------------------------------------+  |
|  [Primary CTA: Explore Extension]                                                 |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Typography & Copy Hierarchy

- **Tagline Badge**: `PRIVACY-FIRST LOCAL OCR`
  - Font: `JetBrains Mono Medium` (11px / 0.68rem, Uppercase, Tracking `0.08em`)
  - Style: `#00F0FF` text inside `#161B22` container with `1px border #30363D` and `4px` corner radius.
- **Product Title**: `PromptLens`
  - Font: `Inter Display Bold` (48px / 3.0rem, Tracking `-0.025em`)
  - Color: `#F0F6FC` (High-contrast primary text).
- **Tagline Subheading**: `Capture. Understand. Prompt.`
  - Font: `Inter SemiBold` (20px / 1.25rem, Tracking `-0.01em`)
  - Color: `#00F0FF` (Brand Cyan accent).
- **Description Paragraph**: `Turn any screen selection into clean, AI-ready context using local, in-browser WebAssembly OCR.`
  - Font: `Inter Regular` (15px / 0.93rem, Line height `1.5`)
  - Color: `#8B949E` (Secondary label text).

---

## 3. Background Style & Visual Elements

- **Base Background Fill**: `#0A0D12` (Deep Charcoal / Slate Black).
- **Grid Pattern Overlay**: Subtle radial dot matrix background (`#21262D` color, `24px` dot spacing, `15%` opacity) fading out gracefully toward edges.
- **Ambient Glow Effects**: Two soft, low-opacity radial ambient light gradients:
  - Top Left: `400px` radial bloom in `#00F0FF` at `6%` opacity.
  - Center Right: `450px` radial bloom in `#6E56CF` at `8%` opacity behind the product screenshot mockup.

---

## 4. Right-Column Product Mockup Specification

- **Interface Frame**: 3D Isometric Tilt (12-degree Y-axis rotation, 4-degree X-axis rotation with subtle drop shadow `0 20px 40px rgba(0,0,0,0.6)`).
- **Framed Element**: High-resolution snippet card demonstrating the active selection box capturing code text and immediately outputting clean formatted Markdown syntax (` ```typescript ` code fence).
- **Border Treatment**: 1px subtle highlight stroke `#30363D` with Brand Cyan (`#00F0FF`) corner selection handles.
