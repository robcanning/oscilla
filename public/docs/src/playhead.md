---
title: playhead
layout: docs_layout.njk
---

# Playhead & Playzone

The playhead is the vertical line that marks the current reading
position in a scrolling score. As playback advances, the score moves
beneath the playhead and cues are triggered when their bounding box
crosses the playhead line.

The playzone is a translucent highlight region centred on the playhead.
It gives performers a wider visual context of "where we are now" and
can be styled per project.

---

## Adjustable Playhead Position

By default, the playhead sits at the horizontal centre of the screen.
This means roughly equal amounts of upcoming and past notation are
visible at any moment. But different musical situations call for
different reading positions, and performers often have strong
preferences about how much lead time they need.

### Why Move the Playhead?

**Preparation time.** In a densely notated score with precise
rhythmic cues or complex extended technique instructions, performers
need to see material well in advance. Shifting the playhead to the
left -- say 25% or 30% from the screen edge -- gives significantly
more screen space to the right, meaning upcoming notation stays
visible for longer before it reaches the intersection point. This
extra read-ahead time can be the difference between a confident
entrance and a scrambled reaction.

**Loose timing and sustained material.** In freer passages where
timing is approximate and material might be held, stretched, or
revisited, a centred or even right-of-centre playhead keeps the
current material on screen longer. Performers who are sustaining a
texture or interpreting a passage freely may not want the notation
they're working with to disappear off the left edge too quickly.
Keeping the playhead further right means the "now" zone lingers.

**Ensemble coordination.** In networked performance where multiple
performers share the same scrolling score, different instrumentalists
may need different amounts of preparation depending on their part.
A percussionist reading rapid triggering cues might want maximum
look-ahead, while a vocalist sustaining long tones might prefer a
centred view. Since the playhead offset is a per-device setting,
each performer can adjust independently without affecting
synchronisation -- the underlying score position stays locked across
all clients.

**Audience projection.** When a separate display shows the score to
an audience, a centred playhead often makes the most visual sense,
giving equal context on either side. Meanwhile the performers'
tablets might have the playhead pulled left for more look-ahead. This
is a natural configuration in live performance setups.

**Rehearsal vs. performance.** During rehearsal, a performer might
want a centred playhead for a balanced overview while learning the
piece. In performance, they might shift it left once they know the
material and need that extra preparation window for confident
execution. The drag handle makes this a quick adjustment between
runs.

### Using the Drag Handle

1. **Hover** near the playhead line. A small grip handle and a lock
   icon appear at the top of the line.
2. **Click the lock icon** to unlock the playhead position.
3. **Drag the grip handle** left or right to reposition. The playzone
   follows automatically.
4. **Click the lock icon** again to lock the position and prevent
   accidental movement during performance.

The offset is saved per device and persists across page reloads.

### Using Preferences

Open the project preferences dialog (hamburger menu) and look for
**Playhead Position %** in the Appearance section. The slider ranges
from 10% (far left) to 90% (far right), with 50% being the default
centre position.

The preferences value is saved per project on the server, while the
drag handle saves per device in the browser. The drag handle setting
takes priority on load, since screen size and performer preference
are inherently local.

---

## Visibility Toggle

The playhead and playzone can be cycled through four visibility states
using the toggle button in the transport controls (bottom-right grid):

- **Both** -- playhead line and playzone visible (default)
- **Playhead only** -- just the line
- **Playzone only** -- just the highlight region
- **None** -- both hidden

---

## Appearance

Playhead and playzone colours and the playhead line width can be
configured in the project preferences dialog under **Appearance**:

- **Playhead Color** -- colour of the vertical line
- **Playzone Color** -- colour of the highlight region (supports
  transparency via hex-with-alpha)
- **Playhead Width** -- thickness of the line in pixels

---

## Cue Interaction

Cues are triggered when the playhead crosses their left edge during
forward playback. The collision system reads the playhead element's
actual screen position, so adjusting the playhead offset does not
break cue triggering -- cues always fire at the playhead line,
wherever it is on screen.

This applies to all cue types: navigation, audio, synth, OSC,
animation triggers, pause, stop, and continuous control lanes
(`oscCtrl`).

---

## Repeat Indicator

When a `cueRepeat` region is active, the playhead line turns red and
a count box appears near the bottom showing the current repeat
iteration. Clicking the count box cancels the repeat and resumes
normal playback.

---

## Edge Behaviour

At the very start and end of the score, the playhead departs from its
configured screen position to avoid showing empty space beyond the
score boundaries:

- **Near the start**: the score's left edge stays at the screen's left
  edge and the playhead moves rightward from the left toward its
  configured offset.
- **Near the end**: the score's right edge stays at the screen's right
  edge and the playhead moves rightward from its configured offset
  toward the right.

During the main body of the score, the playhead stays fixed at its
offset position and the score scrolls beneath it.
