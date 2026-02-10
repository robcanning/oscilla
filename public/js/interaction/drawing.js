// public/js/contributions/drawing.js
//
// Freehand Drawing Module for Oscilla Contribution Surface
// Provides ink-on-paper style markup over the score using SVG paths.
//
// Architecture:
// - SVG overlay parented inside .oscilla-score-inner (scrolls with score)
// - viewBox matches score SVG so coordinates are in world units directly
// - Strokes stored as kind:"stroke" items via shared.js CRUD (auto-saved)
// - Eraser = stroke-level tap-to-delete
// - Integrates with existing colorPicker.js for color selection
// - Network sharing via existing WebSocket annotation pipeline
//
// Usage:
//   import { initDrawing, setDrawMode, renderStrokes, clearDrawingLayer } from "./drawing.js";

import {
    state,
    ulidLike,
    nowMs,
    addAnnotation,
    deleteAnnotation,
    shouldRenderItem,
} from "./shared.js";

import {
    createColorPicker,
    DEFAULT_MARKER_COLOR,
} from "./colorPicker.js";

import { getScoreScrollInner } from "./annotationEditor.js";

// =============================================================
// CONSTANTS
// =============================================================

const DEFAULT_STROKE_COLOR = "#ffffff";
const DEFAULT_STROKE_WIDTH = 3;       // world units
const MIN_STROKE_WIDTH = 1;
const MAX_STROKE_WIDTH = 20;
const SIMPLIFY_TOLERANCE = 0.8;       // world units — skip points closer than this

// =============================================================
// MODULE STATE
// =============================================================

let drawingEnabled = false;     // global on/off (follows annotation enabled)
let drawMode = false;           // draw mode active (captures pointer)
let eraserMode = false;         // erase mode active

let strokeColor = DEFAULT_STROKE_COLOR;
let strokeWidth = DEFAULT_STROKE_WIDTH;

let svgOverlay = null;          // the <svg> overlay element
let activeStroke = null;        // stroke currently being drawn
let activePathEl = null;        // <path> being drawn live

// Toolbar references
let drawToolbar = null;

// =============================================================
// SVG OVERLAY MANAGEMENT
// =============================================================

/**
 * Get the score SVG's viewBox dimensions (world units).
 * Falls back to scoreWidth + computed aspect ratio.
 */
function getScoreViewBox() {
    const inner = getScoreScrollInner();
    if (!inner) return null;

    const svg = inner.querySelector("svg");
    if (!svg) return null;

    // Try native viewBox
    const vb = svg.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
        return { x: vb.x, y: vb.y, width: vb.width, height: vb.height };
    }

    // Fallback: use scoreWidth and derive height from rendered aspect ratio
    const w = window.scoreWidth;
    if (!w || w <= 0) return null;

    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0) return null;

    const aspect = rect.height / rect.width;
    return { x: 0, y: 0, width: w, height: w * aspect };
}

/**
 * Create or update the SVG drawing overlay.
 * Parented inside .oscilla-score-inner alongside the score SVG.
 */
