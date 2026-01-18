# User Annotations (Draft Specification)

> **Status:** Draft / work in progress — subject to change  
> **Scope:** Performer-facing annotations in Oscilla  
> **Audience:** Performers, composers, workshop participants, developers

---

## 1. Overview

User annotations in Oscilla provide a **performer-facing layer for reflection, listening, and interpretation** that exists alongside the executable score but **does not alter the score itself**.

Annotations are designed for **general score-based performance contexts**, including situations where musical activity continues between explicit cues, across silent regions, or through sustained instructions that are not tied to discrete notational objects.

Crucially:

- Annotations **do not live in the SVG score**
- Annotations **do not affect playback, cues, or execution**
- Annotations are **optional, toggleable, and non-authoritative**

They are intended as a rehearsal and interpretation aid, not a compositional mechanism.

---

## 2. Design Intent

The annotation system is guided by the following principles:

1. **Performer-centred**  
   Annotations capture performer observations, reminders, and interpretive notes that arise during rehearsal or performance.

2. **Non-invasive**  
   The score remains unchanged. Annotations are rendered in a browser overlay layer and can be hidden at any time.

3. **Performer-owned**  
   Annotations belong to performers, not the score author. Multiple performers may annotate the same score differently.

4. **Space-aware**  
   Empty space, sustained activity, and implicit instruction are considered meaningful and annotatable.

5. **Incremental and provisional**  
   The system is intentionally minimal and expected to evolve through use.

---

## 3. Basic Usage

### 3.1 Entering Annotation Mode

When annotation mode is enabled (via a pen icon in the toolbar):

- The cursor changes to indicate annotation mode
- Clicking on the score creates a new annotation anchor
- A small text editor appears near the click location

Annotation mode can be exited at any time.

### 3.2 Creating an Annotation

To create an annotation:

1. Enable annotation mode
2. Click anywhere on the score (including empty space)
3. Enter a short text note
4. Choose whether the annotation is:
   - **Local** (stored only in this browser)
   - **Shared** (broadcast to other connected clients)
5. Save the annotation

A small pin and text preview will appear at the annotated location.

### 3.3 Viewing and Editing

- Annotations can be globally shown or hidden
- Clicking an annotation opens it for editing
- Annotations can be updated or removed by their author

---

## 4. Anchoring Model

Annotations are **anchored**, not embedded. Each annotation records *how* it relates to the score rather than modifying the score itself.

### 4.1 Anchor Types

Annotations may use one or more of the following contextual anchors:

- **Element anchor**  
  Links the annotation to a specific SVG element or cue ID

- **Position anchor**  
  Anchors the annotation to a position in score space, even if no object exists there

- **Time anchor**  
  Records the current performance time using the Oscilla stopwatch

There is no hierarchy between these anchor types. The system treats empty space and implicit instruction as meaningful.

### 4.2 Scroll Mode

In scroll mode:

- Position anchors are stored relative to the score container
- Annotations may record the current playhead position
- Stopwatch time is captured for contextual reference

This supports annotations such as:

> “Continue texture here until next cue”

—even when no visible object is present.

### 4.3 Page Mode

In page mode:

- Annotations are scoped to the currently active page
- Positions are stored relative to the page overlay
- Stopwatch time remains the authoritative time reference

Page-relative annotations allow performers to mark reminders, strategies, or transitions that occur within a page, regardless of how long the page is viewed.

---

## 5. Time Semantics

Oscilla maintains a single authoritative notion of performance time via its **stopwatch**.

Annotations do not introduce a new clock. Instead, they:

- Record the stopwatch time at creation
- May later support page-relative time (time since page entry)

This aligns annotation timing with experienced performance time, not notated duration.

---

## 6. Persistence and Sharing

### 6.1 Local Annotations

Local annotations:

- Are stored in the browser (per project)
- Persist across reloads on the same device
- Are visible only to the local performer

This mode is suitable for private rehearsal notes and personal performance strategies.

### 6.2 Shared Annotations

Shared annotations:

- Are transmitted via the Oscilla server
- Appear for other connected clients
- Are read-only for non-authors

Shared annotations support ensemble rehearsal and coordination but remain optional and non-binding.

Server-side persistence is currently session-based and may change in future versions.

---

## 7. Rendering and Visibility

Annotations are rendered as **HTML overlay elements**, not SVG objects.

- They do not interfere with score interaction
- They can be globally toggled on/off
- They appear only when their relevant context (scroll/page) is active

This ensures annotations remain a lightweight, performer-facing layer.

---

## 8. Relationship to the Score

Annotations:

- Do **not** trigger cues
- Do **not** alter navigation
- Do **not** affect timing or playback

They exist alongside the score as interpretive traces rather than executable instructions.

---

## 9. Future Directions (Non-binding)

Possible future extensions include:

- Page-relative time highlights
- Temporary workshop-only shared annotations
- Annotation export/import
- Simple drawing or gesture annotations
- Rehearsal vs performance visibility modes

These are exploratory and not part of the current specification.

---

## 10. Status

This document describes a **provisional design** intended to support performer reflection across a wide range of score-based practices.

The annotation system is expected to evolve through real-world use, workshops, and critical feedback.

**Nothing in this specification should be considered stable or final.**

