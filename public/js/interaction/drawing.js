// public/js/interaction/drawing.js
//
// Freehand Drawing Module for Oscilla Contribution Surface
// Provides ink-on-paper style markup over the score using SVG paths.
//
// Architecture:
// - SVG overlay parented inside .oscilla-score-inner (scrolls with score)
// - viewBox matches score SVG so coordinates are in world units directly
// - Strokes stored as kind:"stroke" items via shared.js CRUD (auto-saved)
// - Eraser = stroke-level tap-to-delete
// - Select mode: tap a stroke to select its group, drag to reposition
// - Session grouping: all strokes drawn in one draw-mode session share a groupId
// - Network sharing via existing WebSocket annotation pipeline
//
// Usage:
//   import { initDrawing, setDrawMode, renderStrokes, clearDrawingLayer } from "./drawing.js";

import {
    state,
    ulidLike,
    nowMs,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    shouldRenderItem,
} from "./shared.js";

import {
    createColorPicker,
    DEFAULT_MARKER_COLOR,
} from "./colorPicker.js";

import { getScoreScrollInner } from "./annotationEditor.js";
import { makeDraggable } from "../system/uiUtils.js";

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
let selectMode = false;         // select/move mode active

let strokeColor = DEFAULT_STROKE_COLOR;
let strokeWidth = DEFAULT_STROKE_WIDTH;
let shareDrawingEnabled = true;     // sharing ON by default (matches markers)

let svgOverlay = null;          // the <svg> overlay element
let activeStroke = null;        // stroke currently being drawn
let activePathEl = null;        // <path> being drawn live

// Session grouping
let currentGroupId = null;      // set on draw-mode activate, shared by all strokes in session

// Selection state
let selectedGroupIds = new Set();  // currently selected group(s) — shift-click to multi-select
let dragState = null;              // { startWorld, currentWorld, pointerId } during drag
let selectionRect = null;          // <rect> element showing combined bounding box

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
        pointerEvents: "none",
        zIndex: "15",
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
 */
function worldCoordsFromEvent(e) {
    if (!svgOverlay) return null;

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
        const p = points[0];
        return `M ${p.x} ${p.y} L ${p.x + 0.1} ${p.y}`;
    }

    let d = `M ${points[0].x} ${points[0].y}`;

    if (points.length === 2) {
        d += ` L ${points[1].x} ${points[1].y}`;
        return d;
    }

    for (let i = 1; i < points.length - 1; i++) {
        const cp = points[i];
        const next = points[i + 1];
        const mx = (cp.x + next.x) / 2;
        const my = (cp.y + next.y) / 2;
        d += ` Q ${cp.x} ${cp.y} ${mx} ${my}`;
    }

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
// GROUP HELPERS
// =============================================================

/**
 * Get all stroke items belonging to a group
 */
function getGroupStrokes(groupId) {
    if (!groupId) return [];
    return state.items.filter(
        i => i.kind === "stroke" && i.stroke?.groupId === groupId && shouldRenderItem(i)
    );
}

/**
 * Compute the bounding box of one or more groups of strokes (world coords)
 * @param {string|Set<string>} groupIds - single groupId or Set of groupIds
 */
function getGroupBounds(groupIds) {
    const ids = groupIds instanceof Set ? groupIds : new Set([groupIds]);
    let strokes = [];
    for (const gid of ids) {
        strokes = strokes.concat(getGroupStrokes(gid));
    }
    if (strokes.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    for (const item of strokes) {
        for (const pt of item.stroke.points) {
            if (pt.x < minX) minX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y > maxY) maxY = pt.y;
        }
    }

    const pad = 10;
    return {
        x: minX - pad,
        y: minY - pad,
        width: (maxX - minX) + pad * 2,
        height: (maxY - minY) + pad * 2,
    };
}

/**
 * Find the groupId of the stroke under a pointer event
 */
