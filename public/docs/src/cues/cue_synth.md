---
title: cue_synth
layout: docs_layout.njk
---

# `synth()` — Web Audio Synth Cue


## Oscilla "Native WebAudio Utility Synth"
<figure class="doc-image">
  <img
    src="{{ '/docs/img/oscilla-synth-basic.png' | url }}"
    alt="Oscilla Synth"
  >
</figure>

The `synth()` cue creates a lightweight Web Audio sound source inside Oscilla.
It is intended for **reference tones, drones, textures, chords, and simple patterned sound processes**, integrated directly into the score timeline.

The design prioritises:

- deterministic, cue-scoped behaviour
- readable parameter syntax
- low default amplitudes and click-free envelopes
- optional pattern sequencing
- optional OSC mirroring

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

## Amplitude Envelope (ADSR)

```dsl
synth(
  uid:env1,
  wave:saw,
  freq:220,
  amp:0.12,
  env:{a:0.5, d:0.2, s:0.7, r:1.2}
)
```

Envelope parameters:

- `a` — attack (seconds)
- `d` — decay (seconds)
- `s` — sustain level (0–1)
- `r` — release (seconds)

---

## Chords

If `freq` is an array, multiple oscillators are created and summed as a chord.

```dsl
synth(
  uid:pad3,
  wave:sine,
  freq:[440, 477, 644, 777],
  env:{a:1.5},
  amp:0.12
)
```

All voices share the same envelope and effects chain.

---

## Patterned Parameters

The following parameters may be static values, arrays, or pattern functions:

- `freq`
- `amp`
- `dur`
- `filter.freq`
- `filter.q`
- `pan`

### Frequency sequence

```dsl
synth(
  uid:seq1,
  wave:triangle,
  freq:Pseq(220, 330, 440),
  dur:Pseq(1, 1, 2),
  amp:0.08
)
```

### Patterned chord progression

```dsl
synth(
  uid:chordSeq,
  wave:saw,
  freq:Pseq(
    [220, 330, 440],
    [247, 370, 494],
    [196, 294, 392]
  ),
  dur:1.5,
  amp:0.1
)
```

### Random pitch

```dsl
synth(
  uid:randFreq,
  wave:square,
  freq:Prand(200, 400, 600),
  dur:0.8,
  amp:0.09
)
```

---

## Filters

```dsl
synth(
  uid:filterSeq,
  wave:saw,
  freq:330,
  filter:{type:lp, freq:Pseq(400, 800, 1600, 800), q:0.7},
  dur:0.5,
  amp:0.08
)
```

Supported filter types:

```dsl
lp
hp
bp
notch
```

---

## Delay

```dsl
synth(
  uid:delayLead,
  wave:square,
  freq:550,
  delay:{time:0.25, fb:0.35, mix:0.2},
  amp:0.12
)
```

---

## Reverb

```dsl
synth(
  uid:revDrone,
  wave:sine,
  freq:110,
  reverb:{mix:0.3, time:2, damp:3000},
  amp:0.07
)
```

---

## Glide (Frequency Only)

```dsl
synth(
  uid:glide1,
  wave:sine,
  freq:Pseq(220, 330, 440),
  glide:0.1,
  dur:1,
  amp:0.1
)
```

`glide` specifies the time (seconds) used to interpolate frequency changes between steps. It applies only to pitch.

---

## Interpolation Mode

```dsl
synth(
  uid:stepSeq,
  wave:triangle,
  freq:Pshuf(300, 450, 600),
  interp:step,
  dur:1,
  amp:0.08
)
```

- `interp:smooth` — ramps between values
- `interp:step` — immediate value changes

---

## Pan

```dsl
synth(
  uid:panTest,
  wave:sine,
  freq:440,
  pan:-0.6,
  amp:0.09
)
```

Pan may be static or patterned but does not support continuous modulation.

---

## OSC Mirroring

```dsl
synth(
  uid:oscLead,
  osc:1,
  oscAddr:/synth/lead,
  wave:saw,
  freq:440,
  amp:0.1
)
```

---

## Stopping a Synth

```dsl
synthStop(uid:seq1, rel:0.5)
```

The optional `rel` parameter specifies release time in seconds.

---


## Summary

The `synth()` cue provides a bounded, score-aligned sound source suitable for reference tones, drones, chords, and simple patterned textures. All behaviour is deterministic and cue-scoped, and integrates directly with Oscilla’s timing and animation model.

