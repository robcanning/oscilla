/*!
 * o2pPresets.js — Preset System for o2p Touch-Mode Fader Groups
 * Part of oscillaScore control plane
 * © 2025 Rob Canning — GPLv3
 *
 * Features:
 *   - Save/recall fader group positions as named presets
 *   - Tween between presets with easing (interpolates t along path, p for rotation)
 *   - Sequence playback with per-step timing
 *   - localStorage persistence via controlShared.js
 *
 * State per fader: { t, p }
 *   t = normalized path position (0-1)
 *   p = normalized rotation handle position (0-1), absent if no rotation handle
 */

import * as shared from "./controlShared.js";
import { getEasing } from "./easing.js";
import { lerpAngleNorm } from "./rotationMath.js";

// Active tween/sequence state
const activeTweens = new Map(); // groupId -> { rafId, ... }
let activeSequence = null;
let sequenceTimeoutId = null;

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get a group from the registry
 */
function getGroup(groupId) {
  return window._o2pTouchGroups?.[groupId] || null;
}

/**
 * List all registered group IDs
 */
export function listGroups() {
  return Object.keys(window._o2pTouchGroups || {});
}

// ============================================================================
// CAPTURE STATE
// ============================================================================

/**
 * Capture current state of a group (or all groups)
 */
function captureState(groupFilter = null) {
  const state = {};
  const groups = window._o2pTouchGroups || {};

  for (const [groupId, group] of Object.entries(groups)) {
    if (groupFilter && groupId !== groupFilter) continue;

    if (typeof group.captureState === 'function') {
      const groupState = group.captureState();
      if (groupState && Object.keys(groupState).length > 0) {
        state[groupId] = groupState;
      }
    }
  }

  return state;
}

// ============================================================================
// PRESET MANAGEMENT
// ============================================================================

/**
 * Save current fader positions as a named preset
 */
export function savePreset(name, groupFilter = null) {
  if (!name) {
    console.warn("[o2p] savePreset: name required");
    return false;
  }

  const positions = captureState(groupFilter);

  if (Object.keys(positions).length === 0) {
    console.warn("[o2p] savePreset: no o2p groups found or no faders registered");
    return false;
  }

  const data = {
    ...positions,
    _meta: { savedAt: shared.nowMs(), filter: groupFilter }
  };

  shared.saveByKind("o2pPreset", name, data);

  console.log(`[o2p] Saved preset "${name}":`, positions);

  window.dispatchEvent(new CustomEvent('o2p:presetSaved', {
    detail: { name }
  }));

  return true;
}

/**
 * Save preset from explicit data (for programmatic use)
 */
export function savePresetFromData(name, data, options = {}) {
  if (!name || !data) {
    console.warn("[o2p] savePresetFromData: name and data required");
    return false;
  }

  // Normalize: clamp t and p to 0-1
  const normalizedState = {};

  for (const [groupId, faders] of Object.entries(data)) {
    if (groupId === '_meta' || typeof faders !== 'object') continue;

    const normalizedFaders = {};
    for (const [faderId, pos] of Object.entries(faders)) {
      if (typeof pos !== 'object') continue;

      const faderData = {};

      if (typeof pos.t === 'number') {
        faderData.t = Math.round(Math.max(0, Math.min(1, pos.t)) * 1000) / 1000;
      }

      if (typeof pos.p === 'number') {
        faderData.p = Math.round(Math.max(0, Math.min(1, pos.p)) * 1000) / 1000;
      }

      if (Object.keys(faderData).length > 0) {
        normalizedFaders[faderId] = faderData;
      }
    }

    if (Object.keys(normalizedFaders).length > 0) {
      normalizedState[groupId] = normalizedFaders;
    }
  }

  if (Object.keys(normalizedState).length === 0) {
    console.warn("[o2p] savePresetFromData: no valid position data found");
    return false;
  }

  const presetData = {
    ...normalizedState,
    _meta: { savedAt: shared.nowMs(), source: 'data', ...options }
  };

  shared.saveByKind("o2pPreset", name, presetData);
  console.log(`[o2p] Saved preset from data "${name}":`, normalizedState);
  return true;
}

/**
 * Delete a preset
 */
