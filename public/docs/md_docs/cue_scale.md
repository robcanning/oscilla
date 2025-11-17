# cue:scale — Scale Animation Cue (Updated)

This version fully documents support for Pseq, Prand, Pxrand, and Pshuf patterns.

## Overview
`scale()` and `scaleXY()` control visual scaling of SVG objects. Scaling may be smooth, stepped, patterned, pulsed, uniform, or non‑uniform (independent X/Y).

Both explicit and implicit forms work:
```
scale(values:[1,1.5,1], dur:2)
scale([1,1.5,1], dur:2)
```

## Uniform vs Non‑Uniform
```
scale([1,1.5,1], dur:2)
scaleXY([1,1.5],[1,0.5], dur:2)
scaleXY(x:[1,1.5], y:[1,0.5], dur:2)
```

## Pattern Support (rotate‑equivalent)
Scale fully supports SuperCollider‑style patterns:

- **Pseq([…], inf)** deterministic looping  
- **Prand([…], inf)** random selection  
- **Pxrand([…], inf)** random, no immediate repeats  
- **Pshuf([…], inf)** shuffled list repeating  

Patterns are valid for:
- **values** in `scale()`
- **x:** and **y:** in `scaleXY()`
- **dur:** (patterned duration)

Examples:
```
scale(Pseq([1,1.5,1], inf), dur:1)
scale(Prand([1,2,0.8], inf), dur:0.5)
scaleXY(x:Pxrand([1,1.3,1.6],inf), y:Pshuf([1,0.8,1.2],inf), dur:1)
scale([1,2,1], dur:Prand([0.5,1,2],inf))
```

## Sequence Modes
- `mode:loop` — continuous (default)  
- `mode:once` — play once  
- `mode:alternate` — bounce/ping‑pong  

## Interpolation
- `interp:smooth` — tween between values (default)  
- `interp:step` — instantaneous jumps  

`hold:` applies only to smooth interpolation.

## Parameters
| Key | Description | Default |
|-----|-------------|---------|
| `dur` | seconds per step or pattern element | `1` |
| `hold` | pause after tween (smooth only) | `dur * 0.25` |
| `ease` | Anime.js easing | `linear` |
| `osc` | 0=off, 1=continuous, 2=per‑step | `0` |
| `pauseOnExit` | in once‑mode, stay at final value | `true` |

## Continuous Pulse Form
```
scale(min:1, max:1.3, dur:2, loop:0, ease:"easeInOutSine")
```

## OSC Output
```
{
  "type":"osc_scale",
  "uid":"objectID",
  "sx":1.25, "sy":0.75,
  "avg":1.0,
  "timestamp":1736730000000
}
```

## Typical Usage
```
scale([1,1.5,1], dur:2, ease:"easeInOutSine", osc:1)
scaleXY([1,1.5],[1,0.5], dur:3, mode:alternate, interp:step)
scale(Pseq([1,2,1],inf), dur:Prand([0.5,1,2],inf))
```
