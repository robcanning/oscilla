
# `cue_osc` — Trigger OSC Messages to External Audio Engines

The `cue_osc(...)` cue sends an Open Sound Control (OSC) message from the browser client to the server, which then forwards it to connected software like **SuperCollider**, **Pure Data (Pd)**, **Max/MSP**, or other OSC-compatible environments.

---

## 🔤 Syntax

```
cue_osc_trigger(01)
```

- `trigger` is the OSC message type
- `(01)` is the cue number or identifier to send over OSC
- The cue number is extracted as an integer from the cue ID

---

## ✅ Typical Use Cases

- 🎧 Trigger multichannel audio playback
- 🌀 Activate spatialization algorithms or effects
- 🎛️ Control synth parameters, reverb, granulation, or visual sync
- 🎬 Cue visuals or lighting in other software

---

## 🧠 Example Workflow

In SuperCollider:

```supercollider
OSCdef.new(
  \cueTrigger,
  { |msg| 
    var cueNum = msg[1];
    ("Received OSC cue " ++ cueNum).postln;
    // Add audio logic here
  },
  '/osc/trigger'
)
```

---

## 🛠️ Server-Side Behavior

When a `cue_osc(...)` is triggered:

1. Cue ID is parsed (e.g. `cue_osc_trigger(03)`)
2. Number `03` is extracted and sent to the server
3. Server sends:
   ```json
   {
     "type": "osc",
     "subType": "trigger",
     "data": 3,
     "timestamp": 1746516888000
   }
   ```

---

## 🪵 Viewing OSC Traffic

- View OSC **in/out ports** in:
  - Server logs
  - Electron GUI or Web GUI
- Messages show with timestamps and structure

---

## 🔁 Advanced OSC Output: `o2p` (Object-to-Path) Animations

More expressive and continuous OSC output can be achieved using **`o2p` animation objects**, which emit OSC messages as objects move along SVG paths.

- Position, speed, and timing can be mapped to OSC parameters
- Ideal for real-time control of synths, spatialization, or visuals
- See [`osc-o2p.md`](osc-o2p.md) for details

---

## 🚧 TODO: Future OSC Cue Types

The following are **not yet implemented** but represent musically useful extensions:

### `cue_osc_random(min,max)`
- Sends a float or int randomly between two bounds
- Example: `cue_osc_random(0.4,1.2)`

### `cue_osc_pulse(rate,duration)`
- Sends a pulse stream at `rate` Hz for `duration` seconds
- Example: `cue_osc_pulse(5,4)` → 5Hz for 4s

### `cue_osc_burst(count,interval)`
- Sends `count` triggers, `interval` ms apart
- Example: `cue_osc_burst(6,200)`

### `cue_osc_value(x)`
- Sends a fixed value (e.g., `cue_osc_value(0.7)`)

### `cue_osc_set(param,value)`
- Sends key-value pair (e.g., `cue_osc_set(pitch,64)`)

These would allow greater nuance in triggering real-time electronics while keeping complexity out of the browser.

---

## 🧩 Related

- [`cue_audio(...)`](cue_audio.md) — local/OSC-triggered audio
- [`cue_traverse(...)`](cue_traverse.md) — point-based movement
- [`cue_pause(...)`](cue_pause.md) — visual or logic pauses in score
