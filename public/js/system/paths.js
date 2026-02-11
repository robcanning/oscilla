/*!
 * oscillaSystemPaths.js — Path Variants Storage & Helpers
 * Part of oscillaScore modular architecture
 * © 2025 Rob Canning — GPLv3
 */

// ===========================
// Path Variants Map
// ===========================

/**
 * Store path variants from an SVG element
 * Paths with IDs matching pattern "path-X-Y" are grouped by base ID "path-X"
 * @param {SVGElement} svgElement - The SVG element to scan
 */
export function storePathVariants(svgElement) {
  window.pathVariantsMap = {};
  if (!svgElement) return;

  svgElement.querySelectorAll("path").forEach(path => {
    const id = path.id;
    if (!id) return;

    // Match pattern: path-{number}-{number}
    const match = id.match(/^path-(\d+)-(\d+)$/);
    if (!match) return;

    // Create base ID by removing the last number segment
    const baseID = id.replace(/-\d+$/, '');
    
    if (!window.pathVariantsMap[baseID]) {
      window.pathVariantsMap[baseID] = [];
    }
    window.pathVariantsMap[baseID].push(path);
  });
}

/**
 * Get path variants for a given base ID
 * @param {string} baseID - The base path ID (e.g., "path-1")
 * @returns {SVGPathElement[]} Array of path elements, or empty array if none found
 */
export function getPathVariants(baseID) {
  return window.pathVariantsMap?.[baseID] || [];
}

/**
 * Get a random variant for a given base ID
 * @param {string} baseID - The base path ID
 * @returns {SVGPathElement|null} Random path element or null if none found
 */
export function getRandomVariant(baseID) {
  const variants = getPathVariants(baseID);
  if (variants.length === 0) return null;
  const index = Math.floor(Math.random() * variants.length);
  return variants[index];
}

/**
 * Get all base IDs that have variants
 * @returns {string[]} Array of base IDs
 */
export function getAllVariantBaseIDs() {
  return Object.keys(window.pathVariantsMap || {});
}

/**
 * Check if a path ID has variants
 * @param {string} baseID - The base path ID
 * @returns {boolean} True if variants exist
 */
export function hasVariants(baseID) {
  return (window.pathVariantsMap?.[baseID]?.length || 0) > 0;
}

// ===========================
// Playhead Position Utilities
// ===========================

/**
 * Ensure window.playheadX is set based on current viewport center
 * Uses SVG coordinate transformation to get accurate position
 */
export function ensureWindowPlayheadX() {
  const svg = document.querySelector("svg");
  if (!svg) return;

  const pt = svg.createSVGPoint();
  pt.x = window.innerWidth * (window.playheadOffsetRatio ?? 0.5);
  pt.y = 0;

  const ctm = svg.getScreenCTM();
  if (!ctm) return;

  window.playheadX = pt.matrixTransform(ctm.inverse()).x;
}

/**
 * Get the current playhead X position in SVG coordinates
 * @returns {number|null} Playhead X position or null if unavailable
 */
export function getPlayheadX() {
  const playhead = document.getElementById("playhead");
  const scoreContainer = window.scoreContainer;
  if (!playhead || !scoreContainer) return null;

  const containerRect = scoreContainer.getBoundingClientRect();
  const playheadRect = playhead.getBoundingClientRect();
  return playheadRect.left - containerRect.left;
}

// ===========================
// Window Bindings
// ===========================

// Initialize the map
window.pathVariantsMap = {};

// Expose to window for legacy compatibility
window.storePathVariants = storePathVariants;
window.ensureWindowPlayheadX = ensureWindowPlayheadX;
window.getPlayheadX = getPlayheadX;
