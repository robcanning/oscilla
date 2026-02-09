# Cross-Cue Modulation -- Test Scenarios

Each test verifies that signal publish + subscribe works end-to-end
after the paramBinding.js dual-path fix. All scenarios assume the SVG
elements exist in the score with the matching IDs.

Console commands are provided for each test to verify signal flow.


---

## Test 1: o2p fader controls synth frequency

The simplest case. A single fader path drives a synth's pitch.

```xml
<!-- Inkscape: draw a vertical path, id="freqPath" -->
<path id="freqPath" d="M 100 400 L 100 100"
      cue="o2p(uid:fSlider, trig:touch, osc:0)" />

<!-- Invisible cue carrier -->
<g cue="synth(uid:tone, wave:sine, freq:fSlider.t[200,800], amp:0.1)" />
```

**Verify in console:**

```js
// After touching the fader, confirm signal appears:
window.oscillaParamBus.get("fSlider.t")    // should return 0-1
window.oscillaParamBus.get("o2p:fSlider.t") // typed path, same value

// Confirm synth is receiving:
window.oscillaParamBus.setDebugMode(true)
// Move fader -- should see "[ParamBus] fSlider.t = 0.xxxx" logs
```

**Expected:** dragging the fader sweeps pitch from 200 to 800 Hz.


---

## Test 2: controlXY pad controls synth freq + amp

Two-axis control from a single XY pad.

```xml
<rect id="xyRect" x="200" y="100" width="400" height="400"
      fill="#111" stroke="#333"
      cue="controlXY(uid:pad1, handle:dot1, label:true)" />

<circle id="dot1" cx="0" cy="0" r="10" fill="#ff4444" />

<g cue="synth(uid:xyTone, wave:saw,
              freq:pad1.x[100,2000],
              amp:pad1.y[0,0.3],
              filter:{type:lp, freq:1000})" />
```

**Verify:**

```js
window.oscillaParamBus.get("pad1.x")  // 0-1
window.oscillaParamBus.get("pad1.y")  // 0-1
```

**Expected:** horizontal = pitch, vertical = volume.


---

## Test 3: controlXY rotation handle controls filter cutoff

Tests the `.p` channel from a rotation handle.

```xml
<rect id="filterRect" x="200" y="100" width="300" height="300"
      fill="#111"
      cue="controlXY(uid:knob, handle:dot1, hmode:limited, rotrange:270, label:true)" />

<circle id="dot1" cx="0" cy="0" r="12" fill="#44aaff" />

<g cue="synth(uid:filtered, wave:saw, freq:220, amp:0.15,
              cutoff:knob.p[200,8000], q:2)" />
```

**Verify:**

```js
window.oscillaParamBus.get("knob.p")  // 0-1 based on rotation
```

**Expected:** rotating the handle sweeps filter cutoff 200-8000 Hz.


---

## Test 4: rotate animation controls synth pan

A spinning visual element drives stereo position.

```xml
<g id="spinner"
   cue="rotate(uid:spin, dur:4, loop:0)">
  <polygon points="0,-30 10,10 -10,10" fill="#ff0" />
</g>

<g cue="synth(uid:panTone, wave:sine, freq:440, amp:0.1,
              pan:spin.norm[-1,1])" />
```

**Verify:**

```js
window.oscillaParamBus.get("spin.norm")   // 0-1
window.oscillaParamBus.get("spin.angle")  // 0-360
```

**Expected:** tone pans left-right as the spinner rotates.


---

## Test 5: o2p animation drives synth -- playhead-triggered

No touch. The fader animates automatically with the playhead and
the synth binds to its position.

```xml
<path id="autoPath" d="M 500 400 C 600 100 700 400 800 100"
      cue="o2p(uid:glide, dur:8, loop:1, osc:0)" />

<g cue="synth(uid:glider, wave:triangle,
              freq:glide.t[150,1200],
              amp:glide.y[0.02,0.2])" />
```

**Expected:** as the dot traverses the curved path, pitch follows `t`
(position along path) and amplitude follows `y` (vertical position
in bounding box). The curving path makes the Y modulation non-linear.


---

## Test 6: one controller drives multiple synths

A single fader controlling a chord spread.

```xml
<path id="chordPath" d="M 300 500 L 300 50"
      cue="o2p(uid:master, trig:touch, osc:0)" />

<g cue="synth(uid:bass, wave:sine,
              freq:master.t[55,220], amp:0.12)" />

<g cue="synth(uid:mid, wave:triangle,
              freq:master.t[220,880], amp:0.08)" />

<g cue="synth(uid:high, wave:saw,
              freq:master.t[880,3520], amp:0.05,
              filter:{type:lp, freq:2000})" />
```

