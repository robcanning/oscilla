
# `cue_osc` — Send OSC Messages to External Audio Engines

The `cue_osc(...)` cue sends Open Sound Control (OSC) messages from the browser to a server, which forwards them to connected software like **SuperCollider**, **Pure Data (Pd)**, or **Max/MSP**.

---

## 🔤 Syntax Overview

Each cue type is defined by its subtype and arguments:

```txt
cue_osc_trigger(1)
cue_osc_random(0.4,1.2)
cue_osc_pulse(4,3)
cue_osc_burst(5,250)
cue_osc_value(0.67)
cue_osc_set(speed,1.5)
```

---

## ✅ Supported Subtypes and Use Cases

### 🎯 `cue_osc_trigger(n)`
Sends a basic integer-based cue trigger.

**Example:**
```txt
cue_osc_trigger(7)
```

**OSC Message Sent:**
```json
{ "type": "osc", "subType": "trigger", "data": 7, "timestamp": 1746516000000 }
```

**Usage:**
- Start a buffer in SuperCollider or Pd
- Trigger a visual or cue marker

---

### 🎲 `cue_osc_random(min,max)`
Sends a random number between two bounds.

**Example:**
```txt
cue_osc_random(0.4, 1.2)
```

**OSC Message Sent:**
```json
{ "type": "osc", "subType": "random", "data": { "min": 0.4, "max": 1.2 }, "timestamp": 1746516000123 }
```

**Usage:**
- Modulate parameters like filter Q, rate, density
- Feed into a generative music system

---

### 🕒 `cue_osc_pulse(rate,duration)`
Instructs the audio engine to generate a rhythmic pulse.

**Example:**
```txt
cue_osc_pulse(5, 4)
```

**OSC Message Sent:**
```json
{ "type": "osc", "subType": "pulse", "data": { "rate": 5, "duration": 4 }, "timestamp": 1746516000456 }
```

**Usage:**
- Trigger grain clouds
- Create tremolo or panning effects
- Drive a visual flicker

---

### 💥 `cue_osc_burst(count,interval)`
Triggers a burst of messages spaced by `interval` milliseconds.

**Example:**
```txt
cue_osc_burst(6, 200)
```

**OSC Message Sent:**
```json
{ "type": "osc", "subType": "burst", "data": { "count": 6, "interval": 200 }, "timestamp": 1746516000890 }
```

**Usage:**
- Fire events for percussion hits or light flashes
- Manual step sequencer triggers

---

### 📏 `cue_osc_value(x)`
Sends a scalar value (float or int).

**Example:**
```txt
cue_osc_value(0.7)
```

**OSC Message Sent:**
```json
{ "type": "osc", "subType": "value", "data": 0.7, "timestamp": 1746516001300 }
```

**Usage:**
- Set a parameter value: e.g. gain, modulation depth

---

### 🧩 `cue_osc_set(key,value)`
Sends a key/value map.

**Example:**
```txt
cue_osc_set(speed,1.5)
```

**OSC Message Sent:**
```json
{ "type": "osc", "subType": "set", "data": { "speed": 1.5 }, "timestamp": 1746516001450 }
```

**Usage:**
- Set named parameters in Pd/SC (e.g. `/osc/set speed 1.5`)

---

## 🧪 Advanced OSC Output: `o2p` Animations

More expressive, real-time OSC control is possible using `o2p` (object-to-path) animation logic.

- Outputs OSC continuously as objects move
- Great for position-based panning, gestures, envelopes
- See [`osc-o2p.md`](osc-o2p.md) for syntax and examples

---

## 🛠️ Monitoring OSC Traffic

- View outgoing OSC messages in the **server logs** or **GUI dashboard**
- Port numbers and connection status are also displayed

---

## 🧩 Related Cues

- [`cue_audio`](cue_audio.md) — browser-based or OSC-triggered audio playback
- [`cue_traverse`](cue_traverse.md) — point-to-point animation
- [`cue_choice`](cue_choice.md) — form branching
- [`cue_stop`](cue_stop.md) — halts score playback
