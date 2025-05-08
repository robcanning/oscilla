
# Cue Handler Architecture — oscillaScore / Rotula.Score

This file documents the internal logic and architecture for implementing new cue types in the oscillaScore (Rotula.Score) system.

---

## 🔁 Cue Trigger Lifecycle

1. SVG cue element (e.g. `<text id="cueAudio(kick.wav)">`) is intersected by the scrolling playhead.
2. The `handleCueTrigger(cueId, isRemote)` function is invoked.
3. Cue type and parameters are parsed via `parseCueParams(cueId)`.
4. Cue is dispatched to the relevant function in `cueHandlers[type]`.
5. Function performs the cue behavior (e.g. play sound, pause playback).
6. Cue is recorded in `triggeredCues` to prevent re-triggering.
7. Cue is broadcast via WebSocket to other clients (unless `isRemote === true`).

---

## 🧱 Core Components

### `handleCueTrigger(cueId, isRemote = false)`

Main dispatcher for cue execution:
- Parses cue type and parameters
- Delegates to handler in `cueHandlers`
- Skips if already triggered
- Broadcasts to other clients if needed

### `parseCueParams(cueId)`

Parses cue strings like:
```txt
cueAudio(file.wav)_loop(3)_amp(0.8)
```

Returns:
```js
{
  type: "cueAudio",
  cueParams: {
    choice: "file.wav",
    loop: 3,
    amp: 0.8
  }
}
```

Supports:
- `param(value)` format
- Coercion to boolean, float, int

---

## 🎯 `cueHandlers` Registry

A global map of known cue types:
```js
cueHandlers = {
  cuePause: handlePauseCue,
  cueStop: handleStopCue,
  cueRepeat: handleRepeatCue,
  cueAudio: handleAudioCue,
  cueChoice: handleCueChoice,
  cueTraverse: handleTraverseCue,
  cueOsc: handleOscCue,
  ...
}
```

Each value is a function that accepts the cueId and parsed parameters.

---

## ✅ Adding a New Cue Handler

### 1. Create the handler function
```js
const handleMyCue = (cueId, cueParams) => {
  console.log("[DEBUG] Running cue:", cueId, cueParams);
  // Your logic here
};
```

### 2. Register in `cueHandlers`
```js
cueHandlers["cue_mycue"] = handleMyCue;
```

### 3. Trigger in SVG
```xml
<text id="cue_mycue(foo)_duration(5)">Do Something</text>
```

---

## 🛠️ DOM + Playback Utilities

You can use these globals and helpers:
- `playheadX`: current playhead horizontal position
- `isPlaying`: whether animation is running
- `stopAnimation()` / `startAnimation()`
- `togglePlayButton()`
- `window.runningAnimations`, `window.pauseTimeout`

---

## 🧠 Design Notes

- Cues should degrade gracefully if not supported.
- Most cues run once and are stateful.
- Repeats (`cueRepeat`) and choice cues (`cueChoice`) may modify navigation or playback.
- OSC cues are dispatched via WebSocket with structured JSON.

---

## 🧪 Debugging Tips

- Use `[DEBUG]` console logs consistently
- Confirm WebSocket is connected (`wsEnabled && socket.readyState === WebSocket.OPEN`)
- Test cue triggering both locally and remotely

---

## 🧩 Cue Types Currently Supported

| Cue Type         | Description                                 |
|------------------|---------------------------------------------|
| `cuePause(...)` | Pause with optional countdown UI            |
| `cueStop`       | Stop playback entirely                      |
| `cueAudio(...)` | Play audio locally (Wavesurfer) or via OSC  |
| `cueChoice(...)`| Fullscreen performer choices from SVGs      |
| `cueRepeat(...)`| Repeat from start to end `x` times          |
| `cueTraverse(...)` | Move object between points on screen     |
| `cue_animation(...)`| Trigger fullscreen SVG animation         |
| `cue_osc_*`      | Send OSC: trigger, pulse, random, set, etc. |

---

## ✅ Best Practices

- Keep cue handlers atomic (1 cue = 1 effect)
- Avoid hardcoding visuals/UI into handlers
- Use cueParams for everything dynamic
- Broadcast only when `!isRemote`

---

## 📂 Suggested Files

- `cue_[type].md` for documentation
- `handle[type]Cue()` for implementation
