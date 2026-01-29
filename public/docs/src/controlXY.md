---
title: ControlXY
layout: docs_layout.njk
---

# controlXY — Multitouch XY Control Pad

`controlXY` defines a **persistent, multitouch XY control surface** embedded directly in the score.
It constrains one or more draggable handles to a bounding shape and continuously publishes normalized X/Y values for control and modulation.

Unlike time-based cues, `controlXY` is **always active**, has **no playhead semantics**, and is evaluated at **assign time**.

---

## Syntax

```
controlXY(
  uid: <string>,
  handle: <element-id> | [<id1>, <id2>, ...],
  bounds: <element-id> | "self",
  label: <bool>,
  osc: <bool|number>,
  oscAddr: <string>
)
```

The cue expression is attached to the **bounding element** (or any element if using explicit `bounds`).

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `uid` | string | yes | — | Unique identifier for the control pad. Used for publishing and parameter binding. |
| `handle` | element id or array | yes | — | ID(s) of SVG element(s) that are draggable inside the bounds. Use array syntax for multitouch: `[dot1, dot2, dot3]` |
| `bounds` | element id or "self" | no | `self` | ID of the SVG element that defines the XY constraint area. Defaults to the element the DSL is attached to. |
| `label` | boolean | no | `false` | Show live value labels above each handle. |
| `osc` | `true \| false \| number` | no | `false` | Enable OSC output. If a number is given, it specifies throttle interval in ms. Default throttle ≈ 30 ms. |
| `oscAddr` | string | no | `controlXY/<uid>` | Custom OSC address (without leading `/`). |

---

## Coordinate System

- **X axis**
  - Left = `0.0`
  - Right = `1.0`

- **Y axis** (musical convention)
  - Bottom = `0.0`
  - Top = `1.0`

All values are **normalized** to the bounding box.

---

## Published Signals

### Single Handle
```
controlXY:<uid>.x        // 0.0 — 1.0
controlXY:<uid>.y        // 0.0 — 1.0
controlXY:<uid>.handle   // handle element id
```

### Multiple Handles
```
controlXY:<uid>.<handleId>.x   // 0.0 — 1.0
controlXY:<uid>.<handleId>.y   // 0.0 — 1.0
```

These signals can be used anywhere parameter binding is supported.

---

## OSC Output (optional)

If OSC is enabled, each update sends:

### Single Handle
```
/<oscAddr> <x> <y>
```

### Multiple Handles
```
/<oscAddr>/<handleId> <x> <y>
```

Example addresses:
```
/controlXY/pad1 0.42 0.87           # single handle
/controlXY/pad1/dot1 0.42 0.87      # multitouch handle 1
/controlXY/pad1/dot2 0.15 0.63      # multitouch handle 2
```

OSC output is throttled to avoid flooding.

---

## Examples

### Basic Single Handle (bounds = self)
```
xyPad controlXY(uid:pad1, handle:dot1)
```
- `xyPad` is the bounding element (rect, circle, path, group)
- `dot1` is the draggable handle
- Bounds default to `xyPad` itself

### Multiple Handles (Multitouch)
```
xyPad controlXY(uid:pad1, handle:[dot1, dot2, dot3])
```
- Three independent handles, each tracked separately
- Each publishes its own x/y values

### With Value Labels
```
xyPad controlXY(uid:pad1, handle:[dot1, dot2], label:true)
```
- Shows live `x, y` values above each handle

### With OSC Output
```
xyPad controlXY(uid:pad1, handle:dot1, osc:true)
```
- Sends OSC messages at default 30ms throttle

### With Custom OSC Throttle
```
xyPad controlXY(uid:pad1, handle:dot1, osc:50)
```
- Sends OSC messages at 50ms throttle (20 updates/sec max)

### Explicit Bounds Element
```
anyElement controlXY(uid:pad1, bounds:customRect, handle:dot1)
```
- DSL attached to `anyElement`
- But handles are constrained to `customRect`

