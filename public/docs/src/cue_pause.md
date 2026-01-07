---
title: cue_pause
layout: docs_layout.njk
---

# `cuePause` — Pause Playback with Optional Countdown and Resume

The `cuePause(...)` cue temporarily halts playback for a specified number of seconds. It can optionally show a visual countdown timer and trigger a jump or cue afterward.

---

## Syntax

```
cuePause(duration)_count(true|false)_resume(cueId)
```

- `duration` → Duration of pause in seconds (required)
- `count(true|false)` → Whether to show countdown UI (optional)
  - `true` (default): show countdown if pause > 2s
  - `false`: never show countdown
- `resume(cueId)` → Jump to this cue after the pause ends (optional)
  - Defaults to current cue (i.e. resume in place)

---

## Examples

### Basic 3-second pause with countdown:
```
cuePause(3)
```

### 5-second pause with countdown explicitly disabled:
```
cuePause(5)_count(false)
```

### Pause 4 seconds and then jump to `sectionB`:
```
cuePause(4)_resume(sectionB)
```

### Disable countdown *and* jump to `outro` after pause:
```
cuePause(2)_count(false)_resume(outro)
```

---

## Playback Control Notes

- During pause, synchronization is disabled (`ignoreSyncDuringPause = true`).
- The countdown is only shown if:
  - Duration > 2000 ms
  - And `count(false)` is **not** specified

---

## TODO: Support `_next(...)`

```txt
// TODO: Add support for next(...) to automatically trigger another cue after pause ends.
// This allows daisy-chaining actions like cuePause(...) → cueAudio(...) or cue_animation(...).
```

---

## Related Cues

- [`cueAudio(...)`](cueAudio.md) — trigger browser or OSC-based audio
- [`cueRepeat(...)`](cueRepeat.md) — handle repeat/jump logic
- [`cueTraverse(...)`](cueTraverse.md) — move objects through points
