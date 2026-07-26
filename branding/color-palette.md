# PromptLens Color Palette Specification

> **A deliberate, dark-first color system engineered for high legibility, professional tool aesthetics, and WCAG AAA compliance.**

---

## 1. Primary & Brand Colors

| Color Token | HEX | RGB | Usage | Accessibility Note |
| :--- | :--- | :--- | :--- | :--- |
| **Brand Cyan (Primary)** | `#00F0FF` | `rgb(0, 240, 255)` | Active selection framing, primary CTA highlights, focus rings | 12.8:1 contrast against `#0A0D12` (Passes AAA) |
| **Deep Electric Blue** | `#0969DA` | `rgb(9, 105, 218)` | Interactive button backgrounds, link text, active tab indicators | 5.2:1 contrast against `#FFFFFF` (Passes AA) |
| **Slate Violet (Accent)** | `#6E56CF` | `rgb(110, 86, 207)` | AI context tag badges, code profile indicators, secondary highlights | 4.8:1 contrast against `#0A0D12` (Passes AA) |

---

## 2. Functional & Status Palette

| Status Token | HEX | RGB | Usage | Accessibility Note |
| :--- | :--- | :--- | :--- | :--- |
| **Success Green** | `#2DA44E` | `rgb(45, 164, 78)` | OCR success confirmation, high confidence indicators (>85%) | 4.6:1 contrast against `#0A0D12` |
| **Success Mint Tint** | `#1F462B` | `rgb(31, 70, 43)` | Success alert background fill | Subdued background tint |
| **Warning Amber** | `#D29922` | `rgb(210, 153, 34)` | Low confidence alerts (<60%), OCR profile retry triggers | 6.8:1 contrast against `#0A0D12` |
| **Warning Amber Tint** | `#3B2E04` | `rgb(59, 46, 4)` | Warning alert background fill | Subdued background tint |
| **Error Crimson** | `#F85149` | `rgb(248, 81, 73)` | Pipeline errors, invalid region selection, engine failure warnings | 5.9:1 contrast against `#0A0D12` |
| **Error Crimson Tint** | `#4C1C1A` | `rgb(76, 28, 26)` | Error alert background fill | Subdued background tint |

---

## 3. Dark Theme Neutrals (Default Canvas)

Designed to mirror GitHub Dark Dimmed & Linear dark mode aesthetics.

| Token Name | HEX | RGB | Usage |
| :--- | :--- | :--- | :--- |
| **Surface Canvas** | `#0A0D12` | `rgb(10, 13, 18)` | Extension popup background, offscreen canvas container |
| **Surface Elevation 1** | `#161B22` | `rgb(22, 27, 34)` | Card containers, section panels, code block backgrounds |
| **Surface Elevation 2** | `#21262D` | `rgb(33, 38, 45)` | Dropdown menus, modal dialogs, input fields |
| **Border Default** | `#30363D` | `rgb(48, 54, 61)` | 1px component dividing lines, card outlines |
| **Border Active** | `#8B949E` | `rgb(139, 148, 158)` | Input focus borders, hover card strokes |
| **Text Primary** | `#F0F6FC` | `rgb(240, 246, 252)` | Main headers, extracted OCR text display (16.2:1 contrast) |
| **Text Secondary** | `#8B949E` | `rgb(139, 148, 158)` | Labels, metadata values, stage timing logs |
| **Text Muted** | `#484F58` | `rgb(72, 79, 88)` | Disabled inputs, placeholder text |

---

## 4. Light Theme Neutrals (Optional / Web Contexts)

| Token Name | HEX | RGB | Usage |
| :--- | :--- | :--- | :--- |
| **Light Canvas** | `#FFFFFF` | `rgb(255, 255, 255)` | Light documentation background |
| **Light Elevation 1** | `#F6F8FA` | `rgb(246, 248, 250)` | Light panel containers, code snippet background |
| **Light Border** | `#D0D7DE` | `rgb(208, 215, 222)` | Light dividing borders |
| **Light Text Primary**| `#1F2328` | `rgb(31, 35, 40)` | High-contrast dark text |
| **Light Text Secondary**| `#656D76` | `rgb(101, 109, 118)` | Secondary labels |

---

## 5. Usage & Contrast Rules

1. **No Pure Black/White Overuse**: Avoid `#000000` backgrounds to reduce eye strain during late-night code reviews. Use `#0A0D12`.
2. **Functional Accents**: Use Brand Cyan (`#00F0FF`) strictly for interactive capture frames and primary CTAs—never for body text.
3. **Accessibility**: All text elements enforce minimum 4.5:1 (AA) for regular text and 7:1 (AAA) for header text against their respective surface elevations.
