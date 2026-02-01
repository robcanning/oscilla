/*!
 * oscillaParamBinding.js — Parameter Binding & Signal Publishing
 * Part of oscillaScore control plane architecture
 * © 2025 Rob Canning — GPLv3
 *
 * This module provides:
 *   - bindParam(): Subscribe a parameter to a signal source
 *   - publish(): Publish signals from animations
 *   - isSignalRef(): Check if a value is a signal reference
 *
 * Usage:
 *   // In synth - bind freq to a fader
 *   const freqBinding = bindParam(params.freq, (hz) => osc.frequency.value = hz, { min: 20, max: 2000 });
 *
 *   // In animation - publish position
 *   publish("o2p", uid, { t: 0.5, x: 0.3, y: 0.7 });
 */

import * as ParamBus from './paramBus.js';

// ===========================
// Signal Reference Detection
// ===========================

/**
 * Check if a value is a signal reference from the parser
 * Signal refs look like: { type: "signalRef", source: "fader3", channel: "t", range: [min, max] }
 * @param {any} value - Value to check
 * @returns {boolean}
 */
export function isSignalRef(value) {
  return value && typeof value === 'object' && value.type === 'signalRef';
}

/**
 * Parse a signal reference string like "fader3.t" or "fader3.t[200,2000]"
 * Used by the parser to create signalRef objects
 * @param {string} str - String to parse
 * @returns {Object|null} Signal ref object or null
 */
export function parseSignalRef(str) {
  if (!str || typeof str !== 'string') return null;

  // Match: source.channel or source.channel[min,max]
  const match = str.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)(?:\[([^\]]+)\])?$/);
  if (!match) return null;

  const [, source, channel, rangeStr] = match;

  let range = null;
  if (rangeStr) {
    const parts = rangeStr.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 2 && parts.every(n => Number.isFinite(n))) {
      range = parts;
    }
  }

  return {
    type: 'signalRef',
    source,
    channel,
    range
  };
}

// ===========================
// Range Mapping
// ===========================

/**
 * Map a value from one range to another
 * @param {number} value - Input value
 * @param {number} inMin - Input range minimum
 * @param {number} inMax - Input range maximum
 * @param {number} outMin - Output range minimum
 * @param {number} outMax - Output range maximum
 * @returns {number} Mapped value
 */
export function mapRange(value, inMin, inMax, outMin, outMax) {
  if (inMax === inMin) return outMin;
  const normalized = (value - inMin) / (inMax - inMin);
  return outMin + normalized * (outMax - outMin);
}

/**
 * Attempt to infer source type from channel name
 * @param {string} channel - Channel name
 * @returns {string} Source type
 */
function inferSourceType(channel) {
  // O2P channels
  if (['t', 'x', 'y', 'angle', 'pathT'].includes(channel)) return 'o2p';
  // Rotate channels
  if (['deg', 'rad', 'norm', 'rotation'].includes(channel)) return 'rotate';
  // Scale channels
  if (['sx', 'sy', 'uniform', 'scale'].includes(channel)) return 'scale';
  // Default to o2p (most common)
  return 'o2p';
}

// ===========================
// Parameter Binding
// ===========================

/**
 * Bind a parameter to either a static value or a signal source
 * 
 * @param {any} paramValue - Static value OR signalRef object from parser
 * @param {Function} onUpdate - Called when signal changes: (mappedValue, rawValue) => {}
 * @param {Object} options - Binding options
 * @param {number} options.min - Output range minimum (default: 0)
 * @param {number} options.max - Output range maximum (default: 1)
 * @param {number} options.default - Default value if signal not yet available
 * @param {number} options.smoothing - Smoothing factor 0-0.99 (default: 0)
 * @param {string} options.sourceType - Override source type detection
 * @returns {{ value: number, unbind: Function, isBinding: boolean }}
 */
export function bindParam(paramValue, onUpdate, options = {}) {
  const {
    min = 0,
    max = 1,
    default: defaultValue,
    smoothing = 0,
    sourceType = null
  } = options;

  // Static value - just return it
  if (!isSignalRef(paramValue)) {
    const staticValue = typeof paramValue === 'number' ? paramValue : (defaultValue ?? min);
    return {
      value: staticValue,
      unbind: () => {},
      isBinding: false
    };
  }

  // Signal reference - set up subscription
  const { source, channel, range } = paramValue;

  // Determine output range (signal range overrides options)
  const outMin = range?.[0] ?? min;
  const outMax = range?.[1] ?? max;

  // Build signal path
  const type = sourceType || inferSourceType(channel);
  const path = `${type}:${source}.${channel}`;

  // Smoothing state
  let smoothedValue = null;

  // Get initial value if signal already exists
  const currentRaw = ParamBus.get(path);
  let initialValue = defaultValue ?? outMin;

  if (currentRaw !== undefined && Number.isFinite(currentRaw)) {
    initialValue = mapRange(currentRaw, 0, 1, outMin, outMax);
    smoothedValue = initialValue;
  }

  // Subscribe to updates
  const unbind = ParamBus.subscribe(path, (rawValue, signalPath, meta) => {
    if (!Number.isFinite(rawValue)) return;

    // Map to output range
    let mapped = mapRange(rawValue, 0, 1, outMin, outMax);

    // Apply smoothing if enabled
    if (smoothing > 0 && smoothedValue !== null) {
      mapped = smoothedValue * smoothing + mapped * (1 - smoothing);
    }
    smoothedValue = mapped;

    // Call update handler
    try {
      onUpdate(mapped, rawValue);
    } catch (err) {
      console.error('[bindParam] Update handler error:', err);
    }
  });

  console.log(`[bindParam] Bound to ${path} → range [${outMin}, ${outMax}]`);

  return {
    value: initialValue,
    unbind,
    isBinding: true,
    path
  };
}

