# cue_o2p.md — Object-to-Path Animation

## Overview
`o2p(...)` animates any SVG object along an SVG `<path>` using a compact cue syntax:

```
o2p(path:orbit1, mode:forward, dur:4)
```

It supports continuous motion, reverse motion, ping-pong (alternate), node-jumping, OSC output, easing, tangent-following rotation, loop counts, start/end ranges, and live updating via `uid:`.

---

## Basic Usage

### Animate an object along a path
```
o2p(path:orbit1)
```

### With duration (seconds per traversal)
```
o2p(path:orbit1, dur:8)
```

### With direction mode
```
o2p(path:orbit1, mode:forward)
```

---

## Direction Modes + Aliases

You may use either full names or aliases:

| Full Mode   | Alias |
|-------------|-------|
| `forward`   | `fwd` |
| `reverse`   | `rev` |
| `alternate` | `alt` |

### Examples

```
o2p(path:ring, mode:fwd)
o2p(path:ring, mode:rev)
o2p(path:ring, mode:alt)
```

---

## Parameters

| Parameter | Type | Default | Description |
|----------|------|---------|-------------|
| `path`   | string | **required** | ID of the SVG `<path>` to follow |
| `mode`   | forward / reverse / alternate / jumpNodes | `forward` | Movement behaviour |
| `dur`    | number | 1 | Seconds per full cycle (A→B or A→B→A for alternate) |
| `loop`   | number | 0 | Number of cycles (0 = infinite) |
| `ease`   | number or string | 3 | Easing (same map as rotate/scale) |
| `rotate` | boolean | false | Follow tangent direction (heading rotation) |
| `osc`    | boolean | false | Send OSC output for each update |
| `start`  | number (0–1) | 0 | Start position (fraction of path length) |
| `end`    | number (0–1) | 1 | End position (fraction of path length) |
| `uid`    | string | null | ID for live-updating an existing animation |
| `next`   | cue string | null | Cue to trigger when completed |
| `nextOn` | enum | null | When exactly to trigger the next cue |

---

## Closed Paths (Automatic Orbit Mode)

If the target SVG `<path>` is **closed** — meaning its start and end points meet — `o2p(...)` automatically behaves like an **orbit**.  
No additional mode or parameter is required.

### What this gives you
- **Perfect continuous looping** around the closed shape  
- **Forward** and **reverse** wrap seamlessly  
- **Alternate** becomes a “there and back” traversal along the closed loop  
- **rotate:true** aligns the object to the tangent heading  
- **OSC output includes proper circular angles**, ideal for spatialisation  
- Angles are **0° at the top**, clockwise  
- Suitable for **speaker arrays, spatial audio, lighting rigs, kinetic pathways**, etc.

### Example
```
o2p(path:orbit1, dur:8, rotate:true, osc:true)
```

---

## Examples

### 1. Simple forward motion
```
o2p(path:orbit1, mode:fwd, dur:6)
```

### 2. Reverse
```
o2p(path:orbit1, mode:rev, dur:4)
```

### 3. Ping-pong motion
```
o2p(path:orbit1, mode:alt, dur:5)
```

### 4. Infinite looping
```
o2p(path:orbit1, dur:8, loop:0)
```

### 5. Tangent-following rotation
```
o2p(path:orbit1, rotate:true)
```

### 6. OSC tracking enabled
```
o2p(path:orbit1, osc:true)
```

### 7. Restrict animation to a section of a path
```
o2p(path:orbit1, start:0.25, end:0.75)
```

### 8. Jump between SVG path nodes (if supported)
```
o2p(path:wobbly, mode:jumpNodes, dur:2)
```

---

## Live Updating with `uid:`

You can modify a running animation without restarting the whole SVG:

Initial:
```
o2p(path:orbit1, uid:orb, dur:4, mode:fwd)
```

Live update:
```
o2p(uid:orb, mode:alt, dur:6)
```

The animation updates immediately.

---

## Triggering Behaviour

`o2p(...)` behaves like any cue:

- Triggered by cue collisions  
- Triggered by cue statements  
- Supports Observer mode for automatic pause/resume when offscreen  

---

## OSC Output Format

When `osc:true`:

```
/obj2path <uid-or-pathId> <normX> <normY> <angle>
```

- `normX` / `normY` are normalised to 0–1  
- `angle` is heading in degrees  
- Output is throttled (~30 Hz by default)

---

## Path Requirements

- Must target a valid `<path>` element  
- Path name must match exactly  
- Closed paths automatically provide orbital behaviour  

