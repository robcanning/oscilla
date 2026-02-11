---
title: Control Plane
layout: docs_layout.njk
---

# Oscilla Control Plane — Architecture & Usage Guide

<figure class="doc-image">
  <img
    src="{{ '/docs/img/oscilla-dynamic-signal-flow.png' | url }}"
    alt="Oscilla Dynamic Signal Control"
  >
  <figcaption>Published signals are shared across the system, so animations can control audio parameters, slider-like interfaces can control animations, and multiple cues can influence each other in any combination. Because values are updated continuously, this also allows feedback systems where motion, sound, and interaction form coupled, dynamic behaviours within the score.
</figcaption>
</figure>

<code>
synth(uid:pad, freq:"fadeSineFreq.t[90,2000]", env:{a:4})

o2p(path:fadeSineFreq, trig:touch, osc:1, uid:fadeSineFreq, oscAddr:fadeSineFreq)
</code>

## Overview

The Oscilla Control Plane enables **bidirectional signal flow** between cues. Any animation can publish its values as signals, and any synth or audio cue can subscribe to those signals to control its parameters in real-time.

This transforms Oscilla from a trigger-based score system into a **dynamic, signal-driven, executable score environment**.

### Core Concept

```
┌─────────────────┐                    ┌─────────────────┐
│   O2P Fader     │ ──publishes──────▶ │   ParamBus      │
│   uid: slider1  │    t, x, y, angle  │  (signal store) │
└─────────────────┘                    └────────┬────────┘
                                                │
                                                │ subscribes
                                                ▼
                                       ┌─────────────────┐
                                       │   Synth         │
                                       │   freq:slider1.t│
                                       └─────────────────┘
```

---

## Quick Start

### 1. Create a Controller (O2P Fader)

```
o2p(path:faderTrack, trig:touch, uid:myFader)
```

This fader automatically publishes:
- `o2p:myFader.t` — position along path (0-1)
- `o2p:myFader.x` — normalized X position (0-1)
- `o2p:myFader.y` — normalized Y position (0-1)
- `o2p:myFader.angle` — tangent angle in degrees

### 2. Bind a Synth Parameter

```
synth(uid:pad, freq:myFader.t[200,800], amp:0.2)
```

The `freq:myFader.t[200,800]` syntax means:
- Subscribe to signal `o2p:myFader.t`
- Map the 0-1 value to 200-800 Hz

### 3. Result

Moving the fader changes the synth's frequency in real-time!

---

## Signal Reference Syntax

### Basic Binding

```
param:source.channel
```

- **param** — The parameter to control (freq, amp, pan, etc.)
- **source** — The uid of the publishing cue
- **channel** — Which signal to subscribe to (t, x, y, angle, etc.)

### Binding with Range

```
param:source.channel[min,max]
```

Maps the signal (assumed 0-1) to the specified output range.

### Examples

| DSL | Meaning |
|-----|---------|
| `freq:slider.t` | Freq follows slider position (0-1) |
| `freq:slider.t[200,2000]` | Freq mapped to 200-2000 Hz |
| `amp:fader.y[0,0.5]` | Amplitude mapped to 0-0.5 |
| `pan:knob.x[-1,1]` | Pan mapped to full left-right |
| `cutoff:wheel.t[200,8000]` | Filter cutoff mapped to range |

---

## Published Signals by Cue Type

### O2P Animation

| Signal | Description | Range |
|--------|-------------|-------|
| `o2p:{uid}.t` | Position along path | 0-1 |
| `o2p:{uid}.x` | Normalized X in frame | 0-1 |
| `o2p:{uid}.y` | Normalized Y in frame | 0-1 |
| `o2p:{uid}.angle` | Tangent angle | degrees |

### Rotate Animation

| Signal | Description | Range |
|--------|-------------|-------|
| `rotate:{uid}.angle` | Current angle | 0-360 |
| `rotate:{uid}.rad` | Angle in radians | 0-2π |
| `rotate:{uid}.norm` | Normalized angle | 0-1 |

### Scale Animation

| Signal | Description | Range |
|--------|-------------|-------|
| `scale:{uid}.sx` | Scale X factor | varies |
| `scale:{uid}.sy` | Scale Y factor | varies |
| `scale:{uid}.uniform` | Average scale | varies |

---

## Bindable Parameters

### Synth

| Parameter | Default Range | Description |
|-----------|---------------|-------------|
| `freq` / `frequency` | 20-20000 | Oscillator frequency (Hz) |
| `amp` / `amplitude` | 0-1 | Output amplitude |
| `pan` | -1 to 1 | Stereo position |
| `cutoff` / `filterFreq` | 20-20000 | Filter cutoff (Hz) |
| `q` / `resonance` | 0.1-30 | Filter resonance |
| `detune` | -1200 to 1200 | Detune in cents |

### Audio / AudioPool / AudioImpulse

| Parameter | Default Range | Description |
|-----------|---------------|-------------|
| `amp` | 0-1 | Playback amplitude |
| `pan` | -1 to 1 | Stereo position |
| `pitch` / `rate` | 0.25-4 | Playback rate |

