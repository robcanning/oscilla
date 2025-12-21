# cue:osc — Discrete OSC Event Cue

`osc(...)` sends a **single OSC message** when triggered.  
It is **event-based**, not continuous, and is designed to turn **drawn objects into control events**.

It works especially well with `propagate()` to create many independent OSC triggers from simple drawings.

---

## BASIC FORM

```
osc(addr:<name>, <param>:<source>, ...)
```

Required:

| Key | Meaning |
|-----|--------|
| `addr` | OSC address name (without leading `/`) |

Example:

```
osc(addr:voice, pitch:y, amp:size)
```

---

## EVENT-BASED BEHAVIOUR

- Sends **one OSC message per trigger**
- No animation, no scheduling, no looping
- Values are sampled **at trigger time**
- Completes immediately

`osc()` is a *logical cue*, not an animation cue.

---

## VISUAL PARAMETER SOURCES (NORMALISED)

All sampled values are normalised to `0–1`.

| Source | Meaning |
|------|--------|
| `x` | Object centre X position |
| `y` | Object centre Y position |
| `size` | Max of width/height relative to viewport |
| `scale` | Current visual scale |
| `rotation` | Normalised rotation (0–360 → 0–1) |
| `opacity` | Computed opacity |
| `fill` | Numeric colour hash |

Example mapping:

```
osc(addr:voice, pitch:y, amp:size)
```

---

## TRIGGERING

`osc()` supports the same trigger model as other cues.

| Key | Meaning |
|-----|--------|
| `trig:auto` | Fire immediately |
| `trig:playhead` | Fire on playhead intersection |
| `trig:click` | Fire on click |
| `prestate:ghostClickable` | Arm click interaction |

Example:

```
osc(addr:voice, pitch:y, trig:playhead)
```

---

## UID (OPTIONAL)

`uid` is **optional** and is only included if explicitly provided.

```
osc(addr:voice, pitch:y, uid:v1)
```

Emits OSC address:

```
/oscilla/voice/v1
```

If `uid` is omitted, no UID is sent.

---

## OSC OUTPUT FORMAT

### Without UID

```
/oscilla/<addr> <value> <value> ...
```

Example:

```
/oscilla/voice 0.63 0.41
```

### With UID

```
/oscilla/<addr>/<uid> <value> <value> ...
```

Example:

```
/oscilla/voice/v1 0.63 0.41
```

Values are sent in the order defined in the cue.

---

## USE WITH propagate()

`propagate()` applies the same `osc()` cue to all child objects,
automatically injecting unique parameters where needed.

### Example — spatial pitch cloud

```
propagate(
  osc(
    addr:voice,
    pitch:y,
    amp:size,
    trig:playhead
  )
)
```

Each object produces an independent OSC event as the playhead crosses it.

---

### Example — clickable voices with UID

```
propagate(
  osc(
    addr:voice,
    pitch:y,
    amp:size,
    uid:v,
    trig:click,
    prestate:ghostClickable
  )
)
```

Produces addresses like:

```
/oscilla/voice/v_0
/oscilla/voice/v_1
/oscilla/voice/v_2
```

---

## DESIGN NOTES

- `osc()` is **stateless**
- No DOM IDs are ever used
- No continuous OSC streaming
- No expressions or mappings inside the DSL
- Mapping and scaling are expected downstream (SuperCollider, Pd, etc.)

---

## SUMMARY

> `osc()` turns visual objects into one-shot OSC control events.  
> Combined with `propagate()`, it enables complex drawable control structures with minimal notation.
