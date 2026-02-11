# Feedback Animation Patterns with ControlXY + Control Plane

## System Status: ✅ READY FOR FEEDBACK!

You have all the pieces needed for **generative recursive feedback animations**:

1. ✅ **controlXY publishes signals** (x, y per handle)
2. ✅ **Animations can bind to signals** (rotate, scale, o2p, etc.)
3. ✅ **Animations publish their own signals** (angle, position, etc.)
4. ✅ **controlXY can be animated via presets** (creating loops)

This creates a **complete feedback cycle**:
```
controlXY → animates element → element publishes → controls controlXY → ...
```

---

## How Feedback Works

### Signal Flow Diagram
```
┌──────────────┐
│  controlXY   │ publishes
│  (pad1)      │──────────────┐
│  x: 0.5      │              │
│  y: 0.3      │              ▼
└──────────────┘     ┌─────────────────┐
       ▲             │   ParamBus      │
       │             │  controlXY:pad1 │
       │             └────────┬────────┘
       │                      │
       │                      │ subscribes
       │                      ▼
       │             ┌─────────────────┐
       │             │  rotate(uid:r1, │
       │             │  values:pad1.x) │
       │             └────────┬────────┘
       │                      │
       │                      │ publishes
       │                      ▼
       │             ┌─────────────────┐
       │             │   ParamBus      │
       │             │  rotate:r1      │
       │             └────────┬────────┘
       │                      │
       │                      │ subscribes
       └──────────────────────┘
         preset.recall(state, dur)
         uses rotate:r1.angle to
         determine next state
```

---

## Pattern 1: Simple Oscillation Feedback ⭐ START HERE

**Concept:** ControlXY position drives rotation, which loops back to animate controlXY.

### Setup
```xml
<!-- Define control pad -->
<rect id="pad1" x="100" y="100" width="400" height="300"
      fill="#222"
      cue="controlXY(uid:pad1, handle:dot1, label:true)"/>

<circle id="dot1" cx="0" cy="0" r="12" fill="#ff4444"/>

<!-- Element that rotates based on pad X position -->
<rect id="spinner" x="600" y="200" width="100" height="100"
      fill="#44ff44"
      cue="rotate(uid:spin1, values:pad1.x[0,360], loop:0, dur:0)"/>
```

### Create Feedback Loop via Playhead

**Save states at different X positions:**
```xml
<!-- State A: dot at left (x=0.2) -->
<rect x="100" y="0" width="1" height="600"
      cue="ui(action:'controlXYSave', preset:'stateA')"
      fill="transparent"/>

<!-- State B: dot at right (x=0.8) -->
<rect x="500" y="0" width="1" height="600"
      cue="ui(action:'controlXYSave', preset:'stateB')"
      fill="transparent"/>

<!-- Create oscillating sequence -->
<rect x="1000" y="0" width="1" height="600"
      cue="ui(action:'controlXYDefineSequence', 
              name:'oscillate', 
              steps:'stateA,stateB,stateA')"
      fill="transparent"/>

<!-- Start the feedback loop -->
<rect x="1100" y="0" width="2" height="600"
      cue="ui(action:'controlXYSequence', 
              seq:'oscillate', 
              dur:2, 
              loop:true)"
      fill="green" opacity="0.5"/>
```

**What happens:**
1. Handle moves left → spinner rotates slowly
2. Handle moves right → spinner rotates fast
3. Loop repeats → creates rhythmic spinning pattern
4. Speed varies smoothly with position

---

## Pattern 2: Spiral Feedback (X→Y Coupling)

**Concept:** X position controls Y movement, Y controls X movement.

### Setup
```xml
<rect id="pad2" x="100" y="100" width="400" height="400"
      fill="#111"
      cue="controlXY(uid:spiral, handle:[dot1,dot2], label:true)"/>

<circle id="dot1" cx="0" cy="0" r="10" fill="#ff4444"/>
<circle id="dot2" cx="0" cy="0" r="10" fill="#44ff44"/>
```

