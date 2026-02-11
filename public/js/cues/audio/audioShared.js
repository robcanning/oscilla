// =============================================================
//  audioShared.js -- shared state, utilities, overlay system
//  Used by: audio.js, audioPool.js, audioImpulse.js
// =============================================================

// =============================================================
//  Shared AudioContext (singleton)
// =============================================================

export const sharedAudioCtx =
  window.sharedAudioCtx ||
  (window.sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)());

// =============================================================
//  Shared state
// =============================================================

export const audioBufferCache = window.audioBufferCache || new Map();
window.audioBufferCache = audioBufferCache;

export const audioLastHit = window.audioLastHit || new Map();
window.audioLastHit = audioLastHit;

export let activeAudioCues = window.activeAudioCues || new Set();
window.activeAudioCues = activeAudioCues;

export const audioDebounce = new Map();
export const maxAudioInstances = 10;

// =============================================================
//  Utility: evaluate random expressions from DSL
// =============================================================

export function evalMaybeRandom(v) {
  if (v == null) return v;

  // Handle { type: "rand", min, max } from extractValueExpr
  if (typeof v === "object" && (v.type === "rand" || v.type === "irand")) {
    const result = v.min + Math.random() * (v.max - v.min);
    return v.type === "irand" ? Math.floor(result) : result;
  }

  // Handle { type: "funcCall", name: "rand", args: [min, max] }
  if (typeof v === "object" && v.type === "funcCall") {
    if ((v.name === "rand" || v.name === "irand") && v.args?.length === 2) {
      const a = Number(v.args[0]);
      const b = Number(v.args[1]);
      if (!isNaN(a) && !isNaN(b)) {
        const result = a + Math.random() * (b - a);
        return v.name === "irand" ? Math.floor(result) : result;
      }
    }
    return null;
  }

  return v;
}

// =============================================================
//  Utility: normalise audio source filename
// =============================================================

