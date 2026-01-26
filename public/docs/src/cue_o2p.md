---
title: cue_o2p
layout: docs_layout.njk
---
# cue:o2p — Object-to-Path Animation

`o2p(...)` animates an SVG object along a named `<path>`.  
It supports path traversal, directional modes, rotation modes, looping, OSC output,
partial-path motion, trigger-based activation, delayed start, visual pre-start states,
and **interactive touch/drag control**.

---

# BASIC FORM

```
o2p(path:<id>, dur:<seconds>, mode:fwd)
```

Required:

| Key | Meaning |
|-----|---------|
| `path` | The ID of the `<path>` element to follow |

---

# TIMING

### `dur:<seconds>`
Duration of one full traversal of the path.

```
o2p(path:orbit, dur:6)
```

In `mode:alt`, the full A→B→A cycle lasts `dur` seconds.

### `tdelay:<seconds>`
Delays the start of the animation after the cue triggers.

```
o2p(path:orbit, tdelay:3)
```

`tdelay` is real-time and independent of score position.

---

# PRESTART VISIBILITY

### `prestate:<show|hide|ghost>`

Controls how the object looks before the animation begins:

- `show`  — fully visible immediately  
- `hide`  — invisible until start  
- `ghost` — semi-transparent until start  

The object is positioned at its correct starting location before motion begins.

```
o2p(path:orbit, tdelay:4, prestate:hide)
```

---

# DIRECTION MODES

| Mode | Meaning |
|------|---------|
| `forward` / `fwd` | 0 → 1 along path |
| `reverse` / `rev` | 1 → 0 |
| `alternate` / `alt` | back-and-forth motion |

```
o2p(path:curve, mode:alt, dur:8)
```

---

# PATH SEGMENTS

```
o2p(path:ring, start:0.2, end:0.8)
```

The object travels only between normalized positions `start` and `end`.

---

# ROTATION

| `rotate:` | Description |
|-----------|-------------|
| `none` | no rotation |
| `aligned` | align to tangent direction |
| `locked` | fixed heading using `rotlock` |
| `spin` | continuous rotation (`rotspeed`, `rotdir`) |

Additional keys:

| Key | Meaning |
|------|--------|
| `rotoffset` | add angular offset |
| `rotlock` | fixed heading in degrees |
| `rotspeed` | seconds per full rotation |
| `rotdir` | ±1 direction multiplier |

---

# LOOPING

```
o2p(path:orbit, loop:3)
o2p(path:orbit, loop:0)   // infinite
```

---

# OSC OUTPUT

```
o2p(path:orbit, osc:true)
```

Emits:
```
/o2p/<uid> <pathT> <normX> <normY> <angle>
```

Custom OSC address:
```
o2p(path:orbit, osc:true, oscAddr:myController)
```

Emits:
```
/myController <pathT> <normX> <normY> <angle>
```

---

# TRIGGERING

| Trigger | Behavior |
|---------|----------|
| `trig:auto` | starts automatically in page mode |
| `trig:edge` | starts when the playhead intersects in scroll mode |
| `trig:touch` | **NEW** — no auto-animation; object is draggable along path |

Cues may also be activated programmatically.  
`tdelay` applies after the trigger is detected.

---

# TOUCH MODE (Interactive Control)

The `trig:touch` mode transforms the o2p animation into an **interactive controller**. 
Instead of automatically animating, the object waits for user interaction.

```
o2p(path:fader, trig:touch, osc:true)
```

**Behavior:**
- Object is positioned at the start point (or `start:` position)
- No automatic animation occurs
- User can **grab and drag** the hit-label overlay
- Object follows the user's finger/mouse along the path
- If `osc:true`, every movement emits OSC values

**Use Cases:**
- Browser-based OSC faders/sliders
- XY pads with constrained motion
- Rotary knobs (using circular paths)
- Custom UI controllers that follow any SVG path shape

**Example — Linear Fader:**
```
o2p(path:verticalLine, trig:touch, osc:true, oscAddr:fader1)
```

**Example — Circular Knob:**
```
o2p(path:knobArc, trig:touch, start:0.1, end:0.9, osc:true, oscAddr:knob1)
```

**Example — XY Pad (rectangular path):**
```
o2p(path:xyBounds, trig:touch, osc:true, oscAddr:xyPad)
```

**Visual Indicator:**
Touch mode objects display an **orange** hit-label ring (instead of purple) 
to indicate they are draggable.

---

# LIVE UPDATE (`uid:`)

```
o2p(path:ring, uid:a1)
o2p(uid:a1, mode:alt)
```

Later cues with the same `uid` modify running animations.

---

# FULL PARAMETER LIST

| Key | Description |
|------|-------------|
`path` | required path reference  
`dur` | motion duration  
`mode` | direction mode  
`loop` | repeat count (`0` = infinite)  
`start`, `end` | normalized path range  
`rotate` | rotation behavior  
`rotoffset`, `rotlock`, `rotspeed`, `rotdir` | rotation parameters  
`ease` | easing preset  
`osc` | OSC emission  
`oscAddr` | custom OSC address (without leading `/`)
`uid` | animation identity tag  
`trig` | trigger mode (`auto`, `edge`, `touch`)
`tdelay` | time delay after trigger  
`prestate` | show/hide/ghost before start  

---

# EXAMPLES

```
o2p(path:orbitA, dur:8, tdelay:3, prestate:hide)
o2p(path:spiral, rotate:aligned, rotoffset:-90)
o2p(path:ring, start:0.2, end:0.9, mode:alt)
o2p(path:circle, rotate:spin, rotspeed:2, rotdir:-1)

// Touch mode controllers
o2p(path:faderTrack, trig:touch, osc:true, oscAddr:volume)
o2p(path:knobPath, trig:touch, start:0.15, end:0.85, osc:true)
```
