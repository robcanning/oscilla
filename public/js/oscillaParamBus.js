/*!
 * oscillaParamBus.js — Global Control-Signal Store & Pub/Sub
 * Part of oscillaScore control plane architecture
 * © 2025 Rob Canning — GPLv3
 *
 * The ParamBus is the central nervous system for control signals in Oscilla.
 * It stores the latest value of each named signal and notifies subscribers
 * when values change. This enables cross-cue modulation and external control.
 *
 * Signal Addressing:
 *   <source>:<id>.<channel>
 *
 * Examples:
 *   o2p:sliderA.t       - O2P animation traversal position
 *   rotate:orb1.angle   - Rotation angle in degrees
 *   scale:box1.sx       - Scale X value
 *   osc:/fader1         - External OSC input
 *   cue:synthA.amp      - Target parameter (written by router)
 */

// ===========================
// Module State
// ===========================

/** @type {Map<string, any>} Signal values by path */
const signals = new Map();

/** @type {Map<string, Set<Function>>} Subscribers by path */
const subscribers = new Map();

/** @type {Map<string, Set<Function>>} Wildcard subscribers (prefix matching) */
const wildcardSubscribers = new Map();

/** @type {boolean} Enable debug logging */
let debugMode = false;

// ===========================
// Core API
// ===========================

/**
 * Set a signal value and notify subscribers
 * @param {string} path - Signal path (e.g., "o2p:slider.t")
 * @param {any} value - Signal value
 * @param {Object} meta - Optional metadata (source, timestamp, etc.)
 * @returns {boolean} True if value changed
 */
export function set(path, value, meta = {}) {
  if (!path || typeof path !== 'string') {
    console.warn('[ParamBus] Invalid path:', path);
    return false;
  }

  const previous = signals.get(path);
  const changed = previous !== value;

  signals.set(path, value);

  if (debugMode && changed) {
    console.log(`[ParamBus] ${path} = ${formatValue(value)}`, meta);
  }

  // Notify direct subscribers
  const subs = subscribers.get(path);
  if (subs) {
    for (const callback of subs) {
      try {
        callback(value, path, meta);
      } catch (err) {
        console.error('[ParamBus] Subscriber error:', err);
      }
    }
  }

  // Notify wildcard subscribers
  for (const [prefix, wsubs] of wildcardSubscribers) {
    if (path.startsWith(prefix)) {
      for (const callback of wsubs) {
        try {
          callback(value, path, meta);
        } catch (err) {
          console.error('[ParamBus] Wildcard subscriber error:', err);
        }
      }
    }
  }

  return changed;
}

/**
 * Get a signal value
 * @param {string} path - Signal path
 * @param {any} fallback - Default value if not found
 * @returns {any} Signal value or fallback
 */
export function get(path, fallback = undefined) {
  if (signals.has(path)) {
    return signals.get(path);
  }
  return fallback;
}

/**
 * Subscribe to a signal path
 * @param {string} path - Signal path (use "*" suffix for wildcard, e.g., "o2p:*")
 * @param {Function} callback - Called with (value, path, meta)
 * @returns {Function} Unsubscribe function
 */
export function subscribe(path, callback) {
  if (!path || typeof callback !== 'function') {
    console.warn('[ParamBus] Invalid subscribe args:', path, callback);
    return () => {};
  }

  // Wildcard subscription (prefix matching)
  if (path.endsWith('*')) {
    const prefix = path.slice(0, -1);
    if (!wildcardSubscribers.has(prefix)) {
      wildcardSubscribers.set(prefix, new Set());
    }
    wildcardSubscribers.get(prefix).add(callback);

    return () => {
      const wsubs = wildcardSubscribers.get(prefix);
      if (wsubs) {
        wsubs.delete(callback);
        if (wsubs.size === 0) {
          wildcardSubscribers.delete(prefix);
        }
      }
    };
  }

  // Direct subscription
  if (!subscribers.has(path)) {
    subscribers.set(path, new Set());
  }
  subscribers.get(path).add(callback);

  return () => {
    const subs = subscribers.get(path);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) {
        subscribers.delete(path);
      }
    }
  };
}

