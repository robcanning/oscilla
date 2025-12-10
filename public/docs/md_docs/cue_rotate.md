# rotate() — Rotation Cue

`rotate(...)` rotates an SVG element using continuous rotation or a sequence
of angle values. Rotation may be smooth or stepped, repeating or alternating.

---

# BASIC FORMS

### Continuous
```
rotate(dir:1, dur:1)
```

### Sequence
```
rotate(values:[0,120,240], dur:2)
```

### Pattern sequences
```
rotate(values:Pseq([0,45,10],inf), dur:Pseq([1,0.2,2],inf))
```

---

# TRIGGERING

- `auto` (page mode)
- `edge` (scroll collision)
- cue activation

---

# TRIGGER DELAY

### `tdelay:<seconds>`
Delays motion after trigger.

```
rotate(values:[0,120,240], tdelay:2)
```

---

# PRESTART VISIBILITY

### `prestate:<show|hide|ghost>`

Controls appearance before rotation begins.

```
rotate(values:[0,90,180], tdelay:4, prestate:ghost)
```

Element adopts initial angle immediately.

---

# SEQUENCE PARAMETERS

| Key | Meaning |
|------|---------|
`values` | list of angles  
`dur` | seconds per step  
`mode` | `loop`, `once`, `alternate`  
`interp` | `smooth` or `step`  
`hold` | pause after tween (smooth mode)  

---

# CONTINUOUS ROTATION

```
rotate(dir:1, dur:2)
rotate(dir:-1, dur:3, ease:"easeInOutSine")
```

---

# UID — Live Updates

```
rotate(values:[0,90,180], uid:r1)
rotate(uid:r1, dur:0.5)
```

---

# FULL PARAMETER LIST

| Key | Description |
|------|-------------|
`values` | angle sequence or pattern  
`dur` | duration  
`mode` | loop logic  
`interp` | step or smooth  
`hold` | pause  
`dir` | direction for continuous  
`ease` | easing curve  
`uid` | animation identity  
`trig` | trigger mode  
`tdelay` | trigger delay  
`prestate` | visual pre-start state  

---

# EXAMPLES

```
rotate(values:[0,120,240], dur:4, tdelay:2)
rotate(values:Pshuf([0,180],inf), dur:1, mode:alternate)
rotate(dir:-1, dur:3, prestate:hide, tdelay:1)
```
