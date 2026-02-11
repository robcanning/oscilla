---
title: timers
layout: docs_layout.njk
---

# Timers

## Overview

Oscilla's Timer system provides flexible time-tracking tools for performers, conductors, and ensembles. At its core is the **Auxwatch** — an auxiliary timer that can function as a simple stopwatch, countdown timer, or sequenced section timer for structuring musical time.

The Timer system is designed for:
- **Solo performers** tracking practice or performance duration
- **Ensembles** synchronizing timed sections across multiple devices
- **Improvisers** using time-based structures without traditional notation
- **Conductors** managing sectional rehearsals or timed cues
- **Session-layer workflows** where timer slots trigger navigation to markers, creating automated performance structures

---

## Accessing the Timer

Click the **stopwatch display** in the top bar to open the fullscreen Timer view.

### Fullscreen Timer Display

The fullscreen view shows three columns at the bottom:

| Element | Description |
|---------|-------------|
| **Mini Timer** | Swappable display (Performance Time or Timer) |
| **Clock** | Current time of day |
| **Countdown Controls** | Play button and sequence selector with red ring indicator |

The large central display shows elapsed time or active countdown.

### View Modes

Click the **◐ button** (top left) to cycle through display modes:

1. **Solid** — Dark background, light text. Clean, high-contrast display.
2. **Blur** — Score visible but blurred behind timer. Maintains context.
3. **Transparent** — Timer overlays score directly. Ideal for minimal cue scores.

Press **Escape** or click **✕** to exit fullscreen.

---

## Countdown Controls

The rightmost column in the fullscreen view contains the countdown controls:

| Element | Description |
|---------|-------------|
| **▶ / ⏹** | Play/Stop button for the selected sequence or cue |
| **Selection text** | Shows currently selected sequence or cue name (click to change) |
| **Red ring** | Click to open the Countdown Sequences editor |

### Quick Playback

1. Click the **selection text** to open the dropdown
2. Choose a sequence or individual cue
3. Click **▶** to start

The selection remembers your last choice between sessions.

### Playlist Behavior

The countdown controls work like a playlist:
- After a countdown completes, the selection automatically advances to the next item
- When reaching the end of the list, it wraps back to the beginning
- This makes it easy to step through multiple sequences or cues manually

---

## Swapping Timers

Click the **Mini Timer** box (left column) to swap positions:
- Performance Time and Timer swap between main and mini display
- Choose which time reference dominates the display

---

## Countdown Sequences

Click the **red ring** to open the Countdown Sequences editor.

### Creating Sequences

A **sequence** is a named group of timed sections that play consecutively. Each section can optionally trigger an action when it finishes.

**Example — Sonata Form:**
```
Sequence: "Sonata"
├── Exposition      120s  onComplete: nav(scroll@development)
├── Development     180s  onComplete: nav(scroll@recap)
└── Recapitulation   90s
```

### Editor Controls

| Control | Function |
|---------|----------|
| **+ Add Sequence** | Create a new sequence group |
| **Sequence Name** | Text field to name the sequence |
| **▶ (on sequence)** | Play entire sequence from start |
| **🗑** | Delete sequence |
| **Loop** | Number of times to repeat (0 = infinite) |
| **Then** | Chain to another sequence when complete |
| **+ Add Cue** | Add a timed section to sequence |
| **Cue Name** | Name displayed during countdown |
| **Duration (s)** | Length in seconds |
| **onComplete** | Cue expression to trigger when this slot finishes (e.g. `nav(scroll@B)`) |
| **▶ (on cue)** | Play single cue only |
| **✕** | Delete cue |

### Looping

The **Loop** control determines how many times a sequence repeats:

| Value | Behavior |
|-------|----------|
| **1** | Play once (default) |
| **2, 3, ...** | Repeat that many times |
| **0** | Loop infinitely until manually stopped |

Example: A 3-cue sequence with Loop = 2 plays:
```
Cue 1 → Cue 2 → Cue 3 → Cue 1 → Cue 2 → Cue 3 → stop
```

### Chaining (Sequence of Sequences)

The **Then** dropdown lets you chain sequences together:

```
"Warm-up" (Loop: 1, Then: "Main Set")
    → plays once, then automatically starts "Main Set"

"Main Set" (Loop: 3, Then: "Cool-down")  
    → plays 3 times, then starts "Cool-down"

"Cool-down" (Loop: 1, Then: — stop —)
    → plays once, then stops
```

This creates a **playlist** of sequences without manual intervention.

### Per-Cue Completion Actions (onComplete)

Each cue slot has an optional **onComplete** field — a cue expression that fires when that slot's countdown reaches zero. This connects the timer system to Oscilla's navigation and UI systems.

| onComplete expression | What happens |
|----------------------|--------------|
| `nav(scroll@B)` | Jump to rehearsal mark or marker "B", auto-resume playback |
| `nav(mark@bridge)` | Jump to user marker "bridge" (skips rehearsal marks) |
| `nav(markPaused@ending)` | Jump to marker "ending", stay paused |
| `ui(#brass, visible:true)` | Show a visual layer |
| `page(C)` | Switch to page C |
| `audio(src:gong.wav)` | Play a sound |

Any valid Oscilla cue expression works in the onComplete field. The action fires on **all connected clients** simultaneously (since the server owns the timer).

**Example — timed sections with automatic navigation:**
```
Sequence: "Performance"
├── Intro        120s  onComplete: nav(scroll@development)
├── Development  180s  onComplete: nav(scroll@climax)
└── Climax        90s  onComplete: nav(scroll@ending)
```

