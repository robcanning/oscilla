---
title: cue_audio
layout: docs_layout.njk
---

# `audio(...)` -- Play a Single File

Triggers playback of a named audio file when the playhead crosses the cue element. The basic building block of Oscilla's audio system.

---

## Syntax

```
audio(src:kick, amp:0.9, loop:1, fade:0.3, pan:-0.5, speed:1.2)
```

---

## Parameters

| Key | Default | Description |
|-----|---------|-------------|
| `src` (required) | -- | Filename or stem (`.wav` auto-appended) |
| `amp` | 1 | Gain, 0--1 |
| `pan` | 0 | Stereo position, -1 (left) to 1 (right) |
| `speed` | 1 | Playback rate multiplier. Negative values play in reverse |
| `loop` | 1 | 1=once, N>1 repeats, 0=infinite |
| `fade` | 0 | Shorthand for both fadeIn and fadeOut |
| `fadeIn` | 0 | Fade-in duration (seconds or percentage) |
| `fadeOut` | 0 | Fade-out duration (seconds or percentage) |
| `in` | 0 | Start offset in seconds |
| `out` | 0 | End point in seconds (0 = full file) |
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

## Speed and Reverse Playback

The `speed` parameter controls both playback rate and direction:

| Value | Effect |
|-------|--------|
| `speed:1` | Normal playback |
| `speed:0.5` | Half speed (lower pitch) |
| `speed:2` | Double speed (higher pitch) |
| `speed:-1` | Reverse at normal speed |
| `speed:-0.5` | Reverse at half speed |

Reverse playback uses a sample-reversed buffer copy (cached after first use). The waveform display mirrors horizontally and the cursor moves right-to-left.

---

## In/Out Points

Loop a subsection of a file by specifying start and end positions in seconds:

```
audio(src:longfile, in:2, out:8, loop:0)
```

This loops seconds 2--8 of the file. In/out points work with both forward and reverse playback. When `speed` is negative, the segment plays backwards.

In/out points are deferred during live update -- they take effect on the next loop iteration.

---

## Toggle Mode

With `toggle:true`, the first trigger starts playback and the second trigger stops it. The playback state is tracked by `uid`, so multiple elements sharing the same `uid` act as a single toggle group.

---

## Waveform Display

When `waveform` is not `none`, a waveform visualisation is rendered inside the cue element at score load time. A cursor line tracks playback progress. The waveform shape is drawn from the decoded audio buffer.

Waveforms are preloaded during `assignCues` so they appear immediately when the score loads, not only when the cue fires.

An info text line above the waveform peaks shows current parameter values (filename, amp, speed, pan, loop, fades, in/out). This text updates in real time during live console changes.

When reverse playback is active, the waveform contours mirror horizontally via SVG transform and the cursor sweeps right-to-left.

---

## Live Console Hot-Update

Running audio cues can be modified in real time from the live console. Retrigger with the same `uid` to update parameters without restarting playback. If a voice with that uid is already playing, the `update()` method is called instead of stop-and-restart.

### Immediate Parameters

These take effect within 50ms via smooth Web Audio ramps on the running nodes:

| Parameter | Behaviour |
|-----------|-----------|
| `amp` | Gain ramp on the GainNode |
| `pan` | Stereo position ramp on the StereoPannerNode (created on the fly if needed) |
| `speed` | Playback rate ramp (same direction only) |

### Deferred Parameters

These take effect on the next loop iteration when `playOne` creates a fresh BufferSource:

| Parameter | Behaviour |
|-----------|-----------|
| `fadeIn`, `fadeOut` | New envelope values |
| `in`, `out` | New segment boundaries |
| `src` | Async fetch + decode of the new file; swaps buffer on next loop |
| `speed` (direction change) | Swaps between forward/reversed buffer on next loop |

### Loop Control

The `loop` parameter can be changed while playing:

| Value | Effect |
|-------|--------|
| `loop:1` | Finish after the current iteration |
| `loop:3` | Play 3 more iterations then stop |
| `loop:0` | Switch to infinite looping |

### Waveform Reconnection

When a voice finishes and is later restarted from the live console (which has no cue element), the new voice reconnects to the existing waveform SVG via `getWaveform(uid)`. The cursor and info text resume as normal.

### Example Workflow

```
// Start an infinite drone
audio(src:drone, loop:0, uid:myDrone)

// Drop the speed live
audio(src:drone, speed:0.5, uid:myDrone)

// Loop just seconds 2--8
audio(src:drone, in:2, out:8, uid:myDrone)

// Swap to a different file on next loop
audio(src:other, uid:myDrone)

// Reverse playback on next loop
audio(src:drone, speed:-1, uid:myDrone)

// Finish after current iteration
audio(src:drone, loop:1, uid:myDrone)
```

---

## Examples

```
// Simple drone with slow fade
audio(src:drone, loop:0, fade:2)

// Slowed-down atmosphere
audio(src:atmosphere, speed:0.5, loop:0, fadeIn:3, fadeOut:5)

// Reverse playback with fade
audio(src:texture, speed:-1, loop:0, fadeIn:2)

// Loop a section of a file
audio(src:longfile, in:4.5, out:12, loop:0, speed:0.8)

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
