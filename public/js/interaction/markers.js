// public/js/oscillaContributionMarker.js
//
// Drop Marker System for Oscilla
// - Drop markers at playhead position
// - Draggable marker labels
// - Color picker for markers
// - Vertical line option
// - Shared/local scope toggle for network sync
// - Global share toggle in top bar
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
let shareMarkersEnabled = true;  // Default: sharing ON

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
// MARKER SHARING TOGGLE
// =============================================================

/**
 * Toggle whether new markers are shared by default
 * @param {boolean} [forceState] - Optional forced state
 * @returns {boolean} Current share state
 */
export function toggleMarkerSharing(forceState) {
    if (typeof forceState === "boolean") {
        shareMarkersEnabled = forceState;
    } else {
        shareMarkersEnabled = !shareMarkersEnabled;
    }

    // Update button state
    const btn = document.getElementById("share-markers-button");
    if (btn) {
        btn.classList.toggle("active", shareMarkersEnabled);
        btn.title = shareMarkersEnabled 
            ? "Markers shared with all clients (click to make local)" 
            : "Markers are local only (click to share)";
    }

    console.log("[marker] Sharing:", shareMarkersEnabled ? "enabled" : "disabled");

    return shareMarkersEnabled;
}

/**
 * Get current marker sharing state
 * @returns {boolean}
 */
