# cue:scale — Scale Animation Cue

Controls visual scaling of any SVG object around its transform origin. Scaling may be continuous or driven by a list or pattern of scale values.

To use scaling, assign an object (usually a <g>) an id or cue expression of the form:

```js
scale([1, 1.5, 1], dur:2)
```

The first parameter may be given either explicitly:

```js
scale(values:[1,1.5,1], dur:2)
```

or implicitly:

```js
scale([1,1.5,1], dur:2)
```

### Uniform vs. Non‑uniform Scaling

Uniform scaling applies the same factor to both axes:

```js
scale([1, 1.5, 1], dur:2)
```

Non‑uniform scaling applies independent sequences to X and Y:

```js
scaleXY([1,1.5],[1,0.5], dur:2)
```

You can also use named parameters:

```js
scaleXY(x:[1,1.5], y:[1,0.5], dur:2)
```

### Sequence Modes

| Mode | Description |
|------|--------------|
| `mode:loop` | cycle continuously (default) |
| `mode:once` | play the sequence once |
| `mode:alternate` | bounce back and forth |

### Interpolation Modes

| Mode | Description |
|------|--------------|
| `interp:smooth` | interpolate smoothly between scale values (default) |
| `interp:step` | jump instantly and hold for duration |

### Parameters

| Key | Description | Default |
|-----|--------------|----------|
| `dur` | duration per step in seconds | `1` |
| `hold` | pause duration after each tween | `dur * 0.25` (smooth only) |
| `ease` | easing function (Anime.js) | `linear` |
| `osc` | OSC output mode (0=off, 1=continuous, 2=per‑step) | `0` |
| `pauseOnExit` | if `false`, returns to first value after once‑mode end | `true` |

### Continuous Pulse Form

If no explicit values are given, `scale()` falls back to a continuous pulse animation:

```js
scale(min:1, max:1.3, dur:2, loop:0, ease:"easeInOutSine")
```

### OSC Output

When `osc:1` or `osc:2` is set, each frame (or step) emits an OSC JSON message of the form:

```json
{
  "type": "osc_scale",
  "uid": "objectID",
  "sx": 1.25,
  "sy": 0.75,
  "avg": 1.0,
  "timestamp": 1736730000000
}
```

### Typical Usage

```js
scale([1,1.5,1], dur:2, interp:smooth, ease:"easeInOutSine", osc:1)
scaleXY([1,1.5],[1,0.5], dur:3, mode:alternate, interp:step)
```
