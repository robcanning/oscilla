/*!
 * oscillaControlRouter.js — Control Signal Router
 * Part of oscillaScore control plane architecture
 * © 2025 Rob Canning — GPLv3
 *
 * The Control Router is the single point through which all control updates pass.
 * It connects signals to targets and updates the ParamBus.
 *
 * Key responsibilities:
 *   1. Route incoming control values to registered targets
 *   2. Update the ParamBus with current values
 *   3. Handle cross-cue modulation subscriptions
 *   4. Provide rate limiting and smoothing options
 *
 * The router does NOT automatically send OSC to avoid feedback loops.
 * OSC output is handled separately by the source modules.
 */

import * as ParamBus from './paramBus.js';
import * as Targets from '../oscillaTargets.js';

// ===========================
// Module State
// ===========================

/** @type {boolean} Enable debug logging */
let debugMode = false;

/** @type {Map<string, Object>} Modulation subscriptions */
const modulations = new Map();

/** @type {Map<string, number>} Rate limiting timestamps */
const rateLimits = new Map();

/** @type {number} Default rate limit interval in ms */
const DEFAULT_RATE_LIMIT_MS = 16; // ~60fps

// ===========================
// Core Routing
// ===========================

/**
 * Route a control value to a target and update ParamBus
 * @param {string} uid - Target uid
 * @param {string} param - Parameter name
 * @param {any} value - Parameter value
 * @param {Object} meta - Optional metadata
 * @returns {boolean} True if routed successfully
 */
export function routeControl(uid, param, value, meta = {}) {
  if (!uid || !param) {
    console.warn('[Router] Invalid route args:', { uid, param, value });
    return false;
  }

  // Build the cue path for ParamBus
  const cuePath = `cue:${uid}.${param}`;

  // Update ParamBus (always)
  ParamBus.set(cuePath, value, {
    ...meta,
    routed: true,
    timestamp: Date.now()
  });

  // Route to target (if registered)
  const target = Targets.get(uid);
  if (target) {
    Targets.setParam(uid, param, value, meta);
    
    if (debugMode) {
      console.log(`[Router] ${uid}.${param} = ${formatValue(value)}`);
    }
    
    return true;
  }

  if (debugMode) {
    console.log(`[Router] No target for ${uid}, stored in ParamBus`);
  }

  return false;
}

/**
 * Route multiple parameters at once
 * @param {string} uid - Target uid
 * @param {Object} params - Parameter name -> value mapping
 * @param {Object} meta - Optional metadata
 */
export function routeMany(uid, params, meta = {}) {
  for (const [param, value] of Object.entries(params)) {
    routeControl(uid, param, value, meta);
  }
}

// ===========================
// Signal Publishing
// ===========================

/**
 * Publish a signal from an internal source (animation, etc.)
 * This updates ParamBus and triggers any modulation subscriptions.
 * @param {string} source - Source type (o2p, rotate, scale, etc.)
 * @param {string} id - Source uid
 * @param {string} channel - Signal channel
 * @param {any} value - Signal value
 * @param {Object} meta - Optional metadata
 */
export function publishSignal(source, id, channel, value, meta = {}) {
  const path = ParamBus.buildPath(source, id, channel);

  // Check rate limit
  const now = Date.now();
  const lastTime = rateLimits.get(path) || 0;
  const interval = meta.rateLimit || DEFAULT_RATE_LIMIT_MS;

  if (now - lastTime < interval) {
    return; // Skip this update
  }
  rateLimits.set(path, now);

  // Update ParamBus
  ParamBus.set(path, value, {
    ...meta,
    source,
    id,
    channel,
    timestamp: now
  });

  if (debugMode) {
    console.log(`[Router] Published ${path} = ${formatValue(value)}`);
  }
}

/**
 * Publish multiple channels from a single source
 * @param {string} source - Source type
 * @param {string} id - Source uid
 * @param {Object} channels - Channel -> value mapping
 * @param {Object} meta - Optional metadata
 */
export function publishMany(source, id, channels, meta = {}) {
  for (const [channel, value] of Object.entries(channels)) {
    publishSignal(source, id, channel, value, meta);
  }
}

// ===========================
// Cross-Cue Modulation
// ===========================

/**
 * Set up a modulation from a signal to a target parameter
 * @param {string} signalPath - Source signal path (e.g., "o2p:slider.t")
 * @param {string} targetUid - Target uid
 * @param {string} targetParam - Target parameter
 * @param {Object} options - Modulation options
 * @returns {Function} Remove modulation function
 */
