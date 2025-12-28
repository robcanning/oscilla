# cue:osc — Discrete OSC Event Cue

`osc(...)` sends a **single OSC message** when triggered.

It is **event-based**, not continuous, and is designed to turn **drawn objects into discrete control events**, typically consumed by SuperCollider, Pd, Max, etc.

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
osc(addr:voice, pitch:y, env:size)
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

All visual sources are normalised to `0–1`.

| Source | Meaning |
|------|--------|
| `x` | Object centre X position |
| `y` | Object centre Y position |
| `size` | Max of width/height relative to viewport |
| `scale` | Current visual scale |
| `rotation` | Normalised rotation (0–360 → 0–1) |
| `opacity` | Computed opacity |
| `fill` | Numeric colour hash |

Example:

```
osc(addr:voice, pitch:y, amp:size)
```

This sends a **continuous control pitch** (`pitchCtrl`) derived from the object’s Y position.

---

## SEMANTIC PITCH VALUES

In addition to visual mappings, `osc()` supports **typed pitch values**.

### Absolute pitch (Hz)

```
osc(addr:voice, pitch:hz(440))
```

Emits:

```
"pitchHz", 440
```

### MIDI note number

```
osc(addr:voice, pitch:midi(60))
```

Emits:

```
"pitchMidi", 60
```

### Scale degree + absolute octave

```
osc(addr:voice, pitch:deg(5,3))
```

Represents:

- `degree = 5`
- `octave = 3` (absolute octave, where 3 ≈ middle C region)

Emits:

```
"pitchDeg", 5, "pitchOct", 3
```

> Interpretation of degrees and scales is **intentionally delegated to the receiving instrument** (e.g. SuperCollider).

---

## PITCH PRIORITY (IMPORTANT)

When multiple pitch sources exist, resolution is:

1. `deg(d,o)` → symbolic, scale-based pitch
2. `hz()` or `midi()` → absolute pitch
3. visual `pitch:y` → continuous control pitch (`pitchCtrl`)

Only **one pitch representation** is expected to be used by the instrument per event.

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
osc(addr:voice, pitch:deg(0,4), trig:playhead)
```

---

## UID (OPTIONAL)

`uid` is optional and is only included if explicitly provided.

```
osc(addr:voice, pitch:y, uid:v1)
```

Emits OSC arguments including:

```
"uid", "v1"
```

UIDs are typically used to associate events with performers, voices, or persistent identities downstream.

---

## OSC OUTPUT FORMAT (AUTHORITATIVE)

All OSC messages use **explicit key–value pairs**.

### General form

```
/oscilla/<addr>
  "param1", <value>,
  "param2", <value>,
  ...
```

### Example — visual pitch

```
/oscilla/voice
  "pitchCtrl", 0.63,
  "env", 0.41
```

### Example — degree-based pitch

```
/oscilla/voice
  "pitchDeg", 0,
  "pitchOct", 4,
  "env", 0.32
```

### Example — absolute pitch

```
/oscilla/voice
  "pitchHz", 440,
  "density", 0.18
```

> **Positional arguments are never used.**  
> Receivers are expected to parse OSC messages into dictionaries / maps.

---

## USE WITH propagate()

`propagate()` applies the same `osc()` cue to all child objects, automatically creating **many independent OSC events**.

### Example — spatial pitch cloud

```
propagate(
  osc(
    addr:voice,
    pitch:y,
    env:size,
    trig:playhead
  )
)
```

---

### Example — scale-degree constellation

```
propagate(
  osc(
    addr:voice,
    pitch:deg(${1}, 3),
    env:size, uid:rnd
  ),
  rnd([0,2,4,5,7,9,11])
)

propagate(
  osc(
    addr:voice,
    pitch:deg(${1}, ${2}),
    env:size, uid:rndoct123
  ),
  rnd([0,2,4,5,7,9,11]), rnd([0,1,2,3,4,5])
)


propagate(
  osc(
    addr:pontalist,
    pitch:deg(irand(0,11), irand(0,2)),
    env:size, uid:irand1235
  )
)
```

---

## DESIGN NOTES

- `osc()` is **stateless**
- No DOM IDs are ever used
- No continuous OSC streaming
- No DSP or scale logic inside the DSL
- Musical interpretation is delegated downstream
- OSC arguments are **always keyed**

---

## SUMMARY

> `osc()` turns visual objects into one-shot OSC control events.  
> It supports continuous control, absolute pitch, and symbolic pitch, while leaving musical interpretation to the receiving instrument.
