// rotate.js — OscillaScore Rotate Cue (sequence + continuous)

import { registerAnimation } from "./oscillaAnimation.js";
import { scheduleCueStart } from "../oscillaCueDispatcher.js";
import { createHitLabel, repositionAllHitLabels } from "../oscillaHitLabels.js";
import {
    applyPrestateBeforeStart,
    applyPrestateOnStart,
    ensureAnimWrapper,
    installOscToggleHandler,
    armGhostClickable,
    needsArming,
    needsFadeIn,
    triggerFadeIn,
    isOscEnabled
} from "./oscillaAnimationShared.js";

import { sendOSCMessage, createOscOverlay } from "./oscillaOSC.js";
import { publish } from '../oscillaParamBinding.js';


// ============================================================
// OSC send helper for ROTATION
// - wraps angle into [0, 360)
// - also sends radians + 0–1 normalised
// - respects optional cfg.oscAddr (from oscaddr:"...")
// ============================================================
function sendOSCRotation(cfg, angle) {
    const raw = Number(angle);

    // Safety — avoid NaN propagation
    const safe = Number.isFinite(raw) ? raw : 0;

    // wrap into [0,360)
    const deg = ((safe % 360) + 360) % 360;
    const rad = deg * (Math.PI / 180);
    const norm = deg / 360;

    const addr =
        cfg.oscaddr ??
        cfg.oscAddr ??
        cfg.addr ??
        null;

    const payload = {
        type: "osc_rotate",
        uid: cfg.uid,
        deg,
        rad,
        norm,
        timestamp: Date.now()
    };

    if (addr) payload.addr = addr;

    sendOSCMessage(payload);
}

// ============================================================
// Pattern Generators (Pseq, Prand, Pxrand, Pshuf)
// — mirrors scale.js / previous rotate logic
// ============================================================
function makePatternGenerator(pattern) {
    if (!pattern || !pattern.values || !Array.isArray(pattern.values)) {
        console.warn("[rotate] makePatternGenerator: invalid pattern:", pattern);
        return { next: () => null };
    }

    // Literal list → Pseq(..., inf)
    if (Array.isArray(pattern.values) && !pattern.name) {
        let arr = pattern.values.slice();
        let i = 0;
        return {
            next() {
                const v = arr[i % arr.length];
                i++;
                return v;
            }
        };
    }

    const values = pattern.values.slice();
    let repeats = pattern.repeats;
    if (repeats === "inf" || repeats === Infinity || repeats == null) repeats = Infinity;
    else {
        repeats = Number(repeats);
        if (Number.isNaN(repeats)) repeats = 1;
    }

    let index = 0;
    let last = null;
    let cycleCount = 0;

    switch (pattern.name) {
        case "Pseq":
            return {
                next() {
                    const v = values[index];
                    index++;
                    if (index >= values.length) {
                        index = 0;
                        cycleCount++;
                        if (cycleCount >= repeats) return null;
                    }
                    return v;
                }
            };

        case "Prand":
            return {
                next() {
                    if (cycleCount >= repeats) return null;
                    const v = values[Math.floor(Math.random() * values.length)];
                    cycleCount += 1 / values.length;
                    return v;
                }
            };

        case "Pxrand":
            return {
                next() {
                    if (cycleCount >= repeats) return last;
                    let v;
                    do {
                        v = values[Math.floor(Math.random() * values.length)];
                    } while (v === last && values.length > 1);
                    last = v;
                    cycleCount += 1 / values.length;
                    return v;
                }
            };

        case "Pshuf": {
            let buf = shuffle(values);
            return {
                next() {
                    if (index >= buf.length) {
                        index = 0;
                        buf = shuffle(values);
                        cycleCount++;
                        if (cycleCount >= repeats) return null;
                    }
                    const v = buf[index];
                    index++;
                    return v;
                }
            };
        }
    }

    console.warn("[rotate] makePatternGenerator: unknown pattern type:", pattern.name);
    return { next: () => null };
}

function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ============================================================
// Utilities: pivot + current angle
// ============================================================
function applySvgPivot(el) {
    if (!el.getBBox) return;
    const bb = el.getBBox();
    if (!bb || bb.width === 0 || bb.height === 0) return;
    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;
    el.style.transformOrigin = `${cx}px ${cy}px`;
}