function hitTestGroup(e) {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!target || target.tagName !== "path" || !target.dataset.strokeId) return null;

    const item = state.items.find(i => i.id === target.dataset.strokeId);
    return item?.stroke?.groupId || null;
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

    svgOverlay.addEventListener("touchstart", (e) => {
        if (drawMode || eraserMode || selectMode) e.preventDefault();
    }, { passive: false });
}

function onPointerDown(e) {
    if (!drawMode && !eraserMode && !selectMode) return;

    e.preventDefault();
    e.stopPropagation();

    if (eraserMode) {
        handleEraserTap(e);
        return;
    }

    if (selectMode) {
        handleSelectDown(e);
        return;
    }

    // --- Draw mode ---
    const world = worldCoordsFromEvent(e);
    if (!world) return;

    svgOverlay.setPointerCapture(e.pointerId);

    activeStroke = {
        points: [{ x: world.x, y: world.y, p: e.pressure || 0.5 }],
        color: strokeColor,
        width: strokeWidth,
        opacity: 1,
    };

    activePathEl = createPathElement(activeStroke, "");
    activePathEl.classList.add("osc-drawing-active");
    svgOverlay.appendChild(activePathEl);
}

function onPointerMove(e) {
    // Handle drag in select mode
    if (selectMode && dragState) {
        handleSelectMove(e);
        return;
    }

    if (!activeStroke || !activePathEl) return;

    e.preventDefault();
    e.stopPropagation();

    const world = worldCoordsFromEvent(e);
    if (!world) return;

    const pts = activeStroke.points;
    const last = pts[pts.length - 1];
    const dx = world.x - last.x;
    const dy = world.y - last.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < SIMPLIFY_TOLERANCE) return;

    pts.push({ x: world.x, y: world.y, p: e.pressure || 0.5 });
    activePathEl.setAttribute("d", buildPathD(pts));
}

function onPointerUp(e) {
    // Handle drag end in select mode
    if (selectMode && dragState) {
        handleSelectUp(e);
        return;
    }

    if (!activeStroke || !activePathEl) return;

    svgOverlay.releasePointerCapture?.(e.pointerId);

    const pts = activeStroke.points;

    if (pts.length < 2) {
        activePathEl.remove();
        activeStroke = null;
        activePathEl = null;
        return;
    }

    activePathEl.remove();

    const { mode, pageId } = getModeContextLocal();

    const item = {
        id: ulidLike(),
        kind: "stroke",
        text: "",
        scope: shareDrawingEnabled ? "shared" : "local",
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
            groupId: currentGroupId,
        },
    };

    addAnnotation(item);

    activeStroke = null;
    activePathEl = null;
}

// =============================================================
// ERASER
// =============================================================

function handleEraserTap(e) {
    if (!svgOverlay) return;

    const target = document.elementFromPoint(e.clientX, e.clientY);

    if (target && target.tagName === "path" && target.dataset.strokeId) {
        const id = target.dataset.strokeId;
        deleteAnnotation(id);
    }
}

// =============================================================
// SELECT / DRAG
// =============================================================

function handleSelectDown(e) {
    const groupId = hitTestGroup(e);

    if (!groupId) {
        // Tapped empty space — deselect all
        deselectGroup();
        return;
    }

    if (e.shiftKey) {
        // Shift-click: toggle this group in/out of selection
        if (selectedGroupIds.has(groupId)) {
            selectedGroupIds.delete(groupId);
        } else {
            selectedGroupIds.add(groupId);
        }
        refreshSelection();
    } else if (!selectedGroupIds.has(groupId)) {
        // Normal click on unselected group — replace selection
        selectGroup(groupId);
    }

    // Begin drag if we have a selection
    if (selectedGroupIds.size > 0) {
        const world = worldCoordsFromEvent(e);
        if (!world) return;

        svgOverlay.setPointerCapture(e.pointerId);
        dragState = {
            startWorld: { x: world.x, y: world.y },
            currentWorld: { x: world.x, y: world.y },
            pointerId: e.pointerId,
        };
    }
}

