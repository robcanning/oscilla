# Oscilla Multi-Client Visual Synchronization Architecture

## Overview

Oscilla is a real-time SVG score performance environment where multiple clients (musicians, performers) view and interact with a shared scrolling musical score. The system ensures that all clients see the playhead over **exactly the same point** in the SVG score regardless of their screen size, resolution, or device type.

This document explains the synchronization model that achieves tight visual lock across heterogeneous displays.

---

## Core Problem

Different devices have different screen widths, pixel densities, and aspect ratios. Without careful coordination:

- A phone at 390px wide would scroll at a different visual rate than a desktop at 1920px
- Rounding errors and frame timing differences would accumulate over time ("drift")
- Jump/seek operations would land at different visual positions
- Late-joining clients would be out of sync

**Solution**: Lock all clients to a **canonical rendered width** established by the first connecting client, and use **transform-based positioning** instead of native scroll.

---

## Key Concepts

### World Space vs Screen Space

| Term | Definition |
|------|------------|
| **scoreWidth** | The SVG's horizontal extent in viewBox units (world coordinates). Example: `40960` |
| **playheadX** | The playback position in world units. Range: `0` to `scoreWidth` |
| **canonicalRenderedWidth** | The pixel width reported by the first client that loads the score |
| **canonicalScale** | Conversion factor: `canonicalRenderedWidth / scoreWidth` |

### The Canonical Scale Model

```
canonicalScale = canonicalRenderedWidth / scoreWidth
```

- The **first client** to connect reports its rendered pixel width
- The **server stores** this as the canonical display width for the session
- **All subsequent clients** use this exact scale, regardless of their actual viewport
- No client rescales the score based on its own viewport—this prevents desync

### Transform-Based Positioning

Instead of using native `scrollLeft` (which has rounding, momentum, and event-driven behavior), the score is positioned using GPU-accelerated CSS transforms:

```javascript
screenX = playheadX * canonicalScale
translateX = (viewportWidth / 2) - screenX
scrollStage.style.transform = `translate3d(${translateX}px, 0, 0)`
```

This means:
- All clients display the **same absolute score content** at the playhead position
- Different screen shapes only affect how much context is visible to the left/right
- No accumulation of drift, rounding error, or FPS timing differences
- Jump operations and late joins remain perfectly synchronized

---

## DOM Structure

```html
<div id="scoreContainer">      <!-- Fixed viewport, overflow:hidden -->
  <div id="scrollStage">       <!-- Translated horizontally via transform -->
    <div id="scoreInner">      <!-- Contains the SVG, sized to canonicalRenderedWidth -->
      <svg>...</svg>
    </div>
  </div>
</div>
<div id="playhead">            <!-- Fixed at viewport center (50%) -->
```

### CSS Rules (Critical)

```css
#scoreContainer {
  position: fixed;
  inset: 0;
  overflow: hidden;
  overflow-x: hidden !important;  /* Disable native scroll */
}

#scrollStage {
  display: block;
  width: max-content;
  height: 100%;
  transform-origin: left top;
  will-change: transform;
  padding-left: 0 !important;  /* Virtual padding via translate, not CSS */
}

#scoreInner {
  display: inline-block;
  height: 100%;
  /* Width set programmatically to canonicalRenderedWidth */
}

#playhead {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  /* Centered in viewport—score moves behind it */
}
```

---

## Server-Side State Management

### Shared State Object (server.js)

```javascript
let sharedState = {
  elapsedTime: 0,              // Playback time in milliseconds
  isPlaying: false,
  playheadX: 0,                // Position in world units
  duration: null,              // Score duration in ms
  speedMultiplier: 1.0,
  startTimestamp: null,        // Server's performance.now() timebase
  scoreWidth: null,            // World width (from SVG viewBox)
  canonicalRenderedWidth: null // Pixel width (from first client)
};

// Per-project storage
let canonicalRenderedWidthByProject = {};
let scoreWidthByProject = {};
let durationByProject = {};
```

### Message Types

| Type | Direction | Purpose |
|------|-----------|---------|
| `score_meta` | Client → Server | First client reports `scoreWidth`, `renderedWidth`, `duration` |
| `sync` | Server → All | Broadcasts authoritative state at ~4Hz |
| `play` | Client → Server | Start playback |
| `pause` | Client → Server | Pause playback |
| `jump` | Client ↔ Server | Seek to position (server echoes to other clients) |

### First-Client Authority

When a client sends `score_meta`:

```javascript
case "score_meta": {
  const { project, scoreWidth, renderedWidth, duration } = data;
  
  // Only set if not already stored for this project
  if (!scoreWidthByProject[project] && scoreWidth > 0) {
    scoreWidthByProject[project] = scoreWidth;
  }
  
  if (!canonicalRenderedWidthByProject[project] && renderedWidth > 0) {
    canonicalRenderedWidthByProject[project] = renderedWidth;
  }
  
  // Update shared state
  sharedState.scoreWidth = scoreWidthByProject[project];
  sharedState.canonicalRenderedWidth = canonicalRenderedWidthByProject[project];
  
  broadcastState();
}
```

