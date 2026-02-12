---
title: cue_audioImpulse
layout: docs_layout.njk
---

# `audioImpulse(...)` -- Stochastic Repeating Process

Uses the same pool and selection engine as [audioPool](../cue_audioPool/), but runs as a continuous autonomous process that keeps firing hits at a configurable rate. Designed for textures, granular clouds, stochastic rhythms, and ambient layers.

---

## Syntax

```
audioImpulse(path:sfx/rain, rate:30, jitter:0.4, poly:6, lifetime:region)
```

---

## Timing Parameters

| Key | Default | Description |
|-----|---------|-------------|
| `rate` | 30 | Events per minute |
| `jitter` | 0 | Timing randomisation 0--1. 0 = steady clock, 1 = fully random spacing |

The interval between hits is computed as `base = 60 / rate` seconds. Jitter widens this: the actual interval is uniformly distributed between `base * (1 - jitter)` and `base * (1 + jitter)`.

---

## Sound Parameters

| Key | Default | Description |
|-----|---------|-------------|
| `path` (required) | -- | Folder inside project audio directory |
| `format` | `wav` | File extension |
| `mode` | `shuffle` | Selection mode: `shuffle`, `rand`, or `sequential` |
| `amp` | 1 | Gain, or `rand(a, b)` |
| `pan` | 0 | Stereo position, or `rand(-1, 1)` |
| `speed` | 1 | Playback rate, or `rand(a, b)`. Negative = reverse |
| `speedRandom` | 0 | Per-hit randomisation range centred on `speed` |
| `fade` | 0 | Shorthand for fadeIn + fadeOut |
| `fadein` | 0 | Fade-in (seconds or percentage) |
| `fadeout` | 0 | Fade-out (seconds or percentage) |
| `loop` | 1 | Loop each hit |
| `poly` | 6 | Max simultaneous voices |
| `uid` | auto | Process identity |
| `waveform` | `self` | Waveform display target: `self`, `none`, or element id |
| `overlay` | 2 | Overlay detail level: 0/off, 1/brief, 2/expanded |
| `pin` | -- | Pin element to playhead for N seconds (see [pin](../cue_pin/)) |

See [audio_shared](../cue_audio_shared/) for details on fades, random expressions, waveform display, and OSC output.

### Speed and speedRandom

The `speed` parameter sets the base playback rate for each hit. `speedRandom` adds per-hit randomisation centred on the base value. For example, `speed:1, speedRandom:0.3` produces speeds between 0.7 and 1.3.

Negative `speed` values play each hit in reverse using a sample-reversed buffer copy.

---

## Lifetime Modes

| Value | Behaviour |
|-------|-----------|
| `process` | Runs until explicitly stopped via code or transport |
| `region` | Runs only while the playhead is inside the cue element's bounding box |

### Region Mode

In `region` mode, the process starts when the playhead enters the element and stops automatically on exit. A grace period (15 ticks, 50px tolerance) prevents false exits caused by sub-pixel jitter at element boundaries. The process only exits after confirming the playhead has genuinely entered and then left the region.

Region checks run every RAF frame via `checkImpulseRegions()`.

---

## Selection Modes

Impulse supports the same modes as audioPool via the `mode` parameter. Both use the shared `selectFromPool` engine:

| Mode | Behaviour |
|------|-----------|
| `shuffle` | No repeats until pool exhausted, then reshuffle |
| `rand` | Pure random, repeats possible |
| `sequential` | Play in directory order, wrap around |

---

## Polyphony

The `poly` parameter limits simultaneous voices. When the limit is reached, new hits are skipped until a voice frees up. This is enforced by counting active keys in `window.activeAudioCues` that match the impulse uid prefix.

With `poly:0`, there is no limit.

---

## Multi-Cursor Waveform

A single base waveform is rendered once for the element at score load time. Each polyphonic hit adds its own visual layer:

### Peak Layers

Each active voice draws a coloured waveform contour (upper and lower polylines) layered on top of the base waveform. Colours are assigned automatically from a 12-colour palette. Layers are added when a hit starts and removed when it completes.

Before any live hits, three random files from the pool are displayed as preview layers (at reduced opacity) to give a visual sense of the pool content. These preview layers are cleared on the first live hit.

### Cursors

Each voice gets an independent cursor line that sweeps across the waveform tracking playback position. The cursor colour matches its peak layer colour. Cursors auto-remove when their voice completes.

With `poly:6`, up to six cursors and six peak layers can be visible simultaneously, creating a dense visual representation of the stochastic texture.

### Reverse Display

When `speed` is negative, the waveform contours (base and all layers) mirror horizontally via SVG transform, and cursors move right-to-left.

---

## Live Console Hot-Update

Running impulse processes can be modified from the live console by retrigering with the same `uid`. The following parameters update immediately without restarting the process:

| Parameter | Behaviour |
|-----------|-----------|
| `rate` | New trigger interval on next timer tick |
| `jitter` | New jitter range on next timer tick |
| `poly` | Updated voice limit |
| `amp`, `pan`, `speed` | Applied to subsequent hits |

If `path` changes, the file pool is rebuilt asynchronously. Hits are suppressed during the rebuild and resume once the new pool is ready.

The waveform info text updates to reflect the new parameter values.

---

## OSC Parameters

| Key | Default | Description |
|-----|---------|-------------|
| `osc` | 0 | Enable OSC mirroring (1=on) |
| `oscaddr` | `/oscilla/audio/impulse` | Custom OSC address |

Each hit sends an OSC message with filename, amp, pan, speed, fadeIn, fadeOut as arguments.

---

## Stopping

An impulse process can be stopped by:

- Region exit (with `lifetime:region`)
- Transport rewind or stop
- Programmatic: `stopAudioImpulse(uid)` or `stopAllAudioImpulses()`

On stop, all active voices fade out, all waveform cursors are removed, and all peak layers are cleared.

---

## Examples

```
// Basic rainfall texture
audioImpulse(path:sfx/rain, rate:30, jitter:0.5, poly:6, lifetime:region)

// Dense granular cloud
audioImpulse(
  path:sfx/grain,
  rate:120,
  jitter:0.8,
  amp:rand(0.05, 0.3),
  pan:rand(-1, 1),
  speed:rand(0.2, 4),
  poly:12,
  lifetime:region
)

// Reverse texture cloud
audioImpulse(
  path:sfx/textures,
  rate:15,
  jitter:0.7,
  speed:-0.8,
  speedRandom:0.3,
  poly:6,
  lifetime:region
)

// Bird sounds with percentage fades and OSC
audioImpulse(
  path:sfx/birds,
  rate:20,
  jitter:0.6,
  mode:shuffle,
  amp:rand(0.4, 1),
  pan:rand(-1, 1),
  speed:rand(0.1, 2),
  fadein:0.2,
  fadeout:rand("1%", "60%"),
  poly:6,
  lifetime:region,
  uid:birdgroup,
  osc:1,
  oscaddr:"/audio/birds"
)

// Pinned impulse -- stays at playhead for 30 seconds
audioImpulse(
  path:sfx/rain,
  rate:30,
  poly:6,
  lifetime:region,
  pin:30
)

// Slow, sparse process mode (no region exit)
audioImpulse(path:sfx/bells, rate:4, jitter:0.9, poly:3, lifetime:process)
```

---

## See Also

- [audio](../cue_audio/) -- single file playback
- [audioPool](../cue_audioPool/) -- one-shot folder selection
- [audio_shared](../cue_audio_shared/) -- fades, random expressions, waveform, OSC
- [pin](../cue_pin/) -- pin element to playhead