function handleSelectMove(e) {
    if (!dragState || selectedGroupIds.size === 0) return;

    e.preventDefault();
    e.stopPropagation();

    const world = worldCoordsFromEvent(e);
    if (!world) return;

    dragState.currentWorld = { x: world.x, y: world.y };

    const dx = dragState.currentWorld.x - dragState.startWorld.x;
    const dy = dragState.currentWorld.y - dragState.startWorld.y;

    // Live translate all paths in all selected groups
    for (const gid of selectedGroupIds) {
        const groupPaths = svgOverlay.querySelectorAll(`[data-group-id="${gid}"]`);
        for (const pathEl of groupPaths) {
            pathEl.setAttribute("transform", `translate(${dx}, ${dy})`);
        }
    }

    // Move selection rect too
    if (selectionRect && selectionRect._baseBounds) {
        const b = selectionRect._baseBounds;
        selectionRect.setAttribute("x", b.x + dx);
        selectionRect.setAttribute("y", b.y + dy);
    }
}

function handleSelectUp(e) {
    if (!dragState || selectedGroupIds.size === 0) {
        dragState = null;
        return;
    }

    svgOverlay.releasePointerCapture?.(dragState.pointerId);

    const dx = dragState.currentWorld.x - dragState.startWorld.x;
    const dy = dragState.currentWorld.y - dragState.startWorld.y;

    dragState = null;

    // Skip if barely moved (treat as a tap, not a drag)
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

    // Commit: offset all stroke points in all selected groups and save
    for (const gid of selectedGroupIds) {
        const strokes = getGroupStrokes(gid);

        for (const item of strokes) {
            const movedPoints = item.stroke.points.map(pt => ({
                x: pt.x + dx,
                y: pt.y + dy,
                p: pt.p,
            }));

            updateAnnotation(item.id, {
                stroke: {
                    ...item.stroke,
                    points: movedPoints,
                },
            });
        }
    }

    // renderAll triggered by updateAnnotation -> triggerRender
    // Refresh selection to update bounding box at new position
    refreshSelection();

    console.log("[drawing] moved", selectedGroupIds.size, "group(s) by", dx.toFixed(1), dy.toFixed(1));
}

/**
 * Select a single group (replaces current selection)
 */
function selectGroup(groupId) {
    deselectGroup();
    selectedGroupIds.add(groupId);
    refreshSelection();
}

/**
 * Refresh visual selection state — bounding box + path highlights.
 * Call after modifying selectedGroupIds.
 */
function refreshSelection() {
    // Remove old visuals
    if (selectionRect) {
        selectionRect.remove();
        selectionRect = null;
    }
    if (svgOverlay) {
        svgOverlay.querySelectorAll(".osc-drawing-selected").forEach(el => {
            el.classList.remove("osc-drawing-selected");
        });
    }

    if (selectedGroupIds.size === 0) return;

    // Combined bounding box across all selected groups
    const bounds = getGroupBounds(selectedGroupIds);
    if (bounds && svgOverlay) {
        selectionRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        selectionRect.setAttribute("x", bounds.x);
        selectionRect.setAttribute("y", bounds.y);
        selectionRect.setAttribute("width", bounds.width);
        selectionRect.setAttribute("height", bounds.height);
        selectionRect.setAttribute("fill", "none");
        selectionRect.setAttribute("stroke", "#44aaff");
        selectionRect.setAttribute("stroke-width", "1.5");
        selectionRect.setAttribute("stroke-dasharray", "6 3");
        selectionRect.setAttribute("opacity", "0.7");
        selectionRect.style.pointerEvents = "none";
        selectionRect.style.vectorEffect = "non-scaling-stroke";
        selectionRect.classList.add("osc-drawing-selection");
        selectionRect._baseBounds = { ...bounds };
        svgOverlay.appendChild(selectionRect);
    }

    // Highlight paths in all selected groups
    for (const gid of selectedGroupIds) {
        const groupPaths = svgOverlay.querySelectorAll(`[data-group-id="${gid}"]`);
        for (const pathEl of groupPaths) {
            pathEl.classList.add("osc-drawing-selected");
        }
    }

    console.log("[drawing] selection:", selectedGroupIds.size, "group(s)");
}

