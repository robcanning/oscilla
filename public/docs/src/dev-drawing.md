---
title: Freehand Annotation Layer (Developer Guide)
---

# Freehand Annotation Layer -- Developer Guide

This document covers the internal architecture, design decisions, and integration points of the freehand annotation system.

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
│  │  │  │   <g group> <path> <path> ...              │  │  │  │
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
| `js/interaction/drawing.js` | Freehand module: overlay, pointer capture, stroke rendering, grouping, selection, toolbar |
| `js/interaction/interactionSurface.js` | Orchestrator: imports drawing, calls `renderStrokes()` in `renderAll()` |
| `js/interaction/shared.js` | CRUD, persistence, WebSocket relay (unchanged) |
| `js/system/uiUtils.js` | `makeDraggable` utility (used for toolbar) |
| `css/oscillaDrawing.css` | Styles for overlay, toolbar, selection, hover feedback |
| `index.html` | Draw toggle button in topbar |

---

## Key Design Decision: SVG over Canvas

The central decision is using an SVG `<svg>` overlay with `<path>` elements rather than an HTML5 `<canvas>`.

### Why SVG

**Score length.** Oscilla scores can be very wide -- tens of thousands of world units. A `<canvas>` sized to cover the full score at device pixel ratio would exceed browser limits. Chrome caps canvas backing stores at 16384x16384 pixels; Safari at 32768 on the long axis. A 20000-unit score at `localScale` 2.0 and `devicePixelRatio` 2.0 would need an 80000px-wide canvas, which silently fails or produces blank output. An SVG element has no such pixel limit -- the browser rasterises only the visible portion.

**Tiling a canvas** across the score width would solve the size problem but introduces significant complexity: managing multiple canvas elements, splitting strokes across tile boundaries, redrawing on scroll. Not worth it for an annotation layer.

**Stroke-level interaction.** With SVG, each stroke is a DOM element. Hit-testing for the eraser and the group selection system is free -- `elementFromPoint()` identifies the path under the pointer. On a canvas, stroke selection requires either maintaining a separate spatial index or redrawing strokes offscreen with unique colours for picking. The DOM approach is simpler and aligns with how the structured annotation system already works.

**Persistence.** SVG path `d` attributes are compact strings. Stroke data is an array of `{x, y, p}` points stored as JSON in the existing annotation data model. Canvas would require either storing point arrays anyway (and re-rendering on load) or storing rasterised PNGs (lossy, large, no individual stroke manipulation).

**Scaling.** SVG paths re-render at any resolution. If `localScale` changes (window resize, different device), the paths remain sharp. Canvas content becomes blurry when scaled and needs explicit re-rendering.

**Coordinate system.** By setting a `viewBox` on the overlay SVG that matches the score SVG, all coordinates are natively in world units. No `localScale` multiplication or division is needed at draw time or render time. The browser's SVG viewport-to-viewBox mapping handles the conversion automatically.

### Why not Canvas

**Performance at high stroke count.** SVG DOM elements have overhead. Hundreds of complex paths could slow down rendering. For rehearsal markup this is unlikely to be a problem, but a dense generative drawing session might hit limits. The mitigation is point thinning during capture (the `SIMPLIFY_TOLERANCE` constant) and potential future path simplification.

**Pixel-level erasing.** Canvas supports `globalCompositeOperation: 'destination-out'` for natural eraser strokes. SVG erasing works at the stroke level only -- you remove entire paths, not parts of them. For score markup this is actually preferable (you usually want to remove a whole marking, not part of one), but it differs from what users might expect from a painting application.

### Summary

For a score annotation layer with unpredictable score dimensions, per-stroke persistence, group selection, and network sharing, SVG is the more robust choice. Canvas would be more appropriate for a dense, high-frequency drawing surface with pixel-level blending -- a different use case.

---

## Coordinate System

### World coordinates

All stroke points are stored in world units -- the same coordinate space as the SVG score's `viewBox`. The drawing overlay's own `viewBox` matches the score's:

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

