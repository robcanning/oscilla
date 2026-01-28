/*!
 * oscillaParserSignalRef.js — Signal Reference Parser Extension
 * Part of oscillaScore control plane architecture
 * © 2025 Rob Canning — GPLv3
 *
 * This module extends the parser's value extraction to recognize signal references.
 * 
 * Signal Reference Syntax:
 *   uid.channel           → binds to signal from uid
 *   uid.channel[min,max]  → binds with output range mapping
 *
 * Examples:
 *   freq:fader1.t              → freq bound to fader1's t value (0-1)
 *   freq:fader1.t[200,2000]    → freq bound, mapped to 200-2000 Hz
 *   amp:slider.y[0,0.5]        → amp bound to slider's y, mapped to 0-0.5
 *   pan:knob.x[-1,1]           → pan bound to knob's x, mapped to -1 to 1
 *
 * Integration:
 *   This should be imported by oscillaParser.js and used in value extraction.
 *   Alternatively, patch the extractValue function to check for signal refs.
 */

// ===========================
// Signal Reference Detection
// ===========================

/**
 * Pattern to match signal reference strings
 * Matches: identifier.identifier or identifier.identifier[number,number]
 */
const SIGNAL_REF_PATTERN = /^([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)(?:\[\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\])?$/;

/**
 * Check if a string looks like a signal reference
 * @param {string} str - String to check
 * @returns {boolean}
 */
export function looksLikeSignalRef(str) {
  if (!str || typeof str !== 'string') return false;
  return SIGNAL_REF_PATTERN.test(str);
}

/**
 * Parse a signal reference string into a signalRef object
 * @param {string} str - String like "fader1.t" or "fader1.t[200,2000]"
 * @returns {Object|null} SignalRef object or null if not a valid reference
 */
export function parseSignalRef(str) {
  if (!str || typeof str !== 'string') return null;

  const match = str.match(SIGNAL_REF_PATTERN);
  if (!match) return null;

  const [, source, channel, minStr, maxStr] = match;

  // Build the signal reference object
  const ref = {
    type: 'signalRef',
    source,
    channel
  };

  // Parse range if provided
  if (minStr !== undefined && maxStr !== undefined) {
    const min = parseFloat(minStr);
    const max = parseFloat(maxStr);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      ref.range = [min, max];
    }
  }

  return ref;
}

/**
 * Check if a parsed value is a signal reference
 * @param {any} value - Value to check
 * @returns {boolean}
 */
export function isSignalRef(value) {
  return value && typeof value === 'object' && value.type === 'signalRef';
}

// ===========================
// Parser Integration Helper
// ===========================

/**
 * Process a raw value and convert signal references
 * This should be called during AST extraction for relevant parameters
 * 
 * @param {any} rawValue - Raw value from parser
 * @param {string} paramName - Parameter name (for context)
 * @returns {any} Processed value (may be signalRef object)
 */
export function processParamValue(rawValue, paramName = '') {
  // If it's already a complex type, return as-is
  if (rawValue && typeof rawValue === 'object') {
    return rawValue;
  }

  // If it's a string, check for signal reference
  if (typeof rawValue === 'string') {
    const signalRef = parseSignalRef(rawValue);
    if (signalRef) {
      return signalRef;
    }
  }

  // Return original value
  return rawValue;
}

/**
 * List of parameter names that support signal binding
 * Other parameters will not be checked for signal refs
 */
export const BINDABLE_PARAMS = new Set([
  // Synth parameters
  'freq', 'frequency',
  'amp', 'amplitude', 'gain',
  'pan',
  'cutoff', 'filterFreq',
  'q', 'resonance',
  'detune',
  
  // Audio parameters  
  'pitch',
  'playbackRate', 'rate',
  
  // Effect parameters
  'delayTime', 'delay',
  'feedback', 'fb',
  'mix', 'wet', 'dry',
  'reverbMix', 'reverbTime',
  
  // Animation parameters (for cross-animation control)
  'speed', 'dur', 'duration'
]);

/**
 * Check if a parameter name supports signal binding
 * @param {string} paramName - Parameter name
 * @returns {boolean}
 */
export function isBindableParam(paramName) {
  return BINDABLE_PARAMS.has(paramName) || BINDABLE_PARAMS.has(paramName.toLowerCase());
}

// ===========================
// Parser Patch Function
// ===========================

/**
 * Patch to apply to parser's value extraction
 * Call this with the extracted value and parameter name
 * 
 * @example
 * // In parser's extractObjectValue or similar:
 * let val = extractRawValue(node);
 * val = maybeConvertToSignalRef(val, paramName);
 * 
 * @param {any} value - Extracted value
 * @param {string} paramName - Parameter name
 * @returns {any} Value, possibly converted to signalRef
 */
export function maybeConvertToSignalRef(value, paramName) {
  // Only process bindable parameters
  if (!isBindableParam(paramName)) {
    return value;
  }

  // Check if string looks like signal ref
  if (typeof value === 'string' && looksLikeSignalRef(value)) {
    const ref = parseSignalRef(value);
    if (ref) {
      console.log(`[Parser] Converted "${value}" to signalRef for param "${paramName}"`);
      return ref;
    }
  }

  return value;
}

// ===========================
// Exports for Parser Integration
// ===========================

export default {
  looksLikeSignalRef,
  parseSignalRef,
  isSignalRef,
  processParamValue,
  isBindableParam,
  maybeConvertToSignalRef,
  BINDABLE_PARAMS
};

// Also expose on window for debugging
window.oscillaSignalRef = {
  parse: parseSignalRef,
  isRef: isSignalRef,
  looksLike: looksLikeSignalRef,
  convert: maybeConvertToSignalRef
};
