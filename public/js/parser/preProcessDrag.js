/*!
 * preProcessDrag.js — SVG Drag Pre-Processor for oscillaScore
 * © 2025 Rob Canning — GPLv3
 *
 * Pre-processor that runs AFTER propagate() and BEFORE animationAssign().
 * Scans SVG element IDs for drag(...) tokens, strips them so the
 * Chevrotain parser never sees them, and attaches pointer-based
 * drag behaviour to the element.
 *
 * ─────────────────────────────────────────────────────────────────
 * DSL SYNTAX (comma-separated args inside parens)
 * ─────────────────────────────────────────────────────────────────
 *   drag(1)              → basic drag, visual only
 *   drag(1, osc:1)       → drag + send OSC position messages
 *   drag(1, osc:/my/addr)→ drag + OSC to custom address
 *
 * Can appear standalone or in a space-separated compound ID:
 *   <g id="drag(1)">                                ← standalone
 *   <g id="scale(values:[1,1.5,1], dur:2) drag(1)"> ← compound
 *   <g id="rotate(dir:1, dur:2) drag(1, osc:1)">    ← compound + OSC
 *
 * Works with propagate():
 *   <g id="propagate(scale(min:1,max:2) drag(1), rnd(1,3))">
 *
 * Works with nesting (documented pattern):
 *   <g id="drag(1)">
 *     <g id="scale(values:[1,1.5,1], dur:2)">
 *       <circle ... />
 *     </g>
 *   </g>
 *
 * ─────────────────────────────────────────────────────────────────
 * TRANSFORM COEXISTENCE
 * ─────────────────────────────────────────────────────────────────
 * Drag applies translate() on the OUTER <g> element.
 * Animations (scale, rotate, o2p) work on the INNER .oscilla-anim
 * wrapper created by ensureAnimWrapper(). No conflicts.
 *
 *   <g transform="translate(dragX, dragY)">           ← DRAG
 *     <g class="oscilla-anim" transform="scale(1.5)"> ← ANIM
 *       <circle ... />
 *     </g>
 *   </g>
 *
 * ─────────────────────────────────────────────────────────────────
 * PERSISTENCE & SYNC
 * ─────────────────────────────────────────────────────────────────
 * - Positions saved to localStorage keyed by project + element ID
 * - Positions broadcast via WebSocket so all clients stay in sync
 * - On load, saved positions are restored before first paint
 *
 * ─────────────────────────────────────────────────────────────────
 * PIPELINE INTEGRATION (SVGInit.js)
 * ─────────────────────────────────────────────────────────────────
 *   propagate(svgElement);
 *   preProcessDrag(svgElement);   // ← INSERT HERE
 *   animationAssign(svgElement);
 *   assignCues(svgElement);
 */

import { sendOSC } from "../system/oscillaOSCClient.js";
import { sendSocketMessage } from "../system/socket.js";

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

const TAG = "[drag]";
const STORAGE_KEY_PREFIX = "oscilla.drag.";
const THROTTLE_MS = 16; // ~60fps for socket/OSC sends

// ═══════════════════════════════════════════════════════════════════
// Compound ID splitter (mirrors cueDispatcher.splitCueId)
// ═══════════════════════════════════════════════════════════════════
// Splits "scale(values:[1,1.5], dur:2) drag(1)" into:
//   ["scale(values:[1,1.5], dur:2)", "drag(1)"]

function splitCompoundId(id) {
  if (!id || typeof id !== "string") return [];

  // Paren-depth-aware split: walk characters, track depth,
  // split at depth==0 boundaries between expressions.
  const results = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  let stringChar = "";

  for (let i = 0; i < id.length; i++) {
    const ch = id[i];

    if ((ch === '"' || ch === "'") && !inString) {
      inString = true;
      stringChar = ch;
      continue;
    }
    if (inString && ch === stringChar) {
      inString = false;
      continue;
    }
    if (inString) continue;

    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) {
        const expr = id.slice(start, i + 1).trim();
        if (expr) results.push(expr);
        start = i + 1;
      }
    }
  }

  const tail = id.slice(start).trim();
  if (tail) results.push(tail);

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// Registry — tracks all draggable elements and their state
// ═══════════════════════════════════════════════════════════════════

