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

    // console.group("[handleOscCue] ENTER");

    if (!ast || !el) {
        console.warn("[handleOscCue] Missing ast or el", ast, el);
        console.groupEnd();
        return;
    }

    // console.log("[handleOscCue] AST:", JSON.parse(JSON.stringify(ast)));

    const astArgs = ast.args || [];

    let addr = null;
    let uid = null;
    let trig = "auto";
    let prestate = null;

    // 🔹 Semantic params (hz, midi, deg, rand, irand, literals)
    const staticParams = {};

    // 🔹 Visual mappings → sampled each trigger
    const visualMappings = {};

    // ---------------------------------------------------------
    // Parse args
    // ---------------------------------------------------------
    for (const a of astArgs) {

        const key = a.type;
        const val = a.value;

        // console.log("[handleOscCue] arg:", key, val);

        if (key === "addr") {
            addr = typeof val === "string" ? val.trim() : String(val);
        }
        else if (key === "uid") {
            uid = typeof val === "string" ? val.trim() : String(val);
        }
        else if (key === "trig") {
            trig = String(val).toLowerCase();
        }
        else if (key === "prestate") {
            prestate = val;
        }

        // -------------------------------------------------
        // Typed / semantic values
        // (hz, midi, deg, rand, irand)
        // -------------------------------------------------
        else if (val && typeof val === "object" && val.type) {
            staticParams[key] = val;
        }

        // -------------------------------------------------
        // Visual mappings (env:width, bright:opacity, etc.)
        // -------------------------------------------------
        else if (typeof val === "string") {
            visualMappings[key] = val;
        }

        // -------------------------------------------------
        // Literal fallback
        // -------------------------------------------------
        else {
            staticParams[key] = val;
        }
    }

    if (!addr) {
        console.error("[handleOscCue] ❌ addr is NULL — aborting");
        console.groupEnd();
        return;
    }

    // ---------------------------------------------------------
    // Prestate
    // ---------------------------------------------------------
    if (prestate) {
        applyPrestateBeforeStart(el, prestate);
    }

    // ---------------------------------------------------------
    // Runtime evaluator (event-time randomness)
    // ---------------------------------------------------------
function evalRuntime(val) {
  if (val == null) return val;

  // literals
  if (typeof val !== "object") return val;

  // integer random
  if (val.type === "irand") {
    return Math.floor(
      val.min + Math.random() * (val.max - val.min + 1)
    );
  }

  // float random
  if (val.type === "rand") {
    return val.min + Math.random() * (val.max - val.min);
  }

  // deg(d,o) → numeric pitch (MIDI-style)
  if (val.type === "deg") {
    const d = evalRuntime(val.degree);
    const o = evalRuntime(val.octave);

    if (Number.isFinite(d) && Number.isFinite(o)) {
      return 12 * o + d;   // ✅ YOUR pitch mapping
    }

    return null;
  }

  return val;
}


    // ---------------------------------------------------------
    // Fire OSC
    // ---------------------------------------------------------
    const start = () => {

        // console.group("[handleOscCue] START");

        const sample = sampleVisual(el);
        if (!sample) {
            console.warn("[handleOscCue] sampleVisual returned null");
            console.groupEnd();
            return;
        }

        // 🔹 Visual (continuous) values
        const values = {};
        for (const [param, source] of Object.entries(visualMappings)) {
            if (sample[source] != null) {
                values[param] = sample[source];
            }
        }

// 🔹 Evaluate runtime semantic params (MODE B: semantic pitch)
const evaluatedStatic = {};
// 🔹 Evaluate runtime semantic params (MODE B — FLAT)
for (const [key, val] of Object.entries(staticParams)) {

  if (key === "pitch" && val?.type === "deg") {
    const deg = evalRuntime(val.degree);
    const oct = evalRuntime(val.octave);

    if (Number.isFinite(deg)) values.pitchDeg = deg;
    if (Number.isFinite(oct)) values.pitchOct = oct;
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



  // ----------------------------
  // Other semantic params
  // ----------------------------
  const resolved = evalRuntime(val);
  evaluatedStatic[key] = resolved;
}


        // -------------------------------------------------
        // Build payload
        // -------------------------------------------------
        const payload = {
            type: "osc_value",
            addr,
            values,
            static: evaluatedStatic,
            timestamp: Date.now()
        };

        if (uid) payload.uid = uid;

        // console.log("[handleOscCue] PAYLOAD →",
        //     JSON.parse(JSON.stringify(payload))
        // );

        sendOSC(payload);
        emitCueComplete(ast.raw || addr, "osc");

        console.groupEnd(); // START
    };

    // ---------------------------------------------------------
    // Trigger routing
    // ---------------------------------------------------------
    if (el && needsArming(el)) {
        armGhostClickable(el, start);
        console.groupEnd();
        return;
    }

    start();
    console.groupEnd(); // ENTER
}
 
    

