---
title: oscilla_screenshots
layout: docs_layout.njk
---


# Screenshots of Oscilla

## oscilla rehearsal mark navigation panel

<figure class="doc-image">
  <img
    src="{{ '/img/oscilla-interface-rehearsalmarks.png' | url }}"
    alt="Oscilla Rehearsal Mark Navigation"
  >
  <figcaption>Oscilla Rehearsal Mark Navigation</figcaption>
</figure>


## Oscilla Preferences GUI and "Hamburger" Dropdown Menu
<figure class="doc-image">
  <img
    src="{{ '/img/oscilla-preferences-gui.png' | url }}"
    alt="Oscilla Preferences"
  >
  <figcaption>Oscilla Interface and Preferences GUI</figcaption>
</figure>

oscilla-timers-fullscreen.png

## Oscilla Networked Stopwatch and Performance Timers
<figure class="doc-image">
  <img
    src="{{ '/img/oscilla-timers-fullscreen.png' | url }}"
    alt="Oscilla Performance Timers in Fullscreen Mode"
  >
  <figcaption>Oscilla's fullscreen timer interface with synchronized countdown sequences that function as a compositional framework for time-based structures. The sequencer enables composers to define named sections with specific durations, looping, and chaining—creating everything from structured improvisations to durational scores. Multiple display modes (solid, blur, transparent) allow the timer to overlay directly onto minimal cue scores or stand alone as the primary temporal reference for networked ensemble performances.</figcaption>
</figure>

## Oscilla "Contribution Surface"
<figure class="doc-image">
  <img
    src="{{ '/img/oscilla-contribution-surface.png' | url }}"
    alt="Oscilla Preferences"
  >
  <figcaption>The Contribution Surface provides a shared, executable workspace layered over the score, enabling performers to contribute text, sounds, and triggers during rehearsal or performance. These contributions can be moved, edited, and synchronised across the network, supporting collaborative, negotiated, and evolving score practices.</figcaption>
</figure>

## Oscilla OSC controller design in Inkscape
<figure class="doc-image">
  <img
    src="{{ '/img/oscilla-osc-controller.png' | url }}"
    alt="Oscilla OSC controller design in Inkscape"
  >
  <figcaption>An SVG-based OSC fader controller created in Inkscape. The orange ring indicates touch mode (<code>trig:touch</code>) is active, allowing the object to be dragged along the path. The value label displays the current position (0.00–1.00) in real-time.</figcaption>
</figure>


## Oscilla OSC controller design in Inkscape
<figure class="doc-image">
  <video 
    controls 
    loop 
    muted 
    playsinline
    style="max-width: 800px; width: 100%;"
    src="{{ '/img/oscilla-controlXY-pageview.mp4' | url }}"
    alt="Oscilla controlXY multitouch OSC controller demonstration"
  >
    Your browser does not support the video tag.
  </video>
  <figcaption>
    The <strong>controlXY</strong> multitouch OSC controller created in Inkscape. 
    Each control object can be dragged freely across the canvas, sending X, Y, and rotation (twist) values via OSC. 
    The orange rings indicate touch mode (<code>trig:touch</code>) is active. 
    Multiple simultaneous touches are supported, with each object independently sending its position and rotation state. 
    This example shows the page view with preset management and parameter display.
  </figcaption>
</figure>

## Oscilla "Native WebAudio Utility Synth"
<figure class="doc-image">
  <img
    src="{{ '/img/oscilla-synth-basic.png' | url }}"
    alt="Oscilla Synth"
  >
  <figcaption>Oscilla includes a lightweight, native WebAudio synthesiser intended for simple but musically useful electronic functions within the score environment. Rather than aiming to replace external audio systems, this built-in synth supports focused tasks such as drones, pitch references, sustained tones, and minimalist electronic layers that can be tightly integrated with notational timing and interaction.

For more complex electroacoustic composition and improvisation setups, OSC remains the primary and recommended approach, allowing Oscilla to interface with dedicated audio environments such as SuperCollider, Max, or Pure Data. The native synth instead occupies a complementary role: enabling self-contained electronics, quick prototyping, and works where a restrained, browser-native electroacoustic aesthetic is desirable.</figcaption>
</figure>


## Oscilla Dynamic Signal Control and Modulation
<figure class="doc-image">
  <img
    src="{{ '/img/oscilla-dynamic-signal-flow.png' | url }}"
    alt="Oscilla Dynamic Signal Control"
  >
  <figcaption>Published signals are shared across the system, so animations can control audio parameters, slider-like interfaces can control animations, and multiple cues can influence each other in any combination. Because values are updated continuously, this also allows feedback systems where motion, sound, and interaction form coupled, dynamic behaviours within the score.
<code>
synth(uid:pad, freq:"fadeSineFreq.t[90,2000]", env:{a:4})
o2p(path:fadeSineFreq, trig:touch, osc:1, uid:fadeSineFreq, oscAddr:fadeSineFreq)
</code>

https://robcanning.github.io/oscilla/docs/control-and-modulation/
</figcaption>
</figure>

## Oscilla "Smart Cue" Inkscape Extension
<figure class="doc-image">
  <img
    src="{{ '/img/oscilla-inkscape-plugin.png' | url }}"
    alt="Oscilla Preferences"
  >
  <figcaption>Oscilla "Smart Cue" Inkscape Extension</figcaption>
</figure>


## Oscilla Server Running in Terminal 
<figure class="doc-image">
  <img
    src="{{ '/img/oscilla-server-terminal.png' | url }}"
    alt="Oscilla Preferences"
  >
  <figcaption>Oscilla Server Running in Terminal (via npm / node)</figcaption>
</figure>