window._dragRegistry = window._dragRegistry || new Map();

// ═══════════════════════════════════════════════════════════════════
// Persistence helpers
// ═══════════════════════════════════════════════════════════════════

function storageKey(elId) {
  const project = window.currentProject || "default";
  return `${STORAGE_KEY_PREFIX}${project}::${elId}`;
}

function savePosition(elId, x, y) {
  try {
    localStorage.setItem(storageKey(elId), JSON.stringify({ x, y }));
  } catch { /* quota exceeded — non-fatal */ }
}

function loadPosition(elId) {
  try {
    const raw = localStorage.getItem(storageKey(elId));
    if (!raw) return null;
    const pos = JSON.parse(raw);
    if (typeof pos.x === "number" && typeof pos.y === "number") return pos;
  } catch { /* corrupt data — ignore */ }
  return null;
}

/**
 * Clear all saved drag positions for the current project.
 * Useful on score reload or reset.
 */
export function clearDragPositions() {
  const project = window.currentProject || "default";
  const prefix = `${STORAGE_KEY_PREFIX}${project}::`;
  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) toRemove.push(key);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
  console.log(`${TAG} Cleared ${toRemove.length} saved positions`);
}

// ═══════════════════════════════════════════════════════════════════
// Socket sync
// ═══════════════════════════════════════════════════════════════════

function broadcastDragPosition(elId, x, y) {
  sendSocketMessage("drag_position", {
    elementId: elId,
    project: window.currentProject || "default",
    x,
    y,
  });
}

/**
 * Request all saved drag positions from the server.
 * Call after preProcessDrag has attached handlers so the registry
 * is populated and positions can be applied.
 */
export function requestDragPositions() {
  const project = window.currentProject || "default";
  sendSocketMessage("drag_positions_request", { project });
}

/**
 * Handle incoming drag_position messages from other clients.
 * Call this from socket.js message handler.
 */
export function handleDragSync(data) {
  const { elementId, x, y, project } = data;
  if (!elementId) return;

  // Only apply if same project
  if (project && project !== (window.currentProject || "default")) return;

  const entry = window._dragRegistry.get(elementId);
  if (!entry) return;

  // Update position without re-broadcasting
  entry.dx = x;
  entry.dy = y;
  applyTranslate(entry.el, x, y);
  savePosition(elementId, x, y);
}

/**
 * Handle the full positions response from server (on connect / load).
 * Server sends: { type: "drag_positions_response", project, positions: { elId: {x,y}, ... } }
 */
export function handleDragPositionsResponse(data) {
  const { project, positions } = data;
  if (!positions || typeof positions !== "object") return;

  // Only apply if same project
  if (project && project !== (window.currentProject || "default")) return;

  let applied = 0;
  for (const [elementId, pos] of Object.entries(positions)) {
    if (typeof pos.x !== "number" || typeof pos.y !== "number") continue;

    const entry = window._dragRegistry.get(elementId);
    if (entry) {
      entry.dx = pos.x;
      entry.dy = pos.y;
      applyTranslate(entry.el, pos.x, pos.y);
      applied++;
    }

    // Also update localStorage so it survives if server restarts
    savePosition(elementId, pos.x, pos.y);
  }

  if (applied > 0) {
    console.log(`${TAG} 📥 Restored ${applied} position(s) from server`);
  }
}

/**
 * Handle drag_positions_reset from another client.
 * Resets all local positions to origin.
 */
export function handleDragPositionsReset(data) {
  const { project } = data;
  if (project && project !== (window.currentProject || "default")) return;

  for (const [key, entry] of window._dragRegistry.entries()) {
    entry.dx = 0;
    entry.dy = 0;
    applyTranslate(entry.el, 0, 0);
  }
  clearDragPositions();
  console.log(`${TAG} 🔄 Positions reset (from remote)`);
}

