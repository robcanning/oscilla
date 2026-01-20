---
title: Cue UI
layout: docs_layout.njk
---

# ui()

`ui()` applies **performer-facing UI changes** (HTML/CSS) during playback — most commonly to **hide or reveal interface elements** such as the playhead, play zone, overlays, or control panels.

It targets **HTML elements (not SVG)** using a CSS selector and applies a controlled set of visual changes, optionally animated over time.

The UI cue system was **primarily designed to manage visibility of the playhead and play zone**, allowing scores to shift between guided, open, or reduced-UI performance states.

---

## Syntax

```js
ui("<css selector>", opacity:<number>, scale:<number>, x:<px>, y:<px>, rotate:<deg>, visible:<bool>, color:<css>, bg:<css>, z:<number>, dur:<seconds>)
```

---

## What it affects

- Works on: HTML UI elements
- Does not affect: SVG score elements
- Multiple matches: All matching elements are updated

---

## Built-in UI toggle button

Oscilla includes a **GUI button in the bottom-right corner** that toggles:

- Playhead
- Play zone

on and off.

This button uses the same internal UI logic as the `ui()` cue and exists to allow fast switching between visible guidance and reduced interface modes during performance.

---

## Parameters

### Transition
- `dur` (seconds, default `0`)

### Visibility
- `visible:true|false`

### Opacity
- `opacity` (number)

### Transform
- `x`, `y` (px)
- `scale` (number)
- `rotate` (degrees)

Transforms are stateful and combined.

### Color
- `color`
- `bg`

### Layering
- `z` (z-index)

---

## Examples

```js
ui("#playhead", opacity:0, dur:0.3)
```

```js
ui("#playhead", visible:false, dur:0.3)
```

```js
ui("#playhead, #playzone", visible:false, dur:0.25)
```

```js
ui("#playhead, #playzone", visible:true, dur:0.25)
```

---

## Design notes

- Intended for performance-state control
- Touch- and tablet-friendly
- Reduces visual clutter
- Suitable for audience-facing projections
