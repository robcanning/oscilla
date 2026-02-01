/*!
 * oscillaControlIntegration.js — Control Plane Integration Helpers
 * Part of oscillaScore control plane architecture
 * © 2025 Rob Canning — GPLv3
 *
 * This module provides helper functions for integrating the control plane
 * into existing animation and audio modules.
 */

import * as ParamBus from '../oscillaParamBus.js';
import * as Targets from '../oscillaTargets.js';
import { publishSignal, addModulation, clearModulations, clearRateLimits } from './controlRouter.js';

// ===========================
// O2P Animation Integration
// ===========================

/**
 * Publish O2P animation values to the control plane
 * @param {string} uid - Animation uid
 * @param {Object} values - Current values { t, x, y, angle, speed }
 */
export function publishO2P(uid, values) {
  const { t, x, y, angle, speed } = values;
  if (t !== undefined) publishSignal('o2p', uid, 't', t);
  if (x !== undefined) publishSignal('o2p', uid, 'x', x);
  if (y !== undefined) publishSignal('o2p', uid, 'y', y);
  if (angle !== undefined) publishSignal('o2p', uid, 'angle', angle);
  if (speed !== undefined) publishSignal('o2p', uid, 'speed', speed);
}

/**
 * Register an O2P animation as a controllable target
 * @param {string} uid - Animation uid
 * @param {Object} cfg - Animation configuration
 * @param {Element} el - SVG element
 */
export function registerO2PTarget(uid, cfg, el) {
  const target = Targets.createO2PTarget(uid, cfg, el);
  Targets.register(uid, target);
  return target;
}

export function unregisterO2PTarget(uid) {
  Targets.unregister(uid);
}

// ===========================
// Rotation Animation Integration
// ===========================

/**
 * Publish rotation animation values to the control plane
 * @param {string} uid - Animation uid
 * @param {Object} values - Current values { angle, speed }
 */
export function publishRotate(uid, values) {
  const { angle, speed } = values;
  if (angle !== undefined) {
    const safe = Number.isFinite(angle) ? angle : 0;
    const wrapped = ((safe % 360) + 360) % 360;
    publishSignal('rotate', uid, 'angle', wrapped);
    publishSignal('rotate', uid, 'rad', wrapped * (Math.PI / 180));
    publishSignal('rotate', uid, 'norm', wrapped / 360);
  }
  if (speed !== undefined) publishSignal('rotate', uid, 'speed', speed);
}

export function registerRotateTarget(uid, cfg, el) {
  const target = Targets.createRotateTarget(uid, cfg, el);
  Targets.register(uid, target);
  return target;
}

export function unregisterRotateTarget(uid) {
  Targets.unregister(uid);
}

// ===========================
// Scale Animation Integration
// ===========================

/**
 * Publish scale animation values to the control plane
 * @param {string} uid - Animation uid
 * @param {Object} values - Current values { sx, sy, uniform }
 */
export function publishScale(uid, values) {
  const { sx, sy, uniform } = values;
  if (sx !== undefined) publishSignal('scale', uid, 'sx', sx);
  if (sy !== undefined) publishSignal('scale', uid, 'sy', sy);
  if (uniform !== undefined) publishSignal('scale', uid, 'uniform', uniform);
}

export function registerScaleTarget(uid, cfg, el) {
  const target = Targets.createScaleTarget(uid, cfg, el);
  Targets.register(uid, target);
  return target;
}

export function unregisterScaleTarget(uid) {
  Targets.unregister(uid);
}

// ===========================
// Synth Integration
// ===========================

/**
 * Publish synth voice values to the control plane
 * @param {string} uid - Voice uid
 * @param {Object} values - Current values { freq, amp, pan, cutoff, q, state }
 */
export function publishSynth(uid, values) {
  const { freq, amp, pan, cutoff, q, state } = values;
  if (freq !== undefined) publishSignal('synth', uid, 'freq', freq);
  if (amp !== undefined) publishSignal('synth', uid, 'amp', amp);
  if (pan !== undefined) publishSignal('synth', uid, 'pan', pan);
  if (cutoff !== undefined) publishSignal('synth', uid, 'cutoff', cutoff);
  if (q !== undefined) publishSignal('synth', uid, 'q', q);
  if (state !== undefined) publishSignal('synth', uid, 'state', state);
}

export function registerSynthTarget(uid, voice) {
  const target = Targets.createSynthTarget(uid, voice);
  Targets.register(uid, target);
  return target;
}

export function unregisterSynthTarget(uid) {
  Targets.unregister(uid);
}

