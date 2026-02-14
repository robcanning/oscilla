// scale.js â€” OscillaScore Scale Cue (uniform & non-uniform)

import { registerAnimation } from "./animation.js";
import { scheduleCueStart } from "./cueDispatcher.js";
import { createHitLabel, shouldCreateHitLabel, repositionAllHitLabels }  from "../control/o2pTouchOverlays.js";


import { applyPrestateBeforeStart, applyPrestateOnStart, ensureAnimWrapper,
    armGhostClickable, needsArming, installOscToggleHandler, isOscEnabled
} from "./animShared.js";

import { createOscOverlay } from "./osc.js";
import { sendOSC } from "../system/oscillaOSCClient.js";
import { publish } from '../control/paramBinding.js';

// ============================================================
// OSC send helper for SCALE
// ============================================================
function sendOSCScale(cfg, sx, sy) {
    const addr =
        cfg.oscaddr
            ? String(cfg.oscaddr).trim()
            : `scale/${cfg.uid || "unknown"}`;

    sendOSC({
        type: "osc_scale",
        uid: cfg.uid,
        addr,
        sx: Number(sx),
        sy: Number(sy),
        timestamp: Date.now()
    });
}



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
// ======================================================================
//  SCALE SEQUENCE ENGINE — yesterday version, patched safely
// ======================================================================
export function handleScaleSequence(el, cfg) {

    const astArgs = cfg.astArgs || [];

    // Value sources
    let ax = cfg.xValues || null;
    let ay = cfg.yValues || null;
    let xPattern = cfg.xPattern || null;
    let yPattern = cfg.yPattern || null;
    let uniformPattern = cfg.pattern || null;

    // Duration
    let dur = 1;
    let durGen = null;

    // Behaviour
    let mode = "loop";
    let interp = "smooth";
    let ease = "linear";
    let hold = 0;

    // OSC
    let oscMode = 0;
    let oscAddr = null;

    let axGen = null;
    let ayGen = null;

    // ------------------------------------------------------------
    // Parse AST
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
                    ax = null; ay = null;
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

            case "interp":
                interp = String(val).trim().toLowerCase();
                break;

            case "ease":
                ease = String(val).trim();
                break;

            case "hold":
                hold = Number(val) || 0;
                break;

            case "osc":
                oscMode = Number(val) || 0;
                break;

            case "oscaddr":
                oscAddr = String(val).trim();
                break;
        }
    }

    // fallback osc address
    if (!oscAddr) {
        oscAddr = `scale/${cfg.uid}`;
    }

    // generators if needed
    if (xPattern && !axGen) axGen = makePatternGenerator(xPattern);
    if (yPattern && !ayGen) ayGen = makePatternGenerator(yPattern);
    if (uniformPattern && !axGen && !ayGen) {
        axGen = makePatternGenerator(uniformPattern);
        ayGen = makePatternGenerator(uniformPattern);
    }

    // clean previous
    if (el._oscillaScaleAnim) {
        el._oscillaScaleAnim.pause?.();
        clearTimeout(el._oscillaScaleAnim);
        el._oscillaScaleAnim = null;
    }

    const wrapper = ensureAnimWrapper(el);
    applySvgPivot(wrapper);

    const NX = Array.isArray(ax) ? ax.length : Infinity;
    const NY = Array.isArray(ay) ? ay.length : Infinity;
    const N  = Math.max(NX, NY);

    let index = 0;
    let direction = 1;

    // driver
    const driver = { sx: 1, sy: 1 };

    // ------------------------------
    // Overlay (centered, only if OSC)
    // ------------------------------
    if (cfg._overlay) {
        cfg._overlay.destroy();
        cfg._overlay = null;
    }

    if (isOscEnabled(cfg, oscMode)) {
        cfg._overlay = createOscOverlay({
            anchorEl: el,
            label: oscAddr,
            mode: "auto",
            track: true
        });
    }

    // ------------------------------
    // Helpers
    // ------------------------------
    function nextPair() {
        let sx, sy;

        if (axGen) sx = axGen.next();
        else if (Array.isArray(ax)) sx = ax[index % NX];
        else sx = driver.sx;

        if (ayGen) sy = ayGen.next();
        else if (Array.isArray(ay)) sy = ay[index % NY];
        else sy = sx;

        if (sx == null || sy == null) return null;
        return [Number(sx), Number(sy)];
    }

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

    // ------------------------------
    // Main loop
    // ------------------------------
 function runNext() {

    const pair = nextPair();
    if (!pair) return;

    let [tgtX, tgtY] = pair;

    const durRaw = durGen ? durGen.next() : dur;
    const stepDur = Number(durRaw) || dur || 0.0001;

    // ✨ if target equals current → skip instantly
    if (driver.sx === tgtX && driver.sy === tgtY) {
        stepIndexAdvance();
        runNext();
        return;
    }

    // ---------------------------------
    // STEP MODE
    // ---------------------------------
    if (interp === "step") {
        driver.sx = tgtX;
        driver.sy = tgtY;

        wrapper.style.transform = `scale(${tgtX}, ${tgtY})`;

        if (isOscEnabled(cfg, oscMode)) {
            sendOSC({
                addr: oscAddr,
                type: "osc_scale",
                uid: cfg.uid,
                sx: tgtX,
                sy: tgtY,
                avg: (tgtX + tgtY) / 2,
                norm: Math.min(1, Math.max(0, (tgtX - 1) / 3)),
                timestamp: Date.now()
            });

            cfg._overlay?.update(
                `sx:${tgtX.toFixed(2)} sy:${tgtY.toFixed(2)}`
            );
        }

        stepIndexAdvance();

        // 🔥 no extra RAF — only one timer
        el._oscillaScaleAnim = setTimeout(runNext, stepDur * 1000);
        return;
    }

    // ---------------------------------
    // SMOOTH MODE
    // ---------------------------------
    const anim = anime({
        targets: driver,
        sx: tgtX,
        sy: tgtY,
        duration: stepDur * 1000,
        easing: ease,

        update: () => {
            wrapper.style.transform = `scale(${driver.sx}, ${driver.sy})`;

            if (isOscEnabled(cfg, oscMode)) {
                sendOSC({
                    addr: oscAddr,
                    type: "osc_scale",
                    uid: cfg.uid,
                    sx: driver.sx,
                    sy: driver.sy,
                    avg: (driver.sx + driver.sy) / 2,
                    norm: Math.min(1, Math.max(0, (driver.sx - 1) / 3)),
                    timestamp: Date.now()
                });

                cfg._overlay?.update(
                    `sx:${driver.sx.toFixed(2)} sy:${driver.sy.toFixed(2)}`
                );
            }
        },

        complete: () => {
            stepIndexAdvance();

            // 🔥 hold means ONLY a pause — never hold + RAF stack
            if (hold > 0) {
                el._oscillaScaleAnim = setTimeout(runNext, hold * 1000);
            } else {
                runNext();
            }
        }
    });

    el._oscillaScaleAnim = anim;
}


    requestAnimationFrame(runNext);
}




