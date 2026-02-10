---
title: Live Console
layout: docs_layout.njk
---

# Live Console -- Live Coding & Inspection

The Live Console lets you type and execute Oscilla DSL expressions in
real time, directly against elements in the running score. It also
provides a signal monitor showing all active control-plane values.

Use it for:

-   **live coding** -- type DSL, execute it, hear/see the result
-   **testing** -- try parameter changes without editing the SVG
-   **debugging** -- inspect signal flow and animation state
-   **performance** -- build and modify animations during a show

------------------------------------------------------------------------

## Opening the Console

Click the **`>_`** button in the top bar. The console panel opens on
the right side of the screen. Click the button again (or the X) to
close it.

------------------------------------------------------------------------

## Panel Layout

The panel has four sections, top to bottom:

### Target

Shows which SVG element your DSL will be applied to. You can set the
target by:

-   **Picking** -- click "pick", then click any element in the score.
    The element is highlighted and its uid populates the target field.
-   **Typing** -- enter a uid or element id in the target field and
    press Enter. Partial matches against the animation registry are
    supported.

The info line below the field shows the element's tag, id, uid, kind
(rotate/scale/o2p/...), and whether it is currently running.

Animation cues (`rotate`, `scale`, `o2p`, `color`, `fade`) require a
target element. Other cues (`synth`, `audio`, `speed`, `nav`, `osc`,
`stop`, `pause`) do not -- they execute without a target.

### Editor

A text area where you type DSL expressions. Execute with:

-   **Ctrl+Enter** -- run the current line (where the cursor is)
-   **Ctrl+Shift+Enter** -- run all lines

When you pick an element, its existing DSL expression (from its SVG id)
is pre-filled in the editor so you can modify and re-apply.

### Output

Shows the result of each execution: green for success, red for parse
errors or missing targets.

### Signals

A live-updating view of all values on the ParamBus (the control plane).
Updated at 5 fps. Use the filter field to narrow by path prefix --
e.g. type `rotate` to see only rotation signals, or a uid to see a
specific element's outputs.

------------------------------------------------------------------------

## Usage Examples

### Modify a running rotation

1.  Click **pick**, click the rotating element in the score
2.  The editor fills with the current DSL, e.g.
    `rotate(dir:1 dur:30 uid:spinner1 osc:1)`
3.  Change `dur:30` to `dur:5` and press **Ctrl+Enter**
4.  The element now rotates at the new speed

### Start a synth (no target needed)

Type directly in the editor:

    synth(freq:440 amp:0.3 wave:sine)

Press Ctrl+Enter. No target element required.

### Change playback speed

    speed(0.5 dur:4)

Ramps playback to half speed over 4 seconds.

### Navigate to a rehearsal mark

    nav(B)

Jumps to rehearsal mark B.

### Trigger an audio cue

    audio(clicks.wav vol:0.6 loop:1)

### Layer multiple cues

Write multiple lines and run all with Ctrl+Shift+Enter:

    rotate(dir:-1 dur:8 uid:orb1)
    synth(freq:orb1.norm[200,800] amp:0.4)
    speed(1.5)

------------------------------------------------------------------------

## Keyboard Behaviour

While the cursor is in any field or the editor inside the live console
panel, all keyboard events are captured by the panel. Arrow keys,
spacebar, and other keys will not trigger transport controls or score
navigation. Keyboard shortcuts resume normal behaviour when focus
leaves the panel.

------------------------------------------------------------------------

## Signal Monitor

The signal monitor displays all values currently published to the
ParamBus. Signals are published by running animations:

    o2p:slider1.t       0.4523
    rotate:spinner.norm  0.7210
    synth:drone1.freq    442.00

Use the filter to focus on signals you care about. This is useful for
verifying that cross-cue modulation sources are producing expected
values before wiring them to targets.

------------------------------------------------------------------------

## Tips

-   You can re-pick a different element at any time without closing
    the panel.
-   The DSL you type follows exactly the same syntax used in SVG
    element IDs in Inkscape -- the same parser handles both.
-   Animation cues applied via the console replace the previous
    animation on that element, just as re-triggering from the
    playhead would.
-   The console does not modify the SVG file. Changes exist only in
    the running session.

------------------------------------------------------------------------

## Related

-   [Control & Modulation](oscilla-control-input-and-modulation.md)
-   [Cue System](cueSystem.md)
-   [rotate()](cue_rotate.md), [scale()](cue_scale.md),
    [o2p()](cue_o2p.md), [synth()](cue_synth.md)
