// public/js/oscillaContributionMarker.js
//
// Drop Marker System for Oscilla
// - Drop markers at playhead position
// - Draggable marker labels
// - Color picker for markers
// - Vertical line option
// - Visibility toggle
//
// Usage:
//   import { initMarkers, dropMarker, toggleMarkersVisibility } from "./oscillaContributionMarker.js";
//   initMarkers({ onUpdate: renderAll });

import { 
    createColorPicker, 
    DEFAULT_MARKER_COLOR, 
    applyMarkerColor,
    darkenColor 
} from "./colorPicker.js";

import {
    state,
    ulidLike,
    nowMs,
    getModeContext,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
} from "./shared.js";

// =============================================================
// MARKER STATE
// =============================================================

let markersVisible = true;

// =============================================================
// MARKER VISIBILITY
// =============================================================

/**
 * Toggle marker visibility on/off
 * @param {boolean} [forceState] - Optional forced state
 * @returns {boolean} Current visibility state
 */
export function toggleMarkersVisibility(forceState) {
    if (typeof forceState === "boolean") {
        markersVisible = forceState;
    } else {
        markersVisible = !markersVisible;
    }

    // Update all marker elements
    const markers = document.querySelectorAll(".osc-marker");
    markers.forEach(m => {
        m.style.display = markersVisible ? "" : "none";
    });

    // Update button state
    const btn = document.getElementById("toggle-markers-button");
    if (btn) {
        btn.classList.toggle("active", markersVisible);
        btn.title = markersVisible ? "Hide Markers" : "Show Markers";
    }

    console.log("[marker] Visibility:", markersVisible ? "visible" : "hidden");

    return markersVisible;
}

/**
 * Get current marker visibility state
 * @returns {boolean}
 */
export function getMarkersVisible() {
    return markersVisible;
}

// =============================================================
// MARKER ELEMENT CREATION
// =============================================================

/**
 * Create a marker DOM element
 * Markers are vertical lines with draggable labels
 * @param {Object} marker - Marker data object
 * @param {Function} onEdit - Callback when marker is clicked for editing
 * @returns {HTMLElement}
 */
export function makeMarkerEl(marker, onEdit) {
    const el = document.createElement("div");
    el.className = "osc-marker";
    el.dataset.id = marker.id;
    
    // Add vertical class if enabled
    if (marker.vertical) {
        el.classList.add("osc-marker--vertical");
    }
    
    // Apply marker color
    const markerColor = marker.color || DEFAULT_MARKER_COLOR;
    applyMarkerColor(el, markerColor);
    
    // Respect current visibility state
    if (!markersVisible) {
        el.style.display = "none";
    }

    // Position at marker x coordinate
    el.style.left = `${marker.placement.x}px`;

    // Get the score height for the marker line
    const scoreContainer = document.getElementById("scoreContainer");
    const svg = scoreContainer?.querySelector("svg");
    const scoreHeight = svg?.getBoundingClientRect().height || window.innerHeight;
    el.style.height = `${scoreHeight}px`;

    // Create the vertical line
    const line = document.createElement("div");
    line.className = "osc-marker-line";
    el.appendChild(line);

    // Create the label (drag handle)
    const label = document.createElement("div");
    label.className = "osc-marker-label";
    label.textContent = marker.text || "m";

    // Add tooltip with marker name
    label.title = marker.text || "Marker";

    el.appendChild(label);

    // -----------------------------------------------
    // Drag logic - label is the sole drag handle
    // -----------------------------------------------
    let dragging = false;
    let moved = false;
    let startX = 0;
    let baseX = 0;

    function onPointerDown(e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

        e.preventDefault();
        e.stopPropagation();

        dragging = true;
        moved = false;
        startX = e.clientX;
        baseX = marker.placement.x;

        label.classList.add("dragging");

        window.addEventListener("mousemove", onPointerMove);
        window.addEventListener("mouseup", onPointerUp);
    }

    function onPointerMove(e) {
        if (!dragging) return;

        const dx = e.clientX - startX;
        if (Math.abs(dx) > 3) moved = true;

        marker.placement.x = Math.max(0, baseX + dx);
        el.style.left = `${marker.placement.x}px`;
    }

    function onPointerUp() {
        if (!dragging) return;

        dragging = false;
        label.classList.remove("dragging");

        window.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("mouseup", onPointerUp);

        // Persist if moved
        if (moved) {
            updateAnnotation(marker.id, {
                placement: { ...marker.placement }
            });
        }
    }

    label.addEventListener("mousedown", onPointerDown);

    // Click to edit (if not dragged)
    label.addEventListener("click", (e) => {
        if (moved) return;
        e.preventDefault();
        e.stopPropagation();

        // Store screen position for editor placement
        marker._lastScreenX = e.clientX;
        marker._lastScreenY = e.clientY;

        onEdit?.(marker);
    });

    return el;
}

