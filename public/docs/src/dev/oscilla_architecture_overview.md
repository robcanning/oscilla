---
title: Architecture_Overview
layout: docs_layout.njk
---


# Oscilla — Architecture Overview

This document provides a concise, system-level overview of Oscilla’s architecture: major modules, entry points, and runtime data flows. It is intended as a developer-facing map to support onboarding, maintenance, and refactoring.

---

## Purpose

Oscilla is a **browser-based, cue-driven graphic notation platform** built around SVG, WebSockets, and OSC.

- Scores are authored as SVG documents.
- Behaviour is encoded via ID-based cues and mini-DSL syntax.
- The client executes animations, triggers audio, and emits network and OSC events.

The system is designed to support **composed notation**, **live execution**, and **networked contribution** within a single runtime.

---

## High-Level Entry Points

### Server

**`server.js` (repo root)**

- Express server for serving `/public`
- WebSocket endpoint for client sync
- OSC bridge to external audio / media engines
- Project import/export (`.oscilla`)
- Development and standalone binary lifecycle

---

### Client

**`public/index.html`**

- Main frontend entry point
- Loads UI shell and client JavaScript
- Boots the Oscilla runtime

**`public/scores/<project>/score.svg`**

- Per-project authored score
- Contains SVG graphics, cue IDs, reusable blocks
- Primary data source for runtime behaviour

---

## Frontend Architecture (`public/js/`)

### `app.js` — Client Bootstrap / Orchestration

**Role**: High-level runtime composition and startup sequence.

Responsibilities:
- Imports and wires together all major subsystems
- Establishes global runtime bindings on `window`
- Orchestrates project loading, score setup, and initialization order
- Detects platform (desktop/mobile) and applies conditional UI logic

Key integrations:
- Transport and playhead (`oscillaTransport.js`)
- Cue dispatch (`oscillaCueDispatcher.js`)
- Animation registry (`oscillaAnimation.js`)
- Contribution Surface (`oscillaAnnotations.js`)
- Audio handling (`oscillaAudio.js`)
- Reuse/template system (`reuse.js`)
- UI wiring (menus, preferences, buttons)

`app.js` intentionally contains minimal feature logic; it composes modules rather than implementing behaviour.

---

### Animation & Cue Execution

#### `oscillaAnimation.js`

**Role**: Cue parsing, animation assignment, and lifecycle management.

Responsibilities:
- Scan SVG DOM for cue-related IDs
- Parse mini-DSL expressions
- Register animations via `registerAnimation`
- Track running animations
- Delegate to specific handlers (scale, rotate, path-follow, text)

Key exports:
- `registerAnimation`
- `registerRunningAnimation`
- `clearRunningAnimation`
- `animationAssign`
- `debugDump`

Touchpoints:
- Invoked during SVG initialization
- Called by cue dispatcher on playback events

---

#### `oscillaCueDispatcher.js`

**Role**: Scheduling and dispatch of cue events.

Responsibilities:
- Schedule cue start times
- Emit cue completion events
- Bridge between playhead timing and execution layers

Key functions:
- `scheduleCueStart`
- `emitCueComplete`

---

### Contribution Surface

#### `oscillaAnnotations.js`

**Role**: Browser-native contribution layer (HTML overlays over SVG).

Responsibilities:
- Create, edit, move, and delete contributions
- Manage Contribution Surface state
- Execute audio triggers (click or playhead)
- Manage spatial extent regions
- Handle audio-only contributions
- Persist contributions (localStorage)
- Optional WebSocket synchronization

Key concepts:
- Contributions as executable, spatial entities
- Trigger pools for directory-based audio
- Integration with audio and timer subsystems

Exposed API:
- `window.oscillaAnnotations`

---

### Audio System

#### `oscillaAudio.js`

**Role**: Audio playback primitives.

Responsibilities:
- Play single-file audio
- Manage directory-based pools
- Run continuous impulse processes
- Stop and manage impulse lifecycles

Primary functions:
- `handleAudioCue`
- `handleAudioPoolCue`
- `handleAudioImpulseCue`
- `stopAudioImpulse`

Used by:
- Contribution Surface
- Cue-triggered media execution

---

### OSC Integration

#### `oscillaOSC.js`

**Role**: OSC message construction and transport.

Responsibilities:
- Construct OSC messages from visual and cue data
- Sample visual geometry (`sampleVisual()`)
- Send OSC messages via server bridge

---

### Timing & Utilities

#### `oscillaTimers.js`

- Stopwatch and timing utilities
- Shared scheduling primitives

#### `oscillaHitLabels.js`

- Visual hit-labels for OSC and interaction feedback
- UI indicators for triggered events

---

### Reuse / Template System

#### `reuse.js`

**Role**: SVG reusable block system.

Responsibilities:
- Register reusable `<g id="reuse(...)">` blocks
- Inject clones for `<g id="use(...)">` placeholders
- Support template-based score construction

Key exports:
- `registerReuseBlocks`
- `preloadReuseBlocksFromPages`
- `autoInjectUseBlocks`
- `handleUse`
- `buildPageRegistryFromDirIndex`

#### `utils.js`

- SVG geometry and transform helpers
- Bounding box and alignment utilities
- ID management for reuse blocks

---

## Runtime Data Flows

### Application Startup

1. `index.html` loads client bundle
2. `app.js` initializes runtime
3. Project assets loaded (SVG, pages, audio)
4. Reuse blocks registered and injected
5. Contribution Surface initialized
6. SVG scanned and animations assigned

---

### Cue Execution Flow

1. Playhead or UI event triggers cue
2. `oscillaCueDispatcher` schedules execution
3. `oscillaAnimation` runs visual behaviour
4. Contribution Surface may execute audio triggers
5. OSC messages emitted if configured

---

### Network & OSC

- WebSocket sync for shared contributions
- Server relays messages between clients
- OSC messages forwarded to external engines

---

## Server & Build System

- `server.js`: Express + WebSocket + OSC bridge
- `build.sh` and scripts: standalone binary packaging
- Version file maintained at repo root

---

## Documentation

- `public/docs/` and `docs/`
- Cue references, cheatsheets, workflows
- Inkscape extension documentation

---

## Immediate Technical Notes

Low-risk cleanup candidates:

- Consolidate duplicated helpers (e.g. `clamp01`) into shared utils
- Audit module-local debug helpers for removal or centralization
- Consider namespacing global APIs under `window.oscilla`
- Ensure Contribution Surface import/export hooks are exposed in UI if retained

---

## Summary

Oscilla’s architecture separates **authored structure** (SVG Score Layer) from **live execution and contribution** (Contribution Surface), coordinated through a cue dispatcher and unified runtime.

This modular design supports composed scores, live interfaces, and distributed performance within a single browser-based system.

