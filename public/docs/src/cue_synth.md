---
title: cue_synth
layout: docs_layout.njk
---

# `synth()` — Web Audio Synth Cue

The `synth()` cue creates a lightweight Web Audio sound source inside Oscilla.
It is intended for **reference tones, drones, textures, chords, and simple patterned sound processes**, integrated directly into the score timeline.

The design prioritises:

- deterministic, cue-scoped behaviour
- readable parameter syntax
- low default amplitudes and click-free envelopes
- optional pattern sequencing
- optional OSC mirroring
- optional score overlays for visual preview

The synth is not intended as a full synthesiser environment. For full electroacoustic work, Oscilla is designed to operate in conjunction with external audio systems via OSC (e.g. SuperCollider, Pure Data, Max). The built-in synth provides a bounded, score-aligned sound source intended for rehearsal contexts away from a complete setup, as well as for simple tone cues, drones, and basic animation- or pattern-driven sound sequences embedded directly in the score.

---

## Basic Usage

```dsl
synth(uid:refA, wave:sine, freq:440, amp:0.1)
```

Pitch may be specified as Hz or note name:

```dsl
synth(uid:tuning, wave:sine, freq:A4, amp:0.08)
```

> Optional score overlays can display synth parameters visually (see *Synth Overlay* below).

---

## Wave Types

The following `wave` values are supported:

```dsl
sine
square
saw
triangle
noise
```

Oscillator waveforms map directly to standard Web Audio oscillator types.

`noise` produces a broadband noise source generated from a looping audio buffer. No spectral colouring is applied.

---

## Synth Overlay (Score Preview)

Synth cues can display a **compact visual overlay** directly on the score, showing the declared synth parameters *before the sound is heard*.

The overlay is intended as a **composer-facing preview**, not a meter or live diagnostic. It reflects the values written in the DSL, not runtime or normalised values.

### Enabling the overlay

```dsl
synth(
  uid:pad3,
  wave:saw,
  freq:330,
  env:{a:0.02, d:0.1, s:0.5, r:1},
  amp:0.08,
  overlay:2
)
```

### Overlay modes

| `overlay` value | Behaviour |
|-----------------|-----------|
| `0` | Disabled |
| `1` | Brief preview (wave, pitch, envelope, amp) |
| `2` | Full preview (adds filter, duration, patterns) |

If `overlay` is omitted, the default is `overlay:2`.

### Example overlay output

```
saw | 330Hz | env A:.02 D:.1 S:.5 R:1 | amp .080
```

With filters and patterns:

```
saw | 330Hz | lp F:Pseq Q:.7 | env A:.02 D:.1 S:.5 R:1 | dur .5 | amp .08
```

### Notes

- The overlay always shows the **semantic waveform**, even if `wave` is not explicitly declared (default: `sine`)
- Envelope values are shown **exactly as written** in the DSL
- Patterned parameters are shown symbolically (e.g. `Pseq`, `Prand`)
- The overlay remains visible while the cue exists and briefly highlights when the synth is triggered
- The overlay is visual only and has no effect on sound generation

Overlays are designed to support **reading, rehearsal, and analysis**, and can be disabled per synth or omitted entirely for performance-focused scores.

---

## Lifetime and Duration

### Region-based lifetime (default)

When `synth()` is attached to a cue element, the synth starts when the playhead enters the cue’s bounding box and stops when the playhead exits it.

```dsl
synth(uid:regionTone, wave:sine, freq:220, amp:0.06)
```

### Explicit duration

```dsl
synth(uid:fixedDur, wave:sine, freq:220, dur:5, amp:0.07)
```

The synth stops automatically after the specified number of seconds.

### Persistent process lifetime

```dsl
synth(uid:persist, wave:saw, freq:110, lifetime:process, amp:0.05)
```

The synth continues until explicitly stopped.

---

## Summary

The `synth()` cue provides a bounded, score-aligned sound source suitable for reference tones, drones, chords, and simple patterned textures. Optional score overlays allow synth behaviour to be read directly from the score surface, supporting rehearsal, analysis, and composition without requiring sound playback.
