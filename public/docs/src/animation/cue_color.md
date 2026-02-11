---
title: Cue Color 
layout: docs_layout.njk
---

# color() / colour() — Colour Animation Cue

Animates the visual colour of SVG elements over time using HSL interpolation.

Both spellings are fully equivalent:

```
color(...)  ≡  colour(...)
```

---

## Quick Examples

```
// Cycle through three colours
color(vals:[#f00, #0f0, #00f], dur:3)

// Continuous rainbow hue rotation
color(vals:hue, dur:10, loop:0)

// Alternating palette (ping-pong)
color(vals:[#f80, #08f], mode:alt, dur:1.2)

// Pattern-driven sequence
color(vals:Pseq([red, yellow, cyan], 4), dur:0.5)
```

---

## Basic Syntax

```
color(
    vals:[...],      // colour values or hue keyword
    dur:seconds,     // duration per transition
    mode:mode,       // interpolation mode
    loop:n           // repetitions (0 = infinite)
)
```

---

## Parameters

### vals: (required)

Defines the colour values or behaviour.

#### Discrete Colour Values

Supported formats:
- **Hex**: `#f00`, `#ff8800`
- **RGB**: `rgb(255, 0, 0)`
- **HSL**: `hsl(120, 80%, 50%)`
- **Named**: `red`, `cyan`, `magenta`

```
color(vals:[#f00, #0f0, #00f], dur:2)
color(vals:[red, yellow, green], dur:3)
```

#### Hue Cycling (Continuous)

Full 360° hue rotation:

```
color(vals:hue, dur:6)
```

Range-limited cycle:

```
color(vals:hue(120, 240), dur:4)
```

This cycles only through the green-to-blue range.

#### Pattern Sequences

```
color(vals:Pseq([#f00, #ff0, #0ff], 3), dur:1)
color(vals:Prand([#f80, #08f, #8f0], inf), dur:0.8)
```

---

### dur:

Duration in seconds for one transition (or one full hue cycle).

```
color(vals:[#f00, #0f0], dur:2)      // 2 seconds per transition
color(vals:hue, dur:10)               // 10 seconds per full rotation
```

Duration can also be a pattern:

```
color(vals:[#f00, #0f0, #00f], dur:Pseq([1, 0.5, 2], inf))
```

---

### mode:

Controls interpolation behaviour.

| Mode | Behaviour |
|------|-----------|
| `linear` | Smooth interpolation (default) |
| `alt` | Ping-pong (forward then reverse) |
| `step` | Hard switching, no interpolation |

```
// Smooth transitions
color(vals:[#f00, #0f0], dur:2, mode:linear)

// Bounce back and forth
color(vals:[#f00, #0f0], dur:2, mode:alt)

// Instant colour changes
color(vals:[#f00, #0f0, #00f], dur:0.5, mode:step)
```

---

### loop:

Number of repetitions.

```
loop:3    // repeat three times then stop
loop:0    // infinite (default for hue cycling)
loop:1    // play once
```

---

### uid:

Unique identifier for the animation instance.

```
color(uid:myColor, vals:hue, dur:5)
```

---

### trig:

Trigger mode.

| Value | Behaviour |
|-------|-----------|
| `auto` | Start immediately on load (default) |
| `playhead` | Start when playhead reaches element |

```
color(vals:[#f00, #00f], dur:2, trig:playhead)
```

---

### tdelay:

Delay before animation starts (seconds).

```
color(vals:hue, dur:6, tdelay:2)    // wait 2 seconds then start
```

---

### prestate:

Initial visibility state before animation starts.

| Value | Effect |
|-------|--------|
| `show` | Visible immediately (default) |
| `hide` | Hidden until triggered |
| `ghost` | Semi-transparent (30% opacity) |
| `fadein(ms)` | Fade in over specified milliseconds |
| `ghostClickable(ms)` | Ghost until clicked |

```
color(vals:hue, dur:5, prestate:hide, trig:playhead)
color(vals:[#f00, #0f0], dur:2, prestate:fadein(1000))
```

---

### target:

Specifies which SVG property to animate.

| Value | Effect |
|-------|--------|
| `both` | Animate fill and stroke (default) |
| `fill` | Animate fill only |
| `stroke` | Animate stroke only |

```
// Animate fill only
color(vals:[#f00, #00f], dur:2, target:fill)

// Animate stroke only (useful for outlines)
color(vals:hue, dur:10, target:stroke)

// Animate both (default)
color(vals:[#f00, #0f0], dur:2, target:both)
```

---

### osc:

Enable OSC output.

