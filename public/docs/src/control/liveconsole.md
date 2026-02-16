---
title: Live Console
layout: docs_layout.njk
---

# Live Console

The live console lets you type and execute DSL cue expressions in real time during a performance. Any cue the score system supports can be triggered from the console -- synthesis, audio playback, animation, navigation, OSC messaging, and more.

The console can run in two modes: **embedded** inside the score view, or as a **standalone window** using the dedicated view system. In standalone mode, commands are sent over WebSocket to the score window and executed there.

---

## Opening the Console

**In the score view:** click the `>_` button in the top bar, or open it programmatically.

**As a standalone window:** add `?view=live` to the URL:

```
http://localhost:3000/?project=my-score&view=live
```

This opens a lightweight window with only the live console and WebSocket connection -- no score rendering, no audio context, no animation loop.

---

## Panel Sections

The console has three vertically stacked sections. Drag the bars between them to resize.

**Editor** -- a text area for writing DSL expressions. Type a cue expression and press `Ctrl+Enter` to execute the current line, or `Ctrl+Shift+Enter` to execute all lines.

**Output** -- shows execution results, errors, and (in standalone mode) a browsable list of all cue expressions found in the score.

**Signals** -- a live monitor of all ParamBus signals. Shows the current value of every active signal path. Use the filter field to narrow the display.

The panel is draggable (by its header bar) and resizable (all edges and corners).

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Enter` | Execute the current line |
| `Ctrl+Shift+Enter` | Execute all lines |
| `Ctrl+J` | Enter cue browser (standalone mode) |
| `Tab` | Insert two spaces |
| `Escape` | Exit cue browser |

---

## Target Selection

Some cue types operate on a specific SVG element -- `rotate`, `scale`, `o2p`, `color`, `fade`. Before executing these, you need to select a target.

**In the score view:** click `pick` and click on an element in the score. Or type a uid or element ID into the target input and press Enter.

**In standalone mode:** the pick button is unavailable (no local score). Instead, type into the target input -- it autocompletes from all element IDs in the score. When you insert a cue expression from the browser, the element is targeted automatically since the expression IS the element's ID.

Cue types that do not need an element (`synth`, `audio`, `speed`, `nav`, `osc`, `stop`, etc.) execute without a target.

---

## Cue Browser

In standalone mode, the console fetches the project SVG on open and lists all DSL cue expressions in the output panel. You can interact with this list to select and insert cues into the editor.

### Keyboard workflow

1. Press `Ctrl+J` to enter browse mode
2. Navigate with arrow keys (or `j`/`k`)
3. Press `Enter` to insert the selected expression at the cursor
4. Focus returns to the editor automatically
5. Press `Escape` to exit without inserting

You can also click any entry to insert it.

---

## Multi-line Expressions

The editor supports multi-line DSL expressions. Lines with unbalanced parentheses are joined to the next line, so long expressions can be split for readability:

```
synth(
  wave:sin,
  freq:440,
  dur:2,
  amp:0.6
)
```

`Ctrl+Enter` detects which expression the cursor is inside and executes the whole thing.

---

## Signal Monitor

The bottom section shows all active ParamBus signals in real time. Each row displays a signal path and its current value, updated at 5 fps.

Use the filter field to narrow the display. For example, typing `freq` shows only signal paths containing "freq".

This is useful for verifying that control bindings are working -- you can see whether a fader's `t` value is changing, what frequency a synth is receiving, etc.

---

## Standalone Mode Details

The standalone `?view=live` window is a lightweight client. It connects to the same WebSocket server as the score window but does not load the score, initialise audio, or run the animation loop.

What happens when you execute a command:

1. The console sends a `livecode_exec` message via WebSocket
2. The server relays it to all other connected clients
3. The score window receives it, resolves the target element, and calls `handleCueTrigger`

This means multiple performers can have their own live console windows open, all sending commands to the same score.

---

## Examples

**Play a synth note:**
```
synth(wave:sin, freq:440, dur:2, amp:0.6)
```

**Trigger an audio file:**
```
audio(src:noise, amp:0.8, loop:3)
```

**Rotate a targeted element:**
```
rotate(dur:4, loop:0)
```
(Requires a target element to be selected first.)

**Change playback speed:**
```
speed(1.5)
```

**Send an OSC message:**
```
osc(addr:/synth/freq, value:880)
```

Any valid Oscilla DSL expression works. The console uses the same parser and dispatcher as the playhead-triggered cue system.

---

## Related

-   [Dev: Live Console](dev-liveconsole.md) -- technical reference
-   [Cue System](cueSystem.md) -- overview of all cue types
-   [Control & Modulation](control-and-modulation.md) -- signal routing
