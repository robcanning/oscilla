// scale.js â€” OscillaScore Scale Cue (uniform & non-uniform)

import { registerAnimation } from "./oscillaAnimation.js";
import { scheduleCueStart } from "./oscillaCueDispatcher.js";
import { createHitLabel, shouldCreateHitLabel, repositionAllHitLabels } from "./oscillaHitLabels.js";
import {
    applyPrestateBeforeStart, applyPrestateOnStart, ensureAnimWrapper,
    armGhostClickable, needsArming, installOscToggleHandler
} from "./oscillaAnimationShared.js";



// ============================================================
// Pattern Generators (Pseq, Prand, Pxrand, Pshuf) â€” cloned from rotate.js
// ============================================================
function makePatternGenerator(pattern) {
    if (!pattern || !pattern.values || !Array.isArray(pattern.values)) {
        console.warn("[scale] makePatternGenerator: invalid pattern:", pattern);
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

    console.warn("[scale] makePatternGenerator: unknown pattern type:", pattern.name);
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

// A simpler value generator (not used directly; keep parity with rotate.js)
function makeValueGenerator(pattern) {
    const { name, values } = pattern;
    let i = 0;
    let last = null;

    if (name === "Pseq") {
        return { next() { const v = values[i % values.length]; i++; return v; } };
    }
    if (name === "Prand") {
        return { next() { const idx = Math.floor(Math.random() * values.length); return values[idx]; } };
    }
    if (name === "Pxrand") {
        return {
            next() {
                let choice;
                do { choice = values[Math.floor(Math.random() * values.length)]; }
                while (choice === last && values.length > 1);
                last = choice;
                return choice;
            }
        };
    }
    if (name === "Pshuf") {
        let bag = [...values];
        return {
            next() {
                if (bag.length === 0) bag = [...values];
                const idx = Math.floor(Math.random() * bag.length);
                const choice = bag[idx];
                bag.splice(idx, 1);
                return choice;
            }
        };
    }
    console.warn("[scale] Unknown pattern:", name);
    return { next() { return values[0]; } };
}

// ============================================================
// Utilities (pivot + current scale)
// ============================================================
function applySvgPivot(el) {
    if (!el.getBBox) return;
    const bb = el.getBBox();
    if (!bb || bb.width === 0 || bb.height === 0) return;
    const cx = bb.x + bb.width / 2;
    const cy = bb.y + bb.height / 2;
    el.style.transformOrigin = `${cx}px ${cy}px`;
}

function getCurrentScale(el, fallback = { sx: 1, sy: 1 }) {
    const t = el.style.transform || "";
    const m = t.match(/scale\(\s*([-\d.+eE]+)(?:\s*,\s*([-\d.+eE]+))?\s*\)/);
    if (!m) return { ...fallback };
    const sx = parseFloat(m[1]);
    const sy = (m[2] != null) ? parseFloat(m[2]) : sx;
    const okx = Number.isFinite(sx) ? sx : fallback.sx;
    const oky = Number.isFinite(sy) ? sy : fallback.sy;
    return { sx: okx, sy: oky };
}

// ======================================================================
//  SCALE SEQUENCE ENGINE (new architecture)
//  handleScaleSequence(el, cfg)
// ======================================================================
export function handleScaleSequence(el, cfg) {
    const astArgs = cfg.astArgs || [];

    // Value sources (uniform or XY)
    let ax = cfg.xValues || null;
    let ay = cfg.yValues || null;
    let xPattern = cfg.xPattern || null;
    let yPattern = cfg.yPattern || null;
    let uniformPattern = cfg.pattern || null;

    // Duration
    let dur = 1;
    let durGen = null;

    // Modes / behaviour
    let mode = "loop";          // loop | once | alternate
    let pauseOnExit = true;
    let interp = "smooth";      // smooth | step
    let ease = "linear";
    let hold = null;
    let oscMode = 0;

    // Pattern generators
    let axGen = null;
    let ayGen = null;

    // ------------------------------------------------------------
    // Parse AST arguments
    // ------------------------------------------------------------
    for (const arg of astArgs) {
        const key = arg.key || arg.type;
        const val = arg.value;

        switch (key) {

            case "values":
                if (val && val.type === "pattern") {
                    uniformPattern = val;
                    axGen = makePatternGenerator(val);
                    ayGen = makePatternGenerator(val);
                    ax = null;
                    ay = null;
                } else if (Array.isArray(val)) {
                    ax = val.slice();
                    ay = val.slice();
                }
                break;

            case "x":
            case "valuesX":
                if (val && val.type === "pattern") {
                    xPattern = val;
                    axGen = makePatternGenerator(val);
                    ax = null;
                } else if (Array.isArray(val)) {
                    ax = val.slice();
                } else if (Number.isFinite(Number(val))) {
                    ax = [Number(val)];
                }
                break;

            case "y":
            case "valuesY":
                if (val && val.type === "pattern") {
                    yPattern = val;
                    ayGen = makePatternGenerator(val);
                    ay = null;
                } else if (Array.isArray(val)) {
                    ay = val.slice();
                } else if (Number.isFinite(Number(val))) {
                    ay = [Number(val)];
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

            case "mode": {
                mode = String(val).trim().toLowerCase();
                if (mode === "alt") mode = "alternate";   // â† alias support restored
                break;
            }
            case "pauseOnExit": pauseOnExit = Boolean(val); break;
            case "interp": interp = String(val).trim().toLowerCase(); break;
            case "ease": ease = String(val).trim(); break;
            case "hold": hold = Number(val); break;
            case "osc": oscMode = Number(val) || 0; break;

            default: break;
        }
    }

    // Determine generators if not already set
    if (xPattern && !axGen) axGen = makePatternGenerator(xPattern);
    if (yPattern && !ayGen) ayGen = makePatternGenerator(yPattern);

    if (uniformPattern && !axGen && !ayGen) {
        axGen = makePatternGenerator(uniformPattern);
        ayGen = makePatternGenerator(uniformPattern);
    }

    // Defaults for hold
    if (interp === "smooth") {
        if (hold === null || Number.isNaN(hold)) hold = 0;
    }
    if (interp === "step") hold = 0;

    // Stop previous animation safely
    if (el._oscillaScaleAnim) {
        el._oscillaScaleAnim.pause?.();
        clearTimeout(el._oscillaScaleAnim);
        el._oscillaScaleAnim = null;
    }

    applySvgPivot(el);

    // Sequence length (for literal lists)
    const NX = Array.isArray(ax) ? ax.length : Infinity;
    const NY = Array.isArray(ay) ? ay.length : Infinity;
    const N = Math.max(NX, NY);

    let index = 0;
    let direction = 1;

    // Driver object for tweening
    const cur = getCurrentScale(el, {
        sx: Array.isArray(ax) ? ax[0] ?? 1 : 1,
        sy: Array.isArray(ay) ? ay[0] ?? 1 : 1
    });
    const driver = { sx: cur.sx, sy: cur.sy };

    // ------------------------------------------------------------
    // Next value helper
    // ------------------------------------------------------------
    function nextPair() {
        let sx, sy;

        if (axGen) {
            sx = axGen.next();
        } else if (Array.isArray(ax) && NX > 0) {
            sx = ax[index % NX];
        } else {
            sx = driver.sx;
        }

        if (ayGen) {
            sy = ayGen.next();
        } else if (Array.isArray(ay) && NY > 0) {
            sy = ay[index % NY];
        } else if (axGen || Array.isArray(ax)) {
            sy = sx;
        } else {
            sy = driver.sy;
        }

        if (sx == null || sy == null) return null;
        return [Number(sx), Number(sy)];
    }

    // ------------------------------------------------------------
    // Index stepping (fixed)
    // ------------------------------------------------------------
    function stepIndexAdvance() {
        if (axGen || ayGen) return;

        if (mode === "alternate") {
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
        return (!axGen && !ayGen && mode === "once" && index >= N);
    }

    // ------------------------------------------------------------
    // Main tick
    // ------------------------------------------------------------
    function runNext() {
        const pair = nextPair();
        if (!pair || atEndOnce()) {
            if (!pauseOnExit && Array.isArray(ax) && ax.length > 0) {
                const sx0 = ax[0];
                const sy0 = Array.isArray(ay) && ay.length > 0 ? ay[0] : sx0;
                el.style.transform = `scale(${sx0}, ${sy0})`;
            }
            return;
        }

        let [tgtX, tgtY] = pair;

        // ------------------------------------------------------------
        //  Wrap-around fix â€” prevents reverse tweening
        // ------------------------------------------------------------
        const wrapping =
            mode !== "alternate" &&      // loop-only
            !axGen && !ayGen &&          // not patterns
            index === 0 &&               // we wrapped
            (driver.sx !== tgtX || driver.sy !== tgtY);

        if (wrapping) {
            driver.sx = tgtX;
            driver.sy = tgtY;
            el.style.transform = `scale(${tgtX}, ${tgtY})`;

            stepIndexAdvance();

            const next = nextPair();
            if (!next) return;
            [tgtX, tgtY] = next;
        }
        // ------------------------------------------------------------

        // Skip redundant tween
        if (driver.sx === tgtX && driver.sy === tgtY) {
            stepIndexAdvance();
            requestAnimationFrame(runNext);
            return;
        }

        const durRaw = durGen ? durGen.next() : dur;
        const stepDur = Number(durRaw) || dur || 0.0001;

        // STEP MODE
        if (interp === "step") {
            driver.sx = tgtX;
            driver.sy = tgtY;
            el.style.transform = `scale(${tgtX}, ${tgtY})`;

            // Read OSC mode from cfg (reactive to double-click changes)
            const currentOscMode = cfg.osc ?? oscMode;
            if (currentOscMode === 1 || currentOscMode === 2) {
                sendOSCScale(cfg, el, tgtX, tgtY);
            }

            stepIndexAdvance();

            el._oscillaScaleAnim = setTimeout(
                () => requestAnimationFrame(runNext),
                stepDur * 1000
            );
            return;
        }

        // SMOOTH MODE (do NOT sample element transform)
        const anim = anime({
            targets: driver,
            sx: tgtX,
            sy: tgtY,
            duration: stepDur * 1000,
            easing: ease,
            update: () => {
                el.style.transform = `scale(${driver.sx}, ${driver.sy})`;

                // Read OSC mode from cfg (reactive to double-click changes)
                const currentOscMode = cfg.osc ?? oscMode;
                if (currentOscMode === 1) {
                    sendOSCScale(cfg, el, driver.sx, driver.sy);
                }
            },
            complete: () => {
                // Read OSC mode from cfg (reactive to double-click changes)
                const currentOscMode = cfg.osc ?? oscMode;
                if (currentOscMode === 2) {
                    sendOSCScale(cfg, el, driver.sx, driver.sy);
                }
                stepIndexAdvance();

                if (hold > 0) {
                    el._oscillaScaleAnim = setTimeout(
                        () => requestAnimationFrame(runNext),
                        hold * 1000
                    );
                } else {
                    requestAnimationFrame(runNext);
                }
            }
        });

        el._oscillaScaleAnim = anim;
        cfg._anim = anim;

    }
    // Kick off
    requestAnimationFrame(runNext);
}

// ============================================================
// Continuous fallback (pulse) if no values provided
// ============================================================
function handleScaleContinuous(el, cfg) {
    const astArgs = cfg.astArgs || [];

    // Defaults
    let min = 1, max = 1.2;
    let minX = null, maxX = null, minY = null, maxY = null;
    let dur = 2;
    let loop = 0;              // 0 = infinite
    let ease = "linear";

    for (const arg of astArgs) {
        const key = arg.key || arg.type;
        const v = arg.value;
        if (key === "min") min = Number(v);
        if (key === "max") max = Number(v);
        if (key === "minX") minX = Number(v);
        if (key === "maxX") maxX = Number(v);
        if (key === "minY") minY = Number(v);
        if (key === "maxY") maxY = Number(v);
        if (key === "dur") dur = Number(v);
        if (key === "loop") loop = Number(v);
        if (key === "ease") ease = String(v).trim();
    }

    // Resolve axis ranges
    const useX = [minX ?? min, maxX ?? max];
    const useY = [minY ?? min, maxY ?? max];

    // Stop previous
    if (el._oscillaScaleAnim) el._oscillaScaleAnim.pause?.();


    const animEl = ensureAnimWrapper(el);
    applySvgPivot(animEl);

    const ms = dur * 1000;

    // Pulse X and Y with yoyo
    const anim = anime.timeline({ loop: loop === 0 ? true : loop });

    anim.add({
        targets: animEl,
        duration: ms,
        easing: ease,
        scaleX: useX[1],
        scaleY: useY[1]
    }).add({
        targets: animEl,
        duration: ms,
        easing: ease,
        scaleX: useX[0],
        scaleY: useY[0]
    });

    el._oscillaScaleAnim = anim;
    cfg._anim = anim;

}


// ============================================================
// OSC send helper for SCALE - MUST use cfg.uid
// ============================================================
function sendOSCScale(cfg, el, sx, sy) {
    if (!window.socket || !cfg?.uid) {
        return;
    }

    const msg = {
        type: "osc_scale",
        uid: cfg.uid,          // ✅ ALWAYS cfg.uid, NEVER el.id
        sx: Number(sx),
        sy: Number(sy),
        avg: (Number(sx) + Number(sy)) / 2,
        timestamp: Date.now()
    };
    // console.log("[scaleCue] oscmsg", msg);
    try {
        window.socket.send(JSON.stringify(msg));
    } catch (e) {
        console.warn("[scale][osc] send failed:", e);
    }
}

// ============================================================================
// SCALE cue handler
// ============================================================================
export function handleScaleCue(ast, el, options = {}) {
    if (!el) return;

    const { fromCueTrigger = false } = options;
    const astArgs = ast?.args || [];

    // -----------------------------------------------------------
    // CHECK: Is this a playhead trigger for already-registered element?
    // -----------------------------------------------------------
    const existingCfg = el._oscillaCfg;

    if (fromCueTrigger && existingCfg && existingCfg._ghostClickable) {
        if (needsArming(existingCfg)) {
            // console.log("[scaleCue] PLAYHEAD → arming ghostClickable", existingCfg.uid);
            armGhostClickable(el, existingCfg);
        } else {
            // console.log("[scaleCue] PLAYHEAD → already armed/running", existingCfg.uid);
        }
        return;
    }

    // -----------------------------------------------------------
    // FULL SETUP (first time registration)
    // -----------------------------------------------------------
    // console.log("[scaleCue] ENTER", { el, astArgs, options });

    // ------------------------------------------------------------------------
    // Parse DSL args - FIXED UID EXTRACTION
    // ------------------------------------------------------------------------
    let trig = "auto";
    let cfgStartDelay = 0;
    let prestate = "show";

    // ✅ FIX: Start with null, NEVER use el.id as default
    let uid = null;

    for (const a of astArgs) {
        const key = a.key || a.type;
        const val = a.value;

        if (key === "uid") {
            uid = String(val).trim();
            // console.log("[scaleCue] ✅ Found uid in args:", uid);
        }
        if (key === "trig") trig = String(val).toLowerCase();
        if (key === "tdelay") cfgStartDelay = Number(val) || 0;
        if (key === "prestate") prestate = val;
    }

    // ✅ FIX: If no uid found, generate a clean random one
    // NEVER fall back to el.id (which contains the DSL string)
    if (!uid) {
        uid = "scale_" + Math.random().toString(36).slice(2, 10);
        // console.log("[scaleCue] ⚠️ No uid in DSL, generated:", uid);
    }

    // console.log("[scaleCue] Final uid:", uid);

    const shouldStartNow = fromCueTrigger || trig === "auto" || trig === "playhead";

    // ------------------------------------------------------------------------
    // BASE CFG
    // ------------------------------------------------------------------------
    const baseCfg = {
        uid,                    // ✅ Clean semantic uid
        trig,
        start: cfgStartDelay,
        prestate,
        astArgs,
        fromCueTrigger,
        kind: "scale",
        osc: 0,                 // OSC off by default, toggled via hit-label
        _anim: null,
        _start: null
    };

    // Ensure element receives clicks
    el.style.pointerEvents = "all";
    try { el.parentNode.appendChild(el); } catch (e) { }

    // ------------------------------------------------------------------------
    // Extract value args
    // ------------------------------------------------------------------------
    const valuesArg = astArgs.find(o => o.key === "values" || o.type === "values");
    const xArg = astArgs.find(o => ["x", "valuesX"].includes(o.key || o.type));
    const yArg = astArgs.find(o => ["y", "valuesY"].includes(o.key || o.type));

    // ------------------------------------------------------------------------
    // Initial scale helper
    // ------------------------------------------------------------------------
    function applyInitialScale(cfg) {
        const sx = cfg.xValues?.[0] ?? cfg.values?.[0] ?? 1;
        const sy = cfg.yValues?.[0] ?? cfg.values?.[0] ?? sx;
        el.style.transform = `scale(${sx}, ${sy})`;
    }

    // ------------------------------------------------------------------------
    // wrapStart
    // ------------------------------------------------------------------------
    function wrapStart(cfg, rawStartFn) {
        return () => {
            const restoreOnly = () => {
                applyPrestateOnStart(el, cfg);
            };

            const fullStart = () => {
                applyPrestateOnStart(el, cfg);
                rawStartFn();
            };

            if (cfg.start > 0) {
                scheduleCueStart(cfg, el, () => {
                    if (cfg._ghostClickable && cfg._startBlocked) {
                        restoreOnly();
                        return;
                    }
                    fullStart();
                }, cfg.uid);

                if (cfg._ghostClickable && cfg._startBlocked) {
                    restoreOnly();
                }
            } else {
                if (cfg._ghostClickable && cfg._startBlocked) {
                    restoreOnly();
                    return;
                }
                fullStart();
            }
        };
    }

    // ------------------------------------------------------------------------
    // SEQUENCE: values / patterns
    // ------------------------------------------------------------------------
    if (valuesArg) {
        const v = valuesArg.value;

        const cfg = {
            ...baseCfg,
            mode: Array.isArray(v) ? "sequence-uniform" : "sequence-pattern",
            values: Array.isArray(v) ? v : null,
            pattern: v?.type === "pattern" ? v : null
        };

        // ✅ Store cfg on element for future reference
        el._oscillaCfg = cfg;
        el.dataset.oscillaUid = cfg.uid;

        // ✅ Apply prestate (handles ghostClickable registration)
        applyPrestateBeforeStart(el, cfg);

        // ✅ Install OSC toggle handler for ALL animations
        installOscToggleHandler(el, cfg);

        applyInitialScale(cfg);

        const rawStart = () => {
            handleScaleSequence(el, cfg);
        };

        cfg._start = wrapStart(cfg, rawStart);

        registerAnimation(el, "scale", cfg, cfg._start);

        if (shouldCreateHitLabel(cfg)) {

            createHitLabel(el, "scale", cfg.uid, {
                anchorMode: "pathMidPoint",
                color: "lime",
                sizeMode: "scale40"
            });
        }

        applyPrestateOnStart(el, cfg);

        if (shouldStartNow && !cfg._startBlocked) {
            cfg._start();
        }
        return;
    }

    // ------------------------------------------------------------------------
    // SEQUENCE XY
    // ------------------------------------------------------------------------
    if (xArg || yArg) {
        const cfg = {
            ...baseCfg,
            mode: "sequence-xy",
            xValues: Array.isArray(xArg?.value) ? xArg.value : null,
            yValues: Array.isArray(yArg?.value) ? yArg.value : null,
            xPattern: xArg?.value?.type === "pattern" ? xArg.value : null,
            yPattern: yArg?.value?.type === "pattern" ? yArg.value : null
        };

        el._oscillaCfg = cfg;
        el.dataset.oscillaUid = cfg.uid;

        applyPrestateBeforeStart(el, cfg);
        installOscToggleHandler(el, cfg);  // ✅ Install OSC handler

        applyInitialScale(cfg);

        const rawStart = () => {
            handleScaleSequence(el, cfg);
        };

        cfg._start = wrapStart(cfg, rawStart);

        registerAnimation(el, "scale", cfg, cfg._start);


        if (shouldCreateHitLabel(cfg)) {
            createHitLabel(el, "scale", cfg.uid, {
                anchorMode: "pathMidPoint",
                color: "lime",
                sizeMode: "scale40"
            });
        }

        applyPrestateOnStart(el, cfg);

        if (shouldStartNow && !cfg._startBlocked) {
            cfg._start();
        }
        return;
    }

    // ------------------------------------------------------------------------
    // CONTINUOUS (fallback)
    // ------------------------------------------------------------------------
    const cfg = {
        ...baseCfg,
        mode: "continuous"
    };

    el._oscillaCfg = cfg;
    el.dataset.oscillaUid = cfg.uid;

    applyPrestateBeforeStart(el, cfg);
    installOscToggleHandler(el, cfg);  // ✅ Install OSC handler

    applyInitialScale(cfg);

    const rawStart = () => {
        handleScaleContinuous(el, cfg);
    };

    cfg._start = wrapStart(cfg, rawStart);

    registerAnimation(el, "scale", cfg, cfg._start);

    if (shouldCreateHitLabel(cfg)) {
        createHitLabel(el, "scale", cfg.uid, {
            anchorMode: "pathMidPoint",
            color: "lime",
            sizeMode: "scale40"
        });
    }

    applyPrestateOnStart(el, cfg);

    if (shouldStartNow && !cfg._startBlocked) {
        cfg._start();
    }
}