// ═══════════════════════════════════════════════════════════════════
// SVG coordinate transform helper
// ═══════════════════════════════════════════════════════════════════

function getSVGPoint(svg, clientX, clientY) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: clientX, y: clientY };
  return pt.matrixTransform(ctm.inverse());
}

// ═══════════════════════════════════════════════════════════════════
// Transform application
// ═══════════════════════════════════════════════════════════════════

function applyTranslate(el, dx, dy) {
  // Read the base transform captured at init time.
  // This is the original Inkscape transform (translate, matrix, rotate, etc.)
  // that must be preserved — drag composes additively on top of it.
  const base = el._dragBaseTransform || "";

  const hasDrag = (dx !== 0 || dy !== 0);
  const drag = hasDrag ? `translate(${dx}, ${dy})` : "";

  const parts = [drag, base].filter(Boolean).join(" ");

  if (parts) {
    el.setAttribute("transform", parts);
  } else {
    el.removeAttribute("transform");
  }
}

// ═══════════════════════════════════════════════════════════════════
// Drag argument parser
// ═══════════════════════════════════════════════════════════════════
// Parses the inside of drag(...):
//   "1"              → { enabled: true, osc: false }
//   "1, osc:1"       → { enabled: true, osc: true }
//   "1, osc:/a/b"    → { enabled: true, osc: true, oscAddr: "/a/b" }

function parseDragArgs(argStr) {
  const cfg = {
    enabled: false,
    osc: false,
    oscAddr: null,
  };

  if (!argStr || argStr.trim() === "") return cfg;

  // Split on commas (safe — drag args have no nested parens/brackets)
  const parts = argStr.split(",").map(s => s.trim());

  for (const part of parts) {
    // Enable flag: "1" or "true"
    if (part === "1" || part === "true") {
      cfg.enabled = true;
      continue;
    }

    // osc:1 or osc:/custom/addr
    const oscMatch = part.match(/^osc:(.+)$/i);
    if (oscMatch) {
      cfg.osc = true;
      const val = oscMatch[1].trim();
      if (val !== "1" && val !== "true") {
        cfg.oscAddr = val; // custom OSC address
      }
      continue;
    }
  }

  return cfg;
}

// ═══════════════════════════════════════════════════════════════════
// Core: attach drag behaviour to an SVG element
// ═══════════════════════════════════════════════════════════════════

