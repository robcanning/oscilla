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

function sampleVisual(el) {
    const box = el.getBBox?.();
    const vp = getViewportBox();
    if (!box || !vp) return null;

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    const x = clamp01((cx - vp.x) / vp.w);
    const y = clamp01((cy - vp.y) / vp.h);

    const size = clamp01(
        Math.max(box.width / vp.w, box.height / vp.h)
    );

    // scale (best effort)
    let scale = 1;
    const t = el.style.transform || "";
    const m = t.match(/scale\(\s*([-\d.+eE]+)/);
    if (m) {
        const s = parseFloat(m[1]);
        if (Number.isFinite(s)) scale = s;
    }

    // rotation (0–1)
    let rotation = 0;
    const r = t.match(/rotate\(\s*([-\d.+eE]+)/);
    if (r) {
        const deg = parseFloat(r[1]);
        if (Number.isFinite(deg)) {
            rotation = ((deg % 360) + 360) % 360 / 360;
        }
    }

    // opacity
    let opacity = 1;
    const o = getComputedStyle(el).opacity;
    if (o != null) {
        const v = parseFloat(o);
        if (Number.isFinite(v)) opacity = clamp01(v);
    }

    // fill → numeric hash (stable, deterministic)
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

    return { x, y, size, scale, rotation, opacity, fill };
}

// ---------------------------------------------------------------------------
// OSC sender
// ---------------------------------------------------------------------------

function sendOSC(payload) {
    if (!window.socket || window.socket.readyState !== WebSocket.OPEN) return;
    try {
        window.socket.send(JSON.stringify(payload));
    } catch (e) {
        console.warn("[osc] send failed:", e);
    }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export function handleOscCue(ast, el, options = {}) {
    if (!ast || !el) return;

    const astArgs = ast.args || [];

    let addr = null;
    let uid = null;
    let trig = "auto";
    let prestate = null;

    const mappings = {}; // paramName → visualKey

    // ---------------------------------------------------------
    // Parse generic param:value args
    // ---------------------------------------------------------
    for (const a of astArgs) {
        const key = a.key || a.type;
        const val = a.value;

        if (key === "addr") addr = String(val).trim();
        else if (key === "uid") uid = String(val).trim();
        else if (key === "trig") trig = String(val).toLowerCase();
        else if (key === "prestate") prestate = val;
        else {
            // generic mapping (e.g. pitch:y, amp:size)
            mappings[key] = String(val).trim();
        }
    }

    if (!addr) {
        console.warn("[osc] Missing addr: — osc() skipped");
        return;
    }

    // ---------------------------------------------------------
    // Prestate handling (same as animations)
    // ---------------------------------------------------------
    if (el && prestate) {
        applyPrestateBeforeStart(el, prestate);
    }

    const start = () => {
        const sample = sampleVisual(el);
        if (!sample) return;

        const values = {};

        for (const [param, source] of Object.entries(mappings)) {
            if (sample[source] != null) {
                values[param] = sample[source];
            }
        }

        const payload = {
            type: "osc_value",
            addr,
            values,
            timestamp: Date.now()
        };

        if (uid) payload.uid = uid;

        sendOSC(payload);
        emitCueComplete(ast.raw || addr, "osc");
    };

    // ---------------------------------------------------------
    // Trigger routing (shared behaviour)
    // ---------------------------------------------------------
    if (el && needsArming(el)) {
        armGhostClickable(el, start);
        return;
    }

    // ---------------------------------------------------------
    // Trigger handling for osc()
    // ---------------------------------------------------------

    // ghostClickable → only makes sense if element exists
    if (el && needsArming(el)) {
        armGhostClickable(el, start);
        return;
    }

    // playhead / auto / click → fire immediately
    start();

}
