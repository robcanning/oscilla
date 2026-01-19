// public/js/oscillaAnnotations.js
//
// Performer Annotations (browser-layer, non-SVG)
// - Click pen icon (or call setAnnotationMode(true)) → click score/page → write note → pin appears
// - Global toggle show/hide
// - Persistence: localStorage per project
// - Optional sharing over WebSocket (expects server message handlers; safe if absent)
//
// Integration (minimal):
//   import { initOscillaAnnotations } from "./oscillaAnnotations.js";
//   initOscillaAnnotations();   // after UI exists
//
// Optional integration points:
//   - call setAnnotationsProject(projectName) after project load
//   - call annotationsHandleSocketMessage(data) inside your ws.onmessage
//
// This module is intentionally non-invasive: it does not touch SVG markup,
// parser/DSL, or cue execution. It renders HTML overlay layers only.

import { getStopwatchTime } from "./oscillaTimers.js";

const STORAGE_PREFIX = "oscilla_annotations_v1";
const DEFAULT_AUTHOR_LABEL = "Performer";
const POLL_SOCKET_MS = 500;


window.oscillaTextInputActive = false;

let lastAnnotationFontSize = 12;

let sharedAnnotationsRequested = false;
let sharedAnnotationsHydrated = false;


function ulidLike() {
    // good-enough unique id without a dependency
    return (
        "ann_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 10)
    );
}

function nowMs() {
    return Date.now();
}