function ensureOverlay() {
    const inner = getScoreScrollInner();
    if (!inner) return null;

    const vb = getScoreViewBox();
    if (!vb) return null;

    if (svgOverlay && svgOverlay.isConnected) {
        // Update viewBox in case score dimensions changed
        svgOverlay.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
        return svgOverlay;
    }

    svgOverlay = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svgOverlay.id = "oscilla-drawing-overlay";
    svgOverlay.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.width} ${vb.height}`);
    svgOverlay.setAttribute("preserveAspectRatio", "none");

    Object.assign(svgOverlay.style, {
        position: "absolute",
        left: "0",
        top: "0",
        width: "100%",
        height: "100%",
        pointerEvents: "none",      // toggled when draw/erase mode active
        zIndex: "15",               // above score SVG, below annotation layer (20)
        overflow: "visible",
    });

    inner.appendChild(svgOverlay);
    attachPointerListeners();

    console.log("[drawing] overlay created, viewBox:", svgOverlay.getAttribute("viewBox"));
    return svgOverlay;
}

/**
 * Remove overlay from DOM
 */
function removeOverlay() {
    if (svgOverlay) {
        svgOverlay.remove();
        svgOverlay = null;
    }
}

// =============================================================
// COORDINATE CONVERSION
// =============================================================

/**
 * Convert a pointer event to world (viewBox) coordinates
 * Uses SVG's built-in coordinate transform matrix
 */
function worldCoordsFromEvent(e) {
    if (!svgOverlay) return null;

    // Use SVG's own CTM for accurate coordinate conversion
    const pt = svgOverlay.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;

    const ctm = svgOverlay.getScreenCTM();
    if (!ctm) return null;

    const worldPt = pt.matrixTransform(ctm.inverse());
    return { x: worldPt.x, y: worldPt.y };
}

// =============================================================
// PATH BUILDING
// =============================================================

/**
 * Build an SVG path `d` attribute from an array of {x, y} points.
 * Uses quadratic bezier smoothing for natural-looking curves.
 */
function buildPathD(points) {
    if (!points || points.length === 0) return "";
    if (points.length === 1) {
        // Single dot
        const p = points[0];
        return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y}`;
    }

    let d = `M ${points[0].x} ${points[0].y}`;

    if (points.length === 2) {
        d += ` L ${points[1].x} ${points[1].y}`;
        return d;
    }

    // Quadratic bezier through midpoints for smooth curves
    for (let i = 1; i < points.length - 1; i++) {
        const cp = points[i];
        const next = points[i + 1];
        const mx = (cp.x + next.x) / 2;
        const my = (cp.y + next.y) / 2;
        d += ` Q ${cp.x} ${cp.y} ${mx} ${my}`;
    }

    // Final segment
    const last = points[points.length - 1];
    d += ` L ${last.x} ${last.y}`;

    return d;
}

/**
 * Create an SVG <path> element for a stroke
 */
function createPathElement(stroke, id) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", buildPathD(stroke.points));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", stroke.color || DEFAULT_STROKE_COLOR);
    path.setAttribute("stroke-width", stroke.width || DEFAULT_STROKE_WIDTH);
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("opacity", stroke.opacity ?? 1);
    path.dataset.strokeId = id || "";

    return path;
}

// =============================================================
// POINTER EVENT HANDLING
// =============================================================

function attachPointerListeners() {
    if (!svgOverlay) return;

    svgOverlay.addEventListener("pointerdown", onPointerDown, { passive: false });
    svgOverlay.addEventListener("pointermove", onPointerMove, { passive: false });
    svgOverlay.addEventListener("pointerup", onPointerUp);
    svgOverlay.addEventListener("pointercancel", onPointerUp);

    // Prevent score dragging when drawing
    svgOverlay.addEventListener("touchstart", (e) => {
        if (drawMode || eraserMode) e.preventDefault();
    }, { passive: false });
}

function onPointerDown(e) {
    if (!drawMode && !eraserMode) return;

    e.preventDefault();
    e.stopPropagation();

    if (eraserMode) {
        handleEraserTap(e);
        return;
    }

    // Start drawing
    const world = worldCoordsFromEvent(e);
    if (!world) return;

    svgOverlay.setPointerCapture(e.pointerId);

    activeStroke = {
        points: [{ x: world.x, y: world.y, p: e.pressure || 0.5 }],
        color: strokeColor,
        width: strokeWidth,
        opacity: 1,
    };

    // Create live path element
    activePathEl = createPathElement(activeStroke, "");
    activePathEl.classList.add("osc-drawing-active");
    svgOverlay.appendChild(activePathEl);
}

function onPointerMove(e) {
    if (!activeStroke || !activePathEl) return;

    e.preventDefault();
    e.stopPropagation();

    const world = worldCoordsFromEvent(e);
    if (!world) return;

    // Distance-based thinning to avoid excessive points
    const pts = activeStroke.points;
    const last = pts[pts.length - 1];
    const dx = world.x - last.x;
    const dy = world.y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < SIMPLIFY_TOLERANCE) return;

    pts.push({ x: world.x, y: world.y, p: e.pressure || 0.5 });

    // Update path live
    activePathEl.setAttribute("d", buildPathD(pts));
}