function attachDrag(el, cfg, persistKey) {
  const svg = el.closest("svg") || el.ownerSVGElement;
  if (!svg) {
    console.warn(`${TAG} No parent SVG found for`, el);
    return;
  }

  // ── Capture Inkscape's original transform before drag modifies it ──
  // This preserves translate(), matrix(), rotate(), etc. from authoring.
  // Must happen before any applyTranslate() call.
  if (el._dragBaseTransform === undefined) {
    el._dragBaseTransform = el.getAttribute("transform") || "";
  }

  // ── State ──────────────────────────────────────────────────
  const state = {
    el,
    cfg,
    dragging: false,
    dx: 0,         // cumulative translate X
    dy: 0,         // cumulative translate Y
    startX: 0,     // pointer start in SVG coords
    startY: 0,
    origDx: 0,     // dx at drag start
    origDy: 0,
    lastSendTime: 0,
  };

  // ── Restore persisted position ─────────────────────────────
  const saved = loadPosition(persistKey);
  if (saved) {
    state.dx = saved.x;
    state.dy = saved.y;
    applyTranslate(el, saved.x, saved.y);
  }

  // ── Register ───────────────────────────────────────────────
  window._dragRegistry.set(persistKey, state);

  // ── Visual hint ────────────────────────────────────────────
  el.style.cursor = "grab";

  // ── Throttled send ─────────────────────────────────────────
  function throttledSend(dx, dy) {
    const now = performance.now();
    if (now - state.lastSendTime < THROTTLE_MS) return;
    state.lastSendTime = now;

    // Socket sync to other clients
    broadcastDragPosition(persistKey, dx, dy);

    // Optional OSC
    if (cfg.osc) {
      const addr = cfg.oscAddr || `drag/${persistKey}`;
      sendOSC({
        type: "osc_drag",
        uid: persistKey,
        addr,
        x: Number(dx.toFixed(2)),
        y: Number(dy.toFixed(2)),
        timestamp: Date.now(),
      });
    }
  }

  // ── Pointer handlers ───────────────────────────────────────

  function onPointerDown(e) {
    // Only primary button (left click / single touch)
    if (e.button && e.button !== 0) return;

    // Don't interfere with buttons or interactive children
    if (e.target.closest("[data-cue-button], .oscilla-hit-label")) return;

    e.stopPropagation();

    state.dragging = true;
    state.origDx = state.dx;
    state.origDy = state.dy;

    const svgPt = getSVGPoint(svg, e.clientX, e.clientY);
    state.startX = svgPt.x;
    state.startY = svgPt.y;

    el.style.cursor = "grabbing";
    el.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    if (!state.dragging) return;
    e.stopPropagation();
    e.preventDefault();

    const svgPt = getSVGPoint(svg, e.clientX, e.clientY);
    state.dx = state.origDx + (svgPt.x - state.startX);
    state.dy = state.origDy + (svgPt.y - state.startY);

    applyTranslate(el, state.dx, state.dy);
    throttledSend(state.dx, state.dy);
  }

  function onPointerUp(e) {
    if (!state.dragging) return;
    e.stopPropagation();

    state.dragging = false;
    el.style.cursor = "grab";
    el.releasePointerCapture(e.pointerId);

    // Final save + broadcast
    savePosition(persistKey, state.dx, state.dy);
    broadcastDragPosition(persistKey, state.dx, state.dy);

    // Final OSC send (not throttled)
    if (cfg.osc) {
      const addr = cfg.oscAddr || `drag/${persistKey}`;
      sendOSC({
        type: "osc_drag",
        uid: persistKey,
        addr,
        x: Number(state.dx.toFixed(2)),
        y: Number(state.dy.toFixed(2)),
        timestamp: Date.now(),
      });
    }

    console.log(`${TAG} 📌 ${persistKey} → (${state.dx.toFixed(1)}, ${state.dy.toFixed(1)})`);
  }

  function onPointerCancel(e) {
    if (!state.dragging) return;
    // Revert to position at drag start
    state.dx = state.origDx;
    state.dy = state.origDy;
    applyTranslate(el, state.dx, state.dy);
    state.dragging = false;
    el.style.cursor = "grab";
  }

  // ── Bind ───────────────────────────────────────────────────
  el.addEventListener("pointerdown", onPointerDown);
  el.addEventListener("pointermove", onPointerMove);
  el.addEventListener("pointerup", onPointerUp);
  el.addEventListener("pointercancel", onPointerCancel);

  // Touch: prevent scroll while dragging
  el.addEventListener("touchstart", (e) => {
    if (state.dragging) e.preventDefault();
  }, { passive: false });

  el.addEventListener("touchmove", (e) => {
    if (state.dragging) e.preventDefault();
  }, { passive: false });

  // Store cleanup reference
  state._cleanup = () => {
    el.removeEventListener("pointerdown", onPointerDown);
    el.removeEventListener("pointermove", onPointerMove);
    el.removeEventListener("pointerup", onPointerUp);
    el.removeEventListener("pointercancel", onPointerCancel);
    el.style.cursor = "";
  };
}

// ═══════════════════════════════════════════════════════════════════
// Main pre-processor entry point
// ═══════════════════════════════════════════════════════════════════

/**
 * preProcessDrag(svgRoot)
 * ────────────────────────────────────────────────────────
 * Scans all elements with IDs containing drag(...).
 * For each match:
 *   1. Splits compound ID using same logic as cueDispatcher
 *   2. Extracts and parses the drag(...) expression
 *   3. Strips it from the ID, leaving other cue expressions intact
 *   4. Attaches pointer-based drag handlers
 *   5. Restores any persisted position
 *
 * Must run AFTER propagate() and BEFORE animationAssign().
 */