### Effects (within synth)

| Parameter | Default Range | Description |
|-----------|---------------|-------------|
| `delayTime` | 0-2 | Delay time (seconds) |
| `feedback` / `fb` | 0-0.99 | Delay feedback |
| `mix` / `wet` | 0-1 | Effect mix level |

---

## Architecture

### Module Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     oscillaParamBus.js                          │
│  Central signal store with pub/sub                              │
│  • set(path, value) — publish a signal                         │
│  • get(path) — read current value                              │
│  • subscribe(path, callback) — react to changes                │
└─────────────────────────────────────────────────────────────────┘
                              ▲
                              │
        ┌─────────────────────┴─────────────────────┐
        │                                           │
        ▼                                           ▼
┌───────────────────┐                   ┌───────────────────┐
│ oscillaParamBinding│                   │ Animation Modules │
│                   │                   │                   │
│ • bindParam()     │                   │ • publish() call  │
│ • publish()       │ ◀──── used by ────│   in update loop  │
│ • isSignalRef()   │                   │                   │
└───────────────────┘                   └───────────────────┘
        │
        │ used by
        ▼
┌───────────────────┐
│ Synth/Audio Cues  │
│                   │
│ • bindParam() for │
│   each parameter  │
└───────────────────┘
```

### File Descriptions

| File | Purpose |
|------|---------|
| `oscillaParamBus.js` | Central signal store with pub/sub |
| `oscillaParamBinding.js` | `bindParam()` and `publish()` helpers |
| `oscillaParserSignalRef.js` | Parser extension for signal ref syntax |

---

## Integration Guide

### Adding Signal Publishing to a Cue

To make any animation publish signals, add **one line** to its update callback:

```javascript
import { publish } from './oscillaParamBinding.js';

// In your animation's update callback:
update: () => {
    // ... existing animation logic ...
    
    // ADD THIS LINE:
    publish("o2p", cfg.uid, { t: pathT, x: normX, y: normY, angle });
}
```

### Example: O2P Animation

**Location:** `oscillaAnimationO2p.js`, in `startContinuousO2P()`, around line 492

```javascript
// BEFORE (existing code):
emitO2POsc({ cfg, uid: cfg.uid, path, point, pathT });

// AFTER (add this line):
import { publish } from './oscillaParamBinding.js';
// ... then in update callback:
emitO2POsc({ cfg, uid: cfg.uid, path, point, pathT });
publish("o2p", cfg.uid, { t: globalT, x: normX, y: normY, angle });
```

**Note:** You'll need to calculate `normX` and `normY` from the path bbox:

```javascript
const bbox = path.getBBox();
const normX = (point.x - bbox.x) / bbox.width;
const normY = (point.y - bbox.y) / bbox.height;
```

### Example: Rotate Animation

**Location:** `oscillaAnimationRotate.js`, in `handleRotateContinuous()`, around line 548

```javascript
import { publish } from './oscillaParamBinding.js';

update: () => {
    // ... existing code ...
    const angle = getCurrentAngle(animEl, 0);
    
    // ADD THIS:
    publish("rotate", cfg.uid, { angle: angle });
}
```

### Example: Scale Animation

**Location:** `oscillaAnimationScale.js`, in `handleScaleContinuous()`, around line 586

```javascript
import { publish } from './oscillaParamBinding.js';

update: () => {
    // ... existing code ...
    const sx = parseFloat(tr.match(/scale\(([^,]+),/)?.[1] || 1);
    const sy = parseFloat(tr.match(/,\s*([^)]+)\)/)?.[1] || sx);
    
    // ADD THIS:
    publish("scale", cfg.uid, { sx, sy, uniform: (sx + sy) / 2 });
}
```

---

### Adding Signal Binding to a Cue

To make parameters bindable in a cue, use `bindParam()`:

```javascript
import { bindParam, isSignalRef } from './oscillaParamBinding.js';

function startMyCue(params) {
    const unbinders = [];
    
    // Bind frequency - works with both static and signal ref
    const freqBinding = bindParam(
        params.freq,
        (hz) => oscillator.frequency.setTargetAtTime(hz, 0, 0.02),
        { min: 20, max: 20000, default: 440 }
    );
    unbinders.push(freqBinding.unbind);
    
    // Use initial value
    oscillator.frequency.value = freqBinding.value;
    
    // ... later, on cleanup:
    unbinders.forEach(fn => fn());
}
```

### Example: Synth Integration

**Location:** `oscillaSynth.js`, in `startSynthVoice()`, around line 673

```javascript
import { bindParam } from './oscillaParamBinding.js';