No `localScale` arithmetic is needed anywhere in the drawing module. This is in contrast to the structured annotation system, which stores world coordinates but must multiply by `localScale` when positioning HTML elements.

### Why this works

The structured annotation layer uses HTML `<div>` elements positioned with CSS `left`/`top` in pixels. These need `localScale` conversion because CSS pixel positioning operates in screen space. The freehand layer uses SVG `<path>` elements inside a `<svg>` with a `viewBox`. The browser maps viewBox coordinates to rendered pixels automatically -- that is what viewBox is for.

---

## Scroll Integration

`scrollToPlayheadVisual()` in `oscillaTransport.js` scrolls the score by applying:

```javascript
stage.style.transform = `translate3d(${translateX}px, 0, 0)`;
```

where `stage` is `#scrollStage`, the parent of `.oscilla-score-inner`. Because the drawing overlay is a child of `.oscilla-score-inner`, it inherits the transform. No additional scroll handling is needed.

Notably, `scrollToPlayheadVisual` also sets `container.scrollLeft = 0` -- Oscilla does not use native scrolling. This means there are no scroll events to listen to, no scroll offsets to account for, and no race conditions between scroll position and overlay position.

---

## Session Grouping

When `setDrawMode(true)` is called, a new `groupId` is generated:

```javascript
currentGroupId = "grp_" + ulidLike();
```

Every stroke created during that session gets this `groupId` stored in `stroke.groupId`. When draw mode is toggled off and on, a new `groupId` is generated.

The groupId is stored inside the `stroke` sub-object of the annotation item, not at the top level. This keeps the annotation schema clean -- the grouping is a drawing-specific concern.

Strokes without a `groupId` (e.g. from older versions) continue to render and function normally; they are simply not selectable as a group.

---

## Pointer Event Flow

```
pointerdown (on SVG overlay)
  → route by mode:
    draw   → worldCoordsFromEvent(e) → start activeStroke
    erase  → elementFromPoint → deleteAnnotation
    select → hitTestGroup → selectGroup or begin drag

pointermove
  → draw:   append point, update live <path>
  → select: translate selected paths via SVG transform attribute

pointerup
  → draw:   discard if < 2 points, else addAnnotation(item) with groupId
  → select: commit drag delta to all stroke points via updateAnnotation
```

Pointer capture (`setPointerCapture`) ensures that once drawing or dragging starts, all subsequent move/up events go to the overlay regardless of whether the pointer drifts outside it.

The `touchstart` listener with `preventDefault()` suppresses browser gestures (pan, zoom) while in any active mode. This is the same pattern used by `controlXY.js` for its pad interaction.

---

## Data Model Integration

Strokes are stored as items in the existing `state.items` array with `kind: "stroke"`. This reuses the entire annotation infrastructure:

| Concern | How it works |
|---------|-------------|
| Persistence | `addAnnotation()` calls `saveLocal()` -- writes to localStorage |
| Network sharing | `addAnnotation()` calls `wsSend("annotation_add", ...)` if `scope === "shared"` |
| Group move | `updateAnnotation(id, { stroke: {..., points: movedPoints} })` for each stroke |
| Scope toggle | `updateAnnotation(id, { scope: newScope })` for each stroke in selection |
| Deletion | `deleteAnnotation(id)` -- removes from array, saves, broadcasts |
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

## Select and Drag

### State model

Selection state is a `Set<string>` of groupIds:

```javascript
let selectedGroupIds = new Set();
```

Normal click replaces the set with one group. Shift-click toggles a group in/out.

### Hit testing

Reuses the same `elementFromPoint` approach as the eraser:

```javascript
function hitTestGroup(e) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target.tagName !== "path" || !target.dataset.strokeId) return null;
    const item = state.items.find(i => i.id === target.dataset.strokeId);
    return item?.stroke?.groupId || null;
}
```