function onPointerUp(e) {
    if (!activeStroke || !activePathEl) return;

    svgOverlay.releasePointerCapture?.(e.pointerId);

    const pts = activeStroke.points;

    // Discard tiny accidental taps (fewer than 2 points or very short)
    if (pts.length < 2) {
        activePathEl.remove();
        activeStroke = null;
        activePathEl = null;
        return;
    }

    // Remove live path (renderStrokes will recreate it from data)
    activePathEl.remove();

    // Build annotation item and persist via shared.js
    const { mode, pageId } = getModeContextLocal();

    const item = {
        id: ulidLike(),
        kind: "stroke",
        text: "",                       // strokes have no text
        scope: state.shareByDefault ? "shared" : "local",
        author: { id: getAuthorIdLocal(), label: getAuthorLabelLocal() },
        createdAt: nowMs(),
        updatedAt: nowMs(),
        anchor: {
            mode: mode,
            ...(mode === "page" && pageId ? { pageId } : {}),
        },
        placement: { space: "score" },
        stroke: {
            points: pts,
            color: activeStroke.color,
            width: activeStroke.width,
            opacity: activeStroke.opacity,
        },
    };

    addAnnotation(item);    // saves to localStorage + sends via WebSocket if shared

    activeStroke = null;
    activePathEl = null;
}

// =============================================================
// ERASER
// =============================================================

function handleEraserTap(e) {
    if (!svgOverlay) return;

    // Hit-test: find the topmost <path> under the pointer
    const target = document.elementFromPoint(e.clientX, e.clientY);

    if (target && target.tagName === "path" && target.dataset.strokeId) {
        const id = target.dataset.strokeId;
        deleteAnnotation(id);       // removes from state.items, saves, re-renders
    }
}

// =============================================================
// RENDERING
// =============================================================

/**
 * Render all stroke items from state.items onto the SVG overlay.
 * Called from interactionSurface.js renderAll().
 */
export function renderStrokes() {
    if (!ensureOverlay()) return;

    // Clear existing rendered strokes
    clearDrawingLayer();

    for (const item of state.items) {
        if (item.kind !== "stroke") continue;
        if (!shouldRenderItem(item)) continue;

        const stroke = item.stroke;
        if (!stroke?.points?.length) continue;

        const pathEl = createPathElement(stroke, item.id);

        // Eraser hover feedback
        if (eraserMode) {
            pathEl.style.cursor = "crosshair";
            pathEl.style.pointerEvents = "stroke";
            pathEl.addEventListener("pointerenter", () => {
                pathEl.setAttribute("stroke", "#ff4444");
                pathEl.setAttribute("opacity", "0.6");
            });
            pathEl.addEventListener("pointerleave", () => {
                pathEl.setAttribute("stroke", stroke.color || DEFAULT_STROKE_COLOR);
                pathEl.setAttribute("opacity", stroke.opacity ?? 1);
            });
        } else {
            pathEl.style.pointerEvents = "none";
        }

        svgOverlay.appendChild(pathEl);
    }
}

/**
 * Remove all rendered stroke paths from the overlay
 */
export function clearDrawingLayer() {
    if (!svgOverlay) return;
    svgOverlay.querySelectorAll("path").forEach(p => p.remove());
}

// =============================================================
// MODE MANAGEMENT
// =============================================================

/**
 * Set draw mode on/off.
 * When active, the overlay captures pointer events for drawing.
 */
export function setDrawMode(on) {
    drawMode = !!on;

    if (drawMode) {
        eraserMode = false;
    }

    updateOverlayPointerEvents();
    updateToolbarState();

    console.log("[drawing] draw mode:", drawMode);
}

/**
 * Set eraser mode on/off.
 * When active, tapping a stroke deletes it.
 */
export function setEraserMode(on) {
    eraserMode = !!on;

    if (eraserMode) {
        drawMode = false;
    }

    updateOverlayPointerEvents();
    updateToolbarState();

    // Re-render to attach/detach hover listeners
    renderStrokes();

    console.log("[drawing] eraser mode:", eraserMode);
}

/**
 * Toggle draw mode
 */
export function toggleDrawMode() {
    if (drawMode) {
        setDrawMode(false);
    } else {
        setDrawMode(true);
    }
}

/**
 * Toggle eraser mode
 */
export function toggleEraserMode() {
    if (eraserMode) {
        setEraserMode(false);
    } else {
        setEraserMode(true);
    }
}

export function isDrawMode() { return drawMode; }
export function isEraserMode() { return eraserMode; }

function updateOverlayPointerEvents() {
    if (!svgOverlay) return;
    svgOverlay.style.pointerEvents = (drawMode || eraserMode) ? "all" : "none";
    svgOverlay.style.cursor = drawMode ? "crosshair" : eraserMode ? "pointer" : "default";
}

// =============================================================
// STROKE SETTINGS
// =============================================================

export function setStrokeColor(color) {
    strokeColor = color || DEFAULT_STROKE_COLOR;
}

