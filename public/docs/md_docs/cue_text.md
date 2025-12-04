# cue:text — OscillaScore Text Cue Reference (Updated)

This document describes all features of the OscillaScore text engine, including
**slot-based layout**, **two-layer crossfades**, **duration/gap logic**, **looping**, and **ordering**.

---

# 1. Basic Syntax

```
text(
  src:<file or inline>,
  order:<seq|rnd>,
  dur:<seconds or range>,
  gap:<seconds or range>,
  cross:<0|1>,
  crossfade:<ms or "%">,
  loop:<0|N>,
  target:<center|self|elementId>,
  offsetX:<px>,
  offsetY:<px>,
  yslots:<N>,
  yoffset:<px>,
  yslotmode:<sequence|singlestep|random|shuffle>,
  autostart:<0|1>,
  style:"CSS..."
)
```

All parameters are optional unless stated.

---

# 2. Content Source

### `src:tzara.txt`
Loads a `.txt` file from the project's text directory.

### `src:"Hello world"`
Inline text string.

Lines may be separated with:
- newline (`
`)
- semicolon (`;`)

---

# 3. Unit Construction

### `mode:line` *(default)*
Each line is shown as a unit.

### `mode:word`
Each word becomes a unit.

### `mode:char`
Each character becomes a unit.

---

# 4. Duration & Gap

### `dur:3`
Each unit shows for **3 seconds**.

### Ranges
```
dur:2-4
gap:0.5-1.2
```

- Duration is chosen per unit.
- Gaps produce blank time between units **only when `cross:0`**.

---

# 5. Ordering

### `order:seq`  
Units shown in natural order.

### `order:rnd`  
Units shuffled every cycle.

---

# 6. Looping

The loop behaviour:

| Setting | Meaning |
|--------|---------|
| `loop:0` | Infinite loop |
| `loop:N` | Play N cycles |
| No loop param, `order:seq` | Play once |
| No loop param, `order:rnd` | Loop infinitely |

Example infinite loop:

```
text(src:foo.txt, loop:0)
```

---

# 7. Crossfade System

OscillaScore now uses a **two-layer crossfade design**:

- The **old line** fades out in its slot  
- The **new line** fades in in its own slot  
- Both remain visible simultaneously during overlap  
- No teleporting, no slot-shifting during fade

### `cross:1`
Enables overlapping crossfade.

### `cross:0`
Fade-out → blank gap → fade-in.

### `crossfade:"60%"`
Fade time = 60% of unit duration.

### `crossfade:800`
Fade time = 800ms.

---

# 8. Slot-Based Vertical Layout

Slots override vertical placement completely.

This system enables structured multi-line presentation.

### `yslots:N`
Enable slot layout, N vertical “lanes”.

Example:
```
yslots:3
```
Creates:
```
top
center
bottom
```

### `yoffset:<px>`
Distance between slots. Default: `100px`.

### Slot Modes

#### `yslotmode:sequence`
```
1 → 2 → 3 → 1 → 2 → 3...
```

#### `yslotmode:singlestep`
Bounces:
```
center → next → center → previous → center...
```

#### `yslotmode:random`
Each unit goes to a random slot.

#### `yslotmode:shuffle`
Uses each slot once per cycle:
```
(3,1,2) → (2,3,1) → ...
```

### Behavior
- Each line lives in exactly **one** slot.
- Crossfade overlaps use **two different layers**, one per slot.
- With high crossfade %, multiple lines may be visible across slots.

This allows the reader to finish reading an old line while a new one appears.

---

# 9. Positioning

### Slots override Y-position entirely.

### Horizontal center with `offsetX`
```
left = 50% + offsetX
```

### If `yslots` is not enabled:
- `target:self` anchors to cue element
- `target:<id>` anchors to an SVG element
- `target:center` (default) centers onscreen

---

# 10. Examples

### Basic
```
text(src:foo.txt, dur:3, autostart:1)
```

### Infinite random cycling
```
text(src:foo.txt, order:rnd, dur:2, loop:0)
```

### Crossfade with 60% overlap
```
text(src:foo.txt, dur:3, cross:1, crossfade:"60%")
```

### Slot-based layout (3 lanes)
```
text(
  src:foo.txt,
  dur:3,
  cross:1,
  crossfade:"70%",
  yslots:3,
  yoffset:130,
  yslotmode:singlestep,
  autostart:1
)
```

### Sequential slot cycling
```
text(src:foo.txt, yslots:3, yslotmode:sequence)
```

### Random slots, no crossfade
```
text(
  src:foo.txt,
  yslots:3,
  yslotmode:random,
  cross:0,
  gap:1,
  dur:2
)
```

---

# 11. Interaction

Clicking the text overlay cancels the sequence.

### `persist:1`
Prevents the overlay from being removed during `stopAllCueTexts()`.

---

# 12. Stopping All Text

```
stopAllCueTexts()
```

Removes all **non-persistent** text overlays.

---

# 13. Summary Table

| Param | Description |
|-------|-------------|
| `src` | File or inline text |
| `order` | seq or rnd |
| `dur` | seconds or range |
| `gap` | seconds or range (non-cross only) |
| `cross` | 1=overlap, 0=fade-out/in |
| `crossfade` | ms or percent |
| `loop` | 0 infinite, N cycles |
| `mode` | line / word / char |
| `yslots` | number of vertical lanes |
| `yoffset` | px between lanes |
| `yslotmode` | sequence, singlestep, random, shuffle |
| `offsetX/Y` | px offsets |
| `autostart` | begin immediately |
| `persist` | survive global stop |

---

# End of Document
