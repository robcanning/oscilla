# `cueTraverse` — Animate Objects Between SVG Points

The `cueTraverse(...)` cue animates an SVG object along a path defined by a list of point elements (`<circle>`, `<rect>`, or `<ellipse>`). It's useful for moving symbols, playheads, or visual elements dynamically across the score.

---

## 🔤 Syntax

```
cue_traverse_p(p1,p2,p3)_o(objectId)_s(speed)_d(direction)_x(repeats)_e(easeType)_h(holdMs)_next(targetCue)
```

Each parameter is enclosed in its own parenthesis. The cue name and parameters can be written as a single underscore-delimited string.

---

## 🧩 Parameter Reference

| Param     | Meaning                                         |
|-----------|--------------------------------------------------|
| `p(...)`  | List of point IDs (e.g. `p(p1,p2,p3)`)           |
| `o(...)`  | Object ID to move                                |
| `s(...)`  | Speed in pixels per second (e.g. `s(2.5)`)       |
| `d(...)`  | Direction: `0=forward`, `1=reverse`, `2=pingpong`, `3=random` |
| `x(...)`  | Number of repeats (`0 = infinite`)               |
| `e(...)`  | Easing type (0 = linear, 1–9 = anime.js presets) |
| `h(...)`  | Hold time at each point in milliseconds          |
| `_next(...)` | Optional cue to trigger after traversal ends  |

---

## ✅ Examples

### Traverse between 3 points once:
```
cue_traverse_p(p1,p2,p3)_o(dot)_s(1.5)_x(1)
```

### Infinite pingpong movement:
```
cue_traverse_p(p1,p2,p3)_o(dot)_d(2)_x(0)
```

### Traverse with hold, ease, and jump to another cue:
```
cue_traverse_p(A,B,C)_o(cursor)_s(3)_e(2)_h(300)_next(cue_done)
```

---

## ⚠️ Notes

- Objects must be `<circle>`, `<ellipse>`, or `<rect>` to be correctly positioned.
- `p(...)` must contain **at least two** valid point IDs.
- `_next(...)` cue will only be triggered after **final traversal loop** finishes (or never, if infinite).
- Traversal will pause playback if `isPlaying` is false at start.

---

### 🎯 Triggering Other Objects via Intersections

As the animated object (defined via `o(...)`) moves through the points listed in `p(...)`, the system checks whether any point ID matches the `data-id` of other SVG elements.

When a match is found:

- The corresponding element is **animated using its `data-id` definition**
- This allows `cueTraverse` to function like a **trigger engine**
- It’s useful for triggering visual pulses, spins, or dynamic elements connected to spatial locations in the score

#### 🧪 Example

```
c-t_p(p1,p2,p3)_o(pulsetrig01)
```

If you have an element like:

```html
<circle id="pulse" data-id="pulsetrig01 obj_scale_seq[1,1.5,1]_bounce" />
```

When the animated object reaches a point named `pulsetrig01`, the element above will animate according to its `data-id`.
