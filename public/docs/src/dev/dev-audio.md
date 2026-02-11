---
title: Audio System Architecture
layout: docs_layout.njk
---

# Audio System -- Developer Guide

Internal architecture of Oscilla's audio cue system. Covers module layout, data flow, pool selection, waveform rendering, and integration points.

---

## Module Layout

The audio system lives in `js/cues/audio/` as four modules behind a barrel re-export:

```
js/cues/audio/
  index.js          -- barrel re-exports all public APIs
  audioShared.js    -- shared state, utilities, overlay system
  audioFile.js      -- single-file playback engine (handleAudioCue)
  audioPool.js      -- folder-based pool selection + playback
  audioImpulse.js   -- stochastic repeating process
```

### Dependency Graph

```
audioShared.js          (no internal deps)
     ^
     |
audioFile.js            (imports audioShared)
     ^
     |
audioPool.js            (imports audioShared, audioFile, waveform)
audioImpulse.js         (imports audioShared, audioFile, audioPool.ensureAudioPool, waveform)
```

No circular dependencies. `audioShared` is the leaf; `audioFile` depends only on it; pool and impulse depend on both.

### Barrel Exports (index.js)

All external consumers import from `audio/index.js`. The barrel exports:

**From audioShared:**
`sharedAudioCtx`, `audioBufferCache`, `audioLastHit`, `activeAudioCues`, `generateToneBuffer`, `sendAudioOscTrigger`, `createAudioOverlay`, `evalMaybeRandom`, `selectFromPool`

**From audioFile:**
`handleAudioCue`, `handleAudioStopCue`, `stopAllAudio`, `primeAudioOverlay`, `primeWaveform`

**From audioPool:**
`ensureAudioPool`, `handleAudioPoolCue`, `primeAudioPoolOverlay`, `primePoolWaveform`

**From audioImpulse:**
`handleAudioImpulseCue`, `checkImpulseRegions`, `stopAudioImpulse`, `stopAllAudioImpulses`, `primeAudioImpulseOverlay`, `primeImpulseWaveform`

---

## Shared State (audioShared.js)

### Singletons

| Name | Type | Description |
|------|------|-------------|
| `sharedAudioCtx` | `AudioContext` | Single Web Audio context, shared across all audio |
| `audioBufferCache` | `Map<string, AudioBuffer>` | Decoded buffer cache keyed by filename |
| `audioLastHit` | `Map` | Debounce tracking per cue |
| `activeAudioCues` | `Set` | Currently playing UIDs |

All are attached to `window` for cross-module access when needed.

### selectFromPool(pool)

Shared selection logic used by both audioPool and audioImpulse. Takes a pool object `{ files, mode, cursor }` and returns a filename string.

**Modes:**

| Mode | Logic |
|------|-------|
| `rand` | `Math.random()` index into files array |
| `shuffle` | Advance cursor, reshuffle when exhausted |
| `sequential` | Advance cursor, wrap at end (no reshuffle) |

Mutates `pool.cursor` and `pool.files` (on reshuffle). The pool object is cached by uid in `audioPools` (a Map in audioPool.js), so the cursor persists across triggers.

### evalMaybeRandom(v)

Evaluates DSL random expressions. Handles `{ type: "rand", min, max }`, `{ type: "irand", min, max }`, and `{ type: "funcCall", name: "rand", args: [min, max] }` objects. Returns the value unchanged if it is already a plain number.

---

## Audio File Engine (audioFile.js)

### handleAudioCue(ast, cueElement?)

Core playback function. Decodes the audio buffer (with caching), creates Web Audio nodes (source, gain, panner), handles fade envelopes, and manages the `activeAudioCues` set.

**Waveform integration:** if `cueElement` is provided and `waveform` is not `none`, renders a waveform and starts a cursor.

**Buffer cache:** keyed by filename string. Shared with pool and impulse priming.

**File resolution:** tries project path first (`resolveProjectPath("audio", filename)`), falls back to shared path (`${window.sharedDir}audio/${filename}`).

### primeWaveform(ast, cueElement)

Called during `assignCues` for `cueAudio` elements. Fetches and decodes the audio buffer, then calls `renderWaveform()` to draw the waveform shape at score load time. The handle is reused when `handleAudioCue` fires later.

---

## Pool Engine (audioPool.js)

### ensureAudioPool(uid, params)

Fetches the file list from the server API (`/api/audio-list/{project}/{path}`) and caches it. Returns a pool object `{ files, mode, cursor }`.

### handleAudioPoolCue(ast, el, opts?)

Selects a file via `selectFromPool(pool)`, evaluates randomisable params, builds a cue object, and delegates to `handleAudioCue()`. After playback starts, updates the waveform peaks to show the selected file and starts a cursor.

### primePoolWaveform(ast, cueElement)

Called during `assignCues`. Fetches the pool, decodes the first file's buffer, and renders an initial waveform. On trigger, `updatePeaks()` swaps the waveform shape to whichever file was selected.

---

## Impulse Engine (audioImpulse.js)

### handleAudioImpulseCue(ast, el, opts?)

Entry point. Sets up a state object in the `audioImpulses` Map and starts the scheduling loop.

### Scheduling