/**
 * Bind multiple parameters at once
 * @param {Object} params - Parameter name -> value mapping
 * @param {Object} handlers - Parameter name -> update handler mapping
 * @param {Object} options - Parameter name -> options mapping
 * @returns {{ values: Object, unbindAll: Function, bindings: Object }}
 */
export function bindParams(params, handlers, options = {}) {
  const values = {};
  const bindings = {};
  const unbinders = [];

  for (const [name, value] of Object.entries(params)) {
    const handler = handlers[name];
    if (!handler) {
      values[name] = value;
      continue;
    }

    const opts = options[name] || {};
    const binding = bindParam(value, handler, opts);

    values[name] = binding.value;
    bindings[name] = binding;
    unbinders.push(binding.unbind);
  }

  return {
    values,
    bindings,
    unbindAll: () => unbinders.forEach(fn => fn())
  };
}

// ===========================
// Signal Publishing
// ===========================

/** @type {Map<string, number>} Rate limiting timestamps */
const publishTimestamps = new Map();

/** @type {number} Minimum interval between publishes (ms) */
const PUBLISH_THROTTLE_MS = 16; // ~60fps

/**
 * Publish signals from an animation or cue
 * 
 * @param {string} sourceType - Source type: "o2p", "rotate", "scale", "synth", "audio"
 * @param {string} uid - Unique identifier of the source
 * @param {Object} channels - Channel name -> value mapping
 * @param {Object} meta - Optional metadata
 * 
 * @example
 * // In o2p animation update:
 * publish("o2p", cfg.uid, { t: pathT, x: normX, y: normY, angle });
 * 
 * // In rotate animation update:
 * publish("rotate", cfg.uid, { angle: currentAngle });
 */
export function publish(sourceType, uid, channels, meta = {}) {
  const now = performance.now();
  const throttleKey = `${sourceType}:${uid}`;

  // Throttle publishing
  const lastTime = publishTimestamps.get(throttleKey) || 0;
  if (now - lastTime < PUBLISH_THROTTLE_MS) {
    return;
  }
  publishTimestamps.set(throttleKey, now);

  // Publish each channel
  for (const [channel, value] of Object.entries(channels)) {
    if (value === undefined || value === null) continue;
    if (!Number.isFinite(value)) continue;

    const path = `${sourceType}:${uid}.${channel}`;
    ParamBus.set(path, value, {
      ...meta,
      sourceType,
      uid,
      channel,
      timestamp: now
    });
  }
}

/**
 * Clear rate limit cache (call when stopping playback)
 */
export function clearPublishThrottles() {
  publishTimestamps.clear();
}

// ===========================
// Convenience Helpers
// ===========================

/**
 * Create a binding config object for common parameter types
 */
export const BindingPresets = {
  frequency: { min: 20, max: 20000, default: 440 },
  amplitude: { min: 0, max: 1, default: 0.1 },
  pan: { min: -1, max: 1, default: 0 },
  filterFreq: { min: 20, max: 20000, default: 1000 },
  filterQ: { min: 0.1, max: 30, default: 1 },
  delayTime: { min: 0, max: 2, default: 0.25 },
  feedback: { min: 0, max: 0.99, default: 0.3 },
  mix: { min: 0, max: 1, default: 0.5 },
  rate: { min: 0.1, max: 10, default: 1 },
  pitch: { min: 0.25, max: 4, default: 1 }
};

/**
 * Get binding preset for a parameter name
 * @param {string} paramName - Parameter name
 * @returns {Object} Preset options or empty object
 */
export function getPreset(paramName) {
  const name = paramName.toLowerCase();

  if (name === 'freq' || name === 'frequency') return BindingPresets.frequency;
  if (name === 'amp' || name === 'amplitude' || name === 'gain') return BindingPresets.amplitude;
  if (name === 'pan') return BindingPresets.pan;
  if (name === 'cutoff' || name === 'filterfreq') return BindingPresets.filterFreq;
  if (name === 'q' || name === 'resonance') return BindingPresets.filterQ;
  if (name === 'delaytime' || name === 'delay') return BindingPresets.delayTime;
  if (name === 'feedback' || name === 'fb') return BindingPresets.feedback;
  if (name === 'mix' || name === 'wet') return BindingPresets.mix;
  if (name === 'rate' || name === 'speed') return BindingPresets.rate;
  if (name === 'pitch') return BindingPresets.pitch;

  return {};
}

// ===========================
// Window Binding
// ===========================

window.oscillaBinding = {
  bindParam,
  bindParams,
  publish,
  isSignalRef,
  parseSignalRef,
  mapRange,
  clearPublishThrottles,
  BindingPresets,
  getPreset
};

// ===========================
// Default Export
// ===========================

export default {
  bindParam,
  bindParams,
  publish,
  isSignalRef,
  parseSignalRef,
  mapRange,
  clearPublishThrottles,
  BindingPresets,
  getPreset
};
