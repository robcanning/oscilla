// o2p.js — Clean Modern Rewrite (FIXED for nested animations + scroll mode)
// -----------------------------------------------------------
// Modes:
//   - forward
//   - reverse
//   - alternate (true ping-pong)
// Features:
//   - dur (seconds)
//   - loop (0 = infinite)
//   - rotate: 0..4 (rotation modes)
//   - rotspeed, rotdir, rotoffset, rotlock
//   - osc:false, 0, true, or number (throttle ms)
//   - ease: single int/string or list [...]
//   - start/end: 0..1 segment slicing
//   - uid override
//   - ghostClickable three-phase lifecycle
// -----------------------------------------------------------
// KEY FIX: Do NOT shift geometry. Store original bbox center and
//          compute transforms relative to that center. This preserves
//          the object's position in SVG coordinate space.
// -----------------------------------------------------------

import { registerAnimation, resolveAnimationUid } from "./animation.js";
import { scheduleCueStart } from "./cueDispatcher.js";
import { createHitLabel, repositionAllHitLabels, initO2PDragHandler, updateHitLabelValue, createRotationRing, initO2PRotationDragHandler } from "../control/o2pTouchOverlays.js";

import {
    applyPrestateBeforeStart,
    applyPrestateOnStart,
    armGhostClickable,
    needsArming,
    isOscEnabled,
    ensureAnimWrapper
} from "./animShared.js";

import { createOscOverlay } from "./osc.js";
import { sendOSC } from "../system/oscillaOSCClient.js";

import { publish } from '../control/paramBinding.js';

import {
    normalizeHmodeValue, parseRotRange,
    constrainRotation, normalizeRotation, denormalizeRotation
} from '../control/rotationMath.js';


/* ---------------------------------------------------------
 *  Rotation indicator visual update helpers
 * --------------------------------------------------------*/

/**
 * Update the auto-generated rotation ring indicator dot position
 * @param {Object} ringData - from createRotationRing()
 * @param {number} angleDeg - angle in the 7-o'clock-zero coordinate system
 */
function updateRotationIndicator(ringData, angleDeg) {
    if (!ringData || !ringData.dot) return;
    // Convert from 7-o'clock-zero to standard SVG angle (add 120)
    const standardAngle = angleDeg + 120;
    const angleRad = (standardAngle * Math.PI) / 180;
    const r = ringData.radius;
    ringData.dot.setAttribute("cx", Math.cos(angleRad) * r);
    ringData.dot.setAttribute("cy", Math.sin(angleRad) * r);
}

/**
 * Update a user-supplied rotation handle element position
 * Translates the element to follow the fader's current path position
 * and rotates it to show current rotation angle
 * @param {Object} faderEntry - fader registry entry
 * @param {number} angleDeg - angle in the 7-o'clock-zero coordinate system
 */
function updateO2PUserHandle(faderEntry, angleDeg) {
    if (!faderEntry || !faderEntry.userHandleEl) return;
    const el = faderEntry.userHandleEl;
    const point = faderEntry.cfg._currentPoint;
    if (!point) return;

    // Get the element's original center
    const bbox = el.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;

    // Translate to fader position and rotate
    const standardAngle = angleDeg + 120;
    const dx = point.x - cx;
    const dy = point.y - cy;
    el.setAttribute("transform",
        `translate(${dx}, ${dy}) rotate(${standardAngle} ${cx} ${cy})`);
}


/* ---------------------------------------------------------
 *  1. ensureO2PWrapper(el)
 *     Creates a dedicated wrapper for o2p transforms.
 *     This wrapper sits INSIDE the element and receives
 *     all o2p translation/rotation. The outer element
 *     retains its scroll-mode placement transform.
 * --------------------------------------------------------*/
function ensureO2PWrapper(el) {
    // If we already have a wrapper, return it
    if (el._o2pAnimWrapper) {
        return el._o2pAnimWrapper;
    }

    // Only wrap groups
    if (!(el instanceof SVGGElement)) {
        // For non-groups, animate directly
        el._o2pAnimWrapper = el;
        return el;
    }

    // Check if wrapper already exists in DOM
    const existing = el.querySelector(":scope > g.oscilla-o2p-anim");
    if (existing) {
        el._o2pAnimWrapper = existing;
        return existing;
    }

    // Create new wrapper
    const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
    wrapper.classList.add("oscilla-o2p-anim");

    // Move all children into the wrapper
    while (el.firstChild) {
        wrapper.appendChild(el.firstChild);
    }

    // Attach wrapper to element
    el.appendChild(wrapper);
    el._o2pAnimWrapper = wrapper;

    console.log("[o2p] Created animation wrapper for", el.id || "(anon)");

    return wrapper;
}


/* ---------------------------------------------------------
 *  2. captureOriginalCenter(wrapper)
 *     
 *     Captures the bbox center of the wrapper content
 *     WITHOUT modifying any geometry. This center is used
 *     to compute the offset needed when positioning on path.
 *     
 *     KEY INSIGHT: We don't move the geometry to (0,0).
 *     Instead, we remember where it was and compute
 *     transforms that move it FROM its original position
 *     TO the path position.
 * --------------------------------------------------------*/
