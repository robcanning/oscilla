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
 *   - Scenes (save/recall complete launcher state + handle positions)
 *   - localStorage persistence via controlXYShared.js
 *
 * This module uses controlXYShared.js as the single source of truth for state.
 */

import { publish } from "./paramBinding.js";
import { sendOSCMessage } from "../cues/osc.js";
import * as shared from "./controlXYShared.js";

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

// Active tween state
let activeTweens = new Map(); // uid -> tween state
let activeSequence = null;

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
  
  const positions = captureState(uidFilter);
  
  if (Object.keys(positions).length === 0) {
    console.warn("[controlXY] savePreset: no controlXY instances found");
    return false;
  }
  
  const data = {
    ...positions,
    _meta: { savedAt: shared.nowMs(), filter: uidFilter }
  };
  
  shared.savePreset(name, data);
  
  console.log(`[controlXY] Saved preset "${name}":`, positions);
  
  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('controlxy:presetSaved', {
    detail: { name, positions }
  }));
  
  return true;
}

/**
 * Save a preset from explicit position data (programmatic creation)
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
  
  // Validate and normalize data structure
  const normalizedState = {};
  
  for (const [uid, handles] of Object.entries(data)) {
    if (typeof handles !== 'object') continue;
    
    const normalizedHandles = {};
    for (const [handleId, pos] of Object.entries(handles)) {
      if (typeof pos !== 'object') continue;
      
      const x = typeof pos.x === 'number' ? Math.max(0, Math.min(1, pos.x)) : 0.5;
      const y = typeof pos.y === 'number' ? Math.max(0, Math.min(1, pos.y)) : 0.5;
      
      normalizedHandles[handleId] = {
        x: Math.round(x * 1000) / 1000,
        y: Math.round(y * 1000) / 1000
      };
    }
    
    if (Object.keys(normalizedHandles).length > 0) {
      normalizedState[uid] = normalizedHandles;
    }
  }
  
  if (Object.keys(normalizedState).length === 0) {
    console.warn("[controlXY] savePresetFromData: no valid position data found");
    return false;
  }
  
  const presetData = {
    ...normalizedState,
    _meta: { savedAt: shared.nowMs(), source: 'data', ...options }
  };
  
  shared.savePreset(name, presetData);
  
  console.log(`[controlXY] Saved preset from data "${name}":`, normalizedState);
  
  return true;
}

/**
 * Delete a preset
 */
export function deletePreset(name) {
  const result = shared.deletePreset(name);
  
  if (result) {
    console.log(`[controlXY] Deleted preset "${name}"`);
    window.dispatchEvent(new CustomEvent('controlxy:presetDeleted', {
      detail: { name }
    }));
  }
  
  return result;
}

/**
 * List all preset names
 */
export function listPresets() {
  return shared.listPresets();
}

/**
 * Get preset data by name
 */
export function getPreset(name) {
  const item = shared.getPreset(name);
  return item?.data || null;
}

/**
 * Recall a preset by name
 */
export function recallPreset(name, options = {}) {
  const presetData = getPreset(name);
  
  if (!presetData) {
    console.warn(`[controlXY] Preset "${name}" not found`);
    return false;
  }
  
  const { dur = 0, ease = 'easeInOutSine', handles: handleFilter } = options;
  
  // Extract position data (exclude _meta)
  const positions = {};
  for (const [key, val] of Object.entries(presetData)) {
    if (key !== '_meta') {
      positions[key] = val;
    }
  }
  
  if (dur <= 0) {
    // Instant recall
    applyPositions(positions, handleFilter);
  } else {
    // Tween to positions
    tweenTo(positions, { dur, ease, handles: handleFilter });
  }
  
  console.log(`[controlXY] Recalled preset "${name}"`, dur > 0 ? `(tween ${dur}s)` : '(instant)');
  
  window.dispatchEvent(new CustomEvent('controlxy:presetRecalled', {
    detail: { name, dur }
  }));
  
  return true;
}

/**
 * Apply positions instantly
 */
