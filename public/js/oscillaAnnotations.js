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
import { handleAudioCue, handleAudioPoolCue, handleAudioImpulseCue, stopAudioImpulse } from "./oscillaAudio.js";

const STORAGE_PREFIX = "oscilla_annotations_v1";

// =============================================================
// Trigger System Constants
// =============================================================
const TRIGGER_BORDER_COLOR = "rgba(0, 180, 220, 0.8)";  // cyan for audio triggers
const TRIGGER_BG_COLOR = "rgba(0, 180, 220, 0.15)";
const TRIGGER_FLASH_COLOR = "rgba(0, 220, 255, 0.4)";
const DEFAULT_AUTHOR_LABEL = "Performer";
const POLL_SOCKET_MS = 500;


window.oscillaTextInputActive = false;

let lastAnnotationFontSize = 12;

// Trigger state: track directory pools and sequential indices
const triggerPools = new Map();  // uid -> { files: [], cursor: 0 }

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

// =============================================================
// TRIGGER EXECUTION SYSTEM
// =============================================================

/**
 * Execute a trigger annotation (play audio)
 */
async function executeTrigger(annotation, labelEl) {
    const trigger = annotation.trigger;
    if (!trigger || !trigger.source?.path) {
        console.warn("[trigger] No source path configured:", annotation.id);
        return;
    }

    const { type, source, playback, impulse } = trigger;

    // --------------------------------------------
    // Playback defaults
    // --------------------------------------------
    const gain = playback?.gain ?? 1;
    const pan = playback?.pan ?? 0;
    const pitch = playback?.pitch ?? 1;
    const loop = playback?.loop ?? 1;
    const fadeIn = playback?.fadeIn ?? 0;
    const fadeOut = playback?.fadeOut ?? 0;
    const toggle = playback?.toggle ?? false;
    const order = playback?.order || "shuffle";

    flashTriggerLabel(labelEl);

    try {
        // =========================================================
        // AUDIO (single file)
        // =========================================================
        if (type === "audio") {
            const uid = `trigger-${annotation.id}`;

            await handleAudioCue({
                src: source.path,
                uid,
                amp: gain,
                pan,
                pitch,
                loop,
                fadeIn,
                fadeOut,
                toggle
            });
        }

        // =========================================================
        // AUDIO POOL (directory)
        // =========================================================
        else if (type === "audioPool") {
            const poolKey = `trigger-pool-${annotation.id}`;
            const pool = await ensureTriggerPool(poolKey, source.path, order);

            if (!pool?.files?.length) {
                console.warn("[trigger] Empty pool for:", source.path);
                return;
            }

            const file = getNextFromPool(pool, order);
            const uid = `trigger-${annotation.id}-${Date.now()}`;

            await handleAudioCue({
                src: `${source.path}/${file}`,
                uid,
                amp: gain,
                pan,
                pitch,
                loop,
                fadeIn,
                fadeOut,
                toggle: false
            });
        }

        // =========================================================
        // AUDIO IMPULSE (directory, auto-normalised)
        // =========================================================
        else if (type === "audioImpulse") {
            const uid = `trigger-impulse-${annotation.id}`;

            // Toggle off if already running
            if (window.audioImpulses?.has(uid)) {
                stopAudioImpulse(uid);
                if (labelEl) labelEl.style.borderColor = TRIGGER_BORDER_COLOR;
                return;
            }

            // 🔑 FIX: impulse path must be a directory
            let impulsePath = source.path;

            // If user selected a file, strip filename → directory
            if (impulsePath.match(/\.(wav|aif|aiff|mp3|ogg)$/i)) {
                impulsePath = impulsePath.split("/").slice(0, -1).join("/");
            }

            const rate = impulse?.rate ?? 30;
            const jitter = impulse?.jitter ?? 0;
            const poly = impulse?.poly ?? 6;
            const panRandom = impulse?.panRandom ?? 0;
            const pitchRandom = impulse?.pitchRandom ?? 0;

            await handleAudioImpulseCue(
                {
                    params: {
                        path: impulsePath,
                        mode: order,
                        rate,
                        jitter,
                        poly,
                        uid,
                        amp: gain,
                        pan,
                        pitch,
                        fadeIn,
                        fadeOut,
                        panRandom,
                        pitchRandom
                    }
                },
                null,
                {}
            );

            if (labelEl) {
                labelEl.style.borderColor = "rgba(0,255,100,0.8)";
            }
        }
    } catch (err) {
        console.error("[trigger] Execution failed:", err);
    }
}


/**
 * Flash effect when trigger fires
 */
function flashTriggerLabel(labelEl) {
    if (!labelEl) return;

    const originalBg = labelEl.style.background;
    labelEl.style.background = TRIGGER_FLASH_COLOR;
    labelEl.style.transform = "scale(1.05)";
    labelEl.style.transition = "all 0.08s ease-out";

    setTimeout(() => {
        labelEl.style.background = originalBg;
        labelEl.style.transform = "scale(1)";
    }, 100);
}

/**
 * Ensure we have a file pool for a directory trigger
 */
async function ensureTriggerPool(poolKey, dirPath, mode) {
    if (triggerPools.has(poolKey)) {
        return triggerPools.get(poolKey);
    }

    const projectName = getProjectName();
    const apiUrl = `/api/audio-list/${projectName}/${dirPath}`;

    let files = [];
    try {
        const res = await fetch(apiUrl);
        const json = await res.json();
        files = Array.isArray(json.files) ? json.files : [];
    } catch (err) {
        console.warn("[trigger] Failed to load audio list:", err);
    }

    const pool = {
        files: mode === "shuffle" ? shuffleArray([...files]) : files,
        cursor: 0,
        mode
    };

    triggerPools.set(poolKey, pool);
    return pool;
}

/**
 * Get next file from pool based on order mode
 */
function getNextFromPool(pool, order) {
    if (!pool?.files?.length) return null;

    let file;

    if (order === "random") {
        file = pool.files[Math.floor(Math.random() * pool.files.length)];
    } else {
        // sequential or shuffle
        file = pool.files[pool.cursor % pool.files.length];
        pool.cursor++;

        // Reshuffle when exhausted (for shuffle mode)
        if (order === "shuffle" && pool.cursor >= pool.files.length) {
            pool.files = shuffleArray([...pool.files]);
            pool.cursor = 0;
        }
    }

    return file;
}

/**
 * Fisher-Yates shuffle
 */
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// =============================================================
// PLAYHEAD TRIGGER SYSTEM
// =============================================================
// Track which annotations have been triggered by playhead
// to prevent re-triggering on every frame
const playheadTriggeredAnnotations = new Set();

/**
 * Check if any playhead-triggered annotations should fire.
 * Called from the animation loop via window.checkAnnotationPlayheadTriggers()
 */
