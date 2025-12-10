# cue:scale — Scaling Animation

`scale()` adjusts the size of SVG objects using sequences, patterns, continuous pulsing, or independent X/Y scaling.

---

# BASIC FORMS

### Uniform scaling
```
scale(values:[1,1.5,1], dur:2)
```

### Non-uniform (XY)
```
scaleXY([1,1.3],[1,0.6], dur:1)
```

### Continuous pulse
```
scale(min:1, max:1.3, dur:2)
```

---

# TRIGGERING

- automatic page-mode  
- scroll edge  
- cue activation  

---

# TRIGGER DELAY

### `tdelay:<seconds>`
Delays scaling start.

```
scale(values:[1,1.4,1], tdelay:3)
```

---

# PRESTART VISIBILITY

### `prestate:<show|hide|ghost>`

```
scale([1,1.5,1], tdelay:4, prestate:ghost)
```

Initial scale is applied immediately.

---

# SEQUENCES

| Key | Meaning |
|------|--------|
`values` | uniform scale list  
`x`, `y` | independent XY sequences  
`dur` | duration per step  
`mode` | loop / once / alternate  
`interp` | smooth / step  
`hold` | pause (smooth only)  

Pattern forms (`Pseq`, `Prand`, etc.) supported for all parameters.

---

# CONTINUOUS SCALING

```
scale(min:1, max:1.4, dur:1.5, loop:0)
```

---

# UID — Live Updates

```
scale(values:[1,1.2,1], uid:s1)
scale(uid:s1, dur:0.5)
```

---

# FULL PARAMETER LIST

| Key | Description |
|------|-------------|
`values` | scalar sequence  
`x`, `y` | axis-specific sequences  
`dur` | step duration  
`hold` | pause  
`ease` | tween curve  
`mode` | loop logic  
`interp` | smooth/step  
`uid` | animation identity  
`trig` | trigger  
`tdelay` | delay after trigger  
`prestate` | pre-start visual state  

---

# EXAMPLES

```
scale([1,2,1], dur:2, tdelay:3)
scaleXY([1,1.4],[1,0.6], dur:1)
scale(Pseq([1,1.5,1],inf), dur:Prand([0.5,1],inf))
```
