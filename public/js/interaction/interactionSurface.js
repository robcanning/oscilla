// public/js/oscillaContributionSurface.js
//
// Performer Annotations & Contribution Surface (browser-layer, non-SVG)
// Main orchestration file for the annotation system.
//
// Sub-systems are modularized:
// - oscillaContributionShared.js      (shared state, utilities, CRUD)
// - oscillaContributionMarker.js      (drop marker system)
// - oscillaContributionTrigger.js     (trigger execution, playhead triggers)
// - oscillaContributionPin.js         (annotation pin elements)
// - oscillaContributionEditor.js      (annotation editor UI)
// - oscillaContributionAudioBrowser.js (audio file browser & upload)
// - oscillaContributionRecorder.js    (audio recording)
// - oscillaColorPicker.js             (color picker component)

import { getStopwatchTime } from "../cues/timers.js";

// Shared utilities and state
import {
    STORAGE_PREFIX,
    DEFAULT_AUTHOR_LABEL,
    POLL_SOCKET_MS,
    state,
    ulidLike,
    nowMs,
    safeJsonParse,
    clamp01,
    getProjectName,
    getModeContext,
    loadLocal,
    saveLocal,
    wsCanSend,
    wsSend,
    setRenderCallback,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    clearPins,
    shouldRenderItem,
} from "./shared.js";

// Marker system
import {
    toggleMarkersVisibility,
    getMarkersVisible,
    makeMarkerEl,
    openMarkerEditor,
    dropMarker,
    clearMarkers,
    getMarkers,
    initMarkers,
} from "./markers.js";

// Trigger system
import {
    TRIGGER_BORDER_COLOR,
    executeTrigger,
    executeTriggerById,
    clearTriggerPools,
    checkAnnotationPlayheadTriggers,
    resetAnnotationPlayheadTriggers,
    getTriggers,
} from "./trigger.js";

// Pin elements and editor (consolidated)
import {
    getScoreScrollInner,
    positionAnnotation,
    makePinEl,
    makeEditor,
} from "./annotationEditor.js";

// Re-export for external use
export { 
    toggleMarkersVisibility, 
    getMarkersVisible, 
    dropMarker,
    checkAnnotationPlayheadTriggers,
    resetAnnotationPlayheadTriggers,
};

// =============================================================
// MODULE-LOCAL STATE
// =============================================================

let lastAnnotationFontSize = 12;

// =============================================================
// HELPER FUNCTIONS
// =============================================================

function getAuthorId() {
    if (window.sessionClientId) return window.sessionClientId;
    if (window.clientId) return window.clientId;

    let id = localStorage.getItem("oscilla_author_id");
    if (!id) {
        id = ulidLike();
        localStorage.setItem("oscilla_author_id", id);
    }
    return id;
}

function getAuthorLabel() {
    return window.oscillaAuthorLabel || DEFAULT_AUTHOR_LABEL;
}

function getWs() {
    return window.ws || null;
}

function ensureLayer(parent, id) {
    if (!parent) return null;
    let layer = parent.querySelector(`#${id}`);
    if (!layer) {
        layer = document.createElement("div");
        layer.id = id;
        layer.className = "osc-annotation-layer";
        Object.assign(layer.style, {
            position: "absolute",
            inset: "0",
            pointerEvents: "none",
            overflow: "visible",
            zIndex: "1000",
        });
        parent.appendChild(layer);
    }
    return layer;
}

function withinScoreClickTarget(target) {
    if (!target) return null;
    // If you click on SVG shapes inside #scoreContainer, the event target can be:
    // - svg element (path, g, etc.) with id
    // - wrapper elements
    // We want nearest element with an id.
    const withId = target.closest?.("[id]");
    if (withId && withId.id) return withId.id;
    return null;
}

function isWithinScoreArea(target) {
    if (!target) return false;
    const svg = target.closest("svg");
    const container =
        target.closest("#scoreContainer") ||
        target.closest("#singlePage-container");
    return !!(svg || container);
}

function getScoreContainer() {
    return document.getElementById("scoreContainer");
}

function getPageContentContainer() {
    return document.getElementById("singlePage-container")?.querySelector(".page-content");
}

function getScoreClickPlacement(evt) {
    // IMPORTANT:
    // placement.x/y are stored in WORLD coordinates (like playheadX),
    // so they sync correctly across clients with different screen sizes.
    // Convert screen click position to world coordinates using localScale.
    const score = getScoreContainer();
    if (!score) return null;

    const inner = getScoreScrollInner?.() || score.querySelector(".oscilla-score-inner");
    if (!inner) return null;

    const r = inner.getBoundingClientRect();

    // Get localScale for screen→world conversion
    const localScale = (typeof window.localScale === "number" && 
                        isFinite(window.localScale) && 
                        window.localScale > 0) 
                        ? window.localScale 
                        : 1;

    // Convert screen coordinates to world coordinates
    const screenX = evt.clientX - r.left;
    const screenY = evt.clientY - r.top;
    const worldX = screenX / localScale;
    const worldY = screenY / localScale;

    return {
        space: "score",
        x: worldX,
        y: worldY,
    };
}

