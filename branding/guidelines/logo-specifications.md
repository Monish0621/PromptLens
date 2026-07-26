# PromptLens Logo Specifications & Brand Usage Rules

> **Production guidelines, safe area calculations, minimum sizes, color usage matrix, and incorrect usage rules for the PromptLens Focus Frame brand identity.**

---

## 1. Logo Rationale & Design Symbolism

The PromptLens identity uses the **Focus Frame** mark family. It symbolizes the linear progression of visual context processing:

```
Capture  ➔  Focus  ➔  Understand  ➔  Prompt
  [L]        [⊙]         [===]         [>]
```

1. **Capture (Selection Brackets)**: The four corner crop marks represent user screen selection and intentional visual capture.
2. **Focus (Central Lens Core)**: The central aperture focal point represents local WebAssembly OCR analysis concentrating on the selected region.
3. **Understand (Structured Layout)**: Clean 90-degree geometric lines represent automated layout analysis, syntax classification, and block extraction.
4. **Prompt (AI Context)**: The clean high-contrast cyan accent represents AI-ready output formatted for LLM prompts.

---

## 2. Clear Space & Safe Area Rules

To ensure maximum visual impact, the logo must always maintain a minimum clear space perimeter free of external graphics, text, or page borders.

- **Clear Space Unit ($X$)**: $X$ is defined as the height of the `P` character in the PromptLens wordmark (or half the width of the Focus Frame symbol).
- **Minimum Clear Space Requirement**: $1.0X$ padding surrounding all four sides of the logo.

```
+-------------------------------------------------------------+
|                                                             |
|         +-----------------------------------------+         |
|         |                                         |         |
|   1.0X  |  [Focus Frame Symbol]   PromptLens      |  1.0X   |
|         |                                         |         |
|         +-----------------------------------------+         |
|                                                             |
+-------------------------------------------------------------+
```

---

## 3. Minimum Scale Limits

To maintain high visual fidelity and legibility, adhere to these minimum sizing boundaries:

| Logo Variant | Target Display Environment | Minimum Digital Width | Minimum Digital Height |
| :--- | :--- | :--- | :--- |
| **Favicon Icon (`favicon.svg`)** | Browser tab favicon | `16 px` | `16 px` |
| **Standalone Symbol (`promptlens-symbol.svg`)**| App launcher, extension toolbar action | `24 px` | `24 px` |
| **Primary Full Logo (`promptlens-logo-primary.svg`)**| Navigation headers, modal titles | `160 px` | `38 px` |
| **Wordmark Only (`promptlens-wordmark.svg`)**| Footer credits, compact headers | `120 px` | `24 px` |

---

## 4. Approved Color Variant Matrix

| Background Context | Approved Logo File | Symbol Colors | Text Colors |
| :--- | :--- | :--- | :--- |
| **Dark Theme Canvas (`#0A0D12` / `#161B22`)** | `promptlens-logo-primary.svg` | Brand Cyan (`#00F0FF`) + Gradient | Text Primary (`#F0F6FC`), Tagline Muted (`#8B949E`) |
| **Dark Frameless (`#0A0D12` background)** | `promptlens-logo-dark.svg` | Brand Cyan (`#00F0FF`) + Gradient | Text Primary (`#F0F6FC`) |
| **Light Theme Canvas (`#FFFFFF` / `#F6F8FA`)** | `promptlens-logo-light.svg` | Deep Blue (`#0969DA`) + Slate Violet | Text Primary (`#1F2328`), Tagline Muted (`#656D76`) |
| **Single Color / Print / Monochrome** | `promptlens-monochrome.svg` | Solid White (`#FFFFFF`) or Black (`#000000`) | Solid White (`#FFFFFF`) or Black (`#000000`) |

---

## 5. Incorrect Usage Rules

To maintain brand integrity, **NEVER** apply the following modifications:

- ❌ **Do Not Stretch or Distort**: Never alter aspect ratios or warp geometry.
- ❌ **Do Not Change Brand Colors**: Do not replace Brand Cyan (`#00F0FF`) with unapproved neon pinks, bright reds, or yellow gradients.
- ❌ **Do Not Rotate**: Keep logo horizontal; do not tilt at arbitrary angles.
- ❌ **Do Not Add Loud Drop Shadows**: Avoid heavy fuzzy drop shadows or outer neon glow filters behind text.
- ❌ **Do Not Place on Low-Contrast Backgrounds**: Never place the white/cyan logo on light gray surfaces without sufficient contrast.
- ❌ **Do Not Rearrange Elements**: Do not stack the symbol above the wordmark or change relative sizing ratios.

---

## 6. Vector Asset Export Manifest

The vector logo suite is located in `branding/logos/` and `branding/icons/`:

- [`branding/logos/promptlens-logo-primary.svg`](file:///d:/chrome%20extension/branding/logos/promptlens-logo-primary.svg) — Primary full brand logo with container canvas.
- [`branding/logos/promptlens-logo-dark.svg`](file:///d:/chrome%20extension/branding/logos/promptlens-logo-dark.svg) — Dark background optimized logo.
- [`branding/logos/promptlens-logo-light.svg`](file:///d:/chrome%20extension/branding/logos/promptlens-logo-light.svg) — Light background optimized logo.
- [`branding/logos/promptlens-symbol.svg`](file:///d:/chrome%20extension/branding/logos/promptlens-symbol.svg) — Standalone Focus Frame icon mark.
- [`branding/logos/promptlens-wordmark.svg`](file:///d:/chrome%20extension/branding/logos/promptlens-wordmark.svg) — Standalone text wordmark.
- [`branding/logos/promptlens-monochrome.svg`](file:///d:/chrome%20extension/branding/logos/promptlens-monochrome.svg) — Monochrome high-contrast logo.
- [`branding/icons/icon.svg`](file:///d:/chrome%20extension/branding/icons/icon.svg) — Master scalable extension icon.
- [`branding/icons/favicon.svg`](file:///d:/chrome%20extension/branding/icons/favicon.svg) — 16x16 crisp favicon mark.
