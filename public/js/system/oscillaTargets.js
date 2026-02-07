/*!
 * oscillaTargets.js — Registry of Controllable Cue Instances
 * Part of oscillaScore control plane architecture
 * © 2025 Rob Canning — GPLv3
 *
 * A Target is any running cue instance that exposes controllable parameters.
 * Targets are registered by uid when the cue starts and unregistered on cleanup.
 *
 * Target Contract:
 *   {
 *     uid: string,
 *     kind: string,           // 'synth', 'o2p', 'rotate', 'scale', 'audio', etc.
 *     setParam(name, value, meta): void,
 *     getParam(name): any,
 *     getParams(): Object,
 *     destroy(): void
 *   }
 *
 * Address Format:
 *   cue:<uid>.<param>
 *
 * Examples:
 *   cue:synthA.amp
 *   cue:drone1.freq
 *   cue:rotor3.speed
 */

// ===========================
// Module State
// ===========================

/** @type {Map<string, Target>} Registered targets by uid */
const targets = new Map();

/** @type {boolean} Enable debug logging */
let debugMode = false;

// ===========================
// Target Registration
// ===========================

/**
 * Register a controllable target
 * @param {string} uid - Unique identifier
 * @param {Object} target - Target instance with setParam method
 * @returns {boolean} True if registered successfully
 */
export function register(uid, target) {
  if (!uid || typeof uid !== 'string') {
    console.warn('[Targets] Invalid uid:', uid);
    return false;
  }

  if (!target || typeof target.setParam !== 'function') {
    console.warn('[Targets] Invalid target (missing setParam):', uid, target);
    return false;
  }

  // Warn if replacing existing target
  if (targets.has(uid)) {
    if (debugMode) {
      console.log(`[Targets] Replacing existing target: ${uid}`);
    }
  }

  targets.set(uid, target);

  if (debugMode) {
    console.log(`[Targets] Registered: ${uid} (${target.kind || 'unknown'})`);
  }

  // Dispatch event for external listeners
  window.dispatchEvent(new CustomEvent('oscilla:target-registered', {
    detail: { uid, kind: target.kind }
  }));

  return true;
}

/**
 * Unregister a target
 * @param {string} uid - Target uid
 * @returns {boolean} True if target was unregistered
 */
export function unregister(uid) {
  const target = targets.get(uid);
  if (!target) return false;

  targets.delete(uid);

  if (debugMode) {
    console.log(`[Targets] Unregistered: ${uid}`);
  }

  // Dispatch event for external listeners
  window.dispatchEvent(new CustomEvent('oscilla:target-unregistered', {
    detail: { uid }
  }));

  return true;
}

/**
 * Get a target by uid
 * @param {string} uid - Target uid
 * @returns {Object|null} Target instance or null
 */
export function get(uid) {
  return targets.get(uid) || null;
}

/**
 * Check if a target exists
 * @param {string} uid - Target uid
 * @returns {boolean} True if target exists
 */
export function has(uid) {
  return targets.has(uid);
}

/**
 * List all registered target uids
 * @param {string} kind - Optional filter by kind
 * @returns {string[]} Array of uids
 */
export function list(kind = null) {
  if (!kind) {
    return [...targets.keys()];
  }
  
  const result = [];
  for (const [uid, target] of targets) {
    if (target.kind === kind) {
      result.push(uid);
    }
  }
  return result;
}

/**
 * Get all targets as a Map
 * @returns {Map<string, Object>} Copy of targets map
 */
export function getAll() {
  return new Map(targets);
}

/**
 * Clear all targets
 */
export function clear() {
  for (const uid of [...targets.keys()]) {
    unregister(uid);
  }
}

// ===========================
// Parameter Access
// ===========================

/**
 * Set a parameter on a target
 * @param {string} uid - Target uid
 * @param {string} param - Parameter name
 * @param {any} value - Parameter value
 * @param {Object} meta - Optional metadata
 * @returns {boolean} True if parameter was set
 */
export function setParam(uid, param, value, meta = {}) {
  const target = targets.get(uid);
  if (!target) {
    if (debugMode) {
      console.warn(`[Targets] Target not found: ${uid}`);
    }
    return false;
  }

  try {
    target.setParam(param, value, meta);
    
    if (debugMode) {
      console.log(`[Targets] ${uid}.${param} = ${formatValue(value)}`);
    }
    
    return true;
  } catch (err) {
    console.error(`[Targets] Error setting ${uid}.${param}:`, err);
    return false;
  }
}

/**
 * Get a parameter from a target
 * @param {string} uid - Target uid
 * @param {string} param - Parameter name
 * @returns {any} Parameter value or undefined
 */
