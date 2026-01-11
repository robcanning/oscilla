---
title: Oscilla
layout: layout.njk
---

Oscilla is an open-source platform for creating and performing animated, cue-driven graphic scores in the browser. Scores are authored as SVG documents and executed as synchronized, networked performance environments.

Oscilla integrates timing, animation, media control, and OSC output into a single browser-native score engine.

<p style="text-align:left;">
  <a href="./assets/oscilla-title-logo.png" target="_blank">
    <img src="./assets/oscilla-title-logo.png"
         alt="Oscilla title"
         style="width:100%;height:auto;border-radius:6px;" />
  </a>
</p>

---

## Documentation

**Start here:**

 **https://robcanning.github.io/oscilla/docs/**

The documentation includes:
- Complete cue reference
- Animation and transformation syntax
- Authoring workflow (Inkscape → browser)
- System architecture
- Cheatsheets and examples

---

## Core Cue System

Oscilla uses a cue-driven execution model. Cues are embedded directly in SVG IDs and are evaluated in real time during score playback.

### Available Cue Types

**Timing & Navigation**
- `pause()` — pause playback
- `stop()` — halt playback
- `nav()` — navigation and mode control
- `page()` — page-based score navigation
- `stopwatch()` — time display and control
- `metronome()` — tempo reference

**Media & Sound**
- `audio()` — audio file playback
- `synth()` — browser-based synthesis
- `video()` — video playback

**OSC & External Control**
- `osc()` — OSC message output
- `oscCtrl()` — OSC routing and control

**Interaction & Structure**
- `button()` — interactive UI elements
- `propagate()` — propagate cue state
- `reuse()` — reuse cue definitions
- `text()` — timed and sequenced text
- `fade()` — fade visual or UI elements

Full syntax and parameters for each cue are documented here:  
 https://robcanning.github.io/oscilla/docs/

---

## Animation System

Oscilla supports continuous and discrete animation directly tied to score timing.

### Animation Namespaces

- `scale()` — uniform or non-uniform scaling
- `rotate()` — continuous or stepped rotation
- `o2p()` — object-to-path traversal

Animations can be:
- time-based or duration-based  
- looped, alternating, or one-shot  
- nested and combined  
- synchronized across clients  

Animation syntax is documented here:  
 https://robcanning.github.io/oscilla/docs/cheatsheet/

---

## What Kind of System Is Oscilla?

Oscilla is a **modular score execution platform** combining:

- cue-based timing and control
- animated graphic notation
- networked synchronization (WebSockets / OSC)
- browser-native media playback

It is designed for composers and performers working with animated, spatial, and networked scores.

The system is described in:

> R. Canning, *OscillaScore: A Modular Platform for Graphic Notation in Networked Music Performance*,  
> Proceedings of the International Conference on Technologies for Music Notation and Representation (TENOR), Beijing, 2025.

---

## Authoring Scores

Scores are authored as **SVG files**, typically using **Inkscape**.

- SVG IDs define timing, animation, and cues
- No custom file formats or export steps
- Refresh the browser to see changes

Authoring workflow:  
 https://robcanning.github.io/oscilla/docs/workflow/

---