/**
 * Deselect all groups
 */
function deselectGroup() {
    selectedGroupIds.clear();

    if (selectionRect) {
        selectionRect.remove();
        selectionRect = null;
    }

    if (svgOverlay) {
        svgOverlay.querySelectorAll(".osc-drawing-selected").forEach(el => {
            el.classList.remove("osc-drawing-selected");
        });
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

    const prevSelected = new Set(selectedGroupIds);

    clearDrawingLayer();

    for (const item of state.items) {
        if (item.kind !== "stroke") continue;
        if (!shouldRenderItem(item)) continue;

        const stroke = item.stroke;
        if (!stroke?.points?.length) continue;

        const pathEl = createPathElement(stroke, item.id);

        // Tag with groupId for group operations
        if (stroke.groupId) {
            pathEl.dataset.groupId = stroke.groupId;
        }

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
        } else if (selectMode) {
            pathEl.style.cursor = "move";
            pathEl.style.pointerEvents = "stroke";
            // Hover: highlight entire group
            pathEl.addEventListener("pointerenter", () => {
                if (dragState) return;
                const gid = stroke.groupId;
                if (!gid) return;
                svgOverlay.querySelectorAll(`[data-group-id="${gid}"]`).forEach(p => {
                    p.classList.add("osc-drawing-hover");
                });
            });
            pathEl.addEventListener("pointerleave", () => {
                if (dragState) return;
                svgOverlay.querySelectorAll(".osc-drawing-hover").forEach(p => {
                    p.classList.remove("osc-drawing-hover");
                });
            });
        } else {
            pathEl.style.pointerEvents = "none";
        }

        svgOverlay.appendChild(pathEl);
    }

    // Restore selection after re-render
    if (prevSelected.size > 0 && selectMode) {
        // Remove any groups that no longer exist
        for (const gid of prevSelected) {
            if (getGroupStrokes(gid).length === 0) {
                prevSelected.delete(gid);
            }
        }
        selectedGroupIds = prevSelected;
        if (selectedGroupIds.size > 0) {
            refreshSelection();
        }
    }
}

/**
 * Remove all rendered stroke paths and selection visuals from the overlay
 */
export function clearDrawingLayer() {
    if (!svgOverlay) return;
    svgOverlay.querySelectorAll("path, .osc-drawing-selection").forEach(el => el.remove());
    selectionRect = null;
}

// =============================================================
// MODE MANAGEMENT
// =============================================================

/**
 * Set draw mode on/off.
 * When activating, generates a new groupId for this drawing session.
 */
export function setDrawMode(on) {
    drawMode = !!on;

    if (drawMode) {
        eraserMode = false;
        selectMode = false;
        deselectGroup();
        // New session = new group
        currentGroupId = "grp_" + ulidLike();
        console.log("[drawing] new session group:", currentGroupId);
    }

    updateOverlayPointerEvents();
    updateToolbarState();
    updateTopbarButton();

    console.log("[drawing] draw mode:", drawMode);
}

/**
 * Set eraser mode on/off.
 */
export function setEraserMode(on) {
    eraserMode = !!on;

    if (eraserMode) {
        drawMode = false;
        selectMode = false;
        deselectGroup();
    }

    updateOverlayPointerEvents();
    updateToolbarState();
    updateTopbarButton();
    renderStrokes();

    console.log("[drawing] eraser mode:", eraserMode);
}

/**
 * Set select mode on/off.
 * When active, tap a stroke to select its group, drag to reposition.
 */
export function setSelectMode(on) {
    selectMode = !!on;

    if (selectMode) {
        drawMode = false;
        eraserMode = false;
    } else {
        deselectGroup();
    }

    updateOverlayPointerEvents();
    updateToolbarState();
    updateTopbarButton();
    renderStrokes();

    console.log("[drawing] select mode:", selectMode);
}

export function toggleDrawMode() {
    if (drawMode) {
        setDrawMode(false);
    } else {
        setDrawMode(true);
    }
}

