# Cue Reference {.unnumbered}

\appendix

# Cue Reference

<!--
This appendix can be generated or pulled from the individual cue docs.
Consider a script that extracts the syntax summary from each cue_*.md
and formats it as a compact reference table.

For now, maintain manually or replace with a generated version.
-->

## Transport

| Cue | Syntax | Description |
|-----|--------|-------------|
| `stop()` | `stop()` | Stops the transport |
| `pause()` | `pause(duration)` | Pauses for a duration |
| `speed()` | `speed(factor)` | Changes playback speed |

## Timing

| Cue | Syntax | Description |
|-----|--------|-------------|
| `stopwatch()` | `stopwatch(params)` | Displays a stopwatch |
| `metronome()` | `metronome(bpm)` | Visual/audio metronome |

## Navigation

| Cue | Syntax | Description |
|-----|--------|-------------|
| `page()` | `page(name)` | Switches to a page |
| `nav()` | `nav(target)` | Navigates to a mark |
| `button()` | `button(params)` | Interactive button |
| `propagate()` | `propagate(params)` | Propagates an event |
| `reuse()` | `reuse(params)` | Reuses a cue definition |

## Media

| Cue | Syntax | Description |
|-----|--------|-------------|
| `text()` | `text(content)` | Displays text |
| `audio()` | `audio(file)` | Plays audio |
| `video()` | `video(file)` | Plays video |
| `synth()` | `synth(params)` | Web Audio synth |
| `osc()` | `osc(params)` | Sends OSC message |
| `oscCtrl()` | `oscCtrl(params)` | OSC controller |

## Animation

| Cue | Syntax | Description |
|-----|--------|-------------|
| `scale()` | `scale(params)` | Scales an element |
| `rotate()` | `rotate(params)` | Rotates an element |
| `o2p()` | `o2p(params)` | Object-to-path morph |
| `traverse()` | `traverse(params)` | Moves along a path |
| `color()` | `color(params)` | Changes colour |
| `fade()` | `fade(params)` | Fades opacity |
| `ui()` | `ui(params)` | UI visibility control |
