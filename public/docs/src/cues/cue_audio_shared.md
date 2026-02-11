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

Percentage fades adjust to each file's actual duration, accounting for pitch changes. The `fade` shorthand applies the same value to both fadeIn and fadeOut. Explicit `fadeIn` / `fadeOut` values override the shorthand.

---

## Random Expressions

Random values are evaluated fresh on every trigger or hit. They can be used for any numeric parameter.

```
amp:rand(0.2, 0.9)         // continuous random float
pan:rand(-1, 1)             // continuous random float
pitch:rand(0.5, 2)          // continuous random float
fadeout:rand(0.05, 0.3)     // random fade in seconds
fadeout:rand("10%", "50%")  // random fade as percentage of duration
```

For integer random values, use `irand(a, b)`:

```
loop:irand(1, 4)            // random integer between 1 and 4
```

Random expressions are objects in the parsed AST (`{ type: "rand", min, max }`) and are resolved at playback time by `evalMaybeRandom()`.

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

**audio:** a static waveform with a single cursor tracking playback.

**audioPool:** waveform shape updates on each trigger to show whichever file was selected. Cursor tracks the current hit.

**audioImpulse:** a single waveform rendered once. Each polyphonic hit adds an independent red sub-cursor. Multiple cursors sweep simultaneously, visually representing the stochastic density. Cursors auto-remove when their hit completes.

---

## Overlays

Audio cues display HTML overlay labels showing the cue type, filename, and parameter values. The `overlay` parameter controls detail level:

| Value | Meaning |
|-------|---------|
| 0 / `off` / `none` | No overlay |
| 1 / `brief` | Minimal: type and filename only |
| 2 / `expanded` (default) | Full: type, filename, amp, pan, pitch, fades |

**audio:** overlay appears on trigger, shows filename and params.

**audioPool:** overlay shows selected filename and evaluated random params. Auto-destroys after 1.5 seconds. Suppressed when waveform is active.

**audioImpulse:** persistent overlay updates on every hit showing current filename and params. Destroys on region exit or stop.

Overlays are positioned at the top-left of the cue element and track its position as the score scrolls.

---

## OSC Output

audioPool and audioImpulse can mirror each audio event as an OSC message to external software. Enable with `osc:1`.

### Message Format

```
/oscilla/audio/pool    sfffff filename amp pan pitch fadeIn fadeOut
/oscilla/audio/impulse sfffff filename amp pan pitch fadeIn fadeOut
/oscilla/audio/trigger sfi    filename volume loop
```

Arguments: filename (string), then amp, pan, pitch, fadeIn, fadeOut (all floats).

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
| audioImpulse | 6 | Oldest voice evicted, oldest cursor removed |

With `poly:0`, there is no limit.

---

## Stopping

Audio playback can be stopped by:

- **Toggle mode:** `audio(src:x, toggle:true)` -- second trigger stops playback
- **Region exit:** audioImpulse with `lifetime:region` stops on playhead exit
- **Transport:** rewind or stop clears all active audio
- **Programmatic:** `stopAllAudio()`, `stopAudioImpulse(uid)`, `stopAllAudioImpulses()`

---

## See Also

- [audio](../cue_audio/) -- single file playback
- [audioPool](../cue_audioPool/) -- one-shot folder selection
- [audioImpulse](../cue_audioImpulse/) -- stochastic repeating process
- [pin](../cue_pin/) -- pin element to playhead
