---
title: drawing
layout: docs_layout.njk
---

# Score Drawing

## Overview

The drawing layer allows performers and composers to **mark up the score freehand** using finger, stylus, or mouse -- directly in the browser during rehearsal or performance.

Drawings function as visual annotations: rehearsal marks, breath indicators, dynamic contours, circled passages, conductor gestures, or any other ink-on-paper markup that a musician might add to a printed part. They coexist with the SVG score and the text annotation layer without affecting playback, cues, or synchronisation.

Like annotations, drawings can be local (visible only on the current device) or shared (broadcast to all connected clients via WebSocket). They are auto-saved to the browser and persist across sessions.

### Three Coexisting Layers

| SVG Score Layer | Annotation Layer | Drawing Layer |
|-----------------|------------------|---------------|
| Authored in Inkscape | Text + audio triggers | Freehand ink strokes |
| Embedded DSL cues | Click-to-execute | Visual markup only |
| Fixed at authoring time | Editable in browser | Editable in browser |
| Playhead-driven | Performer-driven | Performer-driven |

All three layers move together with the score during scrolling and playback. None interfere with each other.

---

## Entering Draw Mode

1. Click the **paintbrush icon** in the top bar (next to the annotation pen icon)
2. The button highlights to indicate draw mode is active
3. A **toolbar** appears at the bottom centre of the screen with colour, width, and eraser controls
4. Draw directly on the score with finger, stylus, or mouse

Draw mode captures all pointer input on the score area. Score dragging is disabled while drawing. During playback the score continues to auto-scroll normally.

> **Tip:** On a tablet with a stylus, draw mode gives you a natural ink-on-paper feel. Pressure data is captured for future variable-width rendering.

---

## Drawing

When draw mode is active:

- **Touch down / mouse down** on the score begins a stroke
- **Move** to extend the stroke -- it renders live as you draw
- **Lift / release** to finish the stroke
- The stroke is **saved automatically** to localStorage

Very short taps (accidental touches) are discarded.

Strokes are rendered as smooth curves using quadratic bezier interpolation. Points are thinned during capture to keep data compact.

---

## Toolbar

The floating toolbar appears at the bottom centre when draw or erase mode is active.

### Colour

A row of colour swatches. Click a swatch to change the stroke colour. The active colour is indicated by a white border.

Default colours: white, red, blue, green, yellow, pink, grey.

### Width

A slider controlling stroke width (1--20 units). Adjusts the thickness of subsequent strokes. Existing strokes are not affected.

### Eraser

A toggle button for eraser mode (see below).

---

## Eraser

Click the **eraser button** in the toolbar (or press **E** while in draw mode) to enter erase mode.

In erase mode:
- Hover over a stroke to highlight it in red
- Click the stroke to delete it
- The deletion is saved immediately

Erasing works at the stroke level -- each drawn line is a separate object that can be individually removed. There is no pixel-level erasing.

Press **E** again or click the eraser button to return to draw mode.

---

## Undo

Press **Ctrl+Z** (or Cmd+Z on Mac) while in draw or erase mode to undo the most recent stroke by the current author. Repeat to undo further strokes.

---

## Exiting Draw Mode

Any of:
- Click the **paintbrush icon** again to toggle off
- Press **Escape**
- The toolbar disappears and normal score interaction resumes

---

## Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| Escape | Exit draw/erase mode | While drawing |
| E | Toggle eraser | While in draw mode |
| Ctrl+Z / Cmd+Z | Undo last stroke | While in draw/erase mode |

All shortcuts are suppressed when a text input is active (e.g. the annotation editor).

---

## Local vs Shared Drawings

### Local (default)
- Stored only in the current browser
- Not visible to other performers
- Suitable for personal rehearsal markup

### Shared
- Broadcast to all connected clients via WebSocket
- Visible to everyone viewing the same project
- Useful for conductor markings or collaborative annotation

The default scope follows the annotation system's share setting. Individual strokes inherit the current scope at the time of drawing.

> **Note:** Shared strokes are transmitted as data (point arrays), not as images. All clients render strokes locally from the same coordinates.

---

## Persistence

Drawings are stored as part of the annotation data in localStorage, keyed by project name. They persist across browser sessions and page refreshes.

Drawings are included in annotation import/export (JSON). When exporting annotations, strokes are exported alongside text annotations and triggers in the same file.

---

## Coordinates and Scaling

Strokes are stored in **world coordinates** -- the same coordinate space as the SVG score's viewBox. This means:

- Strokes remain anchored to the correct position in the score regardless of screen size or zoom level
- A stroke drawn on a tablet appears in the same score position on a laptop
- Shared strokes align correctly across devices with different resolutions

The drawing overlay uses an SVG element with a matching viewBox, so coordinate conversion is handled automatically by the browser's SVG rendering.

---

## Stroke Appearance

By default, strokes use `vector-effect: non-scaling-stroke` in CSS. This means the visual thickness of a line stays constant regardless of how the score is scaled -- the same way a pen mark on paper looks the same width whether you hold the page close or far away.

To make strokes scale with the score instead (thicker when zoomed in, thinner when zoomed out), remove the `vector-effect` rule from `oscillaDrawing.css`.

---

## What Drawings Do *Not* Do

Drawings:
- do not trigger playback or cues
- do not alter the SVG score
- do not affect synchronisation or timing
- do not carry executable behaviour

They are purely visual markup. For executable score elements, use annotations with triggers.

---

## Technical Notes

### Data Model

Strokes are stored as annotation items with `kind: "stroke"`:

```json
{
  "id": "ann_m3k...",
  "kind": "stroke",
  "scope": "local",
  "anchor": { "mode": "scroll" },
  "placement": { "space": "score" },
  "stroke": {
    "points": [
      { "x": 1234.5, "y": 456.2, "p": 0.72 },
      { "x": 1238.1, "y": 458.0, "p": 0.68 }
    ],
    "color": "#ffffff",
    "width": 3,
    "opacity": 1
  }
}
```

The `p` field records pointer pressure (0--1) from stylus input. This data is captured but not yet used for variable-width rendering.

### Module Location

`public/js/interaction/drawing.js`

Integrated via `interactionSurface.js` alongside the annotation editor, markers, and trigger system.

### Window API

```javascript
window.oscillaDrawing.toggleDrawMode()
window.oscillaDrawing.setDrawMode(true)
window.oscillaDrawing.setEraserMode(true)
window.oscillaDrawing.setStrokeColor("#ff4444")
window.oscillaDrawing.setStrokeWidth(5)
window.oscillaDrawing.undoLastStroke()
window.oscillaDrawing.clearLocalStrokes()
```

Also accessible via the annotation API:

```javascript
window.oscillaAnnotations.toggleDrawMode()
window.oscillaAnnotations.setDrawMode(true)
```

---

## Future Directions

- **Pressure-sensitive rendering**: variable-width strokes using captured pressure data
- **Page mode support**: drawing in page view (currently scroll mode only)
- **Stroke simplification**: Ramer-Douglas-Peucker path reduction for long sessions
- **Per-stroke scope toggle**: change individual strokes between local and shared after creation
- **Drawing layers**: multiple named layers (e.g. "rehearsal 1", "rehearsal 2") with independent visibility
- **Colour picker integration**: full colour picker instead of preset swatches
