# Cue System Overview (oscillaScore)

The cue system in oscillaScore is based on SVG object IDs that trigger actions when intersected by the playhead. Each cue follows a standardized naming convention and is handled by a registered cue handler.

## ✅ Cue Format

Cues use the format:
```
cueType(param1: value1, param2: value2)
```
Or for simple cases:
```
cueType(value)
```
Anonymous parameters are assigned as `choice` internally.

## 🧩 Supported Cue Types

| Cue Type         | Purpose                                             |
|------------------|------------------------------------------------------|
| `cuePause`       | Pause score playback, optionally show countdown     |
| `cueStop`        | Halt playback completely                            |
| `cueAudio`       | Play browser-based or OSC audio                     |
| `cueVideo`       | Trigger a video element                             |
| `cueAnimation`   | Trigger a fullscreen animation                      |
| `cueAnimejs`     | Load an inline SVG-based animation                  |
| `cueChoice`      | Fullscreen branching choice (clickable SVGs)        |
| `cueRepeat`      | Repeat from cue A to cue B for X times              |
| `cueTraverse`    | Move an object along SVG points                     |
| `cueP5`          | Load a P5.js sketch                                 |
| `cueOscTrigger`  | Send OSC integer trigger                            |
| `cueOscValue`    | Send OSC float/int value                            |
| `cueOscSet`      | Send OSC key-value pair                             |
| `cueOscRandom`   | Send OSC random value in range                      |
| `cueOscPulse`    | Send repeating OSC pulses                           |
| `cueOscBurst`    | Send burst of OSC messages                          |

See specific cue documentation files like `cue_audio.md`, `cue_pause.md`, `cue_osc.md`, etc. for details.

## 🛠 Dynamic Cue Assignment with `assignCues(...)`

To assign cue IDs programmatically within a group of SVG objects:
```xml
<g id="assignCues(cueOscTrigger(rnd[1,9]))">
```
This will assign each child a `cueOscTrigger(value)` ID using randomized or vertically mapped values.

Supported patterns:
- `rnd[min,max]` — random number
- `ypos[min,max]` — map Y-position within group to value

Used by the `assignCues(svgRoot)` function in `app.js`.

## ⚙️ Cue Handling Flow

1. SVG object with `id="cuePause(5)"` intersects playhead.
2. `handleCueTrigger(cueId)` is called.
3. `parseCueParams(cueId)` extracts `type` and `cueParams`.
4. `cueHandlers[type]` is invoked with those parameters.
5. If successful, cue is added to `triggeredCues` and optionally broadcast to other clients.

---

For development: see `cueHandlers` map in `app.js` and how to define new handlers in `cuehandler_architecture.md`.
