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

---

## Core Concept: Score Animation Through Spatial Control

Think of `controlXY` as a **spatial modulation source** embedded in your score:

1. **Define control pads** with draggable handles
2. **Bind handle positions** to visual/sonic parameters
3. **Animate via presets & sequences** OR **perform live**
4. **Save/recall scenes** for complete state snapshots
5. **Use the launcher** for quick access during performance

This inverts the traditional "playhead reads static notation" model — instead, **notation becomes dynamic**, responding to spatial control in real-time.

---

## Syntax

```
controlXY(
  uid: <string>,
  handle: <element-id> | [<id1>, <id2>, ...],
  bounds: <element-id> | "self",
  label: <bool>,
  osc: <bool|number>,
  oscAddr: <string>
)
```

The cue expression is attached to the **bounding element** (or any element if using explicit `bounds`).

---

## Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `uid` | string | yes | — | Unique identifier for the control pad. Used for publishing and parameter binding. |
| `handle` | element id or array | yes | — | ID(s) of SVG element(s) that are draggable inside the bounds. Use array syntax for multitouch: `[dot1, dot2, dot3]` |
| `bounds` | element id or "self" | no | `self` | ID of the SVG element that defines the XY constraint area. Defaults to the element the DSL is attached to. |
| `label` | boolean | no | `false` | Show live value labels above each handle. Useful for debugging and performance. |
| `osc` | `true \| false \| number` | no | `false` | Enable OSC output. If a number is given, it specifies throttle interval in ms. Default throttle ≈ 30 ms. |
| `oscAddr` | string | no | `controlXY/<uid>` | Custom OSC address (without leading `/`). |

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

## Published Signals

### Single Handle
```
controlXY:<uid>.x        // 0.0 — 1.0
controlXY:<uid>.y        // 0.0 — 1.0
controlXY:<uid>.handle   // handle element id
```

### Multiple Handles
```
controlXY:<uid>.<handleId>.x   // 0.0 — 1.0
controlXY:<uid>.<handleId>.y   // 0.0 — 1.0
```

These signals can be bound to **any parameter** in the system, creating direct connections between spatial control and visual/sonic outcomes.

---

## Setup Examples

### Basic Single Handle
```
<rect id="pad1" x="100" y="100" width="400" height="300" 
      fill="#222" stroke="#666"
      cue="controlXY(uid:pad1, handle:dot1)"/>

<circle id="dot1" cx="0" cy="0" r="12" fill="#ff4444"/>
```

### Multi-Handle (Multitouch)
```
<rect id="mixer" x="100" y="100" width="600" height="400"
      fill="#111"
      cue="controlXY(uid:mixer, handle:[fader1,fader2,fader3,fader4], label:true)"/>

<circle id="fader1" cx="0" cy="0" r="10" fill="#ff4444"/>
<circle id="fader2" cx="0" cy="0" r="10" fill="#44ff44"/>
<circle id="fader3" cx="0" cy="0" r="10" fill="#4444ff"/>
<circle id="fader4" cx="0" cy="0" r="10" fill="#ffff44"/>
```

### With OSC Output
```
<rect id="synthControl" x="50" y="50" width="300" height="300"
      cue="controlXY(uid:synth, handle:dot1, osc:true, oscAddr:synth/xy)"/>
```

---

## Mute / Manual Override Mode

During performance, you may want to take manual control of specific handles while letting sequences continue to control others. The **mute** feature lets you exclude individual handles from automation.

### How It Works

1. **Click on any handle** — a small toggle overlay appears briefly (2 seconds)
2. **Click the overlay** to toggle between:
   - **A** (green) = Auto mode — handle responds to presets/sequences
   - **M** (red) = Muted — handle ignores automation, only responds to manual touch

### Visual Feedback

- **Muted handles** appear faded with a red glow
- The mute state persists until you toggle it off or reload
- Muted handles can still be dragged manually

### Clearing All Mutes

Via console:
```javascript
window.controlXYMute.clearAllMutes();
```

### API