export function normalizeAudioSource(src) {
  if (!src) return null;
  src = src.replace(/['"]/g, "").trim();
  if (/\.(wav|ogg|mp3|m4a)$/i.test(src)) return src;
  return `${src}.wav`;
}

// =============================================================
//  Utility: select file from pool
//
//  Shared selection logic for audioPool and audioImpulse.
//  Modes:
//    "rand"      -- pure random, repeats possible
//    "shuffle"   -- no repeats until pool exhausted, then reshuffle
//    "sequential"-- play in order, wrap around
// =============================================================

/**
 * Select the next file from a pool object.
 * Mutates pool.cursor and pool.files (on reshuffle).
 *
 * @param {object} pool - { files: string[], mode: string, cursor: number }
 * @returns {string|null} selected filename, or null if pool empty
 */
export function selectFromPool(pool) {
  if (!pool?.files?.length) return null;

  if (pool.mode === "rand") {
    return pool.files[Math.floor(Math.random() * pool.files.length)];
  }

  // sequential or shuffle: use cursor
  const file = pool.files[pool.cursor % pool.files.length];
  pool.cursor++;

  // shuffle: reshuffle when exhausted
  if (pool.mode !== "sequential" && pool.cursor >= pool.files.length) {
    pool.files = [...pool.files].sort(() => Math.random() - 0.5);
    pool.cursor = 0;
  }

  // sequential: wrap around
  if (pool.mode === "sequential" && pool.cursor >= pool.files.length) {
    pool.cursor = 0;
  }

  return file;
}

// =============================================================
//  Utility: generate fallback sine buffer (for offline testing)
// =============================================================

export function generateToneBuffer(ctx, freq = 440, dur = 0.3, amp = 0.3) {
  const rate = ctx.sampleRate;
  const len = rate * dur;
  const buf = ctx.createBuffer(1, len, rate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.sin((2 * Math.PI * freq * i) / rate) * amp;
  return buf;
}

// =============================================================
//  OSC audio trigger via WebSocket
// =============================================================

export function sendAudioOscTrigger({ cueId, filename, volume = 1, loop = 1 }) {
  if (!window.wsEnabled || !window.socket || window.socket.readyState !== WebSocket.OPEN) {
    console.warn("[AUDIO] OSC send skipped (socket not open)");
    return;
  }

  const message = {
    type: "osc_audio_trigger",
    filename,
    volume,
    loop,
    timestamp: Date.now(),
  };

  console.log("[OSC] Sending audio cue:", message);
  window.socket.send(JSON.stringify(message));
}


// =============================================================
//  AUDIO OVERLAY SYSTEM
// =============================================================

/**
 * Parse overlay flag: 0/off, 1/brief, 2/expanded (default)
 */
export function parseOverlayLevel(value) {
  if (value === undefined || value === null) return 2;

  const strVal = String(value).toLowerCase().trim();
  if (strVal === "off" || strVal === "false" || strVal === "none" || strVal === "0") return 0;
  if (strVal === "brief" || strVal === "short" || strVal === "min" || strVal === "1") return 1;
  if (strVal === "expanded" || strVal === "full" || strVal === "true" || strVal === "2") return 2;

  const numVal = Number(value);
  if (!isNaN(numVal)) {
    if (numVal <= 0) return 0;
    if (numVal === 1) return 1;
    return 2;
  }
  return 2;
}

/**
 * Format a value for overlay display - handles funcCall, rand, patterns
 */
export function formatOverlayValue(v) {
  if (v === null || v === undefined) return "?";

  if (typeof v === "object") {
    if (v.type === "funcCall" && v.name) {
      const args = Array.isArray(v.args) ? v.args.join(",") : "";
      return `${v.name}(${args})`;
    }
    if (v.type === "rand" || v.type === "irand") {
      return `${v.type}(${v.min},${v.max})`;
    }
    if (v.type === "pattern" && v.name) {
      const vals = Array.isArray(v.values) ? v.values.slice(0, 4).join(",") : "";
      return `${v.name}[${vals}${v.values?.length > 4 ? "..." : ""}]`;
    }
    return JSON.stringify(v);
  }

  if (typeof v === "number") {
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(2).replace(/\.?0+$/, "");
  }

  return String(v);
}

/**
 * Format overlay text for audioFile
 */
export function formatAudioFileOverlay(params, level) {
  const parts = ["audioFile"];
  const src = params.src || params.file || "?";
  parts.push(src);

  if (level >= 2) {
    if (params.amp !== undefined && params.amp !== 1) parts.push(`amp:${formatOverlayValue(params.amp)}`);
    if (params.loop !== undefined && params.loop !== 1) parts.push(`loop:${params.loop}`);
    if (params.pitch !== undefined && params.pitch !== 1) parts.push(`pitch:${formatOverlayValue(params.pitch)}`);
    if (params.pan !== undefined && params.pan !== 0) parts.push(`pan:${formatOverlayValue(params.pan)}`);
    if (params.fadein || params.fadeIn) parts.push(`fadeIn:${formatOverlayValue(params.fadein || params.fadeIn)}`);
    if (params.fadeout || params.fadeOut) parts.push(`fadeOut:${formatOverlayValue(params.fadeout || params.fadeOut)}`);
    if (params.fade) parts.push(`fade:${formatOverlayValue(params.fade)}`);
  }

  return parts.join(" | ");
}

/**
 * Format overlay text for audioPool
 */
export function formatAudioPoolOverlay(params, level) {
  const parts = ["audioPool"];
  parts.push(params.path || "?");

  if (level >= 2) {
    if (params.uid) parts.push(`uid:${params.uid}`);
    if (params.mode && params.mode !== "shuffle") parts.push(`mode:${params.mode}`);
    if (params.amp !== undefined) parts.push(`amp:${formatOverlayValue(params.amp)}`);
    if (params.pan !== undefined) parts.push(`pan:${formatOverlayValue(params.pan)}`);
    if (params.pitch !== undefined) parts.push(`pitch:${formatOverlayValue(params.pitch)}`);
    if (params.poly !== undefined && params.poly !== 1) parts.push(`poly:${params.poly}`);
    if (params.fadeout || params.fadeOut) parts.push(`fadeOut:${formatOverlayValue(params.fadeout || params.fadeOut)}`);
  }

  return parts.join(" | ");
}

/**
 * Format overlay text for audioImpulse
 */
export function formatAudioImpulseOverlay(params, level) {
  const parts = ["audioImpulse"];
  parts.push(params.path || "?");

  if (level >= 2) {
    if (params.rate !== undefined) parts.push(`rate:${params.rate}`);
    if (params.jitter !== undefined && params.jitter !== 0) parts.push(`jitter:${formatOverlayValue(params.jitter)}`);
    if (params.amp !== undefined) parts.push(`amp:${formatOverlayValue(params.amp)}`);
    if (params.pan !== undefined) parts.push(`pan:${formatOverlayValue(params.pan)}`);
    if (params.pitch !== undefined) parts.push(`pitch:${formatOverlayValue(params.pitch)}`);
    if (params.poly !== undefined && params.poly !== 6) parts.push(`poly:${params.poly}`);
    if (params.lifetime && params.lifetime !== "process") parts.push(`life:${params.lifetime}`);
    if (params.release !== undefined) parts.push(`rel:${formatOverlayValue(params.release)}`);
  }

  return parts.join(" | ");
}


/**
 * Create audio overlay - SELF-CONTAINED (does not use createOscOverlay)
 */
export function createAudioOverlay({
  anchorEl,
  label = "audio",
  mode = "auto",
  track = true
} = {}) {

  if (!anchorEl) {
    return {
      el: null,
      update() { },
      position() { },
      destroy() { }
    };
  }

  const box = document.createElement("div");
  box.className = "oscilla-audio-overlay";
  box.style.cssText = `
    position: fixed;
    pointer-events: none;
    z-index: 99990;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.3;
    padding: 2px 7px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.2);
    color: #000;
    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
    opacity: 0.75;
    transition: opacity 0.15s ease, background 0.15s ease, border-color 0.15s ease;
  `;

  const r = anchorEl.getBoundingClientRect();
  box.style.maxWidth = `${Math.max(150, r.width - 8)}px`;
  box.style.whiteSpace = "normal";
  box.style.wordWrap = "break-word";

  box.textContent = label;
  document.body.appendChild(box);

  function position() {
    if (!anchorEl || !box.isConnected) return;
    const r = anchorEl.getBoundingClientRect();
    box.style.left = `${r.left + 4}px`;
    box.style.top = `${r.top + 4}px`;
  }

  let tracking = false;
  function loop() {
    if (!tracking) return;
    try { position(); } catch { }
    requestAnimationFrame(loop);
  }

  if (track) {
    tracking = true;
    requestAnimationFrame(loop);
  }

  position();

  return {
    el: box,
    update(text) {
      if (text !== undefined) {
        box.textContent = text;
      }
    },
    position,
    destroy() {
      tracking = false;
      try { box.remove(); } catch { }
    }
  };
}