### Full Example
```
controlArea controlXY(
  uid: mixer,
  handle: [fader1, fader2, fader3, fader4],
  label: true,
  osc: 30,
  oscAddr: mixer/xy
)
```

---

## CSS Styling

Handles receive CSS classes for styling:

| Class | When Applied |
|-------|--------------|
| `.controlxy-handle` | Always (on all handles) |
| `.controlxy-handle--active` | While being dragged |

### Example CSS
```css
.controlxy-handle {
  cursor: grab;
  transition: filter 0.15s ease-out;
}

.controlxy-handle--active {
  cursor: grabbing;
  filter: drop-shadow(0 0 8px rgba(100, 200, 255, 0.8));
}

.controlxy-label {
  font-family: monospace;
  font-size: 11px;
  fill: #fff;
}
```

### Color Variants
Add these classes to handles in your SVG for preset colors:
- `.controlxy-handle--red`
- `.controlxy-handle--green`
- `.controlxy-handle--blue`
- `.controlxy-handle--yellow`
- `.controlxy-handle--cyan`
- `.controlxy-handle--magenta`

---

## Binding Examples

### Live Scaling
```
scale(uid:box1, sx:pad1.x, sy:pad1.y)
```

### Synth Control
```
synth(uid:s1, freq:pad1.x[100,2000], amp:pad1.y)
```

### Spatial / Navigation Control
```
o2p(path:loopA, start:pad1.dot1.x, end:pad1.dot2.x)
```

### Multi-parameter Modulation
```
rotate(uid:r1, values:pad1.dot1.y[0,360])
color(uid:c1, hue:pad1.dot2.x[0,360])
```

---

## Authoring Guidelines

### Bounding Element
- Should be a `<rect>`, `<circle>`, `<ellipse>`, or `<path>` with a valid bounding box
- Can have `fill: none` if you want it invisible
- Receives the DSL expression

### Handle Elements
- Must have a visible fill (or stroke)
- Should be relatively small (circles, dots, squares work well)
- Must NOT contain DSL expressions
- Will be repositioned to center of bounds on initialization
- Will receive pointer events automatically

### SVG Structure Example
```xml
<g id="xyPad controlXY(uid:pad1, handle:[dot1, dot2], label:true)">
  <rect id="padBounds" x="100" y="100" width="400" height="300" fill="#333"/>
</g>
<circle id="dot1" cx="0" cy="0" r="15" fill="#ff4444"/>
<circle id="dot2" cx="0" cy="0" r="15" fill="#44ff44"/>
```

Note: Handles can be defined anywhere in the SVG — they don't need to be children of the bounds element.

---

## Behaviour

- Handles can be freely dragged **only inside** the bounding element
- The cue is activated **immediately on load**
- No playhead intersection required
- No animation, duration, easing, or timing parameters
- Multitouch: each finger controls the nearest available handle
- Handles are brought to front (z-order) on initialization

---

## Cleanup

The control stores a cleanup function accessible via:
```javascript
element._controlXY.cleanup()
```

This removes all event listeners and labels if needed.

---

## Notes

- `controlXY` is a **control-plane cue**, not a temporal cue
- It is registered during `assignCues()`, not via the playhead dispatcher
- Handle positions are persisted only during the session (not saved)
- Initial position is always center of bounds
- Works with touch screens, mice, and styluses (via Pointer Events API)

---

## Summary

`controlXY` turns the score itself into a tactile controller surface, enabling direct spatial control of sound, animation, and interaction parameters without leaving the notation. With multitouch support, multiple performers or parameters can be controlled simultaneously.

---

## Preset System

controlXY includes a full preset system for saving, recalling, and animating handle positions.

### Saving Presets

**Via UI:** Press `Ctrl+Shift+P` to open the preset panel, enter a name, click Save.

**Via Console:**
```javascript
controlXYPresets.save('myPreset')           // Save all pads
controlXYPresets.save('myPreset', 'pad1')   // Save specific pad only
```