function applyPositions(positions, handleFilter = null) {
  for (const [uid, handlePositions] of Object.entries(positions)) {
    const instance = getControlXY(uid);
    if (!instance) continue;
    
    for (const handle of instance.handles) {
      if (handleFilter && !handleFilter.includes(handle.id)) continue;
      
      const pos = handlePositions[handle.id];
      if (!pos) continue;
      
      const bbox = instance.boundsEl?.getBBox();
      if (!bbox) continue;
      
      // Convert normalized to world coordinates
      const targetX = bbox.x + pos.x * bbox.width;
      const targetY = bbox.y + (1 - pos.y) * bbox.height;
      
      // Apply position
      handle.curX = targetX;
      handle.curY = targetY;
      handle.offsetX = targetX - handle.originalCenterX;
      handle.offsetY = targetY - handle.originalCenterY;
      
      handle.el.setAttribute("transform", `translate(${handle.offsetX}, ${handle.offsetY})`);
      
      // Emit new values
      emitHandleValues(instance, handle);
    }
  }
}

/**
 * Emit values for a handle (publish + OSC)
 */
function emitHandleValues(instance, handle) {
  const bbox = instance.boundsEl?.getBBox();
  if (!bbox) return;
  
  const normX = Math.max(0, Math.min(1, (handle.curX - bbox.x) / bbox.width));
  const normY = Math.max(0, Math.min(1, 1 - (handle.curY - bbox.y) / bbox.height));
  
  // Publish to control plane
  publish("controlXY", instance.uid, {
    handle: handle.id,
    x: normX,
    y: normY,
    [`${handle.id}.x`]: normX,
    [`${handle.id}.y`]: normY
  });
  
  // Update label if exists
  if (handle.label && instance.updateLabel) {
    instance.updateLabel(handle.label, handle.el, normX, normY, handle.offsetX, handle.offsetY);
  }
  
  // OSC output
  if (instance.oscEnabled) {
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

// ============================================================================
// TWEENING
// ============================================================================

/**
 * Tween handles to target positions
 */
export function tweenTo(positions, options = {}) {
  const { dur = 1, ease = 'easeInOutSine', handles: handleFilter, onComplete } = options;
  const easeFunc = getEasing(ease);
  const durationMs = dur * 1000;
  
  // Stop any active tweens for affected UIDs
  for (const uid of Object.keys(positions)) {
    if (activeTweens.has(uid)) {
      cancelAnimationFrame(activeTweens.get(uid).rafId);
      activeTweens.delete(uid);
    }
  }
  
  // Capture start positions
  const startPositions = captureState();
  const startTime = performance.now();
  
  function animate() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    const easedProgress = easeFunc(progress);
    
    // Interpolate positions
    for (const [uid, handlePositions] of Object.entries(positions)) {
      const instance = getControlXY(uid);
      if (!instance) continue;
      
      const startUid = startPositions[uid] || {};
      
      for (const handle of instance.handles) {
        if (handleFilter && !handleFilter.includes(handle.id)) continue;
        
        const targetPos = handlePositions[handle.id];
        const startPos = startUid[handle.id];
        if (!targetPos) continue;
        
        const startX = startPos?.x ?? 0.5;
        const startY = startPos?.y ?? 0.5;
        
        const currentX = startX + (targetPos.x - startX) * easedProgress;
        const currentY = startY + (targetPos.y - startY) * easedProgress;
        
        const bbox = instance.boundsEl?.getBBox();
        if (!bbox) continue;
        
        // Convert to world coordinates
        const worldX = bbox.x + currentX * bbox.width;
        const worldY = bbox.y + (1 - currentY) * bbox.height;
        
        // Apply
        handle.curX = worldX;
        handle.curY = worldY;
        handle.offsetX = worldX - handle.originalCenterX;
        handle.offsetY = worldY - handle.originalCenterY;
        
        handle.el.setAttribute("transform", `translate(${handle.offsetX}, ${handle.offsetY})`);
        
        emitHandleValues(instance, handle);
      }
    }
    
    if (progress < 1) {
      const rafId = requestAnimationFrame(animate);
      // Store for potential cancellation
      for (const uid of Object.keys(positions)) {
        activeTweens.set(uid, { rafId, startTime, durationMs });
      }
    } else {
      // Complete
      for (const uid of Object.keys(positions)) {
        activeTweens.delete(uid);
      }
      onComplete?.();
    }
  }
  
  animate();
}

/**
 * Stop all active tweens
 */
export function stopAllTweens() {
  for (const [uid, state] of activeTweens) {
    cancelAnimationFrame(state.rafId);
  }
  activeTweens.clear();
}

// ============================================================================
// SEQUENCES
// ============================================================================

/**
 * Define a named sequence
 */
export function defineSequence(name, steps, options = {}) {
  if (!name || !Array.isArray(steps)) {
    console.warn("[controlXY] defineSequence: name and steps array required");
    return false;
  }
  
  shared.saveSequence(name, steps, options);
  
  console.log(`[controlXY] Defined sequence "${name}" with ${steps.length} steps`);
  
  return true;
}

/**
 * Get sequence data
 */
export function getSequence(name) {
  const item = shared.getSequence(name);
  return item?.data || null;
}

/**
 * List all sequence names
 */
export function listSequences() {
  return shared.listSequences();
}

/**
 * Play a sequence
 */
export function playSequence(name, options = {}) {
  const seqData = getSequence(name);
  
  if (!seqData) {
    console.warn(`[controlXY] Sequence "${name}" not found`);
    return false;
  }
  
  // Stop any currently playing sequence
  stopSequence();
  
  const steps = seqData.steps || seqData; // Support legacy format
  const loop = options.loop ?? seqData.loop ?? false;
  const defaultDur = options.dur ?? seqData.defaultDur ?? 1;
  const defaultEase = options.ease ?? seqData.defaultEase ?? 'easeInOutSine';
  
  let currentStep = 0;
  let loopCount = 0;
  const maxLoops = typeof loop === 'number' ? loop : (loop ? Infinity : 1);
  
  activeSequence = {
    name,
    steps,
    currentStep,
    loop: maxLoops,
    loopCount,
    stopped: false
  };
  
  function playStep() {
    if (activeSequence?.stopped) {
      activeSequence = null;
      return;
    }
    
    if (currentStep >= steps.length) {
      loopCount++;
      if (loopCount >= maxLoops) {
        console.log(`[controlXY] Sequence "${name}" completed`);
        activeSequence = null;
        window.dispatchEvent(new CustomEvent('controlxy:sequenceComplete', {
          detail: { name }
        }));
        return;
      }
      currentStep = 0;
    }
    
    const step = steps[currentStep];
    const presetName = typeof step === 'string' ? step : step.preset;
    const stepDur = typeof step === 'object' ? (step.dur ?? defaultDur) : defaultDur;
    const stepEase = typeof step === 'object' ? (step.ease ?? defaultEase) : defaultEase;
    
    recallPreset(presetName, {
      dur: stepDur,
      ease: stepEase
    });
    
    currentStep++;
    if (activeSequence) activeSequence.currentStep = currentStep;
    
    // Schedule next step
    setTimeout(playStep, stepDur * 1000);
  }
  
  playStep();
  
  console.log(`[controlXY] Playing sequence "${name}" (${steps.length} steps, loop: ${maxLoops})`);
  
  return true;
}

/**
 * Stop current sequence
 */
export function stopSequence() {
  if (activeSequence) {
    activeSequence.stopped = true;
    console.log(`[controlXY] Stopped sequence "${activeSequence.name}"`);
  }
  activeSequence = null;
  stopAllTweens();
}

/**
 * Get active sequence info
 */
export function getActiveSequence() {
  return activeSequence;
}

// ============================================================================
// SCENES - Save/recall complete state (launchers + handle positions)
// ============================================================================

/**
 * Save current state as a named scene
 * Includes: all launcher slot assignments, bank selection, mode, tween, + handle positions
 */
export function saveScene(name) {
  if (!name) {
    console.warn("[controlXY] saveScene: name required");
    return false;
  }
  
  // Capture current handle positions
  const handlePositions = captureState();
  
  // Capture current launcher states
  const launcherStates = {};
  for (const uid of shared.listLaunchers()) {
    const launcher = shared.getLauncher(uid);
    if (launcher?.data) {
      launcherStates[uid] = JSON.parse(JSON.stringify(launcher.data));
    }
  }
  
  const sceneData = {
    handlePositions,
    launchers: launcherStates,
    savedAt: shared.nowMs()
  };
  
  // Save as a scene item
  const existing = shared.state.items.find(i => i.kind === 'scene' && i.name === name);
  
  if (existing) {
    shared.updateItem(existing.id, { data: sceneData });
  } else {
    shared.addItem({
      kind: 'scene',
      name,
      data: sceneData,
      scope: 'local'
    });
  }
  
  console.log(`[controlXY] Saved scene "${name}"`);
  
  window.dispatchEvent(new CustomEvent('controlxy:sceneSaved', {
    detail: { name }
  }));
  
  return true;
}

/**
 * Recall a saved scene
 */
export function recallScene(name, options = {}) {
  const item = shared.state.items.find(i => i.kind === 'scene' && i.name === name);
  
  if (!item?.data) {
    console.warn(`[controlXY] Scene "${name}" not found`);
    return false;
  }
  
  const { dur = 0, ease = 'easeInOutSine' } = options;
  const sceneData = item.data;
  
  // Restore launcher states
  if (sceneData.launchers) {
    for (const [uid, launcherData] of Object.entries(sceneData.launchers)) {
      shared.saveLauncher(uid, launcherData);
    }
    
    // Trigger launcher refresh
    window.dispatchEvent(new CustomEvent('controlxy:launcherRefresh', {
      detail: {}
    }));
  }
  
  // Restore handle positions
  if (sceneData.handlePositions) {
    if (dur <= 0) {
      applyPositions(sceneData.handlePositions);
    } else {
      tweenTo(sceneData.handlePositions, { dur, ease });
    }
  }
  
  console.log(`[controlXY] Recalled scene "${name}"`);
  
  window.dispatchEvent(new CustomEvent('controlxy:sceneRecalled', {
    detail: { name }
  }));
  
  return true;
}

/**
 * Delete a scene
 */
export function deleteScene(name) {
  const item = shared.state.items.find(i => i.kind === 'scene' && i.name === name);
  
  if (!item) {
    console.warn(`[controlXY] Scene "${name}" not found`);
    return false;
  }
  
  shared.deleteItem(item.id);
  
  console.log(`[controlXY] Deleted scene "${name}"`);
  
  window.dispatchEvent(new CustomEvent('controlxy:sceneDeleted', {
    detail: { name }
  }));
  
  return true;
}

/**
 * List all scene names
 */
export function listScenes() {
  return shared.state.items
    .filter(i => i.kind === 'scene')
    .map(i => i.name);
}

/**
 * Get scene data
 */
export function getScene(name) {
  const item = shared.state.items.find(i => i.kind === 'scene' && i.name === name);
  return item?.data || null;
}

// ============================================================================
// PATTERN GENERATORS
// ============================================================================

export function generateLissajous(name, options = {}) {
  const {
    uid = null,
    handleId = null,
    steps = 32,
    freqX = 3,
    freqY = 2,
    phaseX = 0,
    phaseY = Math.PI / 2,
    dur = 0.5
  } = options;
  
  const presets = [];
  
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const x = 0.5 + 0.45 * Math.sin(freqX * t + phaseX);
    const y = 0.5 + 0.45 * Math.sin(freqY * t + phaseY);
    
    const presetName = `${name}_${i}`;
    
    if (uid && handleId) {
      savePresetFromData(presetName, {
        [uid]: { [handleId]: { x, y } }
      });
    }
    
    presets.push({ preset: presetName, dur });
  }
  
  defineSequence(name, presets, { loop: true });
  
  return presets;
}

