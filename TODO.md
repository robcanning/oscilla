# 🧠 OscillaScore — Master TODO List (Combined)

## 🌀 General Architecture
- [ ] Modularize all animation logic into `oscillaAnimation.js` (✅ mostly done)
- [ ] Cleanly separate `cueHandlers.js` logic by cue type
- [ ] Convert legacy cue ID formats to unified minisyntax
- [ ] Support multiple independent score instances cleanly
- [ ] Extract shared global state to a dedicated state module
- [ ] Add central observer registry for all animation types
- [ ] Refactor `window.*` assignments into controlled exports

## 🎮 Animation + Playback
- [ ] Move `initializeRotatingObjects`, `initializeScalingObjects`, `triggerDeferredAnimations` to `oscillaAnimation.js`
- [ ] Add reliable `startPlayback()` and `stopPlayback()` utilities
- [ ] Ensure `pathVariantsMap` is handled cleanly (global or internal)
- [ ] Support SVG clone animations via `s[...], r_rpm(...)`, etc.
- [ ] Improve playback resume logic after seeking (still flaky)
- [ ] Support animation visibility toggling via IntersectionObserver consistently across scale/rotate/path
- [ ] Fix deferred trigger animations from cue_choice / cue_traverse `_t(1)` workflow
- [ ] Export `ensureWindowPlayheadX` and `emitOSCFromPathProgress` from animation module

## 🎯 Cue System
- [ ] Extend `cue_repeat`, `cue_choice`, `cue_traverse` to support nested behavior
- [ ] Add documentation and helpers for `cueSpeed(...)`, `cueAudio(...)`, `cueMedia(...)`
- [ ] Implement consistent triggerable cue logic via `_t(1)` pattern
- [ ] Track and sync repeat state via WebSocket
- [ ] Expose cue status visually (active repeat, paused, selected choice, etc.)
- [ ] Modularize cuePause countdown UI logic
- [ ] Auto-resume on cue dismiss if playing before pause
- [ ] Replace all `isPaused` with `isPlaying` logic consistency

## 🌐 OSC + WebSocket
- [ ] Finalize `sendObj2PathOsc()` and `emitOSCFromPathProgress()` structure
- [ ] Ensure all OSC cue types are modular and documented
- [ ] Add control panel for toggling `ENABLE_OBJ2PATH_OSC`
- [ ] Sync playhead position on reconnect
- [ ] Add OSC bundling support (batch send)
- [ ] Send active cue info via OSC for external parsing

## 🧪 Dev & Debug
- [ ] Add debug overlay for current playheadX, speedMultiplier, cue states
- [ ] Add single test SVG and cue suite that runs all cue types in sequence
- [ ] Validate IntersectionObserver behavior across animation types
- [ ] Auto-scroll log console in debug mode
- [ ] Handle startup race conditions between SVG load and cue preload

## 📁 File Structure + Tooling
- [ ] Convert one-off helper functions into shared modules
- [ ] Create `oscillaUtils.js` or `oscillaState.js` for shared runtime state
- [ ] Clean up global `window.*` assignments
- [ ] Document module load order and critical init sequence
- [ ] Enable per-client config loading from `config.json`
- [ ] Consider using `vite` or `esbuild` for modular builds

## 📄 Docs + Examples
- [ ] Add full header comment (GPL, author, scope) to each module
- [ ] Update all cue examples to use minisyntax format
- [ ] Build animation namespace reference sheet
- [ ] Merge project-specific todo fragments into this master list ✅
- [ ] Add cue handler architecture diagram
- [ ] Create minimal Inkscape cue/animation authoring guide
- [ ] Generate markdown table of all cue types with syntax and use cases

---
This document combines fragmented OscillaScore task lists into a single unified TODO.
Pulled from app.js, cueHandlers.js, and all known scattered task blocks.
