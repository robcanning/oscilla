// o2p.js — Clean Modern Rewrite (patched with rotate modes + logging)
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
// -----------------------------------------------------------

import { registerAnimation } from "./oscillaAnimation.js";
import { scheduleCueStart } from "./oscillaCueDispatcher.js";
import { createHitLabel, repositionAllHitLabels } from "./oscillaHitLabels.js";

import {
    applyPrestateBeforeStart,
    applyPrestateOnStart
} from "./oscillaAnimationShared.js";

/* ---------------------------------------------------------
 *  1. normalizeOrigin(el)
 *     Centers ANY SVG element/group at (0,0)
 *     NOTE: intended to be called ONCE per element.
 * --------------------------------------------------------*/
function normalizeOrigin(el) {
    function flatten(node) {
        try {
            if (typeof SVGPathCommander !== "undefined") {
                SVGPathCommander.toPath(node);
            }
        } catch (_) { }
    }

    // flatten transform on self
    if (el.hasAttribute("transform")) {
        flatten(el);
        el.removeAttribute("transform");
    }

    // flatten child transforms if group
    if (el instanceof SVGGElement) {
        for (const child of [...el.children]) {
            if (child.hasAttribute("transform")) {
                flatten(child);
                child.removeAttribute("transform");
            }
        }
    }

    // compute bbox center
    const bbox = el.getBBox();
    // guard against zero-area / invalid bbox
    if (!bbox || !isFinite(bbox.x) || !isFinite(bbox.y) ||
        !isFinite(bbox.width) || !isFinite(bbox.height) ||
        bbox.width === 0 || bbox.height === 0) {
        console.warn("[o2p] normalizeOrigin: invalid or zero-area bbox for", el.id || el);
        return;
    }

    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;

    // store original center for later compensation
    el._o2pOrigin = { x: cx, y: cy };

    if (!isFinite(cx) || !isFinite(cy)) return;

    // recursive shift so that the center moves to (0,0)
    function shift(node, dx, dy) {
        const tag = node.tagName;

        if (tag === "path") {
            const d = node.getAttribute("d");
            if (d) {
                try {
                    const cmd = new SVGPathCommander(d);
                    node.setAttribute("d", cmd.translate(-dx, -dy).toString());
                } catch (_) { }
            }
        }
        else if (tag === "rect") {
            const x = parseFloat(node.getAttribute("x")) || 0;
            const y = parseFloat(node.getAttribute("y")) || 0;
            node.setAttribute("x", x - dx);
            node.setAttribute("y", y - dy);
        }
        else if (tag === "circle" || tag === "ellipse") {
            const x = parseFloat(node.getAttribute("cx")) || 0;
            const y = parseFloat(node.getAttribute("cy")) || 0;
            node.setAttribute("cx", x - dx);
            node.setAttribute("cy", y - dy);
        }
        else if (tag === "polygon" || tag === "polyline") {
            const pts = node.points;
            for (let i = 0; i < pts.numberOfItems; i++) {
                const p = pts.getItem(i);
                p.x -= dx;
                p.y -= dy;
            }
        }
        else if (node instanceof SVGGElement) {
            for (const c of [...node.children]) shift(c, dx, dy);
        }
    }

    shift(el, cx, cy);
}


/* ---------------------------------------------------------
 *  2. ease controller
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
 *  3. VirtualPath
 *     Unified sampler with segment slicing
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

    // globalT: 0..1 mapped to concatenated paths
    sample(globalT) {
        if (!this.totalLen) return null;

        // clamp to [0,1] to avoid null from tiny FP drift
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
 *  4. Path segment mapper (start/end)
 * --------------------------------------------------------*/
function makeTMapper(start, end) {
    const a = Math.max(0, Math.min(1, start ?? 0));
    const b = Math.max(0, Math.min(1, end ?? 1));
    const d = b - a;
    return t => a + t * d;
}






/* ---------------------------------------------------------
 *  MATRIX HELPERS (inserted for drift-free transforms)
 * --------------------------------------------------------*/

