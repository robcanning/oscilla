---
title: Animation Observer
layout: docs_layout.njk
---

# Oscilla Animation Observer System

## Overview

Oscilla scores can contain dozens of concurrent animations (rotating arrows, scaling shapes, path-following objects, color cycles). Each one consumes CPU through anime.js updates, rAF loops, control plane publishing, and SVG style writes. The observer system **pauses offscreen animations** and **resumes them when they scroll back into view**, preserving resources without affecting the musical result.

**Core principle**: Work through `oscillaAnimRegistry`. Use `cfg._anim.pause()` / `cfg._anim.play()` as the universal interface. Never pause an animation that is feeding a modulation target.

---

## Key Terms

| Term | Definition |
|------|------------|
| `oscillaAnimRegistry` | Global object `{ uid → entry }` where every animation registers at parse time |
| `entry` | Registry record: `{ el, kind, cfg, trig, startFn, started, forceVisible }` |
| `cfg._anim` | Backend-specific animation instance stored on the cue config. Must expose `pause()` and `play()` |
| `_observerPaused` | Flag set on the registry entry when the observer has paused it. Prevents double-pause/resume |
| `ParamBus` | Global signal store. If an animation has subscribers on its signal prefix, it is a modulation source |

---

## What Gets Paused

| Animation Type | Backend | `cfg._anim` | Paused? |
|---------------|---------|-------------|---------|
| rotate continuous | anime.js | anime instance (has `.pause()` / `.play()`) | Yes |
| rotate sequence (smooth) | anime.js per step | anime instance | Yes (between steps too — flag checked before scheduling next) |
| rotate sequence (step) | setTimeout chain | timeout ID on `el._oscillaRotateAnim` | **No** — near-zero cost between steps |
| scale continuous | anime.js | anime instance | Yes |
| scale sequence | same as rotate | same | Same rules as rotate |
| o2p (forward/alternate) | anime.js | anime instance via `el._o2pAnim` | Yes |
| o2p (touch mode) | user-driven | `cfg._touchModeActive = true` | **No** — never auto-pause user interaction |
| color (hue cycling) | own rAF loop | `{ pause(), play() }` with time compensation | Yes |
| color (sequence) | own rAF loop | same, also compensates `segmentStartTime` | Yes |
| text | async token-based | own pause system (`pauseAllCueTexts`) | **No** — managed separately |
| video | HTML5 `<video>` | not in animation registry | **No** — managed by browser |

---

## What Is Never Paused

| Category | Reason | How Detected |
|----------|--------|--------------|
| **Modulation sources** | Animation is publishing signals that another cue subscribes to (e.g. o2p driving synth freq) | `ParamBus.hasSubscribers(prefix)` returns true |
| **Touch-mode o2p** | User is actively dragging a fader | `cfg._touchModeActive === true` |
| **Page overlay animations** | Overlay covers entire viewport, always visible | `entry.forceVisible === true` |
| **Unstarted playhead animations** | Nothing running yet, nothing to pause | `entry.trig === "playhead" && !entry.started` |
| **Animations without `cfg._anim`** | No instance to pause (not yet started, or uses timeout chain) | `!cfg._anim` |

---

## How It Works

### Signal Flow

```
                                    IntersectionObserver
                                           │
                                           ▼
                               ┌───────────────────────┐
                               │  oscillaAnimRegistry   │
                               │  { uid → entry }       │
                               └───────────┬───────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          │                │                │
                    shouldManage?    isModulationSource?   visible?
                          │                │                │
                          ▼                ▼                ▼
                    ┌──────────┐    ┌─────────────┐   ┌──────────┐
                    │ Skip if: │    │ ParamBus    │   │ Pause or │
                    │ touch    │    │ .hasSubs()  │   │ Resume   │
                    │ overlay  │    │ → skip if   │   │ via      │
                    │ no _anim │    │   true      │   │ cfg._anim│
                    └──────────┘    └─────────────┘   └──────────┘
```

### Pause/Resume Contract

Every animation handler that creates a running animation must set `cfg._anim` to an object with:

```javascript
cfg._anim = {
    pause() { /* stop the animation loop / anime instance */ },
    play()  { /* resume from where it left off */ }
};
```

This is the **only interface** the observer uses. Backend-specific logic stays in the handler modules.

### Backend Implementations

**anime.js** (rotate, scale, o2p continuous):
```javascript
// anime instances already have .pause() and .play()
const anim = anime({ targets: driver, ... });
cfg._anim = anim;
```

