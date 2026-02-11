---
title: ControlXY
layout: docs_layout.njk
---

# controlXY — Multitouch XY Control & Score Animation System

`controlXY` transforms your score into an **interactive animation canvas**. It defines persistent, multitouch XY control surfaces that enable composers to create **complex choreographed animations** directly within the score — the **score-as-instrument, instrument-as-score**.

Unlike traditional time-based cues, `controlXY` provides **continuous spatial control** that can be:
- **Pre-programmed** as animated sequences (choreography)
- **Performed live** as a tactile control surface
- **Hybrid** — switching between automation and manual control

As a bonus, all movements can simultaneously **transmit OSC** for external synthesis and media control.

## Oscilla OSC controller design in Inkscape
<figure class="doc-image">
  <video 
    controls 
    loop 
    muted 
    playsinline
    style="max-width: 800px; width: 100%;"
    src="{{ '/img/oscilla-controlXY-pageview.mp4' | url }}"
    alt="Oscilla controlXY multitouch OSC controller demonstration"
  >
    Your browser does not support the video tag.
  </video>
  <figcaption>
    The <strong>controlXY</strong> multitouch OSC controller created in Inkscape. 
    Each control object can be dragged freely across the canvas, sending X, Y, and rotation (twist) values via OSC. 
    The orange rings indicate touch mode (<code>trig:touch</code>) is active. 
    Multiple simultaneous touches are supported, with each object independently sending its position and rotation state. 
    This example shows the page view with preset management and parameter display.
  </figcaption>
</figure>

---

## Core Concept: Score Animation Through Spatial Control

Think of `controlXY` as a **spatial modulation source** embedded in your score:

1. **Define control pads** with draggable handles
2. **Bind handle positions** to visual/sonic parameters
3. **Animate via presets & sequences** OR **perform live**
4. **Record/playback** spatial gestures as part of the composition

This inverts the traditional "playhead reads static notation" model — instead, **notation becomes dynamic**, responding to spatial control in real-time.

---

## Syntax

```
controlXY(
  uid: <string>,
  touchpt: <element-id> | [<id1>, <id2>, ...],
  handle: <element-id> | [<id1>, <id2>, ...],  // optional: rotation handles
  hmode: continuous | limited | [mode1, mode2, ...],  // optional: rotation behavior
  rotRange: <degrees>,  // optional: rotation range for limited mode
  bounds: <element-id> | "self",
  label: <bool>,
  osc: <bool|number>,
  oscAddr: <string>
)
```

**Note:** For backwards compatibility, if only `handle:` is specified (without `touchpt:`), it refers to XY control elements with no rotation.

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `uid` | string | yes | — | Unique identifier for the control pad. Used for publishing and parameter binding. |
| `touchpt` | element id or array | yes* | — | ID(s) of SVG element(s) for XY position control. Use array syntax for multitouch: `[dot1, dot2, dot3]` |
| `handle` | element id or array | no | — | ID(s) of SVG element(s) for rotation control. Can be single shared handle or parallel array. Omit for XY-only control. |
| `hmode` | `continuous` \| `limited` \| array | no | `continuous` | Rotation behavior: `continuous` wraps at 360°, `limited` stops at min/max like a potentiometer. Use array for per-handle modes. |
| `rotRange` | number | no | `270` (limited)<br>`360` (continuous) | Rotation range in degrees for `limited` mode. Default 270° provides 7 o'clock to 4 o'clock range. |
| `bounds` | element id or "self" | no | `self` | ID of the SVG element that defines the XY constraint area. Defaults to the element the DSL is attached to. |
| `label` | boolean | no | `false` | Show live value labels above each handle. Useful for debugging and performance. |
| `osc` | `true` \| `false` \| number | no | `false` | Enable OSC output. If a number is given, it specifies throttle interval in ms. Default throttle ≈ 30 ms. |
| `oscAddr` | string | no | `controlXY/<uid>` | Custom OSC address (without leading `/`). |

*For backwards compatibility, `handle:` can be used instead of `touchpt:` when not using rotation.

---

## Coordinate System

- **X axis**
  - Left = `0.0`
  - Right = `1.0`

- **Y axis** (musical convention)
  - Bottom = `0.0`
  - Top = `1.0`

All values are **normalized** to the bounding box, making animations resolution-independent.

---

## Rotation Control (Optional)

In addition to XY positioning, handles can have **rotation control** - either as a shared twist handle or individual knobs per touchpoint.

