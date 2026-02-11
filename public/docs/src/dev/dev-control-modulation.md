---
title: Control Signal Architecture
layout: docs_layout.njk
---

# Control Plane & Cross-Cue Modulation -- Developer Guide

This document explains how Oscilla's internal signal routing works,
how the pieces connect, and how to extend it. It is written for
developers contributing to the codebase, not for end-user score
authoring (see `control-and-modulation.md` for the composer-facing
documentation).


## Architecture at a Glance

```
                        PRODUCERS                          CONSUMER
                        --------                          --------

  o2p.js ─────────┐
  controlXY.js ───┤
  rotate.js ──────┤   publish()     ParamBus       bindParam()
  scale.js ───────┼──────────────► Map<path,val> ◄──────────────── synth.js
  color.js ───────┤   (paramBinding)  │  ▲         (paramBinding)
  fade.js ────────┤                   │  │
  oscCtrl.js ─────┘                   │  │
                                      │  │
                              set()   │  │  subscribe()
                                      │  │
  socket.js ──► handleOSCIn() ────────┘  │
                (controlRouter)          │
                                         │
  console ──► oscillaParamBus.set() ─────┘
```

Every animation and control cue publishes its current values into
the ParamBus. Any cue that accepts signal bindings subscribes to
the ParamBus via `bindParam()`. The ParamBus is the single meeting
point -- producers and consumers never reference each other directly.


## File Map

All control-plane code lives under `js/control/`. Cue handlers that
publish signals live under `js/cues/`. The parser extension that
detects signal references lives under `js/parser/`.

```
control/
  paramBus.js           Signal store with pub/sub (the core)
  paramBinding.js        publish() and bindParam() helpers
  controlRouter.js       OSC-in routing, explicit modulation API
  controlIntegration.js  (dead code -- never imported, kept as reference)
  controlShared.js       Shared persistence for launcher/preset state
  easing.js              Easing functions for tween interpolation
  rotationMath.js        Rotation math utilities

parser/
  parserSignalRef.js     Detects "uid.channel[min,max]" in DSL values

cues/
  o2p.js                 Publishes: t, x, y, angle
  controlXY.js           Publishes: x, y, p (per handle)
  rotate.js              Publishes: angle, rad, norm
  scale.js               Publishes: sx, sy, uniform
  color.js               Publishes: hNorm, sNorm, lNorm
  fade.js                Publishes: opacity
  oscCtrl.js             Publishes: t, v
  synth.js               Consumes via bindParam()

system/
  oscillaOSCClient.js    OSC send/receive, routes incoming to controlRouter
  oscillaTargets.js      Target registry (for future OSC-in direct control)
  socket.js              WebSocket handler, calls handleOSCIn on messages
```


## The Signal Pipeline in Detail

There are three independent data paths. They all converge on the
ParamBus but serve different purposes.


### Path 1: Internal publish/subscribe (the main one)

This is how a fader controls a synth.