function getPageClickPlacement(evt, content) {
    if (!content) return null;
    const rect = content.getBoundingClientRect();

    return {
        space: "pageOverlay",
        xRatio: clamp01((evt.clientX - rect.left) / rect.width),
        yRatio: clamp01((evt.clientY - rect.top) / rect.height),
    };
}

// =============================================================
// DOM LAYERS
// =============================================================

function attachDomLayersIfPossible() {
    if (state.scoreLayer?.isConnected) return;

    const inner = getScoreScrollInner();
    if (!inner) return;

    const layer = document.createElement("div");
    layer.id = "oscilla-annotations-layer-score";
    layer.style.position = "absolute";
    layer.style.left = "0";
    layer.style.top = "0";
    layer.style.pointerEvents = "none";
    layer.style.zIndex = "20";

    inner.appendChild(layer);
    state.scoreLayer = layer;

    console.log("[annotations] attached to score inner layer");
}

// =============================================================
// RENDER
// =============================================================

function renderAll() {
    if (state.scoreLayer) {
        clearPins(state.scoreLayer);
        clearMarkers(state.scoreLayer);
    }
    if (state.pageLayer) {
        clearPins(state.pageLayer);
        clearMarkers(state.pageLayer);
    }

    for (const item of state.items) {
        if (!shouldRenderItem(item)) continue;

        const layer = item.placement?.space === "pageOverlay"
            ? state.pageLayer
            : state.scoreLayer;

        if (!layer) continue;

        // Handle markers separately
        if (item.kind === "marker") {
            const markerEl = makeMarkerEl(item, (m) => openMarkerEditor(m));
            layer.appendChild(markerEl);
        } else {
            const pin = makePinEl(item, (ann) => openEditForExisting(ann));
            layer.appendChild(pin);
            positionAnnotation(pin, item);
            pin._renderExtent?.();
        }
    }
}

// =============================================================
// EDITOR MANAGEMENT
// =============================================================

function closeEditor() {
    window.oscillaTextInputActive = false;
    if (state.activeEditor) {
        state.activeEditor.remove();
        state.activeEditor = null;
    }
}

function openEditorAt({
    screenX,
    screenY,
    placement,
    initialText = "",
    initialScope = null,
    initialFontSize = null,
    initialTrigger = null,
    existingId = null,
    onSave,
    onDelete
}) {
    closeEditor();
    window.oscillaTextInputActive = true;

    const editor = makeEditor({
        x: screenX,
        y: screenY,
        initialText,
        initialScope: initialScope ?? (state.shareByDefault ? "shared" : "local"),
        initialFontSize: initialFontSize ?? lastAnnotationFontSize,
        initialTrigger
    });

    editor.onCancel(() => closeEditor());

    if (onDelete) {
        editor.onDelete(() => {
            onDelete();
            closeEditor();
        });
    }

    editor.onSave(({ text, scope, style, trigger }) => {
        lastAnnotationFontSize = style?.fontSize ?? 12;
        onSave({ text, scope, style, trigger });
        closeEditor();
    });

    // Set up recording callback with existing ID
    editor.setRecordCallback(existingId);

    document.body.appendChild(editor.el);
    state.activeEditor = editor.el;
    editor.focus();
}

function openEditForExisting(annotation) {
    const x = annotation._lastScreenX ?? window.innerWidth / 2;
    const y = annotation._lastScreenY ?? window.innerHeight / 2;

    openEditorAt({
        screenX: x,
        screenY: y,
        initialText: annotation.text,
        initialScope: annotation.scope,
        initialFontSize: annotation.style?.fontSize ?? lastAnnotationFontSize,
        initialTrigger: annotation.kind === "trigger" ? annotation.trigger : null,
        existingId: annotation.id,

        onSave: ({ text, scope, style, trigger }) => {
            const fontSize = style?.fontSize ?? lastAnnotationFontSize ?? 12;

            const updates = {
                text,
                scope,
                kind: trigger ? "trigger" : "text",
                style: {
                    ...(annotation.style || {}),
                    fontSize
                }
            };

            if (trigger) {
                updates.trigger = trigger;
            } else if (annotation.trigger) {
                updates.trigger = null;
            }

            updateAnnotation(annotation.id, updates);
        },

        onDelete: () => {
            deleteAnnotation(annotation.id);
        }
    });
}

// =============================================================
// CLICK HANDLERS
// =============================================================

