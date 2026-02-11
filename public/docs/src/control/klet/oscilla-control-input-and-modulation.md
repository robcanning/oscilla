# Oscilla Control Input & Cross-Cue Modulation

## Overview

Oscilla supports **bidirectional control flow**: values can enter the system from external OSC sources, internal animations, UI elements, or other cues, and can be routed to any running cue instance.

This enables:

- external control of cue parameters via OSC
- internal control using animation outputs (e.g. o2p, rotation)
- **cross-cue modulation** (one cue influencing another)
- explicit **feedback patterns** between cues

Control is treated as a **first-class signal layer**, separate from cue triggering and animation scheduling.

---

## Core Concept

Oscilla introduces a shared **control plane** built from three components:

1. **Targets** — running cue instances that expose controllable parameters
2. **ParamBus** — a global store of named control signals
3. **Control Router** — a single routing function that connects signals to targets

All control sources (OSC-in, o2p, UI, other cues) converge through the same mechanism.

---

## Addressing Model

### Target addressing

Each controllable cue instance has a unique `uid`.

Parameters are addressed as:

```
cue:<uid>.<param>
```

Examples:
- `cue:synthA.amp`
- `cue:drone1.freq`
- `cue:rotor3.speed`

---

### Signal addressing (ParamBus)

Control signals live in a global namespace:

```
<source>:<id>.<channel>
```

Examples:
- `o2p:sliderA.t`
- `rotate:orb1.angle`
- `osc:/fader1`

These signals may be:
- published continuously
- subscribed to by one or more targets
- used as modulation sources

---

## Targets

A **target** is any running cue instance that opts into control.

### Target contract

```js
{
  setParam(name, value, meta)
}
```

Targets are registered by `uid` when the cue starts, and unregistered on cleanup.

---

## ParamBus

The ParamBus stores and distributes control values.

### Responsibilities

- hold the latest value of each signal
- notify subscribers when values change
- provide symmetry between internal and external control

### API

```js
set(path, value, meta)
get(path, fallback)
subscribe(path, callback) → unsubscribe()
```

---

## Control Router

All control updates pass through a single function:

```js
routeControl(uid, param, value, meta)
```

### Behaviour

1. Updates the ParamBus at `cue:<uid>.<param>`
2. Forwards the value to the registered target (if present)

The router **does not automatically send OSC** to avoid feedback loops.

---

## OSC Input

### OSC address

External OSC control uses a single address:

```
/oscilla/set <uid> <param> <value>
```

---

## Cross-Cue Modulation (Core Feature)

Any cue that publishes a signal can modulate any other cue parameter.

Examples:

- rotation angle → scale amount
- o2p traversal → synth amplitude
- audio envelope → visual opacity

This is **intentional** and **supported**, not an accidental side effect.

---

## Feedback Patterns

Because control signals are routable, **feedback loops are possible**.

Oscilla does **not** prevent feedback. Instead, it makes it **explicit and composable**.

---

## Summary

By introducing a shared control plane, Oscilla evolves from a trigger-based score system into a **dynamic, signal-driven, executable score environment**.
