// public/js/oscillaContributionTrigger.js
//
// Trigger Execution System for Oscilla
// - Execute audio triggers (single file, pool, impulse)
// - Playhead-triggered audio
// - Flash effects
//
// Usage:
//   import { executeTrigger, checkAnnotationPlayheadTriggers } from "./oscillaContributionTrigger.js";

import { handleAudioCue, handleAudioImpulseCue, stopAudioImpulse } from "../cues/audio.js";
import { state, getProjectName } from "./shared.js";

// =============================================================
// CONSTANTS
// =============================================================

export const TRIGGER_BORDER_COLOR = "rgba(0, 0, 0, 0.8)";
export const TRIGGER_BG_COLOR = "rgba(0, 180, 220, 0.15)";
export const TRIGGER_FLASH_COLOR = "rgba(0, 220, 255, 0.4)";

// =============================================================
// TRIGGER STATE
// =============================================================

// Trigger pools for directory-based triggers
const triggerPools = new Map();

// Track scheduled lifespan timers per impulse uid
const impulseLifespanTimers = new Map();

// Playhead trigger state
const playheadGateState = new Map();
const playheadTriggeredAnnotations = new Set();

// =============================================================
// TRIGGER EXECUTION
// =============================================================

/**
 * Execute a trigger annotation (play audio)
 * @param {Object} annotation - The annotation with trigger config
 * @param {HTMLElement} labelEl - The label element for flash effect
 */
export async function executeTrigger(annotation, labelEl) {
    const trigger = annotation.trigger;
    if (!trigger || !trigger.source?.path) {
        console.warn("[trigger] No source path configured:", annotation.id);
        return;
    }

    const { type, source, playback, impulse } = trigger;

    // Playback defaults
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
        // AUDIO (single file)
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

        // AUDIO POOL (directory)
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

        // AUDIO IMPULSE (directory, auto-normalised)
        else if (type === "audioImpulse") {
            const uid = `trigger-impulse-${annotation.id}`;

            // Toggle OFF (only for non-gate modes)
            if (
                window.audioImpulses?.has(uid) &&
                trigger.impulse?.lifespanMode !== "gate"
            ) {
                stopAudioImpulse(uid);

                if (impulseLifespanTimers.has(uid)) {
                    clearTimeout(impulseLifespanTimers.get(uid));
                    impulseLifespanTimers.delete(uid);
                }

                if (labelEl) labelEl.style.borderColor = TRIGGER_BORDER_COLOR;
                return;
            }

            // Normalize path (file → dir)
            let impulsePath = trigger.source.path;
            if (impulsePath.match(/\.(wav|aif|aiff|mp3|ogg)$/i)) {
                impulsePath = impulsePath.split("/").slice(0, -1).join("/");
            }

            const rate = trigger.impulse?.rate ?? 30;
            const jitter = trigger.impulse?.jitter ?? 0;
            const poly = trigger.impulse?.poly ?? 6;

            const panRandom = trigger.impulse?.panRandom ?? 0;
            const pitchRandom = trigger.impulse?.pitchRandom ?? 0;

            const lifespanMode = trigger.impulse?.lifespanMode ?? "toggle";
            const lifespan = trigger.impulse?.lifespan ?? null;

            await handleAudioImpulseCue(
                {
                    params: {
                        uid,
                        path: impulsePath,
                        mode: trigger.playback?.order || "shuffle",

                        rate,
                        jitter,
                        poly,

                        amp: trigger.playback?.gain ?? 1,
                        pan: trigger.playback?.pan ?? 0,
                        pitch: trigger.playback?.pitch ?? 1,
                        fadeIn: trigger.playback?.fadeIn ?? 0,
                        fadeOut: trigger.playback?.fadeOut ?? 0,

                        panRandom,
                        pitchRandom
                    }
                },
                null,
                {}
            );

            // Fixed lifespan handling
            if (lifespanMode === "fixed" && typeof lifespan === "number") {
                scheduleImpulseStop(uid, lifespan);
            }

            if (labelEl) {
                labelEl.style.borderColor = "rgba(0,255,100,0.85)";
            }
        }

    } catch (err) {
        console.error("[trigger] Execution failed:", err);
    }
}

// =============================================================
// IMPULSE LIFESPAN
// =============================================================

/**
 * Schedule an impulse to stop after a duration
 */
function scheduleImpulseStop(uid, seconds) {
    if (impulseLifespanTimers.has(uid)) {
        clearTimeout(impulseLifespanTimers.get(uid));
        impulseLifespanTimers.delete(uid);
    }

    const ms = Math.max(0, seconds * 1000);

    const t = setTimeout(() => {
        stopAudioImpulse(uid);
        impulseLifespanTimers.delete(uid);
    }, ms);

    impulseLifespanTimers.set(uid, t);
}

// =============================================================
// FLASH EFFECT
// =============================================================

/**
 * Flash effect when trigger fires
 */