export function generateCircle(name, options = {}) {
  return generateLissajous(name, {
    ...options,
    freqX: 1,
    freqY: 1,
    phaseX: 0,
    phaseY: Math.PI / 2
  });
}

export function generateSpiral(name, options = {}) {
  const {
    uid = null,
    handleId = null,
    steps = 64,
    turns = 3,
    dur = 0.3
  } = options;
  
  const presets = [];
  
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const angle = t * turns * Math.PI * 2;
    const radius = 0.1 + t * 0.4;
    
    const x = 0.5 + radius * Math.cos(angle);
    const y = 0.5 + radius * Math.sin(angle);
    
    const presetName = `${name}_${i}`;
    
    if (uid && handleId) {
      savePresetFromData(presetName, {
        [uid]: { [handleId]: { x, y } }
      });
    }
    
    presets.push({ preset: presetName, dur });
  }
  
  defineSequence(name, presets, { loop: false });
  
  return presets;
}

export function generateRandomWalk(name, options = {}) {
  const {
    uid = null,
    handleId = null,
    steps = 16,
    stepSize = 0.15,
    dur = 0.8
  } = options;
  
  const presets = [];
  let x = 0.5, y = 0.5;
  
  for (let i = 0; i < steps; i++) {
    const angle = Math.random() * Math.PI * 2;
    x = Math.max(0.05, Math.min(0.95, x + Math.cos(angle) * stepSize));
    y = Math.max(0.05, Math.min(0.95, y + Math.sin(angle) * stepSize));
    
    const presetName = `${name}_${i}`;
    
    if (uid && handleId) {
      savePresetFromData(presetName, {
        [uid]: { [handleId]: { x, y } }
      });
    }
    
    presets.push({ preset: presetName, dur });
  }
  
  defineSequence(name, presets, { loop: true });
  
  return presets;
}