export function getParam(uid, param) {
  const target = targets.get(uid);
  if (!target) return undefined;

  if (typeof target.getParam === 'function') {
    return target.getParam(param);
  }

  return undefined;
}

/**
 * Get all parameters from a target
 * @param {string} uid - Target uid
 * @returns {Object|null} All parameters or null
 */
export function getParams(uid) {
  const target = targets.get(uid);
  if (!target) return null;

  if (typeof target.getParams === 'function') {
    return target.getParams();
  }

  return null;
}

// ===========================
// Target Factory Helpers
// ===========================

/**
 * Create a target wrapper for a synth voice
 * @param {string} uid - Unique identifier
 * @param {Object} voice - Synth voice object
 * @returns {Object} Target instance
 */
export function createSynthTarget(uid, voice) {
  return {
    uid,
    kind: 'synth',
    voice,

    setParam(name, value, meta = {}) {
      switch (name) {
        case 'freq':
        case 'frequency':
          if (voice.source?.kind === 'osc' && voice.source?.node?.frequency) {
            const hz = clamp(Number(value), 20, 20000);
            voice.source.node.frequency.setTargetAtTime(hz, 0, voice.glide || 0.02);
          }
          break;

        case 'amp':
        case 'amplitude':
        case 'gain':
          if (voice.graph?.gain?.gain) {
            const amp = clamp(Number(value), 0, 1);
            voice.graph.gain.gain.setTargetAtTime(amp, 0, 0.02);
          }
          break;

        case 'pan':
          if (voice.graph?.panner?.pan) {
            const pan = clamp(Number(value), -1, 1);
            voice.graph.panner.pan.setTargetAtTime(pan, 0, 0.02);
          }
          break;

        case 'cutoff':
        case 'filterFreq':
          if (voice.graph?.filter?.frequency) {
            const freq = clamp(Number(value), 20, 20000);
            voice.graph.filter.frequency.setTargetAtTime(freq, 0, 0.02);
          }
          break;

        case 'q':
        case 'resonance':
          if (voice.graph?.filter?.Q) {
            const q = clamp(Number(value), 0.1, 30);
            voice.graph.filter.Q.setTargetAtTime(q, 0, 0.02);
          }
          break;

        default:
          if (debugMode) {
            console.log(`[SynthTarget] Unknown param: ${name}`);
          }
      }
    },

    getParam(name) {
      switch (name) {
        case 'freq':
        case 'frequency':
          return voice.source?.node?.frequency?.value;
        case 'amp':
        case 'amplitude':
          return voice.graph?.gain?.gain?.value;
        case 'pan':
          return voice.graph?.panner?.pan?.value;
        case 'cutoff':
          return voice.graph?.filter?.frequency?.value;
        case 'q':
          return voice.graph?.filter?.Q?.value;
        default:
          return undefined;
      }
    },

    getParams() {
      return {
        freq: this.getParam('freq'),
        amp: this.getParam('amp'),
        pan: this.getParam('pan'),
        cutoff: this.getParam('cutoff'),
        q: this.getParam('q')
      };
    },

    destroy() {
      unregister(uid);
    }
  };
}

/**
 * Create a target wrapper for an O2P animation
 * @param {string} uid - Unique identifier
 * @param {Object} cfg - O2P configuration
 * @param {Element} el - SVG element
 * @returns {Object} Target instance
 */
export function createO2PTarget(uid, cfg, el) {
  return {
    uid,
    kind: 'o2p',
    cfg,
    el,

    setParam(name, value, meta = {}) {
      switch (name) {
        case 't':
        case 'position':
          // Set position along path (0-1)
          if (typeof cfg._setPosition === 'function') {
            cfg._setPosition(clamp(Number(value), 0, 1));
          }
          break;

        case 'speed':
          cfg.speedMultiplier = clamp(Number(value), 0.01, 10);
          break;

        case 'paused':
          if (value) {
            cfg._anim?.pause?.();
          } else {
            cfg._anim?.play?.();
          }
          break;

        default:
          if (debugMode) {
            console.log(`[O2PTarget] Unknown param: ${name}`);
          }
      }
    },

    getParam(name) {
      switch (name) {
        case 't':
        case 'position':
          return cfg._currentT;
        case 'speed':
          return cfg.speedMultiplier || 1;
        case 'paused':
          return cfg._anim?.paused;
        default:
          return undefined;
      }
    },

    getParams() {
      return {
        t: this.getParam('t'),
        speed: this.getParam('speed'),
        paused: this.getParam('paused')
      };
    },

    destroy() {
      unregister(uid);
    }
  };
}

