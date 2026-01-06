---
title: cue_rotate
layout: docs_layout.njk
---
# rotate() --- Rotation Cue

`rotate(...)` rotates an SVG element using either:

-   **continuous rotation**, or
-   a **sequence / pattern of angle values**

Rotation can be:

-   smooth interpolated
-   stepped
-   looping, alternating, or one‑shot
-   optionally sending OSC messages (with live overlays).

------------------------------------------------------------------------

## 🔁 BASIC FORMS

### Continuous

    rotate(dir:1, dur:1)

### Sequence

    rotate(values:[0,120,240], dur:2)

### Pattern sequences

    rotate(values:Pseq([0,45,10],inf), dur:Pseq([1,0.2,2],inf))

------------------------------------------------------------------------

## ⚡ TRIGGERING

-   `auto` (page load / mode)
-   `edge` (playhead collision)
-   cue activation

------------------------------------------------------------------------

## ⏱ TRIGGER DELAY --- `tdelay:<seconds>`

Delays motion after trigger:

    rotate(values:[0,120,240], tdelay:2)

------------------------------------------------------------------------

## 👻 PRESTART VISIBILITY --- `prestate:<show|hide|ghost>`

Controls appearance before rotation begins.

    rotate(values:[0,90,180], tdelay:4, prestate:ghost)

The element adopts the **initial rotation angle immediately**, then
waits.

------------------------------------------------------------------------

## 🎚 SEQUENCE PARAMETERS

  Key        Meaning
  ---------- ---------------------------------
  `values`   list of angles or pattern
  `dur`      seconds per step (or pattern)
  `mode`     `loop`, `once`, `alternate`
  `interp`   `smooth` or `step`
  `hold`     pause after tween (smooth only)

------------------------------------------------------------------------

## 🔄 CONTINUOUS ROTATION

    rotate(dir:1, dur:2)
    rotate(dir:-1, dur:3, ease:"easeInOutSine")

-   `dir:1` → clockwise
-   `dir:-1` → counter‑clockwise
-   `loop:0` (default) = infinite

------------------------------------------------------------------------

## 🆔 UID --- Live Updates

UID lets multiple cues address the same animation:

    rotate(values:[0,90,180], uid:r1)
    rotate(uid:r1, dur:0.5)

------------------------------------------------------------------------

## 🌐 OSC OUTPUT (optional)

Rotation can send OSC every frame or per‑step.

Enable via:

    osc:1

Specify an OSC address:

    rotate(values:[0,90,180], osc:1, oscaddr:"/spatialisation/source1")

### Payload format

Every message includes:

  Field         Meaning
  ------------- -----------------------------
  `deg`         wrapped degrees **0--360**
  `rad`         radians (`deg * π/180`)
  `norm`        normalized 0--1 (`deg/360`)
  `uid`         animation UID
  `timestamp`   ms since epoch

Example conceptual payload:

``` json
{
  "type": "osc_rotate",
  "uid": "r1",
  "deg": 135.0,
  "rad": 2.356,
  "norm": 0.375,
  "addr": "/spatialisation/source1"
}
```

> NOTE: Internally angles may accumulate, but outgoing OSC **always
> wraps to 0--360**.

### On‑screen overlays

When OSC is enabled, a small overlay shows:

    /spatialisation/source1 — deg:135.0

Overlays can be globally toggled.

------------------------------------------------------------------------

## 📋 FULL PARAMETER LIST

  Key          Description
  ------------ -----------------------------
  `values`     angle sequence or pattern
  `dur`        duration or pattern
  `mode`       loop logic
  `interp`     step or smooth
  `hold`       pause after tween
  `dir`        direction (continuous mode)
  `ease`       easing curve
  `uid`        animation identity
  `trig`       trigger mode
  `tdelay`     trigger delay
  `prestate`   visual pre‑start state
  `osc`        enable OSC (0/1/2)
  `oscaddr`    explicit OSC address

------------------------------------------------------------------------

## ⭐ EXAMPLES

    rotate(values:[0,120,240], dur:4, tdelay:2)

    rotate(values:Pshuf([0,180],inf),
           dur:1,
           mode:alternate,
           osc:1,
           oscaddr:"/fx/rot1")

    rotate(dir:-1, dur:3, prestate:hide, tdelay:1)

------------------------------------------------------------------------

## ✔ Summary

-   declarative rotation cue
-   works in page + scroll modes
-   full control of timing + interpolation
-   OSC‑ready with wrapped degrees, radians, and normalized values
-   optional debug overlays