| Value | Behaviour |
|-------|-----------|
| `0` | Disabled (default) |
| `1` | Continuous output |

```
color(vals:hue, dur:10, osc:1)
```

OSC output includes:
- `h` — Hue (0–360)
- `s` — Saturation (0–100)
- `l` — Lightness (0–100)
- `hNorm` — Normalised hue (0–1)
- `sNorm` — Normalised saturation (0–1)
- `lNorm` — Normalised lightness (0–1)

---

### oscaddr:

Custom OSC address.

```
color(vals:hue, dur:8, osc:1, oscaddr:/visuals/bg/hue)
```

---

## Colour Interpolation

All interpolation occurs in **HSL colour space**:

- **Hue**: Circular interpolation (shortest angular path)
- **Saturation**: Linear interpolation
- **Lightness**: Linear interpolation

This means transitions between colours feel natural and avoid muddy intermediate tones.

### Shortest Path Hue

When transitioning between hues, Oscilla takes the shortest path around the colour wheel:

```
#f00 → #00f    // Red to Blue: goes via magenta (shorter)
                // NOT via yellow/green (longer)
```

---

## Patterns

### Pseq — Sequential

Plays values in order, repeating a specified number of times.

```
color(vals:Pseq([#f00, #ff0, #0f0], 3), dur:1)
// Plays: red, yellow, green, red, yellow, green, red, yellow, green
```

### Prand — Random

Selects randomly, may repeat the same value consecutively.

```
color(vals:Prand([#f00, #0f0, #00f], inf), dur:0.5)
```

### Pxrand — Exclusive Random

Selects randomly but never repeats the same value twice in a row.

```
color(vals:Pxrand([#f00, #0f0, #00f], inf), dur:0.5)
```

### Pshuf — Shuffle

Shuffles the values, plays through, then reshuffles.

```
color(vals:Pshuf([#f00, #ff0, #0f0, #0ff], 2), dur:0.8)
```

---

## Examples

### Discrete Colour Melody

```
color(vals:[#f00, #ff0, #0ff, #f0f], dur:1.5)
```

### Warm to Cool Transition

```
color(vals:[#f80, #fa0, #ff0, #8f0, #0f8, #0ff], dur:6)
```

### Breathing Glow

```
color(vals:[hsl(200,80%,30%), hsl(200,80%,60%)], mode:alt, dur:2, loop:0)
```

### Continuous Spectrum

```
colour(vals:hue, dur:20, loop:0)
```

### Limited Hue Range

```
color(vals:hue(0, 60), dur:4, loop:0)    // Red to yellow only
color(vals:hue(180, 300), dur:5)          // Cyan to magenta
```

### Rhythmic Colour Pulses

```
color(vals:[#fff, #000], mode:step, dur:0.25, loop:0)
```

### Pattern with Variable Timing

```
color(
    vals:Pseq([#f00, #0f0, #00f], inf),
    dur:Pseq([1, 0.5, 2], inf)
)
```

### Playhead-Triggered Fade

```
color(
    vals:[#333, #f80],
    dur:3,
    trig:playhead,
    prestate:fadein(500)
)
```

### With OSC Output

```
colour(
    vals:hue,
    dur:15,
    loop:0,
    osc:1,
    oscaddr:/stage/wash/hue
)
```

---

## Named Colours Reference

Oscilla recognises these named colours:

| Name | Hue |
|------|-----|
| `red` | 0° |
| `orange` | 30° |
| `yellow` | 60° |
| `green` | 120° |
| `cyan` | 180° |
| `blue` | 240° |
| `purple` | 270° |
| `magenta` | 300° |
| `pink` | 330° |
| `white` | — |
| `black` | — |
| `gray` / `grey` | — |

For precise control, use hex, RGB, or HSL notation.

---

## Tips

1. **Use HSL for control**: `hsl(h, s%, l%)` gives direct control over hue, saturation, and lightness.

2. **Hue cycling for ambience**: `vals:hue` creates slow, evolving colour fields without discrete steps.

3. **Step mode for rhythm**: `mode:step` creates hard cuts useful for rhythmic visual accents.

4. **Alt mode for breathing**: `mode:alt` with two colours creates organic pulsing effects.

5. **Combine with other cues**: Colour animations work alongside scale, rotate, and o2p animations on the same element.

---

## See Also

- [rotate()](/docs/cue-rotate) — Rotation animation
- [scale()](/docs/cue-scale) — Scale animation  
- [o2p()](/docs/cue-o2p) — Object-to-path animation
- [Patterns](/docs/patterns) — Pattern system reference