Each rendered path carries both `data-stroke-id` and `data-group-id` attributes. The hit test finds the stroke, then looks up its groupId.

### Live drag

During drag, SVG `transform="translate(dx, dy)"` is applied to all paths in selected groups. This is a visual-only transform -- the actual point data is not modified until drag completes on `pointerup`.

### Commit

On `pointerup`, the drag delta is applied to every point in every stroke of every selected group:

```javascript
for (const gid of selectedGroupIds) {
    for (const item of getGroupStrokes(gid)) {
        const movedPoints = item.stroke.points.map(pt => ({
            x: pt.x + dx, y: pt.y + dy, p: pt.p,
        }));
        updateAnnotation(item.id, { stroke: { ...item.stroke, points: movedPoints } });
    }
}
```

Each `updateAnnotation` call saves locally and broadcasts if shared. `triggerRender` is called, which calls `renderAll()`, which calls `renderStrokes()`, which re-creates all paths from the updated data.

### Bounding box

`getGroupBounds()` accepts a `Set` of groupIds and computes a combined bounding box across all selected groups. The selection rectangle is a single `<rect>` element with dashed stroke and a marching-ants CSS animation. It carries `_baseBounds` for efficient offset during drag.

---

## Network Sync

### Outbound (drawing client)

Strokes use the existing annotation WebSocket messages:

- `annotation_add` -- new stroke (on `pointerup` if `scope === "shared"`)
- `annotation_update` -- moved stroke points or scope change
- `annotation_delete` -- erased stroke

These are sent by `addAnnotation`, `updateAnnotation`, and `deleteAnnotation` in `shared.js`. No drawing-specific WebSocket messages exist.

### Inbound (receiving client)

Socket messages arrive via `annotationsHandleSocketMessage` in `interactionSurface.js`:

- `annotation_add` pushes the item to `state.items` and calls `renderAll()`
- `annotation_update` replaces the item and calls `renderAll()`
- `annotation_delete` removes the item and calls `renderAll()`

Since `renderAll()` calls `renderStrokes()`, incoming shared strokes are rendered immediately.

### Initial sync

On connect, `socketPoll` sends `annotation_list_request` to the server. The server replies with `annotation_list_response` containing all shared items for the project. `loadSharedAnnotations` merges them into `state.items`. Shared strokes from other clients appear on the new client without any drawing-specific code.

### Share toggle

`shareDrawingEnabled` (default `true`, matching markers) controls the scope of new strokes. The toolbar share button toggles it. Existing strokes can have their scope changed via `toggleSelectedScope()`, which calls `updateAnnotation(id, { scope: newScope })` for each stroke in the selection.

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

This is significantly simpler than canvas-based erasing, where you would need to either re-render each stroke in a unique colour to an offscreen canvas, or maintain a spatial index of stroke bounding boxes.

---

## Draggable Toolbar

The toolbar uses `makeDraggable` from `js/system/uiUtils.js`, imported as a shared utility (the same function used by the annotation editor panel and the controlXY preset panel).

The toolbar is initially positioned with CSS centering (`left: 50%; transform: translateX(-50%); bottom: 60px`). Since `makeDraggable` uses `offsetLeft` for offset calculation, the centering transform must be converted to absolute `left`/`top` before dragging works correctly. This conversion happens in `updateToolbarState()` via `requestAnimationFrame` on first show:

```javascript
if (shouldShow && wasHidden && drawToolbar.style.transform !== "none") {
    requestAnimationFrame(() => {
        const rect = drawToolbar.getBoundingClientRect();
        drawToolbar.style.left = `${rect.left}px`;
        drawToolbar.style.top = `${rect.top}px`;
        drawToolbar.style.bottom = "auto";
        drawToolbar.style.transform = "none";
    });
}
```

After this one-time conversion, `makeDraggable` handles subsequent drag positioning via `left`/`top`. The `makeDraggable` function itself already converts `right`/`bottom` to `left`/`top` on first drag (via its own `getBoundingClientRect` logic), but it does not handle `transform`, which is why the explicit conversion is needed.

