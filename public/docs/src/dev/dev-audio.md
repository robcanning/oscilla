---
title: Audio System Architecture
layout: docs_layout.njk
---

# Audio System -- Developer Guide

Internal architecture of Oscilla's audio cue system. Covers module layout, data flow, pool selection, waveform rendering, live update, reverse playback, and integration points.

---

## Module Layout

The audio system lives in `js/cues/audio/` as four modules behind a barrel re-export:

```
js/cues/audio/
  index.js          -- barrel re-exports all public APIs
  audioShared.js    -- shared state, utilities, overlay system, buffer reversal
  audioFile.js      -- single-file playback engine (handleAudioCue, live update)
  audioPool.js      -- folder-based pool selection + playback
  audioImpulse.js   -- stochastic repeating process
```

### Dependency Graph

```
audioShared.js          (no internal deps)
     ^
     |
audioFile.js            (imports audioShared, waveform)
     ^
     |
audioPool.js            (imports audioShared, audioFile, waveform)
audioImpulse.js         (imports audioShared, audioFile, audioPool.ensureAudioPool, waveform)
```

No circular dependencies. `audioShared` is the leaf; `audioFile` depends only on it; pool and impulse depend on both.

### Barrel Exports (index.js)

All external consumers import from `audio/index.js`. The barrel exports:

**From audioShared:**
`sharedAudioCtx`, `audioBufferCache`, `audioLastHit`, `activeAudioCues`, `generateToneBuffer`, `getReversedBuffer`, `sendAudioOscTrigger`, `createAudioOverlay`, `evalMaybeRandom`, `selectFromPool`

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
| `activeAudioCues` | `Map<string, voice>` | Currently playing voices keyed by uid/playUid |

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

### getReversedBuffer(ctx, buf, cacheKey)

Creates a sample-reversed copy of an AudioBuffer. Used for reverse playback since Web Audio API does not support negative `playbackRate`. Returns a new buffer with all channels reversed sample-by-sample.

Results are cached in `reversedBufferCache` (a module-level Map) keyed by `${filename}__rev`, so the reversal only happens once per file. Shared by audioFile, audioPool, and audioImpulse.

---

## Audio File Engine (audioFile.js)

### handleAudioCue(ast, cueElement?)

Core playback function. Decodes the audio buffer (with caching), creates Web Audio nodes (source, gain, panner), handles fade envelopes, and manages the `activeAudioCues` map.

**Retrigger path:** if a voice with the same uid is already playing and has an `update()` method, calls `update(params)` instead of stopping and restarting. This is the basis for live console hot-update.

**Waveform integration:** if `cueElement` is provided and `waveform` is not `none`, renders a waveform and starts a cursor. If no cueElement but a waveform exists for the uid (via `getWaveform(uid)`), reconnects to it.

**Buffer cache:** keyed by filename string. Shared with pool and impulse priming.

**File resolution:** tries project path first (`resolveProjectPath("audio", filename)`), falls back to shared path (`${window.sharedDir}audio/${filename}`).

### Live Parameter State

Each looping voice creates a mutable `live` object:

```js
const live = { amp, speed, pan, fadeIn, fadeOut, buf, filename, in, out };
```

`playOne` reads fresh values from `live` on each loop iteration, so deferred changes take effect on the next loop. The `update(params)` method writes to `live` and applies immediate ramps to running nodes.

### update(params)

Called when retrigger detects an existing voice. Splits params into immediate and deferred:

**Immediate (50ms ramp):**

| Param | Action |
|-------|--------|
| `amp` | `gainNode.gain.linearRampToValueAtTime` |
| `pan` | `panNode.pan.linearRampToValueAtTime` (creates StereoPannerNode on the fly if needed) |
| `speed` (same direction) | `srcNode.playbackRate.linearRampToValueAtTime(abs(speed))` |

**Deferred (stored in `live`, read by next `playOne`):**

| Param | Action |
|-------|--------|
| `fadeIn`, `fadeOut` | New envelope on next BufferSource |
| `in`, `out` | New segment boundaries for `srcNode.start(when, offset, duration)` |
| `src` | Async fetch + decode; swaps `live.buf` and `live.filename` when ready |
| `speed` (direction change) | Buffer swap between forward/reversed copy on next loop |
| `loop` | Updates `remaining` counter (see Loop Control) |

### Loop Control

The `remaining` counter tracks how many iterations are left:

