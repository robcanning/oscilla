// ============================================================================
// oscillaOSC.js — Discrete OSC Cue Sender
// ----------------------------------------------------------------------------
// Implements osc(...) cue:
//   osc(addr:voice, pitch:y, amp:size, uid:pt)
//
// • Event-based (snapshot at trigger time)
// • Normalized visual parameters (0–1)
// • UID is OPTIONAL (only sent if explicitly provided)
// • No DOM ID leakage
// • Uses existing cue trigger lifecycle (click / playhead / ghostClickable)
// ============================================================================

import { scheduleCueStart } from "./oscillaCueDispatcher.js";
import { emitCueComplete } from "./oscillaCueDispatcher.js";
import {
    applyPrestateBeforeStart,
    applyPrestateOnStart,
    armGhostClickable,
    needsArming
} from "./oscillaAnimationShared.js";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function clamp01(v) {
    return Math.min(1, Math.max(0, v));
}

function getViewportBox() {
    const svg = document.querySelector("svg");
    if (!svg) return null;
    const vb = svg.viewBox.baseVal;
    return vb && vb.width && vb.height
        ? { x: vb.x, y: vb.y, w: vb.width, h: vb.height }
        : svg.getBoundingClientRect();
}

// ---------------------------------------------------------------------------
// Visual property samplers (NORMALIZED)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Visual property sampler (NORMALISED, synthesis-oriented)
// ---------------------------------------------------------------------------
function sampleVisual(el) {
    if (!el || !el.getBoundingClientRect) return null;

    // ---------------------------------------------------------
    // Resolve spatial reference:
    //   1) nearest valid osc frame
    //   2) fallback to visible score window (ALWAYS)
    // ---------------------------------------------------------
    let vpEl = null;

    const frameEl = findOscFrame(el);
    if (frameEl) {
        const r = frameEl.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
            vpEl = frameEl;
        }
    }

    // unconditional fallback (restores original behaviour)
    vpEl = vpEl || window.scoreContainer;
    if (!vpEl) return null;

    const vp = vpEl.getBoundingClientRect();
    if (!vp.width || !vp.height) return null;

    const box = el.getBoundingClientRect();

    // ---------------------------------------------------------
    // Position (screen-space → frame-local → normalised)
    // ---------------------------------------------------------
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;

    const lx = cx - vp.left;
    const ly = cy - vp.top;

    const x = clamp01(lx / vp.width);
    const y = clamp01(1 - (ly / vp.height)); // invert Y for musical semantics

    // ---------------------------------------------------------
    // Geometry (screen-space, perceptual)
    // ---------------------------------------------------------
    const widthRaw = clamp01(box.width / vp.width);
    const heightRaw = clamp01(box.height / vp.height);

    const width = Math.sqrt(widthRaw);                  // envelope / time
    const height = Math.sqrt(heightRaw);                 // brightness
    const area = Math.pow(widthRaw * heightRaw, 0.25); // density / energy

    let aspect = 0.5;
    if (box.height > 0) {
        const ratio = box.width / box.height;
        aspect = clamp01(ratio / (ratio + 1));
    }

    const size = Math.max(width, height);

    // ---------------------------------------------------------
    // Transform-derived values
    // ---------------------------------------------------------
    let scale = 1;
    let rotation = 0;

    const t = el.getAttribute("transform") || "";

    const sm = t.match(/scale\(\s*([-\d.+eE]+)/);
    if (sm) {
        const s = parseFloat(sm[1]);
        if (Number.isFinite(s)) scale = clamp01(Math.abs(s));
    }

    const rm = t.match(/rotate\(\s*([-\d.+eE]+)/);
    if (rm) {
        const deg = parseFloat(rm[1]);
        if (Number.isFinite(deg)) {
            rotation = ((deg % 360) + 360) % 360 / 360;
        }
    }

    // ---------------------------------------------------------
    // Opacity
    // ---------------------------------------------------------
    let opacity = 1;
    const o = getComputedStyle(el).opacity;
    if (o != null) {
        const v = parseFloat(o);
        if (Number.isFinite(v)) opacity = clamp01(v);
    }

    // ---------------------------------------------------------
    // Fill → numeric (deterministic hash)
    // ---------------------------------------------------------
    let fill = 0;
    const fillStr = getComputedStyle(el).fill || "";
    if (fillStr && fillStr !== "none") {
        let h = 0;
        for (let i = 0; i < fillStr.length; i++) {
            h = ((h << 5) - h) + fillStr.charCodeAt(i);
            h |= 0;
        }
        fill = clamp01(Math.abs(h % 1000) / 1000);
    }

    return {
        x, y,
        width,
        height,
        area,
        aspect,
        size,
        scale,
        rotation,
        opacity,
        fill
    };
}





function findOscFrame(el) {
    let node = el.parentElement;
    while (node) {
        if (
            node.hasAttribute?.("data-osc-frame") ||
            (typeof node.id === "string" && node.id.includes("osc_frame"))
        ) {
            return node;
        }
        node = node.parentElement;
    }
    return null;
}




// ---------------------------------------------------------------------------
// OSC sender
// ---------------------------------------------------------------------------

// function sendOSC(payload) {
//     if (!window.socket || window.socket.readyState !== WebSocket.OPEN) return;
//     try {
//         window.socket.send(JSON.stringify(payload));
//     } catch (e) {
//         console.warn("[osc] send failed:", e);
//     }
// }

function fmt(v) {
  if (Number.isInteger(v)) return v;           // leave ints alone
  return Number(v.toFixed(3));                 // 0.123456 → 0.123
}

// Centralised OSC sender
export function sendOSCMessage(payload, options = {}) {
    const { silent = false } = options;

    if (!payload || typeof payload !== "object") return;

    window.lastOscMessage = payload;

    try {
        const box = document.getElementById("osc-latest");

        if (box) {
            let path = "/oscilla";
            if (payload.addr) path += `/${payload.addr}`;

            let values = [];

            if (Array.isArray(payload.args)) {
                values = payload.args.map(fmt);
            } else {
                for (const [k, v] of Object.entries(payload)) {
                    if (k === "addr" || k === "type" || k === "timestamp") continue;
                    if (typeof v === "number") values.push(fmt(v));
                }
            }

            box.textContent = `${path} ${values.join(" ")}`.trim();
        }
    } catch {}

    if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
        if (!silent) console.warn("[osc] socket not ready", payload);
        return;
    }

    try {
        window.socket.send(JSON.stringify(payload));
    } catch (err) {
        console.warn("[osc] send failed", err, payload);
    }
}