export function deletePreset(name) {
  const result = shared.deleteByKind("o2pPreset", name);
  if (result) {
    console.log(`[o2p] Deleted preset "${name}"`);
    window.dispatchEvent(new CustomEvent('o2p:presetDeleted', { detail: { name } }));
  }
  return result;
}

/**
 * List all o2p preset names
 */
export function listPresets() {
  return shared.listByKind("o2pPreset");
}

/**
 * Get preset data by name
 */
export function getPreset(name) {
  const item = shared.getByKind("o2pPreset", name);
  return item?.data || null;
}

/**
 * Recall a preset by name
 */
export function recallPreset(name, options = {}) {
  const presetData = getPreset(name);

  if (!presetData) {
    console.warn(`[o2p] Preset "${name}" not found`);
    return false;
  }

  const { dur = 0, ease = 'easeInOutSine' } = options;

  // Extract position data (exclude _meta)
  const positions = {};
  for (const [key, val] of Object.entries(presetData)) {
    if (key !== '_meta') {
      positions[key] = val;
    }
  }

  if (dur <= 0) {
    applyPositions(positions);
  } else {
    tweenTo(positions, { dur, ease });
  }

  console.log(`[o2p] Recalled preset "${name}"`, dur > 0 ? `(tween ${dur}s)` : '(instant)');

  window.dispatchEvent(new CustomEvent('o2p:presetRecalled', {
    detail: { name, dur }
  }));

  return true;
}

// ============================================================================
// APPLY POSITIONS
// ============================================================================

/**
 * Apply positions instantly to groups
 * positions: { groupId: { faderId: { t, p }, ... }, ... }
 */
function applyPositions(positions) {
  for (const [groupId, faderPositions] of Object.entries(positions)) {
    const group = getGroup(groupId);
    if (!group) {
      console.warn(`[o2p] applyPositions: group "${groupId}" not found`);
      continue;
    }

    if (typeof group.applyPositions === 'function') {
      group.applyPositions(faderPositions);
    }
  }
}

// ============================================================================
// TWEENING
// ============================================================================

/**
 * Tween groups to target positions
 * positions: { groupId: { faderId: { t, p }, ... }, ... }
 */
