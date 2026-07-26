# PromptLens Extension Icon Specification

> **Detailed multi-resolution iconography specifications for Chrome extension manifests, browser toolbar actions, management pages, and Web Store listings.**

---

## 1. Icon Size Requirements & Purpose

Manifest V3 extensions require four standard PNG icon dimensions:

| Dimension | Manifest Key | Primary Display Context | Critical Design Constraint |
| :--- | :--- | :--- | :--- |
| **16x16 px** | `"16"` | Browser extension toolbar icon, favicon in extension tabs | Max 2px stroke weight; zero interior fine lines; high-contrast silhouette. |
| **32x32 px** | `"32"` | High-DPI / Retina browser toolbars, Windows taskbar shortcuts | 2px–3px stroke weight; sharp pixel-grid alignment. |
| **48x48 px** | `"48"` | Chrome extension management page (`chrome://extensions`) | Full shape detail with subtle 1px border stroke and container background. |
| **128x128 px**| `"128"`| Chrome Web Store listing icon, installation dialogs | Premium full detail render; subtle radial gradient background fill; rounded container (`24px` corner radius). |

---

## 2. Multi-Resolution Adapting Rules (Precision Aperture Concept)

```
128x128 px: [Full Rounded Container (24px radius) + Gradient Surface + 4px Corner Brackets + Central Aperture Dot]
  ↓ Simplify
48x48 px:   [Rounded Container (8px radius) + Solid Surface + 3px Corner Brackets + Central Aperture Dot]
  ↓ Simplify
32x32 px:   [Solid Dark Surface + 2.5px Corner Brackets + Central Aperture Dot]
  ↓ Simplify
16x16 px:   [Transparent Surface + 2px Solid Corner Brackets + Single High-Contrast Center Pixel]
```

### Grid Alignment Rules
- **16x16 px**: Icon strokes align strictly to whole pixel boundaries (no sub-pixel anti-aliasing fuzziness). The central dot is exactly `2x2 px`.
- **32x32 px**: Corner brackets use `3px` width with `2px` inner radius offset.
- **128x128 px**: Enforces an interior safety padding margin of `16px` on all sides so icon geometry never gets clipped by rounded app store containers.

---

## 3. State Variation Specifications

PromptLens action toolbar icons update dynamically to reflect operational status:

| Extension State | Icon Surface Fill | Mark Stroke Color | Badge Indicator |
| :--- | :--- | :--- | :--- |
| **Idle / Ready** | `#161B22` (Dark Surface) | `#00F0FF` (Brand Cyan) | None |
| **Active Capture** | `#00F0FF` (Brand Cyan) | `#0A0D12` (Dark Canvas) | Pulsing border ring |
| **Processing OCR** | `#161B22` (Dark Surface) | `#D29922` (Warning Amber)| Animated scan line / '...' badge |
| **Success Inject**| `#161B22` (Dark Surface) | `#2DA44E` (Success Green)| Brief green checkmark overlay |