export function checkAnnotationPlayheadTriggers() {
    if (!state.enabled || !state.items?.length) return;

    const playheadX = window.playheadX;
    const scoreWidth = window.scoreWidth;
    if (playheadX == null || !scoreWidth) return;

    // Get the score container for coordinate conversion
    const container = getScoreContainer();
    const inner = getScoreScrollInner();
    if (!container || !inner) return;

    const localScale = window.localScale || 1;

    for (const annotation of state.items) {
        // Only check trigger annotations with playheadTrigger enabled
        if (annotation.kind !== "trigger") continue;
        if (!annotation.trigger?.playheadTrigger) continue;

        // Get annotation's x position in score coordinates
        const annX = annotation.placement?.x ?? 0;

        // Convert to world coordinates (same space as playheadX)
        // The annotation x is stored in rendered pixels, convert to world units
        const annWorldX = annX / localScale;

        // Define a trigger zone (annotation position ± tolerance)
        const tolerance = 20 / localScale; // 20 pixels tolerance in world units
        const triggerLeft = annWorldX - tolerance;
        const triggerRight = annWorldX + tolerance;

        // Check if playhead is within trigger zone
        const isInside = playheadX >= triggerLeft && playheadX <= triggerRight;

        // Track previous state
        const wasInside = playheadTriggeredAnnotations.has(annotation.id);

        // Trigger on entry (forward direction)
        if (isInside && !wasInside) {
            console.log(`[annotation:playhead] Triggering: ${annotation.id} at x=${annWorldX}`);

            // Find the label element for visual feedback
            const labelEl = document.querySelector(`[data-annotation-id="${annotation.id}"]`);
            executeTrigger(annotation, labelEl);

            playheadTriggeredAnnotations.add(annotation.id);
        }

        // Clear triggered state when playhead exits (allows re-trigger on rewind)
        if (!isInside && wasInside) {
            playheadTriggeredAnnotations.delete(annotation.id);
        }
    }
}

/**
 * Reset playhead trigger state (call on rewind, jump, etc.)
 */
export function resetAnnotationPlayheadTriggers() {
    playheadTriggeredAnnotations.clear();
    console.log("[annotation:playhead] Reset triggered state");
}

// Expose to window for integration with animation loop
window.checkAnnotationPlayheadTriggers = checkAnnotationPlayheadTriggers;
window.resetAnnotationPlayheadTriggers = resetAnnotationPlayheadTriggers;

/**
 * Open audio browser dialog (supports subdirectories)
 */
async function openAudioBrowser(sourceInput, statusMsg) {
    const projectName = getProjectName();
    let currentPath = ""; // relative to audio root

    statusMsg.textContent = "Loading audio files…";

    async function loadAndShow(path) {
        try {
            const url = path
                ? `/api/audio-tree/${projectName}/${path}`
                : `/api/audio-tree/${projectName}`;

            const res = await fetch(url);
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();

            const modal = createAudioBrowserModal({
                ...data,
                currentPath: path,
                onNavigate: loadAndShow,
                onSelect: (selectedPath) => {
                    sourceInput.value = selectedPath;
                    statusMsg.textContent = `Selected: ${selectedPath}`;
                }
            });

            document.body.appendChild(modal);
            statusMsg.textContent = "";

        } catch (err) {
            console.error("[audioBrowser] Failed:", err);
            statusMsg.textContent = "Failed to load audio files";
        }
    }

    loadAndShow(currentPath);
}

/**
 * Create the audio browser modal UI (navigable tree)
 *
 * Expected data shape:
 * {
 *   directories: [],
 *   files: [],
 *   currentPath: "",          // relative to audio root
 *   onNavigate: fn(path),
 *   onSelect: fn(relativePath)
 * }
 */
