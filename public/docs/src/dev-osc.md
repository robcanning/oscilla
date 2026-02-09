---
title:  Oscilla OSC System
layout: docs_layout.njk
---
 
# Oscilla OSC System — Developer Guide

## What is OSC in Oscilla?

OSC (Open Sound Control) is how Oscilla talks to external audio engines — SuperCollider, Pure Data, Max/MSP, etc. The browser client doesn't produce sound directly. Instead, cues in the SVG score generate OSC messages that travel:

```
SVG cue → oscillaOSCClient → WebSocket → Node server → UDP OSC → audio engine
```

Incoming control messages (e.g. from a hardware controller routed through the server) travel the reverse path.

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Cue modules (osc, oscCtrl, audio, synth, etc.)     │
│  Each calls sendOSC() when the playhead or user      │
│  triggers them                                        │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│  oscillaOSCClient.js  (system/oscillaOSCClient.js)  │
│  ─ Single gateway for ALL outbound OSC              │
│  ─ Mute control with UI sync                        │
│  ─ Incoming dispatch + handler registration         │
│  ─ Address normalisation utilities                  │
│  ─ window.oscillaOSC for console debugging          │
└──────────┬──────────────────────┬───────────────────┘
           │ outbound             │ inbound
           ▼                      │
┌──────────────────┐              │
│  WebSocket        │◄─────────────┘
│  (socket.js)      │
└──────────────────┘
           │
           ▼
┌──────────────────┐
│  Node server      │──► UDP OSC to audio engine
└──────────────────┘
```

## Key Files

| File | Location | Role |
|------|----------|------|
| `oscillaOSCClient.js` | `system/` | **Central gateway** — all OSC in/out passes through here |
| `osc.js` | `cues/` | Discrete `osc(...)` cue handler + `createOscOverlay()` for visual HUD |
| `oscCtrl.js` | `cues/` | Continuous control lanes — follows SVG path shape as playhead moves |
| `socket.js` | `system/` | WebSocket transport — routes incoming `osc_in` / `osc_control` to `dispatchOSC()` |
| `controlRouter.js` | `control/` | Routes control values to animation targets + ParamBus |
| `paramBus.js` | `control/` | Global signal store with pub/sub — the nervous system for cross-cue modulation |

### Cue modules that send OSC

These all import `sendOSC` from `oscillaOSCClient.js`:

- **`audio.js`** — audio pool cues (`osc_audio_pool` messages)
- **`synth.js`** — synth parameter snapshots
- **`color.js`** — colour-as-control data
- **`o2p.js`** — object-to-parameter traversal values
- **`rotate.js`** — rotation angle output
- **`scale.js`** — scale factor output
- **`controlXY.js`** / **`controlXYPresets.js`** — multitouch XY pad values
- **`metro.js`** — metronome beat/BPM (has its own 50ms throttle)

## Sending OSC

All outbound OSC goes through one function:

```js
import { sendOSC } from "../system/oscillaOSCClient.js";

sendOSC({
  type: "osc_value",       // message type (server uses this for routing)
  addr: "voice/pitch",     // OSC address (without leading /oscilla/)
  args: [0.5, 0.8],        // values
  timestamp: Date.now()
});
```

`sendOSC()` handles mute checking, UI preview updates, and WebSocket dispatch. You never need to touch `window.socket` directly for OSC.

There's also a convenience form:

```js
import { send } from "../system/oscillaOSCClient.js";

send("voice/pitch", 0.5, 0.8);
// Equivalent to sendOSC with type "osc_value"
```

## Receiving OSC

Incoming OSC arrives via WebSocket as `osc_in` or `osc_control` messages. `socket.js` hands them to `oscillaOSCClient.dispatchOSC()`, which does three things:

1. **Fires registered handlers** — any module can listen for specific addresses
2. **Stores in ParamBus** — at path `osc:<normalised-address>` for modulation use
3. **Routes through controlRouter** — for `/oscilla/set` and `/oscilla/<uid>/<param>` patterns

### Registering a handler

```js
import { onAddress } from "../system/oscillaOSCClient.js";

// Exact match
const unsub = onAddress("fader1", (args, address) => {
  console.log("fader1 value:", args[0]);
});

// Wildcard (prefix match)
const unsub2 = onAddress("mixer/*", (args, address) => {
  console.log(`${address}:`, args);
});

// Clean up when done
unsub();
```

## OSC Mute

Global mute prevents all outbound OSC without stopping cue evaluation or overlays. The mute button (`#osc-mute-btn`) is wired in `UIBindings.js` and delegates to:

```js
import { toggleMuted, setMuted, isMuted } from "../system/oscillaOSCClient.js";

toggleMuted();    // flip state
setMuted(true);   // explicit
isMuted();        // query
```

`window.oscMuted` stays synced for backward compatibility. When muted, the UI preview box shows `[muted]` prefix but still displays what *would* have been sent.

## ParamBus Integration

Every signal in Oscilla flows through ParamBus (`control/paramBus.js`). Signal paths follow the pattern:

```
<source>:<id>.<channel>
```

Examples:
- `o2p:sliderA.t` — traversal position of an O2P animation
- `rotate:orb1.angle` — rotation angle in degrees
- `osc:fader1` — external OSC input value

Incoming OSC is automatically stored at `osc:<address>`. You can subscribe to any signal for cross-cue modulation:

```js
import * as ParamBus from "../control/paramBus.js";

ParamBus.subscribe("osc:fader1", (value, path, meta) => {
  // React to external fader changes
});
```

## Control Router

`controlRouter.js` sits between signals and targets. It provides:

- **`routeControl(uid, param, value)`** — update a target + ParamBus
- **`publishSignal(source, id, channel, value)`** — emit from an animation (rate-limited)
- **`addModulation(signalPath, targetUid, targetParam, options)`** — wire signal→target with scale/offset/smoothing/clamping

The router does NOT send OSC itself — that's intentional to prevent feedback loops.

## Visual Overlays

`osc.js` exports `createOscOverlay()` which provides the HUD display attached to cue elements. This is purely visual and completely independent of the sending path. Every cue module imports it separately:

```js
import { createOscOverlay } from "./osc.js";

const overlay = createOscOverlay({
  anchorEl: svgElement,
  label: "/voice/pitch",
  mode: "auto"
});

overlay.update("val:0.500");
overlay.position();
overlay.destroy();
```

## Message Types

Common `type` values the server expects:

| type | Source | Purpose |
|------|--------|---------|
| `osc_value` | `osc.js`, `controlXY.js` | Generic addressed value |
| `osc_control` | `oscCtrl.js` | Continuous control lane output |
| `osc_audio_pool` | `audio.js` | Audio cue trigger with parameters |
| `oscilla/metro` | `metro.js` | Metronome beat events |

## Debugging

Open the browser console and use `window.oscillaOSC`:

```js
window.oscillaOSC.setDebugMode(true);  // log all in/out
window.oscillaOSC.isMuted();           // check mute state
window.oscillaOSC.getLastMessage();    // inspect last sent payload
```

For the full signal state:

```js
window.oscillaParamBus.snapshot("osc:");   // all incoming OSC values
window.oscillaParamBus.snapshot();          // everything
window.oscillaRouter.listModulations();     // active signal→target wires
```