```javascript
// Check if a handle is muted
window.controlXYMute.isHandleMuted('pad1', 'dot1');

// Set mute state
window.controlXYMute.setHandleMuted('pad1', 'dot1', true);

// Toggle mute
window.controlXYMute.toggleHandleMuted('pad1', 'dot1');

// Get all muted handles
window.controlXYMute.getMutedHandles();

// Clear all mutes
window.controlXYMute.clearAllMutes();
```

---

## Touch Visual Feedback

When you touch a handle, it displays:
- **Glowing halo** — bright blue drop-shadow
- **Pulsating animation** — gentle scale pulse while held
- **Muted handles** pulse with a red glow instead

This provides clear visual feedback during multitouch performance, helping you track which handles you're currently controlling.

---

## The Launcher: Quick Access During Performance

Each controlXY pad includes an integrated **launcher** — a row of assignable buttons that provide instant access to presets and sequences during performance.

### Launcher Features

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [1 center] [2 corner] [3 sweep▶] [4 —]                                 │
│                                                                         │
│  [▶][■] ▶ intro    ← → Bank 1 (1/3) [P] [~] [⚙]                        │
│   │  │     │                         │   │   │                          │
│   │  │     └─ Sequence status        │   │   └─ Settings                │
│   │  └─ Stop sequence                │   └─ Tween toggle                │
│   └─ Play sequence                   └─ Mode (P/S)                      │
└─────────────────────────────────────────────────────────────────────────┘
```

**Transport Controls:**
- **▶ Play** — Start the most recent sequence (or first available)
- **■ Stop** — Stop any running sequence immediately

**Other Controls:**
- **Slot Buttons (1-4)**: Tap to recall assigned preset or play sequence
- **Mode Toggle (P/S)**: Switch between Preset mode and Sequence mode
- **Tween Toggle (~)**: Enable/disable smooth transitions
- **Settings (⚙)**: Open the full Preset Manager panel
- **Bank Navigation (← →)**: Switch between multiple banks of 4 slots

### Sequence Transport

The launcher shows **sequence playback status** in the bank bar:
- When a sequence is playing, you'll see `▶ sequence_name`
- The ▶ button turns green when active
- The ■ button turns red when a sequence is running
- **You can stop sequences even when the preset panel is closed**

### Assigning Slots

1. Open the Preset Manager (**Alt+Shift+P** or click ⚙)
2. In the Presets list, use the dropdown next to each preset
3. Select a slot (e.g., "B1-1" for Bank 1, Slot 1)
4. The launcher updates immediately

### Long-Press to Save

**Long-press (hold) any empty slot** to save the current handle positions as a new preset and assign it to that slot in one action.

---

## Scenes: Complete State Snapshots

**Scenes** save everything — handle positions AND launcher configurations — allowing you to recall a complete performance setup with one action.

### What a Scene Saves

- All handle positions across all pads
- All launcher slot assignments
- Current bank selection per pad
- Mode (P/S) per pad
- Tween on/off per pad

### Saving a Scene

**Via Preset Manager:**
1. Open Preset Manager (**Alt+Shift+P**)
2. Scroll to the **🎭 Scenes** section
3. Enter a name (e.g., "Live Set 1")
4. Click **Save**

**Via Console:**
```javascript
window.controlXYPresets.saveScene('Live Set 1');
```

### Recalling a Scene

**Via Preset Manager:**
- Click ▶ next to the scene name

**Via Console:**
```javascript
// Instant recall
window.controlXYPresets.recallScene('Live Set 1');

// With tween (handles animate, launchers switch instantly)
window.controlXYPresets.recallScene('Live Set 1', { dur: 2, ease: 'easeInOutSine' });
```

### Scene Use Cases

- **Live Performance**: Switch between "Intro", "Verse", "Chorus" setups
- **Rehearsal**: Save different performer configurations
- **Composition**: A/B test different automation setups
- **Teaching**: Prepare demonstration states

---

## Animation Workflow: Creating Score Choreography

The true power of `controlXY` emerges when you **pre-program spatial animations** as part of your composition.

### Step 1: Save Spatial States as Presets

**Using the Preset UI:**
1. Press **Alt+Shift+P** to open the preset manager (or click ⚙ on the pad)
2. Move handles to desired positions
3. Type a preset name (e.g., "intro_position")
4. Click 💾 Save

**Via Long-Press on Launcher:**
1. Move handles to desired position
2. Long-press an empty launcher slot
3. Enter preset name in the popup
4. Preset is saved AND assigned to that slot

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

---

## Advanced: Programmatic Animation via Console

For complex choreography, you can script animations directly:

### Tweening Without Presets
```javascript
// Move ALL handles to center over 2 seconds
window.controlXYPresets.tweenTo({ x: 0.5, y: 0.5 }, 2, 'easeInOutSine');