function captureOriginalCenter(wrapper) {
    // Guard: don't re-capture
    if (wrapper._o2pCenterCaptured) {
        return wrapper._o2pOriginalCenter;
    }

    // Compute bbox in local coordinates
    const bbox = wrapper.getBBox();

    // Guard against zero-area / invalid bbox
    if (!bbox || !isFinite(bbox.x) || !isFinite(bbox.y) ||
        !isFinite(bbox.width) || !isFinite(bbox.height) ||
        bbox.width === 0 || bbox.height === 0) {
        console.warn("[o2p] captureOriginalCenter: invalid or zero-area bbox for", wrapper);
        wrapper._o2pOriginalCenter = { x: 0, y: 0 };
        wrapper._o2pCenterCaptured = true;
        return wrapper._o2pOriginalCenter;
    }

    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;

    // Store original center - this is where the object currently sits
    wrapper._o2pOriginalCenter = { x: cx, y: cy };
    wrapper._o2pCenterCaptured = true;

    // console.log("[o2p] Captured original center for", wrapper, "→", cx.toFixed(1), cy.toFixed(1));

    return wrapper._o2pOriginalCenter;
}


/* ---------------------------------------------------------
 *  3. ease controller
 * --------------------------------------------------------*/
function normalizeEase(easeVal) {
    const easingMap = {
        0: "linear",
        1: "easeInSine",
        2: "easeOutSine",
        3: "easeInOutSine",
        4: "easeInBack",
        5: "easeOutBack",
        6: "easeInOutBack",
        7: "easeInElastic",
        8: "easeOutElastic",
        9: "easeInOutElastic"
    };

    let seq = [];

    if (Array.isArray(easeVal)) {
        seq = easeVal.map(e =>
            typeof e === "number" ? easingMap[e] || "easeInOutSine" : String(e)
        );
    } else if (typeof easeVal === "number") {
        seq = [easingMap[easeVal] || "easeInOutSine"];
    } else if (typeof easeVal === "string") {
        seq = [easeVal];
    } else {
        seq = ["easeInOutSine"];
    }

    let i = 0;
    return {
        next() {
            const val = seq[i % seq.length];
            i++;
            return val;
        }
    };
}


/* ---------------------------------------------------------
 *  4. VirtualPath - Unified sampler with segment slicing
 * --------------------------------------------------------*/
class VirtualPath {
    constructor(paths) {
        this.paths = paths;
        if (!paths || paths.length === 0) {
            this.totalLen = 0;
            return;
        }
        this.totalLen = this.computeTotalLength();
    }

    computeTotalLength() {
        let sum = 0;
        for (const p of this.paths) sum += p.getTotalLength();
        return sum;
    }

    sample(globalT) {
        if (!this.totalLen) return null;

        if (!isFinite(globalT)) return null;
        globalT = Math.max(0, Math.min(1, globalT));

        let target = globalT * this.totalLen;
        let acc = 0;

        for (const path of this.paths) {
            const L = path.getTotalLength();
            if (acc + L >= target) {
                const local = target - acc;
                const point = path.getPointAtLength(local);
                const pathT = L > 0 ? (local / L) : 0;
                return { path, point, pathT, distance: local };
            }
            acc += L;
        }
        return null;
    }
}


/* ---------------------------------------------------------
 *  5. Path segment mapper (start/end)
 * --------------------------------------------------------*/
function makeTMapper(start, end) {
    const a = Math.max(0, Math.min(1, start ?? 0));
    const b = Math.max(0, Math.min(1, end ?? 1));
    const d = b - a;
    return t => a + t * d;
}


/* ---------------------------------------------------------
 *  6. TRANSFORM WRITER
 *     
 *     Computes the transform needed to move the object
 *     FROM its original center TO the path point.
 *     
 *     Transform = translate(pathPoint - originalCenter) + rotate
 *     
 *     This means:
 *     - Object at (40000, 500) with center at (40050, 520)
 *     - Path point at (40100, 530)
 *     - Translation = (40100-40050, 530-520) = (50, 10)
 *     - Object moves 50px right and 10px down from its original spot
 * --------------------------------------------------------*/
function applyTransform(wrapper, point, angleDeg, cfg) {
    const now = performance.now();

    // Human-friendly rotate modes → internal numeric codes
    const rotateModeLookup = {
        "none": 0,
        "aligned": 1,
        "locked": 3,
        "spin": 4
    };

    // Resolve cfg.rotate to numeric mode
    let mode = cfg.rotate;

    if (typeof mode === "string") {
        const key = mode.toLowerCase().trim();
        if (rotateModeLookup[key] !== undefined) {
            mode = rotateModeLookup[key];
        } else {
            mode = 0;
        }
    }

    if (!Number.isFinite(mode)) {
        mode = 0;
    }

    // Get the original center (where the object was before any o2p transform)
    const originalCenter = wrapper._o2pOriginalCenter || { x: 0, y: 0 };

    // Compute translation: move FROM original center TO path point
    const tx = point.x - originalCenter.x;
    const ty = point.y - originalCenter.y;

    // Build transform string
    // First translate to move center to path point
    // Then rotate around the new center position
    let t = `translate(${tx}, ${ty})`;

    if (!isFinite(angleDeg)) angleDeg = 0;

    // For rotation, we need to rotate around the center
    // Since we've translated, the center is now at the path point
    // We rotate around (0,0) relative to the translated position
    // which means rotating around originalCenter in local coords

    const rotateAroundX = originalCenter.x;
    const rotateAroundY = originalCenter.y;

    switch (mode) {
        case 0:
            // no rotation
            break;

        case 1:
            // tangent-aligned - rotate around the object's center
            t += ` rotate(${angleDeg}, ${rotateAroundX}, ${rotateAroundY})`;
            break;

        case 2:
            // tangent + static offset
            t += ` rotate(${angleDeg + (cfg.rotoffset || 0)}, ${rotateAroundX}, ${rotateAroundY})`;
            break;

        case 3:
            // locked heading
            t += ` rotate(${cfg.rotlock || 0}, ${rotateAroundX}, ${rotateAroundY})`;
            break;

        case 4:
            // free spin
            if (!wrapper._o2pFreeSpin) wrapper._o2pFreeSpin = 0;
            {
                let dt;
                if (wrapper._o2pLastSpinTime == null) {
                    dt = window._o2p_dt || 0.016;
                } else {
                    dt = (now - wrapper._o2pLastSpinTime) / 1000;
                    if (dt > 0.05) dt = 0.05;
                }
                wrapper._o2pLastSpinTime = now;

                const secPerRev = cfg.rotspeed || 1;
                const degPerSecond = 360 / secPerRev;
                const dir = cfg.rotdir || 1;

                wrapper._o2pFreeSpin += degPerSecond * dir * dt;
                t += ` rotate(${wrapper._o2pFreeSpin}, ${rotateAroundX}, ${rotateAroundY})`;
            }
            break;
    }

    // Apply transform to the wrapper ONLY via SVG attribute
    wrapper.setAttribute("transform", t);

    // DO NOT touch style.transform - that's for CSS animations (nested rotate)
}


