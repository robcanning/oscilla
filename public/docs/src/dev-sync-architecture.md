---
title: Sync Architecture
layout: docs_layout.njk
---

# Oscilla Multi-Client Visual Synchronization

## Overview

Oscilla synchronizes a scrolling SVG score across multiple clients so the playhead is always over the **same score content** regardless of screen size or aspect ratio.

**Core principle**: Sync only **world coordinates** (`playheadX`). Each client computes its own pixel positions locally.

---

## Key Terms

| Term | Definition |
|------|------------|
| `scoreWidth` | SVG width in viewBox units (world space). Shared by all clients. |
| `playheadX` | Playback position in world units. **This is what gets synced.** |
| `localRenderedWidth` | Actual pixel width of SVG on this client |
| `localScale` | `localRenderedWidth / scoreWidth` — computed per client |

---

## How It Works

```
Server broadcasts:  playheadX = 10000  (world units)

iPad (1024px tall viewport):
  SVG renders 8000px wide → localScale = 0.195
  screenX = 10000 × 0.195 = 1950px

Desktop (1200px tall viewport):
  SVG renders 9400px wide → localScale = 0.229
  screenX = 10000 × 0.229 = 2290px

Both show the SAME score content under the playhead.
```

---

## DOM Structure

```html
<div id="scoreContainer">      <!-- overflow:hidden, no native scroll -->
  <div id="scrollStage">       <!-- translated via transform -->
    <div id="scoreInner">
      <div class="oscilla-score-inner">
        <svg id="score">...</svg>  <!-- height:100vh, width:auto -->
      </div>
    </div>
  </div>
</div>
<div id="playhead">            <!-- fixed at 50% viewport -->
```

---

## Critical CSS Requirements

```css
#scoreContainer {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

#scrollStage {
  display: block;
  width: max-content;
  transform-origin: left top;
  will-change: transform;
}

#scoreInner {
  display: inline-block;
  width: max-content;
}

#scoreInner svg {
  display: block;
  width: auto;
  height: 100vh !important;
}
```

### ⚠️ CSS Pitfalls

| Problem | Cause | Symptom |
|---------|-------|---------|
| **SVG `position: absolute`** | Removes SVG from document flow | Parent containers collapse to 0 width, scale calculations may still work but layout breaks |
| **`transition` on transform** | Animates score movement | Visual lag, playhead appears offset during motion |
| **Missing `display: block` on SVG** | Inline element whitespace | Unexpected gaps, measurement errors |
| **`max-width` constraints** | Limits SVG sizing | Score doesn't scale correctly to viewport |

**Debug check**: All parent containers should have non-zero width:
```javascript
const svg = document.querySelector("#scoreInner svg");
const stage = document.getElementById("scrollStage");
const scoreInner = document.getElementById("scoreInner");

// ALL of these should equal the SVG width, NOT zero
console.log("svg:", svg.getBoundingClientRect().width);
console.log("scoreInner:", scoreInner.getBoundingClientRect().width);
console.log("scrollStage:", stage.getBoundingClientRect().width);
```

---

## Coordinate Extraction — CRITICAL

### The Problem

SVG elements can be positioned in many ways:
- `x`, `y` attributes
- `cx`, `cy` attributes (circles)
- `transform="translate(x, y)"`
- Nested inside transformed `<g>` groups
- `shape-inside` text flowing into shapes (Inkscape)
- Combinations of all the above

**`getBBox()` and `getCTM()` do NOT reliably give world coordinates** for complex elements like Inkscape text with `shape-inside`.

### ✅ Correct Method: Use `getBoundingClientRect()`

Always extract world coordinates by measuring actual rendered position:

