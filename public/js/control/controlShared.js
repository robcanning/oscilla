// public/js/control/controlShared.js
//
// Shared utilities and state management for the control plane
// Renamed from controlXYShared.js -- serves controlXY, o2p, and future controllers
//
// This module provides:
// - Shared state object
// - Common utility functions
// - localStorage persistence
// - WebSocket helpers (optional sharing)
// - CRUD operations for presets, sequences, launchers, configurations
// - Dynamic kind indexing (any kind string auto-indexes)

// =============================================================
// CONSTANTS
// =============================================================

export const STORAGE_PREFIX = "oscilla_controlxy_v1"; // keep for data continuity
export const SAVE_DEBOUNCE_MS = 500;

// =============================================================
// SHARED STATE
// =============================================================

export const state = {
  initialized: false,
  project: null,
  items: [],
  
  // Derived views (rebuilt dynamically from items by kind)
  // Standard controlXY kinds:
  presets: {},
  sequences: {},
  launchers: {},
  configurations: {},
  // Additional kinds (o2pPresets, o2pSequences, o2pLaunchers, scenes, etc.)
  // are created dynamically by rebuildDerivedState()
};

// =============================================================
// UTILITY FUNCTIONS
// =============================================================

/**
 * Generate a unique ID
 */
export function uniqueId(prefix = "xy") {
  return (
    prefix + "_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 10)
  );
}

/**
 * Current timestamp in milliseconds
 */
