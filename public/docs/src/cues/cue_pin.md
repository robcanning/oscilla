---
title: Pin to Playhead
layout: docs_layout.njk
---

# `pin:N` -- Pin Element to Playhead

The `pin` parameter keeps a cue element visible at the playhead position for a specified duration. It works with any cue type.

This is useful for long-running cues like `audioImpulse` where the waveform and its visual feedback would otherwise scroll off-screen while still active.

---

## Syntax

Add `pin:N` to any cue expression, where N is the duration in seconds:

```
audioImpulse(path:sfx/rain, rate:30, poly:6, lifetime:region, pin:30)
```

The element will scroll normally with the score until its centre reaches the playhead. At that point it hooks to the playhead and stays pinned for 30 seconds. When the duration expires, the element is released and drifts off-screen with normal scroll.

---

## Behaviour

### Phases

| Phase | What happens |
|-------|-------------|
| **Waiting** | Element scrolls normally with the score |
| **Pinned** | Element centre locked to the playhead position. A compensating SVG translate keeps it stationary on screen as the score scrolls beneath |
| **Released** | The translate freezes at its last value. Element resumes normal scroll and drifts left off-screen |

### Engage Point

The pin engages when `playheadX >= element centre X` in SVG world coordinates. This means the playhead has reached the horizontal midpoint of the cue element.

### Rewind Behaviour

If the playhead rewinds past the element centre while pinned or released, the pin resets to waiting. On the next forward pass, it will re-engage.

Full rewind to start (`rewindToStart`) clears all pins, resetting transforms and phases. The wrapper `<g>` element stays in place so pins re-engage on the next play-through without needing to re-scan the score.

### Playback Guard

Pins only update while playback is active (`window.isPlaying`). They will not falsely engage during pause, seeking, or at rest.

---

## Parameters

| Key | Value | Description |
|-----|-------|-------------|
| `pin` | number (seconds) | Duration to stay pinned to the playhead |

---

## Examples

```
// Impulse pinned for 30 seconds
audioImpulse(path:sfx/rain, rate:30, poly:6, lifetime:region, pin:30)

// Audio file pinned for 10 seconds
audio(src:long-drone, loop:0, fade:5, pin:10)

// Pool pinned for 15 seconds
audioPool(path:sfx/textures, mode:shuffle, pin:15)

// Works with non-audio cues too
fade(mode:pulse, dur:4, pin:20)
```

---

## Technical Notes

The pin system wraps each pinned element in an SVG `<g class="pin-wrapper">` at registration time (during `assignCues`). The wrapper receives a `translate(offset, 0)` transform each frame while pinned. This isolates the pin transform from any animation transforms on the element itself (rotations, scales, fades).

The pin is registered once at score load and persists across rewinds. Only `rewindToStart` resets the phase; small rewind/forward increments allow the pin to self-correct via the rewind guard in each phase.

Pin updates run in the RAF tick pipeline alongside impulse region checks, synth region checks, and speed position checks.
