# Oscilla — Complete System Documentation

**Version:** 0.4.2  
**Purpose:** Browser-based framework for animated, cue-driven graphic scores  
**Technologies:** SVG, JavaScript (ES Modules), Node.js, WebSockets, OSC

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Architecture](#architecture)
3. [Server Components](#server-components)
4. [Client Components](#client-components)
5. [Cue System](#cue-system)
6. [Transport & Synchronization](#transport--synchronization)
7. [OSC Integration](#osc-integration)
8. [Project Structure](#project-structure)
9. [File Reference](#file-reference)

---

## System Overview

Oscilla is a browser-based platform for real-time animated graphic scores. It enables:

- **Animated and spatial graphic notation** — SVG-based scores with cue-driven animations
- **Networked performances** — Multiple clients synchronized via WebSocket
- **Cue-driven timing, navigation, and media** — DSL for defining behaviors via SVG element IDs
- **OSC integration** — Bidirectional communication with external audio/media engines
- **Hybrid fixed-form and open-form works** — Support for linear playback and interactive navigation

### What Oscilla Is NOT
- A DAW (Digital Audio Workstation)
- A notation engraver (like Sibelius/MuseScore)
- A collaborative score editor

---

## Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         INKSCAPE                                │
│  (Score Authoring - SVG with cue IDs in element names)          │
└──────────────────────────┬──────────────────────────────────────┘
                           │ score.svg
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NODE.JS SERVER                             │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐     │
│  │   Express   │  │  WebSocket   │  │    OSC Bridge       │     │
│  │  (HTTP/API) │  │   Server     │  │  (UDP In/Out)       │     │
│  └─────────────┘  └──────────────┘  └─────────────────────┘     │
│         │                │                    │                 │
│         │     Shared State (playhead, time, speed)              │
│         │                │                    │                 │
└─────────┼────────────────┼────────────────────┼─────────────────┘
          │                │                    │
          ▼                ▼                    ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐
│  Browser Client │ │  Browser Client │ │  External Audio Engine  │
│  (Performer 1)  │ │  (Performer 2)  │ │  (SuperCollider, etc.)  │
└─────────────────┘ └─────────────────┘ └─────────────────────────┘
```

### Key Concepts

| Term | Description |
|------|-------------|
| `scoreWidth` | Width of SVG in viewBox units (world space) |
| `canonicalRenderedWidth` | Pixel width reported by first client (visual authority) |
| `playheadX` | Playback position in world units |
| `elapsedTime` | Time elapsed in milliseconds |
| `speedMultiplier` | Playback speed factor (1.0 = normal) |
| `cue` | Behavior definition encoded in SVG element ID |

---

## Server Components

### server.js (Main Server — ~2175 lines)

The central Node.js server providing:

**HTTP/Express Endpoints:**
- `GET /` — Serves static files from `/public`
- `GET /scores/:project` — Project score files
- `GET /api/version` — Returns Oscilla version
- `GET /api/projects` — Lists available projects
- `GET /api/audio-tree/:project` — Audio file browser
- `POST /api/upload-audio/:project` — Audio file upload
- `POST /api/project/new` — Create new project
- `POST /api/project/save-as` — Duplicate project
- `GET /api/project/export/:name` — Export as .oscilla
- `POST /api/project/import` — Import .oscilla file
- `POST /save-preferences/:project` — Save project preferences
- `GET /config` — WebSocket configuration for clients

**WebSocket Message Types (Inbound from Clients):**

| Type | Purpose |
|------|---------|
| `play` | Start playback |
| `pause` | Pause playback |
| `jump` | Jump to position |
| `cueStop` | Stop cue triggered |
| `cue_pause` | Pause cue with duration |
| `cue_triggered` | Cue was triggered (broadcast to others) |
| `set_speed_multiplier` | Change playback speed |
| `set_duration` | Set score duration |
| `score_meta` | Report score dimensions |
| `update_client_name` | Change client display name |
| `repeat_update` | Sync repeat cue state |
| `osc` | Send OSC message |
| `osc_rotate` | Rotation OSC message |
| `osc_scale` | Scale OSC message |
| `osc_fade` | Fade OSC message |
| `osc_value` | Generic OSC value |
| `osc_control` | Control parameter OSC |
| `osc_audio_*` | Audio trigger OSC messages |
| `annotation_*` | Shared annotation CRUD |
| `countdown_*` | Server-owned countdown timer |

**WebSocket Message Types (Outbound to Clients):**

| Type | Purpose |
|------|---------|
| `welcome` | Client connection acknowledged with name |
| `sync` | Authoritative state broadcast (4Hz) |
| `client_list` | Connected clients update |
| `jump` | Position jump broadcast |
| `cueStop` | Stop cue broadcast |
| `cue_pause` | Pause cue broadcast |
| `repeat_update` | Repeat state sync |
| `repeat_state_map` | Full repeat state on connect |
| `annotation_*` | Annotation sync to other clients |

**Shared State Object:**
```javascript
sharedState = {
  elapsedTime: 0,           // ms
  isPlaying: false,
  playheadX: 0,             // world units
  duration: null,           // ms (from project)
  speedMultiplier: 1.0,
  startTimestamp: null,     // performance.now() anchor
  scoreWidth: null,
  canonicalRenderedWidth: null,
  countdown: null           // server-owned countdown state
}
```

### serverUtils.js

Project management utilities:
- `createNewProject(name)` — Copy template to new project
- `saveProjectAs(source, name)` — Duplicate existing project
- `exportProject(name, res, version)` — Create .oscilla ZIP archive
- `importProject(buffer, name)` — Extract and validate .oscilla file

### server-gui.js

Electron wrapper for standalone builds:
- Spawns `server.js` as child process
- Displays server status in GUI window
- Shows connected clients and log output

---

## Client Components

### public/js/app.js (Entry Point)

Orchestrates client initialization:
- Imports and wires all major subsystems
- Establishes global `window` bindings for cross-module access
- Detects platform (desktop/mobile) and loads appropriate CSS
- Initializes WebSocket connection
- Sets up UI controls and event handlers

**Key Global Bindings:**
```javascript
window.playheadX          // Current position
window.elapsedTime        // Current time
window.speedMultiplier    // Playback speed
window.duration           // Score duration
window.scoreWidth         // Score width in world units
window.isPlaying          // Playback state
window.triggeredCues      // Set of triggered cue IDs
window.socket             // WebSocket connection
```

### public/js/system/ (System Modules)

| File | Purpose |
|------|---------|
| `socket.js` | WebSocket connection, message routing, sync handling |
| `RAF.js` | RequestAnimationFrame loop management |
| `SVGInit.js` | SVG score initialization and layout |
| `UIBindings.js` | UI element event bindings |
| `clients.js` | Client list UI and audio master designation |
| `paths.js` | Path variants and playhead position utilities |
| `projectMenuUI.js` | Project selection menu |
| `rehearsalUI.js` | Rehearsal marks navigation popup |

### public/js/oscillaTransport.js (~2225 lines)

Transport control and synchronization:
- Play/pause/stop controls
- Speed adjustment (0.1x - 4.0x)
- Seek bar and keyboard navigation (←/→ arrows)
- Rehearsal mark navigation
- Visual scroll synchronization
- Dark mode toggle

**Synchronization Model:**
```
All clients use identical scale: canonicalScale = canonicalRenderedWidth / scoreWidth

Visual positioning via CSS transform (GPU-accelerated):
  screenX = playheadX * canonicalScale
  translateX = (viewportWidth / 2) - screenX
  scrollStage.style.transform = translateX(${translateX}px)
```

### public/js/projectLoader.js

Loads projects from `/scores/:project/`:
- Fetches and parses `score.svg`
- Loads `preferences.json`
- Initializes score dimensions
- Reports metadata to server

### public/js/projectScoreSetup.js

Score DOM setup:
- Extracts score elements
- Auto-injects scroll groups
- Processes SVG layers
- Applies transformations

---

## Cue System

### Overview

Cues are behaviors defined by SVG element ID attributes. When the playhead crosses an element, its ID is parsed and the corresponding handler executes.

### Parser (public/js/parser/parser.js — ~2681 lines)

Chevrotain-based DSL parser supporting:

**Cue Syntax Examples:**
```
pause(5)                    // Pause for 5 seconds
speed(0.5)                  // Set speed to 0.5x
speed(2 dur:4)              // Ramp to 2x over 4 seconds
nav(A)                      // Jump to rehearsal mark A
page(intro dur:3)           // Show page "intro" for 3 seconds
audio(file.mp3 vol:0.8)     // Play audio at 80% volume
rotate(360 dur:2 ease:inOut) // Rotate 360° over 2 seconds
scale(2 dur:1)              // Scale to 2x over 1 second
osc(/addr 0.5)              // Send OSC message
synth(freq:440 amp:0.5)     // Trigger synthesizer
text("Hello" dur:3)         // Display text for 3 seconds
```

### Cue Dispatcher (public/js/cues/cueDispatcher.js)

Routes parsed AST to appropriate handlers:

```javascript
switch (ast.type) {
  case "cuePause":    return handlePauseCue(ast);
  case "cueSpeed":    return handleSpeedCue(ast);
  case "cuePage":     return handlePageCue(ast);
  case "cueNav":      return handleNavCue(ast);
  case "cueAudio":    return handleAudioCue(ast);
  case "cueRotate":   return handleRotateCue(ast);
  case "cueScale":    return handleScaleCue(ast);
  case "cueO2P":      return handleO2PCue(ast);
  case "cueColor":    return handleColorCue(ast);
  case "cueOsc":      return handleOscCue(ast);
  case "cueSynth":    return handleSynthCue(ast);
  case "cueText":     return handleTextCue(ast);
  // ... etc
}
```

### Cue Handlers (public/js/cues/)

| File | Cue Types | Description |
|------|-----------|-------------|
| `pause.js` | `pause(N)` | Timed pause with countdown overlay |
| `stop.js` | `stop()` | Stop playback |
| `speed.js` | `speed(N)` | Set/ramp playback speed |
| `nav.js` | `nav(mark)` | Jump to rehearsal mark |
| `page.js` | `page(id)` | Fullscreen SVG overlay |
| `audio.js` | `audio()`, `audioPool()`, `audioImpulse()` | Audio playback |
| `video.js` | `video()` | Video playback |
| `synth.js` | `synth()` | Web Audio synthesizer |
| `rotate.js` | `rotate()` | Element rotation animation |
| `scale.js` | `scale()` | Element scale animation |
| `o2p.js` | `o2p()` | Object-to-path animation |
| `color.js` | `color()` | Color animation |
| `fade.js` | `fade()` | Opacity animation |
| `text.js` | `text()` | Text display overlay |
| `osc.js` | `osc()` | Send OSC messages |
| `oscCtrl.js` | `oscCtrl()` | OSC control messages |
| `controlXY.js` | `controlXY()` | XY pad control |
| `button.js` | `button()` | Interactive buttons |
| `metro.js` | `metronome()` | Visual/audio metronome |
| `timers.js` | `stopwatch()` | Stopwatch/countdown display |
| `ui.js` | `ui()` | UI control (show/hide elements) |

### Animation Shared (public/js/cues/animShared.js)

Common animation utilities:
- Easing functions
- Duration parsing
- Loop handling
- Prestate management (ghostClickable, fadein)

---

## Transport & Synchronization

### Clock Model

The server maintains an authoritative transport clock:

```javascript
// Server calculates elapsed time from wall clock
const wallSeconds = (performance.now() - startTimestamp) / 1000;
const elapsedMs = wallSeconds * speedMultiplier * 1000;

// Playhead position derived from elapsed time
playheadX = (elapsedTime / duration) * scoreWidth;
```

### Sync Broadcast (4Hz)

Server broadcasts state every 250ms:
```javascript
{
  type: 'sync',
  state: {
    elapsedTime,
    isPlaying,
    scoreWidth,
    playheadX,
    speedMultiplier,
    startTimestamp,
    canonicalRenderedWidth,
    duration,
    countdown
  },
  serverTime: Date.now()
}
```

### Client Sync Handling

Clients apply server state with drift protection:
- Small drift (<2% of score): Gradual correction
- Medium drift (2-5%): Immediate position update
- Large drift (>5%): Teleport mode (suppress cue triggers)

```javascript
// Teleport mode prevents cue cascade during large jumps
window._isTeleporting = true;
window.suppressCueTriggers = true;
window._skipTriggerFrame = 5;
```

---

## OSC Integration

### Configuration

```javascript
oscConfig = {
  localAddress: "0.0.0.0",      // Listen address
  localPort: 57121,             // OSC input port
  remoteAddress: "127.0.0.1",   // Destination address
  remotePort: 57120             // OSC output port
}
```

### Outbound OSC Messages

| Address | Args | Description |
|---------|------|-------------|
| `/stopwatch` | `[time_string]` | Elapsed time (MM:SS) |
| `/cue/trigger` | `[cue_number:i]` | Cue triggered |
| `/oscilla/rotate/{uid}` | `[deg:f, rad:f, norm:f]` | Rotation value |
| `/oscilla/scale/{uid}` | `[sx:f, sy:f]` | Scale values |
| `/oscilla/fade/{uid}` | `[value:f]` | Fade value |
| `/oscilla/audio/pool` | `[file:s, amp:f, pan:f, pitch:f, fadeIn:f, fadeOut:f]` | Audio pool |
| `/oscilla/audio/impulse` | `[file:s, amp:f, pan:f, pitch:f, fadeIn:f, fadeOut:f]` | Audio impulse |
| `/oscilla/audio/trigger` | `[file:s, vol:f, loop:i]` | Audio trigger |
| `/oscilla/audio/stop` | `[file:s, fadeOut:f]` | Stop audio |
| `/oscilla/control/{addr}` | `[value:f, t:f]` | Control value |
| `/oscilla/o2p/{uid}` | `[x:f, y:f, angle:f]` | Object-to-path position |

### OSC-In Support

Server can receive OSC and route to clients via WebSocket:
```javascript
case "osc_in":
case "osc_control":
  handleOSCIn(address, args);
```

---

## Project Structure

### Score Project Layout

```
public/scores/{project}/
├── score.svg           # Main score file (required)
├── preferences.json    # Project settings
├── audio/              # Audio files
│   ├── samples/
│   └── recordings/
├── video/              # Video files
├── pages/              # SVG page overlays
└── oscilla.manifest.json  # Export manifest (in .oscilla archives)
```

### preferences.json

```json
{
  "projectName": "my-score",
  "duration": 300,
  "scoreWidth": 40960,
  "enableOSC": true,
  "oscAddress": "/oscilla",
  "theme": "dark"
}
```

### Score SVG Structure

```xml
<svg viewBox="0 0 40960 1080">
  <!-- Main scrolling content -->
  <g id="scroll-content">
    <!-- Notation elements -->
    <rect id="pause(5)" .../>
    <circle id="rotate(360 dur:2)" .../>
    <path id="audio(click.mp3)" .../>
  </g>
  
  <!-- Rehearsal marks -->
  <g id="rehearsal-marks">
    <text id="mark-A">A</text>
    <text id="mark-B">B</text>
  </g>
  
  <!-- Reusable blocks -->
  <defs>
    <g id="reuse-pattern1">...</g>
  </defs>
</svg>
```

---

## File Reference

### Server Files

| File | Lines | Purpose |
|------|-------|---------|
| `server.js` | ~2175 | Main server (Express, WebSocket, OSC) |
| `serverUtils.js` | ~145 | Project management utilities |
| `server-gui.js` | ~165 | Electron GUI wrapper |
| `gui.html` | ~123 | Server monitor HTML |
| `package.json` | ~48 | Dependencies and build config |

### Client Core Files

| File | Lines | Purpose |
|------|-------|---------|
| `public/js/app.js` | ~250 | Client entry point |
| `public/js/oscillaTransport.js` | ~2225 | Transport and sync |
| `public/js/projectLoader.js` | ~700 | Project loading |
| `public/js/projectScoreSetup.js` | ~900 | Score DOM setup |
| `public/js/oscillaPreferences.js` | ~280 | Preferences management |
| `public/js/oscillaTargets.js` | ~450 | Target resolution |
| `public/js/oscillaObserver.js` | ~250 | DOM observation |
| `public/js/oscillaLive.js` | ~230 | Live inspector |
| `public/js/oscillaHitLabels.js` | ~800 | Hit region labels |
| `public/js/oscillaOSCClient.js` | ~270 | OSC client utilities |

### Parser Files

| File | Lines | Purpose |
|------|-------|---------|
| `public/js/parser/parser.js` | ~2681 | Chevrotain DSL parser |
| `public/js/parser/parserSignalRef.js` | ~170 | Signal reference handling |
| `public/js/parser/preProcessPropagate.js` | ~170 | Propagate preprocessing |
| `public/js/parser/preProcessReuse.js` | ~350 | Reuse block preprocessing |
| `public/js/parser/utils.js` | ~140 | Parser utilities |
| `public/js/parsers.js` | ~350 | Legacy parser support |

### Cue Handler Files

| File | Lines | Purpose |
|------|-------|---------|
| `public/js/cues/cueDispatcher.js` | ~1250 | Cue routing and scheduling |
| `public/js/cues/audio.js` | ~1300 | Audio playback |
| `public/js/cues/synth.js` | ~1400 | Web Audio synthesis |
| `public/js/cues/timers.js` | ~2100 | Stopwatch/countdown |
| `public/js/cues/rotate.js` | ~750 | Rotation animation |
| `public/js/cues/scale.js` | ~800 | Scale animation |
| `public/js/cues/o2p.js` | ~1200 | Object-to-path |
| `public/js/cues/color.js` | ~800 | Color animation |
| `public/js/cues/text.js` | ~800 | Text display |
| `public/js/cues/osc.js` | ~650 | OSC sending |
| `public/js/cues/page.js` | ~350 | Page overlays |
| `public/js/cues/pause.js` | ~350 | Pause handling |
| `public/js/cues/metro.js` | ~650 | Metronome |
| `public/js/cues/controlXY.js` | ~950 | XY control |
| `public/js/cues/fade.js` | ~250 | Fade animation |
| `public/js/cues/nav.js` | ~200 | Navigation |
| `public/js/cues/speed.js` | ~320 | Speed control |
| `public/js/cues/button.js` | ~270 | Buttons |
| `public/js/cues/video.js` | ~300 | Video playback |
| `public/js/cues/stop.js` | ~50 | Stop handling |
| `public/js/cues/ui.js` | ~220 | UI control |
| `public/js/cues/oscCtrl.js` | ~160 | OSC control |
| `public/js/cues/animShared.js` | ~670 | Shared animation utils |
| `public/js/cues/animation.js` | ~200 | Animation registry |

### System Module Files

| File | Lines | Purpose |
|------|-------|---------|
| `public/js/system/socket.js` | ~490 | WebSocket handling |
| `public/js/system/RAF.js` | ~200 | Animation loop |
| `public/js/system/SVGInit.js` | ~200 | SVG initialization |
| `public/js/system/UIBindings.js` | ~280 | UI event bindings |
| `public/js/system/clients.js` | ~100 | Client list |
| `public/js/system/paths.js` | ~110 | Path utilities |
| `public/js/system/projectMenuUI.js` | ~80 | Project menu |
| `public/js/system/rehearsalUI.js` | ~50 | Rehearsal navigation |

### Interaction Files

| File | Lines | Purpose |
|------|-------|---------|
| `public/js/interaction/annotationEditor.js` | ~1500 | Annotation editing |
| `public/js/interaction/interactionSurface.js` | ~700 | Contribution surface |
| `public/js/interaction/audioBrowser.js` | ~550 | Audio file browser |
| `public/js/interaction/audioRecorder.js` | ~1150 | Audio recording |
| `public/js/interaction/colorPicker.js` | ~300 | Color picker UI |
| `public/js/interaction/markers.js` | ~480 | Marker management |
| `public/js/interaction/trigger.js` | ~480 | Trigger interactions |
| `public/js/interaction/shared.js` | ~240 | Shared interaction utils |

### Control Module Files

| File | Lines | Purpose |
|------|-------|---------|
| `public/js/control/controlXYPresets.js` | ~1100 | XY preset management |
| `public/js/control/controlXYPresetUI.js` | ~900 | XY preset UI |
| `public/js/control/controlXYPresetsRoutes.js` | ~220 | XY preset HTTP routes |
| `public/js/control/controlXYPresetsRoutes.mjs` | ~170 | XY routes (ESM) |
| `public/js/control/controlRouter.js` | ~320 | Control message routing |
| `public/js/control/controlIntegration.js` | ~280 | Control integration |
| `public/js/control/paramBinding.js` | ~350 | Parameter binding |
| `public/js/control/paramBus.js` | ~250 | Parameter bus |

### Inkscape Extension Files

| File | Purpose |
|------|---------|
| `tools/oscilla-inkscape-extension/oscilla_smart_cues_gtk.py` | GTK cue editor |
| `tools/oscilla-inkscape-extension/oscilla_apply_cue.py` | Apply cue to selection |
| `tools/oscilla-inkscape-extension/oscilla_presets.json` | Preset definitions |
| `tools/oscilla-inkscape-extension/install.sh` | Installation script |

### Build/Deploy Scripts

| File | Purpose |
|------|---------|
| `scripts/deploy.sh` | Production deployment |
| `scripts/deploy-local.sh` | Local deployment |
| `scripts/convert_score.sh` | Score conversion |
| `scripts/convert_to_plain_svg.sh` | SVG simplification |

---

## Dependencies

### Server (package.json)

```json
{
  "dependencies": {
    "archiver": "^7.0.1",      // ZIP creation
    "chevrotain": "^11.0.3",   // Parser generator
    "express": "^4.21.2",      // HTTP server
    "multer": "^2.0.2",        // File upload
    "osc": "^2.4.5",           // OSC protocol
    "unzipper": "^0.12.3",     // ZIP extraction
    "ws": "^8.18.0",           // WebSocket
    "yargs": "^17.7.2"         // CLI arguments
  },
  "devDependencies": {
    "@11ty/eleventy": "^2.0.1", // Docs generator
    "@yao-pkg/pkg": "^6.12.0",  // Binary packaging
    "esbuild": "^0.25.0"        // Bundler
  }
}
```

### Client (Vendor Libraries)

- `anime.min.js` — Animation library
- `svg-path-commander.js` — SVG path manipulation
- `wavesurfer.min.js` — Audio waveform display

---

## Quick Reference: Adding a New Cue Type

1. **Add token** to `parser.js` token definitions
2. **Add grammar rule** to parser class
3. **Add CST-to-AST conversion** in `cstToAst()`
4. **Create handler** in `public/js/cues/newcue.js`
5. **Add case** to `cueDispatcher.js` switch statement
6. **Add OSC handler** (if needed) in `server.js`
7. **Update Inkscape extension** presets (optional)

---

*Document generated from Oscilla v0.4.2 source code*