// ============================================================
// Continuous fallback (pulse) if no values provided
// ============================================================
export function handleScaleContinuous(el, cfg) {

    const astArgs = cfg.astArgs || [];

    let dir = 1;
    let dur = 2;
    let loop = 0;
    let ease = "linear";
    let oscMode = 0;
    let mode = "loop";          // loop | alternate
    let oscaddr = null;

    function oscEnabled(cfg) {
        return cfg._oscEnabled === true || oscMode > 0;
    }

    for (const arg of astArgs) {
        const key = arg.key || arg.type;
        const val = arg.value;

        if (key === "dir") dir = Number(val);
        if (key === "dur") dur = Number(val);
        if (key === "loop") loop = Number(val);
        if (key === "ease") ease = String(val).trim();
        if (key === "osc") oscMode = Number(val) || 0;

        if (key === "mode") {
            mode = String(val).toLowerCase();
            if (mode === "alt") mode = "alternate";
        }

        if (key === "oscaddr") {
            oscaddr = String(val).trim();
        }
    }

    if (!oscaddr) {
        oscaddr = `scale/${cfg.uid || "unknown"}`;
    }

    if (el._oscillaScaleAnim) el._oscillaScaleAnim.pause?.();

    const animEl = ensureAnimWrapper(el);
    applySvgPivot(animEl);

    // overlay
    if (cfg._overlay) cfg._overlay.destroy();
    cfg._overlay = createOscOverlay({
        anchorEl: el,
        label: cfg.uid || "scale",
        mode: "auto"
    });

    cfg._overlay.update("…");
    cfg._overlay.position();

    function sendOSC(sx, sy) {
        if (!oscEnabled(cfg)) return;

        sendOSC({
            type: "osc_scale",
            uid: cfg.uid,
            addr: oscaddr,
            sx: Number(sx),
            sy: Number(sy),
            avg: (Number(sx) + Number(sy)) / 2,
            timestamp: Date.now()
        });
    }

    // -----------------------------------------
    // NO TIMELINE — single tween, no pause
    // -----------------------------------------
    const anim = anime({
        targets: animEl,
        duration: dur * 1000,
        easing: ease,
        loop: loop === 0 ? true : loop,
        direction: mode === "alternate" ? "alternate" : "normal",

        scale: dir === -1 ? [1, 0.5] : [1, 1.5],

      update: () => {
            try { repositionAllHitLabels(); } catch {}

            const tr = animEl.style.transform;
            
            // Parse scale values - handle both scale(x,y) and scale(uniform)
            let sx = 1, sy = 1;
            
            const matchXY = tr.match(/scale\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
            const matchUniform = tr.match(/scale\(\s*([-\d.]+)\s*\)/);
            
            if (matchXY) {
                sx = parseFloat(matchXY[1]) || 1;
                sy = parseFloat(matchXY[2]) || 1;
            } else if (matchUniform) {
                sx = sy = parseFloat(matchUniform[1]) || 1;
            }

            // Overlay update
            if (cfg._overlay) {
                cfg._overlay.update(
                    `sx:${sx.toFixed(2)} sy:${sy.toFixed(2)}`
                );
            }

            // OSC output (if enabled)
            if (sx && sy) sendOSC(sx, sy);

            // ========== CONTROL PLANE PUBLISH ==========
            publish("scale", cfg.uid, {
                sx: sx,                    // scale X factor
                sy: sy,                    // scale Y factor
                uniform: (sx + sy) / 2     // average (for uniform scaling)
            });
            // ============================================
        }
    });

    el._oscillaScaleAnim = anim;
    cfg._anim = anim;
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
            armGhostClickable(el, existingCfg);
        }
        return;
    }

    // ------------------------------------------------------------------------
    // Parse DSL args
    // ------------------------------------------------------------------------
    let trig = "auto";
    let cfgStartDelay = 0;
    let prestate = "show";

    let uid = null;

    //  normalized OSC field
    let oscAddr = null;

    for (const a of astArgs) {
        const key = a.key || a.type;
        const val = a.value;

        if (key === "uid") uid = String(val).trim();
        if (key === "trig") trig = String(val).toLowerCase();
        if (key === "tdelay") cfgStartDelay = Number(val) || 0;
        if (key === "prestate") prestate = val;

        // accept BOTH spellings
        if (key === "oscaddr" || key === "oscAddr") {
            oscAddr = String(val).trim();
        }
    }

    if (!uid) {
        uid = "scale_" + Math.random().toString(36).slice(2, 10);
    }

    const shouldStartNow =
        fromCueTrigger || trig === "auto" || trig === "playhead";

    // ------------------------------------------------------------------------
    // BASE CFG — unified oscAddr now!
    // ------------------------------------------------------------------------
    const baseCfg = {
        uid,
        trig,
        start: cfgStartDelay,
        prestate,
        astArgs,
        fromCueTrigger,
        kind: "scale",

        oscAddr,       // 👈 canonical
        osc: 0,

        _anim: null,
        _start: null
    };

    el.style.pointerEvents = "all";
    try { el.parentNode.appendChild(el); } catch {}

    // ------------------------------------------------------------------------
    // Extract value args
    // ------------------------------------------------------------------------
    const valuesArg = astArgs.find(o => o.key === "values" || o.type === "values");
    const xArg = astArgs.find(o => ["x", "valuesX"].includes(o.key || o.type));
    const yArg = astArgs.find(o => ["y", "valuesY"].includes(o.key || o.type));

    const scaleWrapper = ensureAnimWrapper(el);

    function applyInitialScale(cfg) {
        const sx = cfg.xValues?.[0] ?? cfg.values?.[0] ?? 1;
        const sy = cfg.yValues?.[0] ?? cfg.values?.[0] ?? sx;
        scaleWrapper.style.transform = `scale(${sx}, ${sy})`;
    }

    function wrapStart(cfg, rawStartFn) {
        return () => {
            const restoreOnly = () => applyPrestateOnStart(el, cfg);
            const fullStart = () => {
                applyPrestateOnStart(el, cfg);
                rawStartFn();
            };

            if (cfg.start > 0) {
                scheduleCueStart(cfg, el, () => {
                    if (cfg._ghostClickable && cfg._startBlocked) return restoreOnly();
                    fullStart();
                }, cfg.uid);

                if (cfg._ghostClickable && cfg._startBlocked) restoreOnly();
            } else {
                if (cfg._ghostClickable && cfg._startBlocked) return restoreOnly();
                fullStart();
            }
        };
    }

    // ------------------------------------------------------------------------
    // SEQUENCE uniform / pattern
    // ------------------------------------------------------------------------
    if (valuesArg) {
        const v = valuesArg.value;

        const cfg = {
            ...baseCfg,
            mode: Array.isArray(v) ? "sequence-uniform" : "sequence-pattern",
            values: Array.isArray(v) ? v : null,
            pattern: v?.type === "pattern" ? v : null
        };

        el._oscillaCfg = cfg;
        el.dataset.oscillaUid = cfg.uid;

        applyPrestateBeforeStart(el, cfg);
        installOscToggleHandler(el, cfg);
        applyInitialScale(cfg);

        const rawStart = () => handleScaleSequence(el, cfg);
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
        if (shouldStartNow && !cfg._startBlocked) cfg._start();
        return;
    }

    // ------------------------------------------------------------------------
    // SEQUENCE-XY
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
        installOscToggleHandler(el, cfg);
        applyInitialScale(cfg);

        const rawStart = () => handleScaleSequence(el, cfg);
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
        if (shouldStartNow && !cfg._startBlocked) cfg._start();
        return;
    }

    // ------------------------------------------------------------------------
    // CONTINUOUS fallback
    // ------------------------------------------------------------------------
    const cfg = {
        ...baseCfg,
        mode: "continuous"
    };

    el._oscillaCfg = cfg;
    el.dataset.oscillaUid = cfg.uid;

    applyPrestateBeforeStart(el, cfg);
    installOscToggleHandler(el, cfg);
    applyInitialScale(cfg);

    const rawStart = () => handleScaleContinuous(el, cfg);
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
    if (shouldStartNow && !cfg._startBlocked) cfg._start();
}
