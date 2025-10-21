## cue:stopwatch(...) — display live stopwatch overlay

Displays a stopwatch time overlay at the location of the triggering SVG object.  
The overlay updates every second and can either show the main stopwatch time  
or start a new independent stopwatch. If `hold` is given, it fades out after  
that duration; otherwise it remains visible until dismissed by click.

### Syntax
```
cue:stopwatch(source:<main|new>, hold:<seconds>, scroll:<true|false>,
              offsetX:<pixels>, style:"<css rules>")
```

### Arguments
| Argument | Description |
|-----------|--------------|
| **source** | `"main"` = show the main stopwatch time (default)  <br> `"new"` = create or reset a new independent stopwatch |
| **hold**   | duration in seconds before fading out (`0` = stays visible) |
| **scroll** | `true` = overlay moves with the score, `false` = fixed on screen |
| **offsetX**| horizontal offset in pixels from cue position (default: 0) |
| **style**  | optional inline CSS rules in quotes (use `;` to separate) |

### Behavior
- `cue:stopwatch(source:main)` shows the main stopwatch already running  
- `cue:stopwatch(source:new)` starts or resets its own timer from `00:00`  
- When `hold > 0`, the overlay fades and removes after that time  
- When `hold` is omitted (and `source:new`), click the overlay to dismiss  
- Each individual cue triggers at most one stopwatch instance; retriggering the same cue resets it rather than creating duplicates, but multiple different `source:new` stopwatches can coexist across cues.

### Examples
```
cue:stopwatch(source:main)
cue:stopwatch(source:new, hold:8)
cue:stopwatch(source:new, scroll:true, offsetX:-40)
cue:stopwatch(source:new, style:"color:#0f0;font-size:1.3em;")
cue:stopwatch(source:new, hold:0, scroll:false)
```
