# `cueOsc*` — Send OSC Messages to External Audio Engines

The `cueOsc*` family of cues sends Open Sound Control (OSC) messages from the browser to the oscillaScore server, which forwards them to connected software like **SuperCollider**, **Pure Data (Pd)**, or **Max/MSP**.

---

## 🔤 Syntax Overview

Each cue uses camelCase format and defines a sub-type of OSC action:

```txt
cueOscTrigger(1)
cueOscRandom(0.4, 1.2)
cueOscPulse(rate: 4, duration: 3)
cueOscBurst(count: 5, interval: 250)
cueOscValue(0.67)
cueOscSet(speed, 1.5)
```

Optional suffix:
```txt
cueOscSet(speed, 1.5)_addr(synths/myEngine)
```

---

## ✅ Supported OSC Cue Types

### 🎯 `cueOscTrigger(value)`
Send a basic integer or float trigger.

### 📏 `cueOscValue(value)`
Send a single scalar float or integer.

### 🧩 `cueOscSet(param, value)`
Send a named parameter. Example:
```txt
cueOscSet(filterFreq, 880)
```

### 🎲 `cueOscRandom(min, max)`
Send a random float between bounds.

### 💥 `cueOscBurst(count, interval)`
Send a timed burst of messages (handled client-side). Sends `count` messages spaced by `interval` milliseconds.

### 🕒 `cueOscPulse(rate, duration)`
Send a rhythmic stream of OSC messages for `duration` seconds at `rate` Hz.

---

## 📬 Routing with `_addr(...)`

All `cueOsc*` cues can include an `_addr(...)` suffix to target a custom OSC address:

```xml
<circle id="cueOscSet(speed, 1.5)_addr(synths/drumEngine)" />
```

This will emit:
```json
{
  "type": "osc",
  "subType": "set",
  "address": "synths/drumEngine",
  "data": { "speed": 1.5 }
}
```

Default address is `/oscilla` if none is given.

---

## 🛠 Dynamic Assignment via `assignCues(...)`

You can assign a group of randomized OSC cues using:

```xml
<g id="assignCues(cueOscTrigger(rnd[1,9]))">
```

Supported patterns:
- `rnd[min,max]` — random number
- `ypos[min,max]` — map Y-position within group to value

Used by the `assignCues(svgRoot)` function in `app.js`.

---

## 🧪 Continuous OSC via `o2p(...)`

For path-following OSC animation, use:

```xml
<circle id="o2p(path-id)_osc(1)" />
```

See `osc-o2p.md` for advanced OSC modulation via animation.

---

## 🧩 Related Cues

- [`cueAudio(...)`](cue_audio.md)
- [`cueTraverse(...)`](cue_traverse.md)
- [`cueChoice(...)`](cue_choice.md)
- [`cuePause(...)`](cue_pause.md)

For a full list, see [`cueSystem.md`](cueSystem.md)
