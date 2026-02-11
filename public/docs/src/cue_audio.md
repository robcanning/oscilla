---
title: Audio Cues
layout: docs_layout.njk
---

# Audio Cues -- `audio`, `audioPool`, `audioImpulse`

Oscilla's audio system provides three cue types for embedding sound into the score. All three share common parameters for amplitude, panning, pitch, and fades. Pool and impulse share a unified file selection engine.

---

## 1. `audio(...)` -- Play a Single File

The basic building block. Triggers playback of a named audio file when the playhead crosses the cue element.

### Syntax

```
audio(src:kick, amp:0.9, loop:1, fade:0.3, pan:-0.5, pitch:1.2)
```

### Parameters

| Key | Default | Description |
|-----|---------|-------------|
| `src` (required) | -- | Filename or stem (`.wav` auto-appended) |
| `amp` | 1 | Gain, 0--1 |
| `pan` | 0 | Stereo position, -1 (left) to 1 (right) |
| `pitch` | 1 | Playback rate multiplier. <1 slows, >1 speeds up |
| `loop` | 1 | 1=once, N>1 repeats, 0=infinite |
| `fade` | 0 | Shorthand for both fadeIn and fadeOut |
| `fadeIn` | 0 | Fade-in duration (seconds or percentage) |
| `fadeOut` | 0 | Fade-out duration (seconds or percentage) |
| `toggle` | false | Second trigger stops instead of restarting |
| `uid` | src | Playback identity for stop/toggle tracking |
| `waveform` | `self` | Waveform display target: `self`, `none`, or element id |
| `pin` | -- | Pin element to playhead for N seconds (see [pin](../cue_pin/)) |

### File Resolution

Files load from the project `/audio` folder first, falling back to the shared `/audio` directory. Extensions `.wav`, `.ogg`, `.mp3`, `.m4a` are recognised; bare stems default to `.wav`.

### Waveform Display

When `waveform` is not `none`, a waveform visualisation is rendered inside the cue element at score load time. A cursor line tracks playback progress in real time. The waveform shape is drawn from the decoded audio buffer.

### Examples

```
audio(src:drone, loop:0, fade:2)

audio(src:atmosphere, pitch:0.5, loop:0, fadeIn:3, fadeOut:5)

audio(src:click, amp:0.6, toggle:true, uid:metroClick)
```

---

## 2. `audioPool(...)` -- One-Shot From a Folder

Builds a pool by scanning a directory on the server. Each trigger selects one file according to the current selection mode.

### Syntax

```
audioPool(path:sfx/birds, mode:shuffle, amp:rand(0.2, 0.8), pan:rand(-1,1))
```

### Parameters

| Key | Default | Description |
|-----|---------|-------------|
| `path` (required) | -- | Folder inside project audio directory |
| `glob` | -- | Optional filename filter |
| `format` | `wav` | File extension |
| `mode` | `shuffle` | Selection mode (see below) |
| `amp` | 1 | Gain, or `rand(a, b)` |
| `pan` | 0 | Stereo position, or `rand(-1, 1)` |
| `pitch` | 1 | Playback rate, or `rand(a, b)` |
| `fade` | 0 | Shorthand for fadeIn + fadeOut |
| `fadein` | 0 | Fade-in (seconds or percentage) |
| `fadeout` | 0 | Fade-out (seconds or percentage) |
| `loop` | 1 | Loop the selected file |
| `poly` | 1 | Max overlapping voices (0=unlimited) |
| `uid` | auto | Pool identity. Multiple cues with the same uid share a cursor |
| `waveform` | `self` | Waveform display target: `self`, `none`, or element id |
| `osc` | 0 | Enable OSC mirroring (1=on) |
| `oscaddr` | `/audio/client/pool` | Custom OSC address |
| `pin` | -- | Pin element to playhead for N seconds |

### Selection Modes

| Mode | Behaviour |
|------|-----------|
| `shuffle` | No repeats until the entire pool is exhausted, then reshuffle |
| `rand` | Pure random, repeats possible |
| `sequential` | Play files in directory order, wrap around |

The selection cursor is persistent and keyed by `uid`. Multiple cue elements sharing the same uid advance through the same sequence. For example, five rects all with `audioPool(path:"sfx/birds", uid:birdsA, mode:shuffle)` will collectively play through all files before any repeats.

### Waveform Display

At score load, the waveform of the first pool file is rendered. On each trigger, the waveform shape updates to show the currently selected file. A cursor tracks playback.

### Example

```
audioPool(
  path:sfx/birds,
  format:wav,
  mode:shuffle,
  amp:rand(0.2, 0.8),
  pan:rand(-1, 1),
  pitch:rand(0.8, 1.2),
  fadein:0.05,
  fadeout:"30%",
  poly:4,
  uid:birdsA,
  osc:1,
  oscaddr:"/audio/pool/birds"
)
```

---

## 3. `audioImpulse(...)` -- Stochastic Repeating Process

Uses the same pool and selection engine as audioPool, but runs as a continuous process that keeps firing hits autonomously at a configurable rate. Designed for textures, granular clouds, stochastic rhythms, and ambient layers.

### Syntax