function onScoreClick(evt) {
    if (!state.enabled || !state.annotationMode) return;
    if (!isWithinScoreArea(evt.target)) return;
    if (evt.target.closest(".osc-anno-pin")) return;
    if (evt.target.closest(".osc-anno-editor")) return;

    evt.preventDefault();
    evt.stopPropagation();

    const { mode } = getModeContext();
    if (mode !== "scroll") return;

    const placement = getScoreClickPlacement(evt);
    if (!placement) return;

    const elementId = withinScoreClickTarget(evt.target);

    openEditorAt({
        screenX: evt.clientX,
        screenY: evt.clientY,
        placement,
        onSave: ({ text, scope, style, trigger }) => {
            if (!text && !trigger) return;

            const fontSize = style?.fontSize ?? lastAnnotationFontSize ?? 12;

            const item = {
                id: ulidLike(),
                kind: trigger ? "trigger" : "text",
                text: text || "",
                scope,
                author: { id: getAuthorId(), label: getAuthorLabel() },
                createdAt: nowMs(),
                updatedAt: nowMs(),
                anchor: {
                    mode: "scroll",
                    pageId: null,
                    elementId: elementId || null
                },
                placement,
                style: { fontSize }
            };

            if (trigger) {
                item.trigger = trigger;
            }

            addAnnotation(item);
        }
    });
}

function onPageClick(evt) {
    if (!state.enabled || !state.annotationMode) return;

    const content = getPageContentContainer();
    if (!content) return;
    if (!content.contains(evt.target)) return;
    if (evt.target.closest(".osc-anno-pin")) return;
    if (evt.target.closest(".osc-anno-editor")) return;

    evt.preventDefault();
    evt.stopPropagation();

    const { mode, pageId } = getModeContext();
    if (mode !== "page") return;

    const placement = getPageClickPlacement(evt, content);
    if (!placement) return;

    openEditorAt({
        screenX: evt.clientX,
        screenY: evt.clientY,
        placement,
        onSave: ({ text, scope, style, trigger }) => {
            if (!text && !trigger) return;

            const fontSize = style?.fontSize ?? lastAnnotationFontSize ?? 12;

            const item = {
                id: ulidLike(),
                kind: trigger ? "trigger" : "text",
                text: text || "",
                scope,
                author: { id: getAuthorId(), label: getAuthorLabel() },
                createdAt: nowMs(),
                updatedAt: nowMs(),
                anchor: {
                    mode: "page",
                    pageId: pageId || null
                },
                placement,
                style: { fontSize }
            };

            if (trigger) {
                item.trigger = trigger;
            }

            addAnnotation(item);
        }
    });
}

// =============================================================
// EVENT LISTENERS
// =============================================================

function detachEventListeners() {
    const score = getScoreContainer();
    if (score) score.removeEventListener("click", onScoreClick, true);

    const page = getPageContentContainer();
    if (page) page.removeEventListener("click", onPageClick, true);
}

function attachEventListeners() {
    const score = getScoreContainer();
    if (score) score.addEventListener("click", onScoreClick, true);

    const page = getPageContentContainer();
    if (page) page.addEventListener("click", onPageClick, true);
}

// =============================================================
// PROJECT LOADING
// =============================================================

function loadProjectAnnotations(project) {
    state.project = project;
    state.items = loadLocal(project);

    renderAll();

    // Request shared annotations from server
    wsSend("annotation_request", { project });

    console.log("[annotations] Loaded project:", project, "items:", state.items.length);
}

// =============================================================
// SOCKET POLLING
// =============================================================

function socketPoll() {
    const ws = getWs();
    if (!wsCanSend(ws)) return;

    if (!state.project) return;

    // Request shared annotations if not yet received
    if (!window._sharedAnnotationsRequested) {
        wsSend("annotation_request", { project: state.project });
        window._sharedAnnotationsRequested = true;
    }
}

// =============================================================
// SOCKET MESSAGE HANDLER
// =============================================================

export function annotationsHandleSocketMessage(data) {
    if (!data || !data.type) return;

    switch (data.type) {
        case "annotation_sync": {
            if (data.project !== state.project) return;
            const items = Array.isArray(data.items) ? data.items : [];
            
            // Merge with local items
            const byId = new Map(state.items.map(i => [i.id, i]));
            for (const item of items) {
                if (item.scope === "shared") {
                    byId.set(item.id, item);
                }
            }
            state.items = [...byId.values()];
            saveLocal(state.project, state.items);
            renderAll();
            break;
        }

        case "annotation_add": {
            if (data.project !== state.project) return;
            const item = data.item;
            if (!item || state.items.some(i => i.id === item.id)) return;
            state.items.push(item);
            saveLocal(state.project, state.items);
            renderAll();
            break;
        }

        case "annotation_update": {
            if (data.project !== state.project) return;
            const item = data.item;
            if (!item) return;
            const idx = state.items.findIndex(i => i.id === item.id);
            if (idx >= 0) {
                state.items[idx] = item;
            } else {
                state.items.push(item);
            }
            saveLocal(state.project, state.items);
            renderAll();
            break;
        }

        case "annotation_delete": {
            if (data.project !== state.project) return;
            const id = data.id;
            if (!id) return;
            const idx = state.items.findIndex(i => i.id === id);
            if (idx >= 0) {
                state.items.splice(idx, 1);
                saveLocal(state.project, state.items);
                renderAll();
            }
            break;
        }
    }
}