// Move to bottom-left corner
window.controlXYPresets.tweenTo(0, 0, 3, 'easeOutElastic');

// Multi-handle choreography (by index)
window.controlXYPresets.tweenTo([
  { x: 0.2, y: 0.8 },  // Handle 0
  { x: 0.5, y: 0.5 },  // Handle 1
  { x: 0.8, y: 0.2 }   // Handle 2
], 2, 'easeInOutBack');
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

### 2. Recall Preset
```xml
<!-- Instant -->
ui(action:"controlXYRecall", preset:"stateName")

<!-- With tween -->
ui(action:"controlXYRecall", preset:"stateName", dur:2, ease:"easeInOutSine")
```

### 3. Define Sequence
```xml
ui(action:"controlXYDefineSequence", name:"seqName", steps:"preset1,preset2,preset3")
```

### 4. Play Sequence
```xml
ui(action:"controlXYSequence", seq:"seqName", dur:2, ease:"easeInOutSine", loop:true)
```

### 5. Stop Sequence
```xml
ui(action:"controlXYSequenceStop")
```

---

## OSC Output

While spatial animation is the primary use case, all handle movements can **simultaneously control external software**.

### Enable OSC
```xml
<rect id="pad1" 
      cue="controlXY(uid:synth, handle:dot1, osc:true)"/>
```

### Custom Address & Throttle
```xml
<rect id="pad1"
      cue="controlXY(uid:synth, handle:dot1, osc:50, oscAddr:'max/xy')"/>
```

### OSC Messages Sent

**Single handle:**
```
/controlXY/synth 0.42 0.87
```

**Multiple handles:**
```
/controlXY/synth/dot1 0.42 0.87
/controlXY/synth/dot2 0.15 0.63
```

Works with Max/MSP, Pure Data, SuperCollider, TouchOSC, and any OSC-compatible software.

---

## Preset Panel UI

### Opening the Panel

1. **Click ⚙ button** on any controlXY pad's launcher
2. **Keyboard: Alt+Shift+P**
3. **Console: `window.controlXYPresetUI.toggle()`**

### Panel Tabs

**Presets Tab:**
- Save new presets
- View/recall/delete existing presets
- Assign presets to launcher slots
- **Scenes section** — save/recall complete state snapshots

**Sequences Tab:**
- Build sequences from presets
- Set per-step duration and easing
- Play/stop sequences
- Edit existing sequences

**Generators Tab:**
- Create algorithmic preset patterns
- Lissajous curves, spirals, grids, random walks
- Automatically generates presets + sequence

### Keyboard Shortcut

**Alt+Shift+P** toggles the panel (changed from Ctrl+Shift+P to avoid Chrome conflict).

---

## Storage & Persistence

All controlXY data persists automatically to **localStorage** in your browser.

### Storage Key
```
oscilla_controlxy_v1:{projectName}
```

### What's Saved
- **Presets** — Handle positions
- **Sequences** — Step lists with timing
- **Launchers** — Slot assignments, bank state, mode, tween toggle
- **Scenes** — Complete state snapshots

### Data Structure
```json
{
  "version": 1,
  "savedAt": 1706789012345,
  "items": [
    {
      "id": "cxy_abc123",
      "kind": "preset",
      "name": "center",
      "data": {
        "pad1": {
          "dot1": { "x": 0.5, "y": 0.5 }
        }
      }
    },
    {
      "id": "cxy_def456",
      "kind": "scene",
      "name": "Live Set 1",
      "data": {
        "handlePositions": { ... },
        "launchers": { ... }
      }
    }
  ]
}
```

### Import/Export

**Export:**
```javascript
// Download as JSON file
const json = window.controlXYPresets.export();

// Or via Preset Manager → Export button
```