/* ---------------------------------------------------------
 *  7. OSC emitter
 * --------------------------------------------------------*/
const O2P_OSC_THROTTLE_MS = 30;

// console.log("[o2p isOsc?]", JSON.stringify(cfg.oscCfg));

function emitO2POsc({ cfg, uid, path, point, pathT }) {

    const oscCfg = cfg.oscCfg;

    if (!oscCfg || !oscCfg.enabled) return;

    const now = performance.now();
    if (oscCfg.lastSent && (now - oscCfg.lastSent < oscCfg.throttle)) return;
    oscCfg.lastSent = now;

    if (!cfg._oscLastSent) cfg._oscLastSent = 0;
    if (now - cfg._oscLastSent < O2P_OSC_THROTTLE_MS) return;
    cfg._oscLastSent = now;

    const bbox = path.getBBox();
    if (!bbox || bbox.width === 0 || bbox.height === 0) return;

    const normX = (point.x - bbox.x) / bbox.width;
    const normY = (point.y - bbox.y) / bbox.height;

    const length = path.getTotalLength();
    const EPS = 0.1;
    const localL = pathT * length;
    const aheadLen = Math.min(length - EPS, Math.max(0, localL + EPS));
    const ahead = path.getPointAtLength(aheadLen);

    let angle = Math.atan2(
        ahead.y - point.y,
        ahead.x - point.x
    ) * (180 / Math.PI);


    angle = (angle + 360) % 360;


    if (!Number.isFinite(angle)) angle = 0;

    let addr;

    if (cfg.oscAddr) {
        addr = cfg.oscAddr.replace(/^\//, "");
    } else {
        addr = `o2p/${cfg.uid || "unknown"}`;
    }

    // normalize pathT relative to startPos
    let tLocal = pathT;
    if (Number.isFinite(cfg.startPos)) {
        tLocal = (pathT - cfg.startPos + 1) % 1;
    }

    sendOSC({
        type: "osc_value",
        addr,
        args: [
            tLocal,
            normX,
            normY,
            angle
        ],
        timestamp: Date.now()
    });


}

function startContinuousO2P(el, cfg, virtual, uid) {
    const { dur, loop, startPos, endPos, next, nextOn } = cfg;

    const wrapper = ensureO2PWrapper(el);
    cfg._wrapper = wrapper;

    captureOriginalCenter(wrapper);

    if (el._o2pAnim) el._o2pAnim.pause?.();

    const easeCtrl = normalizeEase(cfg.ease);
    const tMap = makeTMapper(startPos, endPos);

    const driver = { u: 0 };
    const cycles = loop === 0 ? true : loop;
    const durationMs = dur * 1000;

    if (!window.runningAnimations) window.runningAnimations = {};
    window.runningAnimations[uid] = {
        pause: () => el._o2pAnim?.pause(),
        play: () => el._o2pAnim?.play(),
        resume: () => el._o2pAnim?.play(),
        stop: () => el._o2pAnim?.pause(),
        wasPaused: false
    };

    cfg._oscLastSent = 0;

    const anim = anime({
        targets: driver,
        u: 1,
        duration: durationMs,
        easing: easeCtrl.next(),
        loop: cycles,

        update: () => {
            const nowTime = performance.now();
            window._o2p_dt = window._o2p_lastTime
                ? (nowTime - window._o2p_lastTime) / 1000
                : 0.016;
            window._o2p_lastTime = nowTime;

            const phase = driver.u;
            let globalT;

            const hasCustomStart = (startPos !== 0);
            const hasCustomEnd   = (endPos !== 1);

            if (cfg.mode === "forward") {
                globalT = hasCustomStart && !hasCustomEnd
                    ? (startPos + phase) % 1
                    : tMap(phase);
            } else if (cfg.mode === "reverse") {
                globalT = hasCustomStart && !hasCustomEnd
                    ? (startPos - phase + 1) % 1
                    : tMap(1 - phase);
            }

            const sample = virtual.sample(globalT);
            if (!sample) return;

            const { path, point, pathT } = sample;

            const length = path.getTotalLength();
            const EPS = 0.1;
            const localL = pathT * length;
            const aheadLen = Math.min(length - EPS, Math.max(0, localL + EPS));
            const ahead = path.getPointAtLength(aheadLen);

            let angle = Math.atan2(
                ahead.y - point.y,
                ahead.x - point.x
            ) * (180 / Math.PI);

            if (!Number.isFinite(angle)) angle = 0;

            applyTransform(wrapper, point, angle, cfg);
            repositionAllHitLabels();

            // OSC emit
            emitO2POsc({ cfg, uid: cfg.uid, path, point, pathT });


            // ========== CONTROL PLANE PUBLISH ==========
            // Calculate normalized coordinates
            const bbox = path.getBBox();
            const normX = bbox.width > 0 ? (point.x - bbox.x) / bbox.width : 0;
            const normY = bbox.height > 0 ? (point.y - bbox.y) / bbox.height : 0;
            
            // Publish signals for cross-cue modulation
            publish("o2p", cfg.uid, {
                t: globalT,      // position along path (0-1)
                x: normX,        // normalized X in bounding box
                y: normY,        // normalized Y in bounding box  
                angle: angle     // tangent angle in degrees
            });
            // ============================================



            // overlay text (position handled globally)
            if (cfg._overlay) {
                cfg._overlay.update(
                    `x:${point.x.toFixed(1)} y:${point.y.toFixed(1)}`
                );
            }
        },

        loopComplete: () => {
            if (next && nextOn === "cycle") {
                window.handleCueTrigger?.(next);
            }
        },

        complete: () => {
            if (loop !== 0) positionO2PInitial(el, cfg);

            if (loop !== 0 && next && nextOn === "stop") {
                window.handleCueTrigger?.(next);
            }
        }
    });

    el._o2pAnim = anim;
    cfg._anim = anim;
}


function startAlternateO2P(el, cfg, virtual, uid) {
    const { dur, loop, startPos, endPos, next, nextOn } = cfg;

    const wrapper = ensureO2PWrapper(el);
    cfg._wrapper = wrapper;

    captureOriginalCenter(wrapper);

    if (el._o2pAnim) el._o2pAnim.pause?.();

    const tMap = makeTMapper(startPos, endPos);
    const easeCtrl = normalizeEase(cfg.ease);

    const driver = { u: 0 };
    let remaining = loop === 0 ? Infinity : loop;
    let stopped = false;

    if (!window.runningAnimations) window.runningAnimations = {};
    window.runningAnimations[uid] = {
        pause: () => el._o2pAnim?.pause(),
        resume: () => el._o2pAnim?.play(),
        play: () => el._o2pAnim?.play(),
        stop: () => { stopped = true; el._o2pAnim?.pause(); },
        wasPaused: false
    };

    cfg._oscLastSent = 0;

    function halfCycle(directionSign) {
        return new Promise(resolve => {
            driver.u = 0;
            const ease = easeCtrl.next();

            const anim = anime({
                targets: driver,
                u: 1,
                duration: dur * 1000,
                easing: ease,

                update: () => {
                    const nowTime = performance.now();
                    window._o2p_dt = window._o2p_lastTime
                        ? (nowTime - window._o2p_lastTime) / 1000
                        : 0.016;
                    window._o2p_lastTime = nowTime;

                    const phase = driver.u;
                    let globalT;

                    const hasExplicitEnd = cfg.endPos !== 1;

                    if (!hasExplicitEnd) {
                        globalT = (cfg.startPos + directionSign * phase) % 1;
                        if (globalT < 0) globalT += 1;
                    } else {
                        globalT = tMap(phase);
                        if (directionSign < 0) {
                            globalT = cfg.endPos + cfg.startPos - globalT;
                        }
                    }

                    const sample = virtual.sample(globalT);
                    if (!sample) return;

                    const { path, point, pathT } = sample;

                    const length = path.getTotalLength();
                    const EPS = 0.1;
                    const localL = pathT * length;
                    const aheadLen = Math.min(length - EPS, Math.max(0, localL + EPS));
                    const ahead = path.getPointAtLength(aheadLen);

                    let angle = Math.atan2(
                        ahead.y - point.y,
                        ahead.x - point.x
                    ) * (180 / Math.PI);

                    if (!Number.isFinite(angle)) angle = 0;

                    applyTransform(wrapper, point, angle, cfg);
                    repositionAllHitLabels();

                    // OSC emit
                    emitO2POsc({ cfg, uid: cfg.uid, path, point, pathT });

            // ========== CONTROL PLANE PUBLISH ==========
            // Calculate normalized coordinates
            const bbox = path.getBBox();
            const normX = bbox.width > 0 ? (point.x - bbox.x) / bbox.width : 0;
            const normY = bbox.height > 0 ? (point.y - bbox.y) / bbox.height : 0;
            
            publish("o2p", cfg.uid, {
                t: globalT,
                x: normX,
                y: normY,
                angle: angle
            });


                    
                    // overlay text
                    if (cfg._overlay) {
                        cfg._overlay.update(
                            `x:${point.x.toFixed(1)} y:${point.y.toFixed(1)}`
                        );
                    }
                },

                complete: resolve
            });

            el._o2pAnim = anim;
            cfg._anim = anim;
        });
    }

    (async () => {
        while (!stopped && remaining > 0) {
            await halfCycle(+1);
            if (stopped) break;

            await halfCycle(-1);
            if (stopped) break;

            if (remaining !== Infinity) remaining--;

            if (next && nextOn === "cycle") {
                window.handleCueTrigger?.(next);
            }
        }

        if (!stopped && loop !== 0 && next && nextOn === "stop") {
            window.handleCueTrigger?.(next);
        }
    })();
}


function startO2PForElement(el, cfg) {

    // stop previous animation if any
    if (el._o2pAnim) {
        try { el._o2pAnim.pause(); } catch (_) {}
        el._o2pAnim = null;
    }

    cfg.mode = (cfg.mode ?? "forward").toLowerCase();

    // ------------------------------
    // OSC configuration
    // ------------------------------
    const osc = cfg.osc;
    let oscCfg = { enabled: false, throttle: 30, lastSent: 0 };
    const n = Number(osc);

    if (osc === false || osc === "false" || n === 0) {
        oscCfg.enabled = false;
    } else if (osc === true || osc === "true") {
        oscCfg.enabled = true;
    } else if (!Number.isNaN(n)) {
        oscCfg.enabled = true;
        oscCfg.throttle = Math.max(5, n);
    }

    cfg.oscCfg = oscCfg;

// ------------------------------------------------------
// DEBUG OVERLAY — ONLY if OSC is enabled
// ------------------------------------------------------
const pathEl = document.getElementById(cfg.path);

// destroy previous overlay if restarting
if (cfg._overlay) {
    cfg._overlay.destroy();
    cfg._overlay = null;
}

// draw overlay ONLY if OSC sending is enabled
if (pathEl && cfg.oscCfg?.enabled) {
    cfg._overlay = createOscOverlay({
        anchorEl: pathEl,
        label: cfg.oscAddr || cfg.uid,
        mode: "auto"
    });

    cfg._overlay.update("…");
    cfg._overlay.position();
}


    // ------------------------------------
    // Resolve path + virtual path wrapper
    // ------------------------------------
    const svg = el.ownerSVGElement || document.querySelector("svg");
    const p = svg.querySelector(`#${cfg.path}`);
    if (!p) return;

    const virtual = new VirtualPath([p]);
    if (!virtual.totalLen) return;

    const uid = cfg.uid || ("o2p_" + Math.random().toString(36).slice(2));

    window.o2pState ??= {};
    window.o2pState[uid] = {};

    if (cfg.mode === "alternate") {
        startAlternateO2P(el, cfg, virtual, uid);
    } else {
        startContinuousO2P(el, cfg, virtual, uid);
    }

    window._o2p_lastTime = performance.now();
}



/* ---------------------------------------------------------
 *  11. positionO2PInitial — Pre-position at start
 * --------------------------------------------------------*/
function positionO2PInitial(el, cfg) {
    try {
        // Get or create wrapper
        const wrapper = ensureO2PWrapper(el);
        cfg._wrapper = wrapper;

        // Capture original center if not done yet
        captureOriginalCenter(wrapper);

        const pathEl = document.getElementById(cfg.path);
        if (!pathEl) {
            console.warn("[o2p] Initial position: path not found:", cfg.path);
            return;
        }

        const length = pathEl.getTotalLength();
        const t = cfg.startPos ?? 0;
        const localL = t * length;

        const point = pathEl.getPointAtLength(localL);

        // Compute tangent angle
        const EPS = 0.1;
        const aheadLen = Math.min(length - EPS, Math.max(0, localL + EPS));
        const ahead = pathEl.getPointAtLength(aheadLen);
        let angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);
        if (!isFinite(angle)) angle = 0;

        // Apply to WRAPPER
        applyTransform(wrapper, point, angle, cfg);
        repositionAllHitLabels();

    } catch (err) {
        console.error("[o2p] Error in positionO2PInitial:", err);
    }
}


