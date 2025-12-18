// rotate.js â€” OscillaScore Rotate Cue (sequence + continuous)

import { registerAnimation } from "./oscillaAnimation.js";
import { scheduleCueStart } from "./oscillaCueDispatcher.js";
import { createHitLabel, repositionAllHitLabels } from "./oscillaHitLabels.js";

import {
    applyPrestateBeforeStart,
    applyPrestateOnStart
} from "./oscillaAnimationShared.js";

// ============================================================
// OSC send helper for ROTATION
// ============================================================
function sendOSCRotation(el, angle) {
    if (!window.socket) return;

    const uid = el.id || el.dataset.uid || null;

    const msg = {
        type: "osc_rotate",
        uid,
        angle: Number(angle),
        timestamp: Date.now()
    };

    try {
        window.socket.send(JSON.stringify(msg));
        // console.log("[rotate][osc]:", msg);
    } catch (e) {
        console.warn("[rotate][osc] send failed:", e);
    }
}

// ============================================================
// Pattern Generators (Pseq, Prand, Pxrand, Pshuf)
// â€” mirrors scale.js / previous rotate logic
// ============================================================
function makePatternGenerator(pattern) {
    if (!pattern || !pattern.values || !Array.isArray(pattern.values)) {
        console.warn("[rotate] makePatternGenerator: invalid pattern:", pattern);
        return { next: () => null };
    }

    // Literal list â†’ Pseq(..., inf)
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

            // Read OSC mode from cfg (reactive to double-click changes)
            const currentOscMode = cfg.osc ?? oscMode;
            if (currentOscMode === 1 || currentOscMode === 2) {
                sendOSCRotation(el, tgt);
            }

            stepIndexAdvance();
            el._oscillaRotateAnim = setTimeout(
                () => requestAnimationFrame(runNext),
                stepDur * 1000
            );
            return;
        }

        // SMOOTH MODE â€” drift-compensated
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
                el.style.transform = `rotate(${a}deg)`;
                
                // Read OSC mode from cfg (reactive to double-click changes)
                const currentOscMode = cfg.osc ?? oscMode;
                if (currentOscMode === 1) {
                    sendOSCRotation(el, a);
                }
            },
            complete: () => {
                // Read OSC mode from cfg (reactive to double-click changes)
                const currentOscMode = cfg.osc ?? oscMode;
                if (currentOscMode === 2) {
                    let finalA = ((driver.a % 360) + 360) % 360;
                    sendOSCRotation(el, finalA);
                }

                stepIndexAdvance();

                if (hold > 0) {
                    el._oscillaRotateAnim = setTimeout(
                        () => requestAnimationFrame(runNext),
                        hold * 1000
                    );
                } else {
                    requestAnimationFrame(runNext);
                }
            }
        });

        // ðŸ”‘ CRITICAL FIX
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
    }

    // stop existing animation if active
    if (el._oscillaRotateAnim) el._oscillaRotateAnim.pause?.();

    applySvgPivot(el);

    const fullTurn = dir * 360;
    const ms = dur * 1000;

    const anim = anime({
        targets: el,
        rotate: `+=${fullTurn}`,
        duration: ms,
        easing: ease,
        loop: loop === 0 ? true : loop,

        // glue hit-circles to object while rotating
        update: () => {
            try { repositionAllHitLabels(); } catch (e) { }
        }
    });

    el._oscillaRotateAnim = anim;
    cfg._anim = anim;
}