### Rotation Modes: `hmode` Parameter

**`continuous` (default)**
- Full 360° rotation with wraparound
- Rotating past 360° wraps to 0°
- Natural for: azimuth, phase, circular parameters
- Provides endless rotation without hard stops

**`limited`**
- **Hard stops at minimum and maximum** - like a real potentiometer
- Default range: 270° (7 o'clock to 4 o'clock)
- **Cannot wrap** from maximum to minimum or vice versa
- Safe for: volume, gain, pan - prevents accidental jumps
- Custom range via `rotRange:` parameter (e.g., `rotRange:180` for half rotation)

### Rotation Coordinate System

- **0°** = 7 o'clock position (minimum)
- **90°** = 10 o'clock position
- **180°** = 1 o'clock position  
- **270°** = 4 o'clock position (maximum for default `limited` mode)
- Rotation proceeds **clockwise**

### Example Behaviors

**Continuous mode (default):**
```
Rotate clockwise: 350° → 360° → 0° → 10° (wraps smoothly)
Perfect for spatial direction, phase rotation, etc.
```

**Limited mode:**
```
At 0°: Try rotating counterclockwise → STOPS (hard stop at minimum)
At 270°: Try rotating clockwise → STOPS (hard stop at maximum)
Perfect for volume faders, mix levels, etc.
```

---

## Published Signals

### XY Only (No Rotation)
```
controlXY:<uid>.x        // 0.0 — 1.0
controlXY:<uid>.y        // 0.0 — 1.0
controlXY:<uid>.handle   // handle element id
```

### XY + Rotation
```
controlXY:<uid>.x        // 0.0 — 1.0
controlXY:<uid>.y        // 0.0 — 1.0
controlXY:<uid>.p        // 0.0 — 1.0 (rotation, normalized)
controlXY:<uid>.handle   // handle element id
```

### Multiple Handles
```
controlXY:<uid>.<handleId>.x   // 0.0 — 1.0
controlXY:<uid>.<handleId>.y   // 0.0 — 1.0
controlXY:<uid>.<handleId>.p   // 0.0 — 1.0 (rotation, if handle has rotation)
```

**Rotation normalization:**
- **Continuous mode:** `p = angle / 360` (full circle = 0.0 to 1.0)
- **Limited mode:** `p = angle / rotRange` (range = 0.0 to 1.0)

These signals can be bound to **any parameter** in the system, creating direct connections between spatial control and visual/sonic outcomes.

---

## Setup Examples

### Basic Single Handle (XY Only)
```
<rect id="pad1" x="100" y="100" width="400" height="300" 
      fill="#222" stroke="#666"
      cue="controlXY(uid:pad1, touchpt:dot1)"/>

<circle id="dot1" cx="0" cy="0" r="12" fill="#ff4444"/>
```

### XY + Shared Rotation Handle
```
<rect id="synthPad" x="100" y="100" width="400" height="300" 
      fill="#222" stroke="#666"
      cue="controlXY(uid:synth, touchpt:[dot1, dot2], handle:knob, label:true)"/>

<circle id="dot1" cx="0" cy="0" r="12" fill="#ff4444"/>
<circle id="dot2" cx="0" cy="0" r="12" fill="#44ff44"/>
<circle id="knob" cx="0" cy="20" r="6" fill="#ffaa00"/>
```
One rotation handle shared by both touchpoints.

### Volume Mixer with Hard Stops
```
<rect id="mixer" x="100" y="100" width="600" height="400"
      fill="#111"
      cue="controlXY(uid:mixer, 
                    touchpt:[vol1, vol2, vol3, vol4], 
                    handle:fader,
                    hmode:limited,
                    label:true)"/>

<circle id="vol1" cx="0" cy="0" r="10" fill="#ff4444"/>
<circle id="vol2" cx="0" cy="0" r="10" fill="#44ff44"/>
<circle id="vol3" cx="0" cy="0" r="10" fill="#4444ff"/>
<circle id="vol4" cx="0" cy="0" r="10" fill="#ffff44"/>
<circle id="fader" cx="0" cy="15" r="5" fill="#fff"/>
```
Rotation stops at min/max - safe for volume control, no wraparound.

### Mixed Rotation Modes (Array Syntax)
```
<rect id="hybrid" x="100" y="100" width="600" height="300"
      cue="controlXY(uid:hybrid,
                    touchpt:[vol, phase, pan],
                    handle:knob,
                    hmode:[limited, continuous, limited],
                    label:true)"/>
```
Volume and pan use `limited` (hard stops), phase uses `continuous` (wraps).