function getCurrentAngle(el, fallback = 0) {
    const t = el.style.transform || "";
    const m = t.match(/rotate\(\s*([-\d.+eE]+)deg/);
    if (!m) return fallback;
    const v = parseFloat(m[1]);
    return Number.isFinite(v) ? v : fallback;
}


// ======================================================================
//  ROTATION SEQUENCE ENGINE (sequence / patterns / lists)
//  handleRotateSequence(el, cfg)
// ======================================================================
export function handleRotateSequence(el, cfg) {

    const astArgs = cfg.astArgs || [];

    // Value source
    let values = cfg.values || null;      // literal list
    let pattern = cfg.pattern || null;    // pattern object

    // Duration
    let dur = 1;
    let durGen = null;

    // Behaviour
    let mode = "loop";                    // loop | once | alternate
    let pauseOnExit = true;
    let interp = "smooth";                // smooth | step
    let ease = "linear";
    let hold = null;
    let oscMode = 0;                      // 0 off, 1 continuous, 2 per-step

    // Pattern generator
    let valueGen = null;

    // ------------------------------------------------------------
    // Parse AST args
    // ------------------------------------------------------------
    for (const arg of astArgs) {
        const key = arg.key || arg.type;
        const val = arg.value;

        switch (key) {
            case "values":
                if (val && val.type === "pattern") {
                    pattern = val;
                } else if (Array.isArray(val)) {
                    values = val.slice();
                }
                break;

            case "dur":
                if (val && val.type === "pattern") {
                    durGen = makePatternGenerator(val);
                } else if (Array.isArray(val)) {
                    durGen = makePatternGenerator({ values: val });
                } else {
                    dur = Number(val) || 1;
                }
                break;

            case "mode":
                mode = String(val).trim().toLowerCase();
                break;

            case "pauseOnExit":
                pauseOnExit = Boolean(val);
                break;

            case "interp":
                interp = String(val).trim().toLowerCase();
                break;

            case "ease":
                ease = String(val).trim();
                break;

            case "hold":
                hold = Number(val);
                break;

            case "osc":
                oscMode = Number(val) || 0;
                break;

            // NEW: accept explicit OSC address
            case "oscaddr":
            case "oscAddr":
                cfg.oscAddr = String(val).trim();
                break;



                
            default:
                break;
        }
    }

    // Determine value generator
    if (pattern) {
        valueGen = makePatternGenerator(pattern);
        values = null;
    }

    if (!values && !valueGen) {
        console.warn("[rotate] No value source (values:[] or pattern) for rotateSequence");
        return;
    }

    // Default hold behaviour
    if (interp === "smooth") {
        if (hold === null || Number.isNaN(hold)) {
            hold = dur * 0.25;
        }
    }
    if (interp === "step") {
        hold = 0;
    }

    // Stop previous
    if (el._oscillaRotateAnim) {
        el._oscillaRotateAnim.pause?.();
        clearTimeout(el._oscillaRotateAnim);
        el._oscillaRotateAnim = null;
    }

    applySvgPivot(el);

    // ----------------------------------------------
    // OVERLAY (anchors to rotating element, center)
    // only when OSC is actually enabled
    // ----------------------------------------------
    if (cfg._overlay) {
        cfg._overlay.destroy();
        cfg._overlay = null;
    }

    const wrapper = ensureAnimWrapper(el);

    if (isOscEnabled(cfg, oscMode)) {
        cfg._overlay = createOscOverlay({
            anchorEl: wrapper,
            label: cfg.oscAddr || cfg.uid || "rotate",
            anchorMode: "center",
            mode: "auto"
        });

        cfg._overlay.update("…");
        cfg._overlay.position();
    }

    // Literal list indexing
    const N = Array.isArray(values) ? values.length : Infinity;
    let index = 0;
    let direction = 1;

    // Driver angle
    const startAngle = getCurrentAngle(el, values?.[0] ?? 0);
    const norm = ((startAngle % 360) + 360) % 360;
    const driver = { a: norm };

    // ------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------
    function nextAngle() {
        if (valueGen) {
            const v = valueGen.next();
            if (v == null) return null;
            return Number(v);
        }

        if (Array.isArray(values) && N > 0) {
            return Number(values[index % N]);
        }

        return driver.a;
    }

    function stepIndexAdvance() {
        if (valueGen) return; // pattern generator drives repetition

        const len = Array.isArray(values) ? values.length : 0;
        const first = Array.isArray(values) ? values[0] : null;
        const last = Array.isArray(values) ? values[len - 1] : null;
        const pingpong = len >= 2 && first === last;

        if (mode === "alternate" || pingpong) {
            index += direction;
            if (index >= N || index < 0) {
                direction *= -1;
                index += direction;
            }
        } else {
            index = (index + 1) % N;
        }
    }

    function atEndOnce() {
        return (!valueGen && mode === "once" && index >= N);
    }

    // ------------------------------------------------------------
    // Main step engine
    // ------------------------------------------------------------
    function runNext() {
        const targetRaw = nextAngle();
        if (targetRaw == null || atEndOnce()) {
            if (!pauseOnExit && Array.isArray(values) && values.length > 0) {
                el.style.transform = `rotate(${values[0]}deg)`;
            }

            // cleanup overlay on finish
            if (cfg._overlay) {
                cfg._overlay.destroy();
                cfg._overlay = null;
            }

            el._oscillaRotateAnim = null;
            return;
        }

        let tgt = ((Number(targetRaw) % 360) + 360) % 360;

        // STEP MODE
        const durRaw = durGen ? durGen.next() : dur;
        const stepDur = Number(durRaw) || dur || 0.0001;

        if (interp === "step") {
            driver.a = tgt;
            el.style.transform = `rotate(${tgt}deg)`;

            if (cfg._overlay) {
                cfg._overlay.update(`deg:${tgt.toFixed(1)}`);
            }

            if (isOscEnabled(cfg, oscMode)) {
                sendOSCRotation(cfg, Number(tgt) || 0);
            }

            stepIndexAdvance();
            el._oscillaRotateAnim = setTimeout(
                () => requestAnimationFrame(runNext),
                stepDur * 1000
            );
            return;
        }

        // SMOOTH MODE — drift-compensated
        let current = getCurrentAngle(el, driver.a);
        current = ((current % 360) + 360) % 360;
        driver.a = current;

        if (driver.a === tgt) {
            stepIndexAdvance();
            requestAnimationFrame(runNext);
            return;
        }

        let delta = tgt - driver.a;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        const anim = anime({
            targets: driver,
            a: driver.a + delta,
            duration: stepDur * 1000,
            easing: ease,

            update: () => {
                repositionAllHitLabels();

                let a = ((driver.a % 360) + 360) % 360;
                            const angleDeg = Number(a) || 0;

                el.style.transform = `rotate(${a}deg)`;


                
                if (cfg._overlay) {
                    cfg._overlay.update(`deg:${a.toFixed(1)}`);
                }



            // ========== CONTROL PLANE PUBLISH ==========
            const wrapped = ((angleDeg % 360) + 360) % 360;
            publish("rotate", cfg.uid, {
                angle: wrapped,
                rad: wrapped * (Math.PI / 180),
                norm: wrapped / 360
            });
            // ============================================


                if (isOscEnabled(cfg, oscMode)) {
                    sendOSCRotation(cfg, Number(a) || 0);
                }
            },

            complete: () => {
                if (isOscEnabled(cfg, oscMode)) {
                    const a = getCurrentAngle(el, 0);
                    sendOSCRotation(cfg, Number(a) || 0);
                }
            }
        });

        el._oscillaRotateAnim = anim;
        cfg._anim = anim;
    }

    requestAnimationFrame(runNext);
}


// ============================================================
// Continuous fallback rotation (no values:[] provided)
// ============================================================
export function handleRotateContinuous(el, cfg) {

    const astArgs = cfg.astArgs || [];

    let dir = 1;
    let dur = 2;
    let loop = 0;
    let ease = "linear";
    let mode = "loop";  // kept for completeness
    let oscMode = 0;

    for (const arg of astArgs) {
        const key = arg.key || arg.type;
        const value = arg.value;

        if (key === "dir") dir = Number(value);
        if (key === "dur") dur = Number(value);
        if (key === "loop") loop = Number(value);
        if (key === "ease") ease = String(value).trim();
        if (key === "mode") mode = String(value).trim().toLowerCase();
        if (key === "osc") oscMode = Number(value) || 0;

        if (key === "oscaddr") {
            cfg.oscAddr = String(value).trim();
        }
    }

    // stop existing animation if active
    if (el._oscillaRotateAnim) el._oscillaRotateAnim.pause?.();

    const animEl = ensureAnimWrapper(el);

    applySvgPivot(animEl);

    // ----------------------------------------------
    // OVERLAY (anchor to center of wrapper)
    // ----------------------------------------------
    if (cfg._overlay) {
        cfg._overlay.destroy();
        cfg._overlay = null;
    }

    const wrapper = ensureAnimWrapper(el);

    // only show overlay if OSC actually enabled
    if (isOscEnabled(cfg, oscMode)) {
        cfg._overlay = createOscOverlay({
            anchorEl: wrapper,
            label: cfg.oscAddr || cfg.uid || "rotate",
            anchorMode: "center",
            mode: "auto"
        });

        cfg._overlay.update("…");
        cfg._overlay.position();
    }

    const fullTurn = dir * 360;
    const ms = dur * 1000;

    const anim = anime({
        targets: animEl,
        rotate: `+=${fullTurn}`,
        duration: ms,
        easing: ease,
        loop: loop === 0 ? true : loop,

        // glue hit-circles to object while rotating
        update: () => {
            try { repositionAllHitLabels(); } catch (e) { }

            // Always get current angle for publishing
            const a = getCurrentAngle(animEl, 0);
            const angleDeg = Number(a) || 0;

            // OSC output (if enabled)
            if (isOscEnabled(cfg, oscMode)) {
                sendOSCRotation(cfg, angleDeg);

                if (cfg._overlay) {
                    cfg._overlay.update(`deg:${(((angleDeg % 360) + 360) % 360).toFixed(1)}`);
                }
            }

            // ========== CONTROL PLANE PUBLISH ==========
            const wrapped = ((angleDeg % 360) + 360) % 360;
            publish("rotate", cfg.uid, {
                angle: wrapped,                    // degrees 0-360
                rad: wrapped * (Math.PI / 180),   // radians 0-2π
                norm: wrapped / 360               // normalized 0-1
            });
            // ============================================
        }
    });

    el._oscillaRotateAnim = anim;
    cfg._anim = anim;
}


// ============================================================================
// ROTATE cue handler — supports tdelay + prestate(show|hide|ghost|fadein)
// With three-phase ghostClickable: REGISTERED → ARMED → RUNNING
// ============================================================================
export function handleRotateCue(el, astArgs, options = {}) {

    if (!el) return;

    const { fromCueTrigger = false } = options;

    // CHECK: playhead trigger for already-registered element?
    const existingCfg = el._oscillaCfg;

    if (fromCueTrigger && existingCfg && existingCfg._ghostClickable) {
        if (needsArming(existingCfg)) {
            armGhostClickable(el, existingCfg);
        }
        return;
    }

    // CHECK: playhead trigger for fadein element?
    if (fromCueTrigger && existingCfg && existingCfg._fadeInMs) {
        if (needsFadeIn(existingCfg)) {
            triggerFadeIn(el, existingCfg);
        }
        return;
    }

    // ---------------------------------
    // Parse trig, uid, tdelay, prestate
    // ---------------------------------
    let trig = "auto";
    let uid = el.id || ("rotate_" + Math.random().toString(36).slice(2));
    let cfgStartDelay = 0;
    let prestate = "show";

    for (const a of astArgs) {
        const key = a.key || a.type;
        const val = a.value;

        if (key === "trig") trig = String(val).toLowerCase();
        if (key === "uid") uid = String(val).trim();
        if (key === "tdelay") cfgStartDelay = Number(val) || 0;

        if (key === "prestate" && val != null) {
            prestate = val;
        }
    }

    const shouldStartNow =
        fromCueTrigger || trig === "auto" || trig === "playhead";

    // ----------------------------------------------------
    // BASE CFG (shared across modes)
    // ----------------------------------------------------
    const baseCfg = {
        uid,
        trig,
        start: cfgStartDelay,
        prestate,
        astArgs,
        fromCueTrigger,
        kind: "rotate",
        _anim: null
    };

    // ensure the element actually receives clicks
    el.style.pointerEvents = "all";
    try { el.parentNode.appendChild(el); } catch (e) { }

    function makeRawStart(cfg, modeFn) {
        return () => {
            modeFn(el, cfg);
        };
    }

    function wrapStart(cfg, rawStartFn) {
        cfg._start = rawStartFn;
        cfg._applyPrestateOnStart = () => applyPrestateOnStart(el, cfg);

        return () => {
            if (cfg.start > 0) {
                scheduleCueStart(
                    cfg,
                    el,
                    () => {
                        if (cfg._ghostClickable && cfg._startBlocked) {
                            applyPrestateOnStart(el, cfg);
                            return;
                        }

                        applyPrestateOnStart(el, cfg);
                        rawStartFn();
                    },
                    cfg.uid
                );

            } else {
                if (cfg._ghostClickable && cfg._startBlocked) {
                    applyPrestateOnStart(el, cfg);
                    return;
                }
                applyPrestateOnStart(el, cfg);
                rawStartFn();
            }
        };
    }

    // ----------------------------------------------------
    // SEQUENCE MODE 1: Pattern sequence
    // ----------------------------------------------------
    const valuesArg = astArgs.find(o =>
        o.key === "values" || o.type === "values"
    );

    if (valuesArg && valuesArg.value?.type === "pattern") {
        const v = valuesArg.value;
        const cfg = {
            ...baseCfg,
            pattern: v,
            mode: "sequence-pattern"
        };

        el._oscillaCfg = cfg;

        installOscToggleHandler(el, cfg);
        applyPrestateBeforeStart(el, cfg);

        if (Array.isArray(v.values)) {
            try {
                const angle = v.values[0];
                el.style.transform = `rotate(${angle}deg)`;
            } catch { }
        }

        const rawStart = makeRawStart(cfg, handleRotateSequence);
        const start = wrapStart(cfg, rawStart);

        registerAnimation(el, "rotate-sequence", cfg, start);

        createHitLabel(el, "rotate", cfg.uid, {
            anchorMode: "pathStart",
            color: "cyan",
            sizeMode: "rotate40"
        });

        if (shouldStartNow) start();
        return;
    }

    // ----------------------------------------------------
    // SEQUENCE MODE 2: Literal sequence
    // ----------------------------------------------------
    if (valuesArg && Array.isArray(valuesArg.value)) {
        const cfg = {
            ...baseCfg,
            values: valuesArg.value,
            mode: "sequence"
        };

        el._oscillaCfg = cfg;
        el.dataset.oscillaUid = cfg.uid;

        installOscToggleHandler(el, cfg);
        applyPrestateBeforeStart(el, cfg);

        try {
            const angle = cfg.values[0];
            el.style.transform = `rotate(${angle}deg)`;
        } catch { }

        const rawStart = makeRawStart(cfg, handleRotateSequence);
        const start = wrapStart(cfg, rawStart);

        registerAnimation(el, "rotate-sequence", cfg, start);

        createHitLabel(el, "rotate", cfg.uid, {
            anchorMode: "pathStart",
            color: "cyan",
            sizeMode: "rotate40"
        });

        if (shouldStartNow) start();
        return;
    }

    // ----------------------------------------------------
    // CONTINUOUS MODE
    // ----------------------------------------------------
    const cfg = {
        ...baseCfg,
        mode: "continuous"
    };

    el._oscillaCfg = cfg;

    applyPrestateBeforeStart(el, cfg);

    const rawStart = makeRawStart(cfg, handleRotateContinuous);
    const start = wrapStart(cfg, rawStart);

    registerAnimation(el, "rotate-fallback", cfg, start);

    createHitLabel(el, "rotate", cfg.uid, {
        anchorMode: "pathStart",
        color: "cyan",
        sizeMode: "rotate40"
    });

    if (shouldStartNow) start();
}
