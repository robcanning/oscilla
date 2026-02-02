# color() / colour() — Colour Animation Cue

`color()` (alias: `colour()`) animates the visual colour of SVG elements over time.
It supports discrete sequences, smooth tweening, and continuous traversal of HSL colour space,
using the same structural conventions as other Oscilla animation cues (`scale`, `rotate`, `o2p`).

Both spellings are fully equivalent:

```
color(...)  ≡  colour(...)
```

---

## Scope

- Affects SVG `fill` and `stroke` properties
- Colours may be authored in common CSS formats
- Internally, all colours are normalised to **HSL** for interpolation

---

## Basic Syntax

```
color(
  uid:target,
  vals:[...],
  dur:seconds,
  mode:mode,
  loop:n
)
```

All parameters are optional unless stated otherwise.

---

## Parameters

### uid:
Target SVG element(s). If omitted, applies to the element on which the cue is defined.
Supports wildcards (e.g. `bars*`).

---

### vals: (required)

Defines the colour values or colour behaviour.

#### 1. Discrete Colour Values

Supported formats:
- Hex (`#f00`, `#ff8800`)
- RGB (`rgb(255,0,0)`)
- HSL (`hsl(120,80%,50%)`)
- Named CSS colours (`red`, `cyan`)

Examples:

```
color(vals:[#f00,#0f0], dur:2)
color(vals:[#f00,#ff0,#0ff], dur:6)
color(vals:Pseq([#f00,#ff0,#0ff],3), dur:3)
color(vals:Prand([#f80,#08f],inf), dur:1.2)
```

Behaviour:
- Each value is treated as a target colour
- Interpolation is performed in HSL space

---

#### 2. Hue Cycling (Continuous)

```
color(vals:hue, dur:6)
```

- Performs a full 360° hue rotation
- `dur` defines time per full cycle
- Saturation and lightness remain unchanged

Range-limited cycle:

```
color(vals:hue(120,240), dur:4)
```

Infinite cycle:

```
color(vals:hue, dur:8, loop:0)
```

---

#### 3. Other HSL Channels (Optional Extension)

```
color(vals:sat(40,90), dur:5)
color(vals:light(30,70), dur:8)
```

---

### dur:
Duration in seconds for one full pass through `vals`.

---

### mode:

Controls interpolation behaviour.

- `linear` (default): smooth interpolation
- `alt`: ping-pong (forward then reverse)
- `step`: hard switching, no interpolation

Examples:

```
color(vals:[#f00,#0f0], dur:2, mode:alt)
color(vals:[#f00,#0f0,#00f], dur:3, mode:step)
```

---

### loop:

Number of repetitions.

```
loop:3   // repeat three times
loop:0   // infinite
```

---

## Behavioural Rules

1. All interpolation occurs in HSL space
2. Hue interpolation is circular (shortest angular path)
3. New cues start from the current colour state
4. Continuous cycling overrides discrete sequencing
5. Animations pause/resume with visibility

---

## Examples

Discrete colour melody:

```
color(vals:[#f00,#ff0,#0ff], dur:6)
```

Alternating palette:

```
color(vals:[#f80,#08f], mode:alt, dur:1.2)
```

Continuous hue field:

```
colour(vals:hue, dur:10, loop:0)
```

Cycle then land:

```
color(vals:hue, dur:8, loop:1)
color(vals:#f00, dur:1)
```

---

## Musical Interpretation (Informative)

- Hue ≈ pitch-class / harmonic field
- Discrete sequences ≈ colour melodies
- Continuous cycling ≈ spectral or energetic fields
- Step mode ≈ rhythmic articulation