// =============================================================
// SHARED ANNOTATIONS LOADER
// =============================================================

export function loadSharedAnnotations(project, items) {
    if (project !== state.project) return;

    const byId = new Map(state.items.map(i => [i.id, i]));
    for (const item of items) {
        if (item.scope === "shared") {
            byId.set(item.id, item);
        }
    }

    state.items = [...byId.values()];
    saveLocal(state.project, state.items);
    renderAll();

    console.log("[annotations] Loaded shared annotations:", items.length);
}

// =============================================================
// PUBLIC API
// =============================================================

export function setAnnotationsEnabled(on) {
    state.enabled = !!on;
    renderAll();
}

export function setAnnotationMode(on) {
    state.annotationMode = !!on;

    // Update UI indicators
    const btn = document.getElementById("annotation-toggle");
    if (btn) {
        btn.classList.toggle("active", state.annotationMode);
    }

    console.log("[annotations] Mode:", state.annotationMode ? "EDIT" : "VIEW");
}

export function setAnnotationsShareDefault(on) {
    state.shareByDefault = !!on;
}

export function setAnnotationsProject(projectName) {
    loadProjectAnnotations(projectName);
}

// =============================================================
// INITIALIZATION
// =============================================================

export function initOscillaAnnotations(opts = {}) {
    if (state.initialized) return;

    state.initialized = true;
    state.enabled = opts.enabled ?? true;
    state.annotationMode = opts.annotationMode ?? false;
    state.shareByDefault = opts.shareByDefault ?? false;

    // Register render callback for shared module
    setRenderCallback(renderAll);

    attachDomLayersIfPossible();
    attachEventListeners();
    
    // Initialize marker system
    initMarkers();

    // Re-attach layers on resize
    const reattach = () => {
        attachDomLayersIfPossible();
        renderAll();
    };
    window.addEventListener("resize", reattach);

    // Project init
    const project = opts.project || getProjectName();
    loadProjectAnnotations(project);

    // Socket polling
    state.socketPollId = window.setInterval(socketPoll, POLL_SOCKET_MS);

    // Expose API on window
    window.oscillaAnnotations = {
        setEnabled: setAnnotationsEnabled,
        setMode: setAnnotationMode,
        setShareDefault: setAnnotationsShareDefault,
        setProject: setAnnotationsProject,
        delete: deleteAnnotation,
        list: () => [...state.items],
        render: renderAll,
        
        // Trigger API
        getTriggers: getTriggers,
        executeTriggerById: executeTriggerById,
        clearTriggerPools: clearTriggerPools,
        
        // Marker API
        dropMarker: dropMarker,
        getMarkers: getMarkers,
        toggleMarkers: toggleMarkersVisibility,
        markersVisible: getMarkersVisible,
    };

    console.log("[annotations] Initialized:", {
        project: state.project,
        enabled: state.enabled,
        shareByDefault: state.shareByDefault,
    });
}

// =============================================================
// CLEANUP
// =============================================================

export function destroyOscillaAnnotations() {
    if (!state.initialized) return;

    detachEventListeners();

    if (state.socketPollId) {
        clearInterval(state.socketPollId);
        state.socketPollId = null;
    }

    closeEditor();

    if (state.scoreLayer) {
        state.scoreLayer.remove();
        state.scoreLayer = null;
    }

    if (state.pageLayer) {
        state.pageLayer.remove();
        state.pageLayer = null;
    }

    state.initialized = false;
    state.items = [];

    delete window.oscillaAnnotations;

    console.log("[annotations] Destroyed");
}

// =============================================================
// IMPORT/EXPORT
// =============================================================

export function exportAnnotationsJSON() {
    const blob = new Blob(
        [JSON.stringify({ version: 1, items: state.items }, null, 2)],
        { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `annotations_${state.project || "export"}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

export function importAnnotationsJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data.items)) {
                throw new Error("Invalid format: missing items array");
            }

            // Merge with existing
            const byId = new Map(state.items.map(i => [i.id, i]));
            for (const item of data.items) {
                byId.set(item.id, item);
            }

            state.items = [...byId.values()];
            saveLocal(state.project, state.items);
            renderAll();

            console.log(`[annotations] imported ${data.items.length} annotations`);
        } catch (e) {
            console.error("[annotations] import failed", e);
        }
    };
    reader.readAsText(file);
}
