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
  const cy = box.top  + box.height / 2;

  const lx = cx - vp.left;
  const ly = cy - vp.top;

  const x = clamp01(lx / vp.width);
  const y = clamp01(1 - (ly / vp.height)); // invert Y for musical semantics

  // ---------------------------------------------------------
  // Geometry (screen-space, perceptual)
  // ---------------------------------------------------------
  const widthRaw  = clamp01(box.width  / vp.width);
  const heightRaw = clamp01(box.height / vp.height);

  const width  = Math.sqrt(widthRaw);                  // envelope / time
  const height = Math.sqrt(heightRaw);                 // brightness
  const area   = Math.pow(widthRaw * heightRaw, 0.25); // density / energy

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
