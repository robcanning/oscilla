# oscCtrl --- Continuous Control Lanes (OSC)

`oscCtrl` lets you draw a **path in the score** and use it as a live
control lane for audio / electronics via OSC. As the playhead passes
over the path, values are mapped and streamed to the audio engine.

The path acts like a **breakpoint automation curve** tightly aligned to
instrumental notation.

------------------------------------------------------------------------

## Basic Syntax

    oscCtrl(
      addr:"/fx/ring/freq",
      min:60,
      max:800,
      uid:ringModFreq
    )

### Parameters

  -------------------------------------------------------------------------
  Param        Required             Type         Description
  ------------ -------------------- ------------ --------------------------
  `addr`       ✔                    string       OSC address to control
                                                 (joined under
                                                 `/oscilla/control`)

  `min`        ✖                    number       Minimum mapped value
                                                 (default `0`)

  `max`        ✖                    number       Maximum mapped value
                                                 (default `1`)

  `uid`        ✖                    string       Unique label (client‑side
                                                 only, debugging)

  `mode`       ✖                    enum         `event` (default) or
                                                 `continuous`
  -------------------------------------------------------------------------

The cue **must be placed directly on a `<path>` element**.

------------------------------------------------------------------------

## What gets sent

Given:

    addr:"/fx/ring/freq"

Oscilla sends:

    /oscilla/control/fx/ring/freq   <value>   <t>

Where:

-   **value** → mapped Y position between `min` → `max`
-   **t** → normalized X position along the path (0--1)

Example:

    /oscilla/control/fx/ring/freq   726.06   0.27

------------------------------------------------------------------------

## Path Semantics

The path defines:

-   horizontal = **time alignment** with notation

-   vertical = **control value**

-   Top of path → higher values

-   Bottom of path → lower values

Zoom, scale, and SVG transforms are handled automatically.

------------------------------------------------------------------------

## Modes

### `mode:event` (default)

Send only when the value **changes meaningfully**.

    oscCtrl(
      addr:"/fx/pan",
      min:-1,
      max:1
    )

Reduces controller spam and CPU noise.

### `mode:continuous`

Send regularly while the playhead is inside the lane:

    oscCtrl(
      addr:"/fx/pan",
      min:-1,
      max:1,
      mode:continuous
    )

Useful for:

-   scrubbing
-   FM / modulation
-   granular playback positions

Messages are still **throttled to \~30/s**.

------------------------------------------------------------------------

## Recommended Uses

✔ ring modulation frequency\
✔ panning automation\
✔ filter cutoff / resonance\
✔ spatialization\
✔ cueing electronics transitions

------------------------------------------------------------------------

## Not Sent

`oscCtrl` does **not** apply smoothing.\
This should happen in the **audio client**, where it belongs.

------------------------------------------------------------------------

## Future Extensions

-   `oscCtrlNode()` breakpoint nodes & interpolation
-   custom easing curves (exp / log)
-   curve visualization overlays

------------------------------------------------------------------------

## Troubleshooting

**Nothing happens?**\
Ensure the cue is attached to the **path element itself**, not a group.

**OSC not received?**\
Check the server receives:

    type: "osc_control"

and that `/oscilla/control/*` is routed correctly.

------------------------------------------------------------------------

## Summary

`oscCtrl` brings automation‑style control inside the score while
remaining modular and OSC‑native.

Compose gestures visually --- let the audio engine interpret.

------------------------------------------------------------------------
