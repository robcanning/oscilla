
# `cueRepeat` — Structured Playback Loops and Jumps

The `cueRepeat(...)` cue type enables controlled repetition of score sections using cue-based jump logic. It is designed for da capo, dal segno, and custom repeat behaviors.

---

## 🔤 Syntax

```
cue_repeat_s(startId)_e(endId)_x(count)_r(resumeId)_d(direction)_a(action)
```

- `s(startId)` → ID of the cue where the repeat loop starts (**required**)
- `e(endId)` → ID where the repeat loop ends (optional, defaults to current cue)
- `x(count)` → Number of times to repeat the loop (**required**)
- `r(resumeId)` → Cue to jump to after repeats complete (optional, defaults to cue location)
- `d(direction)` → Direction of traversal (`forward` or `reverse`) (optional)
- `a(action)` → What to do at loop end: `jump`, `pause`, or `none` (optional)

---

## ✅ Examples

### Repeat a single section 3 times
```
cue_repeat_s(intro)_x(3)
```

### Repeat section from `A` to `B` 2 times, then jump to `C`
```
cue_repeat_s(A)_e(B)_x(2)_r(C)
```

---

## 🛠️ Server-Side Logic (⚠️ Under Repair)

The server currently **tracks active repeats** and **broadcasts loop state** to clients. However:

> ⚠️ **BUG**: Repeat coordination is currently broken in multi-client setups.
> - Only one client handles jumps correctly
> - Others may desync or re-trigger independently

### ❗TODO [HIGH PRIORITY]:

- Fix server broadcast/resync logic so that all connected clients:
  - Share repeat state
  - Jump together in sync
  - Recover gracefully on reconnect

---

## 🔁 TODO: Support Nested Repeats

Nested or overlapping repeat blocks (e.g., a repeat inside a larger form) are not currently supported.

> 🧩 **Planned**: Stack-based repeat state with entry/exit markers for nested structures.

---

## 🧠 Notes

- A repeat is considered "active" once it is triggered
- After each loop, the playhead jumps back to `startId`
- On final repeat, it jumps to `resumeId` or stays in place
- Use `cueRepeat(...)` cues at or near the end of the section being looped

---

## 🧩 Related Cues

- [`cuePause(...)`](cuePause.md) — pause playback with optional countdown
- [`cueAudio(...)`](cueAudio.md) — play local or OSC-triggered audio
- [`cueTraverse(...)`](cueTraverse.md) — animate objects through points or steps