function safeJsonParse(str, fallback) {
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

function clamp01(n) {
    if (typeof n !== "number" || !isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function getProjectName() {
    return window.currentProjectName || window.projectName || "unknown_project";
}

function getAuthorId() {
    // Prefer server-assigned name if present; else stable browser id
    const fromWsName = window.clientName || window.oscillaClientName || null;
    if (fromWsName) return `client:${fromWsName}`;

    const k = "oscilla_local_client_id";
    let v = localStorage.getItem(k);
    if (!v) {
        v = "local_" + Math.random().toString(36).slice(2);
        localStorage.setItem(k, v);
    }
    return `local:${v}`;
}

function getAuthorLabel() {
    return window.clientName || window.oscillaClientName || DEFAULT_AUTHOR_LABEL;
}

function getWs() {
    // common pattern in your codebase: window.socket
    return window.socket || window.ws || null;
}

function wsCanSend(ws) {
    return ws && ws.readyState === 1; // WebSocket.OPEN
}

function wsSend(type, payload) {
    const ws = getWs();
    if (!wsCanSend(ws)) return false;
    ws.send(JSON.stringify({ type, ...payload }));
    return true;
}

function ensureLayer(parent, id) {
    let el = parent.querySelector(`#${id}`);
    if (!el) {
        el = document.createElement("div");
        el.id = id;
        el.style.position = "absolute";
        el.style.left = "0";
        el.style.top = "0";
        el.style.right = "0";
        el.style.bottom = "0";
        el.style.pointerEvents = "none"; // pins re-enable their own
        el.style.zIndex = "999998"; // below playhead overlays if needed
        parent.appendChild(el);
    }
    return el;
}

function ensureRelativeContainer(el) {
    const pos = getComputedStyle(el).position;
    if (pos === "static" || !pos) el.style.position = "relative";
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

function getModeContext() {
    // Your page system uses window.pageState.mode/current
    const pageState = window.pageState || {};
    const mode =
        pageState.mode ||
        window.currentMode ||
        document.getElementById("mode-toggle")?.textContent ||
        "scroll";

    if (mode === "page") {
        return {
            mode: "page",
            pageId: pageState.current || window.currentPageId || null,
        };
    }
    return { mode: "scroll", pageId: null };
}

function getScoreContainer() {
    return document.getElementById("scoreContainer");
}

function getPageContentContainer() {
    // page overlay content holds the injected SVG
    return document.getElementById("singlePage-content");
}

function getScoreClickPlacement(evt, container) {
    const rect = container.getBoundingClientRect();
    const sx = container.scrollLeft || 0;
    const sy = container.scrollTop || 0;
    return {
        x: sx + (evt.clientX - rect.left),
        y: sy + (evt.clientY - rect.top),
    };
}

function getPageClickPlacement(evt, content) {
    // Page overlay typically doesn't scroll; still compute relative coords.
    const rect = content.getBoundingClientRect();
    return {
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top,
    };
}
function makeEditor({
    x,
    y,
    initialText = "",
    initialScope = null,
    initialFontSize = null
}) {
    const wrap = document.createElement("div");
    wrap.className = "osc-anno-editor";
    wrap.style.position = "fixed";
    wrap.style.left = `${Math.round(x)}px`;
    wrap.style.top = `${Math.round(y)}px`;
    wrap.style.zIndex = "999999";
    wrap.style.maxWidth = "320px";
    wrap.style.background = "rgba(20,20,20,0.92)";
    wrap.style.color = "white";
    wrap.style.border = "1px solid rgba(255,255,255,0.15)";
    wrap.style.borderRadius = "10px";
    wrap.style.padding = "10px";
    wrap.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    wrap.style.backdropFilter = "blur(6px)";
    wrap.style.pointerEvents = "auto";

    const ta = document.createElement("textarea");
    ta.value = initialText;
    ta.placeholder = "Annotation…";
    ta.rows = 4;
    ta.style.width = "100%";
    ta.style.resize = "vertical";
    ta.style.boxSizing = "border-box";
    ta.style.background = "rgba(0,0,0,0.25)";
    ta.style.color = "white";
    ta.style.border = "1px solid rgba(255,255,255,0.15)";
    ta.style.borderRadius = "8px";
    ta.style.padding = "8px";
    ta.style.fontFamily = "inherit";
    ta.style.fontSize = "13px";
    ta.style.lineHeight = "1.3";
    wrap.appendChild(ta);


    // -----------------------------
    // Font size control
    // -----------------------------
    const fontRow = document.createElement("div");
    fontRow.style.display = "flex";
    fontRow.style.alignItems = "center";
    fontRow.style.gap = "8px";
    fontRow.style.marginTop = "6px";

    const fontLabel = document.createElement("label");
    fontLabel.textContent = "Font size";
    fontLabel.style.fontSize = "12px";
    fontLabel.style.opacity = "0.9";

    const fontInput = document.createElement("input");
    fontInput.type = "number";
    fontInput.min = 8;
    fontInput.max = 32;
    fontInput.step = 1;
    fontInput.value = initialFontSize ?? 12;
    fontInput.style.width = "60px";

    fontRow.appendChild(fontLabel);
    fontRow.appendChild(fontInput);
    wrap.appendChild(fontRow);



    // -----------------------------
    // Footer row (buttons + scope)
    // -----------------------------
    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.gap = "8px";
    footer.style.marginTop = "8px";
    footer.style.alignItems = "center";
    wrap.appendChild(footer);

    const scopeLabel = document.createElement("label");
    scopeLabel.style.display = "flex";
    scopeLabel.style.gap = "6px";
    scopeLabel.style.alignItems = "center";
    scopeLabel.style.fontSize = "12px";
    scopeLabel.style.opacity = "0.9";
    scopeLabel.title = "Shared notes are broadcast to other clients (if connected)";

    const scopeChk = document.createElement("input");
    scopeChk.type = "checkbox";

    scopeChk.checked =
        initialScope === "shared"
            ? true
            : initialScope === "local"
                ? false
                : state.shareByDefault;
    scopeLabel.appendChild(scopeChk);
    scopeLabel.appendChild(document.createTextNode("Share"));
    footer.appendChild(scopeLabel);

    const btnSave = document.createElement("button");
    btnSave.textContent = "Save";
    btnSave.style.flex = "0 0 auto";
    btnSave.style.padding = "6px 10px";
    btnSave.style.borderRadius = "8px";
    btnSave.style.border = "1px solid rgba(255,255,255,0.2)";
    btnSave.style.background = "rgba(255,255,255,0.12)";
    btnSave.style.color = "white";
    btnSave.style.cursor = "pointer";
    footer.appendChild(btnSave);

    const btnCancel = document.createElement("button");
    btnCancel.textContent = "Cancel";
    btnCancel.style.flex = "0 0 auto";
    btnCancel.style.padding = "6px 10px";
    btnCancel.style.borderRadius = "8px";
    btnCancel.style.border = "1px solid rgba(255,255,255,0.2)";
    btnCancel.style.background = "transparent";
    btnCancel.style.color = "rgba(255,255,255,0.9)";
    btnCancel.style.cursor = "pointer";
    footer.appendChild(btnCancel);

    return { wrap, ta, scopeChk, fontInput, btnSave, btnCancel, footer };
}


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
    layer.style.zIndex = 20;

    inner.appendChild(layer);
    state.scoreLayer = layer;

    console.log("[annotations] attached to score inner layer");
}


function getScoreScrollInner() {
    const container = document.getElementById("scoreContainer");
    if (!container) return null;

    // already wrapped?
    let inner = container.querySelector(".oscilla-score-inner");
    if (inner) return inner;

    // wrap existing SVG
    const svg = container.querySelector("svg");
    if (!svg) return null;

    inner = document.createElement("div");
    inner.className = "oscilla-score-inner";
    inner.style.position = "relative";
    inner.style.width = "max-content";
    inner.style.height = "max-content";

    svg.before(inner);
    inner.appendChild(svg);

    return inner;
}



function positionPin(pin, annotation) {
    const score = getScoreContainer();
    if (!score || !annotation.placement) return;

    const sx = score.scrollLeft || 0;
    const sy = score.scrollTop || 0;

    pin.style.left = `${annotation.placement.x - sx}px`;
    pin.style.top = `${annotation.placement.y - sy}px`;
}


function makePinEl(annotation, onClick) {
    const pin = document.createElement("div");
    pin.className = "osc-anno-pin";
    pin.style.position = "absolute";
    pin.style.left = `${annotation.placement.x}px`;
    pin.style.top = `${annotation.placement.y}px`;
    pin.style.pointerEvents = "auto";
    pin.style.userSelect = "none";


    // -----------------------------
    // Label (drag + click)
    // -----------------------------
    const label = document.createElement("div");
    label.textContent =
        annotation.text.length > 300
            ? annotation.text.slice(0, 300) + "…"
            : annotation.text;

    label.style.marginTop = "6px";
    label.style.maxWidth = "260px";
    label.style.display = "block";
    label.style.whiteSpace = "pre-wrap";
    label.style.lineHeight = "1.4";
    const fs = annotation.style?.fontSize ?? 12;
    label.style.fontSize = `${fs}px`;
    label.style.padding = "4px 8px";
    label.style.borderRadius = "8px";
    label.style.background = "rgba(0,0,0,0.6)";
    label.style.color = "white";
    label.style.border = "1px solid rgba(255,255,255,0.12)";
    label.style.backdropFilter = "blur(4px)";
    label.style.cursor = "grab";
    label.style.pointerEvents = "auto";


    pin.appendChild(label);

    // -----------------------------
    // Drag logic (label only)
    // -----------------------------
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;

    label.addEventListener("mousedown", (e) => {
        if (state.annotationMode) return;

        e.preventDefault();
        e.stopPropagation();

        dragging = true;
        moved = false;

        startX = e.clientX;
        startY = e.clientY;
        baseX = annotation.placement.x;
        baseY = annotation.placement.y;

        label.style.cursor = "grabbing";

        const onMove = (e) => {
            if (!dragging) return;

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                moved = true;
            }

            const nx = baseX + dx;
            const ny = baseY + dy;

            annotation.placement.x = nx;
            annotation.placement.y = ny;

            pin.style.left = `${nx}px`;
            pin.style.top = `${ny}px`;
        };

        const onUp = () => {
            if (!dragging) return;

            dragging = false;
            label.style.cursor = "grab";

            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);

            if (moved) {
                updateAnnotation(annotation.id, {
                    placement: { ...annotation.placement }
                });
            }
        };

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    });

    // -----------------------------
    // Click label → edit (only if not dragged)
    // -----------------------------
    label.addEventListener("click", (e) => {
        if (moved) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        onClick?.(annotation);
    });

    return pin;
}


function openEditForExisting(annotation) {
    const x =
        annotation._lastScreenX ?? window.innerWidth / 2;
    const y =
        annotation._lastScreenY ?? window.innerHeight / 2;

    openEditorAt({
        screenX: x,
        screenY: y,
        initialText: annotation.text,
        initialScope: annotation.scope,
        initialFontSize:
            annotation.style?.fontSize ?? lastAnnotationFontSize,

        onSave: ({ text, scope, style }) => {
            const fontSize =
                style?.fontSize ?? lastAnnotationFontSize ?? 12;

            updateAnnotation(annotation.id, {
                text,
                scope,
                style: {
                    ...(annotation.style || {}),
                    fontSize
                }
            });

            // remember last-used size
            lastAnnotationFontSize = fontSize;
        },

        onDelete: () => {
            deleteAnnotation(annotation.id);
            setAnnotationMode(false);
        }
    });
}



export function loadSharedAnnotations(project, items) {
    if (!project || project !== state.project) return;
    if (!Array.isArray(items)) return;

    //  already hydrated → ignore repeat list responses
    if (sharedAnnotationsHydrated) return;

    let added = 0;

    items.forEach((item) => {
        if (!item?.id) return;
        if (item.scope !== "shared") return;

        const exists = state.items.some((x) => x.id === item.id);
        if (exists) return;

        state.items.push(item);
        added++;
    });

    sharedAnnotationsHydrated = true;

    if (added > 0) {
        console.log(
            `[annotations]  loaded ${added} shared annotations for ${project}`
        );
        renderAll();
    }
}







function storageKey(project) {
    return `${STORAGE_PREFIX}:${project}`;
}

function loadLocal(project) {
    const raw = localStorage.getItem(storageKey(project));
    const parsed = safeJsonParse(raw, null);
    if (!parsed || !Array.isArray(parsed.items)) return [];
    return parsed.items;
}

function saveLocal(project, items) {
    localStorage.setItem(
        storageKey(project),
        JSON.stringify({ version: 1, savedAt: nowMs(), items })
    );
}

const state = {
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

function clearPins(layer) {
    if (!layer) return;
    layer.querySelectorAll(".osc-anno-pin").forEach((n) => n.remove());
}

function shouldRenderItem(item) {
    if (!state.enabled) return false;

    const { mode, pageId } = getModeContext();
    const a = item.anchor || {};

    if (mode === "page") {
        return a.mode === "page" && a.pageId && a.pageId === pageId;
    }

    // scroll mode
    return a.mode === "scroll";
}

function renderAll() {
    // layers may not exist yet
    if (state.scoreLayer) clearPins(state.scoreLayer);
    if (state.pageLayer) clearPins(state.pageLayer);

    for (const item of state.items) {
        if (!shouldRenderItem(item)) continue;

        const layer = item.placement?.space === "pageOverlay"
            ? state.pageLayer
            : state.scoreLayer;

        if (!layer) continue;

        const pin = makePinEl(item, (ann) => openEditForExisting(ann));
        layer.appendChild(pin);
    }
}
function closeEditor() {
    // always clear keyboard guard
    window.oscillaTextInputActive = false;

    if (state.activeEditor?.wrap) {
        state.activeEditor.wrap.remove();
    }
    state.activeEditor = null;
}

function openEditorAt({
    screenX,
    screenY,
    initialText,
    initialScope,
    initialFontSize,
    onSave,
    onDelete
}) {
    closeEditor();

    // -----------------------------
    // Keyboard guard while typing
    // -----------------------------
    window.oscillaTextInputActive = true;

    const editor = makeEditor({
        x: screenX,
        y: screenY,
        initialText,
        initialScope,
        initialFontSize
    });

    document.body.appendChild(editor.wrap);
    editor.ta.focus();


    // -----------------------------
    // Cancel
    // -----------------------------
    editor.btnCancel.onclick = () => {
        closeEditor();
    };

    // -----------------------------
    // Save
    // -----------------------------
    editor.btnSave.onclick = () => {
        const text = (editor.ta.value || "").trim();
        if (!text) {
            closeEditor();
            return;
        }

        const fontSize = parseInt(editor.fontInput.value, 10) || 12;

        onSave?.({
            text,
            scope: editor.scopeChk.checked ? "shared" : "local",
            style: {
                fontSize
            }
        });

        closeEditor();
    };


    // -----------------------------
    // Delete (only for existing annotations)
    // -----------------------------
    if (typeof onDelete === "function") {
        const btnDelete = document.createElement("button");
        btnDelete.textContent = "Delete";
        btnDelete.className = "osc-anno-delete";

        btnDelete.onclick = () => {
            onDelete();
            closeEditor();
        };

        editor.footer.appendChild(btnDelete);
    }

    // -----------------------------
    // Escape key closes editor
    // -----------------------------
    const onKey = (e) => {
        if (e.key === "Escape") {
            e.preventDefault();
            closeEditor();
            window.removeEventListener("keydown", onKey, true);
        }
    };
    window.addEventListener("keydown", onKey, true);

    state.activeEditor = editor;
}

openEditorAt({
    screenX: screenX,
    screenY: screenY,
    initialText: "",
    initialScope: null,
    initialFontSize: lastAnnotationFontSize,

    onSave: function ({ text, scope, style }) {
        const fontSize =
            (style && style.fontSize) || lastAnnotationFontSize || 12;

        const item = {
            id: ulidLike(),
            project: state.project,
            author: {
                id: getAuthorId(),
                label: getAuthorLabel()
            },
            createdAt: nowMs(),
            updatedAt: nowMs(),

            scope: scope,
            kind: "text",
            text: text,

            style: {
                color: "rgba(255,255,255,0.9)",
                fontSize: fontSize
            },

            anchor: {
                mode: "scroll",
                pageId: null,
                elementId: elementId || null,
                position: {
                    playheadX:
                        typeof window.playheadX === "number"
                            ? window.playheadX
                            : null,
                    scoreX: placement.x,
                    scoreY: placement.y
                },
                time: {
                    stopwatch: getStopwatchTime()
                }
            },

            placement: {
                x: placement.x,
                y: placement.y,
                space: "score"
            },

            _lastScreenX: screenX,
            _lastScreenY: screenY
        };

        // remember font size for next annotation
        lastAnnotationFontSize = fontSize;

        addAnnotation(item);
        setAnnotationMode(false);
    }
});



function addAnnotation(item) {
    state.items.push(item);

    // persist local copy regardless (so shared notes still exist locally)
    saveLocal(state.project, state.items);

    // share if needed
    if (item.scope === "shared") {
        wsSend("annotation_add", { project: state.project, item });
    }

    renderAll();
}

function updateAnnotation(id, patch) {
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

    renderAll();
}

function deleteAnnotation(id) {
    const idx = state.items.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const prev = state.items[idx];
    state.items.splice(idx, 1);
    saveLocal(state.project, state.items);

    if (prev.scope === "shared") {
        wsSend("annotation_delete", { project: state.project, id });
    }

    renderAll();
}

function onScoreClick(evt) {
    if (!state.annotationMode) return;
    const score = getScoreContainer();
    if (!score) return;

    evt.preventDefault();
    evt.stopPropagation();

    const { mode } = getModeContext();
    if (mode !== "scroll") return;

    const placement = getScoreClickPlacement(evt, score);
    const elementId = withinScoreClickTarget(evt.target);

    // capture last screen coords (used if editing later)
    const screenX = evt.clientX + 10;
    const screenY = evt.clientY + 10;
openEditorAt({
    screenX,
    screenY,
    initialText: "",
    initialFontSize: lastAnnotationFontSize, // ✅ remember last used size

    onSave: ({ text, scope, style }) => {
        const fontSize =
            style?.fontSize ?? lastAnnotationFontSize ?? 12;

        const item = {
            id: ulidLike(),
            project: state.project,
            author: {
                id: getAuthorId(),
                label: getAuthorLabel()
            },
            createdAt: nowMs(),
            updatedAt: nowMs(),

            scope,
            kind: "text",
            text,

            style: {
                color: "rgba(255,255,255,0.9)",
                fontSize // ✅ persist per annotation
            },

            anchor: {
                mode: "scroll",
                pageId: null,
                elementId: elementId || null,
                position: {
                    playheadX:
                        typeof window.playheadX === "number"
                            ? window.playheadX
                            : null,
                    scoreX: placement.x,
                    scoreY: placement.y
                },
                time: {
                    stopwatch: getStopwatchTime()
                }
            },

            placement: {
                x: placement.x,
                y: placement.y,
                space: "score"
            },

            _lastScreenX: screenX,
            _lastScreenY: screenY
        };

        // 🔁 remember font size for NEXT annotation
        lastAnnotationFontSize = fontSize;

        addAnnotation(item);
        setAnnotationMode(false);
    }
});

}

function onPageClick(evt) {
    if (!state.annotationMode) return;

    const content = getPageContentContainer();
    if (!content) return;

    evt.preventDefault();
    evt.stopPropagation();

    const { mode, pageId } = getModeContext();
    if (mode !== "page" || !pageId) return;

    const placement = getPageClickPlacement(evt, content);
    const elementId = withinScoreClickTarget(evt.target); // works for elements inside injected page SVG

    const rect = content.getBoundingClientRect();
    const xNorm = clamp01(placement.x / Math.max(1, rect.width));
    const yNorm = clamp01(placement.y / Math.max(1, rect.height));

    const screenX = evt.clientX + 10;
    const screenY = evt.clientY + 10;

    openEditorAt({
        screenX,
        screenY,
        initialText: "",
        onSave: ({ text, scope }) => {
            const item = {
                id: ulidLike(),
                project: state.project,
                author: { id: getAuthorId(), label: getAuthorLabel() },
                createdAt: nowMs(),
                updatedAt: nowMs(),
                scope,
                kind: "text",
                text,
                style: { color: "rgba(255,255,255,0.9)" },

                anchor: {
                    mode: "page",
                    pageId,
                    elementId: elementId || null,
                    position: {
                        pageNormX: xNorm,
                        pageNormY: yNorm,
                    },
                    time: {
                        stopwatch: getStopwatchTime(),
                    },
                },

                placement: {
                    // store in pixels relative to singlePage-content (good for immediate rendering)
                    // the norm coords are also stored in anchor.position for robustness.
                    x: placement.x,
                    y: placement.y,
                    space: "pageOverlay",
                },

                _lastScreenX: screenX,
                _lastScreenY: screenY,
            };
            addAnnotation(item);
        },
    });
}




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


function loadProjectAnnotations(project) {

    sharedAnnotationsHydrated = false;

    const isNewProject = state.project !== project;

    state.project = project;
    state.items = loadLocal(project);

    if (isNewProject) {
        sharedAnnotationsRequested = false;
    }

    if (!sharedAnnotationsRequested) {
        sharedAnnotationsRequested = true;
        wsSend("annotation_list_request", { project });

        console.log(
            `[annotations] requesting shared annotations for ${project}`
        );
    }

    renderAll();
}


function socketPoll() {
    const ws = getWs();
    if (!ws) return;

    // If app.js already handles onmessage, you should call annotationsHandleSocketMessage(data) there.
    // But for robustness, we can also attach a passive listener if the socket is not already wrapped.
    if (!ws._oscillaAnnotationsHooked) {
        const prev = ws.onmessage;
        ws.onmessage = (evt) => {
            try {
                const data = safeJsonParse(evt.data, null);
                if (data) annotationsHandleSocketMessage(data);
            } catch (_) { }
            if (typeof prev === "function") prev.call(ws, evt);
        };
        ws._oscillaAnnotationsHooked = true;
    }

    // On connect, ask for shared annotations (best effort)
    if (wsCanSend(ws)) {
        wsSend("annotation_list_request", { project: state.project });
    }
}

export function annotationsHandleSocketMessage(data) {
    if (!data || !data.type) return;

    const project = data.project || state.project;
    if (!project || project !== state.project) return;

    switch (data.type) {
        case "annotation_list": {
            const items = Array.isArray(data.items) ? data.items : [];
            // merge: keep local items + any shared items not already present
            const byId = new Map(state.items.map((x) => [x.id, x]));
            for (const it of items) {
                if (!it || !it.id) continue;
                byId.set(it.id, it);
            }
            state.items = [...byId.values()];
            saveLocal(state.project, state.items);
            renderAll();
            break;
        }

        case "annotation_added": {
            const it = data.item;
            if (!it || !it.id) break;
            if (state.items.some((x) => x.id === it.id)) break;
            state.items.push(it);
            saveLocal(state.project, state.items);
            renderAll();
            break;
        }

        case "annotation_updated": {
            const it = data.item;
            if (!it || !it.id) break;
            const idx = state.items.findIndex((x) => x.id === it.id);
            if (idx >= 0) {
                state.items[idx] = it;
            } else {
                state.items.push(it);
            }
            saveLocal(state.project, state.items);
            renderAll();
            break;
        }

        case "annotation_deleted": {
            const id = data.id;
            if (!id) break;
            state.items = state.items.filter((x) => x.id !== id);
            saveLocal(state.project, state.items);
            renderAll();
            break;
        }

        default:
            break;
    }
}

export function setAnnotationsEnabled(on) {
    state.enabled = !!on;
    renderAll();
}

export function setAnnotationMode(on) {
    state.annotationMode = !!on;
    document.body.style.cursor = state.annotationMode ? "crosshair" : "";

    if (!state.annotationMode) closeEditor();

    //  notify UI
    window.dispatchEvent(
        new CustomEvent("oscilla:annotation-mode", {
            detail: { active: state.annotationMode }
        })
    );
}


export function setAnnotationsShareDefault(on) {
    state.shareByDefault = !!on;
}

export function setAnnotationsProject(projectName) {
    if (!projectName) projectName = getProjectName();
    loadProjectAnnotations(projectName);
}

export function initOscillaAnnotations(opts = {}) {
    if (state.initialized) return;

    state.initialized = true;
    state.enabled = opts.enabled ?? true;
    state.annotationMode = opts.annotationMode ?? false;
    state.shareByDefault = opts.shareByDefault ?? false;

    attachDomLayersIfPossible();
    attachEventListeners();

    // In case page overlay appears later, re-attach layers periodically
    const reattach = () => {
        attachDomLayersIfPossible();
        renderAll();
    };
    window.addEventListener("resize", reattach);

    // Project init
    const project = opts.project || getProjectName();
    loadProjectAnnotations(project);

    // Socket polling (safe no-op if no socket)
    state.socketPollId = window.setInterval(socketPoll, POLL_SOCKET_MS);

    // Expose a minimal API on window for debugging / scripting
    window.oscillaAnnotations = {
        setEnabled: setAnnotationsEnabled,
        setMode: setAnnotationMode,
        setShareDefault: setAnnotationsShareDefault,
        setProject: setAnnotationsProject,
        delete: deleteAnnotation,
        list: () => [...state.items],
        render: renderAll,
    };

    console.log("[annotations] Initialized:", {
        project: state.project,
        enabled: state.enabled,
        shareByDefault: state.shareByDefault,
    });
}

export function destroyOscillaAnnotations() {

    const score = getScoreContainer();
    if (score) {
        score.addEventListener(
            "scroll",
            () => renderAll(),
            { passive: true }
        );
    }


    detachEventListeners();
    closeEditor();

    if (state.socketPollId) {
        clearInterval(state.socketPollId);
        state.socketPollId = null;
    }

    state.scoreLayer?.remove();
    state.pageLayer?.remove();

    state.scoreLayer = null;
    state.pageLayer = null;

    state.initialized = false;
    console.log("[annotations] Destroyed");
}
