# ControlXY Feedback Animations - Quick Start Guide

## ✨ New Features Implemented

### 1. Programmatic Preset Creation: `saveFromData()`

Create presets without manually moving handles!

```javascript
// Simple single-handle preset
window.controlXYPresets.saveFromData('center', {
  pad1: { dot1: { x: 0.5, y: 0.5 } }
});

// Multi-handle preset
window.controlXYPresets.saveFromData('corners', {
  pad1: { 
    dot1: { x: 0.1, y: 0.9 },
    dot2: { x: 0.9, y: 0.9 },
    dot3: { x: 0.9, y: 0.1 },
    dot4: { x: 0.1, y: 0.1 }
  }
});

// Multi-pad preset
window.controlXYPresets.saveFromData('formation', {
  pad1: { dot1: { x: 0.2, y: 0.8 } },
  pad2: { dot1: { x: 0.8, y: 0.2 } }
});
```

### 2. Pattern Generators

Five built-in generators for common feedback patterns:

#### A. Lissajous Curves
```javascript
const lissa = window.controlXYPresets.generateLissajous('lissa', {
  uid: 'pad1',
  handleId: 'dot1',
  xCycles: 3,    // X oscillates 3 times
  yCycles: 2,    // Y oscillates 2 times
  steps: 60,     // 60 steps = smooth curve
  amplitude: 0.4 // Stay within 0.1-0.9 range
});

// Create and play sequence
window.controlXYPresets.defineSequence('lissajous_3_2', lissa);
window.controlXYPresets.playSequence('lissajous_3_2', {
  dur: 0.1,
  ease: 'linear',
  loop: true
});
```

#### B. Circular Motion
```javascript
const orbit = window.controlXYPresets.generateCircle('orbit', {
  uid: 'pad1',
  handleId: 'dot1',
  radius: 0.4,
  steps: 32,
  centerX: 0.5,
  centerY: 0.5
});

window.controlXYPresets.defineSequence('orbit', orbit);
window.controlXYPresets.playSequence('orbit', { dur: 0.1, loop: true });
```

#### C. Spiral Motion
```javascript
const spiral = window.controlXYPresets.generateSpiral('spiral', {
  uid: 'pad1',
  handleId: 'dot1',
  innerRadius: 0.1,
  outerRadius: 0.45,
  turns: 3,
  steps: 100
});

window.controlXYPresets.defineSequence('spiral', spiral);
window.controlXYPresets.playSequence('spiral', { dur: 0.05, loop: false });
```

#### D. Random Walk
```javascript
const wander = window.controlXYPresets.generateRandomWalk('wander', {
  uid: 'pad1',
  handleId: 'dot1',
  steps: 50,
  stepSize: 0.1,
  startX: 0.5,
  startY: 0.5,
  seed: 12345  // Optional: reproducible randomness
});

window.controlXYPresets.defineSequence('wander', wander);
window.controlXYPresets.playSequence('wander', { dur: 0.2, loop: true });
```

#### E. Grid Pattern
```javascript
const grid = window.controlXYPresets.generateGrid('grid', {
  uid: 'pad1',
  handleId: 'dot1',
  rows: 4,
  cols: 4,
  margin: 0.1
});

window.controlXYPresets.defineSequence('grid_scan', grid);
window.controlXYPresets.playSequence('grid_scan', { dur: 0.15, loop: true });
```

---

## 🚀 Complete Example: Lissajous Feedback Animation

### 1. Setup Your Score

```xml
<!-- Define control pad -->
<rect id="feedbackPad" x="100" y="100" width="600" height="600"
      fill="#111" stroke="#333"
      cue="controlXY(uid:lissa, handle:dot1, label:true)"/>

<circle id="dot1" cx="0" cy="0" r="12" fill="#ff4444"/>

<!-- Visual element that responds to pad -->
<rect id="spinner" x="800" y="300" width="100" height="100"
      fill="#44ff44"
      cue="rotate(uid:spin, values:lissa.x[0,1440], loop:0, dur:0)
           scale(uid:scl, sx:lissa.y[0.5,2], sy:lissa.y[0.5,2], loop:0, dur:0)"/>

<!-- Optional: Audio feedback -->
<g cue="synth(uid:tone, 
              freq:lissa.x[200,800], 
              amp:lissa.y[0,0.2], 
              wave:sine)"/>
```

### 2. Generate Pattern in Console