`scheduleNextImpulse(state)` computes the next interval from `rate` and `jitter`, then sets a `setTimeout` that calls `playImpulseHit(state)` and recurses.

**Interval formula:** `base = 60 / rate` (seconds). Jitter applies: `min = base * (1 - jitter)`, `max = base * (1 + jitter)`, result uniformly distributed in that range.

### playImpulseHit(state)

Selects a file via `selectFromPool(pool)`, applies per-hit randomisation (panRandom, pitchRandom), enforces the poly voice cap, and delegates to `handleAudioCue()`. After playback, adds a sub-cursor to the waveform and schedules auto-removal.

### Poly Cap Enforcement

Two-layer cap, both checked before firing:

1. **Voice cap:** counts entries in `window.activeAudioCues` matching `uid` or `uid__*`. Skips the hit if at limit.
2. **Cursor cap:** evicts the oldest cursor from `wfHandle._cursors` when at the poly limit.

### Region Lifetime

`checkImpulseRegions()` runs every RAF frame. For each active impulse with `lifetime:region`, it checks whether the playhead is still inside the cue element's bounding box. A grace period (15 ticks, 50px tolerance) prevents false exits from sub-pixel jitter. Exit triggers `stopAudioImpulse(uid)`.

### Multi-Cursor Waveforms

A single waveform is rendered once per impulse element. Each hit adds a red sub-cursor via `addCursor()` that independently tracks its playback position. Cursors auto-remove via `setTimeout` when the hit duration expires. `removeAllCursors()` cleans up on stop.

### Retrigger Safety

When an impulse is stopped and retriggered (e.g. after rewind), the old state is deleted immediately from `audioImpulses`. Delayed cleanup closures capture the old state object and check `getWaveform(uid) === handle` before destroying, preventing clobbering of the new instance's waveform.

---

## Waveform System (js/system/waveform.js)

### renderWaveform(svg, target, buffer, uid, filename, opts)

Extracts peaks from the audio buffer, builds SVG polylines (upper + lower contour) and a cursor line, inserts them into the target element. Returns a handle object.

**Deduplication:** if a waveform already exists for the uid, returns the existing handle. If the filename has changed (pool switching), calls `updatePeaks()` automatically.

**Target resolution:** `self` resolves to the cue element itself. A string id resolves to another SVG element. For `<g>` targets, the waveform is appended as a child. For shape elements (`<rect>`, `<circle>`), it is inserted as a sibling with a MutationObserver mirroring transforms.

### updatePeaks(handle, buffer, filename)

Redraws the upper and lower polylines for a different audio buffer. Used by audioPool when switching files.

### Multi-Cursor API

| Function | Description |
|----------|-------------|
| `addCursor(handle, cursorId, opts)` | Create an independent sub-cursor within a waveform group |
| `removeCursor(handle, cursorId)` | Remove a specific sub-cursor |
| `removeAllCursors(handle)` | Clear all sub-cursors |

Sub-cursors are stored in `handle._cursors` (a Map). Each has its own RAF loop for independent tracking. Red line, 0.8px width, 0.45 opacity.

### startCursor / resetCursor

`startCursor(handle, audioCtx, startTime, duration, pitch)` starts the main cursor animation. `resetCursor(handle)` stops animation and returns the cursor to position zero.

---

## Integration Points

### cueDispatcher.js -- assignCues

During score scanning, each audio cue element is primed:

```
cueAudio      -> primeAudioOverlay(), primeWaveform()
cueAudioPool  -> primeAudioPoolOverlay(), primePoolWaveform()
cueAudioImpulse -> primeAudioImpulseOverlay(), primeImpulseWaveform()
```

After the cue is pushed to the cues array, any `pin:N` parameter triggers `registerPin(child, N)`.

### cueDispatcher.js -- handleCueTrigger

Routes to the appropriate handler based on `ast.type`:

```
cueAudio      -> handleAudioCue(ast, element)
cueAudioPool  -> handleAudioPoolCue(ast, element)
cueAudioImpulse -> handleAudioImpulseCue(ast, element)
```

### RAF.js -- Tick Pipeline

`checkImpulseRegions()` runs every frame to monitor region-lifetime impulses.

### oscillaTransport.js -- rewindToStart

Calls `clearAllPins()` alongside other cleanup (`resetAllFadePriming`, `dismissAllStopwatchOverlays`).

---

## Adding a New Audio Feature

When extending the audio system:

1. Add shared utilities to `audioShared.js`
2. Add handler logic to the appropriate module (audioFile, audioPool, or audioImpulse)
3. Export from the module with the `export` keyword
4. Re-export from `index.js` barrel
5. Import in `cueDispatcher.js` from `audio/index.js`

Always add `export` to functions that are re-exported from the barrel. This has been a recurring source of bugs.

---

## OSC Flow

```
audioPool/audioImpulse handler
  -> sendOSC({ type: "osc_audio_pool" | "osc_audio_impulse", ... })
    -> WebSocket to server.js
      -> server.js switch case
        -> osc-js UDP send to configured OSC port
```

Arguments: `filename (string)`, `amp`, `pan`, `pitch`, `fadeIn`, `fadeOut` (all floats).

Custom addresses via `oscaddr` are prefixed with `/oscilla/`.