---

## Client-Side Synchronization

### Receiving Sync Messages (app.js)

```javascript
case "sync": {
  const state = data.state;
  
  // Store server's width measurements
  window.scoreWidth = state.scoreWidth;
  
  if (state.canonicalRenderedWidth) {
    window.canonicalRenderedWidth = state.canonicalRenderedWidth;
    window.canonicalScale = state.canonicalRenderedWidth / window.scoreWidth;
    
    // Force scoreInner and scrollStage to canonical size
    const inner = document.getElementById("scoreInner");
    const stage = document.getElementById("scrollStage");
    if (inner) inner.style.width = `${state.canonicalRenderedWidth}px`;
    if (stage) stage.style.width = `${state.canonicalRenderedWidth}px`;
  }
  
  // Accept server's playhead position
  if (state.playheadX !== undefined) {
    window.serverSyncPlayheadX = state.playheadX;
  }
  
  scrollToPlayheadVisual();
}
```

### Visual Positioning (oscillaTransport.js)

```javascript
export function scrollToPlayheadVisual() {
  const container = window.scoreContainer;
  const stage = document.getElementById("scrollStage");
  if (!container || !stage || !window.canonicalScale) return;
  
  // Kill any native scroll
  container.scrollLeft = 0;
  container.scrollTop = 0;
  
  // Convert world position to pixels
  const worldPx = window.playheadX * window.canonicalScale;
  
  // Create virtual padding on left so playhead can be centered at score start
  const pad = container.clientWidth / 2;
  
  // Translate stage so playheadX aligns with viewport center
  const translateX = pad - worldPx;
  
  stage.style.transform = `translate3d(${translateX}px, 0, 0)`;
}
```

### Animation Loop (app.js)

```javascript
window.animate = async (currentTime) => {
  if (window.isSeeking) return;
  
  let dt = window.lastAnimationFrameTime !== null
    ? (currentTime - window.lastAnimationFrameTime) / 1000 : 0;
  window.lastAnimationFrameTime = currentTime;
  
  const refWidth = window.remoteScoreWidth || window.scoreWidth;
  
  if (window.isPlaying && dt > 0 && refWidth && window.duration) {
    // Advance playhead locally based on dt and speed
    const effectiveDeltaMs = dt * 1000 * (window.speedMultiplier || 1);
    window.playheadX = Math.min(
      window.playheadX + (effectiveDeltaMs / window.duration) * refWidth,
      refWidth
    );
    
    // Drift correction against server sync
    if (window.serverSyncPlayheadX != null) {
      const drift = window.serverSyncPlayheadX - window.playheadX;
      if (Math.abs(drift) > refWidth * 0.05) {
        // Large drift: snap immediately
        window.playheadX = window.serverSyncPlayheadX;
      } else {
        // Small drift: smooth correction
        window.playheadX += drift * 1.3 * dt;
      }
    }
    
    scrollToPlayheadVisual();
  }
  
  window.animationFrameId = requestAnimationFrame(window.animate);
};
```

---

## Preventing Desync

### Native Scroll Disabled

```javascript
// In initializeSVG (app.js)
container.style.overflow = "hidden";

// Block all scroll-inducing events
["wheel", "touchmove", "gesturestart", "gesturechange", "gestureend"]
  .forEach(ev => container.addEventListener(ev, e => {
    e.preventDefault();
    e.stopPropagation();
  }, { passive: false }));

// Force scroll position to zero if it drifts
container.addEventListener("scroll", () => {
  if (container.scrollLeft !== 0 || container.scrollTop !== 0) {
    container.scrollLeft = 0;
    container.scrollTop = 0;
  }
}, { passive: true });
```

### Synchronized Jump Operations

When a client seeks:

```javascript
// Client sends jump
window.socket.send(JSON.stringify({
  type: 'jump',
  playheadX: window.playheadX,
  elapsedTime: window.elapsedTime
}));

// Ignore echo of our own jump
window.ignoreNextSync = true;
window.recentlyRecalculatedPlayhead = true;
setTimeout(() => { window.recentlyRecalculatedPlayhead = false; }, 500);
```

Server broadcasts to **other** clients:

```javascript
case "jump": {
  sharedState.playheadX = data.playheadX;
  sharedState.elapsedTime = data.elapsedTime;
  
  // Retarget clock if playing
  if (sharedState.isPlaying) {
    sharedState.startTimestamp = retargetStartTimestampFromElapsed(
      performance.now(),
      sharedState.elapsedTime,
      sharedState.speedMultiplier
    );
  }
  
  // Broadcast to OTHER clients only
  wss.clients.forEach(client => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: "jump",
        playheadX: sharedState.playheadX,
        elapsedTime: sharedState.elapsedTime
      }));
    }
  });
}
```

---

## Transport Clock Synchronization

### Server-Authoritative Timebase

The server maintains a `startTimestamp` in its `performance.now()` space:

```javascript
const updateElapsedTime = () => {
  if (!sharedState.isPlaying || sharedState.startTimestamp == null) return;
  
  const now = performance.now();
  const wallSeconds = Math.max(0, (now - sharedState.startTimestamp) / 1000);
  
  // Apply speed multiplier, clamp to duration
  const newElapsed = Math.min(
    wallSeconds * (sharedState.speedMultiplier || 1),
    sharedState.duration / 1000
  );
  
  sharedState.elapsedTime = newElapsed * 1000;
  
  // Keep playheadX in sync
  if (sharedState.scoreWidth > 0) {
    sharedState.playheadX = 
      (sharedState.elapsedTime / sharedState.duration) * sharedState.scoreWidth;
  }
};
```

### Speed Changes

When speed multiplier changes during playback:

```javascript
case "set_speed_multiplier": {
  if (sharedState.isPlaying && sharedState.startTimestamp != null) {
    const now = performance.now();
    const wallSeconds = (now - sharedState.startTimestamp) / 1000;
    const currentElapsedMs = wallSeconds * oldMul * 1000;
    
    // Retarget: new startTimestamp preserves current position
    sharedState.startTimestamp = now - (currentElapsedMs / newMul);
  }
  
  sharedState.speedMultiplier = newMul;
  broadcastState();
}
```

---

## Why Resizing Breaks Sync (and Potential Fixes)

### Current Limitation

If CSS allows the score to resize to fit the viewport:
- Different clients get different `renderedWidth` values
- `canonicalScale` varies between clients
- Same `playheadX` maps to different visual positions

### The Core Issue

The commit message states:
> "Lock canonical scoreWidth and canonicalRenderedWidth to first connecting client"

This works when all clients render at the same pixel size. But if the score visually scales to fit the viewport, the visual relationship breaks.

### Potential Approaches for Responsive Sync

**Option A: Normalize to Percentage**
Instead of pixel positions, sync a normalized position (0-1) and let each client compute its own pixel position:

```javascript
// Send
const normalizedX = playheadX / scoreWidth;

// Receive
playheadX = normalizedX * localRenderedWidth;
```

**Pros**: Works with any screen size  
**Cons**: Different clients see different amounts of content under the playhead

**Option B: Viewport-Relative Playhead**
Keep the playhead fixed and ensure clients compute offset from their own center:

```javascript
translateX = (localViewportWidth / 2) - (playheadX * localScale);
```

Where `localScale = localRenderedWidth / scoreWidth`.

**Pros**: Each client uses its own scale  
**Cons**: Requires all clients to report their scale, more complex

**Option C: Hybrid—Lock Content Under Playhead**
The critical constraint is that **the same score content** must be visible at the playhead. This can be achieved by:

1. Storing a **content-relative position** (world units only)
2. Each client computes its own visual position based on its local scale
3. The playhead remains fixed at viewport center on all clients

This is essentially what the current system does, but the CSS must not force the SVG to a different intrinsic size.

---

## Debugging Checklist

1. **Is canonicalRenderedWidth set?**
   - Check server logs: `[SERVER] 🎯 canonicalRenderedWidth set for {project}`
   - First client must load before others

2. **Are widths being applied?**
   - `#scoreInner` and `#scrollStage` should have `style.width = canonicalRenderedWidth + "px"`

3. **Is native scroll disabled?**
   - `container.scrollLeft` should always be `0`
   - No scroll events should fire

4. **Is transform being applied?**
   - `#scrollStage` should have `transform: translate3d(Xpx, 0, 0)`

5. **Is drift correction working?**
   - `window.serverSyncPlayheadX` should be close to `window.playheadX`
   - Large drifts (>5%) should snap; small drifts should smooth

6. **Is the project state fresh?**
   - Call `reset_project_state` when reloading a project to clear cached widths

---

## File Reference

| File | Responsibility |
|------|----------------|
| `server.js` | WebSocket server, shared state, broadcast, project width storage |
| `app.js` | Client entry, sync message handling, animation loop, DOM setup |
| `oscillaTransport.js` | `scrollToPlayheadVisual()`, transport controls (play/pause/seek), keyboard handlers |
| `styles.css` | Layout rules for `#scoreContainer`, `#scrollStage`, `#scoreInner`, `#playhead` |
| `index.html` | DOM structure |
| `projectLoader.js` | Project loading (not shown but referenced) |
| `scoreSetup.js` | SVG initialization and measurement |

---

## Summary

The Oscilla sync model achieves cross-device visual lock by:

1. **Locking to first-client dimensions** — `canonicalRenderedWidth` becomes session authority
2. **Using world coordinates** — `playheadX` is always in SVG viewBox units
3. **Transform-only positioning** — no native scroll, pure CSS `translate3d`
4. **Server-authoritative time** — `startTimestamp` + speed multiplier = deterministic position
5. **Drift correction** — clients smooth toward server's `playheadX`
6. **Disabling native scroll** — prevents momentum, events, and rounding errors

The result is stable, resolution-independent, zero-drift visual synchronization where the playhead is always over the same score content on all connected clients.
