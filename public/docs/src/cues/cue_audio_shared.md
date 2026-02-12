---
title: Audio Shared Features
layout: docs_layout.njk
---

# Audio Shared Features

Features common to all three audio cue types: [audio](../cue_audio/), [audioPool](../cue_audioPool/), and [audioImpulse](../cue_audioImpulse/).

---

## Fade Values

Fades can be specified in several formats. All three cue types support `fade`, `fadeIn` / `fadein`, and `fadeOut` / `fadeout`.

| Format | Example | Meaning |
|--------|---------|---------|
| Seconds | `fadeout:0.5` | Fixed 0.5 second fade |
| Percentage | `fadeout:"50%"` | 50% of the file's duration |
| Random seconds | `fadeout:rand(0.1, 0.5)` | Random value between 0.1 and 0.5 seconds |
| Random percentage | `fadeout:rand("10%","60%")` | Random between 10% and 60% of duration |

Percentage fades adjust to each file's actual duration, accounting for speed changes. The `fade` shorthand applies the same value to both fadeIn and fadeOut. Explicit `fadeIn` / `fadeOut` values override the shorthand.

---

## Random Expressions

Random values are evaluated fresh on every trigger or hit. They can be used for any numeric parameter.

```
amp:rand(0.2, 0.9)         // continuous random float
pan:rand(-1, 1)             // continuous random float
speed:rand(0.5, 2)          // continuous random float
fadeout:rand(0.05, 0.3)     // random fade in seconds
fadeout:rand("10%", "50%")  // random fade as percentage of duration
```

For integer random values, use `irand(a, b)`:

```
loop:irand(1, 4)            // random integer between 1 and 4
```

Random expressions are objects in the parsed AST (`{ type: "rand", min, max }`) and are resolved at playback time by `evalMaybeRandom()`.

---

## Speed and Reverse Playback

All three cue types use the `speed` parameter to control playback rate. Negative values play audio in reverse.

| Value | Effect |
|-------|--------|
| `speed:1` | Normal playback |
| `speed:0.5` | Half speed (lower pitch) |
| `speed:2` | Double speed (higher pitch) |
| `speed:-1` | Reverse at normal speed |
| `speed:-0.5` | Reverse at half speed |

### Reverse Buffer

Web Audio API does not support negative `playbackRate`. Instead, Oscilla creates a sample-reversed copy of the audio buffer and plays it forward at the absolute speed value. Reversed buffers are cached by filename so the reversal only happens once per file.

### Waveform Mirroring

When speed is negative, the waveform display mirrors horizontally via SVG transform. The base contour, all peak layers, and cursor direction all update to reflect the reversed playback. The cursor sweeps right-to-left.

---

## In/Out Points

`audio(...)` supports `in` and `out` parameters to loop a subsection of a file:

```
audio(src:longfile, in:2, out:8, loop:0)
```

This plays only seconds 2--8 of the buffer. The segment is passed to the Web Audio `BufferSource.start(when, offset, duration)` call. In/out points work with both forward and reverse playback -- when speed is negative, the offset is flipped to the corresponding position in the reversed buffer.

---

## Selection Modes

audioPool and audioImpulse both select files from a directory using the shared `selectFromPool` engine. The `mode` parameter controls selection behaviour:

| Mode | Behaviour |
|------|-----------|
| `shuffle` (default) | Walk through the pool without repeats. When all files have played, reshuffle and start over |
| `rand` | Pure random selection. Consecutive repeats are possible |
| `sequential` | Play files in directory order. Wrap around at the end without reshuffling |

The selection cursor is persistent and keyed by `uid`. Multiple cue elements sharing the same uid advance through the same sequence. This means scatter several audioPool rects across the score with the same uid and they collectively exhaust the pool before any file repeats.

---

## Waveform Display

All three cue types render a waveform visualisation inside the cue element. The `waveform` parameter controls where:

| Value | Behaviour |
|-------|-----------|
| `self` (default) | Render inside the cue element itself |
| `none` | Suppress waveform display entirely |
| `<element_id>` | Render inside a different SVG element by id |

Waveforms are preloaded at score load time during `assignCues`. They appear immediately, not only when the cue fires.

### Per-Cue Behaviour

**audio:** A static waveform with a single cursor tracking playback. Info text shows current filename and parameters.

**audioPool:** Waveform shape updates on each trigger to show whichever file was selected. Cursor tracks the current hit. Info text updates to reflect the newly selected file and its evaluated random parameters.

**audioImpulse:** A single base waveform rendered once. Each polyphonic hit adds its own peak layer and cursor (see Multi-Cursor Display below).

### Info Text

A text line is rendered above the waveform peaks showing current parameter values: filename, amp, speed, pan, loop count, fades, and in/out points. This text updates in real time during live console parameter changes, reflecting the current state of the running voice.

### Reverse Direction

When speed is negative, `setWaveformDirection(handle, true)` applies a horizontal mirror transform (`scale(-1,1)`) to the base contour and all peak layers. Cursors are not transformed -- instead, the cursor animation code computes right-to-left position directly from the negative speed value.

### Waveform Reconnection

When a voice finishes and is later restarted from the live console (which has no cue element context), the new voice reconnects to the existing waveform SVG via `getWaveform(uid)`. The waveform element persists in the score after cleanup, so the cursor and info text resume on the existing element.

---

## Multi-Cursor Display (audioImpulse)

audioImpulse uses a layered waveform display where each polyphonic voice gets its own visual representation.

### Peak Layers

Each active voice draws a coloured waveform contour (upper and lower polylines) layered on top of the base waveform. Colours are assigned automatically from a 12-colour palette. Layers are added via `addPeakLayer` when a hit starts and removed when the voice completes.

