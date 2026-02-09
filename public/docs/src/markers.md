---
title: Markers
layout: docs_layout.njk
---

# Markers

Markers are visual waypoints that performers and composers can drop onto the score during playback, rehearsal, or pre-performance planning. Unlike rehearsal marks (which are authored into the score itself), markers are created in the moment by anyone in the ensemble—a lightweight way to sketch structure onto a timeline without interrupting the flow.

## No SVG authoring required

Markers are part of Oscilla's **interaction layer** — features that work on top of any score without requiring you to edit SVG files or learn cue syntax. You can:

- Load any image or simple graphic as a score
- Drop markers to create structure
- Use the timer system for durational cues
- Annotate with pins and text

This makes markers an accessible entry point for ensembles who want networked coordination and shared visual structure without diving into Oscilla's more advanced SVG-based cue system. The score becomes a backdrop; markers become the notation.

For groups working with graphic scores, text scores, or fully improvised sets, this approach lets you use Oscilla as a **shared timeline and coordination tool** rather than a notation rendering engine.

## What markers are for

Markers serve as **compositional scaffolding** for loosely-defined works. In graphic notation, open scores, and improvised music, the timeline is often a container rather than a prescription. Markers let you populate that container with signposts:

- **Structural landmarks** — "climax here", "transition begins", "return to opening texture"
- **Solo assignments** — designate who plays when across a 20-minute set
- **Moments to revisit** — flag a passage during a run-through without stopping
- **Cues for coordination** — visible anchors that all performers can see and anticipate

Think of markers as sticky notes on a shared timeline. They're fast to place, easy to move, and visible to everyone (or just yourself, if you prefer).

## Pre-performance planning

Before a performance, markers can sketch out a flexible roadmap:

1. **Set duration** — You have a 20-minute set. The score provides material but not strict form.
2. **Drop structural markers** — Place markers for major sections: intro, development, climax, wind-down, ending.
3. **Assign solos** — Each performer drops markers in their own color indicating where they'll take the lead.
4. **Mark transitions** — Add markers where the ensemble should shift texture, density, or energy.
5. **Size for visibility** — Drag important markers to the center of the score and increase their font size so they're visible from across the stage.

This creates a shared map that's visible on every connected client. During performance, the playhead moves through the score and performers see their markers approaching—gentle reminders rather than rigid cues.

## During rehearsal

Markers shine as a **non-interruptive annotation tool**:

- Spot something interesting or problematic? Drop a marker without stopping.
- After the run-through, click any marker to jump back and discuss.
- The marker label (editable) can hold a quick note: "bass too loud", "nice texture", "try again".

This keeps rehearsals flowing. Instead of "stop, let's go back to... where was it?", you have a trail of breadcrumbs to follow.

## Shared and local markers

By default, markers are **shared** — they appear on all connected clients' scores in real-time. This supports collaborative planning and ensemble-wide visibility.

Toggle the network icon in the marker tools to switch to **local** mode. Local markers are private to your screen, useful for personal notes you don't need to broadcast.

Individual markers can also be toggled between shared and local in the marker editor (click any marker label to open it).

## Colors

Each connected client is assigned a unique color, visible in the client list in the top bar. When you drop a marker, it inherits your client color by default—making it easy to see at a glance who marked what.

Colors can be changed per-marker in the editor. Use them however makes sense for your ensemble:

- Per-performer (each player has their color)
- Per-function (red = problem, green = landmark, blue = solo)
- Per-section (color-code movements or scenes)

The system doesn't impose meaning on colors—they're a visual vocabulary for you to define.

## Marker controls

The marker tools appear in the top bar:

| Button | Function |
|--------|----------|
| ↓ (arrow) | **Drop marker** at current playhead position |
| M (marker icon) | **Toggle visibility** of all markers on/off |
| 📡 (network icon) | **Toggle sharing** — when active (blue), new markers sync to all clients |

### Dragging markers

Markers can be **dragged in two dimensions**:

- **Horizontal drag** — moves the marker along the timeline
- **Vertical drag** — slides the label up or down along the marker line

This lets you position a label anywhere on the score — at the top for unobtrusive markers, or in the center of the page for prominent waypoints visible from across the room.

### Editing markers

Click any marker label to open the **marker editor**:

- **Label** — edit the text
- **Show vertical line** — toggle the full-height line on/off
- **Share with all clients** — switch between shared and local
- **Size** — adjust font size (10–32px) for prominence
- **Color** — pick from presets or choose a custom color
- **Delete** — remove the marker

Large font sizes combined with central vertical positioning create bold structural landmarks that performers can see at a glance during performance.

## Relationship to other timing tools

Markers work alongside Oscilla's other timing features:

- **Rehearsal marks** — Navigation points defined in the SVG score using Oscilla's cue syntax. These require authoring `cue_rehearsal(...)` IDs in your SVG file. Markers offer similar landmark functionality without any SVG editing — they live in the interaction layer, not the score file.

- **Countdown timer sequences** — For non-timeline-based structures, the timer system can trigger sequences of countdowns (e.g., "5 minutes → 3 minutes → 2 minutes → done"). This offers another way to create loose temporal scaffolding without relying on the scrolling playhead. Markers and timer sequences can complement each other: markers for spatial/visual structure, timers for purely durational structure. Like markers, timers work without SVG authoring.

## Typical workflow

**Before rehearsal:**
1. Load the score
2. Set the duration/tempo
3. Drop markers to outline the set structure
4. Assign colors or labels as needed

**During rehearsal:**
1. Start playback
2. Drop markers on-the-fly when something notable happens
3. Don't stop — keep playing

**After the run-through:**
1. Click markers to jump back to flagged moments
2. Discuss, adjust, make notes
3. Delete or reposition markers as the interpretation evolves

**Before performance:**
1. Clear rehearsal markers (or hide them)
2. Keep only the structural landmarks you want visible
3. Perform with a shared map that guides without dictating

---

Markers are intentionally simple. They're not cues that trigger events or automation—they're just visible points on a shared timeline. That simplicity is the point: a low-friction way to give shape to music that resists rigid notation.