/* ---------------------------------------------------------
 *  12. Cue handler: handleO2PCue
 * --------------------------------------------------------*/
export function handleO2PCue(el, args, options = {}) {
    const { fromCueTrigger = false } = options;

    try {
        if (!Array.isArray(args)) args = [];

        // -----------------------------------------------------------
        // CHECK: Is this a playhead trigger for already-registered element?
        // -----------------------------------------------------------
        const existingCfg = el._oscillaCfg;

        if (fromCueTrigger && existingCfg && existingCfg._ghostClickable) {
            armGhostClickable(el, existingCfg);

            if (existingCfg.trig === "edge" && !existingCfg._running) {
                startO2PForElement(el, existingCfg);
                existingCfg._running = true;
            }

            return;
        }

        // -----------------------------------------------------------
        // FULL SETUP (first time registration)
        // -----------------------------------------------------------
        const cfg = {
            path: null,
            mode: "forward",

            dur: 1,
            loop: 0,

            rotate: 0,
            rotoffset: 0,
            rotlock: 0,
            rotspeed: 0,
            rotdir: 1,

            ease: 3,
            osc: false,

            startPos: 0,
            endPos: 1,

            startDelay: 0,
            prestate: "show",

            uid: null,
            next: null,
            nextOn: null,
            trig: "auto",

            kind: "o2p",

            // Preset/group system
            group: null,         // Group ID for preset grouping
            handle: null,        // SVG element ID for user-supplied rotation handle
            hmode: null,         // "limited" | "continuous" | null (no rotation)
            rotrange: null,      // Degrees of rotation range

            astArgs: args,
            fromCueTrigger
        };

        // -----------------------------------------------------------
        // Parse DSL arguments
        // -----------------------------------------------------------
        for (const a of args) {
            const key = a.type;
            const val = a.value;

            switch (key) {
                case "path": cfg.path = val; break;

                case "mode":
                    cfg.mode = String(val).toLowerCase();
                    break;

                case "dur":
                    cfg.dur = Number(val) || 1;
                    break;

                case "loop":
                    cfg.loop = Number(val) || 0;
                    break;

                case "rotate":
                    if (typeof val === "string") {
                        const v = val.toLowerCase().trim();
                        if (/^-?\d+(\.\d+)?$/.test(v)) cfg.rotate = Number(v);
                        else cfg.rotate = v;
                    } else {
                        cfg.rotate = val;
                    }
                    break;

                case "rotoffset": cfg.rotoffset = Number(val) || 0; break;
                case "rotlock": cfg.rotlock = Number(val) || 0; break;
                case "rotspeed": cfg.rotspeed = Number(val) || 0; break;
                case "rotdir": cfg.rotdir = Number(val) || 1; break;

                case "ease": cfg.ease = val; break;
                case "osc": {
                    let v = val;

                    // normalize booleans + numeric strings
                    if (typeof v === "string") {
                        const lower = v.toLowerCase();

                        if (lower === "true") v = true;
                        else if (lower === "false") v = false;
                        else if (!isNaN(lower)) v = Number(lower);
                    }

                    if (v == null) v = false;

                    cfg.osc = v;
                    break;
                }

                case "oscaddr":
                case "oscAddr": {
                    if (typeof val === "string") {
                        cfg.oscAddr = val;
                    }
                    console.log("[O2P oscAddr parsed]", { key, val, cfgOscAddr: cfg.oscAddr });

                    break;
                }


                case "start": cfg.startPos = Number(val); break;
                case "end": cfg.endPos = Number(val); break;

                case "tdelay": cfg.startDelay = Number(val) || 0; break;

                case "prestate": cfg.prestate = val; break;

                case "uid": cfg.uid = val; break;
                case "next": cfg.next = val; break;
                case "nextOn": cfg.nextOn = val; break;

                case "trig":
                    cfg.trig = String(val).toLowerCase();
                    break;

                // Preset/group system
                case "group":
                    cfg.group = String(val);
                    break;

                case "handle":
                    cfg.handle = String(val);
                    break;

                case "hmode":
                    cfg.hmode = normalizeHmodeValue(String(val));
                    break;

                case "rotrange":
                    cfg.rotrange = Number(val) || null;
                    break;
            }
        }

        // -----------------------------------------------------------
        // Normalisation & guards
        // -----------------------------------------------------------
        if (!Number.isFinite(cfg.startPos)) cfg.startPos = 0;
        if (!Number.isFinite(cfg.endPos)) cfg.endPos = 1;

        cfg.startPos = Math.max(0, Math.min(1, cfg.startPos));
        cfg.endPos = Math.max(0, Math.min(1, cfg.endPos));

        if (cfg.mode === "fwd") cfg.mode = "forward";
        if (cfg.mode === "rev") cfg.mode = "reverse";
        if (cfg.mode === "alt") cfg.mode = "alternate";

        // Resolve rotation handle config
        if (cfg.hmode) {
            cfg.rotrange = parseRotRange(cfg.rotrange, cfg.hmode);
        }

        if (!cfg.uid) {
            cfg.uid = "o2p_" + Math.random().toString(36).slice(2, 10);
        }

        // console.log("[o2pCue] Parsed:", {
        //     uid: cfg.uid,
        //     path: cfg.path,
        //     trig: cfg.trig,
        //     startDelay: cfg.startDelay,
        //     prestate: cfg.prestate
        // });

        if (!cfg.path) {
            console.warn("[o2p] Missing path argument.");
            return;
        }

        // -----------------------------------------------------------
        // STORE CFG ON ELEMENT
        // -----------------------------------------------------------
        el._oscillaCfg = cfg;

        // Touch mode should NEVER auto-start - it's purely user-driven
        const shouldStartNow =
            cfg.trig !== "touch" && (
                fromCueTrigger ||
                cfg.trig === "auto" ||
                cfg.trig === "playhead"
            );

        // -----------------------------------------------------------
        // PRESTATE BEFORE START (REGISTRATION)
        // -----------------------------------------------------------
        applyPrestateBeforeStart(el, cfg);

        try { el.parentNode.appendChild(el); } catch (_) { }

        // -----------------------------------------------------------
        // Pre-position object along the path
        // -----------------------------------------------------------
        positionO2PInitial(el, cfg);

        // -----------------------------------------------------------
        // Real animation start function
        // -----------------------------------------------------------
        const rawStart = () => {
            console.log("[o2pCue] ▶ Starting O2P animation →", cfg.uid);
            startO2PForElement(el, cfg);
        };

        cfg._start = rawStart;

        cfg._applyPrestateOnStart = () =>
            applyPrestateOnStart(el, cfg);

        // -----------------------------------------------------------
        // TOUCH MODE: Interactive drag-to-control mode
        // Handle this BEFORE registerAnimation to prevent any auto-start
        // Touch mode is IMMEDIATELY active - no playhead required
        // -----------------------------------------------------------
        if (cfg.trig === "touch") {
            // Prevent multiple initializations
            if (el._touchModeInitialized) {
                console.log("[o2pCue] Touch mode already initialized for:", cfg.uid);
                return;
            }
            el._touchModeInitialized = true;
            
            console.log("[o2pCue] 🖐️ Touch mode enabled →", cfg.uid);

            // Make element immediately visible (bypass prestate system)
            el.style.opacity = "1";
            el.style.visibility = "visible";
            el.style.pointerEvents = "all";

            // Create hit label first (needed for drag handling)
            createHitLabel(el, "o2p", cfg.uid, {
                anchorMode: "object",
                color: "orange",  // Different color for touch mode
                sizeMode: "follow",
                isTouchMode: true  // Enable value label
            });

            // Get the hit label record we just created
            const hitRecord = window._oscillaHitLabels?.find(r => r.uid === cfg.uid);
            
            // Get the path element
            const svg = el.ownerSVGElement || document.querySelector("svg");
            
            const pathEl = svg?.querySelector(`#${cfg.path}`);
            console.log("[o2pCue] Touch mode - pathEl found:", !!pathEl, cfg.path);

            if (!pathEl) {
                console.warn("[o2pCue] Touch mode: path not found:", cfg.path);
                return;
            }

            // Get wrapper for transforms
            const wrapper = ensureO2PWrapper(el);
            cfg._wrapper = wrapper;
            captureOriginalCenter(wrapper);

            // Set up OSC configuration for touch mode
            const osc = cfg.osc;
            let oscCfg = { enabled: false, throttle: 30, lastSent: 0 };
            const n = Number(osc);

            if (osc === false || osc === "false" || n === 0) {
                oscCfg.enabled = false;
            } else if (osc === true || osc === "true") {
                oscCfg.enabled = true;
            } else if (!Number.isNaN(n)) {
                oscCfg.enabled = true;
                oscCfg.throttle = Math.max(5, n);
            }

            cfg.oscCfg = oscCfg;

            // Create OSC overlay if enabled
            if (pathEl && cfg.oscCfg?.enabled) {
                cfg._overlay = createOscOverlay({
                    anchorEl: pathEl,
                    label: cfg.oscAddr || cfg.uid,
                    mode: "auto"
                });
                cfg._overlay.update("drag to control");
                cfg._overlay.position();
            }

            // Create the position update function that will be called during drag
            const updatePosition = (mappedT, rawT) => {
                const length = pathEl.getTotalLength();
                const localL = mappedT * length;
                const point = pathEl.getPointAtLength(localL);

                // Compute tangent angle
                const EPS = 0.1;
                const aheadLen = Math.min(length - EPS, Math.max(0, localL + EPS));
                const ahead = pathEl.getPointAtLength(aheadLen);
                let angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);
                if (!isFinite(angle)) angle = 0;

                // Apply transform to move object
                applyTransform(wrapper, point, angle, cfg);
                repositionAllHitLabels();
                
                // Update the value label with current position
                updateHitLabelValue(cfg.uid, rawT);

                // ========== CONTROL PLANE PUBLISH ==========
                const bbox = pathEl.getBBox();
                const normX = bbox.width > 0 ? (point.x - bbox.x) / bbox.width : 0;
                const normY = bbox.height > 0 ? (point.y - bbox.y) / bbox.height : 0;
                
                const publishData = {
                    t: mappedT,
                    x: normX,
                    y: normY,
                    angle: angle
                };

                // Include current rotation value if rotation handle is active
                if (cfg.hmode && faderEntry) {
                    publishData.p = faderEntry.curP;
                }

                publish("o2p", cfg.uid, publishData);


                // Emit OSC if enabled
                if (cfg.oscCfg?.enabled) {
                    emitO2POsc({
                        cfg,
                        uid: cfg.uid,
                        path: pathEl,
                        point,
                        pathT: mappedT
                    });

                    // Update overlay
                    if (cfg._overlay) {
                        cfg._overlay.update(
                            `t:${rawT.toFixed(2)} x:${point.x.toFixed(1)} y:${point.y.toFixed(1)}`
                        );
                    }
                }

                // Store current position for external access
                cfg._currentT = mappedT;
                cfg._currentPoint = point;
                cfg._currentAngle = angle;

                // Update fader entry in group registry
                if (faderEntry) {
                    faderEntry.curT = mappedT;
                }
            };

            // -----------------------------------------------------------
            // Group registry fader entry (referenced by updatePosition and rotation handler)
            // Declared before drag handler so updatePosition can access it
            // -----------------------------------------------------------
            let faderEntry = null;

            // Initialize the drag handler
            if (hitRecord) {
                initO2PDragHandler(hitRecord, pathEl, cfg, updatePosition);
            } else {
                console.warn("[o2pCue] Touch mode: hit label not found for drag handler", cfg.uid);
            }

            // -----------------------------------------------------------
            // GROUP REGISTRATION + ROTATION HANDLE SETUP
            // -----------------------------------------------------------
            if (cfg.group) {
                window._o2pTouchGroups = window._o2pTouchGroups || {};
                const group = window._o2pTouchGroups[cfg.group] = window._o2pTouchGroups[cfg.group] || {
                    groupId: cfg.group,
                    faders: {},

                    captureState() {
                        const state = {};
                        for (const [id, f] of Object.entries(this.faders)) {
                            const entry = { t: f.curT };
                            if (f.hmode) entry.p = f.curP;
                            state[id] = entry;
                        }
                        return state;
                    },

                    setPosition(faderId, t, p) {
                        const f = this.faders[faderId];
                        if (!f) return;
                        const start = f.cfg.startPos ?? 0;
                        const end = f.cfg.endPos ?? 1;
                        const range = end - start;
                        const clamped = Math.max(start, Math.min(end, t));
                        const rawT = range > 0 ? (clamped - start) / range : 0;
                        f.updatePosition(clamped, rawT);
                        f.curT = clamped;
                        if (f.hmode && typeof p === 'number') {
                            const angleDeg = denormalizeRotation(p, f.hmode, f.rotrange);
                            const constrained = constrainRotation(angleDeg, f.hmode, f.rotrange, f.curAngle);
                            f.curAngle = constrained;
                            f.curP = normalizeRotation(constrained, f.hmode, f.rotrange);
                            // Update visual indicator
                            if (f.rotationRing) {
                                updateRotationIndicator(f.rotationRing, constrained);
                            }
                            if (f.userHandleEl) {
                                updateO2PUserHandle(f, constrained);
                            }
                        }
                    },

                    applyPositions(positions) {
                        for (const [faderId, pos] of Object.entries(positions)) {
                            this.setPosition(faderId, pos.t, pos.p);
                        }
                    }
                };

                const faderId = el.id || cfg.uid;
                faderEntry = {
                    uid: cfg.uid,
                    cfg,
                    pathEl,
                    wrapper,
                    updatePosition,
                    rotationRing: null,
                    userHandleEl: null,
                    curT: cfg.startPos ?? 0,
                    curP: 0,
                    curAngle: 0,
                    hmode: cfg.hmode,
                    rotrange: cfg.rotrange
                };

                group.faders[faderId] = faderEntry;

                console.log(`[o2pCue] Registered fader "${faderId}" in group "${cfg.group}"`);

                // Create launcher bar for this group (once per group)
                if (!group._launcherCreated) {
                    group._launcherCreated = true;
                    import('../control/o2pLauncher.js').then(({ createO2PLauncher, getGroupBBox }) => {
                        const svgRoot = el.ownerSVGElement || document.querySelector("svg");
                        const bbox = getGroupBBox(cfg.group);
                        if (bbox && svgRoot) {
                            createO2PLauncher(cfg.group, bbox, svgRoot);
                        } else {
                            console.warn(`[o2pCue] Could not create launcher for group "${cfg.group}" - no bbox`);
                        }
                    }).catch(err => {
                        console.warn(`[o2pCue] o2pLauncher.js not available:`, err.message);
                    });
                }
            }

            // -----------------------------------------------------------
            // ROTATION HANDLE SETUP (dual-mode: user-supplied or auto-generated)
            // -----------------------------------------------------------
            if (cfg.hmode && hitRecord) {
                const svg = el.ownerSVGElement || document.querySelector("svg");
                let rotationHandleEl = null;
                let rotationRingData = null;

                if (cfg.handle) {
                    // User-supplied rotation handle element
                    rotationHandleEl = svg?.getElementById(cfg.handle);
                    if (!rotationHandleEl) {
                        console.warn(`[o2pCue] Rotation handle element not found: "${cfg.handle}", falling back to auto-generated ring`);
                    } else {
                        console.log(`[o2pCue] Using user-supplied rotation handle: "${cfg.handle}"`);
                        if (faderEntry) faderEntry.userHandleEl = rotationHandleEl;
                    }
                }

                if (!rotationHandleEl) {
                    // Auto-generate rotation ring around hit label
                    rotationRingData = createRotationRing(hitRecord, cfg.hmode, cfg.rotrange);
                    if (rotationRingData && faderEntry) {
                        faderEntry.rotationRing = rotationRingData;
                    }
                    console.log(`[o2pCue] Auto-generated rotation ring for "${cfg.uid}"`);
                }

                // Determine the element to use for rotation drag
                const rotDragTarget = rotationHandleEl || (rotationRingData ? rotationRingData.hit : null);

                if (rotDragTarget) {
                    // Set up the rotation drag handler
                    initO2PRotationDragHandler(
                        rotDragTarget,
                        hitRecord,
                        pathEl,
                        cfg,
                        // onRotate callback
                        (angleDeg) => {
                            const constrained = constrainRotation(angleDeg, cfg.hmode, cfg.rotrange,
                                faderEntry ? faderEntry.curAngle : 0);
                            const normP = normalizeRotation(constrained, cfg.hmode, cfg.rotrange);

                            if (faderEntry) {
                                faderEntry.curAngle = constrained;
                                faderEntry.curP = normP;
                            }

                            // Update visual indicator
                            if (rotationRingData) {
                                updateRotationIndicator(rotationRingData, constrained);
                            }
                            if (rotationHandleEl) {
                                updateO2PUserHandle(faderEntry, constrained);
                            }

                            // Publish to control plane
                            const publishData = {
                                t: faderEntry ? faderEntry.curT : (cfg._currentT ?? 0),
                                p: normP
                            };

                            publish("o2p", cfg.uid, publishData);

                            // OSC emit with rotation
                            if (cfg.oscCfg?.enabled) {
                                emitO2POsc({
                                    cfg,
                                    uid: cfg.uid,
                                    path: pathEl,
                                    point: cfg._currentPoint,
                                    pathT: cfg._currentT || 0
                                });
                            }
                        }
                    );

                    console.log(`[o2pCue] Rotation handle active: ${cfg.hmode}(${cfg.rotrange}deg)`);
                }
            }

            // Mark as ready (no animation running, but interactive)
            cfg._touchModeActive = true;

            // Touch mode does NOT auto-start animation - it's purely user-driven
            // Return here to skip ALL further processing including scheduleCueStart
            return;
        }

        // -----------------------------------------------------------
        // NON-TOUCH MODES: Register with visibility / pause / resume system
        // -----------------------------------------------------------
        registerAnimation(el, "o2p", cfg, () => {
            if (cfg.trig === "edge" && !cfg._edgeTriggered) {
                // console.log("[o2pCue] trig:edge — waiting for playhead", cfg.uid);
                return;
            }

            if (cfg._ghostClickable && cfg._startBlocked) {
                // console.log("[o2pCue] start blocked — ghostClickable waiting for click");
                return;
            }

            applyPrestateOnStart(el, cfg);
            rawStart();
        });

        // Create standard hit label for non-touch modes
        createHitLabel(el, "o2p", cfg.uid, {
            anchorMode: "object",
            color: "purple",
            sizeMode: "follow"
        });

        // -----------------------------------------------------------
        // AUTO-START (tdelay)
        // -----------------------------------------------------------
        if (shouldStartNow) {
            // console.log("[o2pCue] auto-start requested → scheduling", cfg.uid);

            scheduleCueStart(cfg, el, () => {

                if (cfg._ghostClickable && cfg._startBlocked) {
                    // console.log("[o2pCue] delayed start reached — arming ghostClickable", cfg.uid);
                    applyPrestateOnStart(el, cfg);
                    return;
                }

                applyPrestateOnStart(el, cfg);
                rawStart();

            }, cfg.uid);
        }

    } catch (err) {
        // console.error("[o2p] ERROR in handleO2PCue:", err);
    }
}