| `loop` value | `remaining` set to |
|--------------|--------------------|
| `0` | `Infinity` (infinite) |
| `1` | `1` (finish after current) |
| `N` | `N` (N more iterations) |

`onended` decrements `remaining` and calls `playOne(false)` if > 0. On the final iteration (`remaining === 1`), `playOne` schedules a fadeOut. Setting `loop:0` via live update switches `remaining` back to `Infinity`.

### Reverse Playback

When `speed < 0`, `playOne` calls `getReversedBuffer(ctx, live.buf, live.filename + "__rev")` and sets `srcNode.playbackRate.value = abs(speed)`. The reversed buffer is cached so subsequent loops reuse it.

In/out offsets are flipped for the reversed buffer: `startOffset = buf.duration - endPoint`.

Before starting the cursor, `setWaveformDirection(wfHandle, true)` mirrors the waveform contours and info text updates to show the current `live` values.

### Waveform Reconnection

When a voice finishes and is later restarted from the live console (no cueElement), `handleAudioCue` falls back to `getWaveform(uid)` to find the existing SVG waveform. The element persists in the score after cleanup, so the cursor and info text resume on it.

### primeWaveform(ast, cueElement)

Called during `assignCues` for `cueAudio` elements. Fetches and decodes the audio buffer, then calls `renderWaveform()` to draw the waveform shape at score load time. The handle is reused when `handleAudioCue` fires later.

---

## Pool Engine (audioPool.js)

### ensureAudioPool(uid, params)

Fetches the file list from the server API (`/api/audio-list/{project}/{path}`) and caches it. Returns a pool object `{ files, mode, cursor }`.

### handleAudioPoolCue(ast, el, opts?)

Selects a file via `selectFromPool(pool)`, evaluates randomisable params, builds a cue object, and delegates to `handleAudioCue()`. After playback starts, updates the waveform peaks to show the selected file, calls `setWaveformDirection(handle, speed < 0)` for reverse display, and starts a cursor.

Info text updates on each trigger to show the selected filename and evaluated parameters.

### primePoolWaveform(ast, cueElement)

Called during `assignCues`. Fetches the pool, decodes the first file's buffer, and renders an initial waveform. On trigger, `updatePeaks()` swaps the waveform shape to whichever file was selected.

---

## Impulse Engine (audioImpulse.js)

### handleAudioImpulseCue(ast, el, opts?)

Entry point. Sets up a state object in the `audioImpulses` Map and starts the scheduling loop. Looks up the primed waveform handle via `getWaveform("wf-impulse-${uid}")` and stores it in `state._waveformHandle`.

### Scheduling

`scheduleNextImpulse(state)` computes the next interval from `rate` and `jitter`, then sets a `setTimeout` that calls `playImpulseHit(state)` and recurses.

**Interval formula:** `base = 60 / rate` (seconds). Jitter applies: `min = base * (1 - jitter)`, `max = base * (1 + jitter)`, result uniformly distributed in that range.

### playImpulseHit(state)

Selects a file via `selectFromPool(pool)`, applies per-hit randomisation (`speedRandom` centred on base `speed`), enforces the poly voice cap, and delegates to `handleAudioCue()`. After playback:

1. Calls `setWaveformDirection(wfHandle, speed < 0)` for reverse display
2. Adds a peak layer via `addPeakLayer(wfHandle, buffer, filename, { color })` -- auto-applies mirror transform if handle is in reverse mode
3. Adds a sub-cursor via `addCursor(wfHandle, playUid)` and starts animation with `startCursor`
4. Registers an `oscilla:audio` listener that auto-removes cursor and peak layer when the voice stops

### speedRandom

Per-hit speed variation centred on the base `speed` value. `speed:1, speedRandom:0.3` produces speeds uniformly distributed between 0.7 and 1.3 on each hit.

### Poly Cap Enforcement

Checked before firing each hit. Counts entries in `window.activeAudioCues` matching `uid` or `uid__*`:

- If at the poly limit, the hit is **skipped** (not evicted). The scheduling timer continues and the next interval tries again once a voice slot opens.
- Waveform cursor limit is enforced separately: oldest cursor evicted from `wfHandle._cursors` when at the poly count.

### Peak Layers

Each hit adds a coloured waveform contour (upper + lower polylines) via `addPeakLayer()`. Colours are assigned from a 12-colour palette. Layers are removed when their voice completes.

