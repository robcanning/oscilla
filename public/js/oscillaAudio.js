// ===================
//  Audio Cue Support
// ===================

/**
 * Stops audio cues (specific file or all)
 * Supports optional fadeOut and always clears triggeredCues + _cueInsideState.
 * @param {string} cueId - e.g. "cueAudioStop(noise.wav)" or "cueAudioStop()"
 * @param {object} cueParams - e.g. { choice: "noise.wav", fadeOut: 200 }
 */

import { sendOSCMessage, createOscOverlay } from "./oscillaOSC.js";

export async function handleAudioStopCue(cueId, cueParams = {}) {
  const fadeOutMs = cueParams.fadeOut ?? 120;
  const choice = cueParams.choice || cueId.match(/\(([^)]+)\)/)?.[1];

  try {
    if (choice) {
      // Stop a single file
      stopAudioCue(choice, fadeOutMs);
      console.log(`[AUDIO] 🔻 cueAudioStop → ${choice}`);
    } else {
      // Stop all if no filename provided
      stopAllAudio(fadeOutMs);
      console.log(`[AUDIO] cueAudioStop → all`);
    }

    // Optional OSC broadcast
    sendOSC('/cueAudio/stop', { filename: choice || 'all', fadeOutMs });
  } catch (err) {
    console.warn(`[AUDIO]  Error in handleAudioStopCue:`, err);
  } finally {
    // ✅ Always clear triggered cue state
    if (typeof triggeredCues !== 'undefined') triggeredCues.clear();
    if (window._cueInsideState) window._cueInsideState.clear();
  }
}

// =========================================================
// 🌐 Globals
// =========================================================
const audioDebounce = new Map();
const maxAudioInstances = 10;

// Shared AudioContext (singleton)
export const sharedAudioCtx =
  window.sharedAudioCtx ||
  (window.sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)());

// Cache + state
export const audioBufferCache = window.audioBufferCache || new Map();
export const audioLastHit = window.audioLastHit || new Map();
export let activeAudioCues = window.activeAudioCues || new Set();

// --- Optional OSC stub (replace with your WebSocket / OSC sender) ---
// export function sendOSC(address, args) {
//   console.log(`[OSC] → ${address}`, args);
// }

