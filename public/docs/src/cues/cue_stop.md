---
layout: docs_layout.njk
title: cue_stop
---

# `stop(...)` --- Toggle Playback (On / Off)

The `stop(...)` cue toggles the transport:

-   if playback is running → it stops
-   if playback is already stopped → it starts again

It does not end the score and it does not freeze the system.

## Syntax

    stop()
    stop(uid:NAME)
    stop(next:CUEID)

### Parameters

  -----------------------------------------------------------------------
             param        required         description
  ---------------- ----------------------- ------------------------------
             `uid`            ✖            Only needed if multiple
                                           identical `stop(...)` cues
                                           appear

            `next`            ✖            Trigger another cue
                                           immediately after `stop(...)`
                                           runs
  -----------------------------------------------------------------------

## Behaviour

-   toggles playback (stop ↔ start)
-   briefly ignores sync echoes
-   `next(...)` triggers another cue **immediately** (does not wait for
    resume / spacebar)

### Examples

    stop()
    stop(uid:s1)
    stop(next:nav(End))

## Related

-   `pause(...)`
-   `nav(...)`
