---
title: Oscilla Documentation
layout: docs_layout.njk
---

# Oscilla Documentation

This documentation describes the cue system, animation model, authoring workflow, and internal architecture of Oscilla.  
All behaviour is authored directly in SVG and executed at runtime in the browser.

---

## Cue Reference

Cues are the primary execution units in Oscilla. They control timing, navigation, media playback, interaction, and external communication.

### Timing & Navigation

- [`pause()`](/docs/cue_pause/) — pause playback
- [`stop()`](/docs/cue_stop/) — halt playback
- [`nav()`](/docs/cue_nav/) — navigation and mode control
- [`page()`](/docs/cue_page/) — page-based navigation
- [`stopwatch()`](/docs/cue_stopwatch/) — time display and control
- [`repeat()`](/docs/cue_repeat/) — repeat and loop structures

---

### Media & Sound

- [`audio()`](/docs/cue_audio/) — audio file playback
- [`media()`](/docs/cue_media/) — generic media triggering
- [`video()`](/docs/cue_video/) — video playback
- [`text()`](/docs/cue_text/) — timed and sequenced text
- [`fade()`](/docs/cue_fade/) — fade visual or UI elements

---

### OSC & External Control

- [`osc()`](/docs/cue_osc/) — OSC message output
- [`oscCtrl()`](/docs/cue_oscCtrl/) — OSC routing and control

---

### Interaction & Structure

- [`button()`](/docs/cue_button/) — interactive UI buttons
- [`choice()`](/docs/cue_choice/) — performer or system choices
- [`group()`](/docs/cue_group/) — cue grouping and structuring
- [`propagate()`](/docs/cue_propagate/) — propagate cue state
- [`reuse()`](/docs/cue_reuse/) — reuse cue definitions
- [`traverse()`](/docs/cue_traverse/) — object traversal across points or paths

---

## Animation

Oscilla supports continuous and discrete animation tied directly to score timing.

- [`scale()`](/docs/anim_scale/) — uniform and non-uniform scaling
- [`rotate()`](/docs/anim_rotate/) — continuous and stepped rotation
- [`o2p()`](/docs/cue_o2p/) — object-to-path traversal
- `color()` — **color animation (documentation forthcoming)**

---

## System

Documentation for the internal execution model and architecture.

- [Cue System Overview](/docs/cueSystem/) — cue lifecycle and execution model
- [Cue Handler Architecture](/docs/cuehandler_architecture/) — internal structure
- [Propagation & Reuse](/docs/cue_propagate/) — shared state and reuse logic

---

## Authoring Workflow

- [Workflow](/docs/workflow/) — SVG authoring and browser execution
- [Cheatsheet](/docs/cheatsheet/) — compact syntax reference
- [Installation](/docs/INSTALL/)
- [Quickstart](/docs/QUICKSTART/)

---

## Further Reading

The design and rationale of Oscilla are described in:

> R. Canning, *OscillaScore: A Modular Platform for Graphic Notation in Networked Music Performance*,  
> Proceedings of the International Conference on Technologies for Music Notation and Representation (TENOR), Beijing, 2025.

---