### Multi-Handle (Multitouch, XY Only)
```
<rect id="mixer" x="100" y="100" width="600" height="400"
      fill="#111"
      cue="controlXY(uid:mixer, touchpt:[fader1,fader2,fader3,fader4], label:true)"/>

<circle id="fader1" cx="0" cy="0" r="10" fill="#ff4444"/>
<circle id="fader2" cx="0" cy="0" r="10" fill="#44ff44"/>
<circle id="fader3" cx="0" cy="0" r="10" fill="#4444ff"/>
<circle id="fader4" cx="0" cy="0" r="10" fill="#ffff44"/>
```

### With OSC Output (XY + Rotation)
```
<rect id="synthControl" x="50" y="50" width="300" height="300"
      cue="controlXY(uid:synth, touchpt:dot1, handle:knob, osc:true, oscAddr:synth/xy)"/>
```
Sends X, Y, and rotation values via OSC.

---

## Animation Workflow: Creating Score Choreography

The true power of `controlXY` emerges when you **pre-program spatial animations** as part of your composition.

### Step 1: Save Spatial States as Presets

**Using the Preset UI:**
1. Press **Alt+Shift+P** to open the preset manager (or click ⚙ on the pad)
2. Move handles to desired positions
3. Type a preset name (e.g., "intro_position")
4. Click 💾 Save

**Via DSL (triggered by playhead or buttons):**
```xml
<!-- Save current state when playhead passes -->
<rect x="100" y="0" width="2" height="600" 
      cue="ui(action:'controlXYSave', preset:'stateA')"
      fill="red" opacity="0.3"/>

<!-- Button to save state -->
<g cue="button(
        trigger:ui(action:'controlXYSave', preset:'verse1'),
        style(label:'Save Verse', x:10, y:10)
      )"/>
```

**Via Console (for experimentation):**
```javascript
// Save all controlXY instances
window.controlXYPresets.save('stateA');

// Save specific pad only
window.controlXYPresets.save('stateB', 'pad1');
```

### Step 2: Recall States with Animation

**Instant recall (no tween):**
```xml
<rect x="500" y="0" width="2" height="600"
      cue="ui(action:'controlXYRecall', preset:'stateA')"
      fill="blue" opacity="0.3"/>
```

**Smooth tween (2 seconds, easing):**
```xml
<rect x="1000" y="0" width="2" height="600"
      cue="ui(action:'controlXYRecall', preset:'stateB', dur:2, ease:'easeInOutSine')"
      fill="green" opacity="0.3"/>
```

**Via button:**
```xml
<g cue="button(
        trigger:ui(action:'controlXYRecall', preset:'chorus', dur:3, ease:'easeOutElastic'),
        style(label:'▶ Chorus', x:10, y:50)
      )"/>
```

### Step 3: Define Sequences (Choreographed Animation)

Sequences are **playlists of presets** that play automatically.

**Define sequence via DSL:**
```xml
<!-- Define a 3-state sequence -->
<rect x="100" y="0" width="2" height="600"
      cue="ui(action:'controlXYDefineSequence', 
              name:'intro_dance', 
              steps:'stateA,stateB,stateC')"
      fill="yellow" opacity="0.3"/>
```

**Play the sequence:**
```xml
<!-- Auto-play when playhead reaches this point -->
<rect x="200" y="0" width="2" height="600"
      cue="ui(action:'controlXYSequence', 
              seq:'intro_dance', 
              dur:2, 
              ease:'easeInOutSine', 
              loop:false)"
      fill="cyan" opacity="0.3"/>
```

**Stop sequence:**
```xml
<rect x="1500" y="0" width="2" height="600"
      cue="ui(action:'controlXYSequenceStop')"
      fill="red" opacity="0.5"/>
```

**Via buttons (interactive control):**
```xml
<!-- Define sequence button -->
<g cue="button(
        trigger:ui(action:'controlXYDefineSequence', 
                    name:'verse_pattern', 
                    steps:'v1,v2,v3,v1'),
        style(label:'Define Pattern', x:10, y:10)
      )"/>

<!-- Play button -->
<g cue="button(
        trigger:ui(action:'controlXYSequence', 
                    seq:'verse_pattern', 
                    dur:1.5, 
                    loop:true),
        style(label:'▶ Play', x:10, y:50)
      )"/>

<!-- Stop button -->
<g cue="button(
        trigger:ui(action:'controlXYSequenceStop'),
        style(label:'■ Stop', x:10, y:90)
      )"/>
```