**Preview layers:** `primeImpulseWaveform` renders three random files from the pool as preview layers at reduced opacity, giving a visual sense of pool content at score load time. Preview layers are cleared on the first live hit.

### Region Lifetime

`checkImpulseRegions()` runs every RAF frame. For each active impulse with `lifetime:region`, it checks whether the playhead is still inside the cue element's bounding box. A grace period (15 ticks, 50px tolerance) prevents false exits from sub-pixel jitter. Exit triggers `stopAudioImpulse(uid)`.

### Retrigger Safety

When an impulse is stopped and retriggered (e.g. after rewind), the old state is deleted immediately from `audioImpulses`. Delayed cleanup closures capture the old state object and check `getWaveform(uid) === handle` before destroying, preventing clobbering of the new instance's waveform.

---

## Waveform System (js/system/waveform.js)

### renderWaveform(svg, target, buffer, uid, filename, opts)

Extracts peaks from the audio buffer, builds SVG polylines (upper + lower contour) and a cursor line, inserts them into the target element. Returns a handle object.

**Deduplication:** if a waveform already exists for the uid, returns the existing handle. If the filename has changed (pool switching), calls `updatePeaks()` automatically.

**Target resolution:** `self` resolves to the cue element itself. A string id resolves to another SVG element. For `<g>` targets, the waveform is appended as a child. For shape elements (`<rect>`, `<circle>`), it is inserted as a sibling with a MutationObserver mirroring transforms.

### getWaveform(uid)

Looks up an existing waveform handle by uid. Returns the handle or `undefined`. Used by audioFile for waveform reconnection from live console (no cueElement), and by audioImpulse on init to find the primed waveform.

### updatePeaks(handle, buffer, filename)

Redraws the upper and lower polylines for a different audio buffer. Used by audioPool when switching files.

### Peak Layer API

| Function | Description |
|----------|-------------|
| `addPeakLayer(handle, buffer, filename, opts)` | Append a coloured contour pair (upper + lower polylines) layered on top of the base waveform. Auto-applies mirror transform if `handle._reverse` is true |
| `removePeakLayer(handle, filename)` | Remove a specific layer by filename |
| `removeAllPeakLayers(handle)` | Clear all peak layers from a waveform |

Peak layers are stored in `handle._peakLayers` (a Map keyed by filename). Each entry holds `{ upper, lower }` SVG polyline references.

### Multi-Cursor API

| Function | Description |
|----------|-------------|
| `addCursor(handle, cursorId, opts)` | Create an independent sub-cursor within a waveform group |
| `removeCursor(handle, cursorId)` | Remove a specific sub-cursor |
| `removeAllCursors(handle)` | Clear all sub-cursors |

Sub-cursors are stored in `handle._cursors` (a Map). Each has its own RAF loop for independent tracking. Red line, 0.8px width, 0.45 opacity.

### setWaveformDirection(handle, reverse)

Applies or removes a horizontal SVG mirror transform (`translate(2*x+w, 0) scale(-1,1)`) on the base peak contours and all peak layers. No-ops if direction hasn't changed. Stores current state in `handle._reverse`.

Cursors are NOT transformed -- `startCursor` handles direction independently via the speed sign, computing right-to-left position when speed is negative.

### startCursor / resetCursor

`startCursor(handle, audioCtx, startTime, duration, speed)` starts the main cursor animation. When `speed < 0`, the cursor sweeps right-to-left. `resetCursor(handle)` stops animation and returns the cursor to position zero.

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

### Live Console -- Retrigger Path

When the live console dispatches an audio cue with a uid that matches an already-playing voice, `handleAudioCue` detects the existing voice in `activeAudioCues` and calls `voice.update(params)` instead of stop+restart. The waveform handle is reconnected via `getWaveform(uid)` since there is no cueElement from the console.

### RAF.js -- Tick Pipeline

`checkImpulseRegions()` runs every frame to monitor region-lifetime impulses.

### oscillaTransport.js -- rewindToStart

Calls `clearAllPins()` alongside other cleanup (`resetAllFadePriming`, `dismissAllStopwatchOverlays`). Also calls `stopAllAudioImpulses()` and `stopAllAudio()` to clean up all running voices, cursors, and peak layers.

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

Arguments: `filename (string)`, `amp`, `pan`, `speed`, `fadeIn`, `fadeOut` (all floats).

Custom addresses via `oscaddr` are prefixed with `/oscilla/`.
