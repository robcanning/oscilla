---
layout: docs_layout.njk
title: cue_pause
---

# pause(...) --- Temporarily Halt Playback

The `pause(...)` cue temporarily stops playback for a fixed duration. It
may optionally display a countdown overlay and can automatically trigger
another cue when finished.

Playback and synchronization are completely frozen during a pause.

## Syntax

    pause(dur:SECONDS, count:BOOL, next:CUEID, uid:NAME)

## Daisy-chaining with `next(...)`

`next(...)` does **not** make the pause jump anywhere by itself.

Instead, it tells Oscilla:

> "When the pause finishes, trigger this other cue."

    pause(dur:4, next:sectionB)

What happens:

1.  pause\
2.  countdown (if enabled)\
3.  the cue named `sectionB` is triggered

If `sectionB` happens to be a navigation cue, the score may jump --- but
it is the **navigation cue** doing the jump, not the pause system.