---

## Rotation Control Use Cases

### When to Use `hmode:limited` (Hard Stops)

**Perfect for:**
- **Volume/Gain controls** - prevents accidental jump from loud to silent
- **Mix levels** - fader-style controls
- **Pan controls** - left-center-right with hard stops
- **Envelope parameters** - attack, decay, sustain, release
- **Filter cutoff** - when you need precise min/max boundaries

**Example:**
```xml
<rect cue="controlXY(uid:mixer, 
                    touchpt:[ch1, ch2, ch3], 
                    handle:volKnob,
                    hmode:limited,
                    rotRange:270)"/>
```
Provides 270° of rotation (7 o'clock to 4 o'clock) with hard stops at both ends.

### When to Use `hmode:continuous` (Wrapping)

**Perfect for:**
- **Spatial positioning** - azimuth, direction, angle
- **Phase controls** - where 0° = 360° naturally
- **LFO rate/frequency** - continuous spinning
- **Cyclical parameters** - anything that wraps by nature
- **Visual rotation** - spinning objects, wheels, orbits

**Example:**
```xml
<rect cue="controlXY(uid:spatial, 
                    touchpt:[src1, src2], 
                    handle:direction,
                    hmode:continuous)"/>
```
Full 360° rotation with smooth wraparound at the 0°/360° boundary.

### Mixed Modes for Hybrid Control

Different parameters on the same pad can have different rotation behaviors:

```xml
<rect cue="controlXY(uid:synth,
                    touchpt:[cutoff, resonance, phase, gain],
                    handle:knob,
                    hmode:[limited, limited, continuous, limited])"/>
```

- **cutoff, resonance, gain:** Hard stops (safe for audio levels)
- **phase:** Wraps naturally (0° = 360°)

---

## Complete Animation Example: Verse-Chorus-Bridge

Here's a **full composition workflow** showing how to choreograph spatial animation:

```xml
<!-- ===== SETUP: Define the control pad ===== -->
<rect id="controlPad" x="100" y="100" width="600" height="400"
      fill="#111" stroke="#333"
      cue="controlXY(uid:mixer, handle:[dot1,dot2,dot3], label:true)"/>

<circle id="dot1" cx="0" cy="0" r="12" fill="#ff4444"/>
<circle id="dot2" cx="0" cy="0" r="12" fill="#44ff44"/>
<circle id="dot3" cx="0" cy="0" r="12" fill="#4444ff"/>

<!-- ===== PLAYHEAD TRIGGERS: Auto-save states ===== -->
<!-- Measure 1: Save intro position -->
<rect x="100" y="0" width="1" height="600"
      cue="ui(action:'controlXYSave', preset:'intro')"
      fill="transparent"/>

<!-- Measure 5: Save verse position -->
<rect x="500" y="0" width="1" height="600"
      cue="ui(action:'controlXYSave', preset:'verse')"
      fill="transparent"/>

<!-- Measure 13: Save chorus position -->
<rect x="1300" y="0" width="1" height="600"
      cue="ui(action:'controlXYSave', preset:'chorus')"
      fill="transparent"/>

<!-- Measure 21: Save bridge position -->
<rect x="2100" y="0" width="1" height="600"
      cue="ui(action:'controlXYSave', preset:'bridge')"
      fill="transparent"/>

<!-- ===== PLAYHEAD AUTOMATION: Recall with tweens ===== -->
<!-- M9: Tween to verse over 2 seconds -->
<rect x="900" y="0" width="2" height="600"
      cue="ui(action:'controlXYRecall', preset:'verse', dur:2, ease:'easeInOutSine')"
      fill="blue" opacity="0.4"/>

<!-- M17: Quick snap to chorus -->
<rect x="1700" y="0" width="2" height="600"
      cue="ui(action:'controlXYRecall', preset:'chorus', dur:0.5, ease:'easeOutQuad')"
      fill="green" opacity="0.4"/>

<!-- M25: Elastic bounce to bridge -->
<rect x="2500" y="0" width="2" height="600"
      cue="ui(action:'controlXYRecall', preset:'bridge', dur:3, ease:'easeOutElastic')"
      fill="purple" opacity="0.4"/>

<!-- ===== SEQUENCES: Complex multi-step animations ===== -->
<!-- M29: Define and play verse pattern -->
<rect x="2900" y="0" width="1" height="600"
      cue="ui(action:'controlXYDefineSequence', 
              name:'verse_pattern', 
              steps:'verse,intro,verse')"
      fill="transparent"/>

<rect x="2950" y="0" width="2" height="600"
      cue="ui(action:'controlXYSequence', 
              seq:'verse_pattern', 
              dur:1, 
              loop:false)"
      fill="yellow" opacity="0.4"/>

<!-- M40: Stop all automation, return to intro -->
<rect x="4000" y="0" width="2" height="600"
      cue="ui(action:'controlXYSequenceStop')"
      fill="red" opacity="0.5"/>

<rect x="4020" y="0" width="2" height="600"
      cue="ui(action:'controlXYRecall', preset:'intro', dur:4, ease:'easeInOutSine')"
      fill="cyan" opacity="0.4"/>

<!-- ===== MANUAL OVERRIDE: Buttons for live performance ===== -->
<!-- Performers can override automation at any time -->
<g cue="button(
        trigger:ui(action:'controlXYRecall', preset:'intro', dur:2),
        style(label:'⏮ Intro', x:10, y:500, width:80)
      )"/>

<g cue="button(
        trigger:ui(action:'controlXYRecall', preset:'verse', dur:1.5),
        style(label:'V Verse', x:100, y:500, width:80)
      )"/>

<g cue="button(
        trigger:ui(action:'controlXYRecall', preset:'chorus', dur:1),
        style(label:'C Chorus', x:190, y:500, width:80)
      )"/>

<g cue="button(
        trigger:ui(action:'controlXYSequenceStop'),
        style(label:'■ Stop Auto', x:280, y:500, width:100)
      )"/>
```

