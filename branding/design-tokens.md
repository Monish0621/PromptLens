# PromptLens Design Tokens Specification

> **Systematic design tokens for spacing, border radii, shadows, typography, grid layouts, stroke weights, and animation transitions.**

---

## 1. Spacing Scale (4px Base Grid)

```css
:root {
  --space-0:   0px;
  --space-1:   2px;   /* Micro spacing (inner badge padding) */
  --space-2:   4px;   /* Compact spacing (gap between icon & text) */
  --space-3:   8px;   /* Default inline gap / button padding y */
  --space-4:   12px;  /* Card padding compact / button padding x */
  --space-5:   16px;  /* Standard container padding */
  --space-6:   24px;  /* Section padding / grid gaps */
  --space-8:   32px;  /* Large section margins */
  --space-10:  40px;  /* Modal section spacing */
  --space-12:  48px;  /* Hero padding */
  --space-16:  64px;  /* Major page margins */
}
```

---

## 2. Border Radius Scale

```css
:root {
  --radius-none: 0px;
  --radius-sm:   4px;   /* Tag badges, tooltips, inline code blocks */
  --radius-md:   6px;   /* Buttons, input fields, dropdown items */
  --radius-lg:   8px;   /* Cards, overlay containers, modal popups */
  --radius-xl:   12px;  /* Large hero panels, store promo cards */
  --radius-2xl:  24px;  /* 128x128 store icon container */
  --radius-full: 9999px;/* Circular avatars, pill badges */
}
```

---

## 3. Shadow System (Elevation Hierarchy)

```css
:root {
  /* Subtle border highlight for dark theme elevation */
  --shadow-border: 0 0 0 1px #30363D;

  /* Level 1: Buttons, small dropdown menus */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4), 0 0 0 1px #30363D;

  /* Level 2: Extension popup cards, hover popovers */
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.5), 0 0 0 1px #30363D;

  /* Level 3: Screen selection overlay box, active OCR preview modal */
  --shadow-lg: 0 12px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(0, 240, 255, 0.3);

  /* Brand Accent Glow: Active capture focus state */
  --shadow-glow-cyan: 0 0 16px rgba(0, 240, 255, 0.25), 0 0 0 2px #00F0FF;
}
```

---

## 4. Icon Stroke Width Scale

```css
:root {
  --stroke-thin:   1px;   /* Background grid guidelines */
  --stroke-regular:1.5px; /* Default 24x24 UI icons */
  --stroke-medium: 2px;   /* 16x16 toolbar icons, active selection box frames */
  --stroke-bold:   3px;   /* 32x32 / 48x48 icon focal elements */
}
```

---

## 5. Grid Spacing & Layout Constraints

```css
:root {
  --popup-width:     360px; /* Chrome extension popup width */
  --popup-max-height:520px; /* Chrome extension popup max height */
  --overlay-border:  2px;   /* Selection frame border width */
  --container-max-w: 1200px;/* Documentation container max width */
}
```

---

## 6. Motion & Animation Timing

Respects `prefers-reduced-motion`.

```css
:root {
  /* Motion Curves */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);     /* Smooth entrance/exit */
  --ease-out:      cubic-bezier(0, 0, 0.2, 1);     /* Micro UI feedback */
  --ease-in:       cubic-bezier(0.4, 0, 1, 1);     /* Dismissals */

  /* Duration Tokens */
  --duration-fast:   100ms; /* Button hover states, focus rings */
  --duration-normal: 150ms; /* Dropdown toggle, tab switching */
  --duration-slow:   250ms; /* Modal overlays, sidebar expansion */
}
```

---

## 7. Component-Specific Tokens

```css
:root {
  /* Selection Overlay Component */
  --overlay-bg:         rgba(10, 13, 18, 0.4);
  --overlay-border-color:#00F0FF;
  --overlay-handle-size: 8px;

  /* OCR Code Preview Block */
  --code-block-bg:      #161B22;
  --code-block-border:  #30363D;
  --code-block-text:    #F0F6FC;
  --code-block-header:  #21262D;

  /* Status Pill Badge */
  --badge-padding-x:    6px;
  --badge-padding-y:    2px;
  --badge-radius:       4px;
}
```