function norm(v, inMin, inMax) {
    if (!Number.isFinite(v)) return 0;
    if (v <= inMin) return 0;
    if (v >= inMax) return 1;
    return (v - inMin) / (inMax - inMin);
}
// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export function handleOscCue(ast, el, options = {}) {

    if (!ast || !el) {
        console.warn("[handleOscCue] Missing ast or el", ast, el);
        return;
    }

    // ---------------- helpers ----------------
    function clamp01(x) {
        return Math.min(1, Math.max(0, x));
    }

    function norm(value, min, max) {
        return clamp01((value - min) / (max - min));
    }

    const astArgs = ast.args || [];

    let addr = null;
    let uid = null;
    let trig = "auto";
    let prestate = null;

    const staticParams = {};
    const visualMappings = {};

    // ------------------ parse args ------------------
    for (const a of astArgs) {
        const key = a.type;
        const val = a.value;

        if (key === "addr") addr = String(val).trim();
        else if (key === "uid") uid = String(val).trim();
        else if (key === "root") { staticParams.root = Number(val); }
        else if (key === "trig") trig = String(val).toLowerCase();
        else if (key === "prestate") prestate = val;
        else if (val && typeof val === "object" && val.type)
            staticParams[key] = val;
        else if (typeof val === "string")
            visualMappings[key] = val;
        else
            staticParams[key] = val;
    }

    if (!addr) {
        console.error("[osc] addr missing");
        return;
    }

    if (prestate) applyPrestateBeforeStart(el, prestate);

    function evalRuntime(val) {
        if (val == null) return val;
        if (typeof val !== "object") return val;

        if (val.type === "irand")
            return Math.floor(val.min + Math.random() * (val.max - val.min + 1));

        if (val.type === "rand")
            return val.min + Math.random() * (val.max - val.min);

        if (val.type === "deg") {
            const d = evalRuntime(val.degree);
            const o = evalRuntime(val.octave);
            if (Number.isFinite(d) && Number.isFinite(o)) return 12 * o + d;
            return null;
        }

        return val;
    }

    // ------------------ fire osc ------------------
    const start = () => {

        const sample = sampleVisual(el);
        if (!sample) return;

        // --- real pixel geometry ---
        const rect = el.getBoundingClientRect();
        const pxWidth = rect.width || 0;
        const pxHeight = rect.height || 0;
        const pxArea = Math.max(0, pxWidth * pxHeight);

        const values = {};
        for (const [param, source] of Object.entries(visualMappings)) {
            if (sample[source] != null) values[param] = sample[source];
        }

        const evaluatedStatic = {};
        for (const [key, val] of Object.entries(staticParams)) {

            if (key === "pitch" && val?.type === "deg") {
                let deg = evalRuntime(val.degree);
                let oct = evalRuntime(val.octave);

                if (Number.isFinite(deg)) deg = Math.round(deg);
                if (Number.isFinite(oct)) oct = Math.round(oct);

                values.pitchDeg = deg ?? 0;
                values.pitchOct = oct ?? 0;
                continue;
            }

            if (key === "pitch" && val?.type === "hz") {
                values.pitchHz = evalRuntime(val.value);
                continue;
            }

            if (key === "pitch" && val?.type === "midi") {
                values.pitchMidi = evalRuntime(val.value);
                continue;
            }

            evaluatedStatic[key] = evalRuntime(val);
        }

        // -------------------------------
        // POSITIONAL OSC ARGUMENTS
        // pitchType, pitchA, pitchB, size, env, density
        // -------------------------------
        let pitchType = 0;
        let pitchA = 0;
        let pitchB = 0;

        if (values.pitchDeg != null && values.pitchOct != null) {
            pitchType = 1;
            pitchA = values.pitchDeg;
            pitchB = values.pitchOct;
        }
        else if (values.pitchHz != null) {
            pitchType = 2;
            pitchA = values.pitchHz;
        }
        else if (values.pitchMidi != null) {
            pitchType = 3;
            pitchA = values.pitchMidi;
        }
        else if (visualMappings.pitch === "y" && sample.y != null) {
            pitchType = 4;
            pitchA = sample.y;
        }

        // keep size/env as before (can refine later)
        const size = values.size ?? sample.size ?? 0;
        const env = values.env ?? values.width ?? sample.width ?? 0;

        // --- area → density normalization (pixels!) ---
        let density;

        if (typeof values.density === "number") {
            density = values.density;
        } else {
            const MIN_AREA = 9;    // ≈ 3×3 px
            const MAX_AREA = 2500;  // ≈ 50×50 px

            density = norm(pxArea, MIN_AREA, MAX_AREA);

            // debug
            // console.log("[osc] px:", { pxWidth, pxHeight, pxArea, density });
        }

        const payload = {
            type: "osc_value",
            addr,
            args: [
                pitchType,
                pitchA,
                pitchB,
                size,
                env,
                density
            ],
            timestamp: Date.now()
        };

        if (staticParams.root != null) {
            payload.args.push(staticParams.root);
        }

        sendOSCMessage(payload);
        emitCueComplete(ast.raw || addr, "osc");
    };



    if (el && needsArming(el)) {
        armGhostClickable(el, start);
        return;
    }

    start();
}