export function setStrokeWidth(width) {
    strokeWidth = Math.max(MIN_STROKE_WIDTH, Math.min(MAX_STROKE_WIDTH, width || DEFAULT_STROKE_WIDTH));
}

export function getStrokeColor() { return strokeColor; }
export function getStrokeWidth() { return strokeWidth; }

// =============================================================
// TOOLBAR UI
// =============================================================

/**
 * Create the drawing toolbar (floats near the draw toggle button).
 * Contains: color swatches, width slider, eraser toggle.
 */
export function createDrawToolbar() {
    if (drawToolbar && drawToolbar.isConnected) return drawToolbar;

    drawToolbar = document.createElement("div");
    drawToolbar.id = "oscilla-draw-toolbar";
    drawToolbar.className = "osc-draw-toolbar";
    Object.assign(drawToolbar.style, {
        position: "fixed",
        bottom: "60px",
        left: "50%",
        transform: "translateX(-50%)",
        display: "none",
        flexDirection: "row",
        alignItems: "center",
        gap: "8px",
        padding: "6px 12px",
        background: "rgba(20, 20, 20, 0.92)",
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.15)",
        zIndex: "10000",
        backdropFilter: "blur(8px)",
        userSelect: "none",
    });

    // --- Color swatches ---
    const colors = ["#ffffff", "#ff4444", "#44aaff", "#44ff88", "#ffcc00", "#ff88ff", "#888888"];
    const swatchRow = document.createElement("div");
    swatchRow.style.display = "flex";
    swatchRow.style.gap = "4px";

    for (const c of colors) {
        const swatch = document.createElement("div");
        Object.assign(swatch.style, {
            width: "22px",
            height: "22px",
            borderRadius: "50%",
            background: c,
            border: c === strokeColor ? "2px solid #fff" : "2px solid transparent",
            cursor: "pointer",
            transition: "border-color 0.15s",
        });

        swatch.addEventListener("click", () => {
            setStrokeColor(c);
            // Update swatch borders
            swatchRow.querySelectorAll("div").forEach(s => {
                s.style.border = "2px solid transparent";
            });
            swatch.style.border = "2px solid #fff";
        });

        swatchRow.appendChild(swatch);
    }
    drawToolbar.appendChild(swatchRow);

    // --- Separator ---
    const sep1 = document.createElement("div");
    Object.assign(sep1.style, {
        width: "1px", height: "24px",
        background: "rgba(255,255,255,0.2)", margin: "0 4px",
    });
    drawToolbar.appendChild(sep1);

    // --- Width slider ---
    const widthLabel = document.createElement("span");
    widthLabel.textContent = "W";
    widthLabel.style.color = "#aaa";
    widthLabel.style.fontSize = "11px";
    drawToolbar.appendChild(widthLabel);

    const widthSlider = document.createElement("input");
    widthSlider.type = "range";
    widthSlider.min = String(MIN_STROKE_WIDTH);
    widthSlider.max = String(MAX_STROKE_WIDTH);
    widthSlider.value = String(strokeWidth);
    Object.assign(widthSlider.style, {
        width: "70px",
        accentColor: "#888",
    });
    widthSlider.addEventListener("input", () => {
        setStrokeWidth(parseFloat(widthSlider.value));
    });
    drawToolbar.appendChild(widthSlider);

    // --- Separator ---
    const sep2 = sep1.cloneNode();
    drawToolbar.appendChild(sep2);

    // --- Eraser toggle ---
    const eraserBtn = document.createElement("button");
    eraserBtn.id = "draw-eraser-btn";
    eraserBtn.title = "Eraser (tap strokes to delete)";
    eraserBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" 
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 20H7L3 16c-.8-.8-.8-2 0-2.8L14.6 1.6c.8-.8 2-.8 2.8 0L21.4 5.6c.8.8.8 2 0 2.8L12 18"/>
        <line x1="7" y1="20" x2="12" y2="20"/>
    </svg>`;
    Object.assign(eraserBtn.style, {
        background: "transparent",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "6px",
        color: "#ccc",
        padding: "4px 6px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
    });
    eraserBtn.addEventListener("click", () => {
        toggleEraserMode();
    });
    drawToolbar.appendChild(eraserBtn);

    document.body.appendChild(drawToolbar);
    return drawToolbar;
}

function updateToolbarState() {
    if (!drawToolbar) return;

    // Show/hide toolbar
    drawToolbar.style.display = (drawMode || eraserMode) ? "flex" : "none";

    // Eraser button state
    const eraserBtn = drawToolbar.querySelector("#draw-eraser-btn");
    if (eraserBtn) {
        eraserBtn.style.background = eraserMode ? "rgba(255,68,68,0.3)" : "transparent";
        eraserBtn.style.borderColor = eraserMode ? "#ff4444" : "rgba(255,255,255,0.2)";
        eraserBtn.style.color = eraserMode ? "#ff8888" : "#ccc";
    }
}

// =============================================================
// UNDO (last stroke)
// =============================================================

/**
 * Undo the last stroke by the current author.
 */
export function undoLastStroke() {
    const authorId = getAuthorIdLocal();

    // Find the most recent stroke by this author
    for (let i = state.items.length - 1; i >= 0; i--) {
        const item = state.items[i];
        if (item.kind === "stroke" && item.author?.id === authorId) {
            deleteAnnotation(item.id);
            return true;
        }
    }
    return false;
}

// =============================================================
// CLEAR ALL STROKES
// =============================================================

/**
 * Clear all local strokes for the current project.
 * Does not affect shared strokes from other authors.
 */
export function clearLocalStrokes() {
    const authorId = getAuthorIdLocal();
    const toDelete = state.items
        .filter(i => i.kind === "stroke" && i.scope === "local" && i.author?.id === authorId)
        .map(i => i.id);

    for (const id of toDelete) {
        deleteAnnotation(id);
    }

    console.log("[drawing] cleared", toDelete.length, "local strokes");
}

// =============================================================
// KEYBOARD SHORTCUTS
// =============================================================

/**
 * Handle keyboard shortcuts for drawing.
 * Call this from a global keydown listener.
 */
export function handleDrawingKeydown(e) {
    // Don't capture when text input is active
    if (window.oscillaTextInputActive) return false;

    // Ctrl/Cmd+Z = undo last stroke (only in draw mode)
    if ((drawMode || eraserMode) && (e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undoLastStroke();
        return true;
    }

    // 'e' = toggle eraser (only when draw mode is on)
    if (drawMode && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "e") {
        e.preventDefault();
        toggleEraserMode();
        return true;
    }

    // Escape = exit draw/erase mode
    if ((drawMode || eraserMode) && e.key === "Escape") {
        e.preventDefault();
        setDrawMode(false);
        setEraserMode(false);
        return true;
    }

    return false;
}

// =============================================================
// HELPER — MODE & AUTHOR (avoid circular import with interactionSurface)
// =============================================================

function getModeContextLocal() {
    const mode = window.oscillaMode || "scroll";
    let pageId = null;

    if (mode === "page") {
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

function getAuthorIdLocal() {
    if (window.sessionClientId) return window.sessionClientId;
    if (window.clientId) return window.clientId;
    let id = localStorage.getItem("oscilla_author_id");
    if (!id) {
        id = ulidLike();
        localStorage.setItem("oscilla_author_id", id);
    }
    return id;
}

function getAuthorLabelLocal() {
    return window.oscillaAuthorLabel || "Performer";
}

// =============================================================
// INITIALIZATION
// =============================================================

/**
 * Initialize drawing system.
 * Call after annotations system is initialized and score SVG is loaded.
 */
export function initDrawing() {
    ensureOverlay();
    createDrawToolbar();

    // Keyboard listener
    window.addEventListener("keydown", handleDrawingKeydown);

    // Re-create overlay if score dimensions change (window resize)
    window.addEventListener("resize", () => {
        ensureOverlay();
        renderStrokes();
    });

    // Expose on window API
    window.oscillaDrawing = {
        setDrawMode,
        setEraserMode,
        toggleDrawMode,
        toggleEraserMode,
        isDrawMode: () => drawMode,
        isEraserMode: () => eraserMode,
        setStrokeColor,
        setStrokeWidth,
        getStrokeColor: () => strokeColor,
        getStrokeWidth: () => strokeWidth,
        undoLastStroke,
        clearLocalStrokes,
    };

    console.log("[drawing] initialized");
}

/**
 * Tear down drawing system
 */
export function destroyDrawing() {
    setDrawMode(false);
    setEraserMode(false);
    removeOverlay();

    if (drawToolbar) {
        drawToolbar.remove();
        drawToolbar = null;
    }

    window.removeEventListener("keydown", handleDrawingKeydown);
    delete window.oscillaDrawing;

    console.log("[drawing] destroyed");
}