// ===========================
// Audio Integration
// ===========================

/**
 * Publish audio playback values to the control plane
 * @param {string} uid - Audio uid
 * @param {Object} values - Current values { state, progress, amp, pan, pitch }
 */
export function publishAudio(uid, values) {
  const { state, progress, amp, pan, pitch } = values;
  if (state !== undefined) publishSignal('audio', uid, 'state', state);
  if (progress !== undefined) publishSignal('audio', uid, 'progress', progress);
  if (amp !== undefined) publishSignal('audio', uid, 'amp', amp);
  if (pan !== undefined) publishSignal('audio', uid, 'pan', pan);
  if (pitch !== undefined) publishSignal('audio', uid, 'pitch', pitch);
}

// ===========================
// Generic Target Registration
// ===========================

/**
 * Create and register a generic target with custom setParam
 * @param {string} uid - Target uid
 * @param {string} kind - Target kind
 * @param {Function} setParamFn - Custom setParam implementation
 * @param {Function} getParamFn - Optional getParam implementation
 * @returns {Object} Registered target
 */
export function registerGenericTarget(uid, kind, setParamFn, getParamFn = null) {
  const target = {
    uid,
    kind,
    setParam: setParamFn,
    getParam: getParamFn || (() => undefined),
    getParams: () => ({}),
    destroy: () => Targets.unregister(uid)
  };
  Targets.register(uid, target);
  return target;
}

// ===========================
// Modulation Helpers
// ===========================

/**
 * Create a modulation from an animation to a synth parameter
 * @param {string} animUid - Source animation uid
 * @param {string} animChannel - Source channel (t, x, y, angle, etc.)
 * @param {string} synthUid - Target synth uid
 * @param {string} synthParam - Target parameter (freq, amp, pan, etc.)
 * @param {Object} options - Modulation options
 */
export function modAnimToSynth(animUid, animChannel, synthUid, synthParam, options = {}) {
  let source = 'o2p';
  if (['angle', 'deg', 'rad'].includes(animChannel)) source = 'rotate';
  if (['sx', 'sy', 'uniform'].includes(animChannel)) source = 'scale';

  const signalPath = ParamBus.buildPath(source, animUid, animChannel);
  return addModulation(signalPath, synthUid, synthParam, options);
}

/**
 * Create a frequency modulation from an animation
 */
export function modToFreq(animUid, channel, synthUid, options = {}) {
  const { minHz = 100, maxHz = 2000 } = options;
  return modAnimToSynth(animUid, channel, synthUid, 'freq', {
    scale: maxHz - minHz,
    offset: minHz,
    min: minHz,
    max: maxHz
  });
}

/**
 * Create a pan modulation from X position
 */
export function modXToPan(animUid, synthUid) {
  return modAnimToSynth(animUid, 'x', synthUid, 'pan', {
    scale: 2,
    offset: -1,
    min: -1,
    max: 1
  });
}

/**
 * Create an amplitude modulation from Y position
 */
export function modYToAmp(animUid, synthUid) {
  return modAnimToSynth(animUid, 'y', synthUid, 'amp', {
    scale: 0.5,
    offset: 0,
    min: 0,
    max: 0.5
  });
}

// ===========================
// Batch Operations
// ===========================

/**
 * Unregister all targets of a specific kind
 */
export function unregisterAllOfKind(kind) {
  const uids = Targets.list(kind);
  for (const uid of uids) {
    Targets.unregister(uid);
  }
}

/**
 * Clear all control plane state
 */
export function clearControlPlane() {
  Targets.clear();
  ParamBus.clear();
  clearModulations();
  clearRateLimits();
}

// ===========================
// Debug Utilities
// ===========================

export function setDebugMode(enabled) {
  ParamBus.setDebugMode(enabled);
  Targets.setDebugMode(enabled);
}

export function logState() {
  console.group('[Control Plane State]');
  console.log('Targets:', Targets.list());
  console.log('Signals:', ParamBus.list());
  console.groupEnd();
}

// ===========================
// Window Bindings
// ===========================

window.oscillaControl = {
  publishO2P, publishRotate, publishScale, publishSynth, publishAudio,
  registerO2PTarget, registerRotateTarget, registerScaleTarget, registerSynthTarget, registerGenericTarget,
  unregisterO2PTarget, unregisterRotateTarget, unregisterScaleTarget, unregisterSynthTarget, unregisterAllOfKind,
  modAnimToSynth, modToFreq, modXToPan, modYToAmp,
  clearControlPlane, setDebugMode, logState
};

export default window.oscillaControl;