// --- Utility: generate fallback sine buffer (for offline testing) ---
export function generateToneBuffer(ctx, freq = 440, dur = 0.3, amp = 0.3) {
  const rate = ctx.sampleRate;
  const len = rate * dur;
  const buf = ctx.createBuffer(1, len, rate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.sin((2 * Math.PI * freq * i) / rate) * amp;
  return buf;
}



// ------------------------------------------------------------
// cueAudio(): play sound natively (Web Audio API)
// ------------------------------------------------------------

function normalizeAudioSource(src) {
  if (!src) return null;
  src = src.replace(/['"]/g, "").trim();
  if (/\.(wav|ogg|mp3|m4a)$/i.test(src)) return src;
  return `${src}.wav`;
}

// =============================================================
//  handleAudioCue with fadeout scheduling
// =============================================================
export async function handleAudioCue(ast) {
  const ctx =
    window.sharedAudioCtx ||
    (window.sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)());

  try {
    if (ctx.state === "suspended") await ctx.resume();

    let {
      src,
      uid,
      amp = 1,
      loop = 1,
      toggle = false,
      fade,
      fadeIn = 0,
      fadeOut = 0,
      pan,          // may come directly
      params = {}   // or live here
    } = ast || {};

    // PITCH — prefer direct, fallback to params
    const pitch =
      ast.pitch !== undefined
        ? evalMaybeRandom(ast.pitch)
        : evalMaybeRandom(params.pitch) ?? 1;

    // PAN — prefer direct, fallback to params
    let panVal = null;

    if (pan !== undefined) {
      panVal = evalMaybeRandom(pan);
    } else if (params.pan !== undefined) {
      panVal = evalMaybeRandom(params.pan);
    }

    if (panVal !== null && panVal !== undefined) {
      panVal = Math.max(-1, Math.min(1, Number(panVal)));
    }

    const key = uid && uid.trim();
    if (!key) { console.warn("[cueAudio] Missing uid:", ast); return; }
    if (!src) { console.warn("[cueAudio] Missing src:", ast); return; }

    const filename = src.endsWith(".wav") ? src : `${src}.wav`;

    // DON'T convert to Number yet - let resolveFade handle percentage strings
    if (fade !== undefined) {
      fadeIn = fade;
      fadeOut = fade;
    }
    fadeIn = fadeIn ?? 0;
    fadeOut = fadeOut ?? 0;

    const reg = (window.activeAudioCues ||= new Map());

    // toggle handling
    if (toggle && reg.has(key)) {
      const v = reg.get(key);
      try { v?.stop?.(fadeOut); } catch { }
      reg.delete(key);
      window.dispatchEvent(new CustomEvent("oscilla:audio", {
        detail: { uid: key, file: filename, state: "stop" }
      }));
      return;
    }

    // retrigger
    if (!toggle && reg.has(key)) {
      const v = reg.get(key);
      try { v?.stop?.(Math.min(fadeOut, 0.03)); } catch { }
      reg.delete(key);
    }

    let replaceStop = () => { };
    reg.set(key, { uid: key, filename, stop: (sec) => replaceStop(sec), _pending: true });

    window.dispatchEvent(new CustomEvent("oscilla:audio", {
      detail: { uid: key, file: filename, state: "play" }
    }));

    // fetch
    const projectPath = resolveProjectPath("audio", filename);
    const sharedPath = `${window.sharedDir}audio/${filename}`;

    let resp;
    try {
      const head = await fetch(projectPath, { method: "HEAD" });
      resp = await fetch(head.ok ? projectPath : sharedPath);
    } catch {
      resp = await fetch(sharedPath);
    }

    const buf = await ctx.decodeAudioData(await resp.arrayBuffer());
    const effectiveDuration = buf.duration / (Number(pitch) || 1);

    // Use enhanced resolveFade with effectiveDuration
    fadeIn = resolveFade(fadeIn, effectiveDuration, 0);
    fadeOut = resolveFade(fadeOut, effectiveDuration, 0);

    // Clamp to never exceed duration
    fadeIn = Math.min(fadeIn, effectiveDuration);
    fadeOut = Math.min(fadeOut, effectiveDuration);



    function resolveFade(v, effectiveDuration, fallback = 0) {
      if (v == null) return fallback;

      // -------------------------------------------------------
      // CASE 1: funcCall with percentage or numeric args
      // e.g. { type: "funcCall", name: "rand", args: ["10%", "60%"] }
      // e.g. { type: "funcCall", name: "rand", args: [0.1, 0.5] }
      // -------------------------------------------------------
      if (typeof v === "object" && v.type === "funcCall" && (v.name === "rand" || v.name === "irand")) {
        const [argA, argB] = v.args || [];

        // Helper to resolve a single value (percent or number)
        const resolveArg = (arg) => {
          if (typeof arg === "string" && arg.trim().endsWith("%")) {
            const pct = Number(arg.replace("%", "").trim()) / 100;
            return isNaN(pct) ? 0 : effectiveDuration * pct;
          }
          return Number(arg) || 0;
        };

        const minVal = resolveArg(argA);
        const maxVal = resolveArg(argB);

        const result = Math.min(minVal, maxVal) + Math.random() * Math.abs(maxVal - minVal);

        if (v.name === "irand") {
          return Math.floor(result);
        }

        console.log(`[resolveFade] ${v.name}(${argA}, ${argB}) → ${result.toFixed(3)}s (duration: ${effectiveDuration.toFixed(2)}s)`);
        return result;
      }

      // -------------------------------------------------------
      // CASE 2: { type: "rand", min, max } from parser
      // -------------------------------------------------------
      if (typeof v === "object" && (v.type === "rand" || v.type === "irand")) {
        const result = v.min + Math.random() * (v.max - v.min);
        return v.type === "irand" ? Math.floor(result) : result;
      }

      // -------------------------------------------------------
      // CASE 3: Percentage string e.g. "50%"
      // -------------------------------------------------------
      if (typeof v === "string" && v.trim().endsWith("%")) {
        const pct = Number(v.replace("%", "").trim()) / 100;
        if (isNaN(pct)) return fallback;
        return Math.max(0, effectiveDuration * pct);
      }

      // -------------------------------------------------------
      // CASE 4: Plain number (seconds)
      // -------------------------------------------------------
      const num = Number(v);
      return isNaN(num) ? fallback : num;
    }

    fadeIn = resolveFade(fadeIn, 0);
    fadeOut = resolveFade(fadeOut, 0);

    // Clamp to never exceed duration
    fadeIn = Math.min(fadeIn, effectiveDuration);
    fadeOut = Math.min(fadeOut, effectiveDuration);

    console.log("[cueAudio] resolved fades", {
      fadeIn,
      fadeOut,
      effectiveDuration,
      pitch
    });

    // graph
    const gainNode = ctx.createGain();
    let panNode = null;

    if (panVal !== null && !isNaN(panVal)) {
      panNode = new StereoPannerNode(ctx, { pan: panVal });
      gainNode.connect(panNode).connect(ctx.destination);
    } else {
      gainNode.connect(ctx.destination);
    }

    let remaining = (loop === 0 ? Infinity : Number(loop)) || 1;
    let stopped = false;
    let srcNode = null;

    const stop = (dur = fadeOut) => {
      stopped = true;
      const now = ctx.currentTime;

      try {
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + dur);
      } catch { }

      try { srcNode?.stop(now + dur + 0.01); } catch { }
    };

    replaceStop = stop;
    reg.set(key, { uid: key, filename, stop });

    const cleanup = () => {
      if (reg.get(key)?.stop === stop) reg.delete(key);
      try { gainNode.disconnect(); } catch { }
      try { panNode?.disconnect(); } catch { }
      srcNode = null;

      window.dispatchEvent(new CustomEvent("oscilla:audio", {
        detail: { uid: key, file: filename, state: "stop" }
      }));
    };

    const playOne = (first) => {
      srcNode = ctx.createBufferSource();
      srcNode.buffer = buf;

      // ACTUAL pitch application
      try {
        srcNode.playbackRate.value = Number(pitch) || 1;
      } catch { }

      srcNode.connect(gainNode);

      const now = ctx.currentTime;
      const ampVal = Number(amp) || 1;

      // Schedule the entire envelope upfront
      gainNode.gain.cancelScheduledValues(now);

      if (first && fadeIn > 0) {
        // Start at 0, ramp up to amp over fadeIn
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(ampVal, now + fadeIn);
      } else {
        // Start at full amp
        gainNode.gain.setValueAtTime(ampVal, now);
      }

      // Schedule fadeOut BEFORE the sound ends
      // The fadeOut must START at (duration - fadeOut) and END at duration
      if (fadeOut > 0 && remaining === 1) {
        const fadeOutStartTime = now + effectiveDuration - fadeOut;

        // Only schedule if fadeOut starts after fadeIn ends
        if (fadeOutStartTime > now + fadeIn) {
          // Hold at amp until fadeOut starts
          gainNode.gain.setValueAtTime(ampVal, fadeOutStartTime);
          // Then ramp down to 0
          gainNode.gain.linearRampToValueAtTime(0, now + effectiveDuration);
        } else {
          // fadeIn and fadeOut overlap - just ramp to 0 at end
          gainNode.gain.linearRampToValueAtTime(0, now + effectiveDuration);
        }
      }

      srcNode.onended = () => {
        if (stopped) return cleanup();
        remaining--;
        if (remaining > 0) return playOne(false);

        // Sound finished naturally - cleanup
        // (fadeOut was already scheduled above)
        setTimeout(cleanup, 50);
      };

      srcNode.start();
    };

    playOne(true);

  } catch (err) {
    console.error("[AUDIO]  handleAudioCue error:", err);

    try {
      const key = ast?.uid?.trim();
      const src = ast?.src;
      const file = src ? (src.endsWith(".wav") ? src : `${src}.wav`) : undefined;
      if (key && window.activeAudioCues?.has(key)) {
        window.activeAudioCues.delete(key);
        window.dispatchEvent(new CustomEvent("oscilla:audio", {
          detail: { uid: key, file, state: "stop" }
        }));
      }
    } catch { }
  } finally {
    try { window.triggeredCues?.clear?.(); } catch { }
    try { window._cueInsideState?.clear?.(); } catch { }
  }
}

// ============================================================
//  stopAllAudio — Global fade-out stop (filename scoped)
// ============================================================
export function stopAllAudio(filename, fadeOutSec = 1.0) {
  const ctx = window.sharedAudioCtx;
  const reg = window.activeAudioCues;
  if (!ctx || !reg) return;

  for (const [key, voice] of reg) {
    if (filename && voice.filename !== filename) continue; //  allow filename OR all

    try { voice.stop?.(fadeOutSec); } catch { }

    reg.delete(key);

    window.dispatchEvent(new CustomEvent("oscilla:audio", {
      detail: { uid: key, file: voice.filename, state: "stop" }
    }));
  }
}

// ========================================================
// 🌐 Send OSC audio trigger via WebSocket
// ========================================================
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

  console.log("[OSC] 🎧 Sending audio cue:", message);
  window.socket.send(JSON.stringify(message));
}

