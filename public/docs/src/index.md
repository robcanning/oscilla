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

- [`pause()`](https://robcanning.github.io/oscilla/docs/cue_pause/) — pause playback
- [`stop()`](https://robcanning.github.io/oscilla/docs/cue_stop/) — halt playback
- [`nav()`](https://robcanning.github.io/oscilla/docs/cue_nav/) — navigation and mode control
- [`page()`](https://robcanning.github.io/oscilla/docs/cue_page/) — page-based navigation
- [`stopwatch()`](https://robcanning.github.io/oscilla/docs/cue_stopwatch/) — time display and control
- [`repeat()`](https://robcanning.github.io/oscilla/docs/cue_repeat/) — repeat and loop structures

---

### Media & Sound

- [`audio()`](https://robcanning.github.io/oscilla/docs/cue_audio/) — audio file playback
- [`media()`](https://robcanning.github.io/oscilla/docs/cue_media/) — generic media triggering
- [`video()`](https://robcanning.github.io/oscilla/docs/cue_video/) — video playback
- [`text()`](https://robcanning.github.io/oscilla/docs/cue_text/) — timed and sequenced text
- [`fade()`](https://robcanning.github.io/oscilla/docs/cue_fade/) — fade visual or UI elements

---

### OSC & External Control

- [`osc()`](https://robcanning.github.io/oscilla/docs/cue_osc/) — OSC message output
- [`oscCtrl()`](https://robcanning.github.io/oscilla/docs/cue_oscCtrl/) — OSC routing and control

---

### Interaction & Structure

- [`button()`](https://robcanning.github.io/oscilla/docs/cue_button/) — interactive UI buttons
- [`choice()`](https://robcanning.github.io/oscilla/docs/cue_choice/) — performer or system choices
- [`group()`](https://robcanning.github.io/oscilla/docs/cue_group/) — cue grouping and structuring
- [`propagate()`](https://robcanning.github.io/oscilla/docs/cue_propagate/) — propagate cue state
- [`reuse()`](https://robcanning.github.io/oscilla/docs/cue_reuse/) — reuse cue definitions
- [`traverse()`](https://robcanning.github.io/oscilla/docs/cue_traverse/) — object traversal across points or paths

---

## Animation

Oscilla supports continuous and discrete animation tied directly to score timing.

- [`scale()`](https://robcanning.github.io/oscilla/docs/anim_scale/) — uniform and non-uniform scaling
- [`rotate()`](https://robcanning.github.io/oscilla/docs/anim_rotate/) — continuous and stepped rotation
- [`o2p()`](https://robcanning.github.io/oscilla/docs/cue_o2p/) — object-to-path traversal
- `color()` — **color animation (documentation forthcoming)**

---

## System

Documentation for the internal execution model and architecture.

- [Cue System Overview](https://robcanning.github.io/oscilla/docs/cueSystem/) — cue lifecycle and execution model
- [Cue Handler Architecture](https://robcanning.github.io/oscilla/docs/cuehandler_architecture/) — internal structure
- [Propagation & Reuse](https://robcanning.github.io/oscilla/docs/cue_propagate/) — shared state and reuse logic

---

## Authoring Workflow

- [Workflow](https://robcanning.github.io/oscilla/docs/workflow/) — SVG authoring and browser execution
- [Cheatsheet](https://robcanning.github.io/oscilla/docs/cheatsheet/) — compact syntax reference
- [Installation](https://robcanning.github.io/oscilla/docs/INSTALL/)
- [Quickstart](https://robcanning.github.io/oscilla/docs/QUICKSTART/)

---

## Further Reading

The design and rationale of Oscilla are described in:

> R. Canning, *OscillaScore: A Modular Platform for Graphic Notation in Networked Music Performance*,  
> Proceedings of the International Conference on Technologies for Music Notation and Representation (TENOR), Beijing, 2025.