// ============================================================
// MAIN ENTRY â€” used by:
//   â€¢ animationAssign(svgRoot) for id="rotate(...)"
//   â€¢ cue system for cueRotate(...)
// Signature: handleRotateCue(el, astArgs, options)
// ============================================================
// ============================================================
// MAIN ENTRY â€” used by animationAssign() & cue system
// Supports: tdelay, prestate (show|hide|ghost)
// ============================================================
// ============================================================================
// ROTATE cue handler â€” supports tdelay + prestate(show|hide|ghost|fadein)
// ============================================================================
export function handleRotateCue(el, astArgs, options = {}) {

    console.log(
        "[rotateCue] ARG TYPES",
        {
            elType: typeof el,
            astArgsIsArray: Array.isArray(astArgs),
            astArgs,
            options
        }
    );


    if (!el) return;

    console.log("[rotateCue] â¬‡ï¸ ENTER", { el, astArgs, options });

    const { fromCueTrigger = false } = options;

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

        // --------------------------------------------------
        // STRING prestates: prestate:ghost | hide | show
        // --------------------------------------------------
        if (key === "prestate" && val != null) {
            prestate = val;
        }

        // --------------------------------------------------
        // FUNCTION prestates: ghostClickable(), fadein()
        // --------------------------------------------------
        // if (a.type === "func") {
        //     const fname = a.name || a.value?.name;
        //     if (fname === "ghostClickable" || fname === "fadein") {
        //         prestate = a.value ? { ...a.value, type: "func" } : a;
        //     }
        // }
    }


    console.log("[rotateCue] Parsed â†’", {
        trig,
        uid,
        tdelay: cfgStartDelay,
        prestate
    });

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
        _ghostState: "waiting",
    };

    // ðŸ”¥ IMPORTANT FIX
    if (fromCueTrigger) {
        applyPrestateBeforeStart(el, baseCfg);
    }

    // â˜… FIX: ensure the element actually receives clicks
    el.style.pointerEvents = "all";
    // Bring to front so clicks are reachable
    try { el.parentNode.appendChild(el); } catch (e) { }

    // ----------------------------------------------------
    // DEFINE RAW START FOR ALL ROTATION MODES
    // ----------------------------------------------------
    function makeRawStart(cfg, modeFn) {
        return () => {
            console.log("[rotateCue] â–¶ START ROTATION", cfg.uid);
            modeFn(el, cfg);
        };
    }

    // // ----------------------------------------------------
    // // INSTALL GHOST-CLICKABLE TOGGLE
    // // Works for all rotate modes (sequence & continuous)
    // // ----------------------------------------------------
    // function installGhostToggle(cfg, rawStartFn) {
    //     if (!cfg._ghostClickable) return;

    //     function onClick() {
    //         // waiting â†’ running
    //         if (cfg._ghostState === "waiting") {
    //             cfg._ghostState = "running";
    //             el.style.transition = "opacity 400ms ease";
    //             el.style.opacity = "1";

    //             rawStartFn();
    //             return;
    //         }

    //         // running â†’ paused
    //         if (cfg._ghostState === "running") {
    //             cfg._ghostState = "paused";
    //             el.style.transition = "opacity 400ms ease";
    //             el.style.opacity = cfg._ghostOpacity ?? 0.3;

    //             // âœ… pause the *actual* animation instance
    //             if (cfg._anim) {
    //                 cfg._anim.pause();
    //             }

    //             return;
    //         }

    //         // paused â†’ running
    //         if (cfg._ghostState === "paused") {
    //             cfg._ghostState = "running";
    //             el.style.transition = "opacity 400ms ease";
    //             el.style.opacity = "1";

    //             if (cfg._anim) {
    //                 cfg._anim.play();
    //             } else {
    //                 rawStartFn();
    //             }

    //             return;
    //         }
    //     }

    //     cfg._ghostToggle = onClick;
    //     el.addEventListener("click", onClick);
    // }


    // ----------------------------------------------------
    // WRAP START (tdelay + prestates)
    // ----------------------------------------------------
    function wrapStart(cfg, rawStartFn) {
        // expose to ghostClickable system
        cfg._start = rawStartFn;
        cfg._applyPrestateOnStart = () => applyPrestateOnStart(el, cfg);

        return () => {
            if (cfg.start > 0) {
                console.log(`[rotateCue] â³ tdelay ${cfg.start}s â†’ uid=${cfg.uid}`);

                scheduleCueStart(
                    cfg,
                    el,
                    () => {
                        // âœ… ghostClickable: run prestates only, don't start animation
                        if (cfg._ghostClickable && cfg._startBlocked) {
                            console.log("[rotateCue] delayed start reached â€” ghostClickable fade to ghost only", cfg.uid);
                            applyPrestateOnStart(el, cfg);
                            return; // wait for click
                        }

                        // normal start
                        applyPrestateOnStart(el, cfg);
                        rawStartFn();
                    },
                    cfg.uid
                );

            } else {
                // immediate case: still respect ghostClickable
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
            mode: "sequence-pattern",
            kind: "rotate"
        };

        // âœ… APPLY PRESTATE TO FINAL CFG
        applyPrestateBeforeStart(el, cfg);

        if (Array.isArray(v.values)) {
            try {
                const angle = v.values[0];
                el.style.transform = `rotate(${angle}deg)`;
            } catch { }
        }

        const rawStart = makeRawStart(cfg, handleRotateSequence);
        const start = wrapStart(cfg, rawStart);

        // installGhostToggle(cfg, rawStart);

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
            mode: "sequence",
            kind: "rotate"

        };

        // âœ… APPLY PRESTATE TO FINAL CFG
        applyPrestateBeforeStart(el, cfg);

        try {
            const angle = cfg.values[0];
            el.style.transform = `rotate(${angle}deg)`;
        } catch { }

        const rawStart = makeRawStart(cfg, handleRotateSequence);
        const start = wrapStart(cfg, rawStart);

        // installGhostToggle(cfg, rawStart);

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
    console.log("[rotateCue] Fallback rotate mode");

    const cfg = {
        ...baseCfg,
        mode: "continuous",
        kind: "rotate"

    };

    // âœ… APPLY PRESTATE TO FINAL CFG
    applyPrestateBeforeStart(el, cfg);

    const rawStart = makeRawStart(cfg, handleRotateContinuous);
    const start = wrapStart(cfg, rawStart);

    // installGhostToggle(cfg, rawStart);

    registerAnimation(el, "rotate-fallback", cfg, start);

    createHitLabel(el, "rotate", cfg.uid, {
        anchorMode: "pathStart",
        color: "cyan",
        sizeMode: "rotate40"
    });

    if (shouldStartNow) start();

}