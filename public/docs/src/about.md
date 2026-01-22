---

title: What Can You Do With Oscilla?
layout: docs_layout.njk
-----------------------

## At a Glance

**Oscilla is a framework for creating, performing, and sharing animated, cue‑driven graphic scores in the web browser.**

It sits between **notation**, **performance**, and **live electronic control**, allowing composers to design scores that move, react, and synchronize across performers’ devices — while remaining readable, editable, and shareable.

If you can draw it in SVG, Oscilla can turn it into a time‑based, interactive score.

---

## What Problems Does Oscilla Solve?

Many contemporary scores:

* rely on **static PDFs** that cannot express temporal or interactive processes
* require **custom software** or fragile patches to realise
* separate **notation**, **rehearsal coordination**, and **electronic control** into different tools

Oscilla addresses this by providing:

* **notation‑centric** workflow (the score is the interface)
* **browser‑based performance** (no installation for performers)
* **explicit time, cue, and process control** embedded directly in the score

---

## What Can You Actually Do With It?

### 1. Create Animated Graphic Scores

* Draw notation in Inkscape (or any SVG editor)
* Attach behaviours to graphical elements using simple, readable IDs
* Animate rotation, scaling, traversal, and visibility over time

The score becomes **dynamic**, without becoming opaque or procedural.

---

### 2. Coordinate Ensemble Performance

* Synchronise scores across multiple devices via a local server
* Use shared playheads, rehearsal marks, and cues
* Support fixed form, open form, or hybrid structures

Each performer sees the same temporal structure, while still interpreting locally.

---

### 3. Work With Composed Improvisation

Oscilla is particularly suited to:

* controlled improvisation
* modular or sectional forms
* scores that evolve differently on each run

Cues can:

* branch
* repeat
* pause
* trigger other events

This allows the score to **guide behaviour** rather than prescribe outcomes.

---

### 4. Control Electronics (Without Becoming a DAW)

Oscilla allows graphical elements in the score to function directly as **control structures** for electronics.

In practice this means:

* paths, shapes, and points drawn in Inkscape can be interpreted as **trajectories**, **timelines**, or **control curves**
* these structures can drive time, density, position, or other parameters
* the same graphical material serves both as **notation** and **control logic**

This creates a direct visual link between what performers see and how electronics behave.

Oscilla’s built-in audio system is intentionally simple:

* basic sample playback
* simple synthesis
* time-aligned audio cues placed directly in the score

This makes it possible to realise works for **instruments and fixed media (“tape”) entirely in the browser**, without external software or complex setup.

Where more advanced processing is required, Oscilla can:

* send OSC messages to SuperCollider, Pure Data, Max, lighting systems, or custom software
* act as a **notational and organisational layer** for complex electronic setups

Oscilla is not a replacement for audio environments — it is the **score that coordinates them**.

---

### 5. Support Rehearsal and Collaboration

* Performers can add private or shared annotations
* Scores can be shared via URL
* No special software is required beyond a modern browser

This lowers barriers in rehearsal contexts and supports distributed ensembles.

---

## Where Does Oscilla Sit in the Bigger Picture?

Oscilla belongs to a lineage of systems exploring the space between:

* graphic notation
* live electronics
* networked performance

What distinguishes Oscilla is that:

* the **score itself** is the primary interface
* everything runs using **open web technologies**
* composers work visually, not programmatically

Rather than inventing a new notation language, Oscilla **extends existing graphic practices into time, motion, and interaction**.

---

## Who Is Oscilla For?

Oscilla is designed for:

* composers working with graphic or hybrid notation
* performers comfortable with non‑traditional scores
* ensembles using electronics, live processing, or networked coordination
* researchers and educators exploring new score–performance relationships

It is not aimed at replacing traditional notation tools, but at **augmenting what scores can do**.

