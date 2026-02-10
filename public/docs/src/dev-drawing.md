---
title: Drawing Layer (Developer Guide)
---

# Drawing Layer — Developer Guide

This document covers the internal architecture, design decisions, and integration points of the freehand drawing system.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ #scoreContainer (viewport, clips)                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ #scrollStage (translate3d for scrolling)               │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │ .oscilla-score-inner (position: relative)        │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │ <svg> (the score)                          │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │ #oscilla-drawing-overlay <svg>  z:15       │  │  │  │
│  │  │  │   <path> <path> <path> ...                 │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  │  ┌───────────────────────────────────────────┐  │  │  │
│  │  │  │ #oscilla-annotations-layer-score  z:20     │  │  │  │
│  │  │  │   [pins, markers, triggers]                │  │  │  │
│  │  │  └───────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

The drawing overlay is an SVG element parented inside `.oscilla-score-inner`. It sits between the score SVG (z-index implicit) and the annotation layer (z-index 20). Because it is a child of `scrollStage`, it moves with the score automatically when `scrollToPlayheadVisual()` applies its `translate3d` transform. No scroll synchronisation code is needed.

---

## Files Involved

| File | Role |
|------|------|
| `js/interaction/drawing.js` | Drawing module: overlay, pointer capture, stroke rendering, toolbar |
| `js/interaction/interactionSurface.js` | Orchestrator: imports drawing, calls `renderStrokes()` in `renderAll()` |
| `js/interaction/shared.js` | CRUD, persistence, WebSocket relay (unchanged) |
| `css/oscillaDrawing.css` | Styles for overlay, toolbar, button states |
| `index.html` | Draw toggle button in topbar |

---

## Key Design Decision: SVG over Canvas

The central decision is using an SVG `<svg>` overlay with `<path>` elements rather than an HTML5 `<canvas>`.

### Why SVG

**Score length.** Oscilla scores can be very wide — tens of thousands of world units. A `<canvas>` sized to cover the full score at device pixel ratio would exceed browser limits. Chrome caps canvas backing stores at 16384x16384 pixels; Safari at 32768 on the long axis. A 20000-unit score at `localScale` 2.0 and `devicePixelRatio` 2.0 would need an 80000px-wide canvas, which silently fails or produces blank output. An SVG element has no such pixel limit — the browser rasterises only the visible portion.

**Tiling a canvas** across the score width would solve the size problem but introduces significant complexity: managing multiple canvas elements, splitting strokes across tile boundaries, redrawing on scroll. Not worth it for a markup layer.

**Stroke-level interaction.** With SVG, each stroke is a DOM element. Hit-testing for the eraser is free — `elementFromPoint()` or CSS `:hover` identifies the path under the pointer. On a canvas, stroke selection requires either maintaining a separate spatial index or redrawing strokes offscreen with unique colours for picking. The DOM approach is simpler and aligns with how the annotation system already works (each annotation is a DOM element).

**Persistence.** SVG path `d` attributes are compact strings. Stroke data is an array of `{x, y, p}` points stored as JSON in the existing annotation data model. Canvas would require either storing point arrays anyway (and re-rendering on load) or storing rasterised PNGs (lossy, large, no individual stroke manipulation).

**Scaling.** SVG paths re-render at any resolution. If `localScale` changes (window resize, different device), the paths remain sharp. Canvas content becomes blurry when scaled and needs explicit re-rendering.

**Coordinate system.** By setting a `viewBox` on the overlay SVG that matches the score SVG, all coordinates are natively in world units. No `localScale` multiplication or division is needed at draw time or render time. The browser's SVG viewport-to-viewBox mapping handles the conversion automatically.

### Why not Canvas

**Performance at high stroke count.** SVG DOM elements have overhead. Hundreds of complex paths could slow down rendering. For rehearsal markup this is unlikely to be a problem, but a dense generative drawing session might hit limits. The mitigation is point thinning during capture (the `SIMPLIFY_TOLERANCE` constant) and potential future path simplification.

**Pixel-level erasing.** Canvas supports `globalCompositeOperation: 'destination-out'` for natural eraser strokes. SVG erasing works at the stroke level only — you remove entire paths, not parts of them. For score markup this is actually preferable (you usually want to remove a whole marking, not part of one), but it differs from what users might expect from a drawing app.

### Summary

For a score markup layer with unpredictable score dimensions, per-stroke persistence, and network sharing, SVG is the more robust choice. Canvas would be more appropriate for a dense, high-frequency drawing surface with pixel-level blending — a different use case.

---

## Coordinate System

### World coordinates

All stroke points are stored in world units — the same coordinate space as the SVG score's `viewBox`. The drawing overlay's own `viewBox` matches the score's:

```javascript
svgOverlay.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
```

This means `worldCoordsFromEvent()` converts screen pointer positions to world units using the SVG's own CTM (Current Transformation Matrix):

```javascript
const pt = svgOverlay.createSVGPoint();
pt.x = e.clientX;
pt.y = e.clientY;
const worldPt = pt.matrixTransform(svgOverlay.getScreenCTM().inverse());
```

