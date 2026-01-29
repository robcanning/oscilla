/*!
 * oscillaControlXYPresets.js — Preset System for XY Control Pads
 * Part of oscillaScore control plane
 * © 2025 Rob Canning — GPLv3
 *
 * Features:
 *   - Save/recall handle positions as named presets
 *   - Tween between presets with easing
 *   - Sequence playback with per-step timing
 *   - Per-handle timing for complex animations
 *   - Project-based storage with import/export
 */

import { publish } from "./oscillaParamBinding.js";
import { sendOSCMessage } from "./cues/oscillaOSC.js";

// ============================================================================
// PRESET STORAGE
// ============================================================================

const presetStore = {
  presets: {},
  sequences: {},
  projectId: null
};

// Active tween state
let activeTweens = new Map(); // uid -> tween state
let activeSequence = null;

// ============================================================================
// EASING FUNCTIONS
// ============================================================================

const easings = {
  linear: t => t,
  easeInSine: t => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: t => Math.sin((t * Math.PI) / 2),
  easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInQuad: t => t * t,
  easeOutQuad: t => 1 - (1 - t) * (1 - t),
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  easeInCubic: t => t * t * t,
  easeOutCubic: t => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  easeInBack: t => 2.70158 * t * t * t - 1.70158 * t * t,
  easeOutBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  easeInOutBack: t => {
    const c1 = 1.70158, c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  },
  easeInElastic: t => t === 0 ? 0 : t === 1 ? 1
    : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * ((2 * Math.PI) / 3)),
  easeOutElastic: t => t === 0 ? 0 : t === 1 ? 1
    : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

function getEasing(ease) {
  if (typeof ease === 'function') return ease;
  if (typeof ease === 'number') {
    const names = Object.keys(easings);
    return easings[names[ease % names.length]] || easings.easeInOutSine;
  }
  return easings[ease] || easings.easeInOutSine;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Get all registered controlXY instances
 */
function getAllControlXY() {
  const instances = [];
  document.querySelectorAll('[id*="controlXY"]').forEach(el => {
    if (el._controlXY) {
      instances.push(el._controlXY);
    }
  });

  // Also check window registry if available
  if (window._controlXYRegistry) {
    for (const [uid, instance] of window._controlXYRegistry) {
      if (!instances.find(i => i.uid === uid)) {
        instances.push(instance);
      }
    }
  }

  return instances;
}

/**
 * Get a specific controlXY instance by uid
 */
function getControlXY(uid) {
  if (window._controlXYRegistry?.has(uid)) {
    return window._controlXYRegistry.get(uid);
  }

  // Fallback: search DOM
  const el = document.querySelector(`[id*="uid:${uid}"]`);
  return el?._controlXY || null;
}

/**
 * Capture current state of all handles
 */
function captureState(uidFilter = null) {
  const state = {};
  const instances = getAllControlXY();

  for (const instance of instances) {
    if (uidFilter && instance.uid !== uidFilter) continue;

    const handleStates = {};
    for (const handle of instance.handles) {
      const bbox = instance.boundsEl?.getBBox();
      if (!bbox) continue;

      // Normalize current position
      const normX = (handle.curX - bbox.x) / bbox.width;
      const normY = 1 - (handle.curY - bbox.y) / bbox.height;

      handleStates[handle.id] = {
        x: Math.round(normX * 1000) / 1000,
        y: Math.round(normY * 1000) / 1000
      };
    }

    if (Object.keys(handleStates).length > 0) {
      state[instance.uid] = handleStates;
    }
  }

  return state;
}

// ============================================================================
// PRESET MANAGEMENT
// ============================================================================

/**
 * Save current positions as a named preset
 */
export function savePreset(name, uidFilter = null) {
  if (!name) {
    console.warn("[controlXY] savePreset: name required");
    return false;
  }

  const state = captureState(uidFilter);

  if (Object.keys(state).length === 0) {
    console.warn("[controlXY] savePreset: no controlXY instances found");
    return false;
  }

  presetStore.presets[name] = {
    ...state,
    _meta: {
      savedAt: Date.now(),
      filter: uidFilter
    }
  };

  console.log(`[controlXY] Saved preset "${name}":`, state);

  // Auto-save to server if project is set
  if (presetStore.projectId) {
    savePresetsToServer();
  }

  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('controlxy:presetSaved', {
    detail: { name, state }
  }));

  return true;
}