### Create Spiral States
```javascript
// In console or init script:

// State 1: Top-left
window.controlXYPresets.tweenTo({ x: 0.2, y: 0.8 }, 0);
window.controlXYPresets.save('spiral1');

// State 2: Top-right
window.controlXYPresets.tweenTo({ x: 0.8, y: 0.8 }, 0);
window.controlXYPresets.save('spiral2');

// State 3: Bottom-right
window.controlXYPresets.tweenTo({ x: 0.8, y: 0.2 }, 0);
window.controlXYPresets.save('spiral3');

// State 4: Bottom-left
window.controlXYPresets.tweenTo({ x: 0.2, y: 0.2 }, 0);
window.controlXYPresets.save('spiral4');

// Define sequence
window.controlXYPresets.defineSequence('spiral', [
  'spiral1', 'spiral2', 'spiral3', 'spiral4', 'spiral1'
]);

// Play with variable timing
window.controlXYPresets.playSequence('spiral', {
  dur: [1, 0.5, 2, 0.5], // Variable per step
  loop: true
});
```

### Bind Visual Elements
```xml
<!-- Element follows spiral with scaling -->
<circle id="follower" cx="300" cy="300" r="20"
        fill="#ffff44"
        cue="scale(uid:s1, sx:spiral.dot1.x[0.5,2], sy:spiral.dot1.y[0.5,2], loop:0, dur:0)
             rotate(uid:r1, values:spiral.dot1.x[0,720], loop:0, dur:0)"/>
```

---

## Pattern 3: Chaotic Attractor

**Concept:** Multiple handles influence each other through intermediate animations.

### Setup
```xml
<rect id="pad3" x="100" y="100" width="600" height="400"
      fill="#000" stroke="#333"
      cue="controlXY(uid:chaos, handle:[a,b,c], label:true)"/>

<circle id="a" cx="0" cy="0" r="8" fill="#ff4444"/>
<circle id="b" cx="0" cy="0" r="8" fill="#44ff44"/>
<circle id="c" cx="0" cy="0" r="8" fill="#4444ff"/>

<!-- Visual elements controlled by handles -->
<rect id="box1" x="800" y="100" width="100" height="100"
      fill="#ff444444"
      cue="rotate(uid:r1, values:chaos.a.x[0,360], loop:0, dur:0)
           scale(uid:s1, sx:chaos.b.y[0.5,2], sy:chaos.c.y[0.5,2], loop:0, dur:0)"/>

<rect id="box2" x="800" y="250" width="100" height="100"
      fill="#44ff4444"
      cue="rotate(uid:r2, values:chaos.b.x[-180,180], loop:0, dur:0)
           scale(uid:s2, sx:chaos.c.x[0.5,2], sy:chaos.a.y[0.5,2], loop:0, dur:0)"/>

<rect id="box3" x="800" y="400" width="100" height="100"
      fill="#4444ff44"
      cue="rotate(uid:r3, values:chaos.c.x[0,360], loop:0, dur:0)
           scale(uid:s3, sx:chaos.a.x[0.5,2], sy:chaos.b.y[0.5,2], loop:0, dur:0)"/>
```