export function generateGrid(name, options = {}) {
  const {
    uid = null,
    handleId = null,
    cols = 4,
    rows = 4,
    padding = 0.1,
    dur = 0.5,
    order = 'row' // 'row', 'col', 'spiral', 'random'
  } = options;
  
  const points = [];
  
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = padding + (col / (cols - 1)) * (1 - 2 * padding);
      const y = padding + (row / (rows - 1)) * (1 - 2 * padding);
      points.push({ x, y, row, col });
    }
  }
  
  // Order points
  if (order === 'col') {
    points.sort((a, b) => a.col - b.col || a.row - b.row);
  } else if (order === 'random') {
    for (let i = points.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [points[i], points[j]] = [points[j], points[i]];
    }
  }
  
  const presets = [];
  
  for (let i = 0; i < points.length; i++) {
    const { x, y } = points[i];
    const presetName = `${name}_${i}`;
    
    if (uid && handleId) {
      savePresetFromData(presetName, {
        [uid]: { [handleId]: { x, y } }
      });
    }
    
    presets.push({ preset: presetName, dur });
  }
  
  defineSequence(name, presets, { loop: true });
  
  return presets;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize preset system for a project
 */
export async function initPresets(projectId) {
  // Initialize shared state
  shared.init(projectId);
  
  console.log(`[controlXYPresets] Initialized for project "${projectId}"`);
}

