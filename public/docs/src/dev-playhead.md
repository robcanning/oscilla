---
title: Playhead Offset System (Developer Guide)
---

# Playhead Offset — Developer Guide

This document covers the architecture of the adjustable playhead
position system for developer onboarding and maintenance. For musical
context on why performers adjust the playhead, see `playhead.md`.

---

## Architecture Overview

The playhead offset is a single ratio value that controls where on
screen the playhead line appears. All downstream systems (cue
collision, audio regions, synth regions, OSC control lanes) read the
playhead's actual DOM position, so they follow automatically.

```
                    window.playheadOffsetRatio
                            │
                            ▼
                ┌──────────────────────┐
                │ scrollToPlayheadVisual│
                │  (oscillaTransport)  │
                └──────┬───────────────┘
                       │
           ┌───────────┼───────────────┐
           ▼           ▼               ▼
    score transform   #playhead     #playzone
    (translate3d)     (style.left)  (style.left)
                       │
                       ▼
                ┌─────────────┐
                │ getPlayheadX│  ← reads DOM element position
                │  (paths.js) │
                └──────┬──────┘
                       │
        ┌──────────────┼──────────────────┐
        ▼              ▼                  ▼
  checkCueTriggers  checkImpulse    checkSynth
  (cueDispatcher)   Regions(audio)  Regions(synth)
        ▼
  oscCtrl tick
```

**Key insight**: `getPlayheadX()` reads the `#playhead` element's
`getBoundingClientRect().left` relative to the score container. It
does NOT hardcode screen centre. This means moving the DOM element
is sufficient -- no collision code changes are needed.

---

## Files Involved

| File | Role |
|------|------|
| `js/system/playheadOffset.js` | Drag handle, lock toggle, persistence, public API |
| `css/playheadOffset.css` | Handle and lock icon styling |
| `js/transport/oscillaTransport.js` | `scrollToPlayheadVisual()` — reads offset ratio |
| `js/system/paths.js` | `ensureWindowPlayheadX()` — reads offset ratio |
| `js/system/paths.js` | `getPlayheadX()` — reads DOM position (unchanged) |
| `js/cues/cueDispatcher.js` | `checkCueTriggers()` — calls `getPlayheadX()` (unchanged) |
| `js/cues/audio.js` | `checkImpulseRegions()` — calls `getPlayheadX()` (unchanged) |
| `js/cues/synth.js` | `checkSynthRegions()` — calls `getPlayheadX()` (unchanged) |
| `js/cues/oscCtrl.js` | `tick()` — calls `getPlayheadX()` (unchanged) |
| `js/system/oscillaPreferences.js` | Per-project offset slider in Appearance section |

---

## Data Flow

### The Offset Variable

```javascript
// Single source of truth — default 0.5 (centre)
window.playheadOffsetRatio = 0.5;  // range: 0.10 – 0.90
```

Set by:
- `playheadOffset.js` on init (from localStorage)
- Drag interaction (writes to localStorage)
- Preferences dialog (writes to server, calls `setPlayheadOffset()`)

Read by:
- `scrollToPlayheadVisual()` in oscillaTransport.js
- `ensureWindowPlayheadX()` in paths.js

### Persistence

Two persistence paths serve different use cases:

| Storage | Scope | Written by | Read on |
|---------|-------|------------|---------|
| `localStorage["oscilla_playheadOffsetRatio"]` | Per-device | Drag handle | Page load (init) |
| `preferences.json` → `playheadOffset` | Per-project | Preferences dialog | Project load |

localStorage takes priority. The rationale is that different
performers on different screen sizes may want different offsets for
the same score.

---

## Score Positioning Logic

`scrollToPlayheadVisual()` is the core rendering function called every
animation frame. The offset change is a single substitution:

```javascript
// BEFORE (hardcoded centre):
const halfViewport = viewportWidth / 2;
let translateX = halfViewport - worldPx;
let playheadScreenX = halfViewport;

// AFTER (configurable offset):
const offsetRatio = window.playheadOffsetRatio ?? 0.5;
const targetScreenX = viewportWidth * offsetRatio;
let translateX = targetScreenX - worldPx;
let playheadScreenX = targetScreenX;
```

The edge clamping logic is unchanged in structure — it just uses
`targetScreenX` instead of `halfViewport` as the reference point.

### Unclamped State (Main Score Body)

```
    ┌──── viewport ────────────────────────────┐
    │              ▼ playhead at offset          │
    │   ┌─────────┤──────────────────────┐      │
    │   │  score  │  score continues...  │      │
    │   └─────────┤──────────────────────┘      │
    └──────────────────────────────────────────┘

    translateX = (viewportWidth * offsetRatio) - worldPx
    playheadEl.style.left = `${offsetRatio * 100}%`
```

### Left Clamp (Near Score Start)

When `translateX > 0`, the score's left edge would go past the
screen's left edge. Instead, the score stays flush left and the
playhead moves from screen-left toward the offset position:

```
    playheadScreenX = worldPx
    translateX = 0
    playheadEl.style.left = `${worldPx}px`
```

### Right Clamp (Near Score End)

When `translateX < maxShiftLeft`, the score's right edge would go
past the screen's right edge. The score stays flush right and the
playhead moves from the offset toward screen-right:

```
    playheadScreenX = viewportWidth - (localRenderedWidth - worldPx)
    translateX = maxShiftLeft
    playheadEl.style.left = `${playheadScreenX}px`
```

---

## Collision Pipeline (Unchanged)

The cue collision chain requires no modifications:

```javascript
// paths.js — reads actual DOM position
export function getPlayheadX() {
  const playhead = document.getElementById("playhead");
  const scoreContainer = window.scoreContainer;
  if (!playhead || !scoreContainer) return null;

  const containerRect = scoreContainer.getBoundingClientRect();
  const playheadRect = playhead.getBoundingClientRect();
  return playheadRect.left - containerRect.left;
}
```

All consumers call `getPlayheadX()` and compare against cue element
rects in the same coordinate space:

- **cueDispatcher.js** (`checkCueTriggers`): edge-crossing detection,
  OSC re-entrant triggering, repeat region logic
- **audio.js** (`checkImpulseRegions`): impulse region enter/exit
- **synth.js** (`checkSynthRegions`): synth region enter/exit
- **oscCtrl.js** (`tick`): continuous control lane Y-value sampling

Because all of these read the DOM element's actual `left`, they track
the playhead regardless of its screen offset.

---

## Drag Handle UI

The handle is injected into `#playhead` by `playheadOffset.js` at
init time. Structure:

```html
<div id="playhead">
  <div id="repeat-count-box" class="hidden">1</div>
  <!-- injected by playheadOffset.js: -->
  <div id="playhead-offset-handle" class="locked">
    <div class="playhead-grip-dots">
      <span></span><span></span><span></span>
    </div>
    <button id="playhead-lock-btn" class="playhead-offset-lock">
      <svg class="lock-icon-locked">...</svg>
      <svg class="lock-icon-unlocked">...</svg>
    </button>
  </div>
</div>
```

The handle is invisible by default (`opacity: 0`) and appears on
hover via CSS. A `::before` pseudo-element on `#playhead` extends
the hover target to 30px wide around the 1px line.

`pointer-events: auto` on the handle overrides the `pointer-events:
none` on `#playhead`, so the handle is interactive while the
playhead line itself doesn't intercept score clicks.

### Lock States

- **Locked** (default): grip shows `cursor: default`, drag events are
  ignored. Lock icon shows closed padlock.
- **Unlocked**: grip shows `cursor: grab`, horizontal drag updates
  `window.playheadOffsetRatio` in real time. Lock icon shows open
  padlock with accent colour.

### Drag Behaviour

Horizontal only. On `mousemove`/`touchmove`:

```javascript
const newRatio = clamp(clientX / viewportWidth, 0.10, 0.90);
window.playheadOffsetRatio = newRatio;
scrollToPlayheadVisual();   // live score repositioning
applyPlayzonePosition();    // playzone follows
```

On `mouseup`/`touchend`, the ratio is persisted to localStorage.

---

## Playzone Tracking

The playzone centres itself on the playhead offset:

```javascript
function applyPlayzonePosition() {
  const ratio = window.playheadOffsetRatio ?? 0.5;
  const halfWidth = 40 / 2;  // PLAYZONE_WIDTH_PERCENT / 2
  const leftPercent = (ratio * 100) - halfWidth;
  playzone.style.left = `${leftPercent}%`;
}
```

This is called on drag, on init, and on window resize. The playzone
width (40%) is a constant matching the CSS definition.

---

## Public API

Exposed on `window` for cross-module access:

```javascript
window.playheadOffsetRatio    // current ratio (0.10–0.90)
window.initPlayheadOffset()   // call once after DOM ready
window.setPlayheadOffset(r)   // set ratio, persist, update visual
window.getPlayheadOffset()    // read current ratio
window.resetPlayheadOffset()  // reset to 0.5 (centre)
window.applyPlayzonePosition()// reposition playzone to match offset
```

---

## Integration Points

### app.js (Init)

```javascript
import { initPlayheadOffset } from './system/playheadOffset.js';

// In DOMContentLoaded, after initAnimationLoop:
initPlayheadOffset();
```

### oscillaPreferences.js (Per-Project Setting)

Field definition in Appearance section:

```javascript
{ key: "playheadOffset", label: "Playhead Position %",
  type: "range", default: 50, min: 10, max: 90, step: 1 }
```

Live application:

```javascript
if (prefs.playheadOffset != null) {
  const ratio = Number(prefs.playheadOffset) / 100;
  window.setPlayheadOffset?.(ratio);
}
```

### styles.css (CSS Import)

```css
@import url("playheadOffset.css");
```

---

## Testing Checklist

- [ ] Default position at 50% with no localStorage entry
- [ ] Unlock, drag left to ~30% -- playhead and playzone reposition
- [ ] Cues trigger at the playhead line, not at screen centre
- [ ] Lock prevents drag
- [ ] Offset persists in localStorage across reload
- [ ] Edge clamping works correctly at score start and end
- [ ] Each networked client can have an independent offset
- [ ] `oscCtrl` continuous lanes track the playhead correctly
- [ ] `audio.js` impulse regions fire at playhead intersection
- [ ] Synth regions activate/deactivate at playhead
- [ ] Rewind / forward / seek still work
- [ ] Touch drag works on tablet
- [ ] Preferences slider updates the position live
- [ ] Resizing the browser window preserves the ratio

---

## Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Cues fire at old centre position | `getPlayheadX` not reading DOM | Verify `#playhead` element exists and has correct `style.left` |
| Playzone doesn't follow | `applyPlayzonePosition` not called | Ensure it runs on drag, init, and resize |
| Offset resets on project load | Preferences overwriting localStorage | Check priority: localStorage should win |
| Handle doesn't appear | CSS not loaded | Verify `@import url("playheadOffset.css")` in styles.css |
| Handle intercepts score clicks | `pointer-events` conflict | Only the handle div should have `pointer-events: auto` |
| Drag feels sluggish | Too many repaints | `scrollToPlayheadVisual` uses `translate3d` (GPU-accelerated) |