---

## Binding to Score Elements: Creating Visual Animations

This is where **spatial control becomes visual transformation**.

### Position Control
```xml
<!-- Dot X position controls rectangle X position -->
<rect id="box1"
      cue="scale(uid:box1, tx:mixer.dot1.x[-200,200])"/>
```

### Size/Scale Control
```xml
<!-- Dot Y controls vertical scale -->
<rect id="box2"
      cue="scale(uid:box2, sy:mixer.dot1.y[0.5,2.0])"/>
```

### Rotation Control
```xml
<!-- Map X position to rotation angle -->
<g id="spinner"
   cue="rotate(uid:spinner, values:mixer.dot1.x[0,360])"/>
```

### Binding Handle Rotation (p)
```xml
<!-- Map the handle's twist (p) to element rotation -->
<g id="dial"
   cue="rotate(uid:dial, values:mixer.ch1.p[0,360])"/>

<!-- Use p for filter cutoff via OSC binding -->
<rect id="filterPad"
      cue="controlXY(uid:filter, touchpt:dot1, handle:knob, hmode:limited, osc:true)"/>
```
When handles have rotation, the `p` value (0.0–1.0) is saved in presets, tweened between presets, and published alongside `x` and `y`.

### Color Control
```xml
<!-- Y position controls hue -->
<circle id="colorDot"
        cue="color(uid:colorDot, hue:mixer.dot1.y[0,360])"/>
```

### Opacity Control
```xml
<!-- X position fades element -->
<rect id="fader"
      cue="fade(uid:fader, opacity:mixer.dot1.x)"/>
```

### Multi-Parameter Complex Animation
```xml
<!-- Dot1 controls rotation, Dot2 controls scale, Dot3 controls opacity -->
<g id="complexShape">
  <rect cue="rotate(uid:r1, values:mixer.dot1.x[0,360])
            scale(uid:s1, sx:mixer.dot2.x[0.5,2], sy:mixer.dot2.y[0.5,2])
            fade(uid:f1, opacity:mixer.dot3.y)"/>
</g>
```

### Spatial Navigation
```xml
<!-- Two handles define start/end points of a loop region -->
<g cue="o2p(path:loopA, start:mixer.dot1.x, end:mixer.dot2.x)"/>
```

---

## Advanced: Programmatic Animation via Console

For complex choreography, you can script animations directly:

### Tweening Without Presets
```javascript
// Tween specific handles to target positions over 2 seconds
window.controlXYPresets.tweenTo({
  pad1: {
    dot1: { x: 0.5, y: 0.5 },
    dot2: { x: 0.2, y: 0.8 }
  }
}, { dur: 2, ease: 'easeInOutSine' });

// Include rotation (p) — tweens smoothly alongside x/y
window.controlXYPresets.tweenTo({
  mixer: {
    ch1: { x: 0.3, y: 0.7, p: 0.75 },
    ch2: { x: 0.8, y: 0.2, p: 0.25 }
  }
}, { dur: 3, ease: 'easeOutElastic' });
```

