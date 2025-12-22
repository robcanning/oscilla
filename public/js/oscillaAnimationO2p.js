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

import { registerAnimation, resolveAnimationUid } from "./oscillaAnimation.js";
import { scheduleCueStart } from "./oscillaCueDispatcher.js";
import { createHitLabel, repositionAllHitLabels } from "./oscillaHitLabels.js";

import {
    applyPrestateBeforeStart,
    applyPrestateOnStart,
    armGhostClickable,
    needsArming,
    isOscEnabled,
    ensureAnimWrapper
} from "./oscillaAnimationShared.js";


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

    console.log("[o2p] Captured original center for", wrapper, "→", cx.toFixed(1), cy.toFixed(1));

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

function emitO2POsc({ cfg, uid, path, point, pathT, oscMode }) {
    if (!isOscEnabled(cfg, oscMode)) return;

    const now = performance.now();
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

    if (!Number.isFinite(angle)) angle = 0;

    if (!window.socket || window.socket.readyState !== WebSocket.OPEN) return;

    window.socket.send(JSON.stringify({
        type: "osc_obj2path",
        uid,
        x: normX,
        y: normY,
        angle,
        timestamp: Date.now()
    }));
}


/* ---------------------------------------------------------
 *  8. Continuous mode (forward / reverse)
 * --------------------------------------------------------*/
function startContinuousO2P(el, cfg, virtual, uid) {
    const { dur, loop, startPos, endPos, next, nextOn, oscMode } = cfg;

    // Get or create the animation wrapper
    const wrapper = ensureO2PWrapper(el);
    cfg._wrapper = wrapper;

    // Capture original center (no geometry modification)
    captureOriginalCenter(wrapper);

    // Stop any existing animation
    if (el._o2pAnim) el._o2pAnim.pause?.();

    const easeCtrl = normalizeEase(cfg.ease);
    const tMap = makeTMapper(startPos, endPos);

    const driver = { u: 0 };
    const cycles = loop === 0 ? true : loop;
    const durationMs = dur * 1000;

    // Running animation registry
    if (!window.runningAnimations) window.runningAnimations = {};
    window.runningAnimations[uid] = {
        pause: () => el._o2pAnim?.pause(),
        play: () => el._o2pAnim?.play(),
        resume: () => el._o2pAnim?.play(),
        stop: () => el._o2pAnim?.pause(),
        wasPaused: false
    };

    // Throttle for OSC
    const OSC_THROTTLE_MS = 30;
    cfg._oscLastSent = 0;

    const anim = anime({
        targets: driver,
        u: 1,
        duration: durationMs,
        easing: easeCtrl.next(),
        loop: cycles,
        direction: "normal",

        update: () => {
            const nowTime = performance.now();
            window._o2p_dt = window._o2p_lastTime
                ? (nowTime - window._o2p_lastTime) / 1000
                : 0.016;
            window._o2p_lastTime = nowTime;

            const phase = driver.u;
            let globalT;

            const hasCustomStart = (startPos !== 0);
            const hasCustomEnd = (endPos !== 1);

            if (cfg.mode === "forward") {
                if (hasCustomStart && !hasCustomEnd) {
                    globalT = (startPos + phase) % 1;
                } else {
                    globalT = tMap(phase);
                }
            }
            else if (cfg.mode === "reverse") {
                if (hasCustomStart && !hasCustomEnd) {
                    globalT = (startPos - phase + 1) % 1;
                } else {
                    globalT = tMap(1 - phase);
                }
            }

            const sample = virtual.sample(globalT);
            if (!sample) return;

            const { path, point, pathT } = sample;

            // Compute tangent angle
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

            // Apply transform to WRAPPER
            applyTransform(wrapper, point, angle, cfg);
            repositionAllHitLabels();

            // OSC emit
            if (
                isOscEnabled(cfg, oscMode) &&
                window.socket &&
                window.socket.readyState === WebSocket.OPEN
            ) {
                const now = performance.now();
                if (now - cfg._oscLastSent >= OSC_THROTTLE_MS) {
                    cfg._oscLastSent = now;

                    const bbox = path.getBBox();
                    if (bbox && bbox.width !== 0 && bbox.height !== 0) {
                        const normX = (point.x - bbox.x) / bbox.width;
                        const normY = (point.y - bbox.y) / bbox.height;

                        window.socket.send(JSON.stringify({
                            type: "osc_obj2path",
                            uid: cfg.uid,
                            x: normX,
                            y: normY,
                            angle,
                            t: pathT,
                            timestamp: Date.now()
                        }));
                    }
                }
            }
        },

        loopComplete: () => {
            if (next && nextOn === "cycle") {
                window.handleCueTrigger?.(next);
            }
        },

        complete: () => {
            // Finite loops must reset pose
            if (loop !== 0) {
                positionO2PInitial(el, cfg);
            }

            if (loop !== 0 && next && nextOn === "stop") {
                window.handleCueTrigger?.(next);
            }
        }
    });

    el._o2pAnim = anim;
    cfg._anim = anim;
}


/* ---------------------------------------------------------
 *  9. Alternate mode (true ping-pong)
 * --------------------------------------------------------*/