// =============================================================
// MARKER EDITOR
// =============================================================

/**
 * Open the marker editor popup
 * @param {Object} marker - Marker to edit
 */
export function openMarkerEditor(marker) {
    closeMarkerEditor();
    
    // Prevent keyboard shortcuts while editing
    window.oscillaTextInputActive = true;
    
    const x = marker._lastScreenX ?? window.innerWidth / 2;
    const y = marker._lastScreenY ?? window.innerHeight / 2;
    
    const editor = document.createElement("div");
    editor.className = "osc-marker-editor";
    editor.id = "osc-marker-editor-active";
    
    // Set editor color from marker
    const currentColor = marker.color || DEFAULT_MARKER_COLOR;
    editor.style.setProperty("--marker-editor-color", currentColor);
    editor.style.setProperty("--marker-editor-color-dark", darkenColor(currentColor, 0.15));
    
    // Position near click, but keep on screen
    const maxX = window.innerWidth - 250;
    const maxY = window.innerHeight - 200;
    editor.style.left = `${Math.max(20, Math.min(x + 10, maxX))}px`;
    editor.style.top = `${Math.max(20, Math.min(y + 10, maxY))}px`;
    
    // Header
    const header = document.createElement("div");
    header.className = "osc-marker-editor-header";
    
    const title = document.createElement("div");
    title.className = "osc-marker-editor-title";
    title.textContent = "Edit Marker";
    header.appendChild(title);
    
    editor.appendChild(header);
    
    // Label input
    const input = document.createElement("input");
    input.type = "text";
    input.value = marker.text || "";
    input.placeholder = "Marker label…";
    editor.appendChild(input);
    
    // Vertical checkbox row
    const verticalRow = document.createElement("div");
    verticalRow.className = "osc-marker-editor-checkbox-row";
    
    const verticalChk = document.createElement("input");
    verticalChk.type = "checkbox";
    verticalChk.id = "marker-vertical-chk";
    verticalChk.checked = !!marker.vertical;
    
    const verticalLabel = document.createElement("label");
    verticalLabel.htmlFor = "marker-vertical-chk";
    verticalLabel.textContent = "Drop Vertical (full height line)";
    
    verticalRow.appendChild(verticalChk);
    verticalRow.appendChild(verticalLabel);
    editor.appendChild(verticalRow);
    
    // Color picker
    let selectedColor = currentColor;
    
    const colorPicker = createColorPicker({
        currentColor: currentColor,
        onChange: (color) => {
            selectedColor = color;
            editor.style.setProperty("--marker-editor-color", color);
            editor.style.setProperty("--marker-editor-color-dark", darkenColor(color, 0.15));
        }
    });
    editor.appendChild(colorPicker);
    
    // Actions
    const actions = document.createElement("div");
    actions.className = "osc-marker-editor-actions";
    
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "cancel-btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.onclick = () => closeMarkerEditor();
    
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.textContent = "Delete";
    deleteBtn.onclick = () => {
        deleteAnnotation(marker.id);
        closeMarkerEditor();
    };
    
    const saveBtn = document.createElement("button");
    saveBtn.className = "save-btn";
    saveBtn.textContent = "Save";
    saveBtn.onclick = () => {
        const newText = input.value.trim() || "Marker";
        const isVertical = verticalChk.checked;
        updateAnnotation(marker.id, { 
            text: newText,
            vertical: isVertical,
            color: selectedColor
        });
        closeMarkerEditor();
    };
    
    actions.appendChild(cancelBtn);
    actions.appendChild(deleteBtn);
    actions.appendChild(saveBtn);
    editor.appendChild(actions);
    
    // Handle Enter key
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            saveBtn.click();
        } else if (e.key === "Escape") {
            e.preventDefault();
            closeMarkerEditor();
        }
    });
    
    document.body.appendChild(editor);
    
    // Focus input and select text
    setTimeout(() => {
        input.focus();
        input.select();
    }, 10);
}