/**
 * Delete a preset
 */
export function deletePreset(name) {
  if (!presetStore.presets[name]) {
    console.warn(`[controlXY] Preset "${name}" not found`);
    return false;
  }

  delete presetStore.presets[name];
  console.log(`[controlXY] Deleted preset "${name}"`);

  if (presetStore.projectId) {
    savePresetsToServer();
  }

  window.dispatchEvent(new CustomEvent('controlxy:presetDeleted', {
    detail: { name }
  }));

  return true;
}

/**
 * List all preset names
 */
export function listPresets() {
  return Object.keys(presetStore.presets);
}

/**
 * Get preset data
 */
export function getPreset(name) {
  return presetStore.presets[name] || null;
}

// ============================================================================
// RECALL WITH TWEENING
// ============================================================================

/**
 * Recall a preset, optionally tweening to it
 * 
 * Options:
 *   dur: number (seconds) - tween duration, 0 = instant
 *   ease: string|number - easing function
 *   handles: { handleId: { dur, ease, delay } } - per-handle overrides
 */
export function recallPreset(name, options = {}) {
  const preset = presetStore.presets[name];

  if (!preset) {
    console.warn(`[controlXY] Preset "${name}" not found`);
    return false;
  }

  const dur = options.dur ?? 0;
  const ease = options.ease ?? 'easeInOutSine';
  const handleOverrides = options.handles || {};

  console.log(`[controlXY] Recalling preset "${name}"`, { dur, ease });

  // Build target positions
  const targets = [];

  for (const [uid, handleStates] of Object.entries(preset)) {
    if (uid === '_meta') continue;

    const instance = getControlXY(uid);
    if (!instance) {
      console.warn(`[controlXY] Instance "${uid}" not found for recall`);
      continue;
    }

    for (const [handleId, pos] of Object.entries(handleStates)) {
      const handle = instance.handles.find(h => h.id === handleId);
      if (!handle) continue;

      const override = handleOverrides[handleId] || {};

      targets.push({
        instance,
        handle,
        targetX: pos.x,
        targetY: pos.y,
        dur: override.dur ?? dur,
        ease: override.ease ?? ease,
        delay: override.delay ?? 0
      });
    }
  }

  if (targets.length === 0) {
    console.warn("[controlXY] No valid targets for recall");
    return false;
  }

  // Execute tweens
  if (dur === 0 && !Object.keys(handleOverrides).length) {
    // Instant recall
    for (const t of targets) {
      applyPositionNormalized(t.instance, t.handle, t.targetX, t.targetY);
    }
  } else {
    // Tweened recall
    for (const t of targets) {
      if (t.delay > 0) {
        setTimeout(() => startTween(t), t.delay * 1000);
      } else {
        startTween(t);
      }
    }
  }

  window.dispatchEvent(new CustomEvent('controlxy:presetRecalled', {
    detail: { name, options }
  }));

  return true;
}

/**
 * Apply normalized position to a handle
 */
function applyPositionNormalized(instance, handle, normX, normY) {
  const bbox = instance.boundsEl?.getBBox();
  if (!bbox) return;

  // Convert normalized to absolute
  const absX = bbox.x + normX * bbox.width;
  const absY = bbox.y + (1 - normY) * bbox.height; // Invert Y

  // Update handle state
  handle.curX = absX;
  handle.curY = absY;
  handle.offsetX = absX - handle.originalCenterX;
  handle.offsetY = absY - handle.originalCenterY;

  // Apply transform
  handle.el.setAttribute("transform", `translate(${handle.offsetX}, ${handle.offsetY})`);

  // Emit values
  emitHandleValues(instance, handle, normX, normY);

  // Update label if present
  if (handle.label && instance.updateLabel) {
    instance.updateLabel(handle.label, handle.el, normX, normY, handle.offsetX, handle.offsetY);
  }
}

/**
 * Emit handle values to control plane and OSC
 */