export function getMarkerSharingEnabled() {
    return shareMarkersEnabled;
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
    
    // Add shared class for visual indicator
    if (marker.scope === "shared") {
        el.classList.add("osc-marker--shared");
    }
    
    // Apply marker color
    const markerColor = marker.color || DEFAULT_MARKER_COLOR;
    applyMarkerColor(el, markerColor);
    
    // Respect current visibility state
    if (!markersVisible) {
        el.style.display = "none";
    }

    // Get localScale for worldâ†’screen conversion
    const localScale = (typeof window.localScale === "number" && 
                        isFinite(window.localScale) && 
                        window.localScale > 0) 
                        ? window.localScale 
                        : 1;

    // Convert world coordinates to screen pixels
    // placement.x is stored in WORLD coordinates (like playheadX)
    const screenX = marker.placement.x * localScale;
    el.style.left = `${screenX}px`;

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

    // Apply font size - scaled by localScale so label width is consistent
    // in world units across clients with different screen sizes
    const baseFontSize = marker.fontSize || 14;
    const scaledFontSize = baseFontSize * localScale;
    label.style.fontSize = `${scaledFontSize}px`;
    
    // Apply vertical position (labelY) - also scale by localScale for consistency
    const baseLabelY = marker.labelY ?? 30;
    const scaledLabelY = baseLabelY * localScale;
    label.style.top = `${scaledLabelY}px`;

    // Add tooltip with marker name and scope
    const scopeIndicator = marker.scope === "shared" ? " (shared)" : " (local)";
    label.title = (marker.text || "Marker") + scopeIndicator;

    el.appendChild(label);

    // -----------------------------------------------
    // Drag logic - 2D dragging (X moves marker, Y moves label)
    // Both X and Y are converted to world coordinates for storage
    // -----------------------------------------------
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let baseWorldX = 0;
    let baseWorldY = 0;

    function onPointerDown(e) {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

        e.preventDefault();
        e.stopPropagation();

        dragging = true;
        moved = false;
        startX = e.clientX;
        startY = e.clientY;
        baseWorldX = marker.placement.x;  // World coordinates
        baseWorldY = marker.labelY ?? 30;  // World coordinates

        label.classList.add("dragging");

        window.addEventListener("mousemove", onPointerMove);
        window.addEventListener("mouseup", onPointerUp);
    }

    function onPointerMove(e) {
        if (!dragging) return;

        // Get current localScale (may have changed since element creation)
        const currentScale = (typeof window.localScale === "number" && 
                              isFinite(window.localScale) && 
                              window.localScale > 0) 
                              ? window.localScale 
                              : 1;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;

        // Convert screen delta to world delta for X position
        const worldDx = dx / currentScale;
        marker.placement.x = Math.max(0, baseWorldX + worldDx);
        
        // Convert back to screen for display
        const newScreenX = marker.placement.x * currentScale;
        el.style.left = `${newScreenX}px`;
        
        // Convert screen delta to world delta for Y position
        const worldDy = dy / currentScale;
        const maxWorldY = (scoreHeight / currentScale) - 30;
        marker.labelY = Math.max(0, Math.min(maxWorldY, baseWorldY + worldDy));
        
        // Convert back to screen for display
        const newScreenY = marker.labelY * currentScale;
        label.style.top = `${newScreenY}px`;
    }

    function onPointerUp() {
        if (!dragging) return;

        dragging = false;
        label.classList.remove("dragging");

        window.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("mouseup", onPointerUp);

        // Persist if moved (placement.x and labelY are in world coordinates)
        if (moved) {
            updateAnnotation(marker.id, {
                placement: { ...marker.placement },
                labelY: marker.labelY
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
    const maxY = window.innerHeight - 280;
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
    input.placeholder = "Marker labelâ€¦";
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
    verticalLabel.textContent = "Show vertical line";
    
    verticalRow.appendChild(verticalChk);
    verticalRow.appendChild(verticalLabel);
    editor.appendChild(verticalRow);
    
    // Shared checkbox row
    const sharedRow = document.createElement("div");
    sharedRow.className = "osc-marker-editor-checkbox-row osc-marker-editor-checkbox-row--shared";
    
    const sharedChk = document.createElement("input");
    sharedChk.type = "checkbox";
    sharedChk.id = "marker-shared-chk";
    sharedChk.checked = marker.scope === "shared";
    
    const sharedLabel = document.createElement("label");
    sharedLabel.htmlFor = "marker-shared-chk";
    sharedLabel.textContent = "Share with all clients";
    
    // Add info icon/tooltip
    const sharedInfo = document.createElement("span");
    sharedInfo.className = "osc-marker-editor-info";
    sharedInfo.textContent = "â„¹";
    sharedInfo.title = "When enabled, this marker will appear on all connected clients' scores";
    
    sharedRow.appendChild(sharedChk);
    sharedRow.appendChild(sharedLabel);
    sharedRow.appendChild(sharedInfo);
    editor.appendChild(sharedRow);
    
    // Font size control row
    const fontSizeRow = document.createElement("div");
    fontSizeRow.className = "osc-marker-editor-fontsize-row";
    
    const fontSizeLabel = document.createElement("label");
    fontSizeLabel.textContent = "Size";
    fontSizeLabel.htmlFor = "marker-fontsize-input";
    
    const fontSizeInput = document.createElement("input");
    fontSizeInput.type = "range";
    fontSizeInput.id = "marker-fontsize-input";
    fontSizeInput.min = "10";
    fontSizeInput.max = "32";
    fontSizeInput.value = marker.fontSize || 14;
    
    const fontSizeValue = document.createElement("span");
    fontSizeValue.className = "osc-marker-editor-fontsize-value";
    fontSizeValue.textContent = `${fontSizeInput.value}px`;
    
    fontSizeInput.addEventListener("input", () => {
        fontSizeValue.textContent = `${fontSizeInput.value}px`;
    });
    
    fontSizeRow.appendChild(fontSizeLabel);
    fontSizeRow.appendChild(fontSizeInput);
    fontSizeRow.appendChild(fontSizeValue);
    editor.appendChild(fontSizeRow);
    
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
        const isShared = sharedChk.checked;
        const newScope = isShared ? "shared" : "local";
        const newFontSize = parseInt(fontSizeInput.value, 10) || 14;
        
        updateAnnotation(marker.id, { 
            text: newText,
            vertical: isVertical,
            color: selectedColor,
            scope: newScope,
            fontSize: newFontSize
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
 * Uses the global shareMarkersEnabled toggle to determine scope
 * @param {Object} [options] - Optional settings
 * @param {boolean} [options.shared] - Override: force shared or local
 * @returns {Object|undefined} The created marker, or undefined if failed
 */
export function dropMarker(options = {}) {
    // Get playhead position (in world coordinate space)
    const playheadX = window.playheadX;
    if (typeof playheadX !== "number" || !isFinite(playheadX)) {
        console.warn("[marker] Cannot drop marker: invalid playhead position");
        return;
    }
    
    // Get current mode context
    const { mode, pageId } = getModeContext();
    
    // Determine scope: explicit option > global toggle
    const scope = options.shared !== undefined 
        ? (options.shared ? "shared" : "local")
        : (shareMarkersEnabled ? "shared" : "local");
    
    // Create marker item
    // IMPORTANT: placement.x is stored in WORLD coordinates (same as playheadX)
    // Each client converts to screen pixels using their own localScale at render time
    const marker = {
        id: ulidLike(),
        kind: "marker",
        text: "m",
        scope: scope,
        
        createdAt: nowMs(),
        updatedAt: nowMs(),
        
        anchor: {
            mode: mode,
            ...(mode === "page" && pageId ? { pageId } : {})
        },
        
        placement: {
            space: "score",
            x: playheadX,  // Store in WORLD coordinates
            y: 0
        },
        
        vertical: true,
        color: DEFAULT_MARKER_COLOR,
        fontSize: 14,
        labelY: 30  // Default position near top of marker line
    };
    
    // Add via standard annotation pipeline
    addAnnotation(marker);
    
    console.log("[marker] Dropped marker at worldX:", playheadX, "scope:", scope);
    
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

    // Wire up Toggle Markers Visibility button
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

    // Wire up Share Markers toggle button
    const shareMarkersBtn = document.getElementById("share-markers-button");
    if (shareMarkersBtn) {
        // Set initial state (sharing enabled by default)
        shareMarkersBtn.classList.add("active");
        shareMarkersBtn.title = "Markers shared with all clients (click to make local)";

        shareMarkersBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleMarkerSharing();
        });
    }
}

// =============================================================
// MARKER LOOKUP BY NAME
// =============================================================

/**
 * Find the first marker matching a given name (text), sorted by world X position.
 * Used by nav(@mark:name) and unified transport navigation.
 * @param {string} name - The marker text to search for
 * @returns {Object|null} The matching marker, or null
 */
export function findMarkerByName(name) {
    if (!name) return null;
    const matches = state.items
        .filter(i => i.kind === "marker" && i.text === name)
        .sort((a, b) => (a.placement?.x || 0) - (b.placement?.x || 0));

    if (matches.length > 1) {
        console.warn(`[marker] Multiple markers named "${name}" — using leftmost (x=${matches[0].placement?.x})`);
    }

    return matches[0] || null;
}

/**
 * Get all markers sorted by world X position.
 * Used by unified transport nav and rehearsal popup.
 * @returns {Array<{name: string, x: number, id: string, source: string}>}
 */
export function getSortedMarkerNavPoints() {
    return state.items
        .filter(i => i.kind === "marker" && i.placement?.x != null)
        .map(i => ({
            name: i.text || "m",
            x: i.placement.x,
            id: i.id,
            source: "marker"
        }))
        .sort((a, b) => a.x - b.x);
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

/**
 * Get only shared markers from state
 * @returns {Array}
 */
export function getSharedMarkers() {
    return state.items.filter(i => i.kind === "marker" && i.scope === "shared");
}

/**
 * Get only local markers from state
 * @returns {Array}
 */
export function getLocalMarkers() {
    return state.items.filter(i => i.kind === "marker" && i.scope === "local");
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
    window.toggleMarkerSharing = toggleMarkerSharing;
    window.findMarkerByName = findMarkerByName;
    window.getSortedMarkerNavPoints = getSortedMarkerNavPoints;
    
    console.log("[marker] Initialized (sharing:", shareMarkersEnabled ? "enabled" : "disabled", ")");
}

// =============================================================
// EXPORTS
// =============================================================

export default {
    // Visibility
    toggleMarkersVisibility,
    getMarkersVisible,
    
    // Sharing
    toggleMarkerSharing,
    getMarkerSharingEnabled,
    
    // Element creation
    makeMarkerEl,
    
    // Editor
    openMarkerEditor,
    closeMarkerEditor,
    
    // Lookup
    findMarkerByName,
    getSortedMarkerNavPoints,
    
    // Actions
    dropMarker,
    clearMarkers,
    getMarkers,
    getSharedMarkers,
    getLocalMarkers,
    
    // Wiring
    wireMarkerButtons,
    
    // Init
    initMarkers,
};
