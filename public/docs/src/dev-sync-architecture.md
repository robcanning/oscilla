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
      <svg>...</svg>           <!-- height:100vh, width:auto -->
    </div>
  </div>
</div>
<div id="playhead">            <!-- fixed at 50% viewport -->
```

---

## Core Functions

### scrollToPlayheadVisual() — oscillaTransport.js

The main sync function. Measures local SVG width and applies transform:

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
  const pad = container.clientWidth / 2;
  const translateX = pad - worldPx;

  stage.style.transform = `translate3d(${translateX}px, 0, 0)`;
}
```

### Sync Message Handler — app.js

Receives server state, stores world values, triggers visual update:

```javascript
case "sync": {
  window.scoreWidth = state.scoreWidth;
  window.duration = state.duration;
  window.elapsedTime = state.elapsedTime;
  window.isPlaying = state.isPlaying;
  window.serverSyncPlayheadX = state.playheadX;
  
  scrollToPlayheadVisual();
}
```

### Animation Loop — app.js

Advances playhead locally, applies drift correction, updates visual:

```javascript
window.animate = (currentTime) => {
  // Advance playhead in world units
  window.playheadX += (dt * speedMultiplier / duration) * scoreWidth;
  
  // Drift correction against server
  if (window.serverSyncPlayheadX != null) {
    const drift = window.serverSyncPlayheadX - window.playheadX;
    if (Math.abs(drift) > scoreWidth * 0.05) {
      window.playheadX = window.serverSyncPlayheadX; // snap
    } else {
      window.playheadX += drift * 1.3 * dt; // smooth
    }
  }
  
  scrollToPlayheadVisual();
  requestAnimationFrame(window.animate);
};
```

---

## Critical CSS

```css
#scoreContainer {
  position: fixed;
  inset: 0;
  overflow: hidden;
}

#scrollStage {
  width: max-content;
  transform-origin: left top;
  will-change: transform;
}

#scoreInner {
  display: inline-block;
  width: max-content;
}

#scoreInner svg {
  width: auto;
  height: 100vh !important;
}
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
| `oscillaTransport.js` | `scrollToPlayheadVisual()` — computes local scale, applies transform |
| `app.js` | Sync handler, animation loop, drift correction |
| `server.js` | Broadcasts `playheadX` and `scoreWidth` to all clients |
| `styles.css` | SVG sizing (`height: 100vh`), transform properties |

---

## Debugging

```javascript
// Run in console on each client:
console.log("scoreWidth:", window.scoreWidth);           // should match
console.log("playheadX:", window.playheadX);             // should be close
console.log("localScale:", window.localScale);           // will differ (OK)
console.log("localRenderedWidth:", window.localRenderedWidth); // will differ (OK)
```

| Symptom | Check |
|---------|-------|
| Playheads offset | `scoreWidth` same on all clients? |
| Transform not applied | `localRenderedWidth > 0`? |
| Playhead jumps | `serverSyncPlayheadX` valid? |