### Create Chaotic Sequence
```javascript
// Define 8 semi-random states
const states = [
  [{ x: 0.2, y: 0.8 }, { x: 0.8, y: 0.2 }, { x: 0.5, y: 0.5 }],
  [{ x: 0.7, y: 0.7 }, { x: 0.3, y: 0.3 }, { x: 0.5, y: 0.8 }],
  [{ x: 0.4, y: 0.2 }, { x: 0.6, y: 0.9 }, { x: 0.2, y: 0.4 }],
  [{ x: 0.9, y: 0.5 }, { x: 0.1, y: 0.5 }, { x: 0.5, y: 0.1 }],
  [{ x: 0.3, y: 0.6 }, { x: 0.7, y: 0.4 }, { x: 0.8, y: 0.7 }],
  [{ x: 0.5, y: 0.9 }, { x: 0.5, y: 0.1 }, { x: 0.1, y: 0.5 }],
  [{ x: 0.8, y: 0.3 }, { x: 0.2, y: 0.7 }, { x: 0.6, y: 0.6 }],
  [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }, { x: 0.5, y: 0.2 }]
];

// Save each state
states.forEach((positions, i) => {
  window.controlXYPresets.tweenTo(positions, 0);
  window.controlXYPresets.save(`chaos${i}`);
});

// Create sequence with variable timing
window.controlXYPresets.defineSequence('attractor', [
  'chaos0', 'chaos1', 'chaos2', 'chaos3', 
  'chaos4', 'chaos5', 'chaos6', 'chaos7', 'chaos0'
]);

// Play with easing for organic motion
window.controlXYPresets.playSequence('attractor', {
  dur: 1.5,
  ease: 'easeInOutSine',
  loop: true
});
```

**Result:** Three handles move in a complex pattern, each controlling multiple visual parameters that influence the overall composition.

---

## Pattern 4: Resonance Feedback (Audio-Visual)

**Concept:** ControlXY → Audio → Visual → ControlXY

### Setup
```xml
<rect id="pad4" x="100" y="100" width="400" height="300"
      fill="#111"
      cue="controlXY(uid:resonator, handle:dot1, label:true)"/>

<circle id="dot1" cx="0" cy="0" r="12" fill="#ff4444"/>

<!-- Synth controlled by pad position -->
<g cue="synth(uid:drone, 
              freq:resonator.x[100,800], 
              amp:resonator.y[0,0.3], 
              wave:sine,
              env:{a:0.1,d:0.2,s:0.8,r:0.3})"/>

<!-- Visual element shows audio frequency -->
<rect id="visualizer" x="600" y="100" width="400" height="300"
      fill="#44ff44"
      cue="rotate(uid:viz, values:resonator.x[0,1440], loop:0, dur:0)
           scale(uid:vizScale, sx:resonator.y[0.5,3], sy:resonator.y[0.5,3], loop:0, dur:0)"/>
```

### Create Resonant States
```javascript
// Define harmonic series positions
const harmonics = [
  { x: 0.2, y: 0.3, name: 'fundamental' },
  { x: 0.4, y: 0.4, name: 'second' },
  { x: 0.6, y: 0.35, name: 'third' },
  { x: 0.5, y: 0.5, name: 'fourth' },
  { x: 0.7, y: 0.3, name: 'fifth' },
  { x: 0.8, y: 0.4, name: 'sixth' }
];

harmonics.forEach(h => {
  window.controlXYPresets.tweenTo({ x: h.x, y: h.y }, 0);
  window.controlXYPresets.save(h.name);
});

// Create arpeggio sequence
window.controlXYPresets.defineSequence('arpeggio', [
  'fundamental', 'second', 'third', 'fourth', 
  'fifth', 'fourth', 'third', 'second', 'fundamental'
]);

// Play with variable timing for rhythm
window.controlXYPresets.playSequence('arpeggio', {
  dur: [1, 0.5, 0.5, 1, 0.5, 0.5, 1, 0.5, 2], // Rhythmic pattern
  ease: 'easeInOutSine',
  loop: true
});
```

**Result:** Creates an audio-visual feedback loop where:
- X controls pitch (visual rotation reflects frequency)
- Y controls amplitude (visual scale reflects loudness)
- Sequence creates a self-playing arpeggio

---

## Pattern 5: Lissajous Curves (X-Y Phase Coupling)

**Concept:** Two independent oscillations on X and Y create complex paths.