---

## vector-effect: non-scaling-stroke

The CSS rule:

```css
#oscilla-drawing-overlay path {
    vector-effect: non-scaling-stroke;
}
```

This SVG property makes stroke width independent of the viewBox-to-viewport transform. A 3-unit stroke looks the same visual thickness whether the score is displayed on a phone or a 4K monitor. Without it, stroke width scales with the viewBox mapping.

For score markup, non-scaling stroke mimics ink on paper. For strokes that are meant to be part of the score's visual language, scaling strokes might be more appropriate. The choice is a single CSS rule, easily toggled or made per-stroke.

---

## Touch Disambiguation

When any mode is active:

```javascript
svgOverlay.style.pointerEvents = "all";
```

This captures all pointer input over the score area. Score dragging is blocked because the overlay sits above the score in the stacking order and stops event propagation.

The toggle is explicit: active mode = overlay captures input, no active mode = normal interaction. No implicit palm rejection or gesture classification is attempted.

---

## Point Thinning

During capture, consecutive points closer than `SIMPLIFY_TOLERANCE` (0.8 world units) are discarded:

```javascript
const dist = Math.sqrt(dx * dx + dy * dy);
if (dist < SIMPLIFY_TOLERANCE) return;
```

This reduces data size and rendering complexity without visibly affecting stroke quality. The quadratic bezier smoothing in `buildPathD()` interpolates between captured points, so moderate thinning produces smooth results.

---

## Path Smoothing

`buildPathD()` applies quadratic bezier smoothing:

```javascript
for (let i = 1; i < points.length - 1; i++) {
    const cp = points[i];
    const next = points[i + 1];
    const mx = (cp.x + next.x) / 2;
    const my = (cp.y + next.y) / 2;
    d += ` Q ${cp.x} ${cp.y} ${mx} ${my}`;
}
```

Each captured point becomes a control point for a quadratic bezier segment. The on-curve points are midpoints between consecutive captured points. This produces smooth C1-continuous curves that pass near (but not exactly through) each captured point.

This is a standard technique used by most freehand drawing implementations (Paper.js, Excalidraw, tldraw). It is fast (no iterative fitting), produces compact path data, and looks natural.

---

## Pressure Data

The `PointerEvent.pressure` property is captured and stored in each point:

```javascript
{ x: world.x, y: world.y, p: e.pressure || 0.5 }
```

The `p` value is stored but not yet used for rendering. Implementing variable-width strokes would mean changing `buildPathD()` to generate a filled shape (two offset outlines) rather than a single stroked path. The data model and rendering pipeline would not need modification.

---

## Server Changes

None. The drawing module uses the existing annotation WebSocket messages. The server (`server.js`) already stores shared annotations by project in `annotationsByProject` and broadcasts add/update/delete to other clients.

One pre-existing bug was fixed in `interactionSurface.js`: `socketPoll` was sending `"annotation_request"` but the server only handles `"annotation_list_request"`. This type mismatch meant late-joining clients never received existing shared items. The fix applies to all annotation types, not just freehand strokes.

---

## What is not implemented (yet)

| Feature | Notes |
|---------|-------|
| Page mode | Strokes only anchor to scroll mode currently. Page mode would need `anchor.mode: "page"` with `pageId`, same pattern as page-mode annotations. |
| Pressure-variable width | Data is captured. Rendering change is localised to `buildPathD()`. |
| Per-stroke colour/width change | Would require a property editor panel when a stroke is selected. |
| Drawing layers | Named groups of strokes with independent visibility. Would be a `layer` field on the stroke data, plus UI for layer management. |
| Path simplification | Ramer-Douglas-Peucker on completion. Reduces storage for long/complex strokes. |
| Undo history | Current undo is last-stroke-by-author. A proper undo stack with redo would need a separate data structure outside the annotation CRUD flow. |
