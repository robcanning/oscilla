
# `cue_stop` — Halt Playback and End the Score

The `cue_stop` cue is used to completely stop score playback at a designated point. It is often placed at the end of a piece or to mark a terminal branch of an open-form structure.

---

## 🔤 Syntax

```
cue_stop
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
- Conditional endpoint after a `cue_repeat(...)` or `cue_choice(...)`
- Used in installations or performances where a visual/aural endpoint is necessary

---

## 🚧 TODO: Visual Fadeout & End Page Logic

```txt
// TODO: Extend cue_stop to optionally fade the screen to black or white.
// Optional parameter could define background color:
//   cue_stop_color(black), cue_stop_color(white), cue_stop_color(#ccc)
//
// TODO: Add ability to specify a final page or SVG to show after stopping.
// This could support 'end-page' visuals, credits, or performer instructions.
```

---

## 🧩 Related

- [`cue_pause(...)`](cue_pause.md) — temporarily halt with countdown
- [`cue_repeat(...)`](cue_repeat.md) — repeat sections
- [`cue_choice(...)`](cue_choice.md) — user-chosen form branching
