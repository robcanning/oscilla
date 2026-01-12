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

- [`stop()`](cue_stop/) — halt playback
- [`pause()`](cue_pause/) — pause playback
- [`nav()`](cue_nav/) — navigation and mode control
- [`page()`](cue_page/) — page-based navigation
- [`stopwatch()`](cue_stopwatch/) — time display and control
- [`repeat()`](cue_repeat/) — repeat and loop structures

---

### Interaction & Structure

- [`button()`](cue_button/) — interactive UI buttons
- [`propagate()`](cue_propagate/) — propagate cue state
- [`reuse()`](cue_reuse/) — reuse cue definitions
- [`traverse()`](cue_traverse/) — object traversal across points or paths

---

## Animation

Oscilla supports continuous and discrete animation tied directly to score timing.

- [`scale()`](anim_scale/) — uniform and non-uniform scaling
- [`rotate()`](anim_rotate/) — continuous and stepped rotation
- [`o2p()`](cue_o2p/) — object-to-path traversal
- `color()` — **color animation (documentation forthcoming)**
- [`fade()`](cue_fade/) — fade visual or UI elements
- [`text()`](cue_text/) — timed and sequenced text

---

### A/V & Synthesis

- [`audio()`](cue_audio/) — audio file playback
- [`video()`](cue_video/) — video playback
- [`synth()`](cue_synth/) — in-browser synthesis

---

### OSC & External Control

- [`osc()`](cue_osc/) — OSC message output
- [`oscCtrl()`](cue_oscCtrl/) — OSC routing and control

---

## Authoring Workflow

- [Workflow](workflow/) — SVG authoring and browser execution
- [Cheatsheet](cheatsheet/) — compact syntax reference


---

## System

Documentation for the internal execution model and architecture.
- [Installation](INSTALL/)
- [Quickstart](QUICKSTART/)
- [Cue System Overview](cueSystem/) — cue lifecycle and execution model
- [Cue Handler Architecture](cuehandler_architecture/) — internal structure

---


## Further Reading

The design and rationale of Oscilla are described in:

> R. Canning, *OscillaScore: A Modular Platform for Graphic Notation in Networked Music Performance*,  
> Proceedings of the International Conference on Technologies for Music Notation and Representation (TENOR), Beijing, 2025.
