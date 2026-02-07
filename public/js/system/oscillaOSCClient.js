/*!
 * oscillaOSCClient.js — Client-Side OSC Abstraction Layer
 * Part of oscillaScore control plane architecture
 * © 2025 Rob Canning — GPLv3
 *
 * Provides a unified interface for:
 *   - OSC-out: Sending OSC messages to external systems via WebSocket
 *   - OSC-in: Receiving OSC messages from external systems
 *   - Address parsing and normalization
 *   - Control signal integration with ParamBus
 *
 * This module wraps the existing sendOSCMessage functionality and adds
 * control plane integration for incoming OSC.
 */

import * as ParamBus from '../control/paramBus.js';
import { handleOSCIn } from '../control/controlRouter.js';

// ===========================
// Module State
// ===========================

/** @type {boolean} Global OSC mute state */
let oscMuted = false;

/** @type {Object} Last sent OSC message (for UI preview) */
let lastOscMessage = null;

/** @type {Map<string, Function>} OSC address handlers */
const addressHandlers = new Map();

/** @type {boolean} Enable debug logging */
let debugMode = false;

// ===========================
// OSC-Out: Sending Messages
// ===========================

/**
 * Send an OSC message via WebSocket
 * @param {Object} payload - OSC message payload
 * @param {Object} options - Send options
 */
export function sendOSC(payload, options = {}) {
  const { silent = false } = options;

  if (!payload || typeof payload !== 'object') return;
  lastOscMessage = payload;

  // Check global mute
  if (oscMuted) {
    updateUIPreview(payload, true);
    return;
  }

  // Update UI preview
  updateUIPreview(payload, false);

  // Send via WebSocket
  if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
    if (!silent) console.warn("[OSC] Socket not ready", payload);
    return;
  }

  try {
    window.socket.send(JSON.stringify(payload));
  } catch (err) {
    console.warn("[OSC] Send failed", err, payload);
  }
}

/**
 * Send a simple OSC message with address and args
 * @param {string} address - OSC address
 * @param {any[]} args - OSC arguments
 */
export function send(address, ...args) {
  sendOSC({
    type: "osc_value",
    addr: normalizeAddress(address),
    args,
    timestamp: Date.now()
  });
}

/**
 * Send a control value via OSC
 * @param {string} uid - Target uid
 * @param {string} param - Parameter name
 * @param {any} value - Parameter value
 */
export function sendControl(uid, param, value) {
  sendOSC({
    type: "osc_control",
    uid,
    param,
    value,
    timestamp: Date.now()
  });
}

// ===========================
// OSC-In: Receiving Messages
// ===========================

/**
 * Register a handler for a specific OSC address
 * @param {string} address - OSC address pattern
 * @param {Function} handler - Called with (args, address)
 * @returns {Function} Unregister function
 */
export function onAddress(address, handler) {
  if (typeof handler !== 'function') {
    console.warn('[OSC] Invalid handler for', address);
    return () => {};
  }

  const normalized = normalizeAddress(address);
  
  if (!addressHandlers.has(normalized)) {
    addressHandlers.set(normalized, new Set());
  }
  addressHandlers.get(normalized).add(handler);

  return () => {
    const handlers = addressHandlers.get(normalized);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        addressHandlers.delete(normalized);
      }
    }
  };
}

/**
 * Dispatch an incoming OSC message to registered handlers
 * @param {string} address - OSC address
 * @param {any[]} args - OSC arguments
 */
export function dispatchOSC(address, args) {
  const normalized = normalizeAddress(address);

  // Direct handlers
  const handlers = addressHandlers.get(normalized);
  if (handlers) {
    for (const handler of handlers) {
      try {
        handler(args, address);
      } catch (err) {
        console.error('[OSC] Handler error:', err);
      }
    }
  }

  // Wildcard handlers
  for (const [pattern, patternHandlers] of addressHandlers) {
    if (pattern.endsWith('*') && normalized.startsWith(pattern.slice(0, -1))) {
      for (const handler of patternHandlers) {
        try {
          handler(args, address);
        } catch (err) {
          console.error('[OSC] Wildcard handler error:', err);
        }
      }
    }
  }

  // Store in ParamBus
  const path = `osc:${normalized}`;
  const value = args.length === 1 ? args[0] : args;
  ParamBus.set(path, value, { source: 'osc-in', address });

  // Route through control router if it's a control message
  handleOSCIn(address, args);

  if (debugMode) {
    console.log(`[OSC-in] ${address}`, args);
  }
}