**Expected:** moving the fader sweeps all three synths simultaneously
through different frequency ranges, creating an expanding/contracting
harmonic texture.


---

## Test 7: multiple controllers into one synth

Two faders controlling different parameters of the same synth.

```xml
<path id="freqFader" d="M 100 400 L 100 100"
      cue="o2p(uid:fCtrl, trig:touch, osc:0)" />

<path id="filterFader" d="M 200 400 L 200 100"
      cue="o2p(uid:cCtrl, trig:touch, osc:0)" />

<g cue="synth(uid:lead, wave:saw, amp:0.12,
              freq:fCtrl.t[100,1000],
              cutoff:cCtrl.t[200,8000],
              q:4)" />
```

**Expected:** left fader controls pitch, right fader controls filter
independently.


---

## Test 8: oscCtrl path drives synth

Uses an oscCtrl path (playhead-driven continuous control lane) to
modulate a synth.

```xml
<path id="ctrlLane" d="M 400 300 C 500 100 600 500 700 200"
      cue="oscCtrl(uid:lane1, addr:/ctrl/lane1, min:0, max:1)" />

<g cue="synth(uid:laneTest, wave:sine,
              freq:lane1.v[200,600], amp:0.1)" />
```

**Verify:**

```js
window.oscillaParamBus.get("lane1.v")  // 0-1, follows path Y
window.oscillaParamBus.get("lane1.t")  // 0-1, playhead position
```

**Expected:** as the playhead crosses the control lane, the path's
vertical shape modulates the synth frequency.


---

## Test 9: scale animation controls amplitude (visual feedback)

A pulsing scale animation controlling a synth's amplitude, so the
visual size and the audio volume are synchronised.

```xml
<circle id="pulser" cx="500" cy="300" r="40" fill="#0af"
        cue="scale(uid:pulse, sx:[0.5,1.5], sy:[0.5,1.5], dur:2, loop:0)" />

<g cue="synth(uid:pulseTone, wave:sine, freq:330,
              amp:pulse.uniform[0,0.2])" />
```

**Verify:**

```js
window.oscillaParamBus.get("pulse.uniform")  // 0.5-1.5
```

**Expected:** volume swells as the circle grows, dips as it shrinks.
Note: `uniform` is the average of sx and sy, so for equal scaling it
tracks the visual size directly. The binding maps 0-1 input to 0-0.2
output, so the raw 0.5-1.5 values will be clamped -- you may want to
adjust the range mapping depending on what scale values your animation
produces.


---

## Console-only quick test (no SVG needed)

Manually push a value and confirm a bound synth responds. Run this
after any score is loaded:

```js
// 1. Check ParamBus is alive
window.oscillaParamBus.set("test.t", 0.5);
window.oscillaParamBus.get("test.t");  // 0.5

// 2. Watch for subscribers
window.oscillaParamBus.setDebugMode(true);

// 3. Simulate a fader moving
let t = 0;
const sim = setInterval(() => {
    t = (t + 0.01) % 1;
    window.oscillaParamBus.set("fSlider.t", t);
}, 30);

// Stop with: clearInterval(sim)
```

If a synth with `freq:fSlider.t[200,800]` is running, you should
hear the pitch sweep. If no synth is running, the ParamBus debug
logs confirm the values are being written.


---

## Signal channel reference (for writing tests)

| Source     | Channel    | Range   | Notes                          |
|------------|------------|---------|--------------------------------|
| o2p        | t          | 0-1     | position along path            |
| o2p        | x          | 0-1     | normalized X in bbox           |
| o2p        | y          | 0-1     | normalized Y in bbox           |
| o2p        | angle      | degrees | tangent angle                  |
| controlXY  | x          | 0-1     | horizontal position            |
| controlXY  | y          | 0-1     | vertical position (0=bottom)   |
| controlXY  | p          | 0-1     | rotation handle (if present)   |
| rotate     | angle      | 0-360   | current angle degrees          |
| rotate     | rad        | 0-2pi   | current angle radians          |
| rotate     | norm       | 0-1     | normalized angle               |
| scale      | sx         | varies  | scale X factor                 |
| scale      | sy         | varies  | scale Y factor                 |
| scale      | uniform    | varies  | average of sx and sy           |
| color      | hNorm      | 0-1     | hue / 360                      |
| color      | sNorm      | 0-1     | saturation / 100               |
| color      | lNorm      | 0-1     | lightness / 100                |
| fade       | opacity    | 0-1     | current opacity                |
| oscCtrl    | t          | 0-1     | playhead position in lane      |
| oscCtrl    | v          | 0-1     | normalized Y value             |

In the DSL, use `uid.channel[min,max]`. The source type prefix is not
needed -- the agnostic path handles it automatically.