export function flashTriggerLabel(labelEl) {
    if (!labelEl) return;

    const originalBg = labelEl.style.background;
    labelEl.style.background = TRIGGER_FLASH_COLOR;

    labelEl.style.transform = "translateY(-50%) scale(1.05)";
    labelEl.style.transition = "all 0.08s ease-out";

    setTimeout(() => {
        labelEl.style.background = originalBg;
        labelEl.style.transform = "translateY(-50%) scale(1)";
    }, 100);
}

// =============================================================
// TRIGGER POOLS
// =============================================================

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

/**
 * Clear all trigger pools
 */
export function clearTriggerPools() {
    triggerPools.clear();
}

// =============================================================
// PLAYHEAD TRIGGER SYSTEM
// =============================================================

/**
 * Check if any annotations should trigger based on playhead position
 * Called from animation loop
 */
export function checkAnnotationPlayheadTriggers() {
    try {
        if (!state?.enabled || !Array.isArray(state.items) || state.items.length === 0) return;

        const playheadX = window.playheadX;
        if (typeof playheadX !== "number" || !isFinite(playheadX)) return;

        const scale =
            (typeof window.localScale === "number" &&
                isFinite(window.localScale) &&
                window.localScale > 0)
                ? window.localScale
                : 1;

        for (const annotation of state.items) {
            if (!annotation) continue;

            const trig = annotation.trigger;
            if (!trig || !trig.playheadTrigger) continue;

            const placement = annotation.placement;
            if (!placement) continue;

            const px = placement.x;
            if (typeof px !== "number" || !isFinite(px)) continue;

            // Region geometry
            const startX = placement.x / scale;

            const extentScore =
                (typeof placement.extent === "number" && placement.extent > 0)
                    ? placement.extent
                    : placement.width ?? 0;

            const endX = startX + (extentScore / scale);

            const isInside = playheadX >= startX && playheadX <= endX;
            const wasInside = playheadGateState.get(annotation.id) ?? false;

            // Log only on state change
            if (isInside !== wasInside) {
                console.log("[PLAYHEAD GATE]", {
                    annotationId: annotation.id,
                    playheadX,
                    startX,
                    endX,
                    extent: placement.extent,
                    width: placement.width,
                    scale,
                    deltaFromStart: playheadX - startX,
                    deltaToEnd: endX - playheadX,
                    entering: !wasInside && isInside,
                    exiting: wasInside && !isInside
                });
            }

            // Playhead-gated audio impulse
            if (
                trig.type === "audioImpulse" &&
                trig.impulse?.lifespanMode === "gate"
            ) {
                const uid = `trigger-impulse-${annotation.id}`;

                // ENTER → start
                if (!wasInside && isInside) {
                    if (!window.audioImpulses?.has(uid)) {
                        const labelEl = document.querySelector(
                            `[data-annotation-id="${annotation.id}"]`
                        );
                        executeTrigger(annotation, labelEl);
                    }
                }

                // EXIT → stop
                if (wasInside && !isInside) {
                    if (window.audioImpulses?.has(uid)) {
                        stopAudioImpulse(uid);
                    }
                }

                playheadGateState.set(annotation.id, isInside);
                continue;
            }

            // One-shot playhead triggers
            const wasTriggered = playheadTriggeredAnnotations.has(annotation.id);

            if (isInside && !wasTriggered) {
                const labelEl = document.querySelector(
                    `[data-annotation-id="${annotation.id}"]`
                );
                executeTrigger(annotation, labelEl);
                playheadTriggeredAnnotations.add(annotation.id);
            }

            if (!isInside && wasTriggered) {
                playheadTriggeredAnnotations.delete(annotation.id);
            }

            playheadGateState.set(annotation.id, isInside);
        }
    } catch (err) {
        console.warn("[annotation:playhead] check failed (non-fatal):", err);
    }
}

/**
 * Reset playhead trigger state (call on rewind, jump, etc.)
 */
export function resetAnnotationPlayheadTriggers() {
    playheadTriggeredAnnotations.clear();
    playheadGateState.clear();
    console.log("[annotation:playhead] Reset triggered state");
}

// =============================================================
// GET TRIGGERS
// =============================================================

/**
 * Get all trigger annotations from state
 */
export function getTriggers() {
    return state.items.filter(i => i.kind === "trigger");
}

/**
 * Execute a trigger by its ID
 */
export function executeTriggerById(id) {
    const item = state.items.find(i => i.id === id);
    if (item?.kind === "trigger") {
        executeTrigger(item, null);
    }
}

// =============================================================
// WINDOW EXPOSURE
// =============================================================

// Expose to window for integration with animation loop
window.checkAnnotationPlayheadTriggers = checkAnnotationPlayheadTriggers;
window.resetAnnotationPlayheadTriggers = resetAnnotationPlayheadTriggers;

// =============================================================
// EXPORTS
// =============================================================

export default {
    // Constants
    TRIGGER_BORDER_COLOR,
    TRIGGER_BG_COLOR,
    TRIGGER_FLASH_COLOR,
    
    // Execution
    executeTrigger,
    executeTriggerById,
    flashTriggerLabel,
    
    // Pools
    clearTriggerPools,
    
    // Playhead
    checkAnnotationPlayheadTriggers,
    resetAnnotationPlayheadTriggers,
    
    // Query
    getTriggers,
};