**Import:**
```javascript
// Import from JSON string
window.controlXYPresets.import(jsonString, { merge: true });

// merge: true = add to existing, merge: false = replace all
```

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

### Launcher Styling
```css
.controlxy-launcher-slot {
  background: #ffffff;
  border: 2px solid #707070;
}

.controlxy-launcher-slot.assigned {
  background: #e8f4fc;
  border-color: #5a9fd4;
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
controlXYPresets.tweenTo(positions, options)
controlXYPresets.stopAllTweens()

// ===== SEQUENCES =====
controlXYPresets.defineSequence(name, steps, options)
controlXYPresets.playSequence(name, options)
controlXYPresets.stopSequence()
controlXYPresets.listSequences()
controlXYPresets.getSequence(name)
controlXYPresets.getActiveSequence()       // Returns current sequence info

// ===== SCENES (NEW) =====
controlXYPresets.saveScene(name)
controlXYPresets.recallScene(name, options?)
controlXYPresets.deleteScene(name)
controlXYPresets.listScenes()
controlXYPresets.getScene(name)

// ===== PERSISTENCE =====
controlXYPresets.init(projectId)           // Called automatically
controlXYPresets.forceSave()               // Bypass debounce
controlXYPresets.export()                  // Returns JSON string
controlXYPresets.import(json, options?)

// ===== UI =====
controlXYPresetUI.show()
controlXYPresetUI.hide()
controlXYPresetUI.toggle()

// ===== MUTE / MANUAL OVERRIDE =====
controlXYMute.isHandleMuted(uid, handleId)    // Returns boolean
controlXYMute.setHandleMuted(uid, handleId, muted)
controlXYMute.toggleHandleMuted(uid, handleId) // Returns new state
controlXYMute.getMutedHandles()                // Returns array of "uid:handleId"
controlXYMute.clearAllMutes()
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
3. Loop sequence with loop:true
4. Bind to visual parameters for evolving texture
```

### Pattern 3: Build-Tension-Release
```
1. Start at calm state (center, low values)
2. Sequence through increasingly tense positions
3. Climax: rapid sequence or elastic bounce
4. Release: slow tween back to calm
```

### Pattern 4: Scene-Based Performance
```
1. Create "Intro Scene" with positions + launcher setup
2. Create "Verse Scene" with different config
3. Create "Chorus Scene" with automation sequences ready
4. Recall scenes at section transitions
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
- Handles initialized at center of bounds
- Uses Pointer Events API (works with touch, mouse, stylus)
- All tweening uses `requestAnimationFrame` for smooth 60fps
- Event propagation stopped to prevent score dragging
- Multi-touch: each pointer controls nearest available handle
- Data persists to localStorage, auto-loads on project open

---

## Summary

`controlXY` fundamentally transforms the score from **static notation** into **dynamic canvas**. By combining:

1. **Spatial control surfaces** (the pads)
2. **Parameter binding** (connecting space to parameters)
3. **Preset/sequence system** (programming choreography)
4. **Scenes** (complete state snapshots)
5. **Launcher** (quick performance access)
6. **Live performance** (manual override)

...composers gain the ability to create **complex, evolving visual/sonic animations** directly within the score itself. The score becomes both **instrument and notation**, collapsing the traditional divide between composition and performance.

As a bonus, OSC output allows the same spatial gestures to control external synthesis and media systems, making `controlXY` a **unified interface** for all aspects of a multimedia performance.

**Score-as-instrument. Instrument-as-score.**

---

## Quick Start Checklist

1. ✅ Add CSS: `<link rel="stylesheet" href="controlxy-minimal-light.css">`
2. ✅ Define pad: `<rect cue="controlXY(uid:pad1, handle:dot1)"/>`
3. ✅ Open UI: Press **Alt+Shift+P** or click ⚙
4. ✅ Save states: Move handles, name them, click 💾
5. ✅ Assign to launcher: Use dropdown in preset list
6. ✅ Animate: Use `ui(action:'controlXYRecall', ...)` on playhead triggers
7. ✅ Choreograph: Define sequences, play/loop them
8. ✅ Save scene: Capture complete state for later recall
9. ✅ Bind: Connect handle positions to visual parameters
10. ✅ Perform: Use launcher buttons or manual control

Now go create some animated scores! 🎼✨