/**
 * Force immediate save (bypasses debounce)
 */
export function forceSave() {
  return shared.forceSave();
}

// ============================================================================
// EXPORT / IMPORT
// ============================================================================

/**
 * Export all data as JSON string
 */
export function exportPresets() {
  return JSON.stringify(shared.exportData(), null, 2);
}

/**
 * Import data from JSON string
 */
export function importPresets(jsonString, options = {}) {
  try {
    const data = JSON.parse(jsonString);
    return shared.importData(data, options);
  } catch (e) {
    console.warn("[controlXY] Import failed:", e);
    return false;
  }
}

// ============================================================================
// DSL CUE HANDLERS
// ============================================================================

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
    speed: cfg.speed ?? 1,
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
  getSequence,
  listSequences,
  playSequence,
  stopSequence,
  getActiveSequence,
  
  // Scenes (NEW)
  saveScene,
  recallScene,
  deleteScene,
  listScenes,
  getScene,
  
  // Pattern Generators
  generateLissajous,
  generateCircle,
  generateSpiral,
  generateRandomWalk,
  generateGrid,
  
  // Persistence
  init: initPresets,
  forceSave,
  export: exportPresets,
  import: importPresets,
  
  // Access to shared state (for debugging)
  _shared: shared,
  _activeTweens: activeTweens
};

console.log("[controlXYPresets] Module loaded. API available at window.controlXYPresets");