**Producer side** (in a cue handler's animation loop):

```js
import { publish } from '../control/paramBinding.js';

// Inside the tick/update callback:
publish("o2p", cfg.uid, {
    t: pathT,       // 0-1  position along path
    x: normX,       // 0-1  horizontal in bbox
    y: normY,       // 0-1  vertical in bbox
    angle: angle    // degrees, tangent direction
});
```

`publish()` does two things for each channel:

1. Writes a **typed path**: `o2p:myFader.t`
2. Writes a **source-agnostic path**: `myFader.t`

Both are stored in the same ParamBus Map, both notify subscribers.
The typed path exists for debugging and the explicit modulation API.
The agnostic path is what `bindParam()` subscribes to.

Publishing is throttled per source+uid at ~60fps to avoid flooding
the bus. The throttle interval is `PUBLISH_THROTTLE_MS` (default 16ms)
in `paramBinding.js`.

**Consumer side** (in synth.js or any cue that accepts bindings):

```js
import { bindParam } from '../control/paramBinding.js';

const freqBinding = bindParam(
    params.freq,                    // may be a number OR a signalRef
    (hz) => osc.frequency.value = hz,  // callback on each update
    { min: 20, max: 20000, default: 440 }
);

// Later, on cleanup:
freqBinding.unbind();
```

If `params.freq` is a plain number (e.g. `440`), `bindParam` returns
immediately with `{ value: 440, unbind: noop, isBinding: false }`.

If `params.freq` is a signalRef object (e.g.
`{ type: "signalRef", source: "fSlider", channel: "t", range: [200, 800] }`),
`bindParam` subscribes to the agnostic path `fSlider.t` and calls the
update callback whenever the value changes, mapping the raw 0-1 input
through `mapRange(raw, 0, 1, 200, 800)`.


### Path 2: OSC-in (external control)

External software (SuperCollider, Max, Pd) sends OSC to the Oscilla
server, which forwards it over WebSocket to all clients.

```
External OSC  ──►  server.js  ──►  WebSocket  ──►  socket.js
                                                     │
                                               handleOSCIn()
                                              (controlRouter.js)
                                                     │
                                               routeControl()
                                                     │
                                    ┌────────────────┴────────────────┐
                                    ▼                                 ▼
                              ParamBus.set()                  Targets.setParam()
                           (cue:uid.param path)              (if target registered)
```

The OSC address format is:

```
/oscilla/set <uid> <param> <value>
```

or the path-based form:

```
/oscilla/<uid>/<param> <value>
```

`socket.js` (line ~381) dispatches incoming messages to
`handleOSCIn()` in `controlRouter.js`, which calls `routeControl()`.
The router writes to the ParamBus at `cue:uid.param` and also
forwards to any registered target.

Note: the router does NOT send OSC back out. OSC output is handled
independently by each cue handler's own `sendOSC()` calls. This
prevents feedback loops between incoming and outgoing OSC.


### Path 3: Explicit modulation API (console / programmatic)

The controlRouter exposes `addModulation()` for wiring arbitrary
signal-to-target connections at runtime, with optional scaling,
offset, clamping, and smoothing.

```js
// In browser console:
window.oscillaRouter.mod(
    "o2p:slider.t",           // source signal (typed path)
    "drone.freq",             // target uid.param
    { scale: 1800, offset: 200, min: 200, max: 2000 }
);
```

This subscribes to the ParamBus at the source path and calls
`routeControl()` for the target on every update. It is independent
of the DSL binding mechanism and is primarily useful for live
performance patching or scripted compositions.

`listModulations()`, `removeModulation()`, and `clearModulations()`
manage the active modulation set.


## How the Parser Creates Signal References

When the parser encounters a synth cue, it extracts parameter values
with `signalRefAware: true` (parser.js line ~1297). For each
parameter value that is a string, it calls `maybeConvertToSignalRef()`
from `parserSignalRef.js`.

The function checks:
1. Is the parameter name in the `BINDABLE_PARAMS` set? (freq, amp,
   pan, cutoff, q, etc.)
2. Does the string match the pattern `identifier.identifier[num,num]`?

If both are true, it returns a signalRef object instead of the raw
string:

```
DSL input:    freq:fader1.t[200,800]

Parser output:
{
    type: "signalRef",
    source: "fader1",
    channel: "t",
    range: [200, 800]
}
```

This object flows through the AST into synth.js, where `bindParam()`
recognises it via `isSignalRef()` and sets up the subscription.


## Dual-Path Addressing

Every `publish()` call writes two ParamBus entries:

| Path               | Example             | Purpose                        |
|--------------------|---------------------|--------------------------------|
| Typed              | `o2p:fader1.t`      | Debugging, explicit modulation |
| Source-agnostic    | `fader1.t`          | What bindParam subscribes to   |

The agnostic path exists because the composer should not need to know
whether a control source is implemented as `o2p`, `controlXY`,
`rotate`, or anything else. They just write `freq:fader1.t[200,800]`
and it works.

The typed path survives for:
- `window.oscillaParamBus.snapshot("o2p:")` to list all o2p signals
- `window.oscillaRouter.mod("rotate:spin.norm", ...)` for explicit wiring
- Debug logging which shows the source type

Both paths hold the same value at all times.


## Published Channels by Source

Each cue type publishes a specific set of channels. All values are
numeric. Most are normalised to 0-1 unless noted.

### o2p (path-following animation)

| Channel | Range     | Description                      |
|---------|-----------|----------------------------------|
| t       | 0-1       | Position along path              |
| x       | 0-1       | Normalised X within path bbox    |
| y       | 0-1       | Normalised Y within path bbox    |
| angle   | 0-360 deg | Tangent direction at current pos |

Published in: `o2p.js` lines ~555, ~684, ~1202, ~1398.

### controlXY (touch/drag pad)

| Channel       | Range | Description                        |
|---------------|-------|------------------------------------|
| x             | 0-1   | Horizontal position (left=0)       |
| y             | 0-1   | Vertical position (bottom=0)       |
| p             | 0-1   | Rotation handle (if hmode present) |
| {handle}.x    | 0-1   | Per-handle X (multi-handle pads)   |
| {handle}.y    | 0-1   | Per-handle Y                       |
| {handle}.p    | 0-1   | Per-handle rotation                |

Published in: `controlXY.js` line ~481.

### rotate (CSS/transform rotation)

| Channel | Range      | Description             |
|---------|------------|-------------------------|
| angle   | 0-360 deg  | Current angle            |
| rad     | 0-2pi      | Angle in radians         |
| norm    | 0-1        | Normalised (angle / 360) |

Published in: `rotate.js` lines ~465, ~583.

### scale (CSS/transform scaling)

| Channel  | Range  | Description           |
|----------|--------|-----------------------|
| sx       | varies | Scale factor on X     |
| sy       | varies | Scale factor on Y     |
| uniform  | varies | Average of sx and sy  |

Published in: `scale.js` line ~618.

Note: scale values are raw factors (e.g. 0.5 to 2.0), not normalised
to 0-1. Binding these directly with a `[min,max]` range requires
awareness that `mapRange` assumes 0-1 input. A normalised channel
could be added in future.

### color (HSL color animation)

| Channel | Range | Description        |
|---------|-------|--------------------|
| hNorm   | 0-1   | Hue / 360          |
| sNorm   | 0-1   | Saturation / 100   |
| lNorm   | 0-1   | Lightness / 100    |

Published in: `color.js` lines ~426, ~610.

### fade (opacity animation)

| Channel | Range | Description    |
|---------|-------|----------------|
| opacity | 0-1   | Current opacity|

Published in: `fade.js` lines ~173, ~177, ~256.

### oscCtrl (playhead-driven control lane)

| Channel | Range | Description                  |
|---------|-------|------------------------------|
| t       | 0-1   | Playhead position within lane|
| v       | 0-1   | Normalised Y value from path |

Published in: `oscCtrl.js` line ~175.


## Bindable Parameters (Consumer Side)

Only synth cues currently accept signal references through the DSL.
The `BINDABLE_PARAMS` set in `parserSignalRef.js` defines which
parameter names the parser will check:

```
freq, frequency, amp, amplitude, gain, pan, cutoff, filterFreq,
q, resonance, detune, pitch, playbackRate, rate, delayTime, delay,
feedback, fb, mix, wet, dry, reverbMix, reverbTime, speed, dur, duration
```

synth.js wraps each of these with `bindParam()`, so if the parser
delivers a signalRef, the subscription activates. If it delivers a
plain number, `bindParam` returns a static value and no subscription
is created.


## How to Add a New Publisher

If you are writing a new cue type that produces values (e.g. a new
animation or sensor input), follow this pattern:

### 1. Import publish

```js
import { publish } from '../control/paramBinding.js';
```

### 2. Call publish in your animation loop

```js
// Inside your tick/update/rAF callback:
publish("myNewType", cfg.uid, {
    value1: normalisedValue,   // 0-1 preferred
    value2: anotherValue
});
```

Use 0-1 normalised values where possible. The `[min,max]` range
syntax in the DSL assumes 0-1 input.

### 3. Done

No registration, no setup, no teardown. The ParamBus handles
everything. When your cue stops and stops calling `publish()`, the
last value remains in the bus (stale but harmless). Subscribers
simply stop receiving updates.

Document the channel names and their ranges so composers know what
to bind to.


## How to Add a New Consumer

If you are writing a cue type that should accept signal-driven
parameters (like synth does):

### 1. Import bindParam and isSignalRef

```js
import { bindParam, isSignalRef } from '../control/paramBinding.js';
```

### 2. Wrap parameter initialisation

```js
const unbinders = [];

const speedBinding = bindParam(
    params.speed,                          // from parser, may be signalRef
    (val) => { cfg.animSpeed = val; },     // live update callback
    { min: 0.1, max: 10, default: 1 }
);
unbinders.push(speedBinding.unbind);

// Use speedBinding.value as the initial value
```

### 3. Clean up on stop

```js
function stop() {
    unbinders.forEach(fn => fn());
}
```

### 4. Enable signal refs in the parser

In `parser.js`, find the AST extraction for your cue type and pass
`{ signalRefAware: true }`:

```js
return {
    type: "cueMyType",
    args: extractGenericArgs(getGenericParams(node), { signalRefAware: true })
};
```

Currently only synth cues have this enabled (line ~1297). Extending
it to other cue types is a matter of adding the flag.


## OSC-In Target Registration (Not Yet Active)

The controlRouter has a second routing path: when `routeControl()` is
called (e.g. from OSC-in), it also tries `Targets.get(uid)` and calls
`setParam()` on the registered target. This would allow external OSC
to directly set parameters on running cue instances.

However, **no cue handler currently registers as a target**. The
`controlIntegration.js` file contains `registerO2PTarget()`,
`registerRotateTarget()` etc., but nothing imports it.

To activate this path in future:
1. Import the register function in the cue handler
2. Call it when the cue starts, passing a `setParam` implementation
3. Call `unregister()` when the cue stops

This is a separate feature from the publish/subscribe mechanism and
is not required for cross-cue modulation to work.


## Debugging

### Enable ParamBus logging

```js
window.oscillaParamBus.setDebugMode(true);
```

Every `set()` call that changes a value will be logged with the path
and value.

### Inspect current signals

```js
window.oscillaParamBus.snapshot()        // all signals
window.oscillaParamBus.snapshot("o2p:")  // only o2p typed paths
window.oscillaParamBus.get("fader1.t")  // specific agnostic path
```

### Watch a signal

```js
const unsub = window.oscillaParamBus.subscribe("fader1.t", (val, path) => {
    console.log(`${path} = ${val}`);
});
// Later: unsub()
```

### List active modulations

```js
window.oscillaRouter.listModulations()
```

### Simulate a signal (no SVG needed)

```js
let t = 0;
const sim = setInterval(() => {
    t = (t + 0.01) % 1;
    window.oscillaParamBus.set("testFader.t", t);
}, 30);
// clearInterval(sim) to stop
```

### Check if a binding is active

In synth.js, `bindParam()` logs to console when a subscription is
created: `[bindParam] Bound to fader1.t -> range [200, 800]`. If you
don't see this log, the parser didn't produce a signalRef -- check
that the parameter name is in `BINDABLE_PARAMS` and that the value
string matches the `uid.channel` or `uid.channel[min,max]` pattern.


## Known Limitations

**Scale and rotate raw ranges.** The `scale` channels publish raw
factors (0.5, 1.0, 2.0 etc.), not 0-1 normalised values. The
`mapRange` function in `bindParam` assumes 0-1 input. Binding
`amp:scaler.sx[0,0.3]` when sx ranges from 0.5 to 2.0 will produce
unexpected mappings. Use `rotate:norm` (which is 0-1) for rotation
bindings. For scale, a normalised channel should be added.

**Only synth accepts signal refs in DSL.** The parser's
`signalRefAware` flag is only enabled for synth cues. Other cue types
(rotate, scale, fade, audio) will silently treat `speed:fader.t` as
a literal string. Extending this requires the flag in the parser plus
`bindParam()` calls in the cue handler.

**No input range specification.** The `[min,max]` syntax specifies
the output range only. Input is assumed 0-1. There is no syntax for
`freq:spinner.angle[0,360][200,2000]` (input 0-360, output 200-2000).
For non-normalised sources, use the `norm` channel where available or
add normalisation in the publisher.

**Stale signals.** When a cue stops, its last published values remain
in the ParamBus. This is harmless for subscribers (they just stop
receiving updates) but can be confusing when inspecting state via
`snapshot()`. A future cleanup hook could clear signals on cue stop.

**controlIntegration.js is dead code.** It is not imported anywhere.
It was written as a convenience layer over the router and targets but
the cue handlers use `publish()` and `bindParam()` directly instead.
It can be deleted or kept as reference for the target registration
pattern.

**No feedback prevention.** The system does not detect or prevent
circular signal routing. If cue A modulates cue B and cue B modulates
cue A, both will update continuously. This is by design -- feedback
is an intentional compositional tool -- but accidental loops can cause
CPU spikes.
