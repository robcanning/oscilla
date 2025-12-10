# cue:o2p — Object-to-Path Animation

`o2p(...)` animates an SVG object along a named `<path>`.  
It supports path traversal, directional modes, rotation modes, looping, OSC output,
partial-path motion, trigger-based activation, delayed start, and visual pre-start states.

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
/obj2path <uid> <normX> <normY> <angle>
```

---

# TRIGGERING

- `trig:auto` — starts automatically in page mode  
- `trig:edge` — starts when the playhead intersects in scroll mode  
- cues may also be activated programmatically  
- `tdelay` applies after the trigger is detected  

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
`uid` | animation identity tag  
`trig` | trigger mode  
`tdelay` | time delay after trigger  
`prestate` | show/hide/ghost before start  

---

# EXAMPLES

```
o2p(path:orbitA, dur:8, tdelay:3, prestate:hide)
o2p(path:spiral, rotate:aligned, rotoffset:-90)
o2p(path:ring, start:0.2, end:0.9, mode:alt)
o2p(path:circle, rotate:spin, rotspeed:2, rotdir:-1)
```
