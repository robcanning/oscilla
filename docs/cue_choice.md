# `cue_choice` — Performer-Driven SVG Animation Selector

The `cue_choice(...)` cue displays a selection of SVG-based animations or images in a grid, allowing a performer to select one by clicking. The selected visual is displayed full screen for a set duration, after which the score resumes scrolling.

---

## 🔤 Syntax

```
cue_choice(choiceA)_dur(10)_choiceB_dur(5)_choiceC
```

- Each `choice` refers to an `.svg` file inside the `animations/` directory
- `dur(N)` sets the display duration (in seconds) for the preceding choice
- If no duration is given, defaults to `30` seconds
- Multiple choices can be defined in sequence

---

## ✅ Behavior

1. **Pauses the score** playback
2. **Displays** the choices in a full-screen grid
3. **Allows** the performer to click a choice
4. Loads the selected SVG into fullscreen for the given duration
5. After countdown:
   - Fades out the animation
   - Resumes scrolling playback

All non-choice UI is blurred while the selection interface is active.

---

## ✅ Example

```
cue_choice(spiral)_dur(10)_grid-lines_dur(6)_quiet-line
```

This displays three clickable thumbnails:

- `spiral.svg` for 10s
- `grid-lines.svg` for 6s
- `quiet-line.svg` for 30s (default)

---

## 🛠️ Technical Notes

- The cue parses the `_choice_dur_` sequence dynamically from the cue ID
- Choices are loaded from `animations/{choice}.svg`
- SVG files must exist and be well-formed
- SVG thumbnails are rendered using `<object type="image/svg+xml">`

---

## 🚧 TODO: Page-Based `_next(...)` Logic

```
// TODO: Add support for automatic cue chaining after animation ends.
// After the fullscreen SVG fades out, the system should check whether
// the SVG contains a reference to the next cue (e.g. <meta data-next="cueId" />)
// and automatically trigger that cue. This would support fully paged, non-scrolling paradigms.
```

---

## 🎼 Compositional Context: Indeterminacy, Choice, and Hypertext

The `cue_choice` system introduces elements of **indeterminacy** and **user agency** into the score. By offering multiple potential directions through performer interaction, the music becomes **hypertextual**—capable of branching, forking, and diverging into alternate temporal experiences.

This is especially powerful in:

- 🎭 Performer-led improvisation
- 🎲 Chance-based forms
- 🌐 Non-linear or networked scores
- 🤖 Computer-augmented compositions

While each user may choose a different visual/sonic path, shared structural moments (e.g. the end of a scene or cue) can act as **rejoining points**, where parallel paths converge into a unified timeline again.

---

## 🚧 TODO: Computer-Chosen Variants

```txt
// TODO: Add a mode where the computer, not the performer, chooses the animation.
// This allows fully generative branching where a cue_choice acts as a decision point
// in an algorithmic or AI-driven form, supporting autopoietic music or score-as-agent design.
```