**Via DSL:**
```
controlXYSave(preset:myPreset)
controlXYSave(preset:myPreset, uid:pad1)
```

### Recalling Presets

**Instant recall:**
```javascript
controlXYPresets.recall('myPreset')
```

**Tweened recall:**
```javascript
controlXYPresets.recall('myPreset', { dur: 2, ease: 'easeInOutSine' })
```

**Per-handle timing:**
```javascript
controlXYPresets.recall('myPreset', {
  dur: 1,
  handles: {
    dot1: { dur: 2, delay: 0 },
    dot2: { dur: 1.5, delay: 0.5 },
    dot3: { dur: 1, delay: 1, ease: 'easeOutElastic' }
  }
})
```

**Via DSL:**
```
controlXYRecall(preset:myPreset)
controlXYRecall(preset:myPreset, dur:2, ease:3)
```

### Sequences

Define a sequence of presets to play in order:

```javascript
// Define sequence
controlXYPresets.defineSequence('intro', ['preset1', 'preset2', 'preset3'])

// Play sequence
controlXYPresets.playSequence('intro', { dur: 1.5, loop: false })

// With variable timing per step
controlXYPresets.playSequence('intro', { dur: [1, 2, 0.5] })

// Loop forever
controlXYPresets.playSequence('intro', { dur: 1, loop: true })

// Stop sequence
controlXYPresets.stopSequence()
```

**Via DSL:**
```
controlXYSequence(seq:intro, dur:1.5)
controlXYSequence(seq:intro, dur:1.5, loop:true)
```

### Easing Functions

Available easing options (by name or number):

| Number | Name |
|--------|------|
| 0 | linear |
| 1 | easeInSine |
| 2 | easeOutSine |
| 3 | easeInOutSine |
| 4 | easeInQuad |
| 5 | easeOutQuad |
| 6 | easeInOutQuad |
| 7 | easeInCubic |
| 8 | easeOutCubic |
| 9 | easeInOutCubic |
| 10 | easeInBack |
| 11 | easeOutBack |
| 12 | easeInOutBack |
| 13 | easeInElastic |
| 14 | easeOutElastic |

### Import / Export

**Export to file:**
```javascript
const json = controlXYPresets.export()
// Download or copy json
```

**Import from file:**
```javascript
controlXYPresets.import(jsonString, true)  // true = merge, false = replace
```

**Import from another project:**
```javascript
controlXYPresets.importFromProject('otherProjectId', true)
```

### Preset Panel UI

Toggle the preset management panel:
- Keyboard: `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
- Console: `controlXYPresetUI.toggle()`

The panel provides:
- Save/delete presets
- Recall with adjustable duration and easing
- Play/stop sequences
- Import/export presets

### Storage

Presets are automatically saved to `controlxy-presets.json` in the project folder. The file structure:

```json
{
  "presets": {
    "preset1": {
      "pad1": {
        "dot1": { "x": 0.25, "y": 0.75 },
        "dot2": { "x": 0.80, "y": 0.30 }
      }
    }
  },
  "sequences": {
    "intro": ["preset1", "preset2", "preset3"]
  }
}
```

### API Reference

```javascript
// Presets
controlXYPresets.save(name, uidFilter?)
controlXYPresets.recall(name, options?)
controlXYPresets.delete(name)
controlXYPresets.list()
controlXYPresets.get(name)

// Tweening
controlXYPresets.tweenTo(positions, dur, ease)
controlXYPresets.stopAllTweens()

// Sequences
controlXYPresets.defineSequence(name, steps)
controlXYPresets.playSequence(name, options)
controlXYPresets.stopSequence()
controlXYPresets.getActiveSequence()

// Persistence
controlXYPresets.init(projectId)
controlXYPresets.export()
controlXYPresets.import(json, merge?)
controlXYPresets.importFromProject(projectId, merge?)

// UI
controlXYPresetUI.show()
controlXYPresetUI.hide()
controlXYPresetUI.toggle()
controlXYPresetUI.refresh()
```
