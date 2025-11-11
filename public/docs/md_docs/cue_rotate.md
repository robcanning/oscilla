
# rotate() — OscillaScore Rotation Cue

Controls visual rotation of any SVG object around its transform origin. Rotation may be continuous or driven by a list or pattern of angles. To use rotation, assign an object (usually a `<g>`) an id of the form:

```
rotate(...)
```

The first parameter may be given either explicitly:

```
rotate(values:[0,120,240], dur:4)
```

or implicitly:

```
rotate([0,120,240], dur:4)
```

In the implicit form, the first argument (a list or pattern) is treated as the `values` sequence.

Rotation occurs in place. The pivot defaults to the object’s visual center, but may be adjusted in Inkscape via **Object → Transform → Center**, or by setting `transform-origin` in the style.

---

## Parameters

| Parameter | Type | Meaning |
|----------|------|---------|
| values / first param | List or Pattern | Sequence of angles in degrees |
| dur | Number or Pattern | Duration of each step, in seconds |
| mode | loop / once / alternate | Sequence traversal behavior |
| interp | smooth / step | Interpolation style |
| ease | Easing string | (smooth mode only) anime.js easing |
| hold | Number (seconds) | Pause after each step (smooth mode only) |

---

## Sequence Modes

- **mode:loop** (default) — cycle continuously
- **mode:once** — play the sequence once and stop
- **mode:alternate** — ping-pong (bounce) at sequence edges

---

## Interpolation Styles

- **interp:smooth** — rotation animates over time (default)
- **interp:step** — rotation snaps instantly; `dur` becomes the step interval

In smooth mode, `hold` applies after reaching each step.  
In step mode, `hold` is ignored.

---

## Pattern Support (for values and durations)

| Pattern | Behavior |
|--------|----------|
| `Pseq([…], inf)` | loop sequence |
| `Prand([…], inf)` | pick random each time |
| `Pxrand([…], inf)` | random, no immediate repeat |
| `Pshuf([…], inf)` | shuffled list repeating |

---

## Examples

```
rotate(dir:1, dur:1) 
  ```
CW one turn per second

```
rotate([0,120,240], dur:4)
```
Cycle three orientations every 4 seconds.

```
rotate([0,90,180,270], dur:0.5, interp:step)
```
Snap through quarter-turns at 0.5s intervals.

```
rotate(Pseq([0,45,10],inf), dur:Pseq([2,0.4,1],inf), mode:alternate)
```
Alternate rotation direction while durations follow a repeating rhythmic pattern.

---

## Notes

- Rotation timing is independent of scroll speed.
- State persists when seeking/jumping.
- If the object visually jumps, set pivot explicitly.
- Patterns allow non-repetitive rotational behavior.

---
