
# `cue_pause` — Pause Playback with Optional Countdown and Resume

The `cue_pause(...)` cue temporarily halts playback for a specified number of seconds. It can optionally show a visual countdown timer and trigger a jump or cue afterward.

---

## 🔤 Syntax

```
cue_pause(duration)_count(true|false)_resume(cueId)
```

- `duration` → Duration of pause in seconds (required)
- `count(true|false)` → Whether to show countdown UI (optional)
  - `true` (default): show countdown if pause > 2s
  - `false`: never show countdown
- `resume(cueId)` → Jump to this cue after the pause ends (optional)
  - Defaults to current cue (i.e. resume in place)

---

## ✅ Examples

### Basic 3-second pause with countdown:
```
cue_pause(3)
```

### 5-second pause with countdown explicitly disabled:
```
cue_pause(5)_count(false)
```

### Pause 4 seconds and then jump to `sectionB`:
```
cue_pause(4)_resume(sectionB)
```

### Disable countdown *and* jump to `outro` after pause:
```
cue_pause(2)_count(false)_resume(outro)
```

---

## 🧭 Playback Control Notes

- During pause, synchronization is disabled (`ignoreSyncDuringPause = true`).
- The countdown is only shown if:
  - Duration > 2000 ms
  - And `count(false)` is **not** specified

---

## 🛠️ TODO: Support `_next(...)`

```txt
// TODO: Add support for next(...) to automatically trigger another cue after pause ends.
// This allows daisy-chaining actions like cue_pause(...) → cue_audio(...) or cue_animation(...).
```

---

## 🧩 Related Cues

- [`cue_audio(...)`](cue_audio.md) — trigger browser or OSC-based audio
- [`cue_repeat(...)`](cue_repeat.md) — handle repeat/jump logic
- [`cue_traverse(...)`](cue_traverse.md) — move objects through points