function makeIdentityMatrix() {
    return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function makeTranslationMatrix(tx, ty) {
    return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
}

function makeRotationMatrix(deg) {
    const rad = (deg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
        a: cos,
        b: sin,
        c: -sin,
        d: cos,
        e: 0,
        f: 0
    };
}

// Compose m2 ∘ m1 = apply m1 first, then m2
function multiplyMatrices(m2, m1) {
    return {
        a: m2.a * m1.a + m2.c * m1.b,
        b: m2.b * m1.a + m2.d * m1.b,
        c: m2.a * m1.c + m2.c * m1.d,
        d: m2.b * m1.c + m2.d * m1.d,
        e: m2.a * m1.e + m2.c * m1.f + m2.e,
        f: m2.b * m1.e + m2.d * m1.f + m2.f
    };
}


/* ---------------------------------------------------------
 *  5. TRANSFORM WRITER — rotation around normalized center
 * --------------------------------------------------------*/
function applyTransform(el, point, angleDeg, cfg) {

    const now = performance.now();

    // Human-friendly rotate modes → internal numeric codes
    const rotateModeLookup = {
        "none": 0,
        "aligned": 1,
        "locked": 3,
        "spin": 4
    };

    // -----------------------------------------------------
    // Resolve cfg.rotate to numeric mode (with diagnostics)
    // -----------------------------------------------------
    let mode = cfg.rotate;

    // Log raw input
    // console.log(`[ROT_MODE] raw=${cfg.rotate}`);

    // If rotate is a string, map it to numeric
    if (typeof mode === "string") {
        const key = mode.toLowerCase().trim();
        // console.log(`[ROT_MODE] received string="${key}"`);
        if (rotateModeLookup[key] !== undefined) {
            // console.log(`[ROT_MODE] mapped to numeric=${rotateModeLookup[key]}`);
            mode = rotateModeLookup[key];
        } else {
            // console.warn(`[ROT_MODE] WARNING: unknown mode "${key}" — using fallback 0`);
            mode = 0;
        }
    }

    // Fallback if it failed
    if (!Number.isFinite(mode)) {
        // console.warn(`[ROT_MODE] WARNING: mode not numeric (${mode}) — using fallback 0`);
        mode = 0;
    }

    // Final output for diagnostics
    // console.log(`[ROT_MODE] final internal mode=${mode}`);


    let tx = point.x;
    let ty = point.y;

    const tag = el.tagName.toLowerCase();

    // compensate for origin normalization for paths / groups
    if (tag === "path" || tag === "g") {
        tx -= (el._o2pOrigin?.x || 0);
        ty -= (el._o2pOrigin?.y || 0);
    }

    // base translation
    let t = `translate(${tx}, ${ty})`;

    // const rotate = cfg.rotate || 0;

    if (!isFinite(angleDeg)) angleDeg = 0;

    switch (mode) {

        case 0:
            // no rotation
            break;

        case 1:
            // tangent
            t += ` rotate(${angleDeg})`;
            break;

        case 2:
            // tangent + static offset
            t += ` rotate(${angleDeg + (cfg.rotoffset || 0)})`;
            break;

        case 3:
            // locked heading
            t += ` rotate(${cfg.rotlock || 0})`;
            break;

        case 4:
            if (!el._o2pFreeSpin) el._o2pFreeSpin = 0;
            {
                // smooth dt
                let dt;
                if (el._o2pLastSpinTime == null) {
                    dt = window._o2p_dt || 0.016;
                } else {
                    dt = (now - el._o2pLastSpinTime) / 1000;
                    if (dt > 0.05) dt = 0.05;
                }
                el._o2pLastSpinTime = now;

                // interpret rotspeed as "seconds per revolution"
                const secPerRev = cfg.rotspeed || 1;
                const degPerSecond = 360 / secPerRev;
                const dir = cfg.rotdir || 1;

                el._o2pFreeSpin += degPerSecond * dir * dt;
                t += ` rotate(${el._o2pFreeSpin})`;

                // debug
                if (!window._o2p_lastSpin || (now - window._o2p_lastSpin) > 800) {
                    // console.log(
                    //     `[o2p-spin] ${el.id || cfg.uid}: ` +
                    //     `${(360 / secPerRev).toFixed(1)}°/sec  (dt=${dt.toFixed(3)}s)`
                    // );
                    window._o2p_lastSpin = now;
                }
            }
            break;


    }

    el.setAttribute("transform", t);
    el.style.transform = "";

    if (!window._o2p_lastXformLog || (now - window._o2p_lastXformLog) > 1500) {
        // console.log(`[o2p-xform] ${el.id || cfg.uid}: ${t}`);
        window._o2p_lastXformLog = now;
    }
}


/* ---------------------------------------------------------
 *  6. OSC emitter
 * --------------------------------------------------------*/
function emitO2POsc({ uid, path, point, pathT, oscCfg }) {
    if (!oscCfg.enabled) return;

    const now = performance.now();
    if (now - oscCfg.lastSent < oscCfg.throttle) return;
    oscCfg.lastSent = now;

    const bbox = path.getBBox();
    if (!bbox || bbox.width === 0 || bbox.height === 0) {
        // avoid NaNs in normalisation
        return;
    }

    const normX = (point.x - bbox.x) / bbox.width;
    const normY = (point.y - bbox.y) / bbox.height;

    const length = path.getTotalLength();
    const EPS = 0.1;
    const localL = pathT * length;
    const aheadLen = Math.min(length - EPS, Math.max(0, localL + EPS));
    const ahead = path.getPointAtLength(aheadLen);
    let angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);
    if (!isFinite(angle)) angle = 0;

    if (!window.socket || window.socket.readyState !== WebSocket.OPEN) return;

    window.socket.send(
        JSON.stringify({
            type: "osc_obj2path",
            uid,
            x: normX,
            y: normY,
            angle
        })
    );
}