function emitHandleValues(instance, handle, normX, normY) {
  // Publish to control plane
  publish("controlXY", instance.uid, {
    handle: handle.id,
    x: normX,
    y: normY,
    [`${handle.id}.x`]: normX,
    [`${handle.id}.y`]: normY
  });

  // OSC output
  if (instance.oscEnabled) {
    const now = performance.now();
    if (now - (handle.lastOscSent || 0) >= (instance.oscThrottle || 30)) {
      handle.lastOscSent = now;

      const addr = instance.handles.length > 1
        ? `${instance.oscAddr}/${handle.id}`
        : instance.oscAddr;

      sendOSCMessage?.({
        type: "osc_value",
        addr: addr,
        args: [normX, normY],
        timestamp: Date.now()
      });
    }
  }
}

// ============================================================================
// TWEEN ENGINE
// ============================================================================

/**
 * Start a tween for a single handle
 */
function startTween(target) {
  const { instance, handle, targetX, targetY, dur, ease } = target;

  // Cancel existing tween for this handle
  const tweenKey = `${instance.uid}:${handle.id}`;
  if (activeTweens.has(tweenKey)) {
    cancelAnimationFrame(activeTweens.get(tweenKey).rafId);
  }

  const bbox = instance.boundsEl?.getBBox();
  if (!bbox) return;

  // Get current normalized position
  const startX = (handle.curX - bbox.x) / bbox.width;
  const startY = 1 - (handle.curY - bbox.y) / bbox.height;

  const easeFn = getEasing(ease);
  const startTime = performance.now();
  const durationMs = dur * 1000;

  const tweenState = {
    startX, startY,
    targetX, targetY,
    startTime, durationMs,
    easeFn,
    instance, handle,
    rafId: null
  };

  function tick() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    const easedProgress = easeFn(progress);

    const currentX = startX + (targetX - startX) * easedProgress;
    const currentY = startY + (targetY - startY) * easedProgress;

    applyPositionNormalized(instance, handle, currentX, currentY);

    if (progress < 1) {
      tweenState.rafId = requestAnimationFrame(tick);
    } else {
      activeTweens.delete(tweenKey);

      window.dispatchEvent(new CustomEvent('controlxy:tweenComplete', {
        detail: { uid: instance.uid, handleId: handle.id }
      }));
    }
  }

  tweenState.rafId = requestAnimationFrame(tick);
  activeTweens.set(tweenKey, tweenState);
}

/**
 * Stop all active tweens
 */
export function stopAllTweens() {
  for (const [key, state] of activeTweens) {
    cancelAnimationFrame(state.rafId);
  }
  activeTweens.clear();
  console.log("[controlXY] Stopped all tweens");
}

/**
 * Tween to arbitrary positions (not from preset)
 */
export function tweenTo(positions, dur = 1, ease = 'easeInOutSine') {
  for (const [uid, handlePositions] of Object.entries(positions)) {
    const instance = getControlXY(uid);
    if (!instance) continue;

    for (const [handleId, pos] of Object.entries(handlePositions)) {
      const handle = instance.handles.find(h => h.id === handleId);
      if (!handle) continue;

      startTween({
        instance,
        handle,
        targetX: pos.x,
        targetY: pos.y,
        dur,
        ease
      });
    }
  }
}

// ============================================================================
// SEQUENCES
// ============================================================================

/**
 * Define a sequence
 */
export function defineSequence(name, steps) {
  presetStore.sequences[name] = steps;
  console.log(`[controlXY] Defined sequence "${name}":`, steps);

  if (presetStore.projectId) {
    savePresetsToServer();
  }
}

/**
 * Play a sequence of presets
 * 
 * Options:
 *   dur: number | number[] - duration per step
 *   ease: string | string[] - easing per step
 *   loop: boolean | number - loop count (true = infinite)
 *   onStep: function(stepIndex, presetName) - callback per step
 *   onComplete: function() - callback when done
 */