document.getElementById("stop-audio-button")?.addEventListener("click", () => {
  console.log("[AUDIO] 🔇 Global STOP triggered");

  const active = window.activeAudioCues;
  if (!active || active.size === 0) {
    console.warn("[AUDIO]  No active voices.");
    return;
  }

  const GLOBAL_FADE = 0.15;

  for (const [key, voice] of active.entries()) {
    try {
      voice.stop?.(GLOBAL_FADE);
      active.delete(key);

      window.dispatchEvent(new CustomEvent("oscilla:audio", {
        detail: { uid: key, file: voice.filename, state: "stop" }
      }));
    } catch (err) {
      console.warn(`[AUDIO] stop failed for ${key}:`, err);
    }
  }
});


// =============================================================
// 🎲 audioPool(...) — single hit from randomized pool
// =============================================================

// cache pool lists per uid
const audioPools = window.audioPools || (window.audioPools = new Map());


function evalMaybeRandom(v) {
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


async function ensureAudioPool(uid, params) {
  if (audioPools.has(uid)) return audioPools.get(uid);

  const { path, project } = params;

  // Guess current project if not passed
  const projectName =
    project ||
    window.currentProject ||
    (window.preferences && window.preferences.projectTitle) ||
    "default";

  const api = `/api/audio-list/${projectName}/${path}`;

  let files = [];

  try {
    const res = await fetch(api);
    const json = await res.json();
    files = Array.isArray(json.files) ? json.files : [];
  } catch (err) {
    console.warn("[audioPool] Failed to load audio list:", err);
  }

  const pool = {
    files,
    mode: params.mode || "shuffle",
    cursor: 0
  };

  audioPools.set(uid, pool);
  return pool;
}



// =============================================================
// handleAudioPoolCue with  overlay
// =============================================================

export async function handleAudioPoolCue(ast, el, opts = {}) {
  try {
    const params = ast.params || ast;

    const {
      path,
      glob,
      format = "wav",
      mode = "shuffle",
      uid = `${path || "pool"}-${glob || "all"}`,

      amp,
      fadein,
      fadeout,
      fade,
      loop = 1,

      osc,
      oscaddr
    } = params;

    if (!path) {
      console.warn("[audioPool] Missing path:", params);
      return;
    }

    const pool = await ensureAudioPool(uid, { path, glob, format, mode });

    if (!pool?.files?.length) {
      console.warn("[audioPool] No matching files:", params);
      return;
    }

    let file = null;

    // selection logic
    if (pool.mode === "rand") {
      file = pool.files[Math.floor(Math.random() * pool.files.length)];
    } else {
      // shuffle (no repeat until exhausted)
      file = pool.files[pool.cursor % pool.files.length];
      pool.cursor++;

      // reshuffle when looped
      if (pool.cursor >= pool.files.length) {
        pool.files = [...pool.files].sort(() => Math.random() - 0.5);
        pool.cursor = 0;
      }
    }

    //  Evaluate randomizable params
    const evaluatedAmp = evalMaybeRandom(amp) ?? 1;
    const panVal = evalMaybeRandom(params.pan) ?? 0;
    const pitchVal = evalMaybeRandom(params.pitch) ?? 1;

    //  Handle fade values - pass through raw for resolveFade in handleAudioCue
    let fadeInVal, fadeOutVal;
    if (fade !== undefined) {
      fadeInVal = fade;
      fadeOutVal = fade;
    } else {
      fadeInVal = fadein ?? 0;
      fadeOutVal = fadeout ?? 0;
    }

    let name = file.endsWith(`.${format}`) ? file : `${file}.${format}`;
    const filename = path ? `${path}/${name}` : name;

    // polyphony control
    const poly = Number(params.poly ?? (params.overlap ? 99 : 1));

    let playUid = uid;

    // If more than one allowed, generate unique instance IDs
    if (poly > 1) {
      playUid = `${uid}__${Date.now()}_${Math.floor(Math.random() * 9999)}`;
    }

    const cue = {
      type: "cueAudio",
      src: filename,
      uid: playUid,
      amp: Math.max(0, Math.min(1, Number(evaluatedAmp))),
      fadeIn: fadeInVal,   //  Pass raw - resolveFade handles in handleAudioCue
      fadeOut: fadeOutVal, //  Pass raw - resolveFade handles in handleAudioCue
      loop: Number(loop) || 1,
      toggle: false,
      pan: panVal,
      pitch: pitchVal
    };

    //  OVERLAY - show filename AND evaluated params
    if (el) {
      const overlay = createAudioOverlay({
        anchorEl: el,
        label: `🔊 ${path}`,
        mode: "auto"
      });

      // Format: "filename.wav | amp:0.7 pan:-0.3 pitch:1.2"
      const details = [
        `amp:${evaluatedAmp.toFixed(2)}`,
        `pan:${panVal.toFixed(2)}`,
        `pitch:${pitchVal.toFixed(2)}`
      ].join(" ");
      
      overlay.update(`${file} | ${details}`);
      overlay.position();

      // Auto-destroy after a short time (since audioPool is a one-shot)
      setTimeout(() => {
        overlay.destroy();
      }, 1500);
    }

    // optional OSC announcement
    if (osc || oscaddr) {
      try {
        sendOSCMessage({
          type: "osc_audio_pool",
          uid,
          filename,
          amp: cue.amp,
          fadeIn: cue.fadeIn,
          fadeOut: cue.fadeOut,
          pan: cue.pan,
          pitch: cue.pitch,
          addr: oscaddr || "/audio/client/pool"
        });
      } catch (err) {
        console.warn("[audioPool OSC] failed:", err);
      }
    }

    return handleAudioCue(cue);

  } catch (err) {
    console.error("[audioPool] error:", err);
  }
}


// =============================================================
//  audioImpulse(...) — stochastic repeating process
// =============================================================

const audioImpulses = window.audioImpulses || (window.audioImpulses = new Map());

function computeInterval(rate, jitter = 0) {
  if (!rate || rate <= 0) return 2.0;

  const base = 60 / rate; // events per minute → seconds between hits

  if (!jitter || jitter <= 0) return base;

  // jitter: 0 → stable, 1 → fully random (0..2x)
  const min = Math.max(0.01, base * (1 - jitter));
  const max = base * (1 + jitter);

  return min + Math.random() * (max - min);
}

async function ensureImpulsePool(uid, params) {
  // reuse the pool cache from audioPool
  return ensureAudioPool(uid, params);
}

function scheduleNextImpulse(state) {
  const { uid } = state;

  if (state.stopped) return;

  const interval = computeInterval(state.rate, state.jitter);

  state.timer = setTimeout(async () => {

    if (state.stopped) return;

    try {
      await playImpulseHit(state);
    } catch (err) {
      console.warn("[audioImpulse] play failed:", err);
    }

    scheduleNextImpulse(state);

  }, interval * 1000);
}

async function playImpulseHit(state) {
  const { uid, params, pool } = state;

  if (!pool?.files?.length) return;

  // --------------------------------------------
  // Select file (same logic as before)
  // --------------------------------------------
  let file;

  if (pool.mode === "rand") {
    file = pool.files[Math.floor(Math.random() * pool.files.length)];
  } else {
    file = pool.files[pool.cursor % pool.files.length];
    pool.cursor++;

    if (pool.cursor >= pool.files.length) {
      pool.files = [...pool.files].sort(() => Math.random() - 0.5);
      pool.cursor = 0;
    }
  }

  // --------------------------------------------
  // Resolve base values (DSL-aware)
  // --------------------------------------------
  const baseAmp   = evalMaybeRandom(params.amp)   ?? 1;
  const basePan   = evalMaybeRandom(params.pan)   ?? 0;
  const basePitch = evalMaybeRandom(params.pitch) ?? 1;

  const panRandom   = Number(params.panRandom   ?? 0);
  const pitchRandom = Number(params.pitchRandom ?? 0);

  // --------------------------------------------
  // Centered per-hit randomisation
  // --------------------------------------------
  const randAround = (base, range, min = -Infinity, max = Infinity) => {
    if (!range || range <= 0) return base;
    const delta = (Math.random() * 2 - 1) * range;
    const v = base + delta;
    return Math.max(min, Math.min(max, v));
  };

  const amp   = Math.max(0, Math.min(1, baseAmp));
  const pan   = randAround(basePan, panRandom, -1, 1);
  const pitch = Math.max(0.01, randAround(basePitch, pitchRandom));

  // --------------------------------------------
  // Fade handling (unchanged semantics)
  // --------------------------------------------
  let fadeIn, fadeOut;

  if (params.fade !== undefined) {
    fadeIn = params.fade;
    fadeOut = params.fade;
  } else {
    fadeIn = params.fadein ?? 0;
    fadeOut = params.fadeout ?? 0;
  }

  // --------------------------------------------
  // Build cue
  // --------------------------------------------
  const filename = params.path
    ? `${params.path}/${file}`
    : file;

  const poly = Number(params.poly ?? 1);

  let playUid = uid;
  if (poly > 1) {
    playUid = `${uid}__${Date.now()}_${Math.floor(Math.random() * 9999)}`;
  }

  const cue = {
    type: "cueAudio",
    src: filename,
    uid: playUid,
    amp,
    pan,
    pitch,
    fadeIn,
    fadeOut,
    loop: 1,
    toggle: false
  };

  // --------------------------------------------
  // Fire
  // --------------------------------------------
  return handleAudioCue(cue);
}





// =============================================================
//  handleAudioImpulseCue - ensures pan is passed through
// =============================================================

export async function handleAudioImpulseCue(ast, el, opts = {}) {
  try {
    const params = ast.params || ast;

    const {
      path,
      glob,
      format = "wav",
      mode = "shuffle",

      rate = 30,
      jitter = 0,

      poly = 6,

      uid = `impulse-${path || "pool"}`,
      group = null,

      pan  // destructure pan explicitly
    } = params;

    if (!path) {
      console.warn("[audioImpulse] Missing path:", params);
      return;
    }

    // if already running → ignore (for now)
    if (audioImpulses.has(uid)) {
      console.log(`[audioImpulse] Already running: ${uid}`);
      return;
    }

    const pool = await ensureImpulsePool(uid, { path, glob, format, mode });

    if (!pool?.files?.length) {
      console.warn("[audioImpulse] Empty pool:", params);
      return;
    }

    //  Create overlay for audioImpulse (persistent while running)
    let overlay = null;
    if (el) {
      overlay = createAudioOverlay({
        anchorEl: el,
        label: `${path}`,
        mode: "auto"
      });
      overlay.update("starting...");
      overlay.position();
    }

    //  Build the COMPLETE state object - include ALL original params
    const state = {
      uid,
      params: { ...params, poly },  // This preserves pan from original params
      rate: Number(rate),
      jitter: Number(jitter),
      pool,
      stopped: false,
      timer: null,
      group,

      // Region lifetime support
      _regionEl: el || null,
      _skipFirstCheck: true,
      lifetime: params.lifetime || "process",

      //  Store overlay reference for updates
      _overlay: overlay
    };

    console.log("[audioImpulse:init]", {
      uid,
      lifetime: state.lifetime,
      hasElement: !!el,
      pan: state.params.pan,
      playheadX: window.getPlayheadX?.()
    });

    audioImpulses.set(uid, state);

    // wait one interval before first hit
    scheduleNextImpulse(state);

  } catch (err) {
    console.error("[audioImpulse] error:", err);
  }
}



// =============================================================
//  checkImpulseRegions 
// =============================================================

export function checkImpulseRegions() {
  if (!window.audioImpulses) return;

  const playX = window.getPlayheadX?.();
  if (playX == null) return;

  for (const state of window.audioImpulses.values()) {
    if (!state) continue;
    if (state.lifetime !== "region") continue;
    if (!state._regionEl) continue;

    // Get fresh bounds every tick
    const rect = state._regionEl.getBoundingClientRect();
    const containerRect = window.scoreContainer?.getBoundingClientRect();

    // Convert rect to container-relative coords (same space as getPlayheadX)
    const rectLeft = rect.left - (containerRect?.left || 0);
    const rectRight = rect.right - (containerRect?.left || 0);

    const EPS = 1.5;

    // On first few ticks after trigger, be more forgiving on the entry side
    let entryTolerance = EPS;
    if (state._tickCount === undefined) state._tickCount = 0;
    state._tickCount++;

    if (state._tickCount < 10) {
      entryTolerance = 50;
    }

    const inside = !(playX < rectLeft - entryTolerance || playX > rectRight + EPS);

    // Keep overlay positioned
    if (state._overlay) {
      state._overlay.position();
    }

    // Only log on state change
    if (state._lastInside !== inside) {
      state._lastInside = inside;
      console.log("[ImpulseRegion:tick]", {
        uid: state.uid,
        playX,
        rectLeft,
        rectRight,
        inside,
        tickCount: state._tickCount
      });
    }

    // Only exit after we've been "inside" at least once
    if (!inside && !state.stopped && state._wasInsideOnce) {
      console.log("[ImpulseRegion:exit]", {
        uid: state.uid,
        playX,
        rectLeft,
        rectRight
      });

      state.stopped = true;
      stopAudioImpulse(state.uid);
    }

    // Track if we've ever been inside
    if (inside) {
      state._wasInsideOnce = true;
    }
  }
}


export function stopAudioImpulse(uid) {
  const st = audioImpulses.get(uid);
  if (!st) return;

  st.stopped = true;

  if (st.timer) {
    clearTimeout(st.timer);
    st.timer = null;
  }

  // Destroy overlay when impulse stops
  if (st._overlay) {
    st._overlay.destroy();
    st._overlay = null;
  }

  audioImpulses.delete(uid);
}




export function createAudioOverlay({
  anchorEl,
  label = "audio",
  mode = "auto",
  track = true
} = {}) {

  // Use the existing OSC overlay system
  const overlay = createOscOverlay({
    anchorEl,
    label,
    mode,
    track,
    anchorMode: "bbox"
  });

  //  Apply audio-specific styling (slightly different color)
  if (overlay.el) {
    overlay.el.style.background = "rgba(0, 100, 200, 0.1)";
    overlay.el.style.borderLeft = "2px solid rgba(0, 100, 200, 0.5)";
  }

  return overlay;
}