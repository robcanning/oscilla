---
title: Cue Speed
layout: docs_layout.njk
---

# speed()

Controls the playback scroll speed of the score.

The `speed()` cue sets the global playback speed multiplier.  
Speed changes may be applied instantly or gradually over time.

---

## Syntax

```
speed(
  value:<multiplier>,
  add:<offset>,
  dur:<seconds>,
  ease:<easing>,
  uid:<id>
)
```

Shorthand (positional):

```
speed(<multiplier>)
```

---

## Parameters

- **value**  
  Absolute speed multiplier.  
  `1` = normal speed, `0.5` = half speed, `2` = double speed.

- **add**  
  Relative adjustment applied to the current speed.

- **dur**  
  Duration of the speed change in seconds.  
  If omitted, the speed change is applied immediately.

- **ease**  
  Easing curve used during a timed speed change.  
  Defaults to linear.

- **uid**  
  Optional unique identifier for synchronization.

---

## Behaviour

- When triggered, the cue updates the global playback speed.
- If `dur` is provided, the speed changes smoothly over the specified duration.
- If `dur` is omitted, the speed change is applied instantly.
- A new speed cue replaces any previously active speed change.
- Speed changes affect scrolling, timing, and all time-based cues.

---

## Examples

```
speed(1)
```
Normal playback speed.

```
speed(0.5)
```
Half playback speed.

```
speed(2)
```
Double playback speed.

```
speed(value:1.25, dur:3)
```
Gradually increase speed to 1.25× over 3 seconds.

```
speed(add:-0.2, dur:2)
```
Gradually slow down relative to the current speed.

```
speed(value:1.4, dur:6, ease:inOutQuad)
```
Smooth, eased speed transition.

---

## Notes

- Speed cues modify global playback behaviour.
- Only one speed change is active at a time.
- The performer sees only a cue symbol in the score.
- The microsyntax appears only in the SVG `id` field.
