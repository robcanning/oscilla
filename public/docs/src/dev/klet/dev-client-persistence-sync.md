# Oscilla Client-Side Persistence & Synchronization

**Developer Guide: localStorage, WebSocket Sync, and Shared State Patterns**

This document explains how Oscilla handles client-side data persistence and multi-client synchronization for three main subsystems:

1. **Annotations** — Performer notes, triggers, text overlays
2. **Markers** — Timeline markers and navigation points
3. **ControlXY** — XY pad presets, sequences, scenes, launcher configurations

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Storage Pattern](#storage-pattern)
3. [Annotations System](#annotations-system)
4. [Markers System](#markers-system)
5. [ControlXY System](#controlxy-system)
6. [WebSocket Synchronization](#websocket-synchronization)
7. [Import/Export](#importexport)
8. [Migration & Versioning](#migration--versioning)
9. [Debugging](#debugging)

---

## Architecture Overview

### Design Principles

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT BROWSER                                     │
│                                                                             │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐         │
│  │  Annotations    │    │    Markers      │    │   ControlXY     │         │
│  │  (shared.js)    │    │  (markers.js)   │    │  (Shared.js)    │         │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘         │
│           │                      │                      │                   │
│           ▼                      ▼                      ▼                   │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │                      localStorage                                │       │
│  │  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ │       │
│  │  │ oscilla_annot... │ │ oscilla_mark... │ │ oscilla_ctrl...  │ │       │
│  │  └──────────────────┘ └──────────────────┘ └──────────────────┘ │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│           │                      │                      │                   │
│           └──────────────────────┼──────────────────────┘                   │
│                                  │                                          │
│                          WebSocket (optional)                               │
│                                  │                                          │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SERVER (server.js)                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────┐       │
│  │  WebSocket Hub — broadcasts to other clients                     │       │
│  │  Message types: annotation_*, marker_*, controlxy_*              │       │
│  └─────────────────────────────────────────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Principles

1. **localStorage as primary storage** — Each subsystem persists to browser localStorage
2. **Project-scoped keys** — Data is namespaced by project name
3. **Optional WebSocket sync** — Changes can be broadcast to other connected clients
4. **Scope field** — Items can be `local` (this client only) or `shared` (sync to others)
5. **Debounced saves** — Rapid changes are batched to avoid excessive writes
6. **Version field** — Enables future migration paths

---

## Storage Pattern

All three subsystems follow the same localStorage structure pattern:

### Key Format
```
oscilla_{subsystem}_v{version}:{projectName}
```

Examples:
```
oscilla_annotations_v1:myScore
oscilla_markers_v1:myScore
oscilla_controlxy_v1:myScore
```

### Data Structure
```javascript
{
  version: 1,                    // Schema version for migrations
  savedAt: 1706789012345,        // Unix timestamp of last save
  items: [                       // Array of all items
    {
      id: "abc_123xyz",          // Unique identifier
      kind: "annotation",        // Item type discriminator
      scope: "local",            // "local" | "shared"
      createdAt: 1706789000000,
      updatedAt: 1706789012345,
      data: { ... }              // Type-specific payload
    }
  ]
}
```

### Common Module Structure

Each subsystem has a "shared" module that provides:

```javascript
// State object (single source of truth)
export const state = {
  projectId: null,
  items: [],
  dirty: false
};

// Core CRUD operations
export function addItem(item) { ... }
export function updateItem(id, patch) { ... }
export function deleteItem(id) { ... }
export function findById(id) { ... }
export function findByKind(kind) { ... }

// Persistence
export function loadLocal(project) { ... }
export function saveLocal(project, items) { ... }
export function init(project) { ... }
export function save() { ... }           // Debounced
export function forceSave() { ... }      // Immediate

// Events dispatched
// - `{subsystem}:loaded` — After loading from localStorage
// - `{subsystem}:saved` — After saving to localStorage
```

---

## Annotations System

### Files
- `public/js/oscillaAnnotations.js` — Main annotation logic
- `public/js/interaction/annotationEditor.js` — UI for editing
- `public/js/interaction/shared.js` — Shared utilities

### Storage Key
```
oscilla_annotations_v1:{project}
```

### Item Kinds
| Kind | Description |
|------|-------------|
| `annotation` | Text note positioned on score |
| `trigger` | Executable annotation (can trigger audio) |

### Data Schema
```javascript
{
  id: "ann_abc123",
  kind: "annotation",
  scope: "local",              // or "shared"
  createdAt: 1706789000000,
  updatedAt: 1706789012345,
  data: {
    x: 1500,                   // X position in score coordinates
    y: 200,                    // Y position
    text: "Enter softly",      // Annotation text
    color: "#ffcc00",          // Display color
    fontSize: 14,              // Font size
    visible: true,             // Show/hide state
    
    // Trigger-specific fields (kind: "trigger")
    triggerType: "audioPool",  // "audio" | "audioPool" | "audioImpulse"
    triggerConfig: {
      path: "samples/hits",
      mode: "random",
      amp: 0.8
    }
  }
}
```

### WebSocket Messages
```javascript
// Client → Server → Other Clients
{ type: "annotation_add", payload: { item } }
{ type: "annotation_update", payload: { id, patch } }
{ type: "annotation_delete", payload: { id } }
```

### API (window.oscillaAnnotations)
```javascript
window.oscillaAnnotations.add(data)
window.oscillaAnnotations.update(id, patch)
window.oscillaAnnotations.delete(id)
window.oscillaAnnotations.list()
window.oscillaAnnotations.exportJSON()
window.oscillaAnnotations.importJSON(json, merge)
```

---

## Markers System

### Files
- `public/js/interaction/markers.js` — Marker management

### Storage Key
```
oscilla_markers_v1:{project}
```

### Item Kind
| Kind | Description |
|------|-------------|
| `marker` | Timeline position marker |

### Data Schema
```javascript
{
  id: "mrk_xyz789",
  kind: "marker",
  scope: "local",
  createdAt: 1706789000000,
  updatedAt: 1706789012345,
  data: {
    x: 5000,                   // Position in score coordinates
    label: "A",                // Marker label (e.g., rehearsal letter)
    color: "#00ff00",          // Display color
    description: "Cue entry"   // Optional description
  }
}
```

### Relationship to Rehearsal Marks

Markers in localStorage are **user-created** markers. They complement (but don't replace) rehearsal marks authored in the SVG score itself:

- **SVG Rehearsal Marks** — Authored in Inkscape, parsed at load time, read-only
- **User Markers** — Created at runtime, persisted to localStorage, editable

---

## ControlXY System

### Files
- `public/js/control/controlXYShared.js` — Single source of truth (localStorage)
- `public/js/control/controlXYPresets.js` — Preset/sequence/scene logic
- `public/js/control/controlXYPresetUI.js` — Panel UI
- `public/js/cues/controlXY.js` — XY pad cue handler

### Storage Key
```
oscilla_controlxy_v1:{project}
```

### Item Kinds
| Kind | Description |
|------|-------------|
| `preset` | Saved handle positions |
| `sequence` | Ordered list of presets with timing |
| `launcher` | Per-pad launcher state (banks, slots, mode) |
| `scene` | Complete snapshot (all positions + all launchers) |

### Data Schemas

#### Preset
```javascript
{
  id: "cxy_abc123",
  kind: "preset",
  name: "center",
  scope: "local",
  createdAt: 1706789000000,
  updatedAt: 1706789012345,
  data: {
    // Positions keyed by pad uid, then handle id
    "pad1": {
      "handle1": { x: 0.5, y: 0.5 },
      "handle2": { x: 0.2, y: 0.8 }
    },
    "_meta": {
      savedAt: 1706789012345,
      filter: null              // Optional uid filter used when saving
    }
  }
}
```

#### Sequence
```javascript
{
  id: "cxy_seq456",
  kind: "sequence",
  name: "sweep",
  scope: "local",
  createdAt: 1706789000000,
  updatedAt: 1706789012345,
  data: {
    steps: [
      { preset: "left", dur: 1, ease: "easeInOutSine" },
      { preset: "center", dur: 0.5, ease: "linear" },
      { preset: "right", dur: 1, ease: "easeOutBack" }
    ],
    loop: true,
    defaultDur: 1,
    defaultEase: "easeInOutSine"
  }
}
```

#### Launcher
```javascript
{
  id: "cxy_lnc789",
  kind: "launcher",
  uid: "pad1",                  // Links to specific controlXY instance
  createdAt: 1706789000000,
  updatedAt: 1706789012345,
  data: {
    currentBank: 0,
    mode: "preset",             // "preset" | "sequence"
    tween: true,
    visible: true,
    banks: [
      {
        name: "Bank 1",
        slots: [
          { type: "preset", name: "center" },
          { type: "preset", name: "corner" },
          { type: "sequence", name: "sweep" },
          { type: "empty" }
        ]
      },
      {
        name: "Bank 2",
        slots: [ ... ]
      }
    ]
  }
}
```

#### Scene
```javascript
{
  id: "cxy_scn012",
  kind: "scene",
  name: "Live Set 1",
  scope: "local",
  createdAt: 1706789000000,
  updatedAt: 1706789012345,
  data: {
    handlePositions: {
      "pad1": { "handle1": { x: 0.5, y: 0.5 } },
      "pad2": { "handle1": { x: 0.1, y: 0.9 } }
    },
    launchers: {
      "pad1": { currentBank: 0, mode: "preset", tween: true, visible: true, banks: [...] },
      "pad2": { currentBank: 1, mode: "sequence", tween: false, visible: true, banks: [...] }
    },
    savedAt: 1706789012345
  }
}
```

### API (window.controlXYPresets)
```javascript
// Presets
window.controlXYPresets.save(name)
window.controlXYPresets.recall(name, { dur, ease })
window.controlXYPresets.delete(name)
window.controlXYPresets.list()

// Sequences
window.controlXYPresets.defineSequence(name, steps, options)
window.controlXYPresets.playSequence(name, options)
window.controlXYPresets.stopSequence()

// Scenes
window.controlXYPresets.saveScene(name)
window.controlXYPresets.recallScene(name, { dur, ease })
window.controlXYPresets.deleteScene(name)
window.controlXYPresets.listScenes()

// Persistence
window.controlXYPresets.export()
window.controlXYPresets.import(json, merge)
```

---

## WebSocket Synchronization

### Scope Field

The `scope` field on each item determines sync behavior:

| Scope | Behavior |
|-------|----------|
| `local` | Stays on this client only, no WebSocket broadcast |
| `shared` | Broadcast to other clients via server relay |

### Message Flow

```
Client A                    Server                      Client B
   │                          │                            │
   │  annotation_add          │                            │
   │ ───────────────────────► │                            │
   │                          │  annotation_add            │
   │                          │ ──────────────────────────►│
   │                          │                            │
   │                          │                     (apply to local state)
```

### Server Relay (server.js)

The server acts as a simple relay for sync messages:

```javascript
// server.js handles these message types:
case "annotation_add":
case "annotation_update":
case "annotation_delete":
case "marker_add":
case "marker_update":
case "marker_delete":
  // Broadcast to all other connected clients
  broadcastToOthers(ws, message);
  break;
```

### Conflict Resolution

Current strategy: **Last Write Wins**

- No merge logic for concurrent edits
- Latest `updatedAt` timestamp wins
- Future enhancement: CRDT-based merging

---

## Import/Export

### Export Format

All subsystems export as JSON with the same structure as localStorage:

```javascript
{
  version: 1,
  exportedAt: 1706789012345,
  projectId: "myScore",
  items: [ ... ]
}
```

### Import Options

```javascript
// Merge mode (default): add new items, update existing by id
subsystem.import(json, { merge: true });

// Replace mode: clear existing items, import all
subsystem.import(json, { merge: false });
```

### File Naming Convention
```
controlxy-presets-1706789012345.json
annotations-myScore-1706789012345.json
```

---

## Migration & Versioning

### Version Field

Each storage structure includes a `version` field:

```javascript
{
  version: 1,  // Increment when schema changes
  ...
}
```

### Migration Pattern

```javascript
function loadLocal(project) {
  const key = `${STORAGE_PREFIX}:${project}`;
  const raw = localStorage.getItem(key);
  const data = JSON.parse(raw);
  
  // Check version and migrate if needed
  if (data.version < CURRENT_VERSION) {
    data = migrateData(data);
    saveLocal(project, data.items);
  }
  
  return data;
}

function migrateData(data) {
  // v1 → v2 migration
  if (data.version === 1) {
    data.items = data.items.map(item => {
      // Apply schema changes
      return { ...item, newField: defaultValue };
    });
    data.version = 2;
  }
  return data;
}
```

---

## Debugging

### Browser Console Commands

```javascript
// View all controlXY data
console.log(window.controlXYPresets._shared.state);

// List all presets
window.controlXYPresets.list();

// List all scenes
window.controlXYPresets.listScenes();

// View raw localStorage
localStorage.getItem('oscilla_controlxy_v1:myProject');

// Force save (bypass debounce)
window.controlXYPresets.forceSave();

// Export to console
console.log(window.controlXYPresets.export());
```

### Events to Monitor

```javascript
// Listen for save events
window.addEventListener('controlxy:saved', (e) => {
  console.log('ControlXY saved:', e.detail);
});

window.addEventListener('controlxy:loaded', (e) => {
  console.log('ControlXY loaded:', e.detail);
});

window.addEventListener('annotation:saved', (e) => {
  console.log('Annotations saved');
});
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Data not persisting | Project ID not set | Ensure `init(projectId)` called |
| Presets not in list | Using old API | Check imports use shared module |
| Sync not working | Scope is "local" | Set `scope: "shared"` on items |
| Data lost on reload | Save not called | Check debounce, call `forceSave()` |

---

## Summary: Comparison Table

| Feature | Annotations | Markers | ControlXY |
|---------|-------------|---------|-----------|
| Storage Key | `oscilla_annotations_v1` | `oscilla_markers_v1` | `oscilla_controlxy_v1` |
| Item Kinds | annotation, trigger | marker | preset, sequence, launcher, scene |
| WebSocket Sync | ✅ Yes | ✅ Yes | 🔜 Planned |
| Scope Support | ✅ local/shared | ✅ local/shared | ✅ local/shared |
| UI Location | Annotation overlay | Timeline | Preset Manager panel |
| Trigger Support | ✅ Audio triggers | ❌ | ❌ |

---

## File Reference

| File | Purpose |
|------|---------|
| `public/js/interaction/shared.js` | Base shared utilities for annotations/markers |
| `public/js/oscillaAnnotations.js` | Annotation state and logic |
| `public/js/interaction/annotationEditor.js` | Annotation editing UI |
| `public/js/interaction/markers.js` | Marker management |
| `public/js/control/controlXYShared.js` | ControlXY localStorage state |
| `public/js/control/controlXYPresets.js` | Preset/sequence/scene operations |
| `public/js/control/controlXYPresetUI.js` | Preset Manager panel |
| `public/js/cues/controlXY.js` | XY pad cue handler |

---

*Document version: 1.0 — February 2025*