```javascript
function getWorldX(element, svgElement) {
  const svgRect = svgElement.getBoundingClientRect();
  const elRect = element.getBoundingClientRect();
  
  // Screen position relative to SVG left edge
  const screenX = elRect.x - svgRect.x;
  
  // Convert to world coordinates
  const localScale = svgRect.width / window.scoreWidth;
  const worldX = screenX / localScale;
  
  return worldX;
}

function getWorldWidth(element, svgElement) {
  const svgRect = svgElement.getBoundingClientRect();
  const elRect = element.getBoundingClientRect();
  const localScale = svgRect.width / window.scoreWidth;
  return elRect.width / localScale;
}
```

### ❌ Incorrect Methods (DO NOT USE)

```javascript
// WRONG: getBBox returns local coordinates, CTM doesn't account for all transforms
const bbox = element.getBBox();
const matrix = element.getCTM();
let x = bbox.x + matrix.e;  // UNRELIABLE

// WRONG: Parsing transform attribute misses shape-inside offsets
const transform = element.getAttribute("transform");
const match = transform.match(/translate\(([\d.]+)/);  // INCOMPLETE

// WRONG: x attribute may not exist (text uses transform instead)
const x = element.x?.baseVal?.value;  // MAY BE UNDEFINED
```

### Why This Matters

Inkscape often creates text elements like:
```xml
<text id="rehearsal_A" 
      transform="translate(1764.35, 557.56)"
      style="shape-inside:url(#rect122346)">
  A
</text>
```

- The `transform` says X = 1764
- But `shape-inside` references a rect that adds more offset
- **Actual rendered X = 2032** (268 units different!)
- This error compounds: elements further right have larger errors

---

## Core Functions

### scrollToPlayheadVisual() — oscillaTransport.js

Converts world `playheadX` to screen position and applies transform:

```javascript
export function scrollToPlayheadVisual() {
  const container = window.scoreContainer;
  const stage = document.getElementById("scrollStage");
  const svg = stage?.querySelector("svg");
  if (!container || !stage || !svg || !window.scoreWidth) return;

  container.scrollLeft = 0;
  container.scrollTop = 0;

  const localRenderedWidth = svg.getBoundingClientRect().width;
  const localScale = localRenderedWidth / window.scoreWidth;
  
  window.localScale = localScale;
  window.localRenderedWidth = localRenderedWidth;

  const worldPx = window.playheadX * localScale;
  const viewportWidth = container.clientWidth;
  const halfViewport = viewportWidth / 2;
  
  let translateX = halfViewport - worldPx;
  
  // Clamp at edges...
  stage.style.transform = `translate3d(${translateX}px, 0, 0)`;
}
```

### extractScoreElements() — oscillaScoreSetup.js

Extracts cue and rehearsal mark positions. **Must use `getBoundingClientRect()`**:

```javascript
export const extractScoreElements = (svgElement) => {
  const svgRect = svgElement.getBoundingClientRect();
  const localScale = svgRect.width / window.scoreWidth;

  const elements = svgElement.querySelectorAll(
    "[id^='rehearsal_'], [id^='cue'], [id^='anchor-']"
  );

  elements.forEach((element) => {
    // CORRECT: Use getBoundingClientRect for true position
    const elRect = element.getBoundingClientRect();
    const screenX = elRect.x - svgRect.x;
    const absoluteX = screenX / localScale;
    const worldWidth = elRect.width / localScale;

    if (element.id.startsWith("rehearsal_")) {
      const id = element.id.replace("rehearsal_", "");
      newRehearsalMarks[id] = { x: absoluteX };
    } else if (element.id.startsWith("cue")) {
      newCues.push({ id: element.id, x: absoluteX, width: worldWidth });
    }
  });
};
```

---

## Server State — server.js

```javascript
let sharedState = {
  playheadX: 0,           // world units — the key sync value
  scoreWidth: null,       // world units — from SVG viewBox
  elapsedTime: 0,
  duration: null,
  isPlaying: false,
  speedMultiplier: 1.0,
  startTimestamp: null
};
```

Server broadcasts state at ~4Hz. Clients receive `playheadX` and convert to local pixels.

---

## File Reference