When each section's countdown finishes, the playhead automatically jumps to the next marker. The score scrolls itself through the performance structure.

onComplete actions also work with single cues (not just sequences). If you start a standalone countdown that has an onComplete expression, it fires when that countdown reaches zero.

### Playback Behavior

When a countdown runs:
- Main display shows **section name** as label
- Time counts down in **MM:SS** format
- Sequences auto-advance to next section
- **onComplete** action (if set) fires when each section finishes
- Single cues return to normal timer when complete
- Play button changes to **⏹** (stop)

---

## Network Synchronization

The Timer system automatically synchronizes across all connected clients.

### How It Works

- When any client starts a countdown, **all clients** see the same countdown
- Sequences are shared automatically when clients connect
- Time is synchronized using server timestamps — all displays show the same remaining time

### What Syncs

| Event | Behavior |
|-------|----------|
| **Client connects** | Receives current sequences from server |
| **Sequence created/edited** | Changes broadcast to all clients (including onComplete fields) |
| **Countdown started** | All clients show synchronized countdown |
| **Cue slot completes** | Server broadcasts onComplete action; all clients execute it simultaneously |
| **Countdown stopped** | All clients return to normal display |

### Server-Owned Timer

The countdown timer is **server-owned**, meaning:
- The server maintains the authoritative timer state
- Clients send commands (start/stop) to the server
- Server broadcasts state to all clients
- Late-joining clients receive current countdown state immediately

This ensures all performers see exactly the same time, regardless of when they connected.

---

## Import & Export

Sequences can be saved and loaded as JSON files.

### Export

Click **Export** to download `countdown-sequences.json` containing all sequences.

**Example JSON:**
```json
[
  {
    "name": "Warm-up",
    "loop": 1,
    "chain": 1,
    "cues": [
      { "name": "Stretch", "seconds": 120, "onComplete": null }
    ]
  },
  {
    "name": "Sonata",
    "loop": 1,
    "chain": null,
    "cues": [
      { "name": "Exposition", "seconds": 120, "onComplete": "nav(scroll@development)" },
      { "name": "Development", "seconds": 180, "onComplete": "nav(scroll@recap)" },
      { "name": "Recapitulation", "seconds": 90, "onComplete": null }
    ]
  }
]
```

### Import

Click **Import** and select a JSON file to load sequences.

**Note:** Import merges with existing sequences by ID. Sequences are automatically shared to other connected clients after import.

---

## Use Cases

### 1. Structured Improvisation

Create a sequence of timed sections:
```
"Free Improv Structure"
├── Sparse Texture     60s
├── Build              90s
├── Peak               45s
└── Decay             120s
```

All performers see the same countdown, enabling synchronized structural changes without traditional cues.

### 2. Session Layer — Markers + Timers

Use markers and timer onComplete actions to build a complete performance structure without editing SVG:

1. Load any image as a score
2. Drop and name markers at key positions: "intro", "development", "climax", "ending"
3. Create a countdown sequence with onComplete actions:

```
"Performance"
├── Intro          120s  onComplete: nav(scroll@development)
├── Development    180s  onComplete: ui(#overlay, visible:true)
├── Climax          90s  onComplete: nav(scroll@ending)
└── Ending          60s
```

The playhead jumps between markers automatically as each section finishes. Layers can appear/disappear at section boundaries. No SVG cue authoring needed.

### 3. Rehearsal Sectionals

Time individual sections during rehearsal:
```
"Rehearsal Plan"
├── Warm-up            300s
├── Exposition work    600s
├── Break              300s
└── Development work   600s
```

### 4. Performance Timing

For pieces with strict durational requirements:
```
"Competition Piece"
├── Movement I    480s
├── Pause          30s
└── Movement II   360s
```

### 5. Minimal Cue Scores

Use **Transparent mode** with countdown sequences as a time-based score:
- Score contains only markers
- Timer overlays showing current section
- onComplete actions handle navigation between sections
- Performers follow time structure, not traditional notation

---

## Technical Notes

### Storage

- Sequences stored in `localStorage` as `oscilla.countdownSequences`
- Each cue object contains `name`, `seconds`, and optional `onComplete` (cue expression string or null)
- Selected sequence/cue stored as `oscilla.countdownControls.type` and `.index`
- Persists between sessions

### Timer Precision

- Display updates every 250ms (synced with server broadcast)
- Network sync uses `Date.now()` timestamps
- Typical sync accuracy: ±50-200ms depending on network

### Performance Time vs Timer

| Timer | Behavior |
|-------|----------|
| **Performance Time** | Linked to transport. Pauses on manual stop, continues during musical pauses (cue-triggered). |
| **Timer (Auxwatch)** | Independent stopwatch. Can be used for countdowns. Swappable with Performance Time. |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Escape** | Exit fullscreen timer |
| **Click stopwatch** | Enter fullscreen |
| **Click mini timer** | Swap timer positions |
| **Click red ring** | Open countdown editor |
| **Click selection text** | Open sequence/cue dropdown |

---

## Summary

The Timer system transforms Oscilla into a flexible time-structuring tool:

- **Simple**: Click stopwatch → fullscreen timer
- **Quick access**: Play button and dropdown right in the fullscreen view
- **Sequenced**: Create named countdown sections with looping and chaining
- **Actionable**: Per-cue onComplete fields trigger navigation, UI changes, or any cue expression
- **Synchronized**: All clients automatically stay aligned
- **Portable**: Import/export sequences as JSON

Combined with markers, the Timer system enables a **session layer** approach — building complete performance structures from the interaction layer without editing score files. Whether for strict durational works, timed improvisations, or rehearsal management, the Timer provides a unified interface for musical time.
