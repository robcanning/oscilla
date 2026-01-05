# Audio Cues — `audio`, `audioPool`, `audioImpulse`

Oscilla's audio system provides three related cue types:

- **audio(...)** — play a specific file
- **audioPool(...)** — select one file from a discovered folder
- **audioImpulse(...)** — stochastic repeated triggering from a pool

All cues use generic `key:value` parameter syntax.

---

## 1. `audio(...)` — Play a Single File

Lowest-level audio playback building block.

### Example

```
audio(src:kick, amp:0.9, loop:1, fade:0.3, pan:-0.5, pitch:1.2)
```

### Parameters

| Key | Meaning |
|-----|---------|
| `src` (required) | filename/stem, `.wav` auto-added |
| `amp` | gain 0–1 (default 1) |
| `pan` | stereo position -1 (left) to 1 (right), default 0 |
| `pitch` | playback rate multiplier (default 1). Values < 1 slow down, > 1 speed up |
| `loop` | 1=once, N>1 repeats, 0=infinite |
| `fade` | applies to both fadeIn and fadeOut |
| `fadeIn` | fade-in seconds or percentage (e.g. `"20%"`) |
| `fadeOut` | fade-out seconds or percentage (e.g. `"50%"`) |
| `toggle` | second trigger stops instead of restarting |
| `uid` | playback identity (default = src) |

Files load from the project `/audio` folder, falling back to shared `/audio`.

Playback state is tracked so UI and buttons can reflect on/off.

---

## 2. `audioPool(...)` — One-Shot Selection From a Folder

A pool is built dynamically by scanning a folder — you never list filenames manually.

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

### Behaviour

- Server enumerates files in `path:`
- Every trigger selects **one** file
- Optional randomisation per trigger
- Overlays show filename and evaluated params (amp, pan, pitch)
- Optional OSC mirror sends each hit to external software

### Parameters

| Key | Meaning |
|-----|---------|
| `path` (required) | folder inside project audio |
| `glob` | optional filter hint |
| `format` | extension (default `wav`) |
| `mode` | `shuffle` (no repeat until exhausted) or `rand` (pure random) |
| `amp` | number or `rand(a, b)` |
| `pan` | stereo -1 to 1, or `rand(-1, 1)` |
| `pitch` | playback rate, or `rand(a, b)` |
| `fadein` | seconds or percentage string |
| `fadeout` | seconds or percentage string |
| `fade` | shorthand for both fadein and fadeout |
| `loop` | loop the selected file |
| `poly` | overlapping voices (default 1, 0=unlimited) |
| `uid` | identity of this pool |
| `osc` | enable OSC mirroring (1=on) |
| `oscaddr` | custom OSC address |

Polyphony applies **per pool**.

---

## 3. `audioImpulse(...)` — Stochastic Repeating Process

Uses the same pool logic, but runs autonomously and keeps firing hits at a configurable rate.

### Example

```
audioImpulse(
  path:sfx/rain,
  rate:40,
  jitter:0.4,
  amp:rand(0.1, 0.5),
  pan:rand(-1, 1),
  pitch:rand(0.5, 2),
  fadein:0.1,
  fadeout:rand("10%", "60%"),
  poly:6,
  lifetime:region,
  uid:rainfall,
  osc:1,
  oscaddr:"/audio/impulse/rain"
)
```

### Timing Parameters

| Key | Meaning |
|-----|---------|
| `rate` | events per minute |
| `jitter` | timing randomisation 0–1 (0=steady, 1=fully random) |
| `poly` | overlapping voices (default 6, 0=unlimited) |

### Sound Parameters

| Key | Meaning |
|-----|---------|
| `amp` | gain 0–1, or `rand(a, b)` |
| `pan` | stereo -1 to 1, or `rand(-1, 1)` |
| `pitch` | playback rate, or `rand(a, b)` |
| `fadein` | seconds or percentage |
| `fadeout` | seconds or percentage |
| `fade` | shorthand for both |

