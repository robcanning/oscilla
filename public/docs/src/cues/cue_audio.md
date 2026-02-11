---
title: cue_audio
layout: docs_layout.njk
---

# `audio(...)` -- Play a Single File

Triggers playback of a named audio file when the playhead crosses the cue element. The basic building block of Oscilla's audio system.

---

## Syntax

```
audio(src:kick, amp:0.9, loop:1, fade:0.3, pan:-0.5, pitch:1.2)
```

---

## Parameters

| Key | Default | Description |
|-----|---------|-------------|
| `src` (required) | -- | Filename or stem (`.wav` auto-appended) |
| `amp` | 1 | Gain, 0--1 |
| `pan` | 0 | Stereo position, -1 (left) to 1 (right) |
| `pitch` | 1 | Playback rate multiplier. <1 slows down, >1 speeds up |
| `loop` | 1 | 1=once, N>1 repeats, 0=infinite |
| `fade` | 0 | Shorthand for both fadeIn and fadeOut |
| `fadeIn` | 0 | Fade-in duration (seconds or percentage) |
| `fadeOut` | 0 | Fade-out duration (seconds or percentage) |
| `toggle` | false | Second trigger stops instead of restarting |
| `uid` | src | Playback identity for stop/toggle tracking |
| `waveform` | `self` | Waveform display target: `self`, `none`, or element id |
| `overlay` | 2 | Overlay detail level: 0/off, 1/brief, 2/expanded |
| `pin` | -- | Pin element to playhead for N seconds (see [pin](../cue_pin/)) |

See [audio_shared](../cue_audio_shared/) for details on fades, random expressions, waveform display, and OSC output.

---

## File Resolution

Files load from the project `/audio` folder first, falling back to the shared `/audio` directory. Extensions `.wav`, `.ogg`, `.mp3`, `.m4a` are recognised. Bare stems without an extension default to `.wav`.

---

## Toggle Mode

With `toggle:true`, the first trigger starts playback and the second trigger stops it. The playback state is tracked by `uid`, so multiple elements sharing the same `uid` act as a single toggle group.

---

## Waveform Display

When `waveform` is not `none`, a waveform visualisation is rendered inside the cue element at score load time. A cursor line tracks playback progress. The waveform shape is drawn from the decoded audio buffer.

Waveforms are preloaded during `assignCues` so they appear immediately when the score loads, not only when the cue fires.

---

## Examples

```
// Simple drone with slow fade
audio(src:drone, loop:0, fade:2)

// Pitched-down atmosphere
audio(src:atmosphere, pitch:0.5, loop:0, fadeIn:3, fadeOut:5)

// Togglable click track
audio(src:click, amp:0.6, toggle:true, uid:metroClick)

// Short percussive hit, no waveform
audio(src:rimshot, amp:0.8, waveform:none)

// Looping pad with percentage fade
audio(src:pad, loop:0, fadeIn:"10%", fadeOut:"30%")

// Pinned for 15 seconds at the playhead
audio(src:long-texture, loop:0, fade:5, pin:15)
```

---

## See Also

- [audioPool](../cue_audioPool/) -- one-shot selection from a folder
- [audioImpulse](../cue_audioImpulse/) -- stochastic repeating process
- [audio_shared](../cue_audio_shared/) -- fades, random expressions, waveform, OSC
- [pin](../cue_pin/) -- pin element to playhead