### Setup
```xml
<rect id="pad5" x="100" y="100" width="600" height="600"
      fill="#000"
      cue="controlXY(uid:lissajous, handle:tracer, label:true)"/>

<circle id="tracer" cx="0" cy="0" r="8" fill="#ff4444"/>

<!-- Trail effect (requires SVG filter or multiple elements) -->
<circle id="trail1" cx="0" cy="0" r="6" fill="#ff444488" opacity="0.6"/>
<circle id="trail2" cx="0" cy="0" r="4" fill="#ff444444" opacity="0.4"/>
<circle id="trail3" cx="0" cy="0" r="2" fill="#ff444422" opacity="0.2"/>
```

### Create Lissajous Pattern
```javascript
// Generate states for X: 3 cycles, Y: 2 cycles (3:2 ratio)
const steps = 60; // Resolution
const lissajousStates = [];

for (let i = 0; i <= steps; i++) {
  const t = (i / steps) * Math.PI * 2;
  const x = 0.5 + 0.4 * Math.sin(3 * t);  // 3 cycles
  const y = 0.5 + 0.4 * Math.sin(2 * t);  // 2 cycles
  
  window.controlXYPresets.tweenTo({ x, y }, 0);
  window.controlXYPresets.save(`lissa${i}`);
  lissajousStates.push(`lissa${i}`);
}

// Create sequence
window.controlXYPresets.defineSequence('lissajous_3_2', lissajousStates);

// Play smoothly
window.controlXYPresets.playSequence('lissajous_3_2', {
  dur: 0.1, // Fast for smooth curves
  ease: 'linear',
  loop: true
});
```

**Variations:**
```javascript
// Try different ratios:
// 2:3, 3:4, 5:4, 4:3, etc.

// Add phase offset:
const y = 0.5 + 0.4 * Math.sin(2 * t + Math.PI/4);

// Variable amplitude:
const x = 0.5 + (0.3 + 0.1 * Math.sin(t/10)) * Math.sin(3 * t);
```

---

## Pattern 6: Multi-Pad Ecosystem

**Concept:** Multiple pads influence each other.

### Setup
```xml
<!-- Pad A: Controller -->
<rect id="padA" x="100" y="100" width="300" height="300"
      fill="#220000"
      cue="controlXY(uid:controller, handle:ctrl, label:true)"/>

<circle id="ctrl" cx="0" cy="0" r="10" fill="#ff4444"/>

<!-- Pad B: Responder (controlled by Pad A) -->
<rect id="padB" x="500" y="100" width="300" height="300"
      fill="#002200"
      cue="controlXY(uid:responder, handle:resp, label:true)"/>

<circle id="resp" cx="0" cy="0" r="10" fill="#44ff44"/>

<!-- Pad C: Mirror (controlled by Pad B) -->
<rect id="padC" x="900" y="100" width="300" height="300"
      fill="#000022"
      cue="controlXY(uid:mirror, handle:mirr, label:true)"/>

<circle id="mirr" cx="0" cy="0" r="10" fill="#4444ff"/>
```

### Create Cascading Animation
```javascript
// Define states for each pad
const controllerStates = [
  { x: 0.2, y: 0.8 },
  { x: 0.8, y: 0.8 },
  { x: 0.8, y: 0.2 },
  { x: 0.2, y: 0.2 }
];

const responderStates = [
  { x: 0.8, y: 0.2 }, // Inverted from controller
  { x: 0.2, y: 0.2 },
  { x: 0.2, y: 0.8 },
  { x: 0.8, y: 0.8 }
];

const mirrorStates = [
  { x: 0.5, y: 0.5 }, // Center
  { x: 0.3, y: 0.7 },
  { x: 0.7, y: 0.3 },
  { x: 0.5, y: 0.5 }
];

// Save states (need to target specific UIDs)
// This requires enhancement to controlXYPresets to support multi-pad saves
// For now, move handles manually and save, or use console tweenTo

controllerStates.forEach((pos, i) => {
  // Set controller pad
  window._controlXYRegistry.get('controller').handles[0].curX = ...;
  // ... (requires accessing internal state)
  
  // Better: just move handles in UI and save manually for now
});
```

