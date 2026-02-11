---
title: Contribution Surface
layout: docs_layout.njk
---

# Contribution Surface

## Overview

The **Contribution Surface** is a browser‑native layer that coexists with the SVG score in Oscilla. It allows participants to add, modify, and execute material directly within the running score during rehearsal, performance, or installation.

Where the **SVG Score Layer** defines composed, declarative structures authored offline (e.g. in Inkscape), the Contribution Surface supports **live, mutable, and spatially situated contributions** authored in the browser. These contributions may be textual, sonic, silent, temporal, or spatial, and can be shared across the network.

The Contribution Surface is not secondary or decorative. It is a fully executable plane that can function as:

- a rehearsal note system
- a performer or collaborator interface
- a portal for uploading and organising sound material
- a spatial trigger surface tied to the playhead
- a complete score in its own right

No SVG score is required to use the Contribution Surface.

---

## Two Coexisting Layers

| SVG Score Layer | Contribution Surface |
|-----------------|----------------------|
| Authored offline | Authored live in browser |
| Fixed, declarative | Mutable, negotiable |
| Embedded in SVG | HTML overlay |
| Cue‑driven | Click‑ and playhead‑driven |
| No file management | Direct audio upload |
| Composer‑centred | Role‑agnostic |

Both layers may be used together or independently.

---

## Basic Usage

### Adding a Contribution

1. Enable **pen mode** (✏️ icon or double‑tap the score area)
2. Click on the score or page overlay
3. Configure the contribution (text and/or executable behaviour)
4. Save

### Editing

- Pen mode **must be enabled** to edit
- Click an existing contribution to reopen the editor

### Moving

Contributions are draggable **in all modes**:

- Mouse or touch drag
- Position is saved on release

---

## Contribution Types

### Text Contributions

Text contributions act as visible instructions, reminders, section labels, or compositional cues.

Typical uses:
- rehearsal notes
- textual scores
- structural markers
- performer coordination

Font size and content are editable live.

---

### Audio Contributions (Executable)

Any contribution can be made **executable**, turning it into a clickable or playhead‑triggered sound event.

Supported audio types:

#### 🔊 Audio (Single File)
Plays a single audio file.

Parameters include:
- gain
- pan
- pitch
- loop count or infinite loop
- fade‑in / fade‑out
- optional toggle (start/stop)

Use cases:
- one‑shot samples
- looping drones
- pitched variations

---

#### 🎲 Audio Pool (Directory)
Plays files from a directory.

Selection modes:
- **shuffle** (no immediate repeats)
- **sequential**
- **random**

Use cases:
- drum kits
- texture clouds
- aleatoric material

---

#### ⚡ Audio Impulse (Continuous)

Starts a continuous, generative playback process using a directory of samples.

Parameters:
- rate (events per minute)
- jitter (timing randomness)
- polyphony
- gain, pan, pitch

Visual state:
- cyan border: inactive
- green border: running

Use cases:
- granular textures
- stochastic rhythms
- ambient layers

---

## Audio‑Only Contributions

A contribution may be configured as **audio‑only**, with no visible text.

Characteristics:
- text field hidden
- compact visual identity (label + border)
- designed as control surfaces rather than instructions

Typical uses:
- drum pads
- layer toggles
- installation interfaces
- spatial trigger grids

Audio‑only contributions behave identically to text‑based ones in terms of execution, playhead triggering, and sharing.

---

## Spatial Trigger Regions (Extent Lines)

Every executable contribution defines a **horizontal trigger region** using visible extent lines.

Properties:
- extent lines are **always visible in all modes**
- draggable start/end handles
- define the contribution’s active x‑range

Extent regions are used by:
- playhead triggering
- impulse gate lifespans
- region‑based execution logic

Conceptually, a contribution occupies **space**, not just a point.

---

## Playhead Triggering

Executable contributions may be triggered automatically by the playhead.

- Supported by **all audio types**
- Trigger fires when the playhead enters the extent region

### Impulse Lifespan Modes

Audio Impulse contributions support three lifespan behaviours:

- **Toggle** — manual start/stop
- **Fixed** — stops after a specified duration
- **Gate** — active only while the playhead overlaps the region

Gate mode directly couples sound to spatial position in the score.

---

## Audio File Management

### Browsing

The audio browser allows navigation of the project’s audio directory:

- enter subdirectories
- select files or directories
- select the current directory as a pool source

Paths are always relative to the project’s `audio/` directory.

---

### Uploading as Contribution

Audio upload is treated as a **contribution mechanism**, not a utility.

- Files upload to the directory specified in the Source field
- If the Source is empty, files upload to the audio root
- Subdirectories are created implicitly

#### Conflict Handling

If a file already exists:
- Cancel
- Rename
- Overwrite

Uploading sound material is part of the compositional process and can occur during rehearsal or performance.

---

## Sharing and Networking

Contributions may be local or shared.

| Scope | Visibility |
|------|------------|
| Local | Current client only |
| Shared | All connected clients |

When shared:
- creation, edits, movement, and deletion sync via WebSocket
- executable behaviour is consistent across clients

> Audio files themselves must currently exist on all clients. File sharing and bundling are planned.

---

## Example Workflows

### Text‑Only Score

A score composed entirely of text contributions:
- sections laid out left‑to‑right
- shared across all clients
- coordinated via stopwatch

No SVG notation required.

---

### Live Sample Interface

A grid of audio‑only contributions:
- kick / snare / hat pools
- impulse textures
- shared control surface

Acts as a distributed instrument.

---

### Performer‑Contributed Material

During rehearsal:
- participants upload sounds
- assign them to contributions
- define spatial trigger regions

The score grows through contribution.

---

## Roadmap

Planned extensions to the Contribution Surface:

- networked audio file sharing and bundling
- permissions and locking
- contribution presets and templates
- contribution import/export
- OSC and MIDI trigger contributions

---

## Summary

The Contribution Surface reframes the score as a **live, executable surface** rather than a fixed document.

It supports contribution, negotiation, and execution in the same space, allowing Oscilla scores to function as:

- notations
- instruments
- interfaces
- collaborative environments

The surface is where sound, structure, and participation meet.

