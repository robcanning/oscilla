
# Animation Namespace Cheat Sheet

## 1. Path Following (`obj2path-*`)

**ID Format:**

```
obj2path-<pathID>[_speed_<seconds>][_direction_<mode>][_rotate_0][-uid_<unique>]
```

- `pathID`: Matches an SVG path with ID `path-<pathID>`
- `_speed_`: Seconds per full path loop
- `_direction_`: Path motion mode
- `_rotate_0`: Disable rotation-to-path direction
- `-uid_###`: Optional unless duplicating config

### Direction Modes

- 0: Pingpong (forward & back)
- 1: Forward loop
- 2: Reverse loop
- 3: Random jump
- 4: Fixed segment hops
- 5: Ghost morph between path sets

```plaintext
obj2path-spiral_speed_6_direction_0
obj2path-601427_speed_4_direction_1-uid_002
```

---

## 2. In-Place Rotation (`obj_rotate_*`)

**ID Format:**

```
obj_rotate_rpm_<value>[_dir_0|1][_pivot_x_px][_pivot_y_px][_dur_sec][_ease_type][_alternate_deg_deg]-uid_###
```

- `_rpm_`: Revolutions per minute
- `_dir_`: 0 = counterclockwise, 1 = clockwise
- `_pivot_x_ / _pivot_y_`: Custom pivot (px)
- `_dur_`: Optional duration to stop animation
- `_ease_`: Anime.js easing (see below)
- `_alternate_deg_`: Enables ping-pong rotation between + and – angle
- `-uid_###`: Required (DOM ID uniqueness)

### Examples

```plaintext
obj_rotate_rpm_1.2-uid_001
obj_rotate_rpm_2_dir_0_ease_easeInOutSine-uid_002
obj_rotate_rpm_30_alternate_deg_45_ease_easeInOutCirc_dir_1-uid_003
```

### Alternate (Ping-Pong) Rotation

Use `_alternate_deg_45` to swing back and forth ±45°. Direction `_dir_0` or `_dir_1` sets initial direction (CCW or CW).

---

## 3. Anime.js Cue Triggers (`cue_animejs_*`)

**ID Format:**

```
cue_animejs_<filename>[_order_0|1|2]
```

- `_order_0`: Random (default)
- `_order_1`: Sequential
- `_order_2`: All at once

```plaintext
cue_animejs_intro
cue_animejs_panelzoom_order_1
```

---

## 4. Scale Animations (`s_*`)

**ID Format:**

```
s_seq_<values>[_mode][_seqdur_N][_dur_1_2_1][_ease_X][_pivot_x_px][_pivot_y_px]
```

- `s_seq_1_1.5`: scale from 1 to 1.5
- `mode`: `once`, `alt`, `bounce`, `pulse`, `pde`
- `seqdur_N`: total sequence duration in seconds (e.g. `seqdur_3`)
- `dur_1_2_1`: relative durations per step (cycled if fewer than values)
- `ease_X`: easing ID (0–9, see below)
- `pivot_x_`, `pivot_y_`: override transform origin in px

### Random Sequences

- `s_seq_r5_2-7`: 5 random steps between 2–7 (fixed)
- `s_seq_r5x2-7`: 5 values between 2–7, re-randomized on each loop
- `s_seq_2-7_rnd5x`: verbose equivalent

### Examples

```plaintext
s_seq_1_1.5_alt_seqdur_4_ease_3
s_seq_1.0_1.5_1.0_alt_dur_1_2_1_seqdur_3
s_seq_r5x2-6_alt_seqdur_5_ease_7
s_seq_1_3_5_once_ease_2
```

---

## Easing Options (`_ease_*`)

Underscores in easing names are converted to dashes automatically.

You can also use compact numeric aliases (0–9):

```plaintext
0: linear
1: easeInSine
2: easeOutSine
3: easeInOutSine
4: easeInBack
5: easeOutBack
6: easeInOutBack
7: easeInElastic
8: easeOutElastic
9: easeInOutElastic
```

---

## Nesting Rotations (Only)

You can nest rotating groups within each other. This allows for:

- Clock faces with rotating hands  
- Radial widgets with animated arms  
- Metronome-like motion inside a rotating frame

### Example

```xml
<g id="obj_rotate_rpm_0.25-uid_outer">
  <g id="obj_rotate_rpm_30_alternate_deg_45_ease_easeInOutSine-uid_inner">
    ...
  </g>
</g>
```
