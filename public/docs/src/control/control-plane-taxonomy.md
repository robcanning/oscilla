# Oscilla Control Plane -- Taxonomy & Quick Reference

This document defines the canonical terminology for the Oscilla control plane. Every term here maps to a specific concept in the code. Use these terms consistently in documentation, code comments, and conversation.

---

## The Five Core Concepts

```
PUBLISHER  ──publishes──▶  SIGNAL  ──stored in──▶  PARAMBUS
                                                      │
                                        SUBSCRIBER ◀──notifies──┘
                                            │
                                         BINDING (maps signal range to parameter range)
```

### 1. Signal

A named, continuously-updated numeric value. Signals are the atoms of the control plane -- everything else exists to produce or consume them.

A signal has a **path** that identifies it. There are two path forms:

**Typed path** -- includes the source type prefix: `o2p:myFader.t`, `rotate:orb1.angle`, `osc:/fader1`. Used for debugging, explicit modulation routing, and OSC routing.

**Agnostic path** -- omits the source type: `myFader.t`, `orb1.angle`. This is what `bindParam()` subscribes to, so the composer never needs to know or care whether a value comes from o2p, controlXY, rotate, or any other source type. The DSL uses agnostic paths.

Both paths are written to the ParamBus simultaneously by `publish()`.

All signals are assumed to be in the **0--1 range** unless documented otherwise (e.g. `angle` is in degrees). Range mapping to useful output values happens at the subscriber end.


### 2. Publisher

Any cue or module that writes signal values. A publisher calls `publish(sourceType, uid, channels)` which writes to the ParamBus.

A publisher does not know or care who (if anyone) is listening.

**Current publishers:**

| Source type | Published channels | Example |
|---|---|---|
| `o2p` | `t`, `x`, `y`, `angle`, `p` | `o2p(path:track1, uid:fader1)` |
| `controlXY` | `x`, `y`, `p`, `{handleId}.x`, `{handleId}.y` | `controlXY(uid:pad1, ...)` |
| `rotate` | `angle`, `rad`, `norm` | `rotate(uid:orb1, ...)` |
| `scale` | `sx`, `sy`, `uniform` | `scale(uid:box1, ...)` |

The `uid` is the publisher's identity. It determines the signal path. If a fader has `uid:fSlider`, its traversal signal is `fSlider.t`.


### 3. ParamBus

The global signal store. A flat key-value map (`Map<string, number>`) with pub/sub notification. It holds the latest value of every signal and notifies subscribers when values change.

The ParamBus has no knowledge of what the values mean -- it just stores numbers at string paths and fires callbacks.

**Core operations:**

| Operation | Function | What it does |
|---|---|---|
| Write | `ParamBus.set(path, value, meta)` | Store value, notify subscribers |
| Read | `ParamBus.get(path)` | Return current value |
| Listen | `ParamBus.subscribe(path, callback)` | Call `callback(value, path, meta)` on change |
| Wildcard listen | `ParamBus.subscribe("o2p:*", callback)` | Match all paths with prefix |

Console access: `window.oscillaParamBus.snapshot()` shows all current signals.


### 4. Subscriber

Any cue or module that reads signal values. A subscriber calls `ParamBus.subscribe(path, callback)` and receives updates whenever the signal changes.

Subscribers do not know or care who is publishing the signal.


### 5. Binding

The bridge between a signal and a cue parameter. `bindParam()` creates a binding that subscribes to a signal, maps the 0--1 value to an output range, and calls an update handler whenever the signal changes.

A binding encapsulates: which signal to listen to, what output range to map to, optional smoothing, and a cleanup function (`unbind`).


---

## DSL Syntax

### Signal Reference

The DSL syntax for connecting a parameter to a signal:

```
param:source.channel[min,max]
```

| Part | Meaning | Example |
|---|---|---|
| `param` | The cue parameter being controlled | `freq`, `amp`, `pan`, `cutoff` |
| `source` | The `uid` of the publisher | `fSlider`, `myFader`, `pad1` |
| `channel` | Which signal from that publisher | `t`, `x`, `y`, `angle`, `p` |
| `[min,max]` | Output range mapping (optional) | `[200,800]`, `[0,0.5]`, `[-1,1]` |

The parser converts this string into a **signalRef** object:

```js
{ type: "signalRef", source: "fSlider", channel: "t", range: [200, 800] }
```

`bindParam()` then subscribes to the agnostic path `fSlider.t` and maps incoming 0--1 values to 200--800.


### Common Channels

| Channel | Meaning | Range | Published by |
|---|---|---|---|
| `t` | Path traversal position | 0--1 | o2p |
| `x` | Normalized X position | 0--1 | o2p, controlXY |
| `y` | Normalized Y position | 0--1 | o2p, controlXY |
| `angle` | Tangent or rotation angle | degrees | o2p, rotate |
| `p` | Rotation handle position | 0--1 | o2p (hmode), controlXY |
| `norm` | Normalized rotation | 0--1 | rotate |
| `sx`, `sy` | Scale factors | varies | scale |
| `uniform` | Average scale | varies | scale |


---

## Signal Flow -- Complete Path

Here is the full chain from a fader drag to a synth frequency change:

```
1. User drags fader along path
         │
2. o2pTouchOverlays.js converts pointer to path position (mappedT)
         │
3. o2p.js updatePosition() calls:
         │
    ├── applyTransform()         (moves the SVG object)
    ├── emitO2POsc()             (sends OSC to external software)
    └── publish("o2p", uid, {    (writes to ParamBus)
          t: mappedT,
          x: normX,
          y: normY,
          angle: angle
        })
         │
4. publish() writes TWO paths to ParamBus:
    ├── "o2p:fSlider.t" = 0.73        (typed path)
    └── "fSlider.t" = 0.73            (agnostic path)
         │
5. ParamBus notifies all subscribers of "fSlider.t"
         │
6. bindParam()'s subscription fires:
    ├── reads raw value: 0.73
    ├── maps to output range: mapRange(0.73, 0, 1, 200, 800) = 638
    └── calls onUpdate(638)
         │
7. synth.js update handler:
    └── osc.frequency.setTargetAtTime(638, now, 0.02)
```

---

## Addressing Rules

### The uid is the identity

The `uid` parameter is what ties a publisher to its subscribers. It is the single source of truth for signal routing. Everything else (`oscAddr`, element `id`, `path`) serves other purposes.

| Parameter | Purpose | Used by |
|---|---|---|
| `uid` | Signal identity on the ParamBus | publish/subscribe |
| `oscAddr` | OSC network address | sendOSC() only |
| `id` | SVG element identity | DOM, Inkscape |
| `path` | SVG path element to follow | o2p animation engine |


### Matching rule

For a subscriber to receive a publisher's signal: the `source` in the signal reference must exactly match the publisher's `uid`. There is no fuzzy matching, no fallback to element id or oscAddr.

```
Publisher:   o2p(..., uid:fSlider)     →  publishes "fSlider.t"
Subscriber:  synth(freq:fSlider.t)     →  subscribes to "fSlider.t"  ✓ MATCH

Publisher:   o2p(..., uid:fSliderEx)   →  publishes "fSliderEx.t"
Subscriber:  synth(freq:fSlider.t)     →  subscribes to "fSlider.t"  ✗ NO MATCH
```


---

## Related But Separate: OSC

OSC (Open Sound Control) is a **network protocol** for sending messages to external software. It is a completely separate system from the ParamBus -- they happen to carry similar values but do not interact.

| | ParamBus | OSC |
|---|---|---|
| Purpose | Internal signal routing between cues | Network messages to external software |
| Transport | In-memory JavaScript Map | WebSocket to server, then UDP |
| Address format | `uid.channel` | `/oscAddr value value ...` |
| Controlled by | `uid` parameter | `oscAddr` parameter |
| Rate | ~60fps (throttled) | Configurable (`osc:30` = 30ms) |
| Bidirectional | Yes (publish + subscribe) | Yes (sendOSC + handleOSCIn) |

A cue can use both systems simultaneously. They are configured independently:

```
o2p(path:track1, uid:myFader, osc:true, oscAddr:volume)
```

This publishes `myFader.t` to the ParamBus AND sends `/volume 0.73 ...` over OSC. They are unrelated namespaces.


---

## Debugging

### Console commands

```js
// See all current signal values
window.oscillaParamBus.snapshot()

// See signals from a specific source type
window.oscillaParamBus.snapshot("o2p:")

// Watch a specific signal
window.oscillaParamBus.subscribe("fSlider.t", (v) => console.log("t =", v))

// Check if a binding is active
window.oscillaBinding  // all binding utilities

// Enable verbose logging
window.oscillaParamBus.setDebugMode(true)
```

### Common problems

**Signal not arriving** -- check that the publisher's `uid` exactly matches the `source` in the signal reference. Use `oscillaParamBus.snapshot()` to see what paths actually exist.

**Wrong range** -- all signals are 0--1. If the value looks wrong, check the `[min,max]` mapping in the DSL. If omitted, the raw 0--1 value is used.

**OSC works but binding doesn't** -- `oscAddr` and `uid` are separate. OSC uses `oscAddr`, the ParamBus uses `uid`. They must be configured independently.

**Value stuck** -- check the publish throttle (16ms / ~60fps). If two publishers write the same path, the last one wins.


---

## Glossary

| Term | Definition |
|---|---|
| **Signal** | A named numeric value on the ParamBus, continuously updated |
| **Signal path** | The string key identifying a signal (e.g. `fSlider.t`) |
| **Typed path** | Signal path with source prefix (e.g. `o2p:fSlider.t`) -- for debugging |
| **Agnostic path** | Signal path without source prefix (e.g. `fSlider.t`) -- what bindings use |
| **Channel** | One dimension of a signal (`t`, `x`, `y`, `angle`, `p`) |
| **Publisher** | A cue that writes signals via `publish()` |
| **Subscriber** | A cue that reads signals via `ParamBus.subscribe()` |
| **Binding** | A subscription + range mapping, created by `bindParam()` |
| **Signal reference** | DSL syntax: `source.channel[min,max]` -- parsed into a signalRef object |
| **signalRef** | Parser output: `{ type: "signalRef", source, channel, range }` |
| **ParamBus** | The global signal store (`paramBus.js`) |
| **Control Router** | Optional routing layer for modulation and OSC-in (`controlRouter.js`) |
| **Modulation** | A Router-managed subscription from one signal to another cue's parameter |
| **Target** | A running cue instance registered with the Router for external control |
| **uid** | The unique identity of a cue instance, used for all signal routing |
| **oscAddr** | The OSC network address -- separate from uid, used only for OSC messages |
| **Range mapping** | Converting a 0--1 signal to a useful output range (e.g. 200--800 Hz) |
| **Unbind** | Cleanup function returned by `bindParam()`, removes the subscription |
| **Source type** | Category label for a publisher: `o2p`, `controlXY`, `rotate`, `scale` |