export function nowMs() {
  return Date.now();
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/**
 * Clamp a number to 0-1 range
 */
export function clamp01(n) {
  if (typeof n !== "number" || !isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// =============================================================
// PROJECT CONTEXT
// =============================================================

/**
 * Get current project name from window globals
 */
export function getProjectName() {
  return window.currentProjectName || window.projectName || "unknown_project";
}

// =============================================================
// DERIVED STATE BUILDERS
// =============================================================

// Fixed state keys that are never treated as kind buckets
const FIXED_KEYS = new Set(['initialized', 'project', 'items']);

/**
 * Pluralize a kind string for use as a state bucket key
 * "preset" -> "presets", "o2pPreset" -> "o2pPresets", "launcher" -> "launchers"
 */
function pluralizeKind(kind) {
  return kind + 's';
}

/**
 * Determine the lookup key for an item based on its kind
 * Launchers use uid, everything else uses name
 */
function itemKey(item) {
  // Any kind ending in "auncher" (launcher, o2pLauncher) keys by uid
  if (item.kind && item.kind.toLowerCase().endsWith('auncher')) {
    return item.uid;
  }
  return item.name;
}

/**
 * Rebuild derived state objects from items array
 * Dynamic: any kind string gets its own bucket automatically
 */
function rebuildDerivedState() {
  // Clear all dynamic buckets
  for (const key of Object.keys(state)) {
    if (!FIXED_KEYS.has(key)) {
      state[key] = {};
    }
  }
  
  for (const item of state.items) {
    const kind = item.kind;
    if (!kind) continue;
    
    const bucket = pluralizeKind(kind);
    if (!state[bucket]) state[bucket] = {};
    
    const key = itemKey(item);
    if (key) state[bucket][key] = item;
  }
}

// =============================================================
// LOCAL STORAGE
// =============================================================

function storageKey(project) {
  return `${STORAGE_PREFIX}:${project}`;
}

/**
 * Load items from localStorage
 */
export function loadLocal(project) {
  const raw = localStorage.getItem(storageKey(project));
  const parsed = safeJsonParse(raw, null);
  
  if (!parsed || !Array.isArray(parsed.items)) {
    return [];
  }
  
  return parsed.items;
}

/**
 * Save items to localStorage
 */
export function saveLocal(project, items) {
  try {
    localStorage.setItem(
      storageKey(project),
      JSON.stringify({
        version: 1,
        savedAt: nowMs(),
        items
      })
    );
    return true;
  } catch (e) {
    console.warn("[controlShared] localStorage save failed:", e);
    return false;
  }
}

// =============================================================
// WEBSOCKET HELPERS (for future shared scope support)
// =============================================================

/**
 * Get the active WebSocket connection
 */
function getWs() {
  return window.socket || window.ws || null;
}

export function wsCanSend(ws) {
  const socket = ws || getWs();
  return socket && socket.readyState === WebSocket.OPEN;
}

export function wsSend(type, payload) {
  const ws = getWs();
  if (!wsCanSend(ws)) {
    return false;
  }
  
  try {
    ws.send(JSON.stringify({ type, ...payload }));
    console.log("[controlShared] wsSend:", type);
    return true;
  } catch (e) {
    console.warn("[controlShared] wsSend failed:", e);
    return false;
  }
}

// =============================================================
// INITIALIZATION
// =============================================================

/**
 * Initialize the control state for a project
 */
export function init(project) {
  if (!project) {
    project = getProjectName();
  }
  
  state.project = project;
  state.items = loadLocal(project);
  rebuildDerivedState();
  state.initialized = true;
  
  console.log(`[controlShared] Initialized for "${project}": ${state.items.length} items`);
  
  // Log known buckets
  for (const key of Object.keys(state)) {
    if (!FIXED_KEYS.has(key) && typeof state[key] === 'object') {
      const count = Object.keys(state[key]).length;
      if (count > 0) {
        console.log(`[controlShared]   ${key}: ${count}`);
      }
    }
  }
  
  // Dispatch loaded event
  window.dispatchEvent(new CustomEvent('controlxy:loaded', {
    detail: {
      project,
      presetCount: Object.keys(state.presets || {}).length,
      sequenceCount: Object.keys(state.sequences || {}).length,
      configCount: Object.keys(state.configurations || {}).length
    }
  }));
  
  return state;
}

// =============================================================
// SAVE (debounced)
// =============================================================

let saveDebounceTimer = null;

/**
 * Save current state to localStorage (debounced)
 */
export function save() {
  if (!state.project) return;
  
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
  }
  
  saveDebounceTimer = setTimeout(() => {
    const success = saveLocal(state.project, state.items);
    
    if (success) {
      console.log(`[controlShared] Saved ${state.items.length} items`);
      
      window.dispatchEvent(new CustomEvent('controlxy:saved', {
        detail: {
          project: state.project,
          itemCount: state.items.length
        }
      }));
    }
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Force immediate save (bypasses debounce)
 */
export function forceSave() {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = null;
  }
  
  if (!state.project) return false;
  
  const success = saveLocal(state.project, state.items);
  
  if (success) {
    console.log(`[controlShared] Force-saved ${state.items.length} items`);
  }
  
  return success;
}

// =============================================================
// CRUD OPERATIONS
// =============================================================

// Render callback - set by UI modules
let renderCallback = null;

export function setRenderCallback(callback) {
  renderCallback = callback;
}

function triggerRender() {
  if (typeof renderCallback === "function") {
    renderCallback();
  }
}

/**
 * Add a new item
 */
export function addItem(item) {
  if (!item.id) item.id = uniqueId(item.kind || "item");
  if (!item.createdAt) item.createdAt = nowMs();
  if (!item.updatedAt) item.updatedAt = nowMs();
  
  state.items.push(item);
  rebuildDerivedState();
  save();
  
  if (item.scope === "shared") {
    wsSend("controlxy_add", { project: state.project, item });
  }
  
  triggerRender();
  return item;
}

/**
 * Update an existing item by ID
 */
export function updateItem(id, patch) {
  const idx = state.items.findIndex(x => x.id === id);
  if (idx < 0) return null;
  
  const prev = state.items[idx];
  const next = {
    ...prev,
    ...patch,
    updatedAt: nowMs()
  };
  
  state.items[idx] = next;
  rebuildDerivedState();
  save();
  
  if (next.scope === "shared") {
    wsSend("controlxy_update", { project: state.project, item: next });
  } else if (prev.scope === "shared") {
    wsSend("controlxy_delete", { project: state.project, id: next.id });
  }
  
  triggerRender();
  return next;
}

/**
 * Delete an item by ID
 */
export function deleteItem(id) {
  const idx = state.items.findIndex(x => x.id === id);
  if (idx < 0) return false;
  
  const prev = state.items[idx];
  state.items.splice(idx, 1);
  rebuildDerivedState();
  save();
  
  if (prev.scope === "shared") {
    wsSend("controlxy_delete", { project: state.project, id: prev.id });
  }
  
  triggerRender();
  return true;
}

/**
 * Find item by ID
 */
export function findById(id) {
  return state.items.find(x => x.id === id) || null;
}

/**
 * Find items by kind
 */
export function findByKind(kind) {
  return state.items.filter(x => x.kind === kind);
}

// =============================================================
// PRESET HELPERS (controlXY backward compat)
// =============================================================

/**
 * Get preset by name
 */
export function getPreset(name) {
  return state.presets?.[name] || null;
}

/**
 * List all preset names
 */
export function listPresets() {
  return Object.keys(state.presets || {});
}

/**
 * Save/update a preset
 */
export function savePreset(name, data) {
  const existing = state.presets?.[name];
  
  if (existing) {
    return updateItem(existing.id, { data });
  } else {
    return addItem({
      kind: "preset",
      name,
      data,
      scope: "local"
    });
  }
}

/**
 * Delete a preset by name
 */
export function deletePreset(name) {
  const item = state.presets?.[name];
  if (!item) return false;
  return deleteItem(item.id);
}

// =============================================================
// SEQUENCE HELPERS
// =============================================================

/**
 * Get sequence by name
 */
export function getSequence(name) {
  return state.sequences?.[name] || null;
}

/**
 * List all sequence names
 */
export function listSequences() {
  return Object.keys(state.sequences || {});
}

/**
 * Save/update a sequence
 */
export function saveSequence(name, steps, options = {}) {
  const existing = state.sequences?.[name];
  
  const data = {
    steps,
    loop: options.loop ?? false
  };
  
  if (existing) {
    return updateItem(existing.id, { data });
  } else {
    return addItem({
      kind: "sequence",
      name,
      data,
      scope: "local"
    });
  }
}

/**
 * Delete a sequence by name
 */
export function deleteSequence(name) {
  const item = state.sequences?.[name];
  if (!item) return false;
  return deleteItem(item.id);
}

// =============================================================
// LAUNCHER HELPERS
// =============================================================

/**
 * Get launcher state by UID
 */
export function getLauncher(uid) {
  return state.launchers?.[uid] || null;
}

/**
 * List all launcher UIDs
 */
export function listLaunchers() {
  return Object.keys(state.launchers || {});
}

/**
 * Save/update launcher state
 */
export function saveLauncher(uid, launcherData) {
  const existing = state.launchers?.[uid];
  
  if (existing) {
    return updateItem(existing.id, { data: launcherData });
  } else {
    return addItem({
      kind: "launcher",
      uid,
      data: launcherData,
      scope: "local"
    });
  }
}

/**
 * Get or create launcher state
 */
export function getOrCreateLauncher(uid, defaults = {}) {
  const existing = state.launchers?.[uid];
  
  if (existing && existing.data) {
    return existing.data;
  }
  
  const launcherData = {
    currentBank: 0,
    mode: 'preset',
    tween: true,
    visible: true,
    banks: [],
    ...defaults
  };
  
  saveLauncher(uid, launcherData);
  
  return launcherData;
}

// =============================================================
// CONFIGURATION HELPERS
// =============================================================

export function getConfiguration(name) {
  return state.configurations?.[name] || null;
}

export function listConfigurations() {
  return Object.keys(state.configurations || {});
}

export function saveConfiguration(name) {
  const launchersSnapshot = {};
  
  for (const [uid, item] of Object.entries(state.launchers || {})) {
    if (item && item.data) {
      launchersSnapshot[uid] = JSON.parse(JSON.stringify(item.data));
    }
  }
  
  const existing = state.configurations?.[name];
  
  if (existing) {
    return updateItem(existing.id, { data: { launchers: launchersSnapshot } });
  } else {
    return addItem({
      kind: "configuration",
      name,
      data: { launchers: launchersSnapshot },
      scope: "local"
    });
  }
}

export function recallConfiguration(name) {
  const config = state.configurations?.[name];
  if (!config || !config.data || !config.data.launchers) {
    console.warn(`[controlShared] Configuration "${name}" not found`);
    return false;
  }
  
  const launchersData = config.data.launchers;
  
  for (const [uid, launcherData] of Object.entries(launchersData)) {
    saveLauncher(uid, launcherData);
  }
  
  window.dispatchEvent(new CustomEvent('controlxy:launcherRefresh', {
    detail: {}
  }));
  
  console.log(`[controlShared] Recalled configuration "${name}"`);
  return true;
}

export function deleteConfiguration(name) {
  const item = state.configurations?.[name];
  if (!item) return false;
  return deleteItem(item.id);
}

// =============================================================
// GENERIC KIND HELPERS (for o2p and future controllers)
// =============================================================

/**
 * Get item from any kind bucket by name
 * Usage: getByKind("o2pPreset", "warm_mix")
 */
export function getByKind(kind, name) {
  const bucket = pluralizeKind(kind);
  return state[bucket]?.[name] || null;
}

/**
 * List all names in a kind bucket
 * Usage: listByKind("o2pPreset") -> ["warm_mix", "dark_mix"]
 */
export function listByKind(kind) {
  const bucket = pluralizeKind(kind);
  return Object.keys(state[bucket] || {});
}

/**
 * Save/update an item in any kind bucket
 * Usage: saveByKind("o2pPreset", "warm_mix", data)
 */
export function saveByKind(kind, name, data) {
  const existing = getByKind(kind, name);
  
  if (existing) {
    return updateItem(existing.id, { data });
  } else {
    return addItem({
      kind,
      name,
      data,
      scope: "local"
    });
  }
}

/**
 * Delete an item from any kind bucket
 */
export function deleteByKind(kind, name) {
  const item = getByKind(kind, name);
  if (!item) return false;
  return deleteItem(item.id);
}

/**
 * Save/update a launcher-style item (keyed by uid)
 */
export function saveLauncherByKind(kind, uid, data) {
  const bucket = pluralizeKind(kind);
  const existing = state[bucket]?.[uid];
  
  if (existing) {
    return updateItem(existing.id, { data });
  } else {
    return addItem({
      kind,
      uid,
      data,
      scope: "local"
    });
  }
}

/**
 * Get or create a launcher-style item
 */
export function getOrCreateLauncherByKind(kind, uid, defaults = {}) {
  const bucket = pluralizeKind(kind);
  const existing = state[bucket]?.[uid];
  
  if (existing && existing.data) {
    return existing.data;
  }
  
  const data = { ...defaults };
  saveLauncherByKind(kind, uid, data);
  return data;
}

// =============================================================
// EXPORT / IMPORT
// =============================================================

export function exportData() {
  return {
    version: 1,
    exportedAt: nowMs(),
    project: state.project,
    items: state.items
  };
}

export function exportToFile(filename) {
  const data = exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `controlxy-${state.project}-${Date.now()}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
}

export function importData(data, options = {}) {
  const { merge = false } = options;
  
  if (!data || !Array.isArray(data.items)) {
    console.warn("[controlShared] Invalid import data");
    return false;
  }
  
  if (merge) {
    for (const item of data.items) {
      const exists = state.items.some(x => x.id === item.id);
      if (!exists) {
        state.items.push(item);
      }
    }
  } else {
    state.items = data.items;
  }
  
  rebuildDerivedState();
  forceSave();
  triggerRender();
  
  window.dispatchEvent(new CustomEvent('controlxy:launcherRefresh', {
    detail: {}
  }));
  
  console.log(`[controlShared] Imported ${data.items.length} items (merge: ${merge})`);
  return true;
}

// =============================================================
// GLOBAL API
// =============================================================

window.controlXYState = state;

export default {
  STORAGE_PREFIX,
  state,
  
  // Utilities
  uniqueId, nowMs, safeJsonParse, clamp01, getProjectName,
  
  // Init
  init,
  
  // Persistence
  save, forceSave, loadLocal, saveLocal,
  
  // WebSocket
  wsCanSend, wsSend,
  
  // CRUD
  setRenderCallback, addItem, updateItem, deleteItem, findById, findByKind,
  
  // controlXY presets (backward compat)
  getPreset, listPresets, savePreset, deletePreset,
  
  // Sequences
  getSequence, listSequences, saveSequence, deleteSequence,
  
  // Launchers
  getLauncher, listLaunchers, saveLauncher, getOrCreateLauncher,
  
  // Configurations
  getConfiguration, listConfigurations, saveConfiguration, recallConfiguration, deleteConfiguration,
  
  // Generic kind helpers
  getByKind, listByKind, saveByKind, deleteByKind,
  saveLauncherByKind, getOrCreateLauncherByKind,
  
  // Export/Import
  exportData, exportToFile, importData,
};
