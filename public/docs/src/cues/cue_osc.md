---
title: cue_osc
layout: docs_layout.njk
---
# cue:osc --- Discrete OSC Event Cue

`osc(...)` sends a **single OSC message** when triggered.

It is **event-based**, not continuous. It turns drawn objects into
**discrete control events**, typically consumed by environments like
SuperCollider, Pd, or Max.

It works especially well with `propagate()`, because a simple drawing
can become many individual OSC triggers.

------------------------------------------------------------------------

## BASIC FORM

    osc(addr:<name>, <param>:<source>, ...)

Required:

  Key      Meaning
  -------- ----------------------------------------
  `addr`   OSC address name (without leading `/`)

Example:

    osc(addr:voice, pitch:y, env:size)

------------------------------------------------------------------------

## EVENT BEHAVIOUR

-   Sends **one OSC message per trigger**
-   No looping, no animation, no scheduler
-   Values are sampled **at the moment of triggering**
-   Cue completes immediately

`osc()` is a *logical cue*, not an animation cue.

------------------------------------------------------------------------

## VISUAL PARAMETER SOURCES (NORMALISED)

All visual sources are normalised to `0–1`.

  Source       Meaning
  ------------ ---------------------------------------
  `x`          Object centre X position
  `y`          Object centre Y position
  `size`       Max(width, height) mapped to viewport
  `scale`      Current visual scale value
  `rotation`   0--360 mapped to 0--1
  `opacity`    Computed opacity
  `fill`       Numeric colour hash

Example:

    osc(addr:voice, pitch:y, amp:size)

Here the Y-axis produces a **continuous control pitch**, interpreted
downstream.

------------------------------------------------------------------------

## SEMANTIC PITCH VALUES

Beyond visual values, `osc()` supports **typed pitch declarations**.

### Hz (absolute)

    osc(addr:voice, pitch:hz(440))

### MIDI note number

    osc(addr:voice, pitch:midi(60))

### Scale degree + octave

    osc(addr:voice, pitch:deg(5,3))

Represents:

-   scale degree = 5
-   absolute octave = 3

The receiver chooses how to interpret the scale.

------------------------------------------------------------------------

## OPTIONAL ROOT OVERRIDE

You may specify a **root** in the cue:

    osc(addr:voice, pitch:deg(2,4), root:48)

If omitted, the receiver uses its global default (`~oscRoot` in SC).

------------------------------------------------------------------------

## PITCH PRIORITY

When multiple forms are present, resolution is:

1.  `deg(d,o)` (scale-based symbolic pitch)
2.  `hz()` / `midi()` (absolute pitch)
3.  visual mapping (e.g., `pitch:y`)

Only one pitch representation is used per event.

------------------------------------------------------------------------

## TRIGGERS

  Key                         Meaning
  --------------------------- -------------------------------
  `trig:auto`                 Send immediately
  `trig:playhead`             Fire when playhead intersects
  `trig:click`                Fire on user click
  `prestate:ghostClickable`   Arm interaction ahead of time

Example:

    osc(addr:voice, pitch:deg(0,4), trig:playhead)

------------------------------------------------------------------------

## UID (OPTIONAL)

    osc(addr:voice, pitch:y, uid:v1)

UID can be used downstream to associate events with voices/players/etc.

------------------------------------------------------------------------

## OSC OUTPUT FORMAT (AUTHORITATIVE)

`osc()` currently sends **positional arguments**, not keyed pairs.

### GENERAL PACKET FORMAT

    /oscilla/<addr>
      pitchType, pitchA, pitchB, size, env, density, [optional root]

Where:

  Field         Meaning
  ------------- ----------------------------------------------
  `pitchType`   0=none, 1=deg/oct, 2=hz, 3=midi, 4=y-control
  `pitchA`      meaning depends on pitchType
  `pitchB`      octave (deg mode only)
  `size`        0--1
  `env`         0--1
  `density`     0--1 (area-derived)
  `root`        optional per-event root override

### Examples

#### Control pitch from Y

    /oscilla/voice
    1 5 3 0.41 0.41 0.12

#### Absolute pitch

    /oscilla/voice
    2 440 0 0.18 0.22 0.10

#### Degree + octave + root override

    /oscilla/voice
    1 5 3 0.33 0.20 0.15 48

Receivers are expected to decode according to this positional layout.

------------------------------------------------------------------------

## USE WITH propagate()

    propagate(
      osc(
        addr:voice,
        pitch:y,
        env:size,
        trig:playhead
      )
    )

### Degree constellation examples

    propagate(
      osc(
        addr:pontalist,
        pitch:deg(irand(0,11), irand(0,2)),
        env:size
      )
    )

    propagate(
      osc(
        addr:pontalist,
        pitch:deg(${1}, ${2}),
        env:size,
        root:48
      ),
      rnd([0,2,4,5,7,9,11]),
      rnd([0,1,2,3,4,5])
    )

------------------------------------------------------------------------

## DESIGN NOTES

-   stateless
-   no DOM ID use
-   no continuous OSC streaming
-   no scale-logic baked into DSL
-   musical interpretation lives downstream
-   arguments are positional, compact, and receiver-focused

------------------------------------------------------------------------

## SUMMARY

> `osc()` converts visual gestures into **one-shot OSC control events**,
> supporting symbolic, absolute, and control-driven pitch --- while
> leaving musical semantics to the instrument.
