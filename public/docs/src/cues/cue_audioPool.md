---
title: cue_audioPool
layout: docs_layout.njk
---

# `audioPool(...)` -- One-Shot From a Folder

Builds a pool by scanning a directory on the server. Each trigger selects one file according to the current selection mode and plays it. No filenames are listed manually -- the pool is discovered automatically.

---

## Syntax

```
audioPool(path:sfx/birds, mode:shuffle, amp:rand(0.2,0.8), pan:rand(-1,1))
```

---

## Parameters

| Key | Default | Description |
|-----|---------|-------------|
| `path` (required) | -- | Folder inside project audio directory |
| `glob` | -- | Optional filename filter |
| `format` | `wav` | File extension |
| `mode` | `shuffle` | Selection mode (see below) |
| `amp` | 1 | Gain, or `rand(a, b)` |
| `pan` | 0 | Stereo position, or `rand(-1, 1)` |
| `speed` | 1 | Playback rate, or `rand(a, b)`. Negative = reverse |
| `fade` | 0 | Shorthand for fadeIn + fadeOut |
| `fadein` | 0 | Fade-in (seconds or percentage) |
| `fadeout` | 0 | Fade-out (seconds or percentage) |
| `loop` | 1 | Loop the selected file |
| `poly` | 1 | Max overlapping voices (0=unlimited) |
| `uid` | auto | Pool identity. Multiple cues sharing a uid share a cursor |
| `waveform` | `self` | Waveform display target: `self`, `none`, or element id |
| `overlay` | 2 | Overlay detail level: 0/off, 1/brief, 2/expanded |
| `osc` | 0 | Enable OSC mirroring (1=on) |
| `oscaddr` | `/audio/client/pool` | Custom OSC address |
| `pin` | -- | Pin element to playhead for N seconds (see [pin](../cue_pin/)) |

See [audio_shared](../cue_audio_shared/) for details on fades, random expressions, waveform display, and OSC output.

---

## Selection Modes

| Mode | Behaviour |
|------|-----------|
| `shuffle` | No repeats until the entire pool is exhausted, then reshuffle and start over |
| `rand` | Pure random, repeats possible on consecutive triggers |
| `sequential` | Play files in directory order, wrap around at the end |

---

## Shared Cursor

The selection cursor is persistent and keyed by `uid`. Multiple cue elements sharing the same uid advance through the same sequence together. For example, five rects all with `audioPool(path:"sfx/birds", uid:birdsA, mode:shuffle)` will collectively play through all files before any repeats.

If no `uid` is specified, one is generated automatically from `path` and `glob`.

---

## Speed and Reverse

The `speed` parameter controls playback rate. Negative values play the selected file in reverse using a sample-reversed buffer copy (cached after first use).

```
audioPool(path:sfx/textures, speed:-1, mode:shuffle)
```

With random speed expressions, each hit evaluates independently:

```
audioPool(path:sfx/grain, speed:rand(0.3, 2), mode:rand)
```

---

## Waveform Display

At score load, the waveform of the first pool file is rendered inside the cue element. On each trigger, the waveform shape updates to show the currently selected file -- the polyline redraws to match the new buffer. A cursor line tracks playback progress.

An info text line above the waveform shows the current filename and evaluated parameters (speed, amp, pan, fades). This updates on each trigger.

When `speed` is negative, the waveform contours mirror horizontally and the cursor sweeps right-to-left.

Suppress waveform display with `waveform:none`.

---

## Polyphony

The `poly` parameter limits how many overlapping voices can play simultaneously from this pool. With `poly:1` (default), each trigger stops the previous sound before starting the new one. Higher values allow layering.

Polyphony is enforced per pool (by uid).

---

## Examples

```
// Shuffled one-shots with stereo spread
audioPool(path:sfx/wood, mode:shuffle, pan:rand(-0.8,0.8), poly:5)

// Sequential playback through a folder
audioPool(path:sfx/steps, mode:sequential, amp:0.7)

// Reverse playback from a pool
audioPool(path:sfx/textures, speed:-0.7, mode:shuffle, fade:0.1)

// Full configuration
audioPool(
  path:sfx/birds,
  format:wav,
  mode:shuffle,
  amp:rand(0.2, 0.8),
  pan:rand(-1, 1),
  speed:rand(0.8, 1.2),
  fadein:0.05,
  fadeout:"30%",
  poly:4,
  uid:birdsA,
  osc:1,
  oscaddr:"/audio/pool/birds"
)

// No waveform, pinned to playhead
audioPool(path:sfx/textures, mode:rand, waveform:none, pin:20)
```

---

## See Also

- [audio](../cue_audio/) -- single file playback
- [audioImpulse](../cue_audioImpulse/) -- stochastic repeating process
- [audio_shared](../cue_audio_shared/) -- fades, random expressions, waveform, OSC
- [pin](../cue_pin/) -- pin element to playhead