function startAlternateO2P(el, cfg, virtual, uid) {
    const { dur, loop, startPos, endPos, next, nextOn, oscMode } = cfg;

    // Get or create the animation wrapper
    const wrapper = ensureO2PWrapper(el);
    cfg._wrapper = wrapper;

    // Capture original center (no geometry modification)
    captureOriginalCenter(wrapper);

    if (el._o2pAnim) el._o2pAnim.pause?.();

    const tMap = makeTMapper(startPos, endPos);
    const easeCtrl = normalizeEase(cfg.ease);

    const driver = { u: 0 };
    let remaining = loop === 0 ? Infinity : loop;
    let stopped = false;

    // Running animation registry
    if (!window.runningAnimations) window.runningAnimations = {};
    window.runningAnimations[uid] = {
        pause: () => el._o2pAnim?.pause(),
        resume: () => el._o2pAnim?.play(),
        play: () => el._o2pAnim?.play(),
        stop: () => { stopped = true; el._o2pAnim?.pause(); },
        wasPaused: false
    };

    const OSC_THROTTLE_MS = 30;
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

                    // Apply transform to WRAPPER
                    applyTransform(wrapper, point, angle, cfg);
                    repositionAllHitLabels();

                    // OSC emit
                    if (
                        isOscEnabled(cfg, oscMode) &&
                        window.socket &&
                        window.socket.readyState === WebSocket.OPEN
                    ) {
                        const now = performance.now();
                        if (now - cfg._oscLastSent >= OSC_THROTTLE_MS) {
                            cfg._oscLastSent = now;

                            const bbox = path.getBBox();
                            if (bbox && bbox.width !== 0 && bbox.height !== 0) {
                                const normX = (point.x - bbox.x) / bbox.width;
                                const normY = (point.y - bbox.y) / bbox.height;

                                window.socket.send(JSON.stringify({
                                    type: "osc_obj2path",
                                    uid: cfg.uid,
                                    x: normX,
                                    y: normY,
                                    angle,
                                    t: pathT,
                                    timestamp: Date.now()
                                }));
                            }
                        }
                    }
                },

                complete: resolve
            });

            el._o2pAnim = anim;
            cfg._anim = anim;
        });
    }

    // Ping-pong loop
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


/* ---------------------------------------------------------
 *  10. Dispatcher: startO2PForElement
 * --------------------------------------------------------*/
function startO2PForElement(el, cfg) {
    // Kill existing animation
    if (el._o2pAnim) {
        try { el._o2pAnim.pause(); } catch (_) { }
        el._o2pAnim = null;
    }

    // Normalize mode
    cfg.mode = (cfg.mode ?? "forward").toLowerCase();

    // Build OSC config
    const osc = cfg.osc;
    let oscCfg = { enabled: false, throttle: 30, lastSent: 0 };
    if (osc === false || osc === 0) {
        oscCfg.enabled = false;
    } else if (osc === true) {
        oscCfg.enabled = true;
    } else if (typeof osc === "number") {
        oscCfg.enabled = true;
        oscCfg.throttle = Math.max(5, osc);
    }
    cfg.oscCfg = oscCfg;

    // Resolve path(s)
    const svg = el.ownerSVGElement || document.querySelector("svg");
    const p = svg.querySelector(`#${cfg.path}`);
    if (!p) {
        console.warn("[o2p] Path not found:", cfg.path);
        return;
    }

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
                case "osc": cfg.osc = val; break;

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

        if (!cfg.uid) {
            cfg.uid = "o2p_" + Math.random().toString(36).slice(2, 10);
        }

        console.log("[o2pCue] Parsed:", {
            uid: cfg.uid,
            path: cfg.path,
            trig: cfg.trig,
            startDelay: cfg.startDelay,
            prestate: cfg.prestate
        });

        if (!cfg.path) {
            console.warn("[o2p] Missing path argument.");
            return;
        }

        // -----------------------------------------------------------
        // STORE CFG ON ELEMENT
        // -----------------------------------------------------------
        el._oscillaCfg = cfg;

        const shouldStartNow =
            fromCueTrigger ||
            cfg.trig === "auto" ||
            cfg.trig === "playhead";

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
        // Register with visibility / pause / resume system
        // -----------------------------------------------------------
        registerAnimation(el, "o2p", cfg, () => {
            if (cfg.trig === "edge" && !cfg._edgeTriggered) {
                console.log("[o2pCue] trig:edge — waiting for playhead", cfg.uid);
                return;
            }

            if (cfg._ghostClickable && cfg._startBlocked) {
                console.log("[o2pCue] start blocked — ghostClickable waiting for click");
                return;
            }

            applyPrestateOnStart(el, cfg);
            rawStart();
        });

        createHitLabel(el, "o2p", cfg.uid, {
            anchorMode: "object",
            color: "purple",
            sizeMode: "follow"
        });

        // -----------------------------------------------------------
        // AUTO-START (tdelay)
        // -----------------------------------------------------------
        if (shouldStartNow) {
            console.log("[o2pCue] auto-start requested → scheduling", cfg.uid);

            scheduleCueStart(cfg, el, () => {

                if (cfg._ghostClickable && cfg._startBlocked) {
                    console.log("[o2pCue] delayed start reached — arming ghostClickable", cfg.uid);
                    applyPrestateOnStart(el, cfg);
                    return;
                }

                applyPrestateOnStart(el, cfg);
                rawStart();

            }, cfg.uid);
        }

    } catch (err) {
        console.error("[o2p] ERROR in handleO2PCue:", err);
    }
}