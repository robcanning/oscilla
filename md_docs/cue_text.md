# cue:text

Displays dynamic text overlays during score playback.  
Text can be sourced from files, inline content, or sequences with embedded per-word timings.

---

## 🎯 Purpose
Used to show text phrases, poetic fragments, or live cueing messages on screen — either centered or positioned relative to score elements.  
Supports line-by-line, word-by-word, or character-by-character display modes, with flexible duration, gap, fade, and looping controls.

---

## 🧩 Syntax
```
cue:text(
  src:<filename.txt | "inline text">,
  mode:<line|word|char>,
  order:<seq|rnd>,
  dur:<seconds | min-max>,
  gap:<seconds | min-max>,
  hold:<seconds | min-max>,
  fade:<milliseconds | percent%>,
  loop:<N | 0 | inf>,
  target:<center | self | elementID>,
  offsetX:<pixels>,
  offsetY:<pixels>,
  uid:<string>,
  style:"<inline CSS>"
)
```

---

## 🧠 Parameters

| Name | Type | Default | Description |
|------|------|----------|--------------|
| **src** | string | *(required)* | Text source — may be a filename (`tzara.txt`) or quoted inline text (`"The sun sets..."`). `.txt` files are loaded from `window.textDir`. |
| **mode** | `line`, `word`, or `char` | `line` | Defines how the text is split and displayed. |
| **order** | `seq`, `rnd` | `seq` | Sequential or random playback order. |
| **dur** | number or range | `2` | Display duration (seconds per unit). Accepts single value or range (`1-3`). |
| **gap** | number or range | `0` | Pause duration after each unit (seconds). Accepts range (`0.2-1`). |
| **hold** | number or range | `0` | Final hold time before fade-out. |
| **fade** | number or percentage | `25%` | Cross-fade time between units (in ms or % of `dur`). |
| **loop** | number / `0` / `inf` | `1` or infinite for `rnd` | How many times to repeat the entire sequence. `loop:0` or `loop:inf` means infinite looping. |
| **target** | `center`, `self`, or element ID | `center` | Position overlay at screen center, near the cue element (`self`), or above another element (by ID). |
| **offsetX / offsetY** | number | `0` | Pixel offsets applied to overlay position. |
| **uid** | string | auto-generated | Unique identifier for the overlay, used if multiple cues appear simultaneously. |
| **style** | string | *(optional)* | Inline CSS overrides (e.g. `font-size:3em;color:white;text-shadow:0 0 12px rgba(0,0,0,0.5);`). |

---

## 💬 Inline word timing
When `mode:word`, each token may include optional `:dur[:gap]` suffixes:

```
cue:text(src:"The:1:0.2 sun:3:3.1 sets:2 behind:1.5", mode:word)
```

| Token | Meaning |
|--------|----------|
| `The:1:0.2` | Display for 1 s, pause 0.2 s |
| `sun:3:3.1` | Display for 3 s, pause 3.1 s |
| `sets:2` | Display for 2 s, no explicit pause |
| `behind:1.5` | Display for 1.5 s, no pause |

Durations and gaps fall back to global `dur:` and `gap:` when omitted.

---

## 🪄 Defaults
- Text appears **centered** on screen with white letters, transparent background, and black shadow.  
- Fade time ≈ 25 % of `dur`.  
- Random order (`order:rnd`) implies infinite looping by default.  
- Text disappears after the last loop, or when clicked.

---

## 🎨 Examples

**1. Random sequence from file**
```
cue:text(src:tzara.txt, order:rnd, mode:word, dur:1.2, gap:0.2,
         style:"font-size:3em;color:white;text-shadow:0 0 12px rgba(0,0,0,0.5);")
```

**2. Inline timed phrase**
```
cue:text(src:"The:1:0.2 sun:3:3.1 sets:2 behind:1.5", mode:word)
```

**3. Centered overlay with 3 repeats**
```
cue:text(src:tzara.txt, order:seq, loop:3, dur:0.8, gap:0.1)
```

**4. Positioned near cue element**
```
cue:text(src:tzara.txt, target:self, offsetX:30, offsetY:-10)
```

**5. Fixed target element with unique ID**
```
cue:text(src:tzara.txt, target:marker1, uid:alpha, loop:2)
```

---

## 🗜️ Notes
- Style lines **must not contain line breaks** inside quotes.  
- `.txt` files must reside under `scores/<project>/texts/`.  
- The overlay automatically removes itself after completion.  
- Clicking a non-looping text overlay dismisses it early.