**Color rAF loop**:
```javascript
let _pauseTime = null;
cfg._anim = {
    pause() {
        cancelAnimationFrame(el._oscillaColorAnim);
        _pauseTime = performance.now();
    },
    play() {
        if (_pauseTime !== null) {
            // Shift time references forward by pause duration
            // so animation resumes where it left off
            const gap = performance.now() - _pauseTime;
            if (startTime) startTime += gap;
            if (segmentStartTime) segmentStartTime += gap;
            _pauseTime = null;
        }
        el._oscillaColorAnim = requestAnimationFrame(tick);
    }
};
```

The time compensation in `play()` is critical — without it, the color animation would jump ahead by the paused duration when it resumes.

---

## Modulation Protection

### The Problem

An o2p animation scrolls offscreen. Normally we'd pause it. But it's publishing `o2p:slider.t` every frame, and a synth cue has bound its frequency to that signal. Pausing the o2p would freeze the synth parameter.

### The Solution

Before pausing, the observer checks `ParamBus.hasSubscribers(prefix)`:

```javascript
function signalPrefix(kind, uid) {
    const source = kind.split("-")[0];  // "rotate-sequence" → "rotate"
    return `${source}:${uid}.`;
}

function isModulationSource(entry) {
    const prefix = signalPrefix(entry.kind, entry.uid);
    return hasSubscribers(prefix);      // from paramBus.js
}
```

`hasSubscribers()` checks both direct and wildcard subscribers:

```javascript
// Direct: "o2p:slider.t" has subscribers
// Wildcard: "o2p:*" or "o2p:slider." prefix matches

export function hasSubscribers(prefix) {
    for (const path of subscribers.keys()) {
        if (path.startsWith(prefix)) return true;
    }
    for (const wcPrefix of wildcardSubscribers.keys()) {
        if (prefix.startsWith(wcPrefix) || wcPrefix.startsWith(prefix)) return true;
    }
    return false;
}
```

This means: if **anything** is listening to signals from this animation, it keeps running.

---

## IntersectionObserver Setup

The observer uses the score container as its root so visibility is relative to the scrolling viewport, not the entire page:

```javascript
const rootContainer =
    document.getElementById("pageOverlay") ||
    document.getElementById("scoreContainer") ||
    null;

window.oscillaObserver = new IntersectionObserver(callback, {
    root: rootContainer,
    threshold: 0.01     // trigger when even 1% enters/exits
});
```

Elements are observed via their `data-anim-uid` attribute, which `registerAnimation()` sets on every animated element.

---

## Lifecycle

### 1. Registration (parse time)

`animationAssign()` parses SVG, calls handlers (rotate, scale, o2p, color). Each handler calls:

```javascript
registerAnimation(el, kind, cfg, startFn);
```

This adds to `oscillaAnimRegistry` and calls `window.refreshObserver()`.

### 2. Observer Initialization

`initializeObserver()` is called after all animations are registered. It:

1. Disconnects any previous observer
2. Creates a new `IntersectionObserver` with the score container as root
3. Iterates `oscillaAnimRegistry` and calls `.observe(el)` on each element

### 3. Runtime

As the score scrolls, the observer fires for entering/exiting elements:

- **Element enters viewport**: if `_observerPaused`, call `cfg._anim.play()`, clear flag
- **Element exits viewport**: if not paused and passes all skip checks, call `cfg._anim.pause()`, set `_observerPaused = true`

### 4. Manual Visibility Pass

After jumps, seeks, or page loads, call `window.checkAnimationVisibility()`. This does a synchronous scan of all registry entries using `getBoundingClientRect()` and applies the same pause/resume logic. Needed because `IntersectionObserver` is async and may not have fired yet after a position change.

---

## Integration Points

### Where to Call `initializeObserver()`

After `animationAssign()` completes, so all animations are registered:

```javascript
// In projectLoader.js or page.js, after score setup:
animationAssign(svgRoot);
initializeObserver();
```

Already imported in both files — just needs the call.

### Where `refreshObserver()` Is Called

From `registerAnimation()` in `animation.js`:

```javascript
if (window.refreshObserver) window.refreshObserver();
```

This reinitializes the observer when new animations are added at runtime (e.g. from playhead-triggered cues).

### Where `checkAnimationVisibility()` Should Be Called

- After `jumpToRehearsalMark()` or any seek operation
- After page transitions in page-nav mode
- After `scrollToPlayheadVisual()` on reconnect/resync