function createAudioBrowserModal({
    directories = [],
    files = [],
    currentPath = "",
    onNavigate,
    onSelect
}) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0,0,0,0.7)";
    overlay.style.zIndex = "1000000";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    const modal = document.createElement("div");
    modal.style.background = "rgba(30,30,30,0.98)";
    modal.style.borderRadius = "12px";
    modal.style.padding = "16px";
    modal.style.minWidth = "320px";
    modal.style.maxWidth = "520px";
    modal.style.maxHeight = "70vh";
    modal.style.overflow = "auto";
    modal.style.border = "1px solid rgba(255,255,255,0.15)";

    // --------------------------------------------------
    // Header
    // --------------------------------------------------
    const title = document.createElement("div");
    title.style.display = "flex";
    title.style.alignItems = "center";
    title.style.justifyContent = "space-between";
    title.style.marginBottom = "10px";

    const titleText = document.createElement("div");
    titleText.textContent = "Select Audio";
    titleText.style.color = "white";
    titleText.style.fontSize = "14px";
    titleText.style.fontWeight = "600";

    const pathText = document.createElement("div");
    pathText.textContent = currentPath ? `/${currentPath}` : "/audio";
    pathText.style.fontSize = "11px";
    pathText.style.opacity = "0.7";
    pathText.style.color = "white";

    title.appendChild(titleText);
    title.appendChild(pathText);
    modal.appendChild(title);

    // --------------------------------------------------
    // List
    // --------------------------------------------------
    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "4px";

    // --------------------------------------------------
    // Up navigation
    // --------------------------------------------------
    if (currentPath) {
        const up = document.createElement("div");
        up.textContent = "⬆ ..";
        up.style.padding = "6px 10px";
        up.style.borderRadius = "4px";
        up.style.cursor = "pointer";
        up.style.fontSize = "12px";
        up.style.color = "rgba(255,255,255,0.85)";
        up.style.background = "rgba(255,255,255,0.08)";
        up.onmouseenter = () => up.style.background = "rgba(255,255,255,0.18)";
        up.onmouseleave = () => up.style.background = "rgba(255,255,255,0.08)";

        up.onclick = () => {
            const parent = currentPath.split("/").slice(0, -1).join("/");
            overlay.remove();
            onNavigate(parent);
        };

        list.appendChild(up);
    }

    // --------------------------------------------------
    // Directories
    // --------------------------------------------------
    if (directories.length) {
        const dirHeader = document.createElement("div");
        dirHeader.textContent = "📁 Directories (click to enter, double-click to select for pool)";
        dirHeader.style.fontSize = "11px";
        dirHeader.style.opacity = "0.7";
        dirHeader.style.margin = "6px 0 2px 0";
        dirHeader.style.color = "white";
        list.appendChild(dirHeader);

        for (const dir of directories) {
            const item = document.createElement("div");
            item.style.display = "flex";
            item.style.alignItems = "center";
            item.style.justifyContent = "space-between";
            item.style.padding = "6px 10px";
            item.style.borderRadius = "4px";
            item.style.cursor = "pointer";
            item.style.fontSize = "12px";
            item.style.color = "white";
            item.style.background = "rgba(0,180,220,0.12)";
            item.onmouseenter = () => item.style.background = "rgba(0,180,220,0.28)";
            item.onmouseleave = () => item.style.background = "rgba(0,180,220,0.12)";

            const nameSpan = document.createElement("span");
            nameSpan.textContent = `📁 ${dir}`;
            item.appendChild(nameSpan);

            // Select button for choosing directory as pool source
            const selectBtn = document.createElement("button");
            selectBtn.textContent = "Select";
            selectBtn.style.padding = "2px 8px";
            selectBtn.style.fontSize = "10px";
            selectBtn.style.borderRadius = "4px";
            selectBtn.style.border = "1px solid rgba(0,180,220,0.5)";
            selectBtn.style.background = "rgba(0,180,220,0.2)";
            selectBtn.style.color = "rgba(0,220,255,0.95)";
            selectBtn.style.cursor = "pointer";
            selectBtn.onclick = (e) => {
                e.stopPropagation();
                const selected = currentPath ? `${currentPath}/${dir}` : dir;
                onSelect(selected);
                overlay.remove();
            };
            item.appendChild(selectBtn);

            // Click on row navigates into directory
            item.onclick = () => {
                const next = currentPath
                    ? `${currentPath}/${dir}`
                    : dir;
                overlay.remove();
                onNavigate(next);
            };

            list.appendChild(item);
        }
    }

    // --------------------------------------------------
    // "Select Current Directory" button if we're in a subdirectory
    // --------------------------------------------------
    if (currentPath && files.length > 0) {
        const selectDirBtn = document.createElement("div");
        selectDirBtn.textContent = `✓ Select this directory (${currentPath})`;
        selectDirBtn.style.padding = "8px 12px";
        selectDirBtn.style.margin = "8px 0";
        selectDirBtn.style.borderRadius = "6px";
        selectDirBtn.style.cursor = "pointer";
        selectDirBtn.style.fontSize = "12px";
        selectDirBtn.style.fontWeight = "500";
        selectDirBtn.style.color = "rgba(0,220,255,0.95)";
        selectDirBtn.style.background = "rgba(0,180,220,0.2)";
        selectDirBtn.style.border = "1px solid rgba(0,180,220,0.4)";
        selectDirBtn.style.textAlign = "center";
        selectDirBtn.onmouseenter = () => selectDirBtn.style.background = "rgba(0,180,220,0.35)";
        selectDirBtn.onmouseleave = () => selectDirBtn.style.background = "rgba(0,180,220,0.2)";
        selectDirBtn.onclick = () => {
            onSelect(currentPath);
            overlay.remove();
        };
        list.appendChild(selectDirBtn);
    }

    // --------------------------------------------------
    // Files
    // --------------------------------------------------
    if (files.length) {
        const fileHeader = document.createElement("div");
        fileHeader.textContent = "🔊 Files";
        fileHeader.style.fontSize = "11px";
        fileHeader.style.opacity = "0.6";
        fileHeader.style.margin = "8px 0 2px 0";
        fileHeader.style.color = "white";
        list.appendChild(fileHeader);

        for (const file of files) {
            const item = document.createElement("div");
            item.textContent = `🔊 ${file}`;
            item.style.padding = "6px 10px";
            item.style.borderRadius = "4px";
            item.style.cursor = "pointer";
            item.style.fontSize = "12px";
            item.style.color = "white";
            item.style.background = "rgba(255,255,255,0.06)";
            item.onmouseenter = () => item.style.background = "rgba(255,255,255,0.14)";
            item.onmouseleave = () => item.style.background = "rgba(255,255,255,0.06)";

            item.onclick = () => {
                const selected = currentPath
                    ? `${currentPath}/${file}`
                    : file;
                onSelect(selected);
                overlay.remove();
            };

            list.appendChild(item);
        }
    }

    modal.appendChild(list);

    // --------------------------------------------------
    // Footer
    // --------------------------------------------------
    const footer = document.createElement("div");
    footer.style.display = "flex";
    footer.style.justifyContent = "flex-end";
    footer.style.marginTop = "12px";

    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancel";
    cancelBtn.style.padding = "6px 12px";
    cancelBtn.style.borderRadius = "6px";
    cancelBtn.style.border = "1px solid rgba(255,255,255,0.2)";
    cancelBtn.style.background = "transparent";
    cancelBtn.style.color = "white";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.onclick = () => overlay.remove();

    footer.appendChild(cancelBtn);
    modal.appendChild(footer);

    overlay.appendChild(modal);

    overlay.onclick = (e) => {
        if (e.target === overlay) overlay.remove();
    };

    return overlay;
}

/**
 * Handle audio file upload
 */
/**
 * Handle audio file upload with conflict resolution
 * @param {File} file - The file to upload
 * @param {HTMLInputElement} sourceInput - The source path input element
 * @param {HTMLElement} statusMsg - Status message element
 * @param {boolean} forceOverwrite - If true, overwrite existing file
 */
async function handleAudioUpload(file, sourceInput, statusMsg, forceOverwrite = false) {
    if (!file) return;

    const projectName = getProjectName();

    // Get the target directory from sourceInput (if it looks like a directory path)
    let subdir = "";
    const currentSource = sourceInput.value.trim();

    // If source already has a path that looks like a directory (no file extension), use it
    if (currentSource && !currentSource.match(/\.(wav|aif|aiff|mp3|ogg|m4a)$/i)) {
        subdir = currentSource;
    }

    statusMsg.textContent = `Uploading ${file.name}${subdir ? ` to ${subdir}/` : ""}...`;

    try {
        const formData = new FormData();
        formData.append("audio", file);

        let url = `/api/upload-audio/${projectName}`;
        const params = new URLSearchParams();
        if (subdir) params.set("subdir", subdir);
        if (forceOverwrite) params.set("overwrite", "true");
        if (params.toString()) url += `?${params.toString()}`;

        const res = await fetch(url, {
            method: "POST",
            body: formData
        });

        const result = await res.json();

        // Handle conflict (file exists)
        if (res.status === 409 && result.conflict) {
            // Show conflict dialog
            const action = await showUploadConflictDialog(file.name, result.path);

            if (action === "overwrite") {
                // Retry with overwrite flag
                return handleAudioUpload(file, sourceInput, statusMsg, true);
            } else if (action === "rename") {
                // Let user rename
                const newName = await showRenameDialog(file.name);
                if (newName && newName !== file.name) {
                    // Create a new file with the new name
                    const renamedFile = new File([file], newName, { type: file.type });
                    return handleAudioUpload(renamedFile, sourceInput, statusMsg, false);
                } else {
                    statusMsg.textContent = "Upload cancelled";
                    return;
                }
            } else {
                // Cancel
                statusMsg.textContent = "Upload cancelled";
                return;
            }
        }

        if (!res.ok) {
            throw new Error(result.error || "Upload failed");
        }

        sourceInput.value = result.path || file.name;
        statusMsg.textContent = `✓ Uploaded: ${result.path}${result.overwritten ? " (overwritten)" : ""}`;

    } catch (err) {
        console.error("[upload] Failed:", err);
        statusMsg.textContent = `✗ Upload failed: ${err.message}`;
    }
}