/* ---------------------------------------------------------
 *  7. Continuous mode (forward/reverse)
 * --------------------------------------------------------*/
function startContinuousO2P(el, cfg, virtual, uid) {
    const { dur, loop, oscCfg, start, end, next, nextOn } = cfg;

    // normalize origin ONCE only
    if (!el._originNormalized) {
        normalizeOrigin(el);
        el._originNormalized = true;
    }

    if (el._o2pAnim) el._o2pAnim.pause?.();

    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "center";

    const easeCtrl = normalizeEase(cfg.ease);
    const tMap = makeTMapper(start, end);

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

    const anim = anime({
        targets: driver,
        u: 1,
        duration: durationMs,
        easing: easeCtrl.next(),
        loop: cycles,
        direction: "normal",

        update: () => {

            // free-spin timing support (dt)
            const nowTime = performance.now();
            window._o2p_dt = window._o2p_lastTime ? (nowTime - window._o2p_lastTime) / 1000 : 0.016;
            window._o2p_lastTime = nowTime;

            let phase = driver.u;  // 0..1 progression
            let globalT;

            const hasCustomStart = (cfg.start !== 0);
            const hasCustomEnd = (cfg.end !== 1);

            if (cfg.mode === "forward") {

                // start-only forward → orbit shift
                if (hasCustomStart && !hasCustomEnd) {
                    globalT = (cfg.start + phase) % 1;
                }
                // segment
                else {
                    globalT = tMap(phase);
                }
            }

            else if (cfg.mode === "reverse") {

                // start-only reverse → orbit shift backward
                if (hasCustomStart && !hasCustomEnd) {
                    globalT = (cfg.start - phase + 1) % 1;
                }
                // segment
                else {
                    const phaseRev = 1 - phase;
                    globalT = tMap(phaseRev);
                }
            }


            // --------------------------------------
            //   SAMPLE FROM PATH
            // --------------------------------------
            const sample = virtual.sample(globalT);
            if (!sample) return;

            const { path, point, pathT } = sample;

            const length = path.getTotalLength();
            const EPS = 0.1;
            const localL = pathT * length;
            const aheadLen = Math.min(length - EPS, Math.max(0, localL + EPS));
            const ahead = path.getPointAtLength(aheadLen);
            let angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);
            if (!isFinite(angle)) angle = 0;

            applyTransform(el, point, angle, cfg);
            emitO2POsc({ uid, path, point, pathT, oscCfg });
        },

        loopComplete: () => {
            if (next && nextOn === "cycle") {
                window.handleCueTrigger?.(next);
            }
        },

        complete: () => {
            if (loop !== 0 && next && nextOn === "stop") {
                window.handleCueTrigger?.(next);
            }
        }
    });

    el._o2pAnim = anim;
}



/* ---------------------------------------------------------
 *  8. Alternate mode (true ping-pong)
 * --------------------------------------------------------*/
