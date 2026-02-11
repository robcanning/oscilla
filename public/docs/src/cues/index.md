---
title: Cues
layout: docs_layout.njk
---

# Cues

Cues are the core mechanism through which an Oscilla score becomes executable. A cue is a short instruction embedded in the ID attribute of an SVG element. The most common trigger is the scrolling playhead -- when it crosses an element, the cue fires. But cues can also be triggered by interactive buttons embedded in the score, by timer sequences on completion of each unit, or typed directly into the live console during performance.

The cue syntax is designed to be readable and compact -- a minimal, accessible form of text-based authoring rather than traditional programming. A single element can carry multiple cues, and cues can reference other elements, enabling navigation, conditional branching, and structural control within the score. Cues are typed into Inkscape's Object Properties dialog, or built using the Oscilla Inkscape extension which provides a graphical interface for assembling cue expressions.

This section documents each cue type with its syntax, parameters, and usage examples.
