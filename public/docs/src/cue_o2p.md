---
title: cue_o2p
layout: docs_layout.njk
---
# cue:o2p — Object-to-Path Animation

`o2p(...)` animates an SVG object along a named `<path>`.  
It supports path traversal, directional modes, rotation modes, looping, OSC output,
partial-path motion, trigger-based activation, delayed start, visual pre-start states,
**interactive touch/drag control**, and **grouped fader presets with launcher bars**.

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
| `trig:touch` | no auto-animation; object is draggable along path |

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

**Visual Indicator:**
Touch mode objects display an **orange** hit-label ring (instead of purple) 
to indicate they are draggable.

---

# FADER GROUPS AND PRESETS

Touch-mode faders can be collected into named **groups**. A group enables
saving and recalling all fader positions as named presets, tweening between
presets with easing, and sequencing preset recalls over time.

## Grouping Faders

Add `group:<name>` and `uid:<id>` to each touch-mode fader:

```
o2p(path:track1, trig:touch, group:mixer1, uid:vol, osc:true)
o2p(path:track2, trig:touch, group:mixer1, uid:pan, osc:true)
o2p(path:track3, trig:touch, group:mixer1, uid:send, osc:true)
```

All three faders register under `window._o2pTouchGroups["mixer1"]` and can be
saved/recalled as a unit. The `group` value is freeform — any string.

## Launcher Bar

When a group registers, a **launcher bar** appears below the group's bounding box.
It provides direct access to presets and sequences without opening the full
preset panel.

The launcher includes:

- **Preset/Sequence slots** — left-click to recall, long-press to store current positions
- **Bank navigation** — arrow buttons to page through banks of slots
- **Mode toggle** (P/S) — switch between preset and sequence slot modes
- **Tween toggle** (~) — smooth interpolation or instant jump on recall
- **Sequence transport** — play/stop buttons for sequence playback
- **Settings gear** — opens the full o2p Preset Manager panel

An **orange toggle circle** appears to the right of the group. Click it to
show or hide the launcher bar.

## Preset Manager Panel

The preset panel (keyboard shortcut **Alt+Shift+O**, or gear button on launcher)
provides full preset management:

- **Presets tab** — save, recall, delete named presets with tween duration and easing
- **Sequences tab** — define ordered lists of presets with per-step timing
- **Import/Export** — save and load preset collections as JSON files

Console access: `window.o2pPresetUI.toggle()`

## Preset Data

Each preset stores the normalized position of every fader in the group:

```json
{
  "mixer1": {
    "vol": { "t": 0.75 },
    "pan": { "t": 0.3 },
    "send": { "t": 0.5 }
  }
}
```

If a fader has a rotation handle (`hmode:`), a `p` value is also stored:

```json
{ "vol": { "t": 0.75, "p": 0.6 } }
```

## Console API

```javascript
window.o2pPresets.save("intro")           // save current positions
window.o2pPresets.recall("intro")         // instant recall
window.o2pPresets.recall("intro", { dur: 2, ease: "easeInOutSine" })  // tween
window.o2pPresets.list()                  // list all preset names
window.o2pPresets.delete("intro")         // delete a preset

// Sequences
window.o2pPresets.defineSequence("drift", [
  { preset: "intro", dur: 3 },
  { preset: "verse", dur: 2 },
  { preset: "chorus", dur: 4 }
], { loop: true })
window.o2pPresets.playSequence("drift")
window.o2pPresets.stopSequence()
```

---

# ROTATION HANDLES

Touch-mode faders can have a secondary **rotation handle** that adds a second
control dimension. This is useful for parameters like pan, filter cutoff, or
any value that benefits from a rotary control alongside the linear fader.

## `hmode:<continuous|limited>`

Determines the rotation behavior:

- `continuous` — full 360-degree rotation with wraparound (suitable for azimuth, phase)
- `limited` — constrained arc with hard stops like a physical potentiometer (suitable for volume, gain)

## `rotrange:<degrees>`

Sets the arc range for `hmode:limited`. Default is 270 degrees.

```
o2p(path:track1, trig:touch, group:mixer1, uid:vol, hmode:limited, rotrange:270, osc:true)
```

## `handle:<elementId>`

Reference a user-drawn SVG element as the rotation handle instead of the
auto-generated one:

```
o2p(path:track1, trig:touch, group:mixer1, uid:vol, hmode:limited, handle:knob1, osc:true)
```

Where `knob1` is the ID of an existing SVG element in the score.

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
`group` | fader group name (touch mode only)  
`hmode` | rotation handle mode: `continuous` or `limited` (touch mode only)  
`rotrange` | arc range in degrees for `hmode:limited` (default 270)  
`handle` | ID of user-drawn SVG element to use as rotation handle  

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

// Grouped faders with preset system
o2p(path:track1, trig:touch, group:mixer1, uid:vol, osc:true)
o2p(path:track2, trig:touch, group:mixer1, uid:pan, osc:true)
o2p(path:track3, trig:touch, group:mixer1, uid:send, osc:true)

// Grouped fader with rotation handle
o2p(path:track1, trig:touch, group:mixer1, uid:vol, hmode:limited, rotrange:270, osc:true)

// Grouped fader with user-drawn rotation handle
o2p(path:track1, trig:touch, group:mixer1, uid:vol, hmode:continuous, handle:knob1, osc:true)
```
