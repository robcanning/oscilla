---
title: Cue Speed
layout: docs_layout.njk
---

# speed()

Controls the playback scroll speed of the score.

The `speed()` cue sets the playback speed multiplier. Speed values are **relative to the base speed** set in project preferences. Speed changes may be applied instantly or gradually over time.

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
  Speed multiplier relative to the base speed.  
  `1` = base speed, `0.5` = half base speed, `2` = double base speed.

- **add**  
  Relative adjustment applied to the current speed multiplier.

- **dur**  
  Duration of the speed change in seconds.  
  If omitted, the speed change is applied immediately.

- **ease**  
  Easing curve used during a timed speed change.  
  Defaults to linear.

- **uid**  
  Optional unique identifier for synchronization.

---

## Base Speed Multiplier (Preferences)

The **base speed multiplier** is set in your project's `preferences.json`:

```json
{
  "defaultPlaybackSpeed": 0.3
}
```

All `speed()` cues multiply against this base value:

| Preference | Cue | Actual Speed |
|------------|-----|--------------|
| `0.3` | `speed(1)` | 0.3 (1 × 0.3) |
| `0.3` | `speed(2)` | 0.6 (2 × 0.3) |
| `0.3` | `speed(3)` | 0.9 (3 × 0.3) |
| `1.0` | `speed(0.5)` | 0.5 (0.5 × 1.0) |

This allows you to:
- Set a **global tempo** for the entire piece in preferences
- Use `speed()` cues for **relative tempo changes** within the score
- Adjust overall tempo without editing individual cues

---

## Two Types of Speed Cues

### 1. Position-Based Speed Markers

Simple speed markers embedded in the SVG that apply **instantly** when the playhead crosses them:

```
speed(1)
speed(2)
speed(0.5)
```

These are extracted from SVG elements with IDs starting with `speed(`. They:
- Apply immediately when crossed
- Are position-aware (rewinding past a marker reverts to the previous speed)
- Automatically sync with the server
- Multiply against `baseSpeedMultiplier`

### 2. Triggered Speed Cues (cueSpeed)

Full cue syntax with ramping support:

```
cueSpeed(value:2, dur:3)
```

These support gradual transitions and are triggered like other cues.

---

## Position Awareness

When you **rewind or seek** to a position before a speed marker, the system automatically applies the correct speed for that position:

```
Position:    0 -------- 5000 -------- 10000 -------- 15000
Markers:     speed(1)   speed(3)      speed(1)
             
Playhead at 7000 → speed = 3 × base
Rewind to 3000   → speed = 1 × base (automatically updated)
```

This ensures consistent playback regardless of navigation direction.

---

## Behaviour

- Speed values multiply against `baseSpeedMultiplier` from preferences
- Position-based markers (`speed(x)`) apply instantly when crossed
- Triggered cues (`cueSpeed`) support ramping with `dur` parameter
- Rewinding past a speed marker reverts to the previous speed
- Speed changes sync to all connected clients via the server
- A new speed cue replaces any previously active speed change
- Speed changes affect scrolling, timing, and all time-based cues

---

## Examples

### Simple Position Markers (in SVG)

```
speed(1)
```
Base playback speed.

```
speed(0.5)
```
Half of base speed.

```
speed(2)
```
Double base speed.

### Triggered Cues with Ramping

```
cueSpeed(value:1.25, dur:3)
```
Gradually change to 1.25× base speed over 3 seconds.

```
cueSpeed(add:-0.5, dur:2)
```
Gradually reduce speed multiplier by 0.5 over 2 seconds.

```
cueSpeed(value:2, dur:6, ease:inOutQuad)
```
Smooth, eased speed transition to 2× base speed.

---

## Project Setup

### preferences.json

```json
{
  "defaultPlaybackSpeed": 0.3,
  "duration_minutes": 10,
  "darkMode": false
}
```

### SVG Score

Place speed markers as elements with appropriate IDs:

```xml
<circle id="speed(1)" cx="100" cy="50" r="5" fill="blue"/>
<circle id="speed(3)" cx="5000" cy="50" r="5" fill="red"/>
<circle id="speed(1)" cx="10000" cy="50" r="5" fill="blue"/>
```

The visual element (circle, rect, path, etc.) marks the position; only the `id` matters for the cue system.

---

## Server Synchronization

Speed changes are broadcast to all connected clients:

```javascript
{
  type: "set_speed_multiplier",
  multiplier: 0.9,        // actual speed (cue × base)
  cueSpeed: 3,            // raw cue value
  baseMultiplier: 0.3,    // from preferences
  source: "position_watch"
}
```

The server maintains the authoritative speed state and syncs it at ~4Hz.

---

## Debugging

Check speed state in browser console:

```javascript
console.log("baseSpeedMultiplier:", window.baseSpeedMultiplier);
console.log("speedMultiplier:", window.speedMultiplier);
console.log("speedCueMap:", window.speedCueMap);  // position-based markers
```

Watch speed changes in real-time:
```
[speedWatch] pos=5000, cue=3, base=0.3, actual=0.90, current=0.30
[speedWatch] ⚡ SPEED CHANGE: 0.30 → 0.90 (cue=3 × base=0.3)
```

---

## Notes

- Speed cues modify global playback behaviour
- Only one speed is active at a time
- The performer sees only a cue symbol in the score
- The microsyntax appears only in the SVG `id` field
- Position-based speed is automatically restored when seeking/rewinding
- Base speed from preferences allows global tempo control