/**
 * Close the marker editor
 */
export function closeMarkerEditor() {
    window.oscillaTextInputActive = false;
    const existing = document.getElementById("osc-marker-editor-active");
    if (existing) existing.remove();
}

// =============================================================
// DROP MARKER
// =============================================================

/**
 * Drop a marker at the current playhead position
 * @returns {Object|undefined} The created marker, or undefined if failed
 */
export function dropMarker() {
    // Get playhead position (in score/playhead coordinate space)
    const playheadX = window.playheadX;
    if (typeof playheadX !== "number" || !isFinite(playheadX)) {
        console.warn("[marker] Cannot drop marker: invalid playhead position");
        return;
    }
    
    // Get scale factor
    const scale = (typeof window.localScale === "number" && 
                   isFinite(window.localScale) && 
                   window.localScale > 0) 
                   ? window.localScale 
                   : 1;
    
    // Convert playhead position to placement coordinate space
    const placementX = playheadX * scale;
    
    // Get current mode context
    const { mode, pageId } = getModeContext();
    
    // Create marker item
    const marker = {
        id: ulidLike(),
        kind: "marker",
        text: "m",
        scope: "shared",
        
        createdAt: nowMs(),
        updatedAt: nowMs(),
        
        anchor: {
            mode: mode,
            ...(mode === "page" && pageId ? { pageId } : {})
        },
        
        placement: {
            space: "score",
            x: placementX,
            y: 0
        },
        
        vertical: true,
        color: DEFAULT_MARKER_COLOR
    };
    
    // Add via standard annotation pipeline
    addAnnotation(marker);
    
    console.log("[marker] Dropped marker at playheadX:", playheadX, "placementX:", placementX, "scale:", scale);
    
    return marker;
}

// =============================================================
// CLEAR MARKERS
// =============================================================

/**
 * Clear all markers from a layer
 * @param {HTMLElement} layer
 */
export function clearMarkers(layer) {
    if (!layer) return;
    layer.querySelectorAll(".osc-marker").forEach((n) => n.remove());
}

// =============================================================
// BUTTON WIRING
// =============================================================

/**
 * Wire up marker button event listeners
 */
export function wireMarkerButtons() {
    // Wire up Drop Marker button
    const dropMarkerBtn = document.getElementById("drop-marker-button");
    if (dropMarkerBtn) {
        dropMarkerBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropMarker();
        });
    }

    // Wire up Toggle Markers button
    const toggleMarkersBtn = document.getElementById("toggle-markers-button");
    if (toggleMarkersBtn) {
        // Set initial state (markers visible by default)
        toggleMarkersBtn.classList.add("active");
        toggleMarkersBtn.title = "Hide Markers";

        toggleMarkersBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleMarkersVisibility();
        });
    }
}

// =============================================================
// GET MARKERS
// =============================================================

/**
 * Get all markers from state
 * @returns {Array}
 */
export function getMarkers() {
    return state.items.filter(i => i.kind === "marker");
}

// =============================================================
// INITIALIZATION
// =============================================================

/**
 * Initialize the marker system
 * Call this after the DOM is ready
 */
export function initMarkers() {
    wireMarkerButtons();
    
    // Expose on window for debugging
    window.dropMarker = dropMarker;
    window.toggleMarkersVisibility = toggleMarkersVisibility;
    
    console.log("[marker] Initialized");
}

// =============================================================
// EXPORTS
// =============================================================

export default {
    // Visibility
    toggleMarkersVisibility,
    getMarkersVisible,
    
    // Element creation
    makeMarkerEl,
    
    // Editor
    openMarkerEditor,
    closeMarkerEditor,
    
    // Actions
    dropMarker,
    clearMarkers,
    getMarkers,
    
    // Wiring
    wireMarkerButtons,
    
    // Init
    initMarkers,
};