### Complex Sequences with Per-Step Timing
```javascript
// Define sequence with variable timing
window.controlXYPresets.defineSequence('complex_dance', [
  { preset: 'position1', dur: 2 },
  { preset: 'position2', dur: 1 },
  { preset: 'position3', dur: 3 },
  { preset: 'position1', dur: 2 }
]);

// Play with custom options
window.controlXYPresets.playSequence('complex_dance', {
  loop: true,
  onStep: (step, preset) => console.log(`Now: ${preset}`)
});
```

### Per-Handle Timing Control
```javascript
// Staggered animation - each handle moves independently
window.controlXYPresets.recall('myPreset', {
  handles: {
    dot1: { dur: 2, delay: 0, ease: 'easeInOutSine' },
    dot2: { dur: 1.5, delay: 0.5, ease: 'easeOutQuad' },
    dot3: { dur: 1, delay: 1, ease: 'easeOutElastic' }
  }
});
```

---

## Easing Functions

Choose from 15 easing functions to shape your animations:

| Number | Name | Character |
|--------|------|-----------|
| 0 | `linear` | Constant speed |
| 1 | `easeInSine` | Slow start |
| 2 | `easeOutSine` | Slow end |
| 3 | `easeInOutSine` | Smooth both ends |
| 4 | `easeInQuad` | Accelerate |
| 5 | `easeOutQuad` | Decelerate |
| 6 | `easeInOutQuad` | Smooth acceleration |
| 7 | `easeInCubic` | Strong acceleration |
| 8 | `easeOutCubic` | Strong deceleration |
| 9 | `easeInOutCubic` | Powerful smooth |
| 10 | `easeInBack` | Anticipation (goes backward first) |
| 11 | `easeOutBack` | Overshoot |
| 12 | `easeInOutBack` | Anticipation + overshoot |
| 13 | `easeInElastic` | Elastic snap-in |
| 14 | `easeOutElastic` | Bouncy arrival |

Use by name or number in DSL:
```xml
<!-- By name -->
cue="ui(action:'controlXYRecall', preset:'state1', dur:2, ease:'easeOutElastic')"

<!-- By number -->
cue="ui(action:'controlXYRecall', preset:'state1', dur:2, ease:14)"
```

---

## Complete DSL Action Reference

All `controlXY` preset actions work through `ui(action:...)` syntax.

### 1. Save Preset
```xml
<!-- Save all pads -->
ui(action:"controlXYSave", preset:"stateName")

<!-- Save specific pad -->
ui(action:"controlXYSave", preset:"stateName", uid:"pad1")
```

**Examples:**
```xml
<!-- Playhead trigger -->
<rect x="500" cue="ui(action:'controlXYSave', preset:'verse1')"/>

<!-- Button -->
<g cue="button(
        trigger:ui(action:'controlXYSave', preset:'myState'),
        style(label:'Save State', x:10, y:10)
      )"/>
```

### 2. Recall Preset
```xml
<!-- Instant -->
ui(action:"controlXYRecall", preset:"stateName")

<!-- With tween -->
ui(action:"controlXYRecall", preset:"stateName", dur:2, ease:"easeInOutSine")
```

**Examples:**
```xml
<!-- Playhead trigger with animation -->
<rect x="1000" 
      cue="ui(action:'controlXYRecall', preset:'chorus', dur:3, ease:'easeOutElastic')"/>

<!-- Button with quick snap -->
<g cue="button(
        trigger:ui(action:'controlXYRecall', preset:'breakdown', dur:0.5),
        style(label:'⚡ Breakdown', x:10, y:50)
      )"/>
```

### 3. Define Sequence
```xml
ui(action:"controlXYDefineSequence", name:"seqName", steps:"preset1,preset2,preset3")
```

**Examples:**
```xml
<!-- Define on load -->
<rect x="100" 
      cue="ui(action:'controlXYDefineSequence', 
              name:'intro_pattern', 
              steps:'a,b,c,a')"/>

<!-- Button to create sequence -->
<g cue="button(
        trigger:ui(action:'controlXYDefineSequence', 
                    name:'verse_loop', 
                    steps:'verse1,verse2,verse1'),
        style(label:'Create Loop', x:10, y:90)
      )"/>
```