| File | Role |
|------|------|
| `oscillaTransport.js` | `scrollToPlayheadVisual()` — world→screen conversion, applies transform |
| `oscillaScoreSetup.js` | `extractScoreElements()` — extracts cue/rehearsal world positions |
| `oscillaSystemRAF.js` | Animation loop, drift correction |
| `app.js` | WebSocket sync handler |
| `server.js` | Broadcasts `playheadX` and `scoreWidth` to all clients |
| `styles.css` | SVG sizing (`height: 100vh`), container layout |

---

## Debugging

### Quick Health Check

```javascript
const svg = document.querySelector("#scoreInner svg");
const viewBox = svg.getAttribute("viewBox").split(" ").map(Number);

console.log("=== Sync Health Check ===");
console.log("ViewBox width:", viewBox[2]);
console.log("window.scoreWidth:", window.scoreWidth);
console.log("Match:", viewBox[2] === window.scoreWidth ? "✅" : "❌");

console.log("\nRendered width:", svg.getBoundingClientRect().width);
console.log("localScale:", window.localScale);

// Expected width from height
const expectedWidth = window.innerHeight * (viewBox[2] / viewBox[3]);
const actualWidth = svg.getBoundingClientRect().width;
console.log("Expected width:", expectedWidth);
console.log("Actual width:", actualWidth);
console.log("Match:", Math.abs(expectedWidth - actualWidth) < 1 ? "✅" : "❌");
```

### Test Rehearsal Mark Alignment

```javascript
function testRehearsalAlignment(markId) {
  const cueEl = document.getElementById('rehearsal_' + markId);
  const svg = document.querySelector("#scoreInner svg");
  const svgRect = svg.getBoundingClientRect();
  const cueRect = cueEl.getBoundingClientRect();
  
  // Get true world position
  const screenX = cueRect.x - svgRect.x;
  const actualWorldX = screenX / window.localScale;
  
  console.log(`=== Testing rehearsal_${markId} ===`);
  console.log("Actual world X:", actualWorldX);
  
  // Jump to it
  window.playheadX = actualWorldX;
  window.scrollToPlayheadVisual();
  
  // Verify alignment
  setTimeout(() => {
    const newCueRect = cueEl.getBoundingClientRect();
    const playheadEl = document.getElementById('playhead');
    const playheadRect = playheadEl.getBoundingClientRect();
    const diff = newCueRect.x - playheadRect.x;
    console.log("Alignment error (px):", diff);
    console.log("Aligned:", Math.abs(diff) < 5 ? "✅" : "❌");
  }, 100);
}

// Usage: testRehearsalAlignment('A');
```

### Common Issues

| Symptom | Likely Cause | Check |
|---------|--------------|-------|
| Playhead lands behind marks, error increases with position | Wrong coordinate extraction method | Using `getBBox()`/`getCTM()` instead of `getBoundingClientRect()` |
| Works on one device, broken on others | CSS affecting SVG sizing | Check SVG `position` is not `absolute` |
| Parent containers have 0 width | SVG removed from document flow | Check for `position: absolute/fixed` on SVG |
| Score jumps/jitters during playback | Transform transition CSS | Remove any `transition` on `#scrollStage` or `#score` |
| `scoreWidth` doesn't match viewBox | Server caching old value | Send `reset_project_state` when loading new score |

---

## Coordinate System Summary

```
WORLD SPACE (viewBox units)          SCREEN SPACE (pixels)
─────────────────────────────        ─────────────────────────
scoreWidth = 40000                   localRenderedWidth = 37539px
playheadX = 20000                    screenX = 20000 × 0.938 = 18769px

         localScale = localRenderedWidth / scoreWidth
                    = 37539 / 40000
                    = 0.938

World → Screen:  screenX = worldX × localScale
Screen → World:  worldX = screenX / localScale
```

**Golden Rule**: Always store and sync positions in **world coordinates**. Convert to screen coordinates only at render time.
