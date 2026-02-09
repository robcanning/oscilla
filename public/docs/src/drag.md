---
title: Drag — Moveable Score Elements
layout: docs_layout.njk
---

# drag() — Moveable Score Elements

Make any SVG group draggable in the browser. Author a palette of visual
components in Inkscape, then arrange and rearrange them during rehearsal
or performance. Positions persist and sync across all connected clients.

---

## Quick Start

In Inkscape, give a group the ID `drag(1)`:

```
<g id="drag(1)">
  <circle cx="100" cy="100" r="30" fill="red" />
</g>
```

Open in browser → click and drag the group anywhere on the score.

---

## Syntax

```
drag(1)                        // basic draggable
drag(1, osc:1)                 // + send position via OSC
drag(1, osc:/my/custom/addr)   // + custom OSC address
```

| Parameter | Description |
|-----------|-------------|
| `1`       | Enable drag (required) |
| `osc:1`   | Send x,y position via OSC to `/oscilla/drag/{id}` |
| `osc:/addr` | Send to a custom OSC address |

---

## Combining with Animations

Drag works alongside any cue or animation. Use a **compound ID**
(space-separated) to combine drag with scale, rotate, o2p, etc:

```
// drag + scale
<g id="scale(values:[1,1.5,1], dur:2) drag(1)">

// drag + rotate + OSC
<g id="rotate(dir:1, dur:4) drag(1, osc:1)">

// drag + slow rotate with uid
<g id="rotate(dir:1, dur:30, uid:myThing, osc:1) drag(1)">
```

The animation plays on the element while you can still grab and
reposition the whole group. They don't interfere with each other.

---

## Nesting

Use the documented nesting pattern to keep cues separate:

```xml
<g id="drag(1)">
  <g id="scale(values:[1,2,1], dur:3)">
    <rect ... />
  </g>
</g>
```

Behaviour stacks outer → inner. The outer group is draggable,
the inner group scales. Shapes inherit all enclosing cues.

---

## With propagate

Each child in a propagated group gets its own independent drag handler:

```
<g id="propagate(rotate(dir:1, dur:rnd(2,8)) drag(1))">
  <circle cx="50" cy="50" r="20" />
  <circle cx="150" cy="50" r="20" />
  <circle cx="250" cy="50" r="20" />
</g>
```

Each circle rotates independently AND can be dragged independently.

---

## Use Cases

**Modular score layout**
Author a collection of musical fragments as separate groups in Inkscape.
Add `drag(1)` to each. In the browser, arrange them spatially to create
the performance layout. Positions are saved — close the browser and
reopen, everything is where you left it.

**Performer interaction**
Performers drag their assigned elements during performance,
creating a collaboratively arranged visual score in real time.
All clients see the changes immediately.

**Spatial control via OSC**
Use `drag(1, osc:1)` and route x,y position to synthesis parameters —
drag a visual element to pan a sound source, control filter frequency
by vertical position, etc.

**Rehearsal tool**
Quickly rearrange sections of a score during rehearsal without
going back to Inkscape. Reset all positions when you're done:
open the browser console and type `resetDragPositions()`.

---

## Persistence

Drag positions are automatically saved and shared:

- **Across page reloads** — positions survive browser refresh
- **Across clients** — drag on one screen, all connected screens update
- **Across server restarts** — positions saved to JSON in your project folder
- **Per project** — each project has its own saved positions

Positions are stored in `scores/myProject/drag-positions.json`
alongside your other project files. This file is auto-generated —
you don't need to create or edit it.

---

## Resetting Positions

To move everything back to the original authored positions:

```
// Browser console
resetDragPositions()
```

This clears all drag positions for the current project on all
connected clients and deletes the saved JSON file. Elements
return to where they were placed in Inkscape.

---

## Workflow

```
1. Author shapes & groups in Inkscape
2. Add drag(1) to group IDs (XML Editor: Ctrl+Shift+X)
3. Optionally combine with animations:
     rotate(dir:1, dur:4) drag(1)
4. Save SVG → Open in browser
5. Drag elements to arrange the score
6. Positions sync to all clients + saved to disk
7. resetDragPositions() to start fresh
```
