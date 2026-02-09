---
title: drag() — Developer Reference
layout: docs_layout.njk
---

# drag() — Developer Reference

Technical documentation for the drag pre-processor system.
Covers architecture, initialization pipeline, data flow,
socket protocol, persistence, and API surface.

---

## Architecture Overview

Drag is implemented as a **pre-processor** — it runs between
`propagate()` and `animationAssign()` in the SVG initialization
pipeline, stripping `drag(...)` tokens from element IDs before the
Chevrotain parser ever sees them. This means zero changes are needed
to the parser grammar, cue handlers, or animation system.

```
SVG Load Pipeline:

  settleDomForPropagate()     DOM ready
  propagate(svgElement)       expand group IDs to children
  cleanupDrag()               remove handlers from previous SVG
  preProcessDrag(svgElement)  strip drag(), attach pointer handlers
    └→ requestDragPositions() ask server for saved positions
  ─── mode branch ─────────────────────────────────
  animationAssign(svgElement) parser sees clean IDs
  assignCues(svgElement)      playhead cues work normally
```

---

## File Location

```
parser/
  preProcessPropagate.js   existing pre-processor
  preProcessReuse.js       existing pre-processor
  preProcessDrag.js        ← this module
  parser.js                Chevrotain grammar
```

---

## Module Exports

```js
// Core lifecycle
export function preProcessDrag(svgRoot)     // main entry, scans + strips + attaches
export function cleanupDrag()               // remove all handlers (before SVG swap)
export function resetDragPositions()        // zero all positions + clear storage + broadcast

// Socket message handlers (called from socket.js)
export function handleDragSync(data)                // drag_position from peer
export function handleDragPositionsResponse(data)   // full state from server on connect
export function handleDragPositionsReset(data)      // reset broadcast from peer

// Persistence
export function requestDragPositions()     // ask server for saved positions
export function clearDragPositions()       // clear localStorage only
```

All exports are also available on `window` for console access.

---

## Transform Layering

Drag applies `translate()` on the **outer** `<g>` element.
Animations operate on the **inner** `.oscilla-anim` wrapper created
by `ensureAnimWrapper()`. No transform conflicts.

```
<g id="scale(...)" transform="translate(dx, dy)">    ← DRAG
  <g class="oscilla-anim" transform="scale(1.5)">    ← ANIMATION
    <circle ... />
  </g>
</g>
```

The `applyTranslate()` helper preserves any existing non-translate
transforms on the outer group (e.g. transforms authored in Inkscape).

---

## ID Splitting

Compound IDs are split using the same regex as `cueDispatcher.splitCueId()`:

```js
id.split(/\)\s*(?=[a-zA-Z_][a-zA-Z0-9_-]*\s*\()/)
```

This splits `rotate(dir:1, dur:2) drag(1, osc:1)` into:
- `rotate(dir:1, dur:2)`
- `drag(1, osc:1)`

The drag expression is extracted, the remaining expressions are
re-joined with spaces and written back to `el.id`.

---

## Pointer Handling

Uses the Pointer Events API with `setPointerCapture()` for reliable
cross-device drag (mouse, touch, pen). Coordinates are converted
from screen space to SVG space via `getScreenCTM().inverse()` so
drag works correctly regardless of zoom, pan, or viewBox state.

**Event flow:**
1. `pointerdown` — capture, record start position in SVG coords
2. `pointermove` — update cumulative translate, apply transform
3. `pointerup` — finalize, save to localStorage, broadcast, send OSC
4. `pointercancel` — revert to position at drag start

**Interaction filtering:**
- Only primary button (left click / single touch)
- Ignores clicks on `[data-cue-button]` and `.oscilla-hit-label`
  so cue buttons and hit labels within draggable groups still work
- `touchstart` / `touchmove` listeners prevent scroll while dragging

---

## Data Flow

```
  DRAG EVENT
    │
    ├→ applyTranslate(el, dx, dy)         visual update
    ├→ savePosition(elId, x, y)           localStorage
    ├→ broadcastDragPosition(elId, x, y)  socket → server stores → peers
    └→ sendOSC(payload)                   if osc:1 enabled (throttled ~60fps)

  SOCKET CONNECT (late joiner)
    │
    socket open → send drag_positions_request
    server → drag_positions_response with all saved positions
    client → handleDragPositionsResponse() → apply to registered elements

  SOCKET MESSAGE (real-time peer sync)
    │
    peer drags → server broadcasts drag_position
    client → handleDragSync() → applyTranslate + savePosition

  RESET
    │
    resetDragPositions() → zero all entries in _dragRegistry
    └→ clearDragPositions()                  clear localStorage
    └→ sendSocketMessage("drag_positions_reset")  tell server
         server → deletes in-memory + JSON file
         server → broadcasts drag_positions_reset to all peers
         peers  → handleDragPositionsReset() → zero + clear local
```

---

## Socket Protocol

Three message types, following the annotation pattern:

### `drag_position` (client → server → peers)
Sent on every drag move (throttled to ~60fps).
```json
{
  "type": "drag_position",
  "project": "myProject",
  "elementId": "rotate(dir:1, dur:30, uid:abc)",
  "x": 142.5,
  "y": -38.2
}
```
Server stores in memory + writes to JSON (debounced 500ms).
Broadcasts to all other clients via `broadcastToOthers()`.