### Lifetime Modes

| Value | Behaviour |
|-------|-----------|
| `process` | runs until explicitly stopped |
| `region` | runs only while playhead is inside the cue element |

In region mode, overlays update live and disappear when leaving the region.

### OSC Parameters

| Key | Meaning |
|-----|---------|
| `osc` | enable OSC mirroring (1=on) |
| `oscaddr` | custom OSC address (default `/oscilla/audio/impulse`) |

---

## Fade Values

Fades can be specified as:

| Format | Example | Meaning |
|--------|---------|---------|
| Seconds | `fadeout:0.5` | 0.5 second fade |
| Percentage | `fadeout:"50%"` | 50% of the file's duration |
| Random seconds | `fadeout:rand(0.1, 0.5)` | random between 0.1–0.5 seconds |
| Random percentage | `fadeout:rand("10%", "60%")` | random between 10%–60% of duration |

Percentage-based fades automatically adjust to each file's actual duration (accounting for pitch changes).

---

## Random Expressions

Evaluated **per hit**:

```
amp:rand(0.2, 0.9)       // random amplitude
pan:rand(-1, 1)          // random stereo position
pitch:rand(0.5, 2)       // random playback speed
fadeout:rand(0.05, 0.3)  // random fade in seconds
fadeout:rand("10%","50%") // random fade as percentage
```

For integer random values, use `irand(a, b)`.

---

## OSC Output

When `osc:1` is enabled, each audio hit sends an OSC message.

### Message Format

```
/oscilla/audio/impulse sfffff filename amp pan pitch fadeIn fadeOut
/oscilla/audio/pool    sfffff filename amp pan pitch fadeIn fadeOut
```

### Custom Address

Use `oscaddr` to specify a custom OSC path:

```
audioImpulse(path:sfx, osc:1, oscaddr:"/myapp/texture/rain")
```

This sends to `/oscilla/myapp/texture/rain`.

### Example OSC Output

```
/oscilla/audio/impulse/x1 sfffff "sfx/birdgone.wav" 0.45 -0.32 1.2 0.2 0.8
```

Arguments: `filename (string)`, `amp`, `pan`, `pitch`, `fadeIn`, `fadeOut` (all floats)

---

## Stopping

- Internal stop on fade completion or toggle
- Region exit automatically cleans up the process
- Programmatic helpers:
  - `stopAudioImpulse(uid)` — stop a specific impulse process
  - `stopAllAudio()` — stop all audio playback

---

## Visual Overlays

Audio cues display overlays showing:

- **audioPool**: filename and params, auto-destroys after 1.5s
- **audioImpulse**: persistent overlay showing current file, amp, pan, pitch — updates each hit, destroys on region exit

---

## Quick Examples

```
// Simple drone with slow fade
audio(src:drone, loop:0, fade:2)

// Percussive one-shots with stereo spread
audioPool(path:sfx/wood, mode:shuffle, pan:rand(-0.8, 0.8), poly:5)

// Pitched-down atmosphere
audio(src:atmosphere, pitch:0.5, loop:0, fadeIn:3, fadeOut:5)

// Rainfall texture inside a passage with OSC output
audioImpulse(
  path:sfx/rain,
  rate:30,
  jitter:0.5,
  amp:rand(0.2, 0.6),
  pan:rand(-1, 1),
  pitch:rand(0.8, 1.3),
  fadeout:"40%",
  lifetime:region,
  osc:1,
  oscaddr:"/texture/rain"
)

// Bird sounds with percentage-based random fades
audioImpulse(
  path:sfx/birds,
  rate:20,
  amp:rand(0.4, 1),
  pan:rand(-1, 1),
  pitch:rand(0.1, 2),
  fadein:0.2,
  fadeout:rand("1%", "60%"),
  lifetime:region,
  uid:birdgroup,
  osc:1,
  oscaddr:"/audio/birds"
)
```