### 4. Play Sequence
```xml
ui(action:"controlXYSequence", seq:"seqName", dur:2, ease:"easeInOutSine", loop:true)
```

**Examples:**
```xml
<!-- Auto-play when playhead hits -->
<rect x="2000" 
      cue="ui(action:'controlXYSequence', 
              seq:'intro_pattern', 
              dur:1.5, 
              loop:false)"/>

<!-- Button with looping -->
<g cue="button(
        trigger:ui(action:'controlXYSequence', 
                    seq:'verse_loop', 
                    dur:2, 
                    loop:true),
        style(label:'▶ Loop Verse', x:10, y:130)
      )"/>
```

### 5. Stop Sequence
```xml
ui(action:"controlXYSequenceStop")
```

**Examples:**
```xml
<!-- Playhead trigger -->
<rect x="4000" cue="ui(action:'controlXYSequenceStop')"/>

<!-- Button -->
<g cue="button(
        trigger:ui(action:'controlXYSequenceStop'),
        style(label:'■ Stop', x:10, y:170)
      )"/>
```

---

## OSC Output (Bonus Feature)

While spatial animation is the primary use case, all handle movements can **simultaneously control external software**.

### Enable OSC
```xml
<rect id="pad1" 
      cue="controlXY(uid:synth, touchpt:dot1, osc:true)"/>
```

### Custom Address & Throttle
```xml
<rect id="pad1"
      cue="controlXY(uid:synth, touchpt:dot1, osc:50, oscAddr:'max/xy')"/>
```

### OSC Messages Sent

**XY only (no rotation):**
```
/controlXY/synth 0.42 0.87
```

**XY + Rotation:**
```
/controlXY/synth 0.42 0.87 0.65
```
Third value is rotation (0.0-1.0, normalized by `hmode`).

**Multiple handles:**
```
/controlXY/synth/dot1 0.42 0.87 0.33
/controlXY/synth/dot2 0.15 0.63 0.78
```

**Custom address:**
```
/max/xy 0.42 0.87 0.65
```

Works with Max/MSP, Pure Data, SuperCollider, TouchOSC, and any OSC-compatible software.

---

## Preset Panel UI

### Opening the Panel

1. **Click ⚙ button** in top-right of any controlXY pad
2. **Keyboard: Alt+Shift+P**
3. **Console: `window.controlXYPresetUI.toggle()`**

### Panel Features

- **Save Section:** Type name, click 💾
- **Presets List:** Click ▶ to recall, 🗑 to delete
- **Recall Options:** Set duration (seconds) and easing
- **Sequences:** Play/stop defined sequences
- **Import/Export:** Save/load preset files

### Keyboard Shortcut

**Alt+Shift+P** toggles the panel (changed from Ctrl+Shift+P to avoid Chrome conflict).

---

## Storage & Persistence

Presets auto-save to `scores/<project>/controlxy-presets.json`:

```json
{
  "presets": {
    "intro": {
      "pad1": {
        "dot1": { "x": 0.25, "y": 0.75, "p": 0.33 },
        "dot2": { "x": 0.80, "y": 0.30, "p": 0.67 }
      }
    }
  },
  "sequences": {
    "verse_pattern": ["verse1", "verse2", "verse1"]
  },
  "updatedAt": 1704067200000,
  "projectId": "myProject"
}
```

The `p` value stores rotation (0.0-1.0) if the handle has rotation control. It is saved, recalled, and **smoothly tweened** between presets just like `x` and `y`. Loaded automatically when project loads.

---

## CSS Styling

### Handle Classes
```css
.controlxy-handle {
  cursor: grab;
  transition: opacity 0.15s;
}

.controlxy-handle:hover {
  opacity: 0.8;
}

.controlxy-handle--active {
  cursor: grabbing;
  filter: drop-shadow(0 0 10px rgba(100, 200, 255, 0.9));
}
```

### Label Styling
```css
.controlxy-label {
  font-family: 'SF Mono', 'Monaco', monospace;
  font-size: 11px;
  fill: #fff;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8));
}
```

### Toggle Button
The ⚙ button is automatically added to each pad's top-right corner. Style via:
```css
.controlxy-toggle-btn {
  background: rgba(30, 30, 30, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.controlxy-toggle-btn:hover {
  background: rgba(30, 30, 30, 1);
  transform: scale(1.1);
}
```

---

## Complete API Reference

### JavaScript Console API