```javascript
// Generate 3:2 Lissajous curve (60 steps)
const presets = window.controlXYPresets.generateLissajous('lissa_3_2', {
  uid: 'lissa',
  handleId: 'dot1',
  xCycles: 3,
  yCycles: 2,
  steps: 60,
  amplitude: 0.4
});

// Define sequence
window.controlXYPresets.defineSequence('lissajous', presets);

// Play it
window.controlXYPresets.playSequence('lissajous', {
  dur: 0.1,
  ease: 'linear',
  loop: true
});
```

### 3. Watch the Magic! ✨

- Handle traces a perfect Lissajous curve
- Spinner rotates at varying speeds (0-1440° = 4 full rotations)
- Spinner scales with Y position
- Audio pitch follows X, amplitude follows Y
- Everything loops continuously

---

## 🌀 Quick Feedback Patterns to Try

### Pattern 1: Simple Oscillator (30 seconds)
```javascript
// Left-right oscillation
window.controlXYPresets.saveFromData('left', {
  pad1: { dot1: { x: 0.2, y: 0.5 } }
});

window.controlXYPresets.saveFromData('right', {
  pad1: { dot1: { x: 0.8, y: 0.5 } }
});

window.controlXYPresets.defineSequence('wave', ['left', 'right', 'left']);
window.controlXYPresets.playSequence('wave', { dur: 2, loop: true });
```

### Pattern 2: Circular Orbit (1 minute)
```javascript
const orbit = window.controlXYPresets.generateCircle('orbit', {
  uid: 'pad1',
  handleId: 'dot1',
  radius: 0.4,
  steps: 32
});

window.controlXYPresets.defineSequence('orbit', orbit);
window.controlXYPresets.playSequence('orbit', { dur: 0.1, loop: true });
```

### Pattern 3: Figure-8 (Lissajous 1:2)
```javascript
const fig8 = window.controlXYPresets.generateLissajous('fig8', {
  uid: 'pad1',
  handleId: 'dot1',
  xCycles: 1,
  yCycles: 2,
  steps: 40,
  amplitude: 0.4
});

window.controlXYPresets.defineSequence('figure8', fig8);
window.controlXYPresets.playSequence('figure8', { dur: 0.15, loop: true });
```

### Pattern 4: Expanding Spiral
```javascript
const spiral = window.controlXYPresets.generateSpiral('spiral_out', {
  uid: 'pad1',
  handleId: 'dot1',
  innerRadius: 0.05,
  outerRadius: 0.45,
  turns: 4,
  steps: 120
});

window.controlXYPresets.defineSequence('expand', spiral);
window.controlXYPresets.playSequence('expand', { dur: 0.05, loop: false });
```

### Pattern 5: Grid Scan
```javascript
const grid = window.controlXYPresets.generateGrid('scan', {
  uid: 'pad1',
  handleId: 'dot1',
  rows: 5,
  cols: 5,
  margin: 0.1
});

window.controlXYPresets.defineSequence('scan', grid);
window.controlXYPresets.playSequence('scan', { dur: 0.2, loop: true });
```

---

## 🎼 Compositional Applications

### 1. Harmonic Series Animation
```javascript
// Generate presets at harmonic ratios
const harmonics = [
  { x: 0.2, y: 0.5, name: 'fundamental' },
  { x: 0.4, y: 0.5, name: 'octave' },
  { x: 0.6, y: 0.5, name: 'fifth' },
  { x: 0.5, y: 0.7, name: 'fourth' },
  { x: 0.7, y: 0.4, name: 'major_third' }
];

harmonics.forEach(h => {
  window.controlXYPresets.saveFromData(h.name, {
    pad1: { dot1: { x: h.x, y: h.y } }
  });
});

window.controlXYPresets.defineSequence('harmonics', [
  'fundamental', 'octave', 'fifth', 'fourth', 'major_third', 'fundamental'
]);

window.controlXYPresets.playSequence('harmonics', { 
  dur: 1.5, 
  ease: 'easeInOutSine',
  loop: true 
});
```

