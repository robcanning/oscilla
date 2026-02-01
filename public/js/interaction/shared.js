// public/js/oscillaContributionShared.js
//
// Shared utilities and state management for Oscilla Contribution modules
// (Annotations, Markers, Triggers, Recordings)
//
// This module provides:
// - Shared state object
// - Common utility functions (ulidLike, nowMs, etc.)
// - Annotation CRUD operations
// - WebSocket helpers
// - Storage helpers

// =============================================================
// CONSTANTS
// =============================================================

export const STORAGE_PREFIX = "oscilla_annotations_v1";
export const DEFAULT_AUTHOR_LABEL = "Performer";
export const POLL_SOCKET_MS = 500;

// =============================================================
// SHARED STATE
// =============================================================

export const state = {
    initialized: false,
    enabled: true,
    annotationMode: false,
    shareByDefault: false,

    project: null,
    items: [],

    // layers
    scoreLayer: null,
    pageLayer: null,

    // editor
    activeEditor: null,

    // socket polling
    socketPollId: null,
};

// Global flag for text input (prevents keyboard shortcuts)
window.oscillaTextInputActive = false;

// =============================================================
// UTILITY FUNCTIONS
// =============================================================

/**
 * Generate a unique ID (ULID-like)
 */
export function ulidLike() {
    return (
        "ann_" +
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
// PROJECT & MODE CONTEXT
// =============================================================

/**
 * Get current project name from window globals
 */
export function getProjectName() {
    return window.currentProjectName || window.projectName || "unknown_project";
}

/**
 * Get current mode context (scroll vs page)
 */
export function getModeContext() {
    const mode = window.oscillaMode || "scroll";
    let pageId = null;

    if (mode === "page") {
        // Try to find the current visible page's identifier
        const pageContainer = document.getElementById("singlePage-container");
        if (pageContainer) {
            const svg = pageContainer.querySelector("svg");
            if (svg) {
                pageId = svg.id || svg.getAttribute("data-page-id") || null;
            }
        }
    }

    return { mode, pageId };
}

// =============================================================
// LOCAL STORAGE
// =============================================================

function storageKey(project) {
    return `${STORAGE_PREFIX}:${project}`;
}

export function loadLocal(project) {
    const raw = localStorage.getItem(storageKey(project));
    const parsed = safeJsonParse(raw, null);
    if (!parsed || !Array.isArray(parsed.items)) return [];
    return parsed.items;
}

export function saveLocal(project, items) {
    try {
        localStorage.setItem(
            storageKey(project),
            JSON.stringify({ version: 1, savedAt: nowMs(), items })
        );
    } catch (e) {
        console.warn("[annotations] localStorage save failed:", e);
    }
}

// =============================================================
// WEBSOCKET HELPERS
// =============================================================

export function wsCanSend(ws) {
    return ws && ws.readyState === WebSocket.OPEN;
}

export function wsSend(type, payload) {
    const ws = window.ws;
    if (!wsCanSend(ws)) return;

    try {
        ws.send(JSON.stringify({ type, ...payload }));
    } catch (e) {
        console.warn("[annotations] wsSend failed:", e);
    }
}

// =============================================================
// ANNOTATION CRUD OPERATIONS
// =============================================================

// Render callback - set by main module
let renderAllCallback = null;

export function setRenderCallback(callback) {
    renderAllCallback = callback;
}

function triggerRender() {
    if (typeof renderAllCallback === "function") {
        renderAllCallback();
    }
}

/**
 * Add a new annotation
 */
export function addAnnotation(item) {
    state.items.push(item);
    saveLocal(state.project, state.items);

    if (item.scope === "shared") {
        wsSend("annotation_add", { project: state.project, item });
    }

    triggerRender();
}

/**
 * Update an existing annotation
 */
export function updateAnnotation(id, patch) {
    const idx = state.items.findIndex((x) => x.id === id);
    if (idx < 0) return;

    const prev = state.items[idx];
    const next = {
        ...prev,
        ...patch,
        updatedAt: nowMs(),
    };

    // if scope changes, reflect it
    if (patch.scope) next.scope = patch.scope;

    state.items[idx] = next;
    saveLocal(state.project, state.items);

    if (next.scope === "shared") {
        wsSend("annotation_update", { project: state.project, item: next });
    } else {
        // If it was shared and now local: optionally tell server to delete.
        if (prev.scope === "shared") {
            wsSend("annotation_delete", { project: state.project, id: next.id });
        }
    }

    triggerRender();
}

/**
 * Delete an annotation
 */
export function deleteAnnotation(id) {
    const idx = state.items.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const prev = state.items[idx];
    state.items.splice(idx, 1);
    saveLocal(state.project, state.items);

    if (prev.scope === "shared") {
        wsSend("annotation_delete", { project: state.project, id });
    }

    triggerRender();
}

// =============================================================
// LAYER HELPERS
// =============================================================

/**
 * Clear pins from a layer
 */
export function clearPins(layer) {
    if (!layer) return;
    layer.querySelectorAll(".osc-anno-pin").forEach((n) => n.remove());
}

/**
 * Clear markers from a layer
 */
export function clearMarkers(layer) {
    if (!layer) return;
    layer.querySelectorAll(".osc-marker").forEach((n) => n.remove());
}

/**
 * Check if an item should be rendered based on current mode
 */
export function shouldRenderItem(item) {
    if (!state.enabled) return false;

    const { mode, pageId } = getModeContext();
    const a = item.anchor || {};

    if (mode === "page") {
        return a.mode === "page" && a.pageId && a.pageId === pageId;
    }

    // scroll mode
    return a.mode === "scroll";
}

// =============================================================
// EXPORTS
// =============================================================

export default {
    // Constants
    STORAGE_PREFIX,
    DEFAULT_AUTHOR_LABEL,
    POLL_SOCKET_MS,
    
    // State
    state,
    
    // Utilities
    ulidLike,
    nowMs,
    safeJsonParse,
    clamp01,
    
    // Project/Mode
    getProjectName,
    getModeContext,
    
    // Storage
    loadLocal,
    saveLocal,
    
    // WebSocket
    wsCanSend,
    wsSend,
    
    // CRUD
    setRenderCallback,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    
    // Layer helpers
    clearPins,
    clearMarkers,
    shouldRenderItem,
};