// ===========================
// Address Utilities
// ===========================

/**
 * Normalize an OSC address
 * @param {string} address - Raw address
 * @returns {string} Normalized address (without leading /)
 */
export function normalizeAddress(address) {
  if (!address) return '';
  return String(address).replace(/^\/+/, '').trim();
}

/**
 * Build a full OSC address from components
 * @param {...string} parts - Address parts
 * @returns {string} Full address
 */
export function buildAddress(...parts) {
  return '/' + parts.filter(Boolean).join('/');
}

/**
 * Parse an OSC address into parts
 * @param {string} address - OSC address
 * @returns {string[]} Address parts
 */
export function parseAddress(address) {
  return normalizeAddress(address).split('/').filter(Boolean);
}

// ===========================
// Mute Control
// ===========================

/**
 * Set global OSC mute state
 * @param {boolean} muted - Whether to mute OSC output
 */
export function setMuted(muted) {
  oscMuted = !!muted;
  window.oscMuted = oscMuted;
  
  // Update UI
  const muteBtn = document.getElementById("osc-mute-btn");
  if (muteBtn) {
    muteBtn.classList.toggle("is-muted", oscMuted);
    muteBtn.title = oscMuted ? "Enable OSC output" : "Mute OSC output";
  }

  if (debugMode) {
    console.log('[OSC] Muted:', oscMuted);
  }
}

/**
 * Toggle global OSC mute state
 * @returns {boolean} New mute state
 */
export function toggleMuted() {
  setMuted(!oscMuted);
  return oscMuted;
}

/**
 * Check if OSC is muted
 * @returns {boolean} Mute state
 */
export function isMuted() {
  return oscMuted;
}

// ===========================
// UI Integration
// ===========================

/**
 * Update the OSC preview UI
 * @param {Object} payload - OSC message
 * @param {boolean} muted - Whether message was muted
 */
function updateUIPreview(payload, muted = false) {
  try {
    const box = document.getElementById("osc-latest");
    if (!box) return;

    let path = "/oscilla";
    if (payload.addr) path += `/${payload.addr}`;

    let values = [];
    if (Array.isArray(payload.args)) {
      values = payload.args.map(formatValue);
    } else {
      for (const [k, v] of Object.entries(payload)) {
        if (k === "addr" || k === "type" || k === "timestamp") continue;
        if (typeof v === "number") values.push(formatValue(v));
      }
    }

    const text = `${path} ${values.join(" ")}`.trim();
    box.textContent = muted ? `[muted] ${text}` : text;
  } catch { /* ignore */ }
}

/**
 * Format a value for display
 */
function formatValue(v) {
  if (Number.isInteger(v)) return v;
  if (typeof v === 'number') return Number(v.toFixed(3));
  return v;
}

/**
 * Get the last sent OSC message
 * @returns {Object|null} Last message or null
 */
export function getLastMessage() {
  return lastOscMessage;
}

// ===========================
// Debug Mode
// ===========================

/**
 * Enable or disable debug logging
 * @param {boolean} enabled - Whether to enable debug
 */
export function setDebugMode(enabled) {
  debugMode = !!enabled;
}

// ===========================
// Window Bindings
// ===========================

// Sync with existing global
oscMuted = !!window.oscMuted;

// Expose to window for compatibility
window.oscillaOSC = {
  sendOSC,
  send,
  sendControl,
  onAddress,
  dispatchOSC,
  normalizeAddress,
  buildAddress,
  parseAddress,
  setMuted,
  toggleMuted,
  isMuted,
  getLastMessage,
  setDebugMode
};

// ===========================
// Default Export
// ===========================

export default {
  sendOSC,
  send,
  sendControl,
  onAddress,
  dispatchOSC,
  normalizeAddress,
  buildAddress,
  parseAddress,
  setMuted,
  toggleMuted,
  isMuted,
  getLastMessage,
  setDebugMode
};
