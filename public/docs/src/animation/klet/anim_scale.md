---
title: anim_scale
layout: docs_layout.njk
---
# 🌀 Scale Animation Namespace (Modern Syntax)

This document describes the **modern `scale` namespace format** used in OscillaScore. All legacy formats (`s_seq_...`, `s[...]`) are deprecated.

---

## ✅ Format Overview

```
s([...])        → uniform scale
sXY([...])      → paired X/Y scale
sX([...])       → X-only scale
sY([...])       → Y-only scale
```

Each takes a list of values or XY pairs, with additional control via suffix arguments.

---

## 🎛️ Parameters

### Required
- `s(...)`, `sXY(...)`, `sX(...)`, `sY(...)` — animation data

### Optional Arguments
| Name         | Type     | Description |
|--------------|----------|-------------|
| `mode(...)`  | string   | `loop` (default), `alt`, `bounce`, `once` |
| `seqdur(...)`| number   | Total duration of full animation loop (in seconds) |
| `dur[...]`   | numbers  | Relative duration weights for steps |
| `ease(...)`  | number   | Easing code (0–9) or `ease[...]` list |
| `pivot(...)` | x,y      | Offset from object's center (e.g. `pivot(20,-10)`) |
| `_t(1)`      | flag     | Defer playback (cue-triggered only) |
| `osc(1)`     | flag     | Enable OSC output on each scale step/frame |
| `throttle(...)` | number (ms) | Minimum ms between OSC sends (default 50) |

---

## 🎨 Examples

### 1. Uniform loop
```
s([1,1.2,1])_seqdur(2)_ease(3)
```

### 2. Non-uniform XY
```
sXY([[1,1],[1.2,0.8],[1,1]])_mode(alt)_seqdur(3)_ease(2)
```

### 3. Regenerating random
```
s(rnd(4x0.6-1.4x))_mode(loop)_seqdur(2)
```

### 4. Triggerable scale burst
```
s([1,1.5,1])_mode(once)_ease(5)_t(1)
```

### 5. OSC scale loop with pivot
```
s([1,2])_mode(alt)_pivot(50,-50)_osc(1)_throttle(30)
```

---

## 🧠 Notes
- `pivot(x,y)` is **relative to the object’s center**, not the SVG root.
- `s(...)` is required — legacy `s_seq_...` / `s[...]` are unsupported.
- `OSC` messages are sent as:
```json
{
  "type": "osc_scale",
  "id": "obj-id",
  "scaleX": 1.5,
  "scaleY": 1.2,
  "timestamp": 1710000000000
}
```

---

## 🔄 Compatibility
- Fully supported: ✅ `startScale()` (modern)
- Observer-aware: ✅ Pauses/resumes when off-screen
- Triggerable: ✅ via `_t(1)`
- Regenerating: ✅ random sequences with `x` flag
