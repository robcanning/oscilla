# SVG Animation Guide: Rotate + Scale (with Real-World Analogies)

This guide shows how to animate SVG objects using compact namespaces inside element IDs.
We focus on `rotate` and `scale` behavior using `startRotate()` and `startScale()` functions.

---

## 🔁 Rotation (`startRotate`)

### 🔀 Modes

1. **Ping-pong (oscillating like a metronome)**
```html
<g id="r_alt(45)_speed(0.8)_ease(3)">
```
- Rotates back and forth between ±45°
- Smooth easing makes it swing like a pendulum
- Think: **metronome** or **windshield wiper**

2. **Stepwise Rotation (compass needle behavior)**
```html
<g id="r_deg[0,90,180,270]_speed(0.6)_dur[1,1,1]_ease(2)">
```
- Jumps to each angle, with pauses
- Smooth or snappy depending on easing
- Think: **compass dial**, **radar sweep**

3. **Random Angles with Regeneration (erratic scanner or satellite dish)**
```html
<g id="r_deg[rnd(6x90-270x)]_dur[rnd(6x0.5-1.5x)]_speed(0.4)_ease[3,5,6]">
```
- Re-generates a new pattern each loop
- Think: **sonar blip**, **sci-fi antenna sweep**

4. **Continuous Rotation (clock hands or fan blades)**
```html
<g id="r_rpm(2)_dir(1)_ease(1)">
```
- Spins clockwise at 2 revolutions per minute
- Can be reversed with `dir(-1)`
- Think: **clock**, **vinyl turntable**, **weather vane**

---

## 🔍 Scale (`startScale`)

### 🔧 Behavior Types

1. **Jittery or flickering growth (like an error signal or distressed object)**
```html
<circle id="s[rnd(8x0.2-1.2x)]_ease(0)_seqdur(2)">
```
- Linear, rapid changes in size
- Think: **alert pulse**, **spark jitter**

2. **Pulsating like a heartbeat or organic breathing**
```html
<circle id="s[1.0, 1.2, 1.5, 1.2, 1.0]_ease(3)_seqdur(4)_pulse">
```
- Grows and shrinks smoothly and rhythmically
- Think: **heartbeat**, **jellyfish**, **LED pulse**

3. **Swell and fade loop (like inflating/deflating balloon)**
```html
<circle id="s[rnd(6x0.5-2x)]_ease(2)_seqdur(6)_alt">
```
- Random size changes, mirrored motion
- Think: **breathing lung**, **hovering drone**

4. **Quick flashes (like blinking light or system alert)**
```html
<circle id="s[1, 2, 1]_ease(0)_seqdur(1.5)_once">
```
- One quick scale burst
- Think: **lightbulb pop**, **system alert blip**

---

## 🧩 Combining Rotate + Scale

You can nest groups to combine animations.

### Example: Spinning and Breathing LED
```html
<g id="r_rpm(1)_ease(1)">
  <circle id="s[1,1.5,1]_seqdur(4)_ease(3)_pulse" r="10" fill="red"/>
</g>
```
- Spins slowly like a fan
- Pulses softly like an LED or breathing light

### Example: Metronome Oscillating + Jitter
```html
<g id="r_alt(30)_speed(1)_ease(3)">
  <g id="s[rnd(6x0.8-1.2x)]_seqdur(2)_ease(0)">
    <rect width="10" height="50" fill="black"/>
  </g>
</g>
```

---

## ✨ Syntax Cheatsheet

| Feature        | Syntax                           | Description                              |
|----------------|----------------------------------|------------------------------------------|
| Alternate      | `alt(45)`                        | Oscillates between +angle and -angle     |
| Continuous     | `rpm(2)_dir(-1)`                 | Spins continuously                       |
| Step sequence  | `deg[0,90,180]`                  | Exact angles in order                    |
| Random angles  | `deg[rnd(6x0-360x)]`             | Regenerating random targets              |
| Pause durations| `dur[rnd(5x0.5-1.5)]`            | Time between steps                       |
| Speed          | `speed(0.5)`                     | Duration of each move                    |
| Easing         | `ease(3)`, `ease[1,2,3]`         | Smoothness of motion                     |
| Pivot          | `pivot(50%,100%)`, `pivot_x(100)`| Center of rotation                       |
| Sequence time  | `seqdur(5)`                      | Total duration for entire sequence       |

---

Let me know if you'd like this extended with `opacity`, `stroke`, `articulation`, or cue-trigger examples.