### `drag_positions_request` / `drag_positions_response`
Client requests on socket connect. Server replies with all saved positions.
```json
// request
{ "type": "drag_positions_request", "project": "myProject" }

// response (server → requesting client only)
{
  "type": "drag_positions_response",
  "project": "myProject",
  "positions": {
    "rotate(dir:1, dur:30, uid:abc)": { "x": 142.5, "y": -38.2 },
    "scale(min:1, max:2)": { "x": 0, "y": 55.8 }
  }
}
```

### `drag_positions_reset` (client → server → peers)
Clears all positions for a project.
```json
{ "type": "drag_positions_reset", "project": "myProject" }
```

---

## Server Persistence

Positions are stored in-memory and written to disk:

```
scores/myProject/drag-positions.json
```

```json
{
  "rotate(dir:1, dur:30, uid:abc)": {
    "x": 142.5,
    "y": -38.2
  }
}
```

- **In-memory**: `dragPositionsByProject[project][elementId] = { x, y }`
- **File writes**: debounced at 500ms via `saveDragPositions(project)`
- **File reads**: lazy-loaded on first `drag_positions_request` per project
- **Reset**: deletes both in-memory entry and JSON file

---

## Persistence Key

The persistence key for each draggable element is the **cleaned ID**
after `drag(...)` is stripped. For example:

| Original ID | Persistence Key |
|---|---|
| `rotate(dir:1, dur:30, uid:abc) drag(1)` | `rotate(dir:1, dur:30, uid:abc)` |
| `scale(min:1, max:2) drag(1, osc:1)` | `scale(min:1, max:2)` |
| `drag(1)` (standalone) | auto-generated: `drag_0_a3f2` |

Standalone `drag(1)` groups without other cues get a generated key
based on sibling index + random suffix. This is stable within a
session but **not** across SVG edits. For reliable persistence on
standalone draggables, combine with a uid: `drag(1) scale(min:1, max:1, uid:myId)`.

---

## OSC Output

When `osc:1` is enabled, drag sends messages through `oscillaOSCClient.sendOSC()`:

```json
{
  "type": "osc_drag",
  "uid": "rotate(dir:1, dur:30, uid:abc)",
  "addr": "drag/rotate(dir:1, dur:30, uid:abc)",
  "x": 142.50,
  "y": -38.20,
  "timestamp": 1738000000000
}
```

With `osc:/custom/addr`, the `addr` field uses the custom address instead.
Messages are throttled at ~60fps during drag, with a guaranteed final
send on `pointerup`.

---

## Global Registry

All draggable elements are tracked in `window._dragRegistry` (a `Map`):

```js
window._dragRegistry.get("rotate(dir:1, dur:30, uid:abc)")
// → {
//     el: SVGGElement,
//     cfg: { enabled: true, osc: false, oscAddr: null },
//     dragging: false,
//     dx: 142.5,
//     dy: -38.2,
//     ...
//   }
```

Useful for debugging or programmatic position control.

---

## Console API

```js
// Reset all positions to origin (local + server + all peers)
window.resetDragPositions()

// Re-request positions from server
window.requestDragPositions()

// Clean up all handlers (before manual SVG swap)
window.cleanupDrag()

// Inspect registry
window._dragRegistry

// Check specific element
window._dragRegistry.get("myElementId")

// Programmatic move (not synced — for testing)
const entry = window._dragRegistry.get("myElementId")
entry.dx = 100; entry.dy = 200;
// then call: applyTranslate not exported, use entry directly
```

---

## Known Interactions

### Hit Labels
Rotate, scale, and o2p create HTML overlay hit labels
(`o2pTouchOverlays.js`) that sit above the SVG layer. These
intercept pointer events before the SVG drag handlers can receive
them. Currently, elements with both a hit label and `drag(1)` will
prioritize the hit label (click to play/pause). Drag works on
elements without hit labels, or on the parts of a group not covered
by the hit label overlay.

### Touch Seek
`oscillaTransport.js` initializes touch-drag seeking on the score
container. Drag elements use `e.stopPropagation()` on `pointerdown`
to prevent the score from seeking when dragging an element.

### propagate()
Propagate expands IDs to children before `preProcessDrag` runs,
so each child gets its own drag handler with an independent
persistence key and position.

---

## Integration Points

**SVGInit.js** — lifecycle hook
```js
import { preProcessDrag, cleanupDrag } from "../parser/preProcessDrag.js";

// In initializeSVG():
cleanupDrag();
preProcessDrag(svgElement);
```

**socket.js** — message routing
```js
import {
  handleDragSync,
  handleDragPositionsResponse,
  handleDragPositionsReset,
} from "../parser/preProcessDrag.js";

// In handleSocketMessage switch:
case "drag_position":        handleDragSync(data); break;
case "drag_positions_response": handleDragPositionsResponse(data); break;
case "drag_positions_reset": handleDragPositionsReset(data); break;

// In socket open handler:
socket.send(JSON.stringify({ type: "drag_positions_request", project }));
```

**server.js** — persistence
```js
const dragPositionsByProject = {};
// + ensureDragPositionsLoaded(), saveDragPositions()
// + 3 switch cases: drag_position, drag_positions_request, drag_positions_reset
```

**oscillaOSCClient.js** — OSC output (existing, no changes needed)
```js
import { sendOSC } from "../system/oscillaOSCClient.js";
```