/**
 * Show a dialog when upload conflicts with existing file
 */
function showUploadConflictDialog(filename, path) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 1000001;
            background: rgba(0,0,0,0.75);
            display: flex; align-items: center; justify-content: center;
        `;

        const dialog = document.createElement("div");
        dialog.style.cssText = `
            background: rgba(30,30,30,0.98); border-radius: 12px;
            padding: 20px; max-width: 400px; color: white;
            border: 1px solid rgba(255,255,255,0.15);
        `;

        dialog.innerHTML = `
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">
                ⚠️ File Already Exists
            </div>
            <div style="font-size: 12px; opacity: 0.9; margin-bottom: 16px;">
                <strong>${filename}</strong> already exists at <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">${path}</code>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button id="conflict-cancel" style="padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: white; cursor: pointer;">
                    Cancel
                </button>
                <button id="conflict-rename" style="padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(0,180,220,0.4); background: rgba(0,180,220,0.15); color: rgba(0,220,255,0.95); cursor: pointer;">
                    Rename
                </button>
                <button id="conflict-overwrite" style="padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(255,100,100,0.4); background: rgba(255,100,100,0.15); color: rgba(255,150,150,0.95); cursor: pointer;">
                    Overwrite
                </button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const cleanup = () => overlay.remove();

        dialog.querySelector("#conflict-cancel").onclick = () => { cleanup(); resolve("cancel"); };
        dialog.querySelector("#conflict-rename").onclick = () => { cleanup(); resolve("rename"); };
        dialog.querySelector("#conflict-overwrite").onclick = () => { cleanup(); resolve("overwrite"); };

        overlay.onclick = (e) => {
            if (e.target === overlay) { cleanup(); resolve("cancel"); }
        };
    });
}

/**
 * Show a dialog to rename a file
 */
function showRenameDialog(originalName) {
    return new Promise((resolve) => {
        const overlay = document.createElement("div");
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 1000001;
            background: rgba(0,0,0,0.75);
            display: flex; align-items: center; justify-content: center;
        `;

        // Split name and extension
        const lastDot = originalName.lastIndexOf(".");
        const baseName = lastDot > 0 ? originalName.substring(0, lastDot) : originalName;
        const ext = lastDot > 0 ? originalName.substring(lastDot) : "";

        const dialog = document.createElement("div");
        dialog.style.cssText = `
            background: rgba(30,30,30,0.98); border-radius: 12px;
            padding: 20px; max-width: 400px; color: white;
            border: 1px solid rgba(255,255,255,0.15);
        `;

        dialog.innerHTML = `
            <div style="font-size: 14px; font-weight: 600; margin-bottom: 12px;">
                Rename File
            </div>
            <div style="display: flex; gap: 4px; align-items: center; margin-bottom: 16px;">
                <input type="text" id="rename-input" value="${baseName}" style="
                    flex: 1; padding: 8px; border-radius: 6px;
                    border: 1px solid rgba(255,255,255,0.2);
                    background: rgba(0,0,0,0.3); color: white;
                ">
                <span style="opacity: 0.7;">${ext}</span>
            </div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button id="rename-cancel" style="padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.2); background: transparent; color: white; cursor: pointer;">
                    Cancel
                </button>
                <button id="rename-ok" style="padding: 8px 16px; border-radius: 6px; border: 1px solid rgba(0,180,220,0.4); background: rgba(0,180,220,0.15); color: rgba(0,220,255,0.95); cursor: pointer;">
                    OK
                </button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const input = dialog.querySelector("#rename-input");
        input.focus();
        input.select();

        const cleanup = () => overlay.remove();

        const doRename = () => {
            const newBase = input.value.trim();
            cleanup();
            if (newBase && newBase !== baseName) {
                resolve(newBase + ext);
            } else {
                resolve(null);
            }
        };

        dialog.querySelector("#rename-cancel").onclick = () => { cleanup(); resolve(null); };
        dialog.querySelector("#rename-ok").onclick = doRename;
        input.onkeydown = (e) => {
            if (e.key === "Enter") doRename();
            if (e.key === "Escape") { cleanup(); resolve(null); }
        };

        overlay.onclick = (e) => {
            if (e.target === overlay) { cleanup(); resolve(null); }
        };
    });
}

// =============================================================
// END TRIGGER SYSTEM
// =============================================================

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

