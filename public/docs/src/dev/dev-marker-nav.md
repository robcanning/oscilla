---
title: Marker Navigation Architecture
layout: docs_layout.njk
---

# Marker Navigation Architecture

How user-placed markers integrate into the transport navigation system alongside SVG rehearsal marks.

---

## Resolution Order

`nav(scroll@name)` and `jumpToRehearsalMark(name)` use a **fallback chain**:

```
1. Check window.rehearsalMarks[name]     → SVG-authored rehearsal mark
2. Check findMarkerByName(name)          → user-placed marker (interaction layer)
3. Log error, do nothing
```

This is intentional. Rehearsal marks are authored into the score and should take priority. Markers are runtime additions that fill gaps. If a rehearsal mark and a marker share a name, the rehearsal mark wins.

`nav(mark@name)` bypasses step 1 — it only searches user markers via `findMarkerByName()`. Use this when you explicitly want to target a marker and not risk hitting a rehearsal mark with the same name.

### Where this lives

| Step | File | Function |
|------|------|----------|
| Fallback chain | `transportNav.js` | `jumpToRehearsalMark(mark)` |
| Marker-only lookup | `nav.js` | `action === "mark"` case |
| Marker search | `markers.js` | `findMarkerByName(name)` |

---

## Unified Nav Points

Arrow keys and FF/RW buttons navigate a **merged list** of rehearsal marks and user markers, sorted by world X position.

### How the list is built

`getUnifiedNavPoints()` in `transportNav.js`:

```
1. Collect rehearsal marks from window.sortedMarks + window.rehearsalMarks
   → { name, x, source: "rehearsal" }

2. Collect user markers from getSortedMarkerNavPoints()
   → { name, x, id, source: "marker" }

3. Concatenate and sort by x ascending
```

### Rebuild strategy: per-action, not cached

The unified list is rebuilt on **every** arrow key press or FF/RW button click. This is deliberate:

- Markers can be created, deleted, or dragged at any time
- Caching would require invalidation hooks in marker CRUD, drag handlers, and annotation sync
- Merging ~20–50 items and sorting is microseconds
- The cost of a stale cache (jumping to a deleted marker, skipping a new one) is worse than the cost of rebuilding

Do not add caching here without a very good reason.

### Position-based, not index-based

Next/prev navigation finds the next point **relative to the current playhead position**, not by incrementing a stored index:

```javascript
// "Next" = first nav point with x > playheadX + 1
// "Prev" = last nav point with x < playheadX - 1
```

The ±1 tolerance prevents getting stuck when the playhead is exactly on a nav point.

This matters because the playhead can move in many ways — manual seeking, cue jumps, timer onComplete actions, server sync — and a stored index would go stale after any of them. Position-based lookup is always correct.

---

## Jump Mechanics

Two code paths exist for jumping, depending on the nav point source:

### Rehearsal marks → name-based

```
jumpToRehearsalMark(name)
  → looks up name in window.rehearsalMarks
  → sets playheadX = entry.x
  → scrollToPlayheadVisual()
  → notifies server (type: "jump")
```

### Markers → position-based

```
jumpToWorldX(worldX)
  → sets playheadX = worldX directly
  → scrollToPlayheadVisual()
  → notifies server (type: "jump")
```

Arrow key / FF/RW navigation routes through `jumpToNavPoint(point)` which checks `point.source` and calls the appropriate path.

Markers use `jumpToWorldX` instead of `jumpToRehearsalMark` because multiple markers can share the same name (e.g. default "m"). Name-based lookup would always resolve to the leftmost one. Position-based jumping lands on the correct marker regardless of name collisions.

---

## Marker Coordinate Space

Markers store position as `placement.x` in **world coordinates** (SVG viewBox units). This is the same coordinate space as `window.playheadX`, `window.scoreWidth`, and rehearsal mark positions.

Markers are positioned correctly because they're created from click events using the standard world-coordinate conversion:

```javascript
// At creation time (markers.js):
placement.x = screenX / localScale   // screen pixels → world units

// At jump time (transportNav.js):
window.playheadX = marker.placement.x  // world units → playheadX (same space)
scrollToPlayheadVisual()               // playheadX → screen transform
```

No coordinate conversion is needed when jumping to a marker — `placement.x` and `playheadX` are the same unit.

See `dev-sync-architecture.md` for the full coordinate system documentation.

---

## Name Collisions

### Multiple markers with the same name

`findMarkerByName(name)` returns the **leftmost** marker (lowest `placement.x`) when multiple markers share a name. A console warning is logged:

```
[marker] Multiple markers named "intro" — using leftmost (x=4200)
```

This only affects `nav(scroll@name)` and `nav(mark@name)`. Arrow key navigation uses position-based jumping, so all markers are reachable regardless of name.

### Marker name matches rehearsal mark name

The rehearsal mark wins in `nav(scroll@name)`. Use `nav(mark@name)` to force marker-only resolution.

---

## Timer onComplete Integration

Countdown timer slots can trigger marker jumps via their `onComplete` field.

### Data flow

```
1. User sets onComplete: "nav(scroll@bridge)" in timer editor (timers.js)
2. Cue data syncs to server: { name, seconds, onComplete } (socket broadcast)
3. Server runs countdown, cue slot reaches zero (server.js advanceCountdown)
4. Server broadcasts: { type: "countdown_cue_complete", onComplete: "nav(scroll@bridge)" }
5. All clients receive message (socket.js)
6. Each client calls: handleCueTrigger("nav(scroll@bridge)", false, true)
7. Cue dispatcher parses expression → nav handler → jumpToRehearsalMark("bridge")
8. Fallback chain: rehearsal mark "bridge" or user marker "bridge"
```

### Why onComplete fires on all clients

The server broadcasts `countdown_cue_complete` to every client, not just the one that started the timer. This is correct — all performers should jump together. The timer is server-owned; the completion action should be too.

### Single cues vs sequences

- **Sequence cue**: onComplete fires when that slot finishes, before advancing to the next slot
- **Single cue**: onComplete fires when the standalone countdown reaches zero, before the timer stops

Both paths through `advanceCountdown()` in `server.js` check for and broadcast onComplete.

---

## Rehearsal Popup

`openRehearsalPopup()` in `rehearsalUI.js` builds a combined view:

1. Existing rehearsal mark buttons (from SVG, unchanged)
2. A "Markers" section with buttons for each named user marker

Marker buttons are built from `getSortedMarkerNavPoints()` and use `jumpToRehearsalMark(name)` on click — which follows the standard fallback chain.

The marker section is rebuilt each time the popup opens (no caching), so newly created or deleted markers are always reflected.

---

## File Map

| File | What it does for marker nav |
|------|----------------------------|
| `markers.js` | `findMarkerByName()`, `getSortedMarkerNavPoints()` — marker lookup and listing |
| `transportNav.js` | `getUnifiedNavPoints()`, `jumpToNavPoint()`, `jumpToWorldX()` — unified nav, position-based jumping |
| `nav.js` | `mark` and `markPaused` action handlers — explicit marker-only cue targets |
| `rehearsalUI.js` | Marker section in rehearsal popup |
| `timers.js` | onComplete input field in countdown editor UI |
| `server.js` | Stores onComplete, broadcasts `countdown_cue_complete` on slot completion |
| `socket.js` | Handles `countdown_cue_complete`, dispatches to `handleCueTrigger` |