```javascript
// ===== PRESETS =====
controlXYPresets.save(name, uidFilter?)
controlXYPresets.recall(name, options?)
controlXYPresets.delete(name)
controlXYPresets.list()                    // Returns array of preset names
controlXYPresets.get(name)                 // Returns preset data

// ===== TWEENING =====
controlXYPresets.tweenTo(positions, options?)  // positions: { uid: { handleId: { x, y, p? } } }
controlXYPresets.stopAllTweens()

// ===== SEQUENCES =====
controlXYPresets.defineSequence(name, steps)
controlXYPresets.playSequence(name, options)
controlXYPresets.stopSequence()
controlXYPresets.getActiveSequence()       // Returns current sequence info

// ===== SCENES =====
controlXYPresets.saveScene(name)           // Save all handle positions + launcher state
controlXYPresets.recallScene(name, options?)  // Recall scene (supports dur/ease tweening)
controlXYPresets.deleteScene(name)
controlXYPresets.listScenes()
controlXYPresets.getScene(name)

// ===== PERSISTENCE =====
controlXYPresets.init(projectId)           // Called automatically
controlXYPresets.export()                  // Returns JSON string
controlXYPresets.import(json, merge?)
controlXYPresets.importFromProject(projectId, merge?)

// ===== UI =====
controlXYPresetUI.show()
controlXYPresetUI.hide()
controlXYPresetUI.toggle()
controlXYPresetUI.refresh()
```

---

## Compositional Patterns

### Pattern 1: Verse-Chorus Automation
```
1. Save state at verse start
2. Save state at chorus start  
3. Tween between them at transitions
4. Add button overrides for live performance
```

### Pattern 2: Looping Textures
```
1. Define 3-4 related states
2. Create sequence with varied timing
3. Loop sequence with `loop:true`
4. Bind to visual parameters for evolving texture
```

### Pattern 3: Build-Tension-Release
```
1. Start at calm state (center, low values)
2. Sequence through increasingly tense positions
3. Climax: rapid sequence or elastic bounce
4. Release: slow tween back to calm
```

### Pattern 4: Call-Response
```
1. Manual control for "call" phrase
2. Automated sequence for "response"
3. Alternate between live and programmed
```

### Pattern 5: Polytemporal Layers
```
1. Multiple pads, each with own sequence
2. Different loop lengths (3, 5, 7 steps)
3. Creates phasing/evolving relationships
4. Each pad controls different visual layer
```

---

## Technical Notes

- `controlXY` is a **control-plane cue**, not temporal
- Registered during `assignCues()`, not via playhead
- Handles initialized at center of bounds (XY) and 0° rotation
- Uses Pointer Events API (works with touch, mouse, stylus)
- All tweening uses `requestAnimationFrame` for smooth 60fps
- Event propagation stopped to prevent score dragging
- Multi-touch: each pointer controls nearest available handle
- **Rotation handles:**
  - Can be shared (one handle for all touchpoints) or individual
  - Coordinate system: 0° = 7 o'clock, clockwise positive
  - `limited` mode applies hard stops using angle clamping
  - `continuous` mode normalizes angles to 0-360° with wraparound

---

## Summary

`controlXY` fundamentally transforms the score from **static notation** into **dynamic canvas**. By combining:

1. **Spatial control surfaces** (the pads)
2. **Parameter binding** (connecting space to parameters)
3. **Preset/sequence system** (programming choreography)
4. **Live performance** (manual override)

...composers gain the ability to create **complex, evolving visual/sonic animations** directly within the score itself. The score becomes both **instrument and notation**, collapsing the traditional divide between composition and performance.

As a bonus, OSC output allows the same spatial gestures to control external synthesis and media systems, making `controlXY` a **unified interface** for all aspects of a multimedia performance.

**Score-as-instrument. Instrument-as-score.**

---

## Quick Start Checklist

1. Add CSS: `<link rel="stylesheet" href="controlxy-preset-ui.css">`
2. Define pad: `<rect cue="controlXY(uid:pad1, touchpt:dot1)"/>`
3. *Optional:* Add rotation: `handle:knob, hmode:limited` for volume-style controls
4. Open UI: Press **Alt+Shift+P** or click ⚙
5. Save states: Move handles, name them, click 💾
6. Animate: Use `ui(action:'controlXYRecall', ...)` on playhead triggers
7. Choreograph: Define sequences, play/loop them
8. Bind: Connect handle positions to visual parameters
9. Perform: Override automation with buttons or manual control

Now go create some animated score-instruments! 