export function playSequence(name, options = {}) {
  const sequence = presetStore.sequences[name];

  if (!sequence || !Array.isArray(sequence)) {
    console.warn(`[controlXY] Sequence "${name}" not found`);
    return false;
  }

  // Stop any active sequence
  stopSequence();

  const defaultDur = options.dur ?? 1;
  const defaultEase = options.ease ?? 'easeInOutSine';
  const loop = options.loop ?? false;
  const onStep = options.onStep || (() => { });
  const onComplete = options.onComplete || (() => { });

  let currentStep = 0;
  let loopCount = 0;
  const maxLoops = loop === true ? Infinity : (loop || 1);

  activeSequence = {
    name,
    sequence,
    currentStep,
    loopCount,
    maxLoops,
    timeoutId: null,
    stopped: false
  };

  function playStep() {
    if (activeSequence?.stopped) return;

    if (currentStep >= sequence.length) {
      loopCount++;
      if (loopCount >= maxLoops) {
        console.log(`[controlXY] Sequence "${name}" complete`);
        onComplete();
        activeSequence = null;
        return;
      }
      currentStep = 0;
    }

    const step = sequence[currentStep];
    let presetName, stepDur, stepEase;

    if (typeof step === 'string') {
      presetName = step;
      stepDur = Array.isArray(defaultDur) ? defaultDur[currentStep % defaultDur.length] : defaultDur;
      stepEase = Array.isArray(defaultEase) ? defaultEase[currentStep % defaultEase.length] : defaultEase;
    } else if (typeof step === 'object') {
      presetName = step.preset;

      if (typeof step.dur === 'number') {
        // seconds (canonical)
        stepDur = step.dur;
      } else if (typeof step.duration === 'number') {
        // milliseconds → seconds
        stepDur = step.duration / 1000;
      } else {
        stepDur = defaultDur;
      }

      stepEase = step.ease ?? defaultEase;
    }

    console.log(`[controlXY] Sequence "${name}" step ${currentStep}: "${presetName}" (${stepDur}s)`);

    onStep(currentStep, presetName);

    recallPreset(presetName, { dur: stepDur, ease: stepEase });

    currentStep++;
    activeSequence.currentStep = currentStep;

    // Schedule next step after tween completes
    const waitTime = (stepDur + 0.05) * 1000; // Small buffer
    activeSequence.timeoutId = setTimeout(playStep, waitTime);
  }

  playStep();

  window.dispatchEvent(new CustomEvent('controlxy:sequenceStarted', {
    detail: { name, options }
  }));

  return true;
}

/**
 * Stop active sequence
 */
export function stopSequence() {
  if (activeSequence) {
    activeSequence.stopped = true;
    clearTimeout(activeSequence.timeoutId);
    console.log(`[controlXY] Stopped sequence "${activeSequence.name}"`);
    activeSequence = null;
  }
  stopAllTweens();
}

/**
 * Get active sequence info
 */
export function getActiveSequence() {
  if (!activeSequence) return null;
  return {
    name: activeSequence.name,
    currentStep: activeSequence.currentStep,
    totalSteps: activeSequence.sequence.length,
    loopCount: activeSequence.loopCount
  };
}

// ============================================================================
// PERSISTENCE - SERVER
// ============================================================================

/**
 * Initialize preset system for a project
 */
export async function initPresets(projectId) {
  presetStore.projectId = projectId;
  presetStore.presets = {};
  presetStore.sequences = {};

  // Load from server
  await loadPresetsFromServer();

  console.log(`[controlXY] Presets initialized for project "${projectId}"`);
}

/**
 * Save presets to server
 */
