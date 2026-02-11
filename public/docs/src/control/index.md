---
title: Control and Interaction
layout: docs_layout.njk
---

# Control and Interaction

The control layer allows performers to influence score behaviour in real time. While cues define what happens when the playhead crosses an element, the control system determines how those behaviours can be shaped during performance through live input.

At the centre of this system is a source-agnostic parameter bus. Control signals can originate from the controlXY touchpad interface, from external OSC sources, or from other cues within the score. These signals are routed to cue parameters through a binding system that allows any control source to modulate any parameter -- animation speed, colour, audio volume, OSC output values -- without the cue needing to know where the signal comes from.

This architecture supports a range of performance practices, from a single performer adjusting their own score to a conductor modulating parameters across the entire ensemble via a networked control surface.
