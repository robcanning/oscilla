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
- Navigate between markers with arrow keys and transport buttons
- Use the timer system for durational cues, with automatic jumps to markers on completion
- Annotate with pins and text

This makes markers an accessible entry point for ensembles who want networked coordination and shared visual structure without diving into Oscilla's more advanced SVG-based cue system. The score becomes a backdrop; markers become the notation. Combined with countdown timer sequences and `onComplete` actions, markers can form a complete temporal framework — a **session layer** built entirely from the interaction tools.

For groups working with graphic scores, text scores, or fully improvised sets, this approach lets you use Oscilla as a **shared timeline and coordination tool** rather than a notation rendering engine. Wire markers to timer sequences and you have automated section navigation without writing a single line of SVG.

## What markers are for

Markers serve as **compositional scaffolding** for loosely-defined works. In graphic notation, open scores, and improvised music, the timeline is often a container rather than a prescription. Markers let you populate that container with signposts:

- **Structural landmarks** — "climax here", "transition begins", "return to opening texture"
- **Solo assignments** — designate who plays when across a 20-minute set
- **Moments to revisit** — flag a passage during a run-through without stopping
- **Cues for coordination** — visible anchors that all performers can see and anticipate
- **Navigation targets** — named markers can be jumped to with arrow keys, transport buttons, `nav()` cues, or timer completion actions

Think of markers as sticky notes on a shared timeline. They're fast to place, easy to move, and visible to everyone (or just yourself, if you prefer). Unlike plain sticky notes, though, they're wired into the transport — you can jump between them, and other systems can target them.

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
- After the run-through, use Arrow Up/Down to jump between markers, or click any marker label to jump back and discuss.
- The marker label (editable) can hold a quick note: "bass too loud", "nice texture", "try again".

This keeps rehearsals flowing. Instead of "stop, let's go back to... where was it?", you have a trail of breadcrumbs to follow — and keyboard shortcuts to follow them instantly.

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
| ⏩ / ⏪ (transport) | **Fast forward / rewind** between markers and rehearsal marks |
| Arrow Up / Down | **Keyboard navigation** between markers and rehearsal marks |

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

- **Rehearsal marks** — Navigation points defined in the SVG score using Oscilla's cue syntax. These require authoring `cue_rehearsal(...)` IDs in your SVG file. Markers offer similar landmark functionality without any SVG editing — they live in the interaction layer, not the score file. Since both rehearsal marks and markers share the same navigation system (arrow keys, fast forward/rewind, rehearsal popup), they function interchangeably as structural waypoints — the difference is only in how they're created.

- **Countdown timer sequences** — For non-timeline-based structures, the timer system can trigger sequences of countdowns (e.g., "5 minutes → 3 minutes → 2 minutes → done"). Each timer slot has an optional **onComplete** field that accepts any cue expression. Setting `nav(scroll@intro)` or `nav(mark@bridge)` as a slot's onComplete action causes the playhead to jump to that marker when the countdown finishes. This means you can build an entire performance structure from markers and timers alone — no SVG authoring required.

- **`nav()` cues** — Named markers can be targeted from SVG cue syntax or from timer onComplete fields. See *Navigation targets* below.

## Navigation targets

Named markers (any marker whose label has been edited from the default "m") can be jumped to programmatically using Oscilla's cue syntax:

| Syntax | Behavior |
|--------|----------|
| `nav(scroll@myMarker)` | Jumps to rehearsal mark "myMarker" first; if not found, jumps to the user marker with that name. Playback auto-resumes. |
| `nav(mark@myMarker)` | Jumps directly to the user marker (skips rehearsal marks). Playback auto-resumes. |
| `nav(markPaused@myMarker)` | Jumps to the user marker and stays paused. |
| `nav(scrollPaused@myMarker)` | Jumps to rehearsal mark or marker and stays paused. |

These expressions work anywhere a cue string is accepted:

- **In SVG cue IDs** — embed navigation in the score itself
- **In timer onComplete fields** — jump to a marker when a countdown slot finishes
- **In button triggers** — wire a `button()` cue to jump to a specific marker

When multiple markers share the same name, the leftmost one (by score position) is used. A console warning is logged when duplicates are found.

## Keyboard and transport navigation

Markers integrate into Oscilla's transport navigation alongside rehearsal marks:

| Control | Action |
|---------|--------|
| **Arrow Up** | Jump to the next navigation point (marker or rehearsal mark) after the current playhead position |
| **Arrow Down** | Jump to the previous navigation point before the current playhead position |
| **Fast Forward button** | Same as Arrow Up |
| **Fast Rewind button** | Same as Arrow Down |
| **Rehearsal popup** | Shows all rehearsal marks and named markers; click any to jump |

All navigation points — rehearsal marks and markers — are sorted by their position on the score. Arrow keys and transport buttons walk this unified list based on where the playhead currently is, not on a stored index. This means navigation stays correct regardless of how the playhead got to its current position (manual seeking, cue jumps, timer actions, etc.).

Default unnamed markers ("m") are included in keyboard navigation. All markers with a valid position are navigable.

## The session layer

Markers, timers, and the `nav()` cue together form what could be called a **session layer** — a way to construct temporal structure on top of any score without editing SVG files.

A typical session-layer workflow:

1. **Load any image or graphic as a score** — it doesn't need cue IDs, rehearsal marks, or any Oscilla-specific markup.
2. **Drop and name markers** — create structural waypoints: "intro", "bridge", "climax", "ending".
3. **Build a countdown sequence** — create timer slots matching your planned section durations.
4. **Wire onComplete actions** — set each slot's onComplete to `nav(scroll@nextSection)` so the playhead automatically jumps forward when each timer finishes.
5. **Optionally add `ui()` calls** — use `ui(#layerName, visible:true)` in onComplete fields to show/hide visual layers at section boundaries.

The result is a fully navigable, timed performance structure built entirely from the interaction layer. The score provides visual material; markers and timers provide the temporal framework.

## Typical workflow

**Before rehearsal:**
1. Load the score
2. Set the duration/tempo
3. Drop markers to outline the set structure
4. Assign colors or labels as needed
5. Optionally: build a countdown sequence with onComplete actions targeting your markers

**During rehearsal:**
1. Start playback
2. Drop markers on-the-fly when something notable happens
3. Use Arrow Up/Down to jump between markers without stopping
4. Don't stop — keep playing

**After the run-through:**
1. Click markers (or use arrow keys) to jump back to flagged moments
2. Discuss, adjust, make notes
3. Delete or reposition markers as the interpretation evolves

**Before performance:**
1. Clear rehearsal markers (or hide them)
2. Keep only the structural landmarks you want visible
3. Perform with a shared map that guides without dictating

---

Markers are intentionally simple to create — drop, name, drag, done. But they connect into Oscilla's deeper systems: they're navigable by keyboard and transport controls, targetable by `nav()` cues, and triggerable from timer completion actions. This makes them a bridge between casual annotation and structured performance — start with sticky notes on a timeline, and wire them into a full temporal framework when you're ready.