function startAlternateO2P(el, cfg, virtual, uid) {
    const { dur, loop, oscCfg, start, end, next, nextOn } = cfg;

    if (!el._originNormalized) {
        normalizeOrigin(el);
        el._originNormalized = true;
    }

    if (el._o2pAnim) el._o2pAnim.pause?.();
    el.style.transformBox = "fill-box";
    el.style.transformOrigin = "center";

    const tMap = makeTMapper(start, end);
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
                    window._o2p_dt = window._o2p_lastTime ? (nowTime - window._o2p_lastTime) / 1000 : 0.016;
                    window._o2p_lastTime = nowTime;

                    let phase = driver.u;
                    let globalT = tMap(phase);

                    const isRev = (cfg.mode === "reverse");
                    const firstFrame = (phase === 0);

                    // If reverse but at first frame → start at `cfg.start`
                    if (isRev && firstFrame) {
                        globalT = cfg.start;
                    }
                    // Otherwise reverse works as reflection across segment
                    else if (isRev) {
                        globalT = cfg.end + cfg.start - globalT;
                    }


                    const sample = virtual.sample(globalT);
                    if (!sample) return;

                    const { path, point, pathT } = sample;

                    const length = path.getTotalLength();
                    const EPS = 0.1;
                    const localL = pathT * length;
                    const aheadLen = Math.min(length - EPS, Math.max(0, localL + EPS));
                    const ahead = path.getPointAtLength(aheadLen);
                    let angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);
                    if (!isFinite(angle)) angle = 0;

                    applyTransform(el, point, angle, cfg);
                    emitO2POsc({ uid, path, point, pathT, oscCfg });
                },

                complete: resolve
            });

            el._o2pAnim = anim;
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


/* ---------------------------------------------------------
 *  9. Dispatcher: startO2PForElement
 * --------------------------------------------------------*/
