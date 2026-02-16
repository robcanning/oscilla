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

### Score view (normal)

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

### Dedicated view (?view=live)

```
User types DSL string
  |
  v
sendSocketMessage("livecode_exec", {   -- send via WebSocket
  cueExpr: cleaned,
  targetId: targetId | null
})
  |
  v
server.js rebroadcasts via broadcastToOthers()
  |
  v
socket.js handleLivecodeExec(data)     -- score window receives
  |
  v
handleCueTrigger(cueExpr, false, true, targetEl)
```

In the dedicated view there is no local SVG, no cue pipeline, and no
audio context. All execution happens remotely in the score window.

---

## Dependencies

### Window globals

| Global | Source | Used for |
|--------|--------|----------|
| `window.handleCueTrigger` | cueDispatcher.js | Dispatch DSL strings (score view only) |
| `window.parseCueToAST` | parser.js | Validate before dispatch (score view only) |
| `window.oscillaAnimRegistry` | animation.js | Target lookup by uid (score view only) |
| `window.runningAnimations` | animation.js (Map) | Check running state |
| `window.oscillaParamBus` | paramBus.js | Signal monitor |
| `window.oscillaRouter` | controlRouter.js | (future) mod patching |

### Module imports

| Import | From | Used for |
|--------|------|----------|
| `makeDraggable` | `../system/uiUtils.js` | Panel drag by header |
| `isDedicatedView` | `../system/oscillaView.js` | Branch between local and remote execution |
| `sendSocketMessage` | `../system/socket.js` | Send livecode_exec to server |

---

## Files

| File | Location | Purpose |
|------|----------|---------|
| `oscillaLive.js` | `js/interaction/` | Module: panel, execution, picker, browser, signal monitor |
| `livecode.css` | `css/` | All styling for the panel, picker, and cue browser |

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
import { initLiveConsole, showLiveConsole } from "./interaction/oscillaLive.js";
```

Call inside `DOMContentLoaded` (both score and dedicated view paths):

```js
initLiveConsole();
```

For dedicated views, pass `showLiveConsole` to `activateView` so the
panel opens automatically:

```js
activateView({ openLiveConsole: showLiveConsole });
```

### HTML

No changes required. The button and panel are created dynamically.

---

## Exports

```js
export function initLiveConsole()       // Setup: creates topbar ">_" button
export function destroyLiveConsole()    // Teardown: removes button + panel
export { openPanel as showLiveConsole } // Open the panel programmatically
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

In the dedicated view, if the expression itself is a known element ID
from the score (i.e. it was inserted via the cue browser), it is used
as both the `cueExpr` and `targetId`, since the element's SVG `id`
attribute contains the DSL expression.

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
a running animation, the handler itself manages teardown. The console
does not need to stop anything explicitly.

### Multi-line expressions

The editor supports multi-line DSL expressions. `splitExpressions()`
joins lines while parentheses are unbalanced, so expressions like long
`Pseq` definitions can be split across lines for readability.
`getCurrentLine()` identifies which expression the cursor is inside
and returns the full joined expression for `Ctrl+Enter`.

---

## Target Resolution

### Score view

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

### Dedicated view

No local DOM is available. Target resolution stores the ID string in
`selectedTargetId` and sends it to the score window, where
`handleLivecodeExec` in `socket.js` performs the same three-path
resolution locally.

The target input has a `<datalist>` populated by `fetchScoreElements()`
so the user can autocomplete element IDs from the score.

---

## Remote Execution (Dedicated View)

When `isDedicatedView()` is true, the module operates in remote mode:

**On open:** `fetchScoreElements()` fetches the project SVG via HTTP
(e.g. `/scores/demo-audio/score.svg`), parses it with `DOMParser`,
and extracts:
- All element IDs into a `<datalist>` for target autocomplete
- DSL cue expression IDs into the output panel as browsable entries

**On execute:** `executeLine()` sends a `livecode_exec` WebSocket
message instead of calling `handleCueTrigger` directly.

**Pick button:** Disabled (no local SVG to click on). Target selection
is done via the datalist autocomplete or by typing.

### WebSocket Protocol

**Client -> Server:**
```json
{ "type": "livecode_exec", "cueExpr": "synth(wave:sin, freq:440)", "targetId": null }
```

**Server -> Other clients:**
Same message, rebroadcast via `broadcastToOthers()`.

**Score window handler** (`socket.js`):
```js
function handleLivecodeExec(data) {
  const { cueExpr, targetId } = data;
  let targetEl = null;
  if (targetId) {
    const reg = window.oscillaAnimRegistry?.[targetId];
    targetEl = reg?.el || document.getElementById(targetId);
  }
  handleCueTrigger(cueExpr, false, true, targetEl);
}
```

---

## Cue Browser

The cue browser allows keyboard navigation of DSL expressions found in
the score. It is populated by `fetchScoreElements()` in dedicated view
mode.

**Entry:** `Ctrl+J` from the editor textarea.

**Navigation:** Arrow keys or `j`/`k` (vi-style). The current entry is
highlighted with a left border accent.

**Insert:** `Enter` inserts the full cue expression at the cursor
position in the editor and returns focus.

**Exit:** `Escape` returns to the editor without inserting.

The handler attaches at document level in capture phase so the textarea
does not receive navigation keys while browsing. On exit, the handler
is removed.

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

Disabled in dedicated views (no local SVG).

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

## Panel Layout

The panel has three vertically stacked sections with draggable resize
bars between them:

| Section | Content |
|---------|---------|
| **Editor** | Textarea for DSL input, run line / run all buttons |
| **Output** | Log entries and browsable cue list |
| **Signals** | Live ParamBus signal monitor with filter |

The panel itself is edge-resizable (all four edges and corners) and
draggable by its header bar.

---

## Keyboard Isolation

The panel stops propagation of `keydown`, `keyup`, and `keypress`
events at the panel boundary. This prevents transport keybindings
(arrow keys, spacebar, etc.) from firing while the user types in the
editor or input fields.

---

## Z-Index

The panel sits at `z-index: 38000`, between the top bar (35000) and
controlXY panels (40000). This ensures it is above the score and
transport but below modal controlXY surfaces.

---

## Related

-   [Live Console (user guide)](liveconsole.md)
-   [Cue Dispatcher](cuehandler_architecture.md)
-   [Control & Modulation](oscilla-control-input-and-modulation.md)
-   [Adding a New Cue](oscilla-developer-guide-new-cue.md)
-   [View System](dev-view-system.md)
