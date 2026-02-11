---
title: performer_annotations
layout: docs_layout.njk
---

# Performer Annotations

## Overview

Performer Annotations allow performers to add **personal notes directly onto the score view** while working with Oscilla.

Annotations are intended for:
- reminders
- listening cues
- coordination notes
- interpretive decisions
- rehearsal observations

Annotations **do not change the score** and **do not affect playback or cues**.  
They exist as a separate, optional layer that can be shown or hidden at any time.

> **Note:** Because annotations can be placed freely in time and space, Oscilla can be used in a **minimal, annotation-only mode** (without an SVG score). In this case, annotations function as a very lightweight textual score. This mode is intentionally limited, but can be useful for sketches, instructions, or rehearsal frameworks.

---

## Entering Annotation Mode

1. Click the **pen icon** in the toolbar  
2. The cursor changes to indicate annotation mode  
3. Click anywhere on the score area to add a new annotation

Annotation mode automatically exits after saving a note.

---

## Creating an Annotation

When you click the score area in annotation mode:

1. A text editor appears
2. Enter your note (multi-line text is supported)
3. Choose whether the note is:
   - **Local** — visible only on your device
   - **Shared** — visible to other connected clients
4. Click **Save**

The annotation appears as:
- a small dot (anchor)
- a text label displaying the note

---

## Editing an Annotation

- Click **either the dot or the text label** to open the editor
- You can:
  - edit the text
  - change Local / Shared status
  - adjust font size
  - delete the annotation

Click **Save** to apply changes.

---

## Moving an Annotation

- Click and **drag the text label** to reposition the annotation
- Release to confirm the new position
- The position is saved automatically

The dot remains visually tied to the text.

---

## Keyboard Behaviour While Editing

While typing in the annotation editor:
- All global keyboard shortcuts are temporarily disabled
- This prevents accidental playback or navigation
- Press **Escape** to close the editor

Normal keyboard controls resume once the editor is closed.

---

## Local vs Shared Annotations

### Local
- Stored only in your browser
- Not visible to others
- Suitable for personal rehearsal notes

### Shared
- Broadcast to other connected clients
- Read-only for other performers
- Useful for ensemble coordination

Shared annotations do not override local ones.

---

## Visibility

Annotations:
- can be globally shown or hidden
- move with the score when scrolling or paging
- remain aligned to the score content

They never affect timing, cues, or navigation.

---

## What Annotations Do *Not* Do

Annotations:
- do not trigger playback
- do not alter the score
- do not affect synchronization
- do not replace cues or instructions

They are purely informational.

---

## Notes on Use

Annotations are best used for:
- marking sections to listen closely
- noting transitions or handovers
- tracking rehearsal decisions
- personal memory aids

They are intentionally lightweight and non-authoritative.

---

## Future Changes

This feature is evolving. Possible future additions include:
- filtering annotations by author
- export / import of annotation files
- visibility modes (rehearsal vs performance)