export function preProcessDrag(svgRoot) {
  if (!svgRoot) return;

  const candidates = svgRoot.querySelectorAll('[id*="drag("]');
  if (!candidates.length) return;

  let count = 0;

  candidates.forEach((el) => {
    const id = el.id;
    if (!id) return;

    // ── Split compound ID into individual expressions ─────
    // e.g. "scale(values:[1,1.5], dur:2) drag(1)" →
    //   ["scale(values:[1,1.5], dur:2)", "drag(1)"]
    const expressions = splitCompoundId(id);

    // ── Find and extract drag expression(s) ───────────────
    let dragExpr = null;
    const remaining = [];

    for (const expr of expressions) {
      if (/^drag\s*\(/i.test(expr)) {
        dragExpr = expr;
      } else {
        remaining.push(expr);
      }
    }

    if (!dragExpr) return;

    // ── Parse drag arguments ──────────────────────────────
    const argsMatch = dragExpr.match(/^drag\s*\(([^)]*)\)$/i);
    if (!argsMatch) return;

    const cfg = parseDragArgs(argsMatch[1]);
    if (!cfg.enabled) return;

    // ── Update element ID (strip drag, keep everything else)
    const cleanId = remaining.join(" ").trim();

    if (cleanId) {
      el.id = cleanId;
    } else {
      // Standalone drag(1) with no other cue — assign a stable ID
      // Try to derive from element position for persistence stability
      const parent = el.parentElement;
      const siblings = parent ? Array.from(parent.children) : [];
      const idx = siblings.indexOf(el);
      const genId = `drag_${idx}_${Math.random().toString(36).slice(2, 6)}`;
      el.id = genId;
    }

    // ── Determine persistence key ─────────────────────────
    // Use the clean ID (the cue expression) as key so it's stable
    // across reloads. For standalone drag, use the generated ID.
    const persistKey = cleanId || el.id;

    // ── Attach drag behaviour ─────────────────────────────
    attachDrag(el, cfg, persistKey);

    count++;
  });

  if (count > 0) {
    console.log(`${TAG} ✅ Attached drag to ${count} element(s)`);

    // Request saved positions from server (overrides localStorage if newer)
    requestDragPositions();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Cleanup — call on score unload / SVG swap
// ═══════════════════════════════════════════════════════════════════

export function cleanupDrag() {
  for (const [key, entry] of window._dragRegistry.entries()) {
    entry._cleanup?.();
    // Clear base transform cache so re-init captures fresh
    if (entry.el) delete entry.el._dragBaseTransform;
  }
  window._dragRegistry.clear();
  console.log(`${TAG} 🧹 All drag handlers removed`);
}

// ═══════════════════════════════════════════════════════════════════
// Reset — clear positions and re-translate to origin
// ═══════════════════════════════════════════════════════════════════

export function resetDragPositions() {
  for (const [key, entry] of window._dragRegistry.entries()) {
    entry.dx = 0;
    entry.dy = 0;
    applyTranslate(entry.el, 0, 0);
    broadcastDragPosition(key, 0, 0);
  }
  clearDragPositions();

  // Tell server to clear stored positions
  sendSocketMessage("drag_positions_reset", {
    project: window.currentProject || "default",
  });

  console.log(`${TAG} 🔄 All drag positions reset to origin`);
}

// ═══════════════════════════════════════════════════════════════════
// Window bindings for console / external access
// ═══════════════════════════════════════════════════════════════════

window.preProcessDrag = preProcessDrag;
window.cleanupDrag = cleanupDrag;
window.resetDragPositions = resetDragPositions;
window.handleDragSync = handleDragSync;
window.handleDragPositionsResponse = handleDragPositionsResponse;
window.handleDragPositionsReset = handleDragPositionsReset;
window.requestDragPositions = requestDragPositions;