### 2. Polytemporal Layers
```javascript
// Fast Lissajous on one pad
const fast = window.controlXYPresets.generateLissajous('fast', {
  uid: 'pad1',
  handleId: 'dot1',
  xCycles: 5,
  yCycles: 3,
  steps: 40
});

// Slow circle on another pad
const slow = window.controlXYPresets.generateCircle('slow', {
  uid: 'pad2',
  handleId: 'dot1',
  radius: 0.4,
  steps: 16
});

// Play both simultaneously
window.controlXYPresets.defineSequence('fast_layer', fast);
window.controlXYPresets.defineSequence('slow_layer', slow);

window.controlXYPresets.playSequence('fast_layer', { dur: 0.08, loop: true });
window.controlXYPresets.playSequence('slow_layer', { dur: 0.5, loop: true });
```

### 3. Chaotic Attractor
```javascript
// Generate semi-random but reproducible pattern
const chaos = window.controlXYPresets.generateRandomWalk('chaos', {
  uid: 'pad1',
  handleId: 'dot1',
  steps: 100,
  stepSize: 0.15,
  startX: 0.5,
  startY: 0.5,
  seed: 42  // Same seed = same pattern
});

window.controlXYPresets.defineSequence('chaos', chaos);
window.controlXYPresets.playSequence('chaos', { 
  dur: 0.1, 
  ease: 'easeInOutSine',
  loop: true 
});
```

---

## 🎛️ Advanced: Custom Pattern Generation

Create your own patterns with `saveFromData()`:

```javascript
// Example: Heart shape
const heart = [];
for (let t = 0; t < Math.PI * 2; t += 0.1) {
  const x = 0.5 + 0.3 * (16 * Math.pow(Math.sin(t), 3)) / 16;
  const y = 0.5 + 0.3 * (13 * Math.cos(t) - 5 * Math.cos(2*t) - 2 * Math.cos(3*t) - Math.cos(4*t)) / 16;
  
  window.controlXYPresets.saveFromData(`heart_${heart.length}`, {
    pad1: { dot1: { x, y } }
  });
  
  heart.push(`heart_${heart.length}`);
}

window.controlXYPresets.defineSequence('heart', heart);
window.controlXYPresets.playSequence('heart', { dur: 0.08, loop: true });
```

---

## 📊 API Reference

### saveFromData(name, data, options)
```javascript
window.controlXYPresets.saveFromData(name, data, options);
```
- **name**: Preset name (string)
- **data**: Position data object
  ```javascript
  {
    uid: {
      handleId: { x: 0-1, y: 0-1 }
    }
  }
  ```
- **options**: Optional metadata (object)

### Pattern Generators

All return array of preset names for use with `defineSequence()`.

#### generateLissajous(baseName, options)
Options: `uid, handleId, xCycles, yCycles, steps, phase, amplitude, centerX, centerY`

#### generateCircle(baseName, options)
Options: `uid, handleId, radius, steps, centerX, centerY, startAngle`

#### generateSpiral(baseName, options)
Options: `uid, handleId, innerRadius, outerRadius, turns, steps, centerX, centerY`

#### generateRandomWalk(baseName, options)
Options: `uid, handleId, steps, stepSize, startX, startY, seed`

#### generateGrid(baseName, options)
Options: `uid, handleId, rows, cols, margin`

---

## 🐛 Troubleshooting

### Pattern not visible?
- Check that `uid` and `handleId` match your actual elements
- Use `label:true` in controlXY to see current values
- Console: `window.controlXYPresets.list()` to see saved presets

### Sequence playing but no motion?
- Verify presets exist: `window.controlXYPresets.get('presetName')`
- Check duration isn't too fast/slow
- Try with `ease:'linear'` first for debugging

### Handle moves but visual doesn't respond?
- Check binding syntax: `cue="rotate(uid:r1, values:pad1.x[0,360])"`
- Verify signal publishing: Open console, move handle, check for errors
- Test binding: `window.oscillaParamBus.get('controlXY:pad1.x')`

---

## 🎯 Next Steps

1. ✅ Try Pattern 1 (Simple Oscillator) - 30 seconds
2. ✅ Try Pattern 2 (Circular Orbit) - 1 minute
3. ✅ Generate a Lissajous curve - 2 minutes
4. 🎨 Bind to multiple visual parameters
5. 🎵 Add audio feedback
6. 🌀 Combine multiple patterns
7. 🎭 Create your own custom pattern

**You now have a complete generative animation system!** 🎉

Start simple, experiment, and build complexity gradually. The feedback patterns will surprise you with emergent behaviors you didn't explicitly program.

**Score-as-organism. Notation-as-ecosystem.** 🌿✨
