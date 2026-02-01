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

import { publish } from "./paramBinding.js";
import { sendOSCMessage } from "../cues/osc.js";

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
 * Save a preset from explicit position data (programmatic creation)
 * 
 * @param {string} name - Preset name
 * @param {Object} data - Position data in format:
 *   {
 *     uid1: { handleId1: { x: 0.5, y: 0.8 }, handleId2: { x: 0.2, y: 0.3 } },
 *     uid2: { handleId: { x: 0.7, y: 0.4 } }
 *   }
 * @param {Object} options - Optional metadata
 * @returns {boolean} Success
 * 
 * @example
 * // Save a single-pad, single-handle preset
 * savePresetFromData('center', {
 *   pad1: { dot1: { x: 0.5, y: 0.5 } }
 * });
 * 
 * @example
 * // Save multi-pad, multi-handle preset
 * savePresetFromData('complex', {
 *   pad1: { dot1: { x: 0.2, y: 0.8 }, dot2: { x: 0.8, y: 0.2 } },
 *   pad2: { handle1: { x: 0.5, y: 0.5 } }
 * });
 */
export function savePresetFromData(name, data, options = {}) {
  if (!name) {
    console.warn("[controlXY] savePresetFromData: name required");
    return false;
  }
  
  if (!data || typeof data !== 'object') {
    console.warn("[controlXY] savePresetFromData: data must be an object");
    return false;
  }
  
  // Validate data format
  const validatedData = {};
  let hasValidData = false;
  
  for (const [uid, handles] of Object.entries(data)) {
    if (typeof handles !== 'object') continue;
    
    const validatedHandles = {};
    for (const [handleId, pos] of Object.entries(handles)) {
      if (typeof pos !== 'object') continue;
      if (typeof pos.x !== 'number' || typeof pos.y !== 'number') continue;
      
      // Clamp to 0-1 range and round
      validatedHandles[handleId] = {
        x: Math.round(Math.max(0, Math.min(1, pos.x)) * 1000) / 1000,
        y: Math.round(Math.max(0, Math.min(1, pos.y)) * 1000) / 1000
      };
      hasValidData = true;
    }
    
    if (Object.keys(validatedHandles).length > 0) {
      validatedData[uid] = validatedHandles;
    }
  }
  
  if (!hasValidData) {
    console.warn("[controlXY] savePresetFromData: no valid position data found");
    return false;
  }
  
  presetStore.presets[name] = {
    ...validatedData,
    _meta: {
      savedAt: Date.now(),
      programmatic: true,
      ...options
    }
  };
  
  console.log(`[controlXY] Saved programmatic preset "${name}":`, validatedData);
  
  // Auto-save to server if project is set
  if (presetStore.projectId) {
    savePresetsToServer();
  }
  
  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('controlxy:presetSaved', {
    detail: { name, state: validatedData }
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
 * 
 * Supports multiple formats:
 * 
 * 1. Simple format (applies to ALL controlXY instances):
 *    tweenTo({ x: 0.5, y: 0.5 }, 2, 'easeInOutSine')
 *    tweenTo(0.3, 0.7, 2, 'easeInOutSine')  // positional args
 * 
 * 2. Per-handle format (for multi-handle pads):
 *    tweenTo([
 *      { x: 0.2, y: 0.8 },
 *      { x: 0.5, y: 0.5 },
 *      { x: 0.8, y: 0.3 }
 *    ], 2)
 * 
 * 3. Explicit UIDs (original format):
 *    tweenTo({
 *      "pad1": { "dot1": { x: 0.5, y: 0.5 } }
 *    }, 2)
 */
export function tweenTo(positions, dur = 1, ease = 'easeInOutSine', _ease2) {
  // Handle positional arguments: tweenTo(x, y, dur, ease)
  if (typeof positions === 'number' && typeof dur === 'number' && !_ease2) {
    const x = positions;
    const y = dur;
    dur = ease;
    ease = _ease2 || 'easeInOutSine';
    positions = { x, y };
  }
  
  // Normalize ease parameter position
  if (typeof ease === 'number') {
    const temp = dur;
    dur = ease;
    ease = _ease2 || 'easeInOutSine';
  }
  
  const instances = getAllControlXY();
  
  if (instances.length === 0) {
    console.warn("[controlXY] tweenTo: no controlXY instances found");
    return;
  }
  
  // Format 1: Simple object { x, y } - applies to ALL handles
  if (positions.x !== undefined && positions.y !== undefined && !Array.isArray(positions)) {
    console.log(`[controlXY] tweenTo: moving all handles to (${positions.x}, ${positions.y})`);
    
    for (const instance of instances) {
      for (const handle of instance.handles) {
        startTween({
          instance,
          handle,
          targetX: positions.x,
          targetY: positions.y,
          dur,
          ease
        });
      }
    }
    return;
  }
  
  // Format 2: Array of positions - applies to handles by index
  if (Array.isArray(positions)) {
    console.log(`[controlXY] tweenTo: moving handles by index (${positions.length} positions)`);
    
    for (const instance of instances) {
      for (let i = 0; i < instance.handles.length; i++) {
        const pos = positions[i % positions.length]; // Wrap around if needed
        if (!pos) continue;
        
        startTween({
          instance,
          handle: instance.handles[i],
          targetX: pos.x,
          targetY: pos.y,
          dur,
          ease
        });
      }
    }
    return;
  }
  
  // Format 3: Original explicit UID format
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
 * 
 * Supports nested sequences - a sequence can reference other sequences!
 * Use prefix 'seq:' to reference another sequence
 * 
 * @example
 * // Define base sequences
 * defineSequence('pattern_a', ['state1', 'state2', 'state3']);
 * defineSequence('pattern_b', ['state4', 'state5', 'state6']);
 * 
 * // Define meta-sequence that combines them
 * defineSequence('meta', ['seq:pattern_a', 'seq:pattern_b', 'seq:pattern_a']);
 * 
 * // When played, 'meta' will expand to:
 * // ['state1', 'state2', 'state3', 'state4', 'state5', 'state6', 'state1', 'state2', 'state3']
 */
export function defineSequence(name, steps) {
  presetStore.sequences[name] = steps;
  console.log(`[controlXY] Defined sequence "${name}":`, steps);
  
  if (presetStore.projectId) {
    savePresetsToServer();
  }
  
  return true;
}

/**
 * Expand a sequence, resolving any nested sequence references
 * 
 * @param {Array} steps - Sequence steps (may contain 'seq:name' references)
 * @param {Set} visited - Track visited sequences to prevent infinite loops
 * @returns {Array} Expanded flat sequence
 */
function expandSequence(steps, visited = new Set()) {
  const expanded = [];
  
  for (const step of steps) {
    // Check if this is a sequence reference
    if (typeof step === 'string' && step.startsWith('seq:')) {
      const seqName = step.slice(4); // Remove 'seq:' prefix
      
      // Prevent infinite loops
      if (visited.has(seqName)) {
        console.warn(`[controlXY] Circular reference detected: ${seqName}`);
        continue;
      }
      
      // Get the referenced sequence
      const nestedSeq = presetStore.sequences[seqName];
      if (!nestedSeq) {
        console.warn(`[controlXY] Nested sequence "${seqName}" not found`);
        continue;
      }
      
      // Recursively expand nested sequence
      visited.add(seqName);
      const nestedExpanded = expandSequence(nestedSeq, visited);
      visited.delete(seqName);
      
      expanded.push(...nestedExpanded);
    } else {
      // Regular preset or step object
      expanded.push(step);
    }
  }
  
  return expanded;
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
  
  // Expand nested sequences
  const expandedSequence = expandSequence(sequence);
  console.log(`[controlXY] Playing sequence "${name}" (${sequence.length} steps → ${expandedSequence.length} expanded)`);
  
  const defaultDur = options.dur ?? 1;
  const defaultEase = options.ease ?? 'easeInOutSine';
  const loop = options.loop ?? false;
  const onStep = options.onStep || (() => {});
  const onComplete = options.onComplete || (() => {});
  
  let currentStep = 0;
  let loopCount = 0;
  const maxLoops = loop === true ? Infinity : (loop || 1);
  
  activeSequence = {
    name,
    sequence: expandedSequence,  // Store expanded sequence
    currentStep,
    loopCount,
    maxLoops,
    timeoutId: null,
    stopped: false
  };
  
  function playStep() {
    if (activeSequence?.stopped) return;
    
    if (currentStep >= expandedSequence.length) {
      loopCount++;
      if (loopCount >= maxLoops) {
        console.log(`[controlXY] Sequence "${name}" complete`);
        onComplete();
        activeSequence = null;
        return;
      }
      currentStep = 0;
    }
    
    const step = expandedSequence[currentStep];
    let presetName, stepDur, stepEase;
    
    if (typeof step === 'string') {
      presetName = step;
      stepDur = Array.isArray(defaultDur) ? defaultDur[currentStep % defaultDur.length] : defaultDur;
      stepEase = Array.isArray(defaultEase) ? defaultEase[currentStep % defaultEase.length] : defaultEase;
    } else if (typeof step === 'object') {
      presetName = step.preset;
      stepDur = step.dur ?? defaultDur;
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
// PATTERN GENERATORS
// ============================================================================

/**
 * Generate Lissajous curve presets
 * 
 * @param {string} baseName - Base name for presets (will append numbers)
 * @param {Object} options - Generation options
 * @returns {Array} Array of preset names
 * 
 * @example
 * const presets = generateLissajous('lissa', {
 *   uid: 'pad1',
 *   handleId: 'dot1',
 *   xCycles: 3,
 *   yCycles: 2,
 *   steps: 60,
 *   phase: 0,
 *   amplitude: 0.4
 * });
 * 
 * defineSequence('lissajous_3_2', presets);
 * playSequence('lissajous_3_2', { dur: 0.1, ease: 'linear', loop: true });
 */
export function generateLissajous(baseName, options = {}) {
  const {
    uid = 'pad1',
    handleId = 'dot1',
    xCycles = 3,
    yCycles = 2,
    steps = 60,
    phase = 0,
    amplitude = 0.4,
    centerX = 0.5,
    centerY = 0.5
  } = options;
  
  const presetNames = [];
  
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = centerX + amplitude * Math.sin(xCycles * t);
    const y = centerY + amplitude * Math.sin(yCycles * t + phase);
    
    const name = `${baseName}_${i}`;
    savePresetFromData(name, {
      [uid]: { [handleId]: { x, y } }
    });
    
    presetNames.push(name);
  }
  
  console.log(`[controlXY] Generated ${presetNames.length} Lissajous presets (${xCycles}:${yCycles})`);
  return presetNames;
}

/**
 * Generate circular motion presets
 * 
 * @param {string} baseName - Base name for presets
 * @param {Object} options - Generation options
 * @returns {Array} Array of preset names
 * 
 * @example
 * const circle = generateCircle('orbit', {
 *   uid: 'pad1',
 *   handleId: 'dot1',
 *   radius: 0.4,
 *   steps: 32
 * });
 * 
 * defineSequence('orbit', circle);
 * playSequence('orbit', { dur: 0.1, loop: true });
 */
export function generateCircle(baseName, options = {}) {
  const {
    uid = 'pad1',
    handleId = 'dot1',
    radius = 0.4,
    steps = 32,
    centerX = 0.5,
    centerY = 0.5,
    startAngle = 0
  } = options;
  
  const presetNames = [];
  
  for (let i = 0; i <= steps; i++) {
    const angle = startAngle + (i / steps) * Math.PI * 2;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    
    const name = `${baseName}_${i}`;
    savePresetFromData(name, {
      [uid]: { [handleId]: { x, y } }
    });
    
    presetNames.push(name);
  }
  
  console.log(`[controlXY] Generated ${presetNames.length} circular presets`);
  return presetNames;
}

/**
 * Generate spiral motion presets
 * 
 * @param {string} baseName - Base name for presets
 * @param {Object} options - Generation options
 * @returns {Array} Array of preset names
 * 
 * @example
 * const spiral = generateSpiral('spiral', {
 *   uid: 'pad1',
 *   handleId: 'dot1',
 *   innerRadius: 0.1,
 *   outerRadius: 0.45,
 *   turns: 3,
 *   steps: 100
 * });
 */
export function generateSpiral(baseName, options = {}) {
  const {
    uid = 'pad1',
    handleId = 'dot1',
    innerRadius = 0.1,
    outerRadius = 0.45,
    turns = 3,
    steps = 100,
    centerX = 0.5,
    centerY = 0.5
  } = options;
  
  const presetNames = [];
  
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = t * turns * Math.PI * 2;
    const radius = innerRadius + (outerRadius - innerRadius) * t;
    
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    
    const name = `${baseName}_${i}`;
    savePresetFromData(name, {
      [uid]: { [handleId]: { x, y } }
    });
    
    presetNames.push(name);
  }
  
  console.log(`[controlXY] Generated ${presetNames.length} spiral presets`);
  return presetNames;
}

/**
 * Generate random walk presets
 * 
 * @param {string} baseName - Base name for presets
 * @param {Object} options - Generation options
 * @returns {Array} Array of preset names
 * 
 * @example
 * const walk = generateRandomWalk('wander', {
 *   uid: 'pad1',
 *   handleId: 'dot1',
 *   steps: 50,
 *   stepSize: 0.1,
 *   startX: 0.5,
 *   startY: 0.5
 * });
 */
export function generateRandomWalk(baseName, options = {}) {
  const {
    uid = 'pad1',
    handleId = 'dot1',
    steps = 50,
    stepSize = 0.1,
    startX = 0.5,
    startY = 0.5,
    seed = null
  } = options;
  
  const presetNames = [];
  let x = startX;
  let y = startY;
  
  // Simple seeded random if provided
  let random = seed !== null 
    ? () => {
        const a = Math.sin(seed++) * 10000;
        return a - Math.floor(a);
      }
    : Math.random;
  
  for (let i = 0; i <= steps; i++) {
    const name = `${baseName}_${i}`;
    
    // Clamp to 0-1 range
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));
    
    savePresetFromData(name, {
      [uid]: { [handleId]: { x: clampedX, y: clampedY } }
    });
    
    presetNames.push(name);
    
    // Take random step
    const angle = random() * Math.PI * 2;
    x += Math.cos(angle) * stepSize;
    y += Math.sin(angle) * stepSize;
  }
  
  console.log(`[controlXY] Generated ${presetNames.length} random walk presets`);
  return presetNames;
}

/**
 * Generate grid pattern presets
 * 
 * @param {string} baseName - Base name for presets
 * @param {Object} options - Generation options
 * @returns {Array} Array of preset names
 * 
 * @example
 * const grid = generateGrid('grid', {
 *   uid: 'pad1',
 *   handleId: 'dot1',
 *   rows: 4,
 *   cols: 4,
 *   margin: 0.1
 * });
 */
export function generateGrid(baseName, options = {}) {
  const {
    uid = 'pad1',
    handleId = 'dot1',
    rows = 4,
    cols = 4,
    margin = 0.1
  } = options;
  
  const presetNames = [];
  const usableWidth = 1 - 2 * margin;
  const usableHeight = 1 - 2 * margin;
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = margin + (col / (cols - 1)) * usableWidth;
      const y = margin + (row / (rows - 1)) * usableHeight;
      
      const name = `${baseName}_${row}_${col}`;
      savePresetFromData(name, {
        [uid]: { [handleId]: { x, y } }
      });
      
      presetNames.push(name);
    }
  }
  
  console.log(`[controlXY] Generated ${presetNames.length} grid presets (${rows}x${cols})`);
  return presetNames;
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
  saveFromData: savePresetFromData,
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
  
  // Pattern Generators
  generateLissajous,
  generateCircle,
  generateSpiral,
  generateRandomWalk,
  generateGrid,
  
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