No `localScale` arithmetic is needed anywhere in the drawing module. This is in contrast to the annotation system, which stores world coordinates but must multiply by `localScale` when positioning HTML elements.

### Why this works

The annotation layer uses HTML `<div>` elements positioned with CSS `left`/`top` in pixels. These need `localScale` conversion because CSS pixel positioning operates in screen space. The drawing layer uses SVG `<path>` elements inside a `<svg>` with a `viewBox`. The browser maps viewBox coordinates to rendered pixels automatically — that is what viewBox is for.

---

## Scroll Integration

`scrollToPlayheadVisual()` in `oscillaTransport.js` scrolls the score by applying:

```javascript
stage.style.transform = `translate3d(${translateX}px, 0, 0)`;
```

where `stage` is `#scrollStage`, the parent of `.oscilla-score-inner`. Because the drawing overlay is a child of `.oscilla-score-inner`, it inherits the transform. No additional scroll handling is needed.

Notably, `scrollToPlayheadVisual` also sets `container.scrollLeft = 0` — Oscilla does not use native scrolling. This means there are no scroll events to listen to, no scroll offsets to account for, and no race conditions between scroll position and overlay position.

---

## Pointer Event Flow

```
pointerdown (on SVG overlay)
  → worldCoordsFromEvent(e) → {x, y} in world units
  → setPointerCapture(e.pointerId)
  → create activeStroke = { points: [{x, y, p}], color, width }
  → create <path> element, append to overlay

pointermove
  → worldCoordsFromEvent(e)
  → distance check (SIMPLIFY_TOLERANCE)
  → append point to activeStroke.points
  → update <path> d attribute

pointerup
  → releasePointerCapture
  → discard if < 2 points
  → remove live <path>
  → addAnnotation(item) → saveLocal + wsSend + renderAll
  → renderStrokes() recreates <path> from data
```

Pointer capture (`setPointerCapture`) ensures that once drawing starts, all subsequent move/up events go to the overlay regardless of whether the pointer drifts outside it. This prevents strokes from being interrupted if the user draws quickly toward the edge of the visible area.

The `touchstart` listener with `preventDefault()` suppresses browser gestures (pan, zoom) while drawing. This is the same pattern used by `controlXY.js` for its pad interaction.

---

## Data Model Integration

Strokes are stored as items in the existing `state.items` array with `kind: "stroke"`. This reuses the entire annotation infrastructure:

| Concern | How it works |
|---------|-------------|
| Persistence | `addAnnotation()` calls `saveLocal()` — writes to localStorage |
| Network sharing | `addAnnotation()` calls `wsSend("annotation_add", ...)` if `scope === "shared"` |
| Deletion | `deleteAnnotation(id)` — removes from array, saves, broadcasts |
| Import/export | Strokes are included in `exportAnnotationsJSON()` / `importAnnotationsJSON()` |
| Mode filtering | `shouldRenderItem()` checks `anchor.mode` against current scroll/page context |
| Project scoping | Items are keyed by project name in localStorage |

No changes to `shared.js` are required. The drawing module is a pure consumer of the existing CRUD API.

### Rendering separation

Although strokes live in `state.items` alongside annotations and markers, they are rendered separately. In `renderAll()`:

```javascript
for (const item of state.items) {
    if (item.kind === "stroke") continue;   // skip — handled by drawing module
    // ... render pins and markers as before
}
renderStrokes();   // drawing module renders its own items
```

This separation exists because strokes render to a different DOM target (the SVG overlay) than annotations (the HTML annotation layer). The drawing module's `renderStrokes()` iterates `state.items`, filters for `kind === "stroke"`, and creates `<path>` elements in the SVG overlay.

---

## Eraser Implementation

The eraser uses `document.elementFromPoint()` for hit-testing:

```javascript
function handleEraserTap(e) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target?.tagName === "path" && target.dataset.strokeId) {
        deleteAnnotation(target.dataset.strokeId);
    }
}
```

Each rendered `<path>` carries `data-stroke-id` matching its annotation item ID. In erase mode, paths have `pointer-events: stroke` (hit-test on the stroke outline, not the bounding box) and hover listeners that highlight on rollover.

This is significantly simpler than canvas-based erasing, where you would need to either:

- Re-render each stroke in a unique colour to an offscreen canvas and read back the pixel under the cursor, or
- Maintain a spatial index (R-tree or similar) of stroke bounding boxes and check point-in-path for each candidate

Both approaches require substantially more code than the three-line DOM hit-test above.

---

## vector-effect: non-scaling-stroke

The CSS rule:

```css
#oscilla-drawing-overlay path {
    vector-effect: non-scaling-stroke;
}
```

This SVG property makes stroke width independent of the viewBox-to-viewport transform. A 3-unit stroke looks the same visual thickness whether the score is displayed on a phone or a 4K monitor. Without it, stroke width scales with the viewBox mapping — a 3-unit stroke would appear thicker on a larger screen and thinner on a smaller one.

