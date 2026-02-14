// public/js/oscillaAnnotationEditor.js
//
// Annotation Editor & Pin Elements for Oscilla
// Consolidated module containing:
// - Pin DOM element creation and positioning
// - Extent/duration drag handles
// - Annotation editor UI (create/edit form)
// - Trigger configuration
//
// Usage:
//   import { makePinEl, positionAnnotation, makeEditor, getScoreScrollInner } from "./oscillaAnnotationEditor.js";

import { getStopwatchTime } from "../cues/timers.js";
import { showRecordingModal, isRecordingSupported } from "./audioRecorder.js";
import { openAudioBrowser, handleAudioUpload } from "./audioBrowser.js";
import { 
    state, 
    updateAnnotation,
    getProjectName 
} from "./shared.js";
import { 
    TRIGGER_BORDER_COLOR,
    executeTrigger 
} from "./trigger.js";
import { makeDraggable } from "../system/uiUtils.js";

// =============================================================
// SCORE INNER WRAPPER
// =============================================================

/**
 * Get or create the score inner wrapper element
 * This wraps the SVG to allow absolute positioning of annotations
 */
export function getScoreScrollInner() {
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

// =============================================================
// POSITION ANNOTATION
// =============================================================

/**
 * Position an annotation element on the score
 * Converts world coordinates to screen pixels using localScale
 * @param {HTMLElement} el - The annotation element
 * @param {Object} annotation - The annotation data
 */
export function positionAnnotation(el, annotation) {
    if (!el || !annotation?.placement) return;

    // Get localScale for worldâ†’screen conversion
    const localScale = (typeof window.localScale === "number" && 
                        isFinite(window.localScale) && 
                        window.localScale > 0) 
                        ? window.localScale 
                        : 1;

    // Convert world coordinates to screen pixels
    // placement.x and placement.y are stored in WORLD coordinates
    const screenX = annotation.placement.x * localScale;
    const screenY = annotation.placement.y * localScale;
    
    el.style.left = `${screenX}px`;
    el.style.top = `${screenY}px`;

    // Store width in world units (not screen pixels)
    annotation.placement.width = el.offsetWidth / localScale;

    // Default extent to width if missing (in world units)
    if (
        annotation.placement.extent == null ||
        annotation.placement.extent < annotation.placement.width
    ) {
        annotation.placement.extent = annotation.placement.width;
    }

    // Extent handle (trigger duration)
    if (annotation.trigger) {
        attachExtentHandle(el, annotation);
    }
}

// =============================================================
// EXTENT HANDLE (Duration Drag)
// =============================================================

/**
 * Attach extent (duration) drag handle to a pin
 * Extent is stored in world coordinates and converted to screen pixels for display
 * @param {HTMLElement} pin - The pin element
 * @param {Object} annotation - The annotation data
 */
export function attachExtentHandle(pin, annotation) {
    const placement = annotation.placement;
    pin.style.position = "absolute";

    // Reuse or create elements
    let startBar = pin.querySelector(".osc-extent-start");
    let line = pin.querySelector(".osc-extent-line");
    let endHandle = pin.querySelector(".osc-extent-handle");

    if (!startBar) {
        startBar = document.createElement("div");
        startBar.className = "osc-extent-start";
        pin.appendChild(startBar);
    }

    if (!line) {
        line = document.createElement("div");
        line.className = "osc-extent-line";
        pin.appendChild(line);
    }

    if (!endHandle) {
        endHandle = document.createElement("div");
        endHandle.className = "osc-extent-handle";
        pin.appendChild(endHandle);
    }

    // Styling
    [startBar, line, endHandle].forEach(el => {
        el.style.position = "absolute";
        el.style.background = "#000";
        el.style.pointerEvents = "auto";
    });

    // Vertical bars
    startBar.style.width = "2px";
    startBar.style.height = "16px";

    endHandle.style.width = "2px";
    endHandle.style.height = "16px";
    endHandle.style.cursor = "ew-resize";

    // Horizontal line
    line.style.height = "1px";

    // Layout updater - converts world extent to screen pixels
    function updateUI() {
        const localScale = (typeof window.localScale === "number" && 
                            isFinite(window.localScale) && 
                            window.localScale > 0) 
                            ? window.localScale 
                            : 1;
        
        const worldExtent = placement.extent ?? 0;
        const screenExtent = worldExtent * localScale;

        // Start bar at origin
        startBar.style.left = "0px";
        startBar.style.top = "0px";
        startBar.style.transform = "translate(-50%, -50%)";

        // Horizontal line
        line.style.left = "0px";
        line.style.top = "0px";
        line.style.width = `${screenExtent}px`;

        // End handle
        endHandle.style.left = `${screenExtent}px`;
        endHandle.style.top = "0px";
        endHandle.style.transform = "translate(-50%, -50%)";
    }

    updateUI();

    // Drag logic - converts screen delta to world coordinates
    let dragging = false;
    let startX = 0;
    let startWorldExtent = 0;

    endHandle.onmousedown = e => {
        e.preventDefault();
        e.stopPropagation();

        dragging = true;
        startX = e.clientX;
        startWorldExtent = placement.extent ?? 0;

        document.body.style.cursor = "ew-resize";
    };

    window.addEventListener("mousemove", e => {
        if (!dragging) return;

        const localScale = (typeof window.localScale === "number" && 
                            isFinite(window.localScale) && 
                            window.localScale > 0) 
                            ? window.localScale 
                            : 1;

        const dx = e.clientX - startX;
        const worldDx = dx / localScale;  // Convert screen delta to world
        const nextExtent = Math.max(4, startWorldExtent + worldDx);

        placement.extent = nextExtent;
        updateUI();
    });

    window.addEventListener("mouseup", () => {
        if (!dragging) return;
        dragging = false;
        document.body.style.cursor = "";
    });

    // Expose redraw hook
    pin._renderExtent = updateUI;
}

// =============================================================
// MAKE PIN ELEMENT
// =============================================================

/**
 * Create a pin DOM element for an annotation
 * @param {Object} annotation - The annotation data
 * @param {Function} onClick - Callback when pin is clicked in edit mode
 * @returns {HTMLElement}
 */
export function makePinEl(annotation, onClick) {
    const pin = document.createElement("div");
    pin.className = "osc-anno-pin";
    pin.style.position = "absolute";

    positionAnnotation(pin, annotation);
    pin._renderExtent?.();

    pin.style.pointerEvents = "auto";
    pin.style.userSelect = "none";

    // Invisible hit area
    pin.style.minWidth = "24px";
    pin.style.minHeight = "24px";

    const hit = document.createElement("div");
    hit.style.position = "absolute";
    hit.style.left = "-15px";
    hit.style.top = "-15px";
    hit.style.width = "30px";
    hit.style.height = "30px";
    hit.style.cursor = state.annotationMode ? "grab" : "pointer";
    hit.style.pointerEvents = "auto";
    hit.style.background = "transparent";
    hit.style.zIndex = "5";
    pin.appendChild(hit);

    const isTrigger = annotation.kind === "trigger" && annotation.trigger;
    const isAudioOnly = isTrigger && annotation.trigger.visualMode === "audio";

    let labelEl = null;

    // =============================================================
    // MODE A: AUDIO ONLY (Using GUI Label)
    // =============================================================
    if (isAudioOnly) {
        const label = document.createElement("div");
        const customLabel = annotation.trigger?.label;
        const src = annotation.trigger?.source?.path ?? "";
        const fileName = src.split("/").pop() || src;

        label.textContent = (customLabel && customLabel.length > 0) ? customLabel : fileName;

        // Vertical centering
        label.style.position = "absolute";
        label.style.left = "0";
        label.style.top = "0";
        label.style.transform = "translateY(-50%)";

        // Scale font size by localScale for consistent appearance across clients
        const localScale = (typeof window.localScale === "number" && 
                            isFinite(window.localScale) && 
                            window.localScale > 0) 
                            ? window.localScale 
                            : 1;
        const baseFontSize = 12;
        const scaledFontSize = baseFontSize * localScale;
        
        label.style.fontSize = `${scaledFontSize}px`;
        label.style.whiteSpace = "nowrap";
        label.style.color = "#000";
        label.style.background = "rgba(255,255,255,0.7)";
        label.style.padding = "1px 4px";
        label.style.pointerEvents = "none";
        pin.appendChild(label);

        if (annotation.trigger) {
            attachExtentHandle(pin, annotation);
        }
    }
    // =============================================================
    // MODE B: STANDARD TEXT LABEL
    // =============================================================
    else {
        labelEl = document.createElement("div");
        labelEl.textContent =
            annotation.text.length > 300
                ? annotation.text.slice(0, 300) + "â€¦"
                : annotation.text;

        // Vertical centering
        labelEl.style.position = "absolute";
        labelEl.style.left = "0";
        labelEl.style.top = "0";
        labelEl.style.transform = "translateY(-50%)";

        labelEl.style.display = "inline-block";
        labelEl.style.minWidth = "max-content";
        labelEl.style.maxWidth = "360px";
        labelEl.style.boxSizing = "border-box";
        labelEl.style.contain = "layout paint";
        labelEl.style.whiteSpace = "pre-wrap";
        labelEl.style.wordBreak = "break-word";
        labelEl.style.overflowWrap = "anywhere";
        labelEl.style.writingMode = "horizontal-tb";
        labelEl.style.textOrientation = "mixed";
        labelEl.style.direction = "ltr";
        labelEl.style.hyphens = "none";
        labelEl.style.lineBreak = "auto";

        labelEl.style.lineHeight = "1.4";
        
        // Scale font size by localScale for consistent appearance across clients
        const localScale = (typeof window.localScale === "number" && 
                            isFinite(window.localScale) && 
                            window.localScale > 0) 
                            ? window.localScale 
                            : 1;
        const baseFontSize = annotation.style?.fontSize ?? 12;
        const scaledFontSize = baseFontSize * localScale;
        labelEl.style.fontSize = `${scaledFontSize}px`;
        
        labelEl.style.padding = "4px 8px";
        labelEl.style.borderRadius = "8px";
        labelEl.style.backdropFilter = "blur(4px)";
        labelEl.style.pointerEvents = "auto";
        labelEl.style.zIndex = "10";

        if (isTrigger) {
            labelEl.style.color = "black";
            labelEl.style.border = `1px solid ${TRIGGER_BORDER_COLOR}`;
            labelEl.style.cursor = state.annotationMode ? "grab" : "pointer";
            labelEl.style.paddingRight = "10px";

            const icon = document.createElement("span");
            const triggerType = annotation.trigger.type;
            if (triggerType === "audioImpulse") icon.textContent = "âš¡";
            else if (triggerType === "audioPool") icon.textContent = "ðŸŽ²";
            else icon.textContent = "ðŸ”Š";

            icon.style.position = "absolute";
            icon.style.top = "2px";
            icon.style.right = "4px";
            icon.style.fontSize = `${12 * localScale}px`;  // Scale icon too
            icon.style.opacity = "0.85";
            icon.style.pointerEvents = "none";
            labelEl.appendChild(icon);
        } else {
            labelEl.style.color = "black";
            labelEl.style.border = "1px solid rgba(255,255,255,0.12)";
            labelEl.style.cursor = "grab";
        }

        pin.appendChild(labelEl);

        // Store width in world units
        annotation.placement.width = labelEl.offsetWidth / localScale;

        if (annotation.placement.extent == null || annotation.placement.extent < annotation.placement.width) {
            annotation.placement.extent = annotation.placement.width;
        }
    }

    // =============================================================
    // DRAG LOGIC - converts screen deltas to world coordinates
    // =============================================================
    let dragging = false;
    let moved = false;
    let startX = 0; let startY = 0;
    let baseWorldX = 0; let baseWorldY = 0;

    function getPointerCoords(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    function onPointerDown(e) {
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        moved = false;
        const coords = getPointerCoords(e);
        startX = coords.x; startY = coords.y;
        baseWorldX = annotation.placement.x;  // World coordinates
        baseWorldY = annotation.placement.y;  // World coordinates
        if (labelEl) labelEl.style.cursor = "grabbing";
        hit.style.cursor = "grabbing";
        window.addEventListener("mousemove", onPointerMove);
        window.addEventListener("mouseup", onPointerUp);
        window.addEventListener("touchmove", onPointerMove, { passive: false });
        window.addEventListener("touchend", onPointerUp);
    }

    function onPointerMove(e) {
        if (!dragging) return;
        
        // Get current localScale for screenâ†’world conversion
        const localScale = (typeof window.localScale === "number" && 
                            isFinite(window.localScale) && 
                            window.localScale > 0) 
                            ? window.localScale 
                            : 1;
        
        const coords = getPointerCoords(e);
        const dx = coords.x - startX;
        const dy = coords.y - startY;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
        
        // Convert screen delta to world delta
        const worldDx = dx / localScale;
        const worldDy = dy / localScale;
        
        annotation.placement.x = baseWorldX + worldDx;
        annotation.placement.y = baseWorldY + worldDy;
        positionAnnotation(pin, annotation);
        pin._renderExtent?.();
    }

    function onPointerUp() {
        if (!dragging) return;
        dragging = false;
        const cursor = isTrigger && !state.annotationMode ? "pointer" : "grab";
        if (labelEl) labelEl.style.cursor = cursor;
        hit.style.cursor = cursor;
        window.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("mouseup", onPointerUp);
        window.removeEventListener("touchmove", onPointerMove);
        window.removeEventListener("touchend", onPointerUp);
        if (moved) updateAnnotation(annotation.id, { placement: { ...annotation.placement } });
    }

    hit.addEventListener("mousedown", onPointerDown);
    hit.addEventListener("touchstart", onPointerDown, { passive: false });
    if (labelEl) {
        labelEl.addEventListener("mousedown", onPointerDown);
        labelEl.addEventListener("touchstart", onPointerDown, { passive: false });
    }

    const handlePinClick = (e) => {
        if (moved) return;
        e.preventDefault(); e.stopPropagation();
        if (state.annotationMode) onClick?.(annotation);
        else if (isTrigger) executeTrigger(annotation, labelEl || pin);
    };

    hit.addEventListener("click", handlePinClick);
    if (labelEl) labelEl.addEventListener("click", handlePinClick);

    return pin;
}


// =============================================================
// MAKE EDITOR
// =============================================================

/**
 * Create an annotation editor UI
 * @param {Object} options
 * @param {number} options.x - X position
 * @param {number} options.y - Y position
 * @param {string} options.initialText - Initial text value
 * @param {string} options.initialScope - Initial scope (local/shared)
 * @param {number} options.initialFontSize - Initial font size
 * @param {Object} options.initialTrigger - Initial trigger config
 * @param {string} options.initialVisualMode - Initial visual mode
 * @returns {Object} Editor object with DOM element and methods
 */
export function makeEditor({
    x,
    y,
    initialText = "",
    initialScope = null,
    initialFontSize = null,
    initialTrigger = null,
    initialVisualMode = "text"
}) {

    const wrap = document.createElement("div");
    wrap.className = "osc-popup osc-anno-editor";

    const maxX = window.innerWidth - 380;
    const maxY = window.innerHeight - 240;

    wrap.style.left = `${Math.max(20, Math.min(x, maxX))}px`;
    wrap.style.top = `${Math.max(20, Math.min(y, maxY))}px`;

    // -----------------------------
    // Header (drag handle)
    // -----------------------------
    const header = document.createElement("div");
    header.className = "osc-anno-editor-header";
    header.textContent = "Annotation";

    wrap.appendChild(header);

    // Textarea — styled by .osc-popup textarea in oscillaDialog.css
    const ta = document.createElement("textarea");
    ta.value = initialText;
    ta.placeholder = "Annotation\u2026";
    ta.rows = 3;
    wrap.appendChild(ta);

    // -----------------------------
    // Font size control
    // -----------------------------
    const fontRow = document.createElement("div");
    fontRow.className = "osc-dialog-row";
    fontRow.style.marginTop = "6px";

    const fontLabel = document.createElement("label");
    fontLabel.textContent = "Font size";

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

    // =============================================================
    // TRIGGER CONTROLS
    // =============================================================
    const triggerSection = document.createElement("div");
    triggerSection.className = "osc-dialog-section--info";
    triggerSection.style.marginTop = "10px";

    // Executable checkbox row
    const execRow = document.createElement("div");
    execRow.className = "osc-dialog-row";

    const execCheck = document.createElement("input");
    execCheck.type = "checkbox";
    execCheck.id = "osc-exec-chk";
    execCheck.checked = !!initialTrigger;

    const execLabel = document.createElement("label");
    execLabel.htmlFor = "osc-exec-chk";
    execLabel.textContent = "ðŸ”Š Executable (Audio Trigger)";
    execLabel.style.fontWeight = "500";

    execRow.appendChild(execCheck);
    execRow.appendChild(execLabel);
    triggerSection.appendChild(execRow);

    // Hidden section for trigger config
    const triggerConfig = document.createElement("div");
    triggerConfig.style.marginTop = "8px";
    triggerConfig.style.display = execCheck.checked ? "block" : "none";

    // Visual mode selector
    const visualRow = document.createElement("div");
    visualRow.style.marginBottom = "8px";

    const visualLabel = document.createElement("label");
    visualLabel.textContent = "Visual Mode:";
    visualLabel.style.display = "block";
    visualLabel.style.marginBottom = "4px";

    const visualSelect = document.createElement("select");
    visualSelect.style.width = "100%";

    const vmText = document.createElement("option");
    vmText.value = "text";
    vmText.textContent = "Text (show annotation text)";

    const vmAudio = document.createElement("option");
    vmAudio.value = "audio";
    vmAudio.textContent = "Audio-only (show file name)";

    visualSelect.appendChild(vmText);
    visualSelect.appendChild(vmAudio);
    visualSelect.value = initialTrigger?.visualMode || initialVisualMode;

    visualRow.appendChild(visualLabel);
    visualRow.appendChild(visualSelect);
    triggerConfig.appendChild(visualRow);

    // GUI Label (for audio-only mode)
    const guiLabelRow = document.createElement("div");
    guiLabelRow.style.marginBottom = "8px";

    const guiLabelLabel = document.createElement("label");
    guiLabelLabel.textContent = "GUI Label (optional):";
    guiLabelLabel.style.display = "block";
    guiLabelLabel.style.marginBottom = "4px";

    const guiLabelInput = document.createElement("input");
    guiLabelInput.type = "text";
    guiLabelInput.placeholder = "Custom label for audio trigger";
    guiLabelInput.value = initialTrigger?.label || "";
    guiLabelInput.style.width = "100%";
    guiLabelInput.style.boxSizing = "border-box";

    guiLabelRow.appendChild(guiLabelLabel);
    guiLabelRow.appendChild(guiLabelInput);
    triggerConfig.appendChild(guiLabelRow);

    // Trigger type selector
    const typeRow = document.createElement("div");
    typeRow.style.marginBottom = "8px";

    const typeLabel = document.createElement("label");
    typeLabel.textContent = "Trigger Type:";
    typeLabel.style.display = "block";
    typeLabel.style.marginBottom = "4px";

    const typeSelect = document.createElement("select");
    typeSelect.style.width = "100%";

    const optAudio = document.createElement("option");
    optAudio.value = "audio";
    optAudio.textContent = "Audio (single file)";

    const optPool = document.createElement("option");
    optPool.value = "audioPool";
    optPool.textContent = "Audio Pool (folder, random/shuffle)";

    const optImpulse = document.createElement("option");
    optImpulse.value = "audioImpulse";
    optImpulse.textContent = "Audio Impulse (rapid fire)";

    typeSelect.appendChild(optAudio);
    typeSelect.appendChild(optPool);
    typeSelect.appendChild(optImpulse);
    typeSelect.value = initialTrigger?.type || "audio";

    typeRow.appendChild(typeLabel);
    typeRow.appendChild(typeSelect);
    triggerConfig.appendChild(typeRow);

    // Source row with buttons
    const sourceRow = document.createElement("div");
    sourceRow.style.marginBottom = "8px";

    const sourceLabel = document.createElement("label");
    sourceLabel.textContent = "Source:";
    sourceLabel.style.display = "block";
    sourceLabel.style.marginBottom = "4px";

    const sourceInputRow = document.createElement("div");
    sourceInputRow.style.display = "flex";
    sourceInputRow.style.gap = "4px";
    sourceInputRow.style.marginBottom = "4px";

    const sourceInput = document.createElement("input");
    sourceInput.type = "text";
    sourceInput.placeholder = "audio/my-sound.wav";
    sourceInput.value = initialTrigger?.source?.path || "";
    sourceInput.style.flex = "1";

    const browseBtn = document.createElement("button");
    browseBtn.type = "button";
    browseBtn.textContent = "ðŸ“‚";
    browseBtn.title = "Browse audio files";
    browseBtn.className = "osc-dialog-btn";
    browseBtn.style.padding = "4px 8px";

    sourceInputRow.appendChild(sourceInput);
    sourceInputRow.appendChild(browseBtn);

    // Upload and record buttons row
    const actionBtnsRow = document.createElement("div");
    actionBtnsRow.style.display = "flex";
    actionBtnsRow.style.gap = "4px";

    const uploadBtn = document.createElement("button");
    uploadBtn.type = "button";
    uploadBtn.textContent = "â¬†ï¸ Upload";
    uploadBtn.className = "osc-dialog-btn osc-dialog-btn--success";
    uploadBtn.style.flex = "1";
    uploadBtn.style.padding = "4px 8px";

    const recordBtn = document.createElement("button");
    recordBtn.type = "button";
    recordBtn.textContent = "ðŸŽ¤ Record";
    recordBtn.className = "osc-dialog-btn osc-dialog-btn--danger";
    recordBtn.style.flex = "1";
    recordBtn.style.padding = "4px 8px";

    if (!isRecordingSupported()) {
        recordBtn.disabled = true;
        recordBtn.title = "Recording not supported in this browser";
        recordBtn.style.opacity = "0.5";
    }

    actionBtnsRow.appendChild(uploadBtn);
    actionBtnsRow.appendChild(recordBtn);

    const statusMsg = document.createElement("div");
    statusMsg.style.fontSize = "10px";
    statusMsg.style.marginTop = "4px";
    statusMsg.style.minHeight = "14px";

    sourceRow.appendChild(sourceLabel);
    sourceRow.appendChild(sourceInputRow);
    sourceRow.appendChild(actionBtnsRow);
    sourceRow.appendChild(statusMsg);
    triggerConfig.appendChild(sourceRow);

    // Wire up browse button
    browseBtn.onclick = () => openAudioBrowser(sourceInput, statusMsg);

    // Wire up upload button
    const hiddenFileInput = document.createElement("input");
    hiddenFileInput.type = "file";
    hiddenFileInput.accept = "audio/*";
    hiddenFileInput.style.display = "none";
    wrap.appendChild(hiddenFileInput);

    uploadBtn.onclick = () => hiddenFileInput.click();
    hiddenFileInput.onchange = async () => {
        if (hiddenFileInput.files?.length) {
            await handleAudioUpload(hiddenFileInput.files[0], sourceInput, statusMsg);
            hiddenFileInput.value = "";
        }
    };

    // =============================================================
    // PLAYBACK OPTIONS
    // =============================================================
    const playbackSection = document.createElement("div");
    playbackSection.className = "osc-dialog-section--grouped";
    playbackSection.style.marginTop = "8px";

    const playbackTitle = document.createElement("div");
    playbackTitle.textContent = "Playback Options";
    playbackTitle.style.fontWeight = "500";
    playbackTitle.style.marginBottom = "6px";
    playbackSection.appendChild(playbackTitle);

    // Create playback option rows
    function createSliderRow(label, id, min, max, step, defaultVal, unit = "") {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "6px";
        row.style.marginBottom = "4px";

        const lbl = document.createElement("label");
        lbl.textContent = label;
        lbl.style.fontSize = "10px";
        lbl.style.width = "55px";
        lbl.style.flexShrink = "0";

        const slider = document.createElement("input");
        slider.type = "range";
        slider.id = id;
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = defaultVal;
        slider.style.flex = "1";

        const val = document.createElement("span");
        val.style.fontSize = "10px";
        val.style.minWidth = "35px";
        val.style.textAlign = "right";
        val.textContent = `${defaultVal}${unit}`;

        slider.oninput = () => { val.textContent = `${slider.value}${unit}`; };

        row.appendChild(lbl);
        row.appendChild(slider);
        row.appendChild(val);
        return { row, slider };
    }

    const gainCtrl = createSliderRow("Gain", "trig-gain", 0, 2, 0.05, initialTrigger?.playback?.gain ?? 1);
    const panCtrl = createSliderRow("Pan", "trig-pan", -1, 1, 0.1, initialTrigger?.playback?.pan ?? 0);
    const pitchCtrl = createSliderRow("Pitch", "trig-pitch", 0.5, 2, 0.05, initialTrigger?.playback?.pitch ?? 1, "x");
    const fadeInCtrl = createSliderRow("Fade In", "trig-fadein", 0, 5, 0.1, initialTrigger?.playback?.fadeIn ?? 0, "s");
    const fadeOutCtrl = createSliderRow("Fade Out", "trig-fadeout", 0, 5, 0.1, initialTrigger?.playback?.fadeOut ?? 0, "s");

    playbackSection.appendChild(gainCtrl.row);
    playbackSection.appendChild(panCtrl.row);
    playbackSection.appendChild(pitchCtrl.row);
    playbackSection.appendChild(fadeInCtrl.row);
    playbackSection.appendChild(fadeOutCtrl.row);

    // Order selector (for pools)
    const orderRow = document.createElement("div");
    orderRow.style.display = "flex";
    orderRow.style.alignItems = "center";
    orderRow.style.gap = "6px";
    orderRow.style.marginBottom = "4px";

    const orderLabel = document.createElement("label");
    orderLabel.textContent = "Order";
    orderLabel.style.fontSize = "10px";
    orderLabel.style.width = "55px";

    const orderSelect = document.createElement("select");
    orderSelect.style.flex = "1";
    orderSelect.style.fontSize = "10px";

    ["shuffle", "sequential", "random"].forEach(o => {
        const opt = document.createElement("option");
        opt.value = o;
        opt.textContent = o;
        orderSelect.appendChild(opt);
    });
    orderSelect.value = initialTrigger?.playback?.order || "shuffle";

    orderRow.appendChild(orderLabel);
    orderRow.appendChild(orderSelect);
    playbackSection.appendChild(orderRow);

    // Toggle checkbox
    const toggleRow = document.createElement("div");
    toggleRow.style.display = "flex";
    toggleRow.style.alignItems = "center";
    toggleRow.style.gap = "6px";

    const toggleCheck = document.createElement("input");
    toggleCheck.type = "checkbox";
    toggleCheck.id = "trig-toggle";
    toggleCheck.checked = initialTrigger?.playback?.toggle ?? false;

    const toggleLabel = document.createElement("label");
    toggleLabel.htmlFor = "trig-toggle";
    toggleLabel.textContent = "Toggle (click again to stop)";
    toggleLabel.style.fontSize = "10px";

    toggleRow.appendChild(toggleCheck);
    toggleRow.appendChild(toggleLabel);
    playbackSection.appendChild(toggleRow);

    triggerConfig.appendChild(playbackSection);

    // =============================================================
    // IMPULSE OPTIONS (only for audioImpulse type)
    // =============================================================
    const impulseSection = document.createElement("div");
    impulseSection.className = "osc-dialog-section--warning";
    impulseSection.style.marginTop = "8px";
    impulseSection.style.display = typeSelect.value === "audioImpulse" ? "block" : "none";

    const impulseTitle = document.createElement("div");
    impulseTitle.textContent = "âš¡ Impulse Settings";
    impulseTitle.style.fontWeight = "500";
    impulseTitle.style.marginBottom = "6px";
    impulseSection.appendChild(impulseTitle);

    const rateCtrl = createSliderRow("Rate", "imp-rate", 1, 60, 1, initialTrigger?.impulse?.rate ?? 30, "/s");
    const jitterCtrl = createSliderRow("Jitter", "imp-jitter", 0, 1, 0.05, initialTrigger?.impulse?.jitter ?? 0);
    const polyCtrl = createSliderRow("Polyphony", "imp-poly", 1, 16, 1, initialTrigger?.impulse?.poly ?? 6);
    const panRandCtrl = createSliderRow("Pan Rand", "imp-panrand", 0, 1, 0.05, initialTrigger?.impulse?.panRandom ?? 0);
    const pitchRandCtrl = createSliderRow("Pitch Rand", "imp-pitchrand", 0, 1, 0.05, initialTrigger?.impulse?.pitchRandom ?? 0);

    impulseSection.appendChild(rateCtrl.row);
    impulseSection.appendChild(jitterCtrl.row);
    impulseSection.appendChild(polyCtrl.row);
    impulseSection.appendChild(panRandCtrl.row);
    impulseSection.appendChild(pitchRandCtrl.row);

    // Lifespan mode
    const lifespanRow = document.createElement("div");
    lifespanRow.style.marginTop = "6px";

    const lifespanLabel = document.createElement("label");
    lifespanLabel.textContent = "Lifespan Mode:";
    lifespanLabel.style.fontSize = "10px";
    lifespanLabel.style.display = "block";
    lifespanLabel.style.marginBottom = "4px";

    const lifespanSelect = document.createElement("select");
    lifespanSelect.style.width = "100%";
    lifespanSelect.style.fontSize = "10px";

    [
        { value: "toggle", text: "Toggle (click to start/stop)" },
        { value: "gate", text: "Gate (playhead inside extent)" },
        { value: "fixed", text: "Fixed duration" }
    ].forEach(({ value, text }) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = text;
        lifespanSelect.appendChild(opt);
    });
    lifespanSelect.value = initialTrigger?.impulse?.lifespanMode || "toggle";

    lifespanRow.appendChild(lifespanLabel);
    lifespanRow.appendChild(lifespanSelect);
    impulseSection.appendChild(lifespanRow);

    // Fixed duration input
    const fixedDurRow = document.createElement("div");
    fixedDurRow.style.marginTop = "6px";
    fixedDurRow.style.display = lifespanSelect.value === "fixed" ? "flex" : "none";
    fixedDurRow.style.alignItems = "center";
    fixedDurRow.style.gap = "6px";

    const fixedDurLabel = document.createElement("label");
    fixedDurLabel.textContent = "Duration (sec):";
    fixedDurLabel.style.fontSize = "10px";

    const fixedDurInput = document.createElement("input");
    fixedDurInput.type = "number";
    fixedDurInput.min = 0.1;
    fixedDurInput.max = 300;
    fixedDurInput.step = 0.1;
    fixedDurInput.value = initialTrigger?.impulse?.lifespan ?? 5;
    fixedDurInput.style.width = "60px";

    fixedDurRow.appendChild(fixedDurLabel);
    fixedDurRow.appendChild(fixedDurInput);
    impulseSection.appendChild(fixedDurRow);

    lifespanSelect.onchange = () => {
        fixedDurRow.style.display = lifespanSelect.value === "fixed" ? "flex" : "none";
    };

    triggerConfig.appendChild(impulseSection);

    // Show/hide impulse section based on type
    typeSelect.onchange = () => {
        impulseSection.style.display = typeSelect.value === "audioImpulse" ? "block" : "none";
    };

    // =============================================================
    // PLAYHEAD TRIGGER OPTION
    // =============================================================
    const playheadRow = document.createElement("div");
    playheadRow.style.marginTop = "8px";
    playheadRow.style.display = "flex";
    playheadRow.style.alignItems = "center";
    playheadRow.style.gap = "6px";

    const playheadCheck = document.createElement("input");
    playheadCheck.type = "checkbox";
    playheadCheck.id = "trig-playhead";
    playheadCheck.checked = initialTrigger?.playheadTrigger ?? false;

    const playheadLabel = document.createElement("label");
    playheadLabel.htmlFor = "trig-playhead";
    playheadLabel.textContent = "â–¶ Trigger on Playhead Enter";
    playheadLabel.style.fontSize = "10px";

    playheadRow.appendChild(playheadCheck);
    playheadRow.appendChild(playheadLabel);
    triggerConfig.appendChild(playheadRow);

    triggerSection.appendChild(triggerConfig);
    wrap.appendChild(triggerSection);

    // Toggle trigger config visibility
    execCheck.onchange = () => {
        triggerConfig.style.display = execCheck.checked ? "block" : "none";
    };

    // =============================================================
    // SCOPE SELECTOR
    // =============================================================
    const scopeRow = document.createElement("div");
    scopeRow.style.display = "flex";
    scopeRow.style.alignItems = "center";
    scopeRow.style.gap = "8px";
    scopeRow.style.marginTop = "8px";

    const scopeLabel = document.createElement("label");
    scopeLabel.textContent = "Scope:";

    const scopeSelect = document.createElement("select");
    scopeSelect.style.padding = "4px 8px";

    const optLocal = document.createElement("option");
    optLocal.value = "local";
    optLocal.textContent = "ðŸ”’ Local (only me)";

    const optShared = document.createElement("option");
    optShared.value = "shared";
    optShared.textContent = "ðŸŒ Shared (all performers)";

    scopeSelect.appendChild(optLocal);
    scopeSelect.appendChild(optShared);
    scopeSelect.value = initialScope || "local";

    scopeRow.appendChild(scopeLabel);
    scopeRow.appendChild(scopeSelect);
    wrap.appendChild(scopeRow);

    // =============================================================
    // ACTION BUTTONS
    // =============================================================
    const btns = document.createElement("div");
    btns.className = "osc-dialog-actions";
    btns.style.marginTop = "10px";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.className = "osc-dialog-btn osc-dialog-btn--ghost";
    cancelBtn.style.flex = "1";

    const deleteBtn = document.createElement("button");
    deleteBtn.textContent = "Delete";
    deleteBtn.className = "osc-dialog-btn osc-dialog-btn--danger";
    deleteBtn.style.flex = "1";

    const saveBtn = document.createElement("button");
    saveBtn.textContent = "Save";
    saveBtn.className = "osc-dialog-btn osc-dialog-btn--primary";
    saveBtn.style.flex = "1";

    btns.appendChild(cancelBtn);
    btns.appendChild(deleteBtn);
    btns.appendChild(saveBtn);
    wrap.appendChild(btns);

    // Make draggable
    makeDraggable(wrap, header);

    // Focus textarea
    setTimeout(() => ta.focus(), 50);

    // =============================================================
    // RETURN EDITOR OBJECT
    // =============================================================
    return {
        el: wrap,
        focus: () => ta.focus(),
        onCancel: (fn) => { cancelBtn.onclick = fn; },
        onDelete: (fn) => { deleteBtn.onclick = fn; },
        onSave: (fn) => {
            saveBtn.onclick = () => {
                const fontSize = parseInt(fontInput.value, 10) || 12;

                let trigger = null;
                if (execCheck.checked) {
                    trigger = {
                        type: typeSelect.value,
                        visualMode: visualSelect.value,
                        label: guiLabelInput.value.trim(),
                        source: {
                            path: sourceInput.value.trim()
                        },
                        playback: {
                            gain: parseFloat(gainCtrl.slider.value),
                            pan: parseFloat(panCtrl.slider.value),
                            pitch: parseFloat(pitchCtrl.slider.value),
                            fadeIn: parseFloat(fadeInCtrl.slider.value),
                            fadeOut: parseFloat(fadeOutCtrl.slider.value),
                            order: orderSelect.value,
                            toggle: toggleCheck.checked
                        },
                        playheadTrigger: playheadCheck.checked
                    };

                    // Impulse settings
                    if (typeSelect.value === "audioImpulse") {
                        trigger.impulse = {
                            rate: parseInt(rateCtrl.slider.value, 10),
                            jitter: parseFloat(jitterCtrl.slider.value),
                            poly: parseInt(polyCtrl.slider.value, 10),
                            panRandom: parseFloat(panRandCtrl.slider.value),
                            pitchRandom: parseFloat(pitchRandCtrl.slider.value),
                            lifespanMode: lifespanSelect.value,
                            lifespan: lifespanSelect.value === "fixed"
                                ? parseFloat(fixedDurInput.value)
                                : null
                        };
                    }
                }

                fn({
                    text: ta.value.trim(),
                    scope: scopeSelect.value,
                    style: { fontSize },
                    trigger
                });
            };
        },

        setRecordCallback: (existingId) => {
            recordBtn.onclick = () => {
                showRecordingModal({
                    projectName: getProjectName(),
                    annotationId: existingId,
                    suggestedName: `recording_${getStopwatchTime?.() || Date.now()}`,
                    onComplete: (result) => {
                        if (result?.path) {
                            sourceInput.value = result.path;
                            statusMsg.textContent = `âœ“ Recorded: ${result.path}`;
                            statusMsg.style.color = "#6f6";
                        }
                    },
                    onError: (err) => {
                        statusMsg.textContent = `Recording failed: ${err}`;
                        statusMsg.style.color = "#f66";
                    }
                });
            };
        },

        getConfig: () => {
            let config = {
                text: ta.value.trim(),
                scope: scopeSelect.value,
                style: { fontSize: parseInt(fontInput.value, 10) || 12 }
            };

            if (execCheck.checked) {
                config.trigger = {
                    type: typeSelect.value,
                    visualMode: visualSelect.value,
                    label: guiLabelInput.value.trim(),
                    source: { path: sourceInput.value.trim() },
                    playback: {
                        gain: parseFloat(gainCtrl.slider.value),
                        pan: parseFloat(panCtrl.slider.value),
                        pitch: parseFloat(pitchCtrl.slider.value),
                        fadeIn: parseFloat(fadeInCtrl.slider.value),
                        fadeOut: parseFloat(fadeOutCtrl.slider.value),
                        order: orderSelect.value,
                        toggle: toggleCheck.checked
                    },
                    playheadTrigger: playheadCheck.checked
                };

                if (typeSelect.value === "audioImpulse") {
                    config.trigger.impulse = {
                        rate: parseInt(rateCtrl.slider.value, 10),
                        jitter: parseFloat(jitterCtrl.slider.value),
                        poly: parseInt(polyCtrl.slider.value, 10),
                        panRandom: parseFloat(panRandCtrl.slider.value),
                        pitchRandom: parseFloat(pitchRandCtrl.slider.value),
                        lifespanMode: lifespanSelect.value,
                        lifespan: lifespanSelect.value === "fixed"
                            ? parseFloat(fixedDurInput.value)
                            : null
                    };
                }
            }

            return config;
        }
    };
}

// =============================================================
// EXPORTS
// =============================================================

export default {
    getScoreScrollInner,
    positionAnnotation,
    attachExtentHandle,
    makePinEl,
    makeEditor,
};