/**
 * Create a target wrapper for a rotation animation
 * @param {string} uid - Unique identifier
 * @param {Object} cfg - Rotation configuration
 * @param {Element} el - SVG element
 * @returns {Object} Target instance
 */
export function createRotateTarget(uid, cfg, el) {
  return {
    uid,
    kind: 'rotate',
    cfg,
    el,

    setParam(name, value, meta = {}) {
      switch (name) {
        case 'angle':
        case 'rotation':
          el.style.transform = `rotate(${Number(value)}deg)`;
          break;

        case 'speed':
          cfg.speedMultiplier = clamp(Number(value), 0.01, 10);
          break;

        case 'paused':
          if (value) {
            cfg._anim?.pause?.();
          } else {
            cfg._anim?.play?.();
          }
          break;

        default:
          if (debugMode) {
            console.log(`[RotateTarget] Unknown param: ${name}`);
          }
      }
    },

    getParam(name) {
      switch (name) {
        case 'angle':
        case 'rotation':
          const match = el.style.transform?.match(/rotate\(([-\d.]+)deg\)/);
          return match ? parseFloat(match[1]) : 0;
        case 'speed':
          return cfg.speedMultiplier || 1;
        case 'paused':
          return cfg._anim?.paused;
        default:
          return undefined;
      }
    },

    getParams() {
      return {
        angle: this.getParam('angle'),
        speed: this.getParam('speed'),
        paused: this.getParam('paused')
      };
    },

    destroy() {
      unregister(uid);
    }
  };
}

/**
 * Create a target wrapper for a scale animation
 * @param {string} uid - Unique identifier
 * @param {Object} cfg - Scale configuration
 * @param {Element} el - SVG element
 * @returns {Object} Target instance
 */
export function createScaleTarget(uid, cfg, el) {
  return {
    uid,
    kind: 'scale',
    cfg,
    el,

    setParam(name, value, meta = {}) {
      const current = parseScale(el.style.transform);

      switch (name) {
        case 'scale':
        case 'uniform':
          el.style.transform = `scale(${Number(value)}, ${Number(value)})`;
          break;

        case 'sx':
        case 'scaleX':
          el.style.transform = `scale(${Number(value)}, ${current.sy})`;
          break;

        case 'sy':
        case 'scaleY':
          el.style.transform = `scale(${current.sx}, ${Number(value)})`;
          break;

        case 'paused':
          if (value) {
            cfg._anim?.pause?.();
          } else {
            cfg._anim?.play?.();
          }
          break;

        default:
          if (debugMode) {
            console.log(`[ScaleTarget] Unknown param: ${name}`);
          }
      }
    },

    getParam(name) {
      const current = parseScale(el.style.transform);

      switch (name) {
        case 'scale':
        case 'uniform':
          return (current.sx + current.sy) / 2;
        case 'sx':
        case 'scaleX':
          return current.sx;
        case 'sy':
        case 'scaleY':
          return current.sy;
        case 'paused':
          return cfg._anim?.paused;
        default:
          return undefined;
      }
    },

    getParams() {
      return {
        sx: this.getParam('sx'),
        sy: this.getParam('sy'),
        paused: this.getParam('paused')
      };
    },

    destroy() {
      unregister(uid);
    }
  };
}

// ===========================
// Utility Functions
// ===========================

/**
 * Clamp a value between min and max
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

/**
 * Parse scale transform
 */
function parseScale(transform) {
  const match = transform?.match(/scale\(\s*([-\d.]+)(?:\s*,\s*([-\d.]+))?\s*\)/);
  if (!match) return { sx: 1, sy: 1 };
  const sx = parseFloat(match[1]) || 1;
  const sy = match[2] ? parseFloat(match[2]) : sx;
  return { sx, sy };
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
 * Enable or disable debug logging
 */
export function setDebugMode(enabled) {
  debugMode = !!enabled;
}

// ===========================
// Window Binding (for debugging)
// ===========================

window.oscillaTargets = {
  register,
  unregister,
  get,
  has,
  list,
  getAll,
  clear,
  setParam,
  getParam,
  getParams,
  createSynthTarget,
  createO2PTarget,
  createRotateTarget,
  createScaleTarget,
  setDebugMode
};

// ===========================
// Default Export
// ===========================

export default {
  register,
  unregister,
  get,
  has,
  list,
  getAll,
  clear,
  setParam,
  getParam,
  getParams,
  createSynthTarget,
  createO2PTarget,
  createRotateTarget,
  createScaleTarget,
  setDebugMode
};