For score markup, non-scaling stroke is generally what you want: it mimics pen on paper, where the ink width is a property of the pen, not the paper size. But for strokes that are meant to be part of the score's visual language (e.g. a composer embedding graphic notation via drawing), scaling strokes might be more appropriate.

The choice is a single CSS rule, easily toggled or made per-stroke in the future.

---

## Touch Disambiguation

When draw mode is active:

```javascript
svgOverlay.style.pointerEvents = "all";
```

This captures all pointer input over the score area. Score dragging (normally handled by pointer events on the score SVG or its container) is blocked because the overlay sits above the score in the stacking order and stops event propagation.

During playback, the score auto-scrolls via `translate3d` in the RAF loop, so the user can draw while the score moves. In paused state, the user must exit draw mode to drag/scroll the score manually.

This is the same pattern `controlXY.js` uses for its interaction pads:

```javascript
boundsEl.addEventListener("pointerdown", preventScoreDrag, true);
boundsEl.addEventListener("touchstart", preventScoreDrag, { passive: false, capture: true });
```

No global gesture disambiguation is attempted. The toggle is explicit: draw mode on = drawing captures input, draw mode off = normal interaction. This is intentional — implicit palm rejection and gesture classification are fragile, device-dependent, and beyond the scope of a score markup tool.

---

## Point Thinning

During capture, consecutive points closer than `SIMPLIFY_TOLERANCE` (0.8 world units) are discarded:

```javascript
const dist = Math.sqrt(dx * dx + dy * dy);
if (dist < SIMPLIFY_TOLERANCE) return;
```

This reduces data size and rendering complexity without visibly affecting stroke quality. On a typical score, 0.8 world units corresponds to roughly 1-2 screen pixels at normal zoom.

For denser capture (e.g. very detailed drawing), reduce the tolerance. For lighter capture (fewer points, smoother curves), increase it. The quadratic bezier smoothing in `buildPathD()` interpolates between captured points, so moderate thinning produces smooth results.

Future improvement: apply Ramer-Douglas-Peucker simplification on stroke completion to further reduce point count while preserving shape fidelity.

---

## Path Smoothing

Raw pointer input produces jagged paths. The `buildPathD()` function applies quadratic bezier smoothing:

```javascript
// For each interior point, create a Q command through the midpoint
for (let i = 1; i < points.length - 1; i++) {
    const cp = points[i];          // control point = actual captured point
    const next = points[i + 1];
    const mx = (cp.x + next.x) / 2;
    const my = (cp.y + next.y) / 2;
    d += ` Q ${cp.x} ${cp.y} ${mx} ${my}`;
}
```

Each captured point becomes a control point for a quadratic bezier segment. The on-curve points are midpoints between consecutive captured points. This produces smooth C1-continuous curves that pass near (but not exactly through) each captured point.

This is a standard technique used by most freehand drawing implementations (Paper.js, Excalidraw, tldraw, Procreate). It is fast (no iterative fitting), produces compact path data, and looks natural.

---

## Pressure Data

The `PointerEvent.pressure` property is captured and stored in each point:

```javascript
{ x: world.x, y: world.y, p: e.pressure || 0.5 }
```

Currently the `p` value is stored but not used for rendering — all strokes have constant width. The data is captured now so that pressure-variable rendering can be added later without requiring users to redraw anything.

Implementing variable-width strokes would mean changing `buildPathD()` to generate a filled shape (two offset outlines) rather than a single stroked path. The offset at each point would be `baseWidth * pressure`. This is a self-contained change to the path builder — the data model and rendering pipeline would not need modification.

---

## Server Changes

None. The drawing module uses the existing annotation WebSocket messages:

- `annotation_add` — new stroke
- `annotation_update` — (not currently used for strokes)
- `annotation_delete` — erased stroke
- `annotation_sync` — bulk sync on connect

The server already relays these messages to all clients on the same project. Strokes with `scope: "shared"` are broadcast and received identically to shared text annotations.

---

## What is not implemented (yet)

| Feature | Notes |
|---------|-------|
| Page mode drawing | Strokes only anchor to scroll mode currently. Page mode would need `anchor.mode: "page"` with `pageId`, same pattern as page-mode annotations. The `shouldRenderItem()` filter already handles this — just needs the input handler to detect page mode context. |
| Pressure-variable width | Data is captured. Rendering change is localised to `buildPathD()`. |
| Stroke editing | No post-draw modification (colour change, width change, move). Would require a stroke selection mode and property editor. |
| Per-stroke scope toggle | Currently inherits global share default at draw time. Changing scope after drawing would use `updateAnnotation()`. |
| Drawing layers | Named groups of strokes with independent visibility. Would be a `layer` field on the stroke data, plus UI for layer management. |
| Path simplification | Ramer-Douglas-Peucker on completion. Reduces storage for long/complex strokes. |
| Undo history | Current undo is last-stroke-by-author. A proper undo stack with redo would need a separate data structure outside the annotation CRUD flow. |
