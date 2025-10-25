# 🔁 Rotation Animation Namespace — `r(...)`

This module defines compact animation syntax for rotating SVG objects in Oscilla.

## 🧩 Base Format

```
r(<mode>)_[modifiers...]
```

## 🎛️ Modes

| Syntax              | Description                           |
|---------------------|---------------------------------------|
| `r(1)`              | Continuous clockwise                  |
| `r(-1)`             | Continuous anticlockwise              |
| `r(0)`              | No rotation                           |
| `r(deg[...])`       | Stepped rotation (manual values)      |
| `r(alt[min,max])`   | Ping-pong rotation between two angles |
| `r(rnd[n])`         | Fixed slice of n random angles        |
| `r(rnd[nx,min,max])`| Looping random slice from range       |
| `r(seq[...])`       | Sequential rotation steps             |

---

## ⚙️ Modifiers

| Modifier         | Values          | Description                                      |
|------------------|------------------|--------------------------------------------------|
| `_rpm(...)`      | number           | Rotations per minute (for continuous)           |
| `_bpm(...)`      | number[,subdiv]  | Tempo-based speed (1 rotation per note)         |
| `_speed(...)`    | seconds          | Step duration (applies to `deg`, `rnd`, `alt`)  |
| `_dur[...]`      | list             | Per-step durations (for `deg`, `rnd`, `seq`)    |
| `_seqdur(...)`   | seconds          | Total time for full sequence                    |
| `_mode(...)`     | `loop`, `bounce` | For `seq[...]` direction control                |
| `_osc(1)`        | boolean          | Enable OSC output of current angle              |
| `_throttle(...)` | Hz               | OSC message rate cap (default: 20Hz)            |
| `_quant(1)`      | boolean          | Quantize animation start to global BPM grid     |
| `_t(1)`          | boolean          | Defer animation until cue triggered             |

---

## 🛠️ Examples

```
r(1)_rpm(30)
r(-1)_bpm(120)
r(deg[0,90,180,270])_speed(1.5)
r(alt[45,135])_bpm(60)_osc(1)
r(rnd[6])_speed(2)
r(rnd[6x,0,360])_speed(0.5)_osc(1)
r(seq[0,120,240])_bpm(90)_mode(bounce)_quant(1)
```

---

## 🧠 Notes

- All angles are interpreted in degrees
- Continuous modes ignore `speed`, `dur`, `seqdur`
- Step-based modes (`deg`, `alt`, `rnd`, `seq`) accept quantized start via `_quant(1)`
- OSC sends `/oscilla/rot` with `{ id, angle, radians, norm }`

---