export function addModulation(signalPath, targetUid, targetParam, options = {}) {
  const {
    scale = 1,        // Multiply signal by this
    offset = 0,       // Add this after scaling
    min = -Infinity,  // Clamp minimum
    max = Infinity,   // Clamp maximum
    smoothing = 0,    // Smoothing factor (0 = none, 0.99 = heavy)
    bipolar = false   // If true, treat input as -1 to 1
  } = options;

  const modKey = `${signalPath} -> ${targetUid}.${targetParam}`;

  // Track for smoothing
  let smoothedValue = null;

  // Subscribe to the signal
  const unsubscribe = ParamBus.subscribe(signalPath, (value, path, meta) => {
    // Don't apply modulation from our own output (feedback prevention)
    if (meta?.routed && meta?.targetUid === targetUid) {
      return;
    }

    let v = Number(value);
    if (!Number.isFinite(v)) return;

    // Apply bipolar conversion if needed
    if (bipolar) {
      v = v * 2 - 1; // 0-1 -> -1 to 1
    }

    // Apply scale and offset
    v = v * scale + offset;

    // Clamp
    v = Math.max(min, Math.min(max, v));

    // Apply smoothing
    if (smoothing > 0 && smoothedValue !== null) {
      v = smoothedValue * smoothing + v * (1 - smoothing);
    }
    smoothedValue = v;

    // Route to target
    routeControl(targetUid, targetParam, v, {
      ...meta,
      modulation: modKey,
      targetUid
    });
  });

  // Store modulation info
  modulations.set(modKey, {
    signalPath,
    targetUid,
    targetParam,
    options,
    unsubscribe
  });

  if (debugMode) {
    console.log(`[Router] Added modulation: ${modKey}`);
  }

  // Return removal function
  return () => removeModulation(modKey);
}

/**
 * Remove a modulation
 * @param {string} modKey - Modulation key
 * @returns {boolean} True if removed
 */
export function removeModulation(modKey) {
  const mod = modulations.get(modKey);
  if (!mod) return false;

  mod.unsubscribe();
  modulations.delete(modKey);

  if (debugMode) {
    console.log(`[Router] Removed modulation: ${modKey}`);
  }

  return true;
}

/**
 * List all active modulations
 * @returns {Object[]} Array of modulation info objects
 */
export function listModulations() {
  const result = [];
  for (const [key, mod] of modulations) {
    result.push({
      key,
      signalPath: mod.signalPath,
      targetUid: mod.targetUid,
      targetParam: mod.targetParam,
      options: mod.options
    });
  }
  return result;
}

/**
 * Clear all modulations
 */
export function clearModulations() {
  for (const mod of modulations.values()) {
    mod.unsubscribe();
  }
  modulations.clear();

  if (debugMode) {
    console.log('[Router] Cleared all modulations');
  }
}

// ===========================
// OSC-In Handling
// ===========================

/**
 * Handle an OSC-in control message
 * @param {string} address - OSC address (e.g., "/oscilla/set")
 * @param {any[]} args - OSC arguments
 */
export function handleOSCIn(address, args) {
  // Handle /oscilla/set <uid> <param> <value>
  if (address === '/oscilla/set' && args.length >= 3) {
    const [uid, param, value] = args;
    routeControl(String(uid), String(param), value, { source: 'osc-in' });
    return;
  }

  // Handle /oscilla/<uid>/<param> <value>
  const match = address.match(/^\/oscilla\/([^/]+)\/([^/]+)$/);
  if (match && args.length >= 1) {
    const [uid, param] = match.slice(1);
    routeControl(uid, param, args[0], { source: 'osc-in' });
    return;
  }

  // Store raw OSC signal in ParamBus for potential modulation use
  const oscPath = `osc:${address.replace(/^\//, '')}`;
  const value = args.length === 1 ? args[0] : args;
  ParamBus.set(oscPath, value, { source: 'osc-in', raw: true });
}

// ===========================
// Utility Functions
// ===========================

/**
 * Enable or disable debug logging
 */
export function setDebugMode(enabled) {
  debugMode = !!enabled;
  ParamBus.setDebugMode(enabled);
  Targets.setDebugMode(enabled);
}

/**
 * Format a value for logging
 */
function formatValue(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(4);
  }
  return String(value);
}

/**
 * Clear rate limit cache (call when stopping playback)
 */
export function clearRateLimits() {
  rateLimits.clear();
}

// ===========================
// Convenience Shortcuts
// ===========================

/**
 * Quick modulation setup: signal -> target.param
 * @param {string} from - Signal path or shorthand
 * @param {string} to - Target path (uid.param)
 * @param {Object} options - Modulation options
 */
export function mod(from, to, options = {}) {
  const [targetUid, targetParam] = to.split('.');
  if (!targetUid || !targetParam) {
    console.warn('[Router] Invalid modulation target:', to);
    return () => {};
  }
  return addModulation(from, targetUid, targetParam, options);
}

// ===========================
// Window Binding (for debugging)
// ===========================

window.oscillaRouter = {
  routeControl,
  routeMany,
  publishSignal,
  publishMany,
  addModulation,
  removeModulation,
  listModulations,
  clearModulations,
  handleOSCIn,
  setDebugMode,
  clearRateLimits,
  mod
};

// ===========================
// Default Export
// ===========================

export default {
  routeControl,
  routeMany,
  publishSignal,
  publishMany,
  addModulation,
  removeModulation,
  listModulations,
  clearModulations,
  handleOSCIn,
  setDebugMode,
  clearRateLimits,
  mod
};
