---
title: Control and Modulation
layout: docs_layout.njk
---
# Control, Modulation, and Exposed Parameters in Oscilla

This document explains how cue parameters are exposed and controlled in Oscilla,
using concrete DSL-style examples.

It covers:
- how cues expose parameters
- how to control cues via external OSC
- how to use animation output as control signals
- how to route signals between cues
- how to construct feedback systems

---

## 1. Exposed Parameters: Core Idea

A cue exposes parameters if its runtime implementation supports updating them
while the cue is running.

Key points:

- Parameters are exposed by the running cue instance, not by special DSL syntax
- Parameters are addressed by `uid` and parameter name
- Control never retriggers cues
- Control only affects active (running) cues

---

## 2. Synth Cue with Exposed Parameters

Example synth cue:

synth(
  uid: synthA,
  wave: sine,
  freq: 220,
  amp: 0.2
)

What this does:

- Creates a synth instance with uid `synthA`
- Starts with frequency 220 Hz and amplitude 0.2
- Exposes runtime parameters:
  - amp
  - freq

These parameters can be updated at any time while the synth is running.

---

## 3. Controlling a Synth via External OSC

OSC control uses a single address format:

/oscilla/set <uid> <param> <value>

### Example: change amplitude

/oscilla/set synthA amp 0.4

Effect:
- The synth amplitude updates immediately
- The synth is not retriggered

### Example: change frequency

/oscilla/set synthA freq 330

---

## 4. Using o2p as an Internal Control Source

Example o2p cue:

o2p(
  uid: sliderA,
  path: p1,
  dur: 12,
  loop: true
)

This cue publishes internal control signals:

- o2p:sliderA.t   (normalised position along the path, 0–1)

---

### Example: o2p controls synth amplitude

Conceptual routing:

o2p:sliderA.t → synthA.amp

Effect:
- As the object moves along the path, the synth fades in and out
- No OSC is required

---

## 5. Using Rotation as a Control Signal

Example rotation cue:

rotate(
  uid: rotor1,
  values: [0, 360],
  dur: 6,
  loop: true
)

This cue publishes:

- rotate:rotor1.angle   (degrees, 0–360)

---

### Example: rotation controls scale

Assume a scale cue:

scale(
  uid: shape2,
  values: [0.5, 2.0],
  dur: 4,
  loop: true
)

Conceptual routing:

rotate:rotor1.angle → shape2.scale

Effect:
- The shape grows and shrinks in response to rotation

---

## 6. Cross-Cue Modulation (Visual → Audio)

### Example: rotation controls synth frequency

Conceptual routing:

rotate:rotor1.angle → synthA.freq

Effect:
- Visual motion directly shapes pitch
- The score behaves as a coupled audio–visual system

---

## 7. Multiple Parameters on One Cue

Example synth:

synth(
  uid: drone1,
  wave: saw,
  freq: 110,
  amp: 0.15
)

Exposed parameters:

- drone1.freq
- drone1.amp

Possible control routes:

o2p:sliderA.t → drone1.amp
rotate:rotor1.angle → drone1.freq

This allows multiple visual processes to control a single sound.

---

## 8. Feedback Structures

Because control signals are routable, feedback loops are possible.

### Example: visual–audio–visual feedback

rotate:rotor1.angle → drone1.amp
drone1.amp → rotor1.speed

Effect:
- Rotation shapes sound
- Sound feeds back into rotation speed
- The system becomes dynamically coupled

Oscilla does not prevent feedback.
Feedback is an explicit compositional decision.

---

## 9. Combining OSC and Internal Control

External OSC and internal control signals use the same control path.

### Example: performer + animation control

External OSC sets a baseline:

/oscilla/set synthA amp 0.2

Internal animation modulates it:

o2p:sliderA.t → synthA.amp

Effect:
- A performer establishes a base level
- Animation provides continuous variation

---

## 10. Mental Model

- DSL cues define what exists and how it starts
- Animations produce continuous control signals
- Signals can control any exposed parameter
- Feedback is explicit and intentional

Oscilla behaves as a signal-driven, executable score,
not a one-way timeline.

---

## 11. Summary

- Cue parameters are exposed by runtime implementation
- External OSC and internal signals share the same control path
- Any exposed parameter can be modulated
- Cross-cue modulation and feedback are core features
- No cue retriggering or special-case syntax is required
