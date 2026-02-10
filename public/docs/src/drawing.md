---
title: Freehand Annotation
layout: docs_layout.njk
---

# Freehand Annotation

## Overview

The freehand annotation layer allows performers and composers to mark up the score directly in the browser using finger, stylus, or mouse. Strokes are captured as vector paths anchored in score coordinates, persisted locally, and optionally synchronised across all connected clients via WebSocket.

Freehand annotations serve the same role as ink on a printed part: rehearsal marks, breath indicators, dynamic contours, circled passages, conductor gestures, or any other visual markup a musician might add during preparation or performance. They coexist with the SVG score and the structured annotation layer without affecting playback, cues, or timing.

Strokes drawn in a single session are automatically grouped. Groups can be selected, repositioned, deleted, and have their network scope toggled between local and shared.

### Three Coexisting Layers

| SVG Score Layer | Annotation Layer | Freehand Layer |
|-----------------|------------------|----------------|
| Authored in Inkscape | Text + audio triggers | Freehand strokes |
| Embedded DSL cues | Click-to-execute | Visual markup only |
| Fixed at authoring time | Editable in browser | Editable in browser |
| Playhead-driven | Performer-driven | Performer-driven |

All three layers move together with the score during scrolling and playback. None interfere with each other.

---

## Entering Draw Mode

1. Click the **paintbrush icon** in the top bar (next to the annotation pen icon)
2. The button highlights to indicate draw mode is active
3. A **toolbar** appears at the bottom of the screen with colour, width, select, eraser, and share controls
4. Draw directly on the score with finger, stylus, or mouse

Draw mode captures all pointer input on the score area. Score dragging is disabled while drawing. During playback the score continues to auto-scroll normally.

> **Tip:** On a tablet with a stylus, draw mode gives you a natural ink-on-paper feel. Pressure data is captured for future variable-width rendering.

---

## Drawing

When draw mode is active:

- **Touch down / mouse down** on the score begins a stroke
- **Move** to extend the stroke -- it renders live as you draw
- **Lift / release** to finish the stroke
- The stroke is **saved automatically** to localStorage (and broadcast to other clients if sharing is enabled)

Very short taps (accidental touches) are discarded.

Strokes are rendered as smooth curves using quadratic bezier interpolation. Points are thinned during capture to keep data compact.

---

## Session Grouping

All strokes drawn in a single draw-mode session belong to the same **group**. A new group is created each time draw mode is activated (clicking the paintbrush icon or pressing D). When you exit draw mode and re-enter, a new group begins.

This means drawing a word, symbol, or phrase produces a single group that can later be selected and moved as a unit.

To split work into separate groups, toggle draw mode off and on again between drawing sessions.

---

## Toolbar

The floating toolbar appears when any drawing sub-mode (draw, select, or erase) is active. It can be **dragged** to a different position by the grip handle on its right edge.

### Colour

A row of colour swatches. Click a swatch to change the stroke colour and return to draw mode. The active colour is indicated by a white border.

Default colours: white, red, blue, green, yellow, pink, grey.

### Width

A slider controlling stroke width (1--20 units). Adjusts the thickness of subsequent strokes. Existing strokes are not affected.

### Select / Move

A toggle button for select mode (see below). Highlighted in blue when active.

### Eraser

A toggle button for eraser mode (see below). Highlighted in red when active.

### Share

A toggle button controlling whether new strokes are shared with all connected clients or kept local. Highlighted in green when sharing is enabled (the default).

### Drag Handle

The small grip bar on the right edge of the toolbar. Drag it to reposition the toolbar anywhere on screen.

---

## Select and Move

Click the **move icon** in the toolbar (or press **V** while in draw or eraser mode) to enter select mode.

In select mode:

- Hover over any stroke to highlight its entire group (blue glow)
- **Click** a stroke to select its group -- a dashed blue bounding box appears
- **Shift-click** another group to add it to the selection (or remove it if already selected)
- **Drag** to reposition all selected groups together
- **Click empty space** to deselect

The bounding box encompasses all selected groups. On drag release, all stroke coordinates are updated and saved.

### Keyboard shortcuts in select mode

| Key | Action |
|-----|--------|
| Delete / Backspace | Delete all selected groups |
| S | Toggle scope of selected groups between local and shared |
| D | Return to draw mode |
| E | Switch to eraser |
| Escape | Exit select mode |

---

## Eraser

Click the **eraser button** in the toolbar (or press **E** while in draw or select mode) to enter erase mode.

In erase mode:

- Hover over a stroke to highlight it in red
- Click the stroke to delete it
- The deletion is saved immediately

Erasing works at the stroke level -- each drawn line is a separate object that can be individually removed. To delete an entire group at once, use select mode and press Delete.

Press **D** to return to draw mode.

---

## Undo