export function tweenTo(positions, options = {}) {
  const { dur = 1, ease = 'easeInOutSine', onComplete } = options;
  const easeFunc = getEasing(ease);
  const durationMs = dur * 1000;

  // Stop any active tweens for affected groups
  for (const groupId of Object.keys(positions)) {
    if (activeTweens.has(groupId)) {
      cancelAnimationFrame(activeTweens.get(groupId).rafId);
      activeTweens.delete(groupId);
    }
  }

  // Capture start positions
  const startPositions = captureState();
  const startTime = performance.now();

  function animate() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    const easedProgress = easeFunc(progress);

    for (const [groupId, faderPositions] of Object.entries(positions)) {
      const group = getGroup(groupId);
      if (!group) continue;

      const startGroup = startPositions[groupId] || {};

      for (const [faderId, targetPos] of Object.entries(faderPositions)) {
        if (!targetPos || typeof targetPos.t !== 'number') continue;

        const startPos = startGroup[faderId];
        const startT = startPos?.t ?? 0;

        // Interpolate t (simple linear lerp along path)
        const currentT = startT + (targetPos.t - startT) * easedProgress;

        // Interpolate p if present
        let currentP = undefined;
        if (typeof targetPos.p === 'number') {
          const startP = startPos?.p ?? 0;
          const fader = group.faders?.[faderId];

          if (fader?.hmode === 'continuous') {
            // Shortest-arc interpolation for continuous rotation
            currentP = lerpAngleNorm(startP, targetPos.p, easedProgress);
          } else {
            // Simple lerp for limited mode
            currentP = startP + (targetPos.p - startP) * easedProgress;
          }
        }

        group.setPosition(faderId, currentT, currentP);
      }
    }

    if (progress < 1) {
      const rafId = requestAnimationFrame(animate);
      for (const groupId of Object.keys(positions)) {
        activeTweens.set(groupId, { rafId, startTime, durationMs });
      }
    } else {
      for (const groupId of Object.keys(positions)) {
        activeTweens.delete(groupId);
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
  for (const [groupId, state] of activeTweens) {
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
    console.warn("[o2p] defineSequence: name and steps array required");
    return false;
  }

  shared.saveByKind("o2pSequence", name, {
    steps,
    loop: options.loop ?? false,
    defaultDur: options.dur,
    defaultEase: options.ease
  });

  console.log(`[o2p] Defined sequence "${name}" with ${steps.length} steps`);
  return true;
}

/**
 * Get sequence data
 */
export function getSequence(name) {
  const item = shared.getByKind("o2pSequence", name);
  return item?.data || null;
}

/**
 * List all o2p sequence names
 */
export function listSequences() {
  return shared.listByKind("o2pSequence");
}

/**
 * Play a sequence
 */
export function playSequence(name, options = {}) {
  const seqData = getSequence(name);

  if (!seqData) {
    console.warn(`[o2p] Sequence "${name}" not found`);
    return false;
  }

  stopSequence();

  const steps = seqData.steps || seqData;
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
    stopped: false,
    running: true
  };

  function playStep() {
    if (!activeSequence || activeSequence.stopped) {
      console.log(`[o2p] Sequence stopped, halting playback`);
      activeSequence = null;
      sequenceTimeoutId = null;
      return;
    }

    if (currentStep >= steps.length) {
      loopCount++;
      if (loopCount >= maxLoops) {
        console.log(`[o2p] Sequence "${name}" completed`);
        activeSequence = null;
        sequenceTimeoutId = null;
        window.dispatchEvent(new CustomEvent('o2p:sequenceComplete', {
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

    window.dispatchEvent(new CustomEvent('o2p:sequenceStep', {
      detail: {
        name,
        preset: presetName,
        step: currentStep + 1,
        total: steps.length,
        loopCount
      }
    }));

    currentStep++;
    if (activeSequence) activeSequence.currentStep = currentStep;

    sequenceTimeoutId = setTimeout(playStep, stepDur * 1000);
  }

  playStep();

  console.log(`[o2p] Playing sequence "${name}" (${steps.length} steps, loop: ${maxLoops})`);

  window.dispatchEvent(new CustomEvent('o2p:sequenceStarted', {
    detail: { name, steps: steps.length, loop: maxLoops }
  }));

  return true;
}

/**
 * Stop current sequence
 */
export function stopSequence() {
  const wasPlaying = activeSequence?.name;

  if (sequenceTimeoutId) {
    clearTimeout(sequenceTimeoutId);
    sequenceTimeoutId = null;
  }

  if (activeSequence) {
    activeSequence.stopped = true;
    console.log(`[o2p] Stopped sequence "${activeSequence.name}"`);
  }
  activeSequence = null;
  stopAllTweens();

  window.dispatchEvent(new CustomEvent('o2p:sequenceStopped', {
    detail: { name: wasPlaying }
  }));
}

/**
 * Get active sequence info
 */
export function getActiveSequence() {
  return activeSequence;
}

// ============================================================================
// PERSISTENCE INIT
// ============================================================================

function initPresets(projectName) {
  if (!shared.state.initialized) {
    shared.init(projectName);
  }
  console.log(`[o2pPresets] Initialized for "${projectName}"`);
  console.log(`[o2pPresets]   Presets: ${listPresets().length}`);
  console.log(`[o2pPresets]   Sequences: ${listSequences().length}`);
}

export function init(projectName) {
  initPresets(projectName || shared.getProjectName());
}

export function forceSave() {
  shared.forceSave();
}

// ============================================================================
// GLOBAL API
// ============================================================================

window.o2pPresets = {
  // Groups
  listGroups,

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

  // Persistence
  init,
  forceSave,

  // Debug
  _shared: shared,
  _activeTweens: activeTweens,
  _captureState: captureState,
};

// Auto-initialize
function autoInit() {
  const projectName = shared.getProjectName();
  if (projectName && projectName !== 'unknown_project') {
    initPresets(projectName);
  } else {
    console.log("[o2pPresets] Waiting for project name...");
    const checkInterval = setInterval(() => {
      const name = shared.getProjectName();
      if (name && name !== 'unknown_project') {
        clearInterval(checkInterval);
        initPresets(name);
      }
    }, 200);
    setTimeout(() => clearInterval(checkInterval), 10000);
  }
}

autoInit();

console.log("[o2pPresets] Module loaded. API available at window.o2pPresets");