/**
 * Check if a signal exists
 * @param {string} path - Signal path
 * @returns {boolean} True if signal exists
 */
export function has(path) {
  return signals.has(path);
}

/**
 * Delete a signal
 * @param {string} path - Signal path
 * @returns {boolean} True if signal was deleted
 */
export function remove(path) {
  return signals.delete(path);
}

/**
 * List all signal paths matching a prefix
 * @param {string} prefix - Path prefix (e.g., "o2p:")
 * @returns {string[]} Matching paths
 */
export function list(prefix = '') {
  const result = [];
  for (const path of signals.keys()) {
    if (path.startsWith(prefix)) {
      result.push(path);
    }
  }
  return result;
}

/**
 * Get all signals as an object
 * @param {string} prefix - Optional prefix filter
 * @returns {Object} Signal path -> value mapping
 */
export function snapshot(prefix = '') {
  const result = {};
  for (const [path, value] of signals) {
    if (path.startsWith(prefix)) {
      result[path] = value;
    }
  }
  return result;
}

/**
 * Clear all signals and subscribers
 */
export function clear() {
  signals.clear();
  subscribers.clear();
  wildcardSubscribers.clear();
  if (debugMode) {
    console.log('[ParamBus] Cleared all signals');
  }
}

/**
 * Clear signals matching a prefix
 * @param {string} prefix - Path prefix
 */
export function clearPrefix(prefix) {
  for (const path of [...signals.keys()]) {
    if (path.startsWith(prefix)) {
      signals.delete(path);
    }
  }
}

// ===========================
// Batch Operations
// ===========================

/**
 * Set multiple signals at once
 * @param {Object} values - Path -> value mapping
 * @param {Object} meta - Optional metadata
 */
export function setMany(values, meta = {}) {
  for (const [path, value] of Object.entries(values)) {
    set(path, value, meta);
  }
}

/**
 * Get multiple signals at once
 * @param {string[]} paths - Array of paths
 * @returns {Object} Path -> value mapping
 */
export function getMany(paths) {
  const result = {};
  for (const path of paths) {
    result[path] = get(path);
  }
  return result;
}

// ===========================
// Utility Functions
// ===========================

/**
 * Enable or disable debug logging
 * @param {boolean} enabled - Whether to enable debug mode
 */
export function setDebugMode(enabled) {
  debugMode = !!enabled;
}

/**
 * Format a value for logging
 * @param {any} value - Value to format
 * @returns {string} Formatted string
 */
function formatValue(value) {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(4);
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

// ===========================
// Path Helpers
// ===========================

/**
 * Build a signal path from components
 * @param {string} source - Source type (o2p, rotate, scale, osc, cue)
 * @param {string} id - Unique identifier
 * @param {string} channel - Parameter channel
 * @returns {string} Full signal path
 */
export function buildPath(source, id, channel) {
  return `${source}:${id}.${channel}`;
}

/**
 * Parse a signal path into components
 * @param {string} path - Signal path
 * @returns {{source: string, id: string, channel: string} | null}
 */
export function parsePath(path) {
  const match = path.match(/^([^:]+):([^.]+)\.(.+)$/);
  if (!match) return null;
  return {
    source: match[1],
    id: match[2],
    channel: match[3]
  };
}

// ===========================
// Window Binding (for debugging)
// ===========================

window.oscillaParamBus = {
  set,
  get,
  subscribe,
  has,
  remove,
  list,
  snapshot,
  clear,
  clearPrefix,
  setMany,
  getMany,
  setDebugMode,
  buildPath,
  parsePath
};

// ===========================
// Default Export
// ===========================

export default {
  set,
  get,
  subscribe,
  has,
  remove,
  list,
  snapshot,
  clear,
  clearPrefix,
  setMany,
  getMany,
  setDebugMode,
  buildPath,
  parsePath
};