function startSynthVoice(uid, ast, cueElement, opts) {
    const ctx = sharedAudioCtx;
    const params = extractParams(ast);
    const unbinders = [];
    
    // Frequency binding
    const freqBinding = bindParam(
        params.freq,
        (hz) => {
            if (voice.source?.kind === 'osc') {
                voice.source.node.frequency.setTargetAtTime(hz, ctx.currentTime, 0.02);
            }
        },
        { min: 20, max: 20000, default: 440 }
    );
    unbinders.push(freqBinding.unbind);
    
    // Amplitude binding
    const ampBinding = bindParam(
        params.amp,
        (amp) => {
            voice.graph.gain.gain.setTargetAtTime(amp, ctx.currentTime, 0.02);
        },
        { min: 0, max: 0.5, default: 0.1 }
    );
    unbinders.push(ampBinding.unbind);
    
    // ... create voice with initial values ...
    const freqHz = freqBinding.value;
    const amp = ampBinding.value;
    
    // Store unbinders on voice for cleanup
    voice._unbinders = unbinders;
}

function cleanupVoice(uid, voice) {
    // Unbind all signal subscriptions
    voice._unbinders?.forEach(fn => fn());
    // ... rest of cleanup ...
}
```

---

## Parser Integration

### Modifying the Parser

The parser needs to recognize signal references in parameter values. Add this to the value extraction logic:

**Location:** `oscillaParser.js`, in `cstToAst()` synth/audio sections

```javascript
import { maybeConvertToSignalRef } from './oscillaParserSignalRef.js';

// When extracting a parameter value:
let val = extractRawValue(valueNode);
val = maybeConvertToSignalRef(val, paramName);
```

### What the Parser Outputs

**Input DSL:**
```
synth(uid:pad, freq:fader1.t[200,800], amp:0.2)
```

**Output AST:**
```javascript
{
    type: "cueSynth",
    args: [
        { type: "uid", value: "pad" },
        { 
            type: "freq", 
            value: { 
                type: "signalRef", 
                source: "fader1", 
                channel: "t", 
                range: [200, 800] 
            } 
        },
        { type: "amp", value: 0.2 }
    ]
}
```

---

## Debugging

### Enable Debug Mode

```javascript
// In browser console:
oscillaParamBus.setDebugMode(true);
```

This logs all signal changes.

### Inspect Current Signals

```javascript
// List all signals:
oscillaParamBus.list();

// List signals from a specific source:
oscillaParamBus.list("o2p:");

// Get current value:
oscillaParamBus.get("o2p:fader1.t");

// Get snapshot of all values:
oscillaParamBus.snapshot();
```

### Test Signal Publishing

```javascript
// Manually publish a signal:
oscillaParamBus.set("o2p:test.t", 0.5);

// Watch a signal:
const unsub = oscillaParamBus.subscribe("o2p:test.t", (value, path) => {
    console.log(`${path} = ${value}`);
});

// Later: unsub() to stop watching
```

---

## Common Patterns

### XY Pad → Synth

```
o2p(path:xyPad, trig:touch, uid:xy)
synth(uid:pad, freq:xy.x[200,2000], amp:xy.y[0,0.5])
```

### Rotation → Filter

```
rotate(dur:4, loop:0, uid:wheel)
synth(uid:drone, freq:220, cutoff:wheel.norm[200,4000])
```

### Multiple Controllers → One Synth

```
o2p(path:freqSlider, trig:touch, uid:fSlider)
o2p(path:ampSlider, trig:touch, uid:aSlider)
synth(uid:lead, freq:fSlider.t[100,1000], amp:aSlider.t[0,0.3])
```

### One Controller → Multiple Synths

```
o2p(path:masterFader, trig:touch, uid:master)
synth(uid:bass, freq:master.t[50,200], amp:0.2)
synth(uid:mid, freq:master.t[200,800], amp:0.15)
synth(uid:high, freq:master.t[800,4000], amp:0.1)
```

---

## Limitations & Notes

1. **Signal Publishing Rate:** Signals are published at ~60fps to avoid overwhelming the system.

2. **Binding Lifecycle:** Bindings are automatically cleaned up when the cue stops (if you call the unbind functions).

3. **No Circular Dependencies:** The system doesn't prevent circular signal routing. Avoid creating feedback loops unless intentional.

4. **Static Parameters:** Some parameters can't be changed after cue start (e.g., `wave` type, audio `src`). These will use the initial value even if bound.

5. **Signal Range:** All signals are assumed to be in the 0-1 range. Use the `[min,max]` syntax to map to your desired output range.

---

## Summary Checklist

### To Make an Animation Publish Signals:

1. ✅ Import `publish` from `oscillaParamBinding.js`
2. ✅ Add `publish("type", uid, { channel: value })` to update callback
3. ✅ Done!

### To Make a Cue Accept Signal Bindings:

1. ✅ Import `bindParam` from `oscillaParamBinding.js`
2. ✅ Wrap parameter initialization with `bindParam()`
3. ✅ Store unbind functions for cleanup
4. ✅ Call unbind functions when cue stops
5. ✅ Update parser to recognize signal refs (one-time)

---

## Version History

- **v1.0** — Initial control plane implementation
  - ParamBus signal store
  - bindParam/publish helpers
  - Signal reference syntax support
