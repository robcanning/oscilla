
# `cueStop` — Halt Playback and End the Score

The `cueStop` cue is used to completely stop score playback at a designated point. It is often placed at the end of a piece or to mark a terminal branch of an open-form structure.

---

## 🔤 Syntax

```
cueStop
```

- No parameters are needed.
- Once triggered, the score stops moving and does not automatically resume.

---

## ✅ Behavior

- Playback animation halts
- No further cues are processed
- Intended to be **final** in the performance flow unless manually resumed

---

## 🧠 Use Cases

- End of a fixed-form or open-form piece
- Conditional endpoint after a `cueRepeat(...)` or `cueChoice(...)`
- Used in installations or performances where a visual/aural endpoint is necessary

---

## 🚧 TODO: Visual Fadeout & End Page Logic

```txt
// TODO: Extend cueStop to optionally fade the screen to black or white.
// Optional parameter could define background color:
//   cue_stop_color(black), cue_stop_color(white), cue_stop_color(#ccc)
//
// TODO: Add ability to specify a final page or SVG to show after stopping.
// This could support 'end-page' visuals, credits, or performer instructions.
```

---

## 🧩 Related

- [`cuePause(...)`](cuePause.md) — temporarily halt with countdown
- [`cueRepeat(...)`](cueRepeat.md) — repeat sections
- [`cueChoice(...)`](cueChoice.md) — user-chosen form branching