Press **Ctrl+Z** (or Cmd+Z on Mac) while in draw or erase mode to undo the most recent stroke by the current author. Repeat to undo further strokes.

---

## Exiting Draw Mode

Any of:

- Click the **paintbrush icon** again to toggle off
- Press **Escape** from any sub-mode
- The toolbar disappears and normal score interaction resumes

---

## Keyboard Shortcuts

| Key | Action | Context |
|-----|--------|---------|
| Escape | Exit all drawing modes | Any drawing mode |
| D | Switch to draw mode | Select or eraser mode |
| V | Switch to select mode | Draw or eraser mode |
| E | Toggle eraser | Draw or select mode |
| S | Toggle local/shared scope on selection | Select mode with group(s) selected |
| Delete / Backspace | Delete selected group(s) | Select mode with group(s) selected |
| Ctrl+Z / Cmd+Z | Undo last stroke | Draw or erase mode |

All shortcuts are suppressed when a text input is active (e.g. the annotation editor).

---

## Local vs Shared

### Shared (default)

- Broadcast to all connected clients via WebSocket
- Visible to everyone viewing the same project
- Stored on the server for late-joining clients
- Useful for conductor markings, collaborative annotation, or ensemble rehearsal notes

### Local

- Stored only in the current browser
- Not visible to other performers
- Suitable for personal rehearsal markup

The share toggle on the toolbar controls the default scope for new strokes. The scope of existing strokes can be changed after the fact: select a group and press **S** to toggle all its strokes between local and shared.

Shared strokes are transmitted as compact point-array data, not as images. All clients render strokes locally from the same world coordinates, so they align correctly regardless of screen size or resolution.

---

## Persistence

Freehand annotations are stored as part of the annotation data in localStorage, keyed by project name. They persist across browser sessions and page refreshes.

They are included in annotation import/export (JSON). When exporting annotations, strokes are exported alongside text annotations, markers, and triggers in the same file.

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

## What Freehand Annotations Do *Not* Do

Freehand annotations:

- do not trigger playback or cues
- do not alter the SVG score
- do not affect synchronisation or timing
- do not carry executable behaviour

They are purely visual markup. For executable score elements, use structured annotations with triggers.

---

## Technical Notes

### Data Model

Strokes are stored as annotation items with `kind: "stroke"`:

```json
{
  "id": "ann_m3k...",
  "kind": "stroke",
  "scope": "shared",
  "anchor": { "mode": "scroll" },
  "placement": { "space": "score" },
  "stroke": {
    "points": [
      { "x": 1234.5, "y": 456.2, "p": 0.72 },
      { "x": 1238.1, "y": 458.0, "p": 0.68 }
    ],
    "color": "#ffffff",
    "width": 3,
    "opacity": 1,
    "groupId": "grp_01JK..."
  }
}
```

The `p` field records pointer pressure (0--1) from stylus input. This data is captured but not yet used for variable-width rendering.

The `groupId` field links strokes drawn in the same session. All strokes sharing a `groupId` are selected and moved together.

### Module Location

`public/js/interaction/drawing.js`

Integrated via `interactionSurface.js` alongside the annotation editor, markers, and trigger system.

### Window API

```javascript
// Mode control
window.oscillaDrawing.toggleDrawMode()
window.oscillaDrawing.setDrawMode(true)
window.oscillaDrawing.setEraserMode(true)
window.oscillaDrawing.setSelectMode(true)
window.oscillaDrawing.toggleSelectMode()

// Stroke settings
window.oscillaDrawing.setStrokeColor("#ff4444")
window.oscillaDrawing.setStrokeWidth(5)

// Sharing
window.oscillaDrawing.toggleShareDrawing()       // toggle default scope
window.oscillaDrawing.toggleSelectedScope()       // toggle selected groups

// Edit operations
window.oscillaDrawing.undoLastStroke()
window.oscillaDrawing.clearLocalStrokes()
window.oscillaDrawing.deleteSelectedGroup()       // delete all selected groups

// State queries
window.oscillaDrawing.isDrawMode()
window.oscillaDrawing.isEraserMode()
window.oscillaDrawing.isSelectMode()
window.oscillaDrawing.isShareDrawing()
window.oscillaDrawing.getStrokeColor()
window.oscillaDrawing.getStrokeWidth()
```

Also accessible via the annotation API:

```javascript
window.oscillaAnnotations.toggleDrawMode()
window.oscillaAnnotations.setDrawMode(true)
```

---

## Future Directions

- **Pressure-sensitive rendering**: variable-width strokes using captured pressure data
- **Page mode support**: freehand annotation in page view (currently scroll mode only)
- **Stroke simplification**: Ramer-Douglas-Peucker path reduction for long sessions
- **Drawing layers**: multiple named layers (e.g. "rehearsal 1", "rehearsal 2") with independent visibility
- **Full colour picker**: integration with the existing `colorPicker.js` component
