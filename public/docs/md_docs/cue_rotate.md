# rotate() Cue — OscillaScore

`rotate()` controls rotation animations of SVG elements in OscillaScore. It supports step-wise snapping, smooth tweening, looping, alternating (bounce), one-shot playback, and pattern-based sequencing for both angle values and durations.

---

## Syntax

```
rotate(values:[...], dur:..., mode:..., interp:..., ease:..., hold:..., pauseOnExit:...)
```

### Parameters

| Name         | Type                          | Default   | Description |
|--------------|-------------------------------|-----------|-------------|
| `values`     | Array or Pattern               | *required*| Rotation target angles in degrees. Supports arrays and Pseq/Prand/Pxrand/Pshuf. |
| `dur`        | Number, Array, or Pattern      | `1`       | Duration *per step* in seconds, or a duration pattern. |
| `mode`       | `loop` \| `once` \| `alternate`| `loop`    | Loop behavior. `alternate` bounces forward/back over the sequence. |
| `interp`     | `smooth` \| `step`             | `smooth`  | `smooth`: tween between angles. `step`: instant jumps and hold. |
| `ease`       | Anime.js easing string         | `linear`  | Only used when `interp="smooth"`. |
| `hold`       | Number (seconds)               | auto      | Hold time *between steps* in smooth mode. Ignored in step mode. |
| `pauseOnExit`| Boolean                        | `true`    | If false + `mode:"once"`, returns to first value on finish. |

---

## Examples

### 1. Simple Loop
```
rotate(values:[0,120,240], dur:2)
```
Rotates smoothly through 3 angles, repeating every 2 seconds per step.

### 2. Stepwise (snap) Rotation
```
rotate(values:[0,90,180,270], dur:0.4, interp:step)
```
Instant hops, each held for 0.4 seconds.

### 3. Alternating Bounce
```
rotate(values:[0,180], dur:1, mode:alternate)
```
Goes 0 → 180 → 0 → 180 ...

### 4. One-Shot (no looping)
```
rotate(values:[0,45,0], dur:1, mode:once)
```
Runs once and stops.

### 5. Patterned Durations
```
rotate(values:[0,120,240], dur:Pseq([2,0.5,1], inf))
```
Durations per step cycle through 2s, 0.5s, 1s repeatedly.

### 6. Patterned Angles + Step Mode
```
rotate(values:Pshuf([0,90,180,270], inf), dur:0.3, interp:step)
```
Random order, snapping between angles.

---

## Behavior Notes

### Step Mode (`interp:"step"`)
- No tweening.
- The element instantly snaps to the next angle.
- `dur` becomes the hold time.
- `hold` is ignored.

### Smooth Mode (`interp:"smooth"`)
- Tweens between angles using `ease`.
- After each tween completes, a hold period occurs:
  - If `hold` is given → use it.
  - Otherwise → defaults to `dur * 0.25`.

### Pattern Generators
`values:` and `dur:` both support:
- `Pseq([...], repeats)`
- `Prand([...], repeats)`
- `Pxrand([...], repeats)`
- `Pshuf([...], repeats)`
- literal arrays (`[ ... ]`)

Patterns continuously supply the next step value without resetting unless `mode:"once"` explicitly ends.

---

## Fallback (Continuous Rotation)

If `values` is not provided:

```
rotate(dur:4)
```

→ rotates the object **360° every 4 seconds** in a continuous loop.

---

## Summary

| Mode | Effect |
|------|--------|
| `loop` | Sequence repeats indefinitely. |
| `once` | Sequence plays once and stops. |
| `alternate` | Sequence plays forward, then reverses at boundaries. |

| Interp | Result |
|--------|--------|
| `smooth` | eased continuous rotation motion |
| `step` | instant snaps between angles |

---

End of document.
