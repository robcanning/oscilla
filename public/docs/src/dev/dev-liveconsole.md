---
title: Dev_Live_Console
layout: docs_layout.njk
---

# Developer Guide: Live Console

Technical reference for `oscillaLive.js` and `livecode.css`.

---

## Architecture

The live console is deliberately thin. It creates a UI panel and routes
user input through the **existing dispatch pipeline** -- it does not
import or reimplement any cue handlers.

```
User types DSL string
  |
  v
parseCueToAST(line)          -- validate syntax
  |
  v
handleCueTrigger(line,       -- dispatch through standard pipeline
  isRemote=false,
  force=true,                -- bypass dedupe (always execute)
  cueElement=targetEl|null)
  |
  v
cueDispatcher switch(ast.type) --> handler
```

Every cue type the system supports works automatically, including types
added after this module was written.

---

## Dependencies

The module depends entirely on `window` globals set up by existing
modules. It has **zero cross-module imports**:

| Global | Source | Used for |
|--------|--------|----------|
| `window.handleCueTrigger` | cueDispatcher.js | Dispatch DSL strings |
| `window.parseCueToAST` | parser.js | Validate before dispatch |
| `window.oscillaAnimRegistry` | animation.js | Target lookup by uid |
| `window.runningAnimations` | animation.js (Map) | Check running state |
| `window.oscillaParamBus` | paramBus.js | Signal monitor |
| `window.oscillaRouter` | controlRouter.js | (future) mod patching |

This means:

-   No changes to any handler when adding new cue types
-   No circular dependency risk
-   Module can be loaded or removed without affecting any other module

---

## Files

| File | Location | Purpose |
|------|----------|---------|
| `oscillaLive.js` | `js/system/` | Module: panel creation, execution, picker, signal monitor |
| `livecode.css` | `css/` | All styling for the panel and picker highlights |

---

## Integration

### CSS

Add to `styles.css` imports:

```css
@import url("livecode.css");
```

### JS

In `app.js`:

```js
import { initLiveConsole } from "./system/oscillaLive.js";
```

Call inside `DOMContentLoaded`:

```js
initLiveConsole();
```

This creates the `>_` toggle button inside `#topbar-actions`, before
the `.view-tools` cluster. The panel is built lazily on first open.

### HTML

No changes required. The button and panel are created dynamically.

---

## Exports

```js
export function initLiveConsole()     // Setup: creates topbar button
export function destroyLiveConsole()  // Teardown: removes button + panel
```

---

## Execution Model

### Element-targeted cues

Cue types `rotate`, `scale`, `scaleXY`, `o2p`, `color`, `colour`,
`fade` require a DOM element. The console checks this with a regex
before dispatch:

```js
const ELEMENT_CUES =
  /^(rotate|scale|scaleXY|o2p|color|colour|fade)\s*\(/i;
```

If the user has not picked a target, execution is blocked with an
error message.

### Elementless cues

Everything else (`synth`, `audio`, `speed`, `nav`, `osc`, `stop`,
`pause`, `text`, `video`, etc.) dispatches with `cueElement = null`.

### Force flag

All dispatches pass `force=true` to `handleCueTrigger`, which bypasses
the dedupe guard (`window.triggeredCues` Set). This is essential --
livecoded cues must always execute even if the same DSL string was
triggered before.

### Re-application on same element

When a new animation cue is dispatched to an element that already has
a running animation, the handler itself manages teardown. For example,
`handleRotateContinuous` calls `el._oscillaRotateAnim.pause?.()` before
starting a new anime instance. The console does not need to stop
anything explicitly.

---

## Target Resolution

The picker and target input resolve elements through three paths, in
order:

1.  **Animation registry** -- `oscillaAnimRegistry[uid].el` (exact uid
    match)
2.  **DOM** -- `document.getElementById(id)` (exact id match)
3.  **Partial registry match** -- first key in registry containing the
    input string

When an element is picked, its SVG `id` attribute (which contains the
DSL expression) is pre-filled into the editor so the user can modify
and re-execute.

---

## Element Picker

Pick mode attaches three listeners on the `document` in capture phase:

-   `click` -- selects the element, exits pick mode
-   `mouseover` -- adds `.livecode-highlight` outline
-   `mouseout` -- removes highlight

`findMeaningfulElement()` walks up from the clicked element looking for
the nearest ancestor with `data-anim-uid` or a non-livecode `id`.
This avoids selecting leaf `<tspan>` or `<path>` nodes when the user
means the parent group.

---

## Signal Monitor

Subscribes to all ParamBus changes via wildcard:

```js
oscillaParamBus.subscribe("*", (value, path) => { ... })
```

Values accumulate in a snapshot object. A `setInterval` at 200ms
(5 fps) renders the snapshot to DOM. This avoids DOM thrash from
high-frequency signal updates (animations publish at ~60fps).

The filter input narrows the display by case-insensitive substring
match on the signal path.

---

## Keyboard Isolation

The panel stops propagation of `keydown`, `keyup`, and `keypress`
events at the panel boundary. This prevents transport keybindings
(arrow keys, spacebar, etc.) from firing while the user types in the
editor or input fields.

```js
panelEl.addEventListener("keydown",  (e) => e.stopPropagation());
panelEl.addEventListener("keyup",    (e) => e.stopPropagation());
panelEl.addEventListener("keypress", (e) => e.stopPropagation());
```

---

## Z-Index

The panel sits at `z-index: 38000`, between the top bar (35000) and
controlXY panels (40000). This ensures it is above the score and
transport but below modal controlXY surfaces.

---

## Future Extensions

### WebSocket/OSC input

`handleCueTrigger` is already on `window`. A single line in the
socket message handler could route incoming DSL strings:

```js
// in socket.js message handler:
case "livecode":
  window.handleCueTrigger(msg.dsl, true, true, null);
  break;
```

This would allow live coding from an external editor over the network.

### Modulation patching

The console could accept `mod()` expressions to create live modulation
routes via `oscillaRouter.mod()`. The signal monitor already shows the
values that would be routed.

### History / recall

Editor content could persist to `localStorage` per-project, giving a
recall buffer of recent expressions.

### Autocompletion

The animation registry and ParamBus key list provide all the data
needed for uid and signal path autocompletion in the editor.

---

## Related

-   [Live Console (user guide)](liveconsole.md)
-   [Cue Dispatcher](cuehandler_architecture.md)
-   [Control & Modulation](oscilla-control-input-and-modulation.md)
-   [Adding a New Cue](oscilla-developer-guide-new-cue.md)