async function savePresetsToServer() {
  if (!presetStore.projectId) return;

  try {
    const response = await fetch('/api/controlxy-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: presetStore.projectId,
        presets: presetStore.presets,
        sequences: presetStore.sequences
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    console.log(`[controlXY] Presets saved to server`);
  } catch (err) {
    console.error("[controlXY] Failed to save presets:", err);
  }
}

/**
 * Load presets from server
 */
async function loadPresetsFromServer() {
  if (!presetStore.projectId) return;

  try {
    const response = await fetch(`/api/controlxy-presets?projectId=${presetStore.projectId}`);

    if (response.status === 404) {
      console.log("[controlXY] No presets file found, starting fresh");
      return;
    }

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    presetStore.presets = data.presets || {};
    presetStore.sequences = data.sequences || {};

    console.log(`[controlXY] Loaded ${Object.keys(presetStore.presets).length} presets from server`);
  } catch (err) {
    console.error("[controlXY] Failed to load presets:", err);
  }
}

// ============================================================================
// PERSISTENCE - EXPORT/IMPORT
// ============================================================================

/**
 * Export presets as JSON
 */
export function exportPresets() {
  return JSON.stringify({
    presets: presetStore.presets,
    sequences: presetStore.sequences,
    exportedAt: Date.now(),
    projectId: presetStore.projectId
  }, null, 2);
}

/**
 * Import presets from JSON
 */
export function importPresets(json, merge = false) {
  try {
    const data = typeof json === 'string' ? JSON.parse(json) : json;

    if (merge) {
      Object.assign(presetStore.presets, data.presets || {});
      Object.assign(presetStore.sequences, data.sequences || {});
    } else {
      presetStore.presets = data.presets || {};
      presetStore.sequences = data.sequences || {};
    }

    console.log(`[controlXY] Imported ${Object.keys(presetStore.presets).length} presets`);

    if (presetStore.projectId) {
      savePresetsToServer();
    }

    window.dispatchEvent(new CustomEvent('controlxy:presetsImported', {
      detail: { count: Object.keys(presetStore.presets).length }
    }));

    return true;
  } catch (err) {
    console.error("[controlXY] Import failed:", err);
    return false;
  }
}

/**
 * Import presets from another project
 */
export async function importFromProject(sourceProjectId, merge = true) {
  try {
    const response = await fetch(`/api/controlxy-presets?projectId=${sourceProjectId}`);

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return importPresets(data, merge);
  } catch (err) {
    console.error(`[controlXY] Failed to import from project "${sourceProjectId}":`, err);
    return false;
  }
}

// ============================================================================
// DSL HANDLERS
// ============================================================================

/**
 * Handle controlXYSave DSL cue
 */
export function handleControlXYSaveCue(el, args = [], options = {}) {
  const cfg = {};
  for (const a of args) {
    if (a?.type) cfg[a.type] = a.value;
  }

  const presetName = cfg.preset || cfg.name;
  const uidFilter = cfg.uid || null;

  if (!presetName) {
    console.warn("[controlXYSave] preset name required");
    return;
  }

  savePreset(presetName, uidFilter);
}

/**
 * Handle controlXYRecall DSL cue
 */
export function handleControlXYRecallCue(el, args = [], options = {}) {
  const cfg = {};
  for (const a of args) {
    if (a?.type) cfg[a.type] = a.value;
  }

  const presetName = cfg.preset || cfg.name;

  if (!presetName) {
    console.warn("[controlXYRecall] preset name required");
    return;
  }

  recallPreset(presetName, {
    dur: cfg.dur ?? 0,
    ease: cfg.ease ?? 'easeInOutSine',
    handles: cfg.handles
  });
}

/**
 * Handle controlXYSequence DSL cue
 */
export function handleControlXYSequenceCue(el, args = [], options = {}) {
  const cfg = {};
  for (const a of args) {
    if (a?.type) cfg[a.type] = a.value;
  }

  const seqName = cfg.seq || cfg.sequence || cfg.name;

  if (!seqName) {
    console.warn("[controlXYSequence] sequence name required");
    return;
  }

  playSequence(seqName, {
    dur: cfg.dur ?? 1,
    ease: cfg.ease ?? 'easeInOutSine',
    loop: cfg.loop ?? false
  });
}

// ============================================================================
// GLOBAL API
// ============================================================================

// Registry for controlXY instances
window._controlXYRegistry = window._controlXYRegistry || new Map();

// Expose API
window.controlXYPresets = {
  // Presets
  save: savePreset,
  recall: recallPreset,
  delete: deletePreset,
  list: listPresets,
  get: getPreset,

  // Tweening
  tweenTo,
  stopAllTweens,

  // Sequences
  defineSequence,
  playSequence,
  stopSequence,
  getActiveSequence,

  // Persistence
  init: initPresets,
  export: exportPresets,
  import: importPresets,
  importFromProject,

  // Internal access
  _store: presetStore,
  _activeTweens: activeTweens
};

console.log("[controlXYPresets] Module loaded. API available at window.controlXYPresets");