```
audioImpulse(path:sfx/rain, rate:30, jitter:0.4, poly:6, lifetime:region)
```

### Timing Parameters

| Key | Default | Description |
|-----|---------|-------------|
| `rate` | 30 | Events per minute |
| `jitter` | 0 | Timing randomisation 0--1 (0=steady clock, 1=fully random) |

### Sound Parameters

Same as audioPool: `amp`, `pan`, `pitch`, `fade`, `fadein`, `fadeout`, `poly`, `loop`.

| Key | Default | Description |
|-----|---------|-------------|
| `poly` | 6 | Max simultaneous voices. Oldest evicted when exceeded |

### Lifetime Modes

| Value | Behaviour |
|-------|-----------|
| `process` | Runs until explicitly stopped |
| `region` | Runs only while the playhead is inside the cue element's bounding box |

In `region` mode, the process starts when the playhead enters the element and stops automatically on exit. A grace period prevents false exits from sub-pixel jitter.

### Selection Modes

Impulse supports the same modes as audioPool via the `mode` parameter: `shuffle`, `rand`, `sequential`. Both use the shared `selectFromPool` engine.

### Waveform Display

A single waveform is rendered once for the element. Each polyphonic hit adds an independent red cursor line that sweeps across the waveform and auto-removes when the hit completes. The poly cap applies to both audio voices and visual cursors.

### OSC Parameters

| Key | Default | Description |
|-----|---------|-------------|
| `osc` | 0 | Enable OSC mirroring (1=on) |
| `oscaddr` | `/oscilla/audio/impulse` | Custom OSC address |

### Full Example

```
audioImpulse(
  path:sfx/rain,
  rate:40,
  jitter:0.4,
  mode:shuffle,
  amp:rand(0.1, 0.5),
  pan:rand(-1, 1),
  pitch:rand(0.5, 2),
  fadein:0.1,
  fadeout:rand("10%", "60%"),
  poly:6,
  lifetime:region,
  uid:rainfall,
  osc:1,
  oscaddr:"/audio/impulse/rain",
  pin:30
)
```

---

## Shared Features

### Fade Values

Fades can be specified in several formats:

| Format | Example | Meaning |
|--------|---------|---------|
| Seconds | `fadeout:0.5` | 0.5 second fade |
| Percentage | `fadeout:"50%"` | 50% of the file's duration |
| Random seconds | `fadeout:rand(0.1, 0.5)` | Random between 0.1--0.5s |
| Random percentage | `fadeout:rand("10%","60%")` | Random between 10--60% of duration |

Percentage fades adjust to each file's actual duration, accounting for pitch changes.

### Random Expressions

Evaluated fresh on every trigger or hit:

```
amp:rand(0.2, 0.9)
pan:rand(-1, 1)
pitch:rand(0.5, 2)
fadeout:rand(0.05, 0.3)
fadeout:rand("10%","50%")
```

Use `irand(a, b)` for integer random values.

### Waveform Display

All three cue types support waveform visualisation rendered as SVG polylines inside the cue element. The `waveform` parameter controls where the waveform appears:

| Value | Behaviour |
|-------|-----------|
| `self` (default) | Render inside the cue element itself |
| `none` | Suppress waveform display |
| `<element_id>` | Render inside a different SVG element |

Waveforms are preloaded at score load time (during `assignCues`). The cursor tracks playback position in real time.

### Pin to Playhead

All audio cues (and any other cue type) accept `pin:N` to keep the element visible at the playhead for N seconds. See [pin](../cue_pin/) for details.

### OSC Output

When `osc:1` is enabled, each audio event sends an OSC message via WebSocket to the server, which forwards it over UDP.

```
/oscilla/audio/pool    sfffff filename amp pan pitch fadeIn fadeOut
/oscilla/audio/impulse sfffff filename amp pan pitch fadeIn fadeOut
/oscilla/audio/trigger sfi    filename volume loop
```

Use `oscaddr` to override the default address.

### Stopping

Audio can be stopped by:

- Toggle mode (`toggle:true`) on second trigger
- Region exit (audioImpulse with `lifetime:region`)
- Programmatic stop: `stopAudioImpulse(uid)`, `stopAllAudio()`
- Transport rewind or stop

---

## Quick Reference

```
// Simple file playback
audio(src:drone, loop:0, fade:2)

// Pitched-down atmosphere
audio(src:atmosphere, pitch:0.5, loop:0, fadeIn:3, fadeOut:5)

// Shuffled one-shots with stereo spread
audioPool(path:sfx/wood, mode:shuffle, pan:rand(-0.8,0.8), poly:5)

// Sequential pool playback
audioPool(path:sfx/steps, mode:sequential, amp:0.7)

// Rainfall texture
audioImpulse(
  path:sfx/rain, rate:30, jitter:0.5,
  amp:rand(0.2,0.6), pan:rand(-1,1), pitch:rand(0.8,1.3),
  fadeout:"40%", lifetime:region, poly:6
)

// Pinned impulse (stays visible at playhead for 30s)
audioImpulse(
  path:sfx/birds, rate:20, poly:6,
  lifetime:region, pin:30
)
```