**Current Limitation:** Need to enhance `save()` to accept position data directly, not just capture current state.

---

## Enhancement Needed: Programmatic State Creation

To make these patterns easier, add this to `oscillaControlXYPresets.js`:

```javascript
/**
 * Save a preset from explicit position data (not current state)
 */
export function savePresetFromData(name, data) {
  // data format: { uid: { handleId: { x, y } } }
  presetStore.presets[name] = {
    ...data,
    _meta: {
      savedAt: Date.now(),
      programmatic: true
    }
  };
  
  if (presetStore.projectId) {
    savePresetsToServer();
  }
  
  return true;
}

// Expose in API
window.controlXYPresets.saveFromData = savePresetFromData;
```

**Usage:**
```javascript
// Now you can programmatically create presets
window.controlXYPresets.saveFromData('state1', {
  pad1: {
    dot1: { x: 0.5, y: 0.8 },
    dot2: { x: 0.2, y: 0.3 }
  }
});
```

---

## Quick Start: Test Feedback in 5 Minutes

1. **Create a simple pad:**
```xml
<rect id="testPad" x="100" y="100" width="400" height="300"
      fill="#222"
      cue="controlXY(uid:test, handle:testDot, label:true)"/>

<circle id="testDot" cx="0" cy="0" r="12" fill="#ff4444"/>
```

2. **Add a visual responder:**
```xml
<rect id="spinner" x="600" y="200" width="100" height="100"
      fill="#44ff44"
      cue="rotate(uid:spin, values:test.x[0,720], loop:0, dur:0)"/>
```

3. **In console - create oscillation:**
```javascript
// Save left position
window.controlXYPresets.tweenTo(0.2, 0.5, 0);
window.controlXYPresets.save('left');

// Save right position
window.controlXYPresets.tweenTo(0.8, 0.5, 0);
window.controlXYPresets.save('right');

// Create sequence
window.controlXYPresets.defineSequence('wave', ['left', 'right', 'left']);

// Play it
window.controlXYPresets.playSequence('wave', { dur: 2, loop: true });
```

4. **Watch:** Handle oscillates left-right, spinner speed changes accordingly!

---

## System Capabilities Summary

### ✅ You Can Already Do:
- Handle position → visual parameter binding
- Handle position → audio parameter binding
- Sequence-based animation loops
- Multi-handle complex patterns
- Visual feedback (rotation, scale, etc.)

### 🔨 Easy Enhancements (10 minutes each):
1. **Programmatic preset creation** (`saveFromData()`)
2. **Cross-pad influence** (save with explicit uid targeting)
3. **State interpolation** (blend between presets)

### 🚀 Advanced Enhancements (1-2 hours):
1. **Physics simulation** (velocity, acceleration, springs)
2. **Collision detection** (handles bounce off each other)
3. **Particle trails** (visual history of movement)
4. **State morphing** (smooth transitions between arbitrary positions)

---

## Compositional Applications

### 1. **Self-Playing Scores**
Use feedback loops to create scores that animate themselves based on initial conditions.

### 2. **Gestural Instruments**
Record live gestures as preset sequences, then loop/modify them.

### 3. **Audio-Visual Coupling**
Create tight relationships between sound and motion through shared control.

### 4. **Generative Notation**
Let feedback patterns generate new musical material in real-time.

### 5. **Performance Systems**
Combine manual control with automated feedback for hybrid performance.

---

## Next Steps

1. ✅ **Try Pattern 1** (Simple Oscillation) - works right now!
2. 🔨 **Add `saveFromData()`** - enables programmatic pattern creation
3. 🎯 **Experiment with harmonics** - musical ratios create interesting patterns
4. 🌀 **Explore chaos** - small changes lead to complex behaviors
5. 🎨 **Bind to color/opacity** - expand beyond position/rotation

You have a **complete feedback animation system** ready to go! Start with Pattern 1 and iterate from there.

**Score-as-organism. Notation-as-system.** 🌀✨