function startO2PForElement(el, cfg) {
    // kill existing
    if (el._o2pAnim) {
        try { el._o2pAnim.pause(); } catch (_) { }
        el._o2pAnim = null;
    }

    // normalize mode
    cfg.mode = (cfg.mode ?? "forward").toLowerCase();

    // build OSC config
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

    // resolve path(s)
    const svg = el.ownerSVGElement || document.querySelector("svg");
    const p = svg.querySelector(`#${cfg.path}`);
    if (!p) {
        console.warn("[o2p] Path not found:", cfg.path);
        return;
    }

    const virtual = new VirtualPath([p]);
    if (!virtual.totalLen) return;

    const uid = cfg.uid || el.id || ("o2p_" + Math.random().toString(36).slice(2));
    cfg.uid = uid;

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
 *  10. Cue handler: handleO2PCue
 * --------------------------------------------------------*/
// ============================================================================
// O2P cue handler — supports tdelay + prestate(show|hide|ghost|fadein)
// ============================================================================
export function handleO2PCue(el, args, options = {}) {
    const { fromCueTrigger = false } = options;

    try {
        if (!Array.isArray(args)) args = [];

        // -----------------------------------------------------------
        // BASE CFG — shared prestate and scheduling system
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

            start: 0,
            end: 1,

            // unified tdelay/start:N
            startDelay: 0,

            // unified prestates (show | hide | ghost | fadein(ms) | ghostClickable(ms))
            prestate: "show",

            uid: null,
            next: null,
            nextOn: null,
            trig: "auto",

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

                case "mode": cfg.mode = String(val).toLowerCase(); break;

                case "dur": cfg.dur = Number(val) || 1; break;
                case "loop": cfg.loop = Number(val) || 0; break;

                case "rotate":
                    if (typeof val === "string") {
                        const v = val.toLowerCase().trim();
                        if (/^-?\d+(\.\d+)?$/.test(v)) cfg.rotate = Number(v);
                        else cfg.rotate = v;
                    } else cfg.rotate = val;
                    break;

                case "rotoffset": cfg.rotoffset = Number(val) || 0; break;
                case "rotlock": cfg.rotlock = Number(val) || 0; break;
                case "rotspeed": cfg.rotspeed = Number(val) || 0; break;
                case "rotdir": cfg.rotdir = Number(val) || 1; break;

                case "ease": cfg.ease = val; break;
                case "osc": cfg.osc = val; break;

                case "start": cfg.start = Number(val) || 0; break;
                case "end": cfg.end = Number(val) || 1; break;

                // unified trigger delay
                case "tdelay": cfg.startDelay = Number(val) || 0; break;

                case "prestate": cfg.prestate = val; break;

                case "uid": cfg.uid = val; break;
                case "next": cfg.next = val; break;
                case "nextOn": cfg.nextOn = val; break;

                case "trig": cfg.trig = String(val).toLowerCase(); break;
            }
        }

        // scheduler uses cfg.start as the field
        cfg.start = cfg.startDelay;

        // mode aliases
        if (cfg.mode === "fwd") cfg.mode = "forward";
        if (cfg.mode === "rev") cfg.mode = "reverse";
        if (cfg.mode === "alt") cfg.mode = "alternate";

        // uid fallback
        if (!cfg.uid) {
            cfg.uid = el.id || ("o2p_" + Math.random().toString(36).slice(2));
        }

        console.log("[o2pCue] Parsed:", {
            uid: cfg.uid,
            path: cfg.path,
            trig: cfg.trig,
            tdelay: cfg.start,
            prestate: cfg.prestate,
        });

        if (!cfg.path) {
            console.warn("[o2p] Missing path argument.");
            return;
        }

        const shouldStartNow =
            fromCueTrigger || cfg.trig === "auto" || cfg.trig === "playhead";


        // -----------------------------------------------------------
        // PRESTATE BEFORE START (sets initial opacity, block flags, etc.)
        // -----------------------------------------------------------
        applyPrestateBeforeStart(el, cfg);

        // Bring element above others so clicks reach it.
        try { el.parentNode.appendChild(el); } catch (e) { }

        // -----------------------------------------------------------
        // Pre-position object along the path (no animation)
        // -----------------------------------------------------------
        positionO2PInitial(el, cfg);


        // -----------------------------------------------------------
        // Real animation start function
        // IMPORTANT: cfg._start must be set so ghostClickable can trigger it.
        // -----------------------------------------------------------
        const rawStart = () => {
            console.log("[o2pCue] ▶ Starting O2P animation →", cfg.uid);
            startO2PForElement(el, cfg);
        };

        cfg._start = rawStart;  // required for ghostClickable click activation


        // -----------------------------------------------------------
        // Provide applyPrestateOnStart to scheduler and ghostClickable logic
        // -----------------------------------------------------------
        cfg._applyPrestateOnStart = () => applyPrestateOnStart(el, cfg);


        // -----------------------------------------------------------
        // Register for visibility/pause/resume system
        // -----------------------------------------------------------
        registerAnimation(el, "o2p", cfg, () => {

            // ghostClickable: block animation until user clicks
            if (cfg._ghostClickable && cfg._startBlocked) {
                console.log("[o2pCue] start blocked — ghostClickable waiting for user click");
                return;
            }

            // normal case
            applyPrestateOnStart(el, cfg);
            rawStart();
        });

        createHitLabel(el, "o2p", cfg.uid, {
            anchorMode: "followSizeMidPoint",
            color: "purple"
        });


        // -----------------------------------------------------------
        // AUTO-START (tdelay / start:N)
        // -----------------------------------------------------------
        if (shouldStartNow) {
            console.log("[o2pCue] auto-start requested → scheduling", cfg.uid);

            scheduleCueStart(cfg, el, () => {

                // ghostClickable: run prestates only, don't start animation
                if (cfg._ghostClickable && cfg._startBlocked) {
                    console.log("[o2pCue] delayed start reached — ghostClickable fade in only", cfg.uid);

                    if (cfg._applyPrestateOnStart)
                        cfg._applyPrestateOnStart();

                    return;  // wait for user click
                }

                // normal animation start
                applyPrestateOnStart(el, cfg);
                rawStart();

            }, cfg.uid);
        }

    } catch (err) {
        console.error("[o2p] ERROR in handleO2PCue:", err);
    }
}






function positionO2PInitial(el, cfg) {
    try {
        // ensure origin normalization (same as engine)
        if (!el._originNormalized) {
            normalizeOrigin(el);
            el._originNormalized = true;
        }

        const pathEl = document.getElementById(cfg.path);
        if (!pathEl) {
            console.warn("[o2p] Initial position: path not found:", cfg.path);
            return;
        }

        const length = pathEl.getTotalLength();
        const t = cfg.start ?? 0;
        const localL = t * length;

        const point = pathEl.getPointAtLength(localL);

        // compute tangent for initial angle (same math as engine)
        const EPS = 0.1;
        const aheadLen = Math.min(length - EPS, Math.max(0, localL + EPS));
        const ahead = pathEl.getPointAtLength(aheadLen);
        let angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);
        if (!isFinite(angle)) angle = 0;

        // use the SAME transform writer as the main engine
        applyTransform(el, point, angle, cfg);

    } catch (err) {
        console.error("[o2p] Error in positionO2PInitial:", err);
    }
}

