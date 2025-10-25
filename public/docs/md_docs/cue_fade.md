## cue:fade(...) — fade or pulse an SVG element

Fades the opacity of the triggering SVG object (or a specified target) between
two opacity values. Can be used for smooth fade-ins, fade-outs, or pulsing
effects. The transition speed, easing, and timing can all be controlled.

### Syntax
```
cue:fade(mode:<in|out|pulse|blink>, dur:<seconds>,
          from:<0–1>, to:<0–1>, ease:<easing>,
          time:<seconds>, delay:<seconds>, hold:<seconds>,
          target:<id>)
```

### Arguments
| Argument | Description |
|-----------|-------------|
| **mode**   | type of fade: `"in"`, `"out"`, `"pulse"`, or `"blink"` |
| **dur**    | duration of the fade in seconds |
| **from**   | starting opacity (0 = transparent, 1 = opaque) |
| **to**     | ending opacity |
| **ease**   | easing type (e.g. `linear`, `easeInOutSine`, etc.) |
| **time**   | start time offset in seconds (optional, for cue scheduling) |
| **delay**  | delay before fade starts (seconds) |
| **hold**   | time to hold at final opacity before reset or removal |
| **target** | optional target element ID; if omitted, applies to the cue element itself |

### Behavior
- `cue:fade(mode:in)` smoothly fades in from `from` to `to` opacity.  
- `cue:fade(mode:out)` fades out in reverse.  
- `cue:fade(mode:pulse)` fades in and out continuously while active.  
- `cue:fade(mode:blink)` alternates visibility quickly (use short `dur`).  
- The cue supports timing offsets and can be combined with OSC or other cue types.  
- When `target` is not provided, the fade applies to the object containing the cue.  
- The `hold` argument determines how long the element stays visible before reverting or fading away.

### Examples
```
cue:fade(mode:in, dur:2, from:0, to:1)
cue:fade(mode:out, dur:3, ease:easeOutSine)
cue:fade(mode:pulse, dur:1.5, from:0.2, to:1)
cue:fade(mode:blink, dur:0.5, time:10)
cue:fade(mode:in, dur:2, from:0, to:1, target:circle1)
cue:fade(mode:pulse, dur:2, hold:5, target:obj_light)
```
