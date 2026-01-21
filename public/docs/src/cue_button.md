---
title: cue_button
layout: docs_layout.njk
---

# `button()` — Clickable Buttons Inside the Score

The `button()` helper lets you place **HTML buttons** aligned to SVG markers in your score.  
Each `button()` marker is an SVG element with an ID that encodes a CueDSL expression; at runtime, Oscilla replaces that marker with a positioned HTML button which can trigger any cue.

---

## Basic Syntax

```text
id="button(
  trigger:audio(src:noise, amp:0.9, loop:6, toggle:false, uid:noiseA),
  style(size:\"120x45\", color:\"#333\", textcolor:\"#fff\", fontsize:36, active:\"flash\", uid:btnNoise)
)"
```

General form:

```text
button(
  trigger: <cue expression>,
  style(...optional style keys...),
  offsetX:<number>,
  offsetY:<number>
)
```

- **`trigger:`** — required. Any valid CueDSL expression (e.g. `nav(...)`, `audio(...)`, `page(...)`, `repeat(...)`, etc.).
- **`style(...)`** — optional styling for the HTML button.
- **`offsetX`, `offsetY`** — optional pixel offsets from the SVG marker position.

The `button()` expression must appear as the **ID** of an SVG object:

```svg
<rect
  id="button(
    trigger:audio(src:noise, amp:0.9, loop:6, toggle:false, uid:noiseA),
    style(size:\"120x45\", color:\"#333\", textcolor:\"#fff\", fontsize:36, active:\"flash\", uid:btnNoise)
  )"
  x="100" y="40" width="20" height="20"
/>
```

---

## Trigger

The `trigger:` field receives the full cue expression that should run when the button is clicked:

```text
button(
  trigger:nav(page:2)
)

button(
  trigger:pause(4)
)

button(
  trigger:audio(src:noise, amp:0.9, loop:6, toggle:false, uid:noiseA)
)
```

At runtime, clicking the button calls `handleCueTrigger(...)` with the parsed trigger AST.

---

## Style Block

The `style(...)` block controls the appearance and behaviour of the HTML button. For example:

```text
button(
  trigger:audio(src:noise, amp:0.9, loop:6, toggle:false, uid:noiseA),
  style(
    label:\"Noise A\",
    size:\"120x45\",
    color:\"#333\",
    textcolor:\"#fff\",
    font:\"Inter\",
    fontsize:36,
    active:\"flash\",
    uid:btnNoise
  )
)
```

### Supported style keys

| Key       | Type      | Description                                  |
|----------|-----------|----------------------------------------------|
| `label`  | string    | Button text override                         |
| `size`   | `"WxH"`   | Width × height in pixels, e.g. `"120x45"`    |
| `color`  | string    | Background color (CSS color)                 |
| `textcolor` | string | Text color                                   |
| `font`   | string    | Font-family name                             |
| `fontsize` | number  | Font size in px                              |
| `active` | string    | `"flash"` to briefly highlight on click      |
| `uid`    | string    | Identifier for debugging / CSS hooks         |

Notes:

- If `style(label:...)` is present, it overrides any auto-generated label.
- If `style(active:\"flash\")` is set, the button gets the `oscilla-button-flashable` class and flashes briefly on click.

---

## Automatic Label Fallback

If no `style(label:...)` is provided, Oscilla derives a label from the trigger:

Priority (roughly):

1. `style(label:\"…\")` override  
2. `trigger.uid` (if present)  
3. `trigger.action` (e.g. `"nav"`, `"audio"`, `"page"`)  
4. `trigger.page` (for page cues)  
5. `"button"` as a final fallback

This means even minimal buttons like:

```text
button(trigger:nav(page:3))
```

will still get a readable label.

---

## Positioning

Each `button()` marker is an SVG element that defines where the HTML button should appear.

Runtime behaviour:

1. The engine looks for a suitable container element in the DOM:

   - `#singlePage-content`
   - `#pageOverlay`
   - `#scoreInner`

2. It computes the SVG marker's bounding box and transform, converts that to screen coordinates, then to container-local coordinates.

3. It creates a `<button>` element with `position:absolute` and sets its `left` and `top` to match the marker position.

4. If the marker is **not** part of a `reuse(...)` clone, the SVG marker is hidden (via `visibility:hidden`) so only the HTML button is visible.

### Offsets

You can nudge the button relative to the marker with `offsetX` and `offsetY` in pixels:

```text
button(
  trigger:nav(page:4),
  style(label:\"Next Page\"),
  offsetX:10,
  offsetY:-8
)
```

---

## Containers and Page Mode

Buttons are designed primarily for **page mode** overlays:

- In page mode, `button()` elements will be placed inside `singlePage-content` or `pageOverlay`.
- If the chosen `containerEl` accidentally resolves to an SVG element, Oscilla falls back to `#singlePage-content`.

This ensures that buttons remain correctly aligned even when the score scrolls or resizes.

---

## Click Behaviour

On click, a button:

1. Prevents default and stops event propagation.
2. Optionally flashes (`active:\"flash\"`).
3. Invokes `handleCueTrigger(triggerAst, false, true, markerElement)` with the trigger AST.

This means `button()` is essentially a **visual trigger surface** for any existing cue type.

---

## Managing Buttons Programmatically

### Destroy all generated buttons

```js
destroyAllCueButtons();
```

- Removes all `.oscilla-cue-button` elements from the DOM.
- Calls an internal `_destroyCueButton` if present (for cleanup).
- Useful when unloading or reloading a score.

### Hide all `button()` markers in the SVG

```js
hideAllButtonPlaceholders(svgRoot);
```

- Finds all markers with `id^="button("` and sets:
  - `opacity: 0`
  - `pointer-events: none`
- This hides the original SVG placeholders (including clones) while leaving the HTML buttons visible.

---

## Summary

- Use `button(trigger:..., style(...))` to add clickable controls into Oscilla scores.
- The SVG marker defines **where** the button appears.
- The `trigger:` field defines **what** happens when the button is clicked.
- The `style(...)` block refines **how** the button looks and responds.
- Buttons integrate seamlessly with existing CueDSL expressions, making them a flexible way to expose navigation, audio, or structural cues as tactile UI widgets.
