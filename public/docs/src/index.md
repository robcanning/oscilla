---
title: Oscilla Documentation
layout: docs_layout.njk
---

# Oscilla Documentation

This documentation describes the cue system, animation model, authoring workflow, and internal architecture of Oscilla. All behaviour is authored directly in SVG and executed at runtime in the browser.

---

## New to Oscilla?

If you’re looking for a high-level overview of what Oscilla is for, how it fits into contemporary score practice, and what you can actually accomplish with it, start here:

→ **[What is Oscilla?](about/)**

---

## Getting Started

- [What is Oscilla?](about/) — conceptual overview and use cases
- [Installation](INSTALL/) — setup and dependencies
- [Quickstart](QUICKSTART/) — your first Oscilla score
- [Workflow](workflow/) — SVG authoring and browser execution
- [Cheatsheet](cheatsheet/) — compact syntax reference
- [Screenshots](screenshots/) — visual examples

---

## Cue Reference

Cues are the primary execution units in Oscilla. They control timing, navigation, media playback, interaction, and external communication.

### Timing & Navigation

| Cue | Description |
|-----|-------------|
| [`stop()`](cue_stop/) | Halt playback |
| [`pause()`](cue_pause/) | Pause playback |
| [`speed()`](cue_speed/) | Playback speed control |
| [`stopwatch()`](cue_stopwatch/) | Time display and control |
| [`metronome()`](cue_metronome/) | Metronome and beat sync |
| [`page()`](cue_page/) | Page-based navigation |
| [`nav()`](cue_nav/) | Navigation and mode control |

### Interaction & Structure

| Cue | Description |
|-----|-------------|
| [`button()`](cue_button/) | Interactive UI buttons |
| [`propagate()`](cue_propagate/) | Propagate cue state |
| [`reuse()`](cue_reuse/) | Reuse cue definitions |

### Media & Synthesis

| Cue | Description |
|-----|-------------|
| [`text()`](cue_text/) | Timed and sequenced text |
| [`audio()`](cue_audio/) | Audio file playback |
| [`video()`](cue_video/) | Video playback |
| [`synth()`](cue_synth/) | In-browser synthesis |

### OSC & External Control

| Cue | Description |
|-----|-------------|
| [`osc()`](cue_osc/) | OSC message output |
| [`oscCtrl()`](cue_oscCtrl/) | OSC routing and control |

---

## Animation

Oscilla supports continuous and discrete animation tied directly to score timing.

| Function | Description |
|----------|-------------|
| [`scale()`](cue_scale/) | Uniform and non-uniform scaling |
| [`rotate()`](cue_rotate/) | Continuous and stepped rotation |
| [`o2p()`](cue_o2p/) | Object-to-path traversal |
| [`traverse()`](traverse/) | Object traversal across points or paths |
| [`color()`](color/) | Color animation |
| [`fade()`](cue_fade/) | Fade visual or UI elements |
| [`ui()`](cue_ui/) | UI element animation |

---

## Tools

- [Inkscape Extension](inkscape_extension/) — author Oscilla cues directly in Inkscape

---

## Developer

- [Sync Architecture](dev-sync-architecture/) — internal timing and sync model

---

## Further Reading

The design and rationale of Oscilla are described in:

> R. Canning, *OscillaScore: A Modular Platform for Graphic Notation in Networked Music Performance*, Proceedings of the International Conference on Technologies for Music Notation and Representation (TENOR), Beijing, 2025.