---

## File Reference

| File | Role |
|------|------|
| `oscillaObserver.js` | Observer setup, visibility callbacks, manual scan |
| `animation.js` | `registerAnimation()` — adds to registry, triggers `refreshObserver()` |
| `paramBus.js` | `hasSubscribers(prefix)` — checks for active modulation consumers |
| `rotate.js` | Sets `cfg._anim` to anime.js instance |
| `scale.js` | Sets `cfg._anim` to anime.js instance |
| `o2p.js` | Sets `cfg._anim` to anime.js instance, registers in `runningAnimations` Map |
| `color.js` | Sets `cfg._anim` to `{ pause(), play() }` with time compensation |
| `animShared.js` | Prestate/ghost lifecycle (no observer changes needed) |

---

## Debugging

### Quick Status Check

```javascript
// Count managed vs skipped animations
const reg = window.oscillaAnimRegistry;
let managed = 0, skipped = 0, paused = 0;

for (const uid in reg) {
    const e = reg[uid];
    if (!e.cfg?._anim) { skipped++; continue; }
    if (e.forceVisible || e.cfg._touchModeActive) { skipped++; continue; }
    managed++;
    if (e._observerPaused) paused++;
}

console.log(`Observer: ${managed} managed, ${paused} paused, ${skipped} skipped`);
```

### Check Modulation Protection

```javascript
// See which animations are protected from pausing
for (const uid in window.oscillaAnimRegistry) {
    const e = window.oscillaAnimRegistry[uid];
    const source = e.kind.split("-")[0];
    const prefix = `${source}:${uid}.`;
    const hasSubs = window.oscillaParamBus.hasSubscribers(prefix);
    if (hasSubs) {
        console.log(`PROTECTED: ${uid} (${e.kind}) — has subscribers on ${prefix}`);
    }
}
```

### Force Pause/Resume for Testing

```javascript
// Manually pause a specific animation
const entry = window.oscillaAnimRegistry["myRotateUid"];
entry.cfg._anim?.pause();
entry._observerPaused = true;

// Resume it
entry.cfg._anim?.play();
entry._observerPaused = false;
```

### Common Issues

| Symptom | Likely Cause | Check |
|---------|--------------|-------|
| Animation doesn't resume after scrolling back | `cfg._anim.play()` not implemented | Check handler sets `play()` on `cfg._anim` |
| Color animation jumps ahead on resume | Time compensation missing in `play()` | Verify `startTime += gap` logic in color.js |
| O2P not pausing when offscreen | `runningAnimations[uid]` used instead of `.set()` | Must use `Map.set()` — bracket notation is a no-op on Map |
| Synth parameter freezes when animation scrolls off | Animation paused despite active modulation | Check `hasSubscribers()` finds the subscriber path |
| Observer not working at all | `initializeObserver()` never called | Verify it's invoked after `animationAssign()` |
| Animations pause but score container is wrong root | Page overlay present but not detected | Check `pageOverlay` element exists when expected |

---

## Adding Observer Support to a New Cue Type

When creating a new animation cue handler, ensure it follows the contract:

### 1. Register the Animation

```javascript
import { registerAnimation } from "./animation.js";

registerAnimation(el, "myNewKind", cfg, startFn);
```

### 2. Set `cfg._anim` When the Animation Starts

For anime.js-based animations:
```javascript
const anim = anime({ targets: ..., ... });
cfg._anim = anim;  // anime already has .pause() and .play()
```

For custom rAF loops:
```javascript
let _pauseTime = null;
cfg._anim = {
    pause() {
        cancelAnimationFrame(el._myAnimFrame);
        _pauseTime = performance.now();
    },
    play() {
        if (_pauseTime !== null) {
            const gap = performance.now() - _pauseTime;
            if (startTime) startTime += gap;
            _pauseTime = null;
        }
        el._myAnimFrame = requestAnimationFrame(tick);
    }
};
```

### 3. Publish Signals (if applicable)

If your animation publishes to ParamBus, it will automatically be protected from pausing when something subscribes:

```javascript
import { publish } from '../control/paramBinding.js';

// In your update loop:
publish("myNewKind", cfg.uid, { value: currentValue });
```

The observer checks `hasSubscribers("myNewKind:uid.")` — no additional wiring needed.

### 4. That's It

No changes needed to `oscillaObserver.js`. The observer discovers animations through the registry and manages them through `cfg._anim`.