function getScoreClickPlacement(evt) {
    // IMPORTANT:
    // placement.x/y are stored in oscilla-score-inner coordinates (scroll-content space),
    // because the score annotation layer is appended to .oscilla-score-inner.
    const score = getScoreContainer();
    if (!score) return null;

    const inner = getScoreScrollInner?.() || score.querySelector(".oscilla-score-inner");
    if (!inner) return null;

    const r = inner.getBoundingClientRect();

    return {
        x: evt.clientX - r.left,
        y: evt.clientY - r.top,
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




function makeDraggable(el, handleEl = el) {
    let startX = 0, startY = 0;
    let originX = 0, originY = 0;
    let dragging = false;

    handleEl.style.cursor = "move";

    handleEl.addEventListener("mousedown", e => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = el.getBoundingClientRect();
        originX = rect.left;
        originY = rect.top;
        e.preventDefault();
    });

    window.addEventListener("mousemove", e => {
        if (!dragging) return;

        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        const w = el.offsetWidth;
        const h = el.offsetHeight;

        // Clamp to viewport
        const x = Math.min(
            window.innerWidth - 20,
            Math.max(20, originX + dx)
        );
        const y = Math.min(
            window.innerHeight - 20,
            Math.max(20, originY + dy)
        );

        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
    });

    window.addEventListener("mouseup", () => {
        dragging = false;
    });
}




function makeEditor({
    x,
    y,
    initialText = "",
    initialScope = null,
    initialFontSize = null,
    initialTrigger = null  // { type, source, playback } or null
}) {
    const wrap = document.createElement("div");
    wrap.className = "osc-anno-editor";
    wrap.style.position = "fixed";

    const maxX = window.innerWidth - 380; // editor width + margin
    const maxY = window.innerHeight - 240; // enough to show Save button

    wrap.style.left = `${Math.max(20, Math.min(x, maxX))}px`;
    wrap.style.top = `${Math.max(20, Math.min(y, maxY))}px`;

    wrap.style.zIndex = "999999";
    wrap.style.maxWidth = "360px";
    wrap.style.background = "rgba(20,20,20,0.92)";
    wrap.style.color = "white";
    wrap.style.border = "1px solid rgba(255,255,255,0.15)";
    wrap.style.borderRadius = "10px";
    wrap.style.padding = "10px";
    wrap.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
    wrap.style.backdropFilter = "blur(6px)";
    wrap.style.pointerEvents = "auto";


    // -----------------------------
    // Header (drag handle)
    // -----------------------------
    const header = document.createElement("div");
    header.textContent = "Annotation";
    header.style.fontSize = "12px";
    header.style.fontWeight = "600";
    header.style.marginBottom = "6px";
    header.style.padding = "4px 6px";
    header.style.background = "rgba(255,255,255,0.06)";
    header.style.borderRadius = "6px";
    header.style.cursor = "move";
    header.style.userSelect = "none";

    wrap.appendChild(header);


    const ta = document.createElement("textarea");
    ta.value = initialText;
    ta.placeholder = "Annotation…";
    ta.rows = 3;
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


    // =============================================================
    // TRIGGER CONTROLS (Executable checkbox + full audio config)
    // =============================================================
    const triggerSection = document.createElement("div");
    triggerSection.style.marginTop = "10px";
    triggerSection.style.padding = "8px";
    triggerSection.style.background = "rgba(0,180,220,0.08)";
    triggerSection.style.borderRadius = "8px";
    triggerSection.style.border = "1px solid rgba(0,180,220,0.2)";

    // Executable checkbox row
    const execRow = document.createElement("div");
    execRow.style.display = "flex";
    execRow.style.alignItems = "center";
    execRow.style.gap = "8px";

    const execChk = document.createElement("input");
    execChk.type = "checkbox";
    execChk.id = "anno-exec-chk";
    execChk.checked = !!initialTrigger;

    const execLabel = document.createElement("label");
    execLabel.htmlFor = "anno-exec-chk";
    execLabel.textContent = "Executable (trigger)";
    execLabel.style.fontSize = "12px";
    execLabel.style.fontWeight = "500";
    execLabel.style.color = "rgba(0,200,255,0.95)";
    execLabel.style.cursor = "pointer";

    execRow.appendChild(execChk);
    execRow.appendChild(execLabel);
    triggerSection.appendChild(execRow);

    // Playhead trigger checkbox row (only visible when executable is checked)
    const playheadTriggerRow = document.createElement("div");
    playheadTriggerRow.style.display = "flex";
    playheadTriggerRow.style.alignItems = "center";
    playheadTriggerRow.style.gap = "8px";
    playheadTriggerRow.style.marginTop = "6px";
    playheadTriggerRow.style.marginLeft = "20px";
    playheadTriggerRow.style.display = initialTrigger ? "flex" : "none";

    const playheadTriggerChk = document.createElement("input");
    playheadTriggerChk.type = "checkbox";
    playheadTriggerChk.id = "anno-playhead-trigger-chk";
    playheadTriggerChk.checked = initialTrigger?.playheadTrigger ?? false;

    const playheadTriggerLabel = document.createElement("label");
    playheadTriggerLabel.htmlFor = "anno-playhead-trigger-chk";
    playheadTriggerLabel.textContent = "Playhead trigger";
    playheadTriggerLabel.style.fontSize = "11px";
    playheadTriggerLabel.style.color = "rgba(255,200,100,0.95)";
    playheadTriggerLabel.style.cursor = "pointer";
    playheadTriggerLabel.title = "Trigger automatically when playhead crosses this annotation";

    playheadTriggerRow.appendChild(playheadTriggerChk);
    playheadTriggerRow.appendChild(playheadTriggerLabel);
    triggerSection.appendChild(playheadTriggerRow);

    // Trigger config container (shown when executable is checked)
    const triggerConfig = document.createElement("div");
    triggerConfig.style.marginTop = "8px";
    triggerConfig.style.display = initialTrigger ? "block" : "none";

    // Helper to create labeled row
    const makeRow = (labelText, ...elements) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.marginBottom = "6px";

        const label = document.createElement("label");
        label.textContent = labelText;
        label.style.fontSize = "11px";
        label.style.opacity = "0.8";
        label.style.minWidth = "55px";
        row.appendChild(label);

        elements.forEach(el => row.appendChild(el));
        return row;
    };

    // Helper to create slider with value display
    const makeSlider = (min, max, step, initial, suffix = "") => {
        const container = document.createElement("div");
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.gap = "6px";
        container.style.flex = "1";

        const slider = document.createElement("input");
        slider.type = "range";
        slider.min = min;
        slider.max = max;
        slider.step = step;
        slider.value = initial;
        slider.style.flex = "1";

        const valueSpan = document.createElement("span");
        valueSpan.textContent = initial + suffix;
        valueSpan.style.fontSize = "10px";
        valueSpan.style.minWidth = "35px";
        valueSpan.style.textAlign = "right";
        valueSpan.style.opacity = "0.9";

        slider.oninput = () => {
            valueSpan.textContent = parseFloat(slider.value).toFixed(step < 1 ? 2 : 0) + suffix;
        };

        container.appendChild(slider);
        container.appendChild(valueSpan);
        return { container, slider, valueSpan };
    };

    // Helper to style select
    const styleSelect = (select) => {
        select.style.flex = "1";
        select.style.padding = "4px 6px";
        select.style.borderRadius = "4px";
        select.style.border = "1px solid rgba(255,255,255,0.2)";
        select.style.background = "rgba(0,0,0,0.3)";
        select.style.color = "white";
        select.style.fontSize = "11px";
        return select;
    };

    // Helper to style input
    const styleInput = (input) => {
        input.style.flex = "1";
        input.style.padding = "4px 6px";
        input.style.borderRadius = "4px";
        input.style.border = "1px solid rgba(255,255,255,0.2)";
        input.style.background = "rgba(0,0,0,0.3)";
        input.style.color = "white";
        input.style.fontSize = "11px";
        return input;
    };

    // ==================== TYPE SELECTOR ====================
    const typeSelect = styleSelect(document.createElement("select"));
    typeSelect.innerHTML = `
        <option value="audio">Audio (single file)</option>
        <option value="audioPool">Audio Pool (directory)</option>
        <option value="audioImpulse">Audio Impulse (continuous)</option>
    `;
    typeSelect.value = initialTrigger?.type || "audio";
    triggerConfig.appendChild(makeRow("Type", typeSelect));

    // ==================== SOURCE ====================
    const sourceInput = styleInput(document.createElement("input"));
    sourceInput.type = "text";
    sourceInput.placeholder = "path/to/file.wav or directory";
    sourceInput.value = initialTrigger?.source?.path || "";

    const browseBtn = document.createElement("button");
    browseBtn.textContent = "📁";
    browseBtn.title = "Browse audio files";
    browseBtn.style.padding = "4px 8px";
    browseBtn.style.borderRadius = "4px";
    browseBtn.style.border = "1px solid rgba(255,255,255,0.2)";
    browseBtn.style.background = "rgba(255,255,255,0.1)";
    browseBtn.style.color = "white";
    browseBtn.style.cursor = "pointer";

    triggerConfig.appendChild(makeRow("Source", sourceInput, browseBtn));

    // ==================== PLAYBACK ORDER (pool/impulse only) ====================
    const modeSelect = styleSelect(document.createElement("select"));
    modeSelect.innerHTML = `
        <option value="shuffle">Shuffle (no repeat)</option>
        <option value="sequential">Sequential</option>
        <option value="random">Random</option>
    `;
    modeSelect.value = initialTrigger?.playback?.order || "shuffle";
    const modeRow = makeRow("Order", modeSelect);
    triggerConfig.appendChild(modeRow);

    // ==================== GAIN ====================
    const gainCtrl = makeSlider(0, 1, 0.05, initialTrigger?.playback?.gain ?? 1);
    triggerConfig.appendChild(makeRow("Gain", gainCtrl.container));

    // ==================== PAN ====================
    const panCtrl = makeSlider(-1, 1, 0.1, initialTrigger?.playback?.pan ?? 0);
    triggerConfig.appendChild(makeRow("Pan", panCtrl.container));

    // ==================== PITCH ====================
    const pitchCtrl = makeSlider(0.25, 2, 0.05, initialTrigger?.playback?.pitch ?? 1, "x");
    triggerConfig.appendChild(makeRow("Pitch", pitchCtrl.container));

    // ==================== LOOP (audio/audioPool only) ====================
    const loopSelect = styleSelect(document.createElement("select"));
    loopSelect.innerHTML = `
        <option value="1">Once</option>
        <option value="2">2x</option>
        <option value="3">3x</option>
        <option value="4">4x</option>
        <option value="0">Loop ∞</option>
    `;
    loopSelect.value = String(initialTrigger?.playback?.loop ?? 1);
    const loopRow = makeRow("Loop", loopSelect);
    triggerConfig.appendChild(loopRow);

    // ==================== FADE IN/OUT (audio/audioPool only) ====================
    const fadeInCtrl = makeSlider(0, 2, 0.05, initialTrigger?.playback?.fadeIn ?? 0, "s");
    const fadeInRow = makeRow("Fade In", fadeInCtrl.container);
    triggerConfig.appendChild(fadeInRow);

    const fadeOutCtrl = makeSlider(0, 2, 0.05, initialTrigger?.playback?.fadeOut ?? 0, "s");
    const fadeOutRow = makeRow("Fade Out", fadeOutCtrl.container);
    triggerConfig.appendChild(fadeOutRow);

    // ==================== TOGGLE MODE (audio only) ====================
    const toggleChk = document.createElement("input");
    toggleChk.type = "checkbox";
    toggleChk.checked = initialTrigger?.playback?.toggle ?? false;
    const toggleLabel = document.createElement("span");
    toggleLabel.textContent = "Click to start/stop";
    toggleLabel.style.fontSize = "11px";
    const toggleRow = makeRow("Toggle", toggleChk, toggleLabel);
    triggerConfig.appendChild(toggleRow);

    // ==================== IMPULSE-SPECIFIC CONTROLS ====================
    const impulseSection = document.createElement("div");
    impulseSection.style.marginTop = "8px";
    impulseSection.style.paddingTop = "8px";
    impulseSection.style.borderTop = "1px solid rgba(255,255,255,0.1)";

    const impulseSectionLabel = document.createElement("div");
    impulseSectionLabel.textContent = "Impulse Settings";
    impulseSectionLabel.style.fontSize = "11px";
    impulseSectionLabel.style.fontWeight = "500";
    impulseSectionLabel.style.color = "rgba(0,200,255,0.8)";
    impulseSectionLabel.style.marginBottom = "6px";
    impulseSection.appendChild(impulseSectionLabel);

    // Rate (hits per minute)
    const rateCtrl = makeSlider(1, 120, 1, initialTrigger?.impulse?.rate ?? 30, "/min");
    impulseSection.appendChild(makeRow("Rate", rateCtrl.container));

    // Jitter (randomness 0-100%)
    const jitterCtrl = makeSlider(0, 100, 5, (initialTrigger?.impulse?.jitter ?? 0) * 100, "%");
    impulseSection.appendChild(makeRow("Jitter", jitterCtrl.container));

    // Polyphony
    const polySelect = styleSelect(document.createElement("select"));
    polySelect.innerHTML = `
        <option value="1">1 (mono)</option>
        <option value="2">2</option>
        <option value="4">4</option>
        <option value="6">6</option>
        <option value="8">8</option>
        <option value="12">12</option>
    `;
    polySelect.value = String(initialTrigger?.impulse?.poly ?? 6);
    impulseSection.appendChild(makeRow("Polyphony", polySelect));

    // Per-impulse randomization header
    const randomHeader = document.createElement("div");
    randomHeader.textContent = "Per-Impulse Randomization";
    randomHeader.style.fontSize = "10px";
    randomHeader.style.opacity = "0.7";
    randomHeader.style.marginTop = "8px";
    randomHeader.style.marginBottom = "4px";
    impulseSection.appendChild(randomHeader);

    // Pan randomization (± range around base pan)
    const panRandomCtrl = makeSlider(0, 1, 0.05, initialTrigger?.impulse?.panRandom ?? 0);
    impulseSection.appendChild(makeRow("Pan ±", panRandomCtrl.container));

    // Pitch randomization (± range around base pitch, in semitones-ish)
    const pitchRandomCtrl = makeSlider(0, 0.5, 0.05, initialTrigger?.impulse?.pitchRandom ?? 0, "x");
    impulseSection.appendChild(makeRow("Pitch ±", pitchRandomCtrl.container));

    triggerConfig.appendChild(impulseSection);

    // ==================== UPLOAD ====================
    const uploadRow = document.createElement("div");
    uploadRow.style.marginTop = "8px";
    uploadRow.style.display = "flex";
    uploadRow.style.gap = "6px";

    const uploadInput = document.createElement("input");
    uploadInput.type = "file";
    uploadInput.accept = "audio/*";
    uploadInput.style.display = "none";

    const uploadBtn = document.createElement("button");
    uploadBtn.textContent = "⬆ Upload Audio";
    uploadBtn.style.flex = "1";
    uploadBtn.style.padding = "6px";
    uploadBtn.style.borderRadius = "4px";
    uploadBtn.style.border = "1px solid rgba(0,180,220,0.4)";
    uploadBtn.style.background = "rgba(0,180,220,0.15)";
    uploadBtn.style.color = "rgba(0,220,255,0.95)";
    uploadBtn.style.cursor = "pointer";
    uploadBtn.style.fontSize = "11px";

    uploadBtn.onclick = () => uploadInput.click();

    uploadRow.appendChild(uploadInput);
    uploadRow.appendChild(uploadBtn);
    triggerConfig.appendChild(uploadRow);

    // Status message area
    const statusMsg = document.createElement("div");
    statusMsg.style.marginTop = "6px";
    statusMsg.style.fontSize = "10px";
    statusMsg.style.color = "rgba(0,220,255,0.8)";
    statusMsg.style.minHeight = "14px";
    triggerConfig.appendChild(statusMsg);

    triggerSection.appendChild(triggerConfig);
    wrap.appendChild(triggerSection);

    // ==================== VISIBILITY LOGIC ====================
    const updateVisibility = () => {
        const type = typeSelect.value;
        const isAudio = type === "audio";
        const isPool = type === "audioPool";
        const isImpulse = type === "audioImpulse";

        // Order: pool and impulse only
        modeRow.style.display = (isPool || isImpulse) ? "flex" : "none";

        // Loop, fade, toggle: audio and pool only
        loopRow.style.display = (isAudio || isPool) ? "flex" : "none";
        fadeInRow.style.display = (isAudio || isPool) ? "flex" : "none";
        fadeOutRow.style.display = (isAudio || isPool) ? "flex" : "none";
        toggleRow.style.display = isAudio ? "flex" : "none";

        // Impulse section: impulse only
        impulseSection.style.display = isImpulse ? "block" : "none";
    };

    // Toggle trigger config visibility
    execChk.onchange = () => {
        const show = execChk.checked;
        triggerConfig.style.display = show ? "block" : "none";
        playheadTriggerRow.style.display = show ? "flex" : "none";
    };

    typeSelect.onchange = updateVisibility;
    updateVisibility();


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

makeDraggable(wrap, header);


    return {
        wrap,
        ta,
        scopeChk,
        fontInput,
        btnSave,
        btnCancel,
        footer,
        // Trigger controls
        execChk,
        typeSelect,
        sourceInput,
        modeSelect,
        uploadInput,
        browseBtn,
        statusMsg,
        playheadTriggerChk,
        // Helper to get trigger config
        getTriggerConfig: () => {
            if (!execChk.checked) return null;

            const type = typeSelect.value;
            const config = {
                type,
                playheadTrigger: playheadTriggerChk.checked,
                source: {
                    mode: type === "audio" ? "file" : "directory",
                    path: sourceInput.value.trim()
                },
                playback: {
                    order: modeSelect.value,
                    gain: parseFloat(gainCtrl.slider.value),
                    pan: parseFloat(panCtrl.slider.value),
                    pitch: parseFloat(pitchCtrl.slider.value),
                    loop: parseInt(loopSelect.value, 10),
                    fadeIn: parseFloat(fadeInCtrl.slider.value),
                    fadeOut: parseFloat(fadeOutCtrl.slider.value),
                    toggle: toggleChk.checked
                }
            };

            // Add impulse-specific settings
            if (type === "audioImpulse") {
                config.impulse = {
                    rate: parseInt(rateCtrl.slider.value, 10),
                    jitter: parseFloat(jitterCtrl.slider.value) / 100,
                    poly: parseInt(polySelect.value, 10),
                    panRandom: parseFloat(panRandomCtrl.slider.value),
                    pitchRandom: parseFloat(pitchRandomCtrl.slider.value)
                };
            }

            return config;
        }
    };
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



function positionAnnotation(el, annotation) {
    // IMPORTANT:
    // Since the score layer is inside .oscilla-score-inner, left/top must be set directly
    // from stored placement (inner-space). No scroll/container math here.
    if (!el || !annotation?.placement) return;
    el.style.left = `${annotation.placement.x}px`;
    el.style.top = `${annotation.placement.y}px`;
}


function makePinEl(annotation, onClick) {
    const pin = document.createElement("div");
    pin.className = "osc-anno-pin";
    pin.style.position = "absolute";

    positionAnnotation(pin, annotation);

    pin.style.pointerEvents = "auto";
    pin.style.userSelect = "none";

    const isTrigger = annotation.kind === "trigger" && annotation.trigger;

    // -----------------------------
    // Label (drag + click) — FIXED
    // -----------------------------
    const label = document.createElement("div");
    label.textContent =
        annotation.text.length > 300
            ? annotation.text.slice(0, 300) + "…"
            : annotation.text;




    // --- layout isolation ---
    label.style.position = "relative";
    label.style.display = "inline-block";
    label.style.minWidth = "max-content";
    label.style.maxWidth = "360px";
    label.style.boxSizing = "border-box";
    label.style.contain = "layout paint";

    // --- text behaviour ---
    label.style.whiteSpace = "pre-wrap";
    label.style.wordBreak = "break-word";
    label.style.overflowWrap = "anywhere";
    label.style.writingMode = "horizontal-tb";
    label.style.textOrientation = "mixed";
    label.style.direction = "ltr";
    label.style.hyphens = "none";
    label.style.lineBreak = "auto";

    // --- visuals ---
    label.style.marginTop = "6px";
    label.style.lineHeight = "1.4";
    const fs = annotation.style?.fontSize ?? 12;
    label.style.fontSize = `${fs}px`;
    label.style.padding = "4px 8px";
    label.style.borderRadius = "8px";
    label.style.backdropFilter = "blur(4px)";
    label.style.pointerEvents = "auto";

    // --- trigger styling (border only, icon top-right) ---
    if (isTrigger) {
        label.style.background = "rgba(0,0,0,0.6)";  // same as regular
        label.style.color = "white";
        label.style.border = `2px solid ${TRIGGER_BORDER_COLOR}`;
        label.style.cursor = state.annotationMode ? "grab" : "pointer";
        label.style.position = "relative";  // for absolute icon positioning
        label.style.paddingRight = "22px";  // make room for icon

        const icon = document.createElement("span");
        // Different icon for each type
        const triggerType = annotation.trigger.type;
        if (triggerType === "audioImpulse") {
            icon.textContent = "⚡";  // lightning for impulse
        } else if (triggerType === "audioPool") {
            icon.textContent = "🎲";  // dice for pool
        } else {
            icon.textContent = "🔊";  // speaker for single audio
        }
        icon.style.position = "absolute";
        icon.style.top = "2px";
        icon.style.right = "4px";
        icon.style.fontSize = "10px";
        icon.style.opacity = "0.85";
        icon.style.pointerEvents = "none";
        label.appendChild(icon);
    } else {
        label.style.background = "rgba(0,0,0,0.6)";
        label.style.color = "white";
        label.style.border = "1px solid rgba(255,255,255,0.12)";
        label.style.cursor = "grab";
    }

    pin.appendChild(label);


    // -----------------------------
    // Drag logic — CLEAN SEPARATION
    // -----------------------------
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;

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
        moved = false; // 🔴 CRITICAL RESET (fixes editor bug)

        const coords = getPointerCoords(e);
        startX = coords.x;
        startY = coords.y;
        baseX = annotation.placement.x;
        baseY = annotation.placement.y;

        label.style.cursor = "grabbing";

        window.addEventListener("mousemove", onPointerMove);
        window.addEventListener("mouseup", onPointerUp);
        window.addEventListener("touchmove", onPointerMove, { passive: false });
        window.addEventListener("touchend", onPointerUp);
        window.addEventListener("touchcancel", onPointerUp);
    }

    function onPointerMove(e) {
        if (!dragging) return;
        if (e.cancelable) e.preventDefault();

        const coords = getPointerCoords(e);
        const dx = coords.x - startX;
        const dy = coords.y - startY;

        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
            moved = true;
        }

        annotation.placement.x = baseX + dx;
        annotation.placement.y = baseY + dy;
        positionAnnotation(pin, annotation);
    }

    function onPointerUp() {
        if (!dragging) return;

        dragging = false;
        label.style.cursor = isTrigger && !state.annotationMode ? "pointer" : "grab";

        window.removeEventListener("mousemove", onPointerMove);
        window.removeEventListener("mouseup", onPointerUp);
        window.removeEventListener("touchmove", onPointerMove);
        window.removeEventListener("touchend", onPointerUp);
        window.removeEventListener("touchcancel", onPointerUp);

        if (moved) {
            updateAnnotation(annotation.id, {
                placement: { ...annotation.placement }
            });
        }
    }

    label.addEventListener("mousedown", onPointerDown);
    label.addEventListener("touchstart", onPointerDown, { passive: false });

    // -----------------------------
    // Click behaviour — FIXED
    // Pen mode ON = edit any annotation
    // Pen mode OFF = triggers execute, regular annotations do nothing
    // -----------------------------
    label.addEventListener("click", (e) => {
        console.log("[annotation click]", {
            moved,
            annotationMode: state.annotationMode,
            isTrigger,
            annotationId: annotation.id
        });

        if (moved) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        // PEN MODE ON → always edit
        if (state.annotationMode) {
            console.log("[annotation] Opening editor for:", annotation.id);
            onClick?.(annotation);
            return;
        }

        // PEN MODE OFF → only triggers execute, regular annotations do nothing
        if (isTrigger) {
            console.log("[annotation] Executing trigger:", annotation.id);
            executeTrigger(annotation, label);
        }
        // Regular annotations: no action when pen is off (just drag)
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
        initialTrigger: annotation.kind === "trigger" ? annotation.trigger : null,

        onSave: ({ text, scope, style, trigger }) => {
            const fontSize =
                style?.fontSize ?? lastAnnotationFontSize ?? 12;

            const updates = {
                text,
                scope,
                kind: trigger ? "trigger" : "text",
                style: {
                    ...(annotation.style || {}),
                    fontSize
                }
            };

            // Add or remove trigger config
            if (trigger) {
                updates.trigger = trigger;
            } else if (annotation.trigger) {
                // Was a trigger, now isn't - clear it
                updates.trigger = null;
            }

            updateAnnotation(annotation.id, updates);

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
        positionAnnotation(pin, item);
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
    initialTrigger,
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
        initialFontSize,
        initialTrigger
    });

    document.body.appendChild(editor.wrap);
    editor.ta.focus();

    // -----------------------------
    // Wire up trigger controls
    // -----------------------------

    // Browse button
    editor.browseBtn.onclick = () => {
        openAudioBrowser(editor.sourceInput, editor.statusMsg);
    };

    // Upload handler
    editor.uploadInput.onchange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            handleAudioUpload(file, editor.sourceInput, editor.statusMsg);
        }
    };

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
        const trigger = editor.getTriggerConfig();

        onSave?.({
            text,
            scope: editor.scopeChk.checked ? "shared" : "local",
            style: {
                fontSize
            },
            trigger
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

    // IMPORTANT: If clicking on an existing annotation, let it handle the click
    const clickedPin = evt.target.closest(".osc-anno-pin");
    if (clickedPin) {
        // Don't prevent - let the annotation's click handler fire
        return;
    }

    evt.preventDefault();
    evt.stopPropagation();

    const { mode } = getModeContext();
    if (mode !== "scroll") return;

    const placement = getScoreClickPlacement(evt);
    if (!placement) return;

    const elementId = withinScoreClickTarget(evt.target);

    // capture last screen coords (used if editing later)
    const screenX = evt.clientX + 10;
    const screenY = evt.clientY + 10;
    openEditorAt({
        screenX,
        screenY,
        initialText: "",
        initialFontSize: lastAnnotationFontSize,
        initialTrigger: null,

        onSave: ({ text, scope, style, trigger }) => {
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
                kind: trigger ? "trigger" : "text",
                text,

                style: {
                    color: "rgba(255,255,255,0.9)",
                    fontSize
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

            // Add trigger config if set
            if (trigger) {
                item.trigger = trigger;
            }

            // remember font size for NEXT annotation
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

    // IMPORTANT: If clicking on an existing annotation, let it handle the click
    const clickedPin = evt.target.closest(".osc-anno-pin");
    if (clickedPin) {
        return;
    }

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
        // Trigger API
        getTriggers: () => state.items.filter(i => i.kind === "trigger"),
        executeTriggerById: (id) => {
            const item = state.items.find(i => i.id === id);
            if (item?.kind === "trigger") executeTrigger(item, null);
        },
        clearTriggerPools: () => triggerPools.clear(),
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


export function exportAnnotationsJSON() {
    const payload = {
        project: state.project,
        exportedAt: nowMs(),
        version: 1,
        items: state.items
    };

    const blob = new Blob(
        [JSON.stringify(payload, null, 2)],
        { type: "application/json" }
    );

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `annotations.${state.project}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
}


export function importAnnotationsJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const data = JSON.parse(reader.result);
            if (!Array.isArray(data.items)) {
                console.warn("[annotations] invalid import file");
                return;
            }

            // merge by id (do not clobber blindly)
            const byId = new Map(state.items.map(a => [a.id, a]));
            for (const item of data.items) {
                if (!item?.id) continue;
                byId.set(item.id, item);
            }

            state.items = [...byId.values()];
            saveLocal(state.project, state.items);
            renderAll();

            console.log(
                `[annotations] imported ${data.items.length} annotations`
            );
        } catch (e) {
            console.error("[annotations] import failed", e);
        }
    };
    reader.readAsText(file);
}




// export function wireAnnotationMenuItems() { ---- this is in scoreSetup.js