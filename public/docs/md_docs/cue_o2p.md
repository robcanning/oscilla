# cue_o2p — Object-to-Path Animation

`o2p(...)` animates any SVG object along a named `<path>` element.  
It supports directional motion, ping-pong motion, rotation, OSC output, live updating, path subranges, easing, and chained cue triggers.

---

## Basic Examples

```
// Move around path “orbit1” (defaults: forward, 1s, no rotation)
o2p(path:orbit1)

// Move in 8 seconds
o2p(path:orbit1, dur:8)

// Move reverse
o2p(path:orbit1, mode:rev)

// Ping–pong motion
o2p(path:orbit1, mode:alt, dur:5)

// Loop indefinitely
o2p(path:orbit1, loop:0)
```

---

## Required Parameter

| Key | Type | Meaning |
|---|---|---|
| `path` | string | Name of the `<path>` element to follow |

```
o2p(path:mainOrbit)
```

---

## Timing: `dur:`
**Seconds per full traversal.**

```
o2p(path:orbit1, dur:4)       // 4 seconds per cycle
o2p(path:orbit1, dur:12)      // slower
```

For `mode:alternate`, `dur` is **A→B→A**, not A→B.

---

## Direction Modes

| Full | Alias | Meaning |
|-----|------|--------|
| `forward` | `fwd` | 0 → 1 along the curve |
| `reverse` | `rev` | 1 → 0 along the curve |
| `alternate` | `alt` | back and forth |
| (future) `jumpNodes` | — | jumps between path nodes |

Examples:
```
o2p(path:orbit1, mode:fwd)
o2p(path:orbit1, mode:rev)
o2p(path:orbit1, mode:alt)
```

---

## Rotation Modes (`rotate:`)

Objects may:
- stay visually fixed
- align to motion direction
- lock to a heading
- spin independently

| Mode | Meaning |
|------|---------|
| `none` | No rotation at all |
| `aligned` | Face direction of motion (`angleDeg + rotoffset`) |
| `locked` | Fixed heading (`rotlock`) |
| `spin` | Free rotation independent of travel |

### Rotation Offsets/Direction

| Key | Meaning |
|-----|---------|
| `rotoffset` | Angle added to aligned mode |
| `rotlock` | Heading for locked mode |
| `rotspeed` | Seconds per full revolution (spin) |
| `rotdir` | `1` or `-1` (spin direction) |

### Examples

```
// Follow gesture heading
o2p(path:orbit1, rotate:aligned)

// Aligned but upright visually
o2p(path:orbit1, rotate:aligned, rotoffset:-90)

// Fixed heading
o2p(path:orbit1, rotate:locked, rotlock:0)

// Free spin: 3s per rotation
o2p(path:orbit1, rotate:spin, rotspeed:3)

// Reverse spinning
o2p(path:orbit1, rotate:spin, rotspeed:2, rotdir:-1)
```

---

## Path Subranges

Animate only a segment of the path:

```
o2p(path:orbit1, start:0.25, end:0.75)
```

---

## Looping

```
o2p(path:orbit1, loop:3)   // exactly 3 cycles
o2p(path:orbit1, loop:0)   // infinite
```

---

## Easing (`ease:`)

Maps to the same easing model as rotate/scale:
```
o2p(path:orbit1, ease:3)
```

---

## Closed Paths (Orbits)

If the `<path>` is closed:

- Motion wraps seamlessly
- Aligned mode matches geometric tangent
- Spin/lock behave consistently
- Useful for circular speaker arrays, kinetic routing, light rigs

Example:
```
o2p(path:orbit1, rotate:aligned, rotspeed:2)
```

---

## OSC Output

Enable OSC emission during motion:

```
o2p(path:orbit1, osc:true)
```

Format:
```
/obj2path <uid> <normX> <normY> <angle>
```

- Position normalised 0–1
- Angle in degrees
- ~30Hz throttled output

---

## Live Updating With `uid:`

Start animation:
```
o2p(path:ring, uid:a1, dur:6, mode:fwd, rotate:aligned)
```

Update on the fly:
```
o2p(uid:a1, mode:alt, dur:9)
```

---

## Chaining (`next:`)

Start another cue on completion:

```
o2p(path:a, uid:seg1, next:seg2)
o2p(path:b, uid:seg2, next:seg3)
```

---

## Trigger Semantics

Behaves like any cue:

- Triggered by cue collisions
- Triggered by explicit cue statements
- Paused/resumed by IntersectionObserver
- Multiple o2p processes can run simultaneously
- `uid:` lets you reconfigure animation in realtime

---

## Parameter Summary

| Key | Meaning |
|-----|---------|
`path` | ID of `<path>` to follow (required)  
`mode` | forward / reverse / alternate  
`dur` | seconds per traversal  
`loop` | number of loops (0 = infinite)  
`start`/`end` | 0–1 segment of path  
`rotate` | none / aligned / locked / spin  
`rotoffset` | add visual rotation to aligned mode  
`rotlock` | heading for locked mode  
`rotspeed` | seconds per rotation (spin)  
`rotdir` | ±1 direction (spin)  
`osc` | emit OSC messages  
`uid` | live-update ID  
`next` | chained cue  

---

## Best Practices

- `rotate:aligned, rotoffset:-90` keeps icons upright
- `rotspeed:2–3` gives readable spins
- Use `loop:0` for continuous orbit
- Consider `osc:true` for spatialisation
- `uid:` enables interactive score changes

---