export function toggleEraserMode() {
    if (eraserMode) {
        setEraserMode(false);
    } else {
        setEraserMode(true);
    }
}

export function toggleSelectMode() {
    if (selectMode) {
        setSelectMode(false);
    } else {
        setSelectMode(true);
    }
}

export function isDrawMode() { return drawMode; }
export function isEraserMode() { return eraserMode; }
export function isSelectMode() { return selectMode; }

function updateOverlayPointerEvents() {
    if (!svgOverlay) return;
    const active = drawMode || eraserMode || selectMode;
    svgOverlay.style.pointerEvents = active ? "all" : "none";
    svgOverlay.style.cursor = drawMode ? "crosshair"
        : eraserMode ? "pointer"
        : selectMode ? "default"
        : "default";
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
// SHARING
// =============================================================

/**
 * Toggle whether new drawings are shared or local
 */
export function toggleShareDrawing(forceState) {
    if (typeof forceState === "boolean") {
        shareDrawingEnabled = forceState;
    } else {
        shareDrawingEnabled = !shareDrawingEnabled;
    }

    updateToolbarState();

    console.log("[drawing] share:", shareDrawingEnabled ? "shared" : "local");
    return shareDrawingEnabled;
}

export function isShareDrawing() { return shareDrawingEnabled; }

/**
 * Toggle scope of all strokes in the selected group(s)
 * between "local" and "shared"
 */
export function toggleSelectedScope() {
    if (selectedGroupIds.size === 0) return;

    // Determine target scope: if any stroke in selection is local, make all shared; otherwise make all local
    let hasLocal = false;
    for (const gid of selectedGroupIds) {
        for (const item of getGroupStrokes(gid)) {
            if (item.scope === "local") {
                hasLocal = true;
                break;
            }
        }
        if (hasLocal) break;
    }

    const newScope = hasLocal ? "shared" : "local";

    for (const gid of selectedGroupIds) {
        for (const item of getGroupStrokes(gid)) {
            if (item.scope !== newScope) {
                updateAnnotation(item.id, { scope: newScope });
            }
        }
    }

    console.log("[drawing] set selected scope to", newScope);
}

/**
 * Sync the topbar draw-toggle button with current draw mode state.
 * Called when draw mode is re-activated from inside the toolbar (e.g. color pick).
 */
function updateTopbarButton() {
    const btn = document.getElementById("draw-toggle");
    if (btn) {
        btn.classList.toggle("active", drawMode);
    }
}

// =============================================================
// TOOLBAR UI
// =============================================================

/**
 * Create the drawing toolbar (floats at bottom center).
 * Contains: color swatches, width slider, select/move toggle, eraser toggle.
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
            swatchRow.querySelectorAll("div").forEach(s => {
                s.style.border = "2px solid transparent";
            });
            swatch.style.border = "2px solid #fff";
            // Return to draw mode after picking a color
            if (!drawMode) {
                setDrawMode(true);
            }
        });

        swatchRow.appendChild(swatch);
    }
    drawToolbar.appendChild(swatchRow);

    // --- Separator ---
    drawToolbar.appendChild(createSeparator());

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
    drawToolbar.appendChild(createSeparator());

    // --- Select/Move toggle ---
    const selectBtn = document.createElement("button");
    selectBtn.id = "draw-select-btn";
    selectBtn.title = "Select & Move (tap a drawing to select, drag to move)";
    selectBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 9l-3 3 3 3"/>
        <path d="M9 5l3-3 3 3"/>
        <path d="M15 19l-3 3-3-3"/>
        <path d="M19 9l3 3-3 3"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <line x1="12" y1="2" x2="12" y2="22"/>
    </svg>`;
    Object.assign(selectBtn.style, {
        background: "transparent",
        border: "1px solid rgba(255,255,255,0.2)",
        borderRadius: "6px",
        color: "#ccc",
        padding: "4px 6px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
    });
    selectBtn.addEventListener("click", () => {
        toggleSelectMode();
    });
    drawToolbar.appendChild(selectBtn);

    // --- Separator ---
    drawToolbar.appendChild(createSeparator());

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

    // --- Separator ---
    drawToolbar.appendChild(createSeparator());

    // --- Share toggle ---
    const shareBtn = document.createElement("button");
    shareBtn.id = "draw-share-btn";
    shareBtn.title = "Drawings shared with all clients (click for local only)";
    shareBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 8a10 10 0 0 1 20 0"/>
        <path d="M5 11a7 7 0 0 1 14 0"/>
        <path d="M8 14a4 4 0 0 1 8 0"/>
        <circle cx="12" cy="17" r="1.5" fill="currentColor"/>
    </svg>`;
    Object.assign(shareBtn.style, {
        background: shareDrawingEnabled ? "rgba(68,255,136,0.3)" : "transparent",
        border: `1px solid ${shareDrawingEnabled ? "#44ff88" : "rgba(255,255,255,0.2)"}`,
        borderRadius: "6px",
        color: shareDrawingEnabled ? "#88ffaa" : "#ccc",
        padding: "4px 6px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
    });
    shareBtn.addEventListener("click", () => {
        toggleShareDrawing();
    });
    drawToolbar.appendChild(shareBtn);

    // --- Drag handle (left edge) ---
    const dragHandle = document.createElement("div");
    dragHandle.className = "osc-draw-toolbar-handle";
    Object.assign(dragHandle.style, {
        width: "6px",
        height: "20px",
        borderRadius: "2px",
        background: "rgba(255,255,255,0.2)",
        cursor: "grab",
        marginLeft: "4px",
        flexShrink: "0",
    });
    drawToolbar.appendChild(dragHandle);

    document.body.appendChild(drawToolbar);

    // makeDraggable uses offsetLeft which breaks with transform: translateX(-50%).
    // We convert to absolute positioning on first show (see updateToolbarState).
    makeDraggable(drawToolbar, dragHandle);

    return drawToolbar;
}

function createSeparator() {
    const sep = document.createElement("div");
    Object.assign(sep.style, {
        width: "1px", height: "24px",
        background: "rgba(255,255,255,0.2)", margin: "0 4px",
    });
    return sep;
}

function updateToolbarState() {
    if (!drawToolbar) return;

    const shouldShow = drawMode || eraserMode || selectMode;
    const wasHidden = drawToolbar.style.display === "none";

    drawToolbar.style.display = shouldShow ? "flex" : "none";

    // On first show, convert CSS centering to absolute left/top so
    // makeDraggable's offsetLeft calculation works correctly.
    if (shouldShow && wasHidden && drawToolbar.style.transform !== "none") {
        requestAnimationFrame(() => {
            const rect = drawToolbar.getBoundingClientRect();
            drawToolbar.style.left = `${rect.left}px`;
            drawToolbar.style.top = `${rect.top}px`;
            drawToolbar.style.bottom = "auto";
            drawToolbar.style.transform = "none";
        });
    }

    const eraserBtn = drawToolbar.querySelector("#draw-eraser-btn");
    if (eraserBtn) {
        eraserBtn.style.background = eraserMode ? "rgba(255,68,68,0.3)" : "transparent";
        eraserBtn.style.borderColor = eraserMode ? "#ff4444" : "rgba(255,255,255,0.2)";
        eraserBtn.style.color = eraserMode ? "#ff8888" : "#ccc";
    }

    const selectBtn = drawToolbar.querySelector("#draw-select-btn");
    if (selectBtn) {
        selectBtn.style.background = selectMode ? "rgba(68,170,255,0.3)" : "transparent";
        selectBtn.style.borderColor = selectMode ? "#44aaff" : "rgba(255,255,255,0.2)";
        selectBtn.style.color = selectMode ? "#88ccff" : "#ccc";
    }

    const shareBtn = drawToolbar.querySelector("#draw-share-btn");
    if (shareBtn) {
        shareBtn.style.background = shareDrawingEnabled ? "rgba(68,255,136,0.3)" : "transparent";
        shareBtn.style.borderColor = shareDrawingEnabled ? "#44ff88" : "rgba(255,255,255,0.2)";
        shareBtn.style.color = shareDrawingEnabled ? "#88ffaa" : "#ccc";
        shareBtn.title = shareDrawingEnabled
            ? "Drawings shared with all clients (click for local only)"
            : "Drawings are local only (click to share)";
    }
}

// =============================================================
// UNDO (last stroke)
// =============================================================

export function undoLastStroke() {
    const authorId = getAuthorIdLocal();

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
// CLEAR / DELETE
// =============================================================

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

/**
 * Delete all strokes in all selected groups
 */
export function deleteSelectedGroup() {
    if (selectedGroupIds.size === 0) return;

    const groupCount = selectedGroupIds.size;
    let count = 0;
    for (const gid of selectedGroupIds) {
        const strokes = getGroupStrokes(gid);
        for (const item of strokes) {
            deleteAnnotation(item.id);
            count++;
        }
    }

    deselectGroup();

    console.log("[drawing] deleted", count, "strokes from", groupCount, "group(s)");
}

// =============================================================
// KEYBOARD SHORTCUTS
// =============================================================

export function handleDrawingKeydown(e) {
    if (window.oscillaTextInputActive) return false;

    // Ctrl/Cmd+Z = undo last stroke (in draw mode)
    if ((drawMode || eraserMode) && (e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undoLastStroke();
        return true;
    }

    // 'e' = toggle eraser
    if ((drawMode || selectMode) && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "e") {
        e.preventDefault();
        toggleEraserMode();
        return true;
    }

    // 'v' = toggle select/move mode
    if ((drawMode || eraserMode) && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "v") {
        e.preventDefault();
        toggleSelectMode();
        return true;
    }

    // 'd' = back to draw mode
    if ((selectMode || eraserMode) && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "d") {
        e.preventDefault();
        setDrawMode(true);
        return true;
    }

    // Delete/Backspace = delete selected group(s)
    if (selectMode && selectedGroupIds.size > 0 && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        deleteSelectedGroup();
        return true;
    }

    // 's' = toggle scope (local/shared) on selected group(s)
    if (selectMode && selectedGroupIds.size > 0 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "s") {
        e.preventDefault();
        toggleSelectedScope();
        return true;
    }

    // Escape = exit all modes
    if ((drawMode || eraserMode || selectMode) && e.key === "Escape") {
        e.preventDefault();
        setDrawMode(false);
        setEraserMode(false);
        setSelectMode(false);
        return true;
    }

    return false;
}

// =============================================================
// HELPER — MODE & AUTHOR
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

export function initDrawing() {
    ensureOverlay();
    createDrawToolbar();

    window.addEventListener("keydown", handleDrawingKeydown);

    window.addEventListener("resize", () => {
        ensureOverlay();
        renderStrokes();
    });

    window.oscillaDrawing = {
        setDrawMode,
        setEraserMode,
        setSelectMode,
        toggleDrawMode,
        toggleEraserMode,
        toggleSelectMode,
        isDrawMode: () => drawMode,
        isEraserMode: () => eraserMode,
        isSelectMode: () => selectMode,
        setStrokeColor,
        setStrokeWidth,
        getStrokeColor: () => strokeColor,
        getStrokeWidth: () => strokeWidth,
        toggleShareDrawing,
        isShareDrawing: () => shareDrawingEnabled,
        toggleSelectedScope,
        undoLastStroke,
        clearLocalStrokes,
        deleteSelectedGroup,
    };

    console.log("[drawing] initialized");
}

export function destroyDrawing() {
    setDrawMode(false);
    setEraserMode(false);
    setSelectMode(false);
    removeOverlay();

    if (drawToolbar) {
        drawToolbar.remove();
        drawToolbar = null;
    }

    window.removeEventListener("keydown", handleDrawingKeydown);
    delete window.oscillaDrawing;

    console.log("[drawing] destroyed");
}