If the waveform direction is currently reversed (negative speed), new peak layers are automatically given the same horizontal mirror transform as the base contour.

### Preview Layers

Before any live hits fire, three random files from the pool are rendered as preview peak layers at reduced opacity. This gives a visual sense of the pool content at score load time. Preview layers are cleared on the first live hit.

### Cursors

Each voice gets an independent cursor line that sweeps across the waveform tracking playback position. Cursor colour matches its peak layer colour. Cursors auto-remove when their voice completes.

With `poly:6`, up to six cursors and six peak layers can be visible simultaneously, creating a dense visual representation of the stochastic texture.

---

## Overlays

Audio cues display HTML overlay labels showing the cue type, filename, and parameter values. The `overlay` parameter controls detail level:

| Value | Meaning |
|-------|---------|
| 0 / `off` / `none` | No overlay |
| 1 / `brief` | Minimal: type and filename only |
| 2 / `expanded` (default) | Full: type, filename, amp, pan, speed, fades |

**audio:** Overlay appears on trigger, shows filename and params.

**audioPool:** Overlay shows selected filename and evaluated random params. Auto-destroys after 1.5 seconds. Suppressed when waveform is active (since the waveform info text already shows the same information).

**audioImpulse:** Persistent overlay updates on every hit showing current filename and params. Destroys on region exit or stop.

Overlays are positioned at the top-left of the cue element and track its position as the score scrolls.

---

## Live Console Hot-Update

Running audio cues can be modified in real time from the live console. Retrigger with the same `uid` to update parameters on a playing voice without restarting playback.

### How It Works

When the audio handler detects that a voice with the given uid is already playing and has an `update()` method, it calls `update(params)` instead of stopping and restarting. The `update` method splits parameters into immediate and deferred categories.

### Immediate (50ms ramp)

| Parameter | Behaviour |
|-----------|-----------|
| `amp` | `gainNode.gain.linearRampToValueAtTime` |
| `pan` | `panNode.pan.linearRampToValueAtTime` (creates StereoPannerNode on the fly if needed) |
| `speed` | `srcNode.playbackRate.linearRampToValueAtTime` (same direction only) |

### Deferred (next loop iteration)

| Parameter | Behaviour |
|-----------|-----------|
| `fadeIn`, `fadeOut` | New envelope applied when `playOne` creates the next BufferSource |
| `in`, `out` | New segment boundaries passed to `start(when, offset, duration)` |
| `src` | Async fetch + decode of the new file; swaps buffer when ready |
| `speed` (direction change) | Buffer swap between forward/reversed copy on next loop |

### Loop Control

| Value | Effect |
|-------|--------|
| `loop:1` | Finish after the current iteration |
| `loop:N` | Play N more iterations, with fadeOut on the final one |
| `loop:0` | Switch to infinite looping |

The `remaining` counter is decremented on each `onended` event. When it reaches zero, the voice cleans up.

---

## OSC Output

audioPool and audioImpulse can mirror each audio event as an OSC message to external software. Enable with `osc:1`.

### Message Format

```
/oscilla/audio/pool    sfffff filename amp pan speed fadeIn fadeOut
/oscilla/audio/impulse sfffff filename amp pan speed fadeIn fadeOut
/oscilla/audio/trigger sfi    filename volume loop
```

Arguments: filename (string), then amp, pan, speed, fadeIn, fadeOut (all floats).

### Custom Address

Use `oscaddr` to specify a custom path. The address is prefixed with `/oscilla/`:

```
audioImpulse(path:sfx, osc:1, oscaddr:"/myapp/texture/rain")
// sends to /oscilla/myapp/texture/rain
```

### Signal Flow

```
audio handler -> sendOSC() -> WebSocket -> server.js -> osc-js UDP -> external
```

---

## Pin to Playhead

All audio cues accept `pin:N` to keep the element visible at the playhead position for N seconds. This is especially useful for audioImpulse where the waveform and cursors would otherwise scroll off-screen while the process is still active.

```
audioImpulse(path:sfx/rain, rate:30, poly:6, lifetime:region, pin:30)
```

See [pin](../cue_pin/) for full details on the pin lifecycle.

---

## Polyphony

audioPool and audioImpulse support the `poly` parameter to limit simultaneous overlapping voices.

| Cue Type | Default | Behaviour when exceeded |
|----------|---------|------------------------|
| audioPool | 1 | Previous sound stops before new one starts |
| audioImpulse | 6 | New hit skipped until a voice slot opens up |

With `poly:0`, there is no limit.

Voice counting for audioImpulse is done by scanning `window.activeAudioCues` for keys matching the impulse uid prefix. When at the poly limit, the hit is skipped and the scheduling timer continues -- the next interval will try again once a voice has freed up.

Waveform cursors are also limited to the poly count. When at the cursor limit, the oldest cursor is evicted from the display.

---

## Stopping

Audio playback can be stopped by:

- **Toggle mode:** `audio(src:x, toggle:true)` -- second trigger stops playback
- **Loop control:** `audio(src:x, loop:1, uid:x)` via live console -- finish after current iteration
- **Region exit:** audioImpulse with `lifetime:region` stops on playhead exit
- **Transport:** rewind or stop clears all active audio
- **Programmatic:** `stopAllAudio()`, `stopAudioImpulse(uid)`, `stopAllAudioImpulses()`

On stop, all active voices fade out, all waveform cursors are removed, and all peak layers are cleared.

---

## See Also

- [audio](../cue_audio/) -- single file playback
- [audioPool](../cue_audioPool/) -- one-shot folder selection
- [audioImpulse](../cue_audioImpulse/) -- stochastic repeating process
- [pin](../cue_pin/) -- pin element to playhead
