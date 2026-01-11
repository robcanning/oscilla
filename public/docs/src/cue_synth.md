---
title: cue_synth
layout: docs_layout.njk
---

# `synth()` — Web Audio Synth & Drone Cue

The `synth()` cue creates a lightweight Web Audio–based sound source directly inside Oscilla. It is designed for **reference tones, drones, textures, chords, and simple patterned sound processes**, not for full synthesiser emulation.

The synth cue follows the same design philosophy as Oscilla’s animation and audio cues:

- explicit, readable parameters
- deterministic behaviour
- optional pattern sequencing
- safe defaults (low amplitude, click-free envelopes)
- optional OSC mirroring

Sound is intended to **support the score**, not replace external audio systems.

---

## Basic Usage

### Minimal reference tone

```dsl
synth(uid:refA, wave:sine, freq:440, amp:0.1)
```

---

### Pitch name instead of Hz

```dsl
synth(uid:tuning, wave:sine, freq:A4, amp:0.08)
```

---

## Noise Sources

```dsl
synth(uid:wind, wave:noise, amp:0.07)
```

Accepted aliases:

```dsl
wave:white
wave:pink
wave:brown
```

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

---

## Chords (Array Frequencies)

The `freq` parameter may be a **list of frequencies**, producing a chord. Each value is rendered as a parallel oscillator voice sharing the same envelope and effects chain.

```dsl
synth(
  uid:pad3,
  wave:sine,
  freq:[440, 477, 644, 777],
  env:{a:1.5},
  amp:0.12
)
```

---

## Patterned Parameters

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

---

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
  env:{a:1.2},
  amp:0.1
)
```

---

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

### Amplitude pattern

```dsl
synth(
  uid:ampSteps,
  wave:saw,
  freq:440,
  amp:[0.05, 0.1, 0.15, 0.1],
  dur:1
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

---

## Delay

```dsl
synth(
  uid:delayLead,
  wave:square,
  freq:550,
  amp:0.12,
  delay:{time:0.25, fb:0.35, mix:0.2}
)
```

---

## Reverb

```dsl
synth(
  uid:revDrone,
  wave:sine,
  freq:110,
  amp:0.07,
  reverb:{mix:0.3, time:2, damp:3000}
)
```

---

## Glide

```dsl
synth(
  uid:glide1,
  wave:sine,
  freq:Pseq(220, 330, 440),
  dur:1,
  glide:0.1,
  amp:0.1
)
```

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

## Stop

```dsl
synthStop(uid:seq1, rel:0.5)
```

---

## Summary

The `synth()` cue provides simple, reliable sound generation for reference tones, drones, chords, and patterned textures, fully integrated into Oscilla’s cue and pattern system.
