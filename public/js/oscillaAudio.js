

// ===================
// 🎧 Audio Cue Support
// ===================

/**
 * Stops audio cues (specific file or all)
 * Supports optional fadeOut and always clears triggeredCues + _cueInsideState.
 * @param {string} cueId - e.g. "cueAudioStop(noise.wav)" or "cueAudioStop()"
 * @param {object} cueParams - e.g. { choice: "noise.wav", fadeOut: 200 }
 */


import { createOscOverlay } from "./oscillaOSC.js";


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
      console.log(`[AUDIO] 🛑 cueAudioStop → all`);
    }

    // Optional OSC broadcast
    sendOSC('/cueAudio/stop', { filename: choice || 'all', fadeOutMs });
  } catch (err) {
    console.warn(`[AUDIO] ❌ Error in handleAudioStopCue:`, err);
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
      fadeOut = 0
    } = ast || {};

    const key = uid && uid.trim();
    if (!key) { console.warn("[cueAudio] Missing uid:", ast); return; }
    if (!src) { console.warn("[cueAudio] Missing src:", ast); return; }

    const filename = src.endsWith(".wav") ? src : `${src}.wav`;

    // normalize fades
    if (fade !== undefined) fadeIn = fadeOut = Number(fade);
    fadeIn = Number(fadeIn ?? 0);
    fadeOut = Number(fadeOut ?? 0);

    const reg = (window.activeAudioCues ||= new Map());

    // --- TOGGLE: if playing (or pending), stop and exit
    if (toggle && reg.has(key)) {
      const v = reg.get(key);
      try { v?.stop?.(fadeOut); } catch { }
      reg.delete(key);
      window.dispatchEvent(new CustomEvent("oscilla:audio", {
        detail: { uid: key, file: filename, state: "stop" }
      }));
      return;
    }

    // --- MOMENTARY RETRIGGER: if already active, cut and restart
    if (!toggle && reg.has(key)) {
      const v = reg.get(key);
      try { v?.stop?.(Math.min(fadeOut, 0.03)); } catch { }
      reg.delete(key);
      // we will immediately start again below
    }

    // --- Reserve a pending entry immediately (handles rapid second click)
    let replaceStop = () => { };
    reg.set(key, { uid: key, filename, stop: (sec) => replaceStop(sec), _pending: true });

    // Notify UI immediately so toggle buttons light up without waiting for decode
    window.dispatchEvent(new CustomEvent("oscilla:audio", {
      detail: { uid: key, file: filename, state: "play" }
    }));

    // --- Load buffer with project→shared fallback
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

    // --- Build voice
    const gainNode = ctx.createGain();
    gainNode.connect(ctx.destination);

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

    // Replace pending entry with real voice (and real stop)
    replaceStop = stop;
    reg.set(key, { uid: key, filename, stop });

    const cleanup = () => {
      // remove from registry & notify UI
      if (reg.get(key)?.stop === stop) reg.delete(key);
      try { gainNode.disconnect(); } catch { }
      srcNode = null;
      window.dispatchEvent(new CustomEvent("oscilla:audio", {
        detail: { uid: key, file: filename, state: "stop" }
      }));
    };

    const playOne = (first) => {
      srcNode = ctx.createBufferSource();
      srcNode.buffer = buf;
      srcNode.connect(gainNode);

      const now = ctx.currentTime;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(first && fadeIn > 0 ? 0 : Number(amp), now);
      if (first && fadeIn > 0) {
        gainNode.gain.linearRampToValueAtTime(Number(amp), now + fadeIn);
      }

      srcNode.onended = () => {
        if (stopped) return cleanup();         // toggled/forced stop
        remaining--;
        if (remaining > 0) return playOne(false); // loop
        // natural end → fade then cleanup
        const t = ctx.currentTime;
        try { gainNode.gain.linearRampToValueAtTime(0, t + fadeOut); } catch { }
        setTimeout(cleanup, fadeOut * 1000 + 10);
      };

      srcNode.start();
    };

    playOne(true);

  } catch (err) {
    console.error("[AUDIO] ❌ handleAudioCue error:", err);
    // Safety: ensure UI turns off + registry cleared if we had announced play
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
// 🛑 stopAllAudio — Global fade-out stop (filename scoped)
// ============================================================
export function stopAllAudio(filename, fadeOutSec = 1.0) {
  const ctx = window.sharedAudioCtx;
  const reg = window.activeAudioCues;
  if (!ctx || !reg) return;

  for (const [key, voice] of reg) {
    if (filename && voice.filename !== filename) continue; // ✅ allow filename OR all

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
    console.warn("[AUDIO] ⚠️ No active voices.");
    return;
  }

  const GLOBAL_FADE = 0.15;

  for (const [key, voice] of active.entries()) {
    try {
      voice.stop?.(GLOBAL_FADE);
      active.delete(key);

      window.dispatchEvent(new CustomEvent("oscilla:audio", {
        detail: { uid: key, state: "stop" }
      }));

      console.log(`[AUDIO] 🔻 Force-stopped ${voice.filename}`);
    } catch (err) {
      console.warn(`[AUDIO] ❌ Stop failed on ${voice.filename}:`, err);
    }
  }

  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    window.socket.send(JSON.stringify({
      type: "osc_audio_stopAll",
      timestamp: Date.now()
    }));
  }

  console.log("[AUDIO] ✅ All audio voices cleared.");
});


// stubs to develop
// =============================================================
// 🎲 audioPool(...) — single hit from randomized pool
// =============================================================

// cache pool lists per uid
const audioPools = window.audioPools || (window.audioPools = new Map());

function evalMaybeRandom(v) {
  if (!v) return v;

  // function-call AST: { type:'funcCall', name:'rand', args:[a,b] }
  if (typeof v === "object" && v.type === "funcCall") {
    if (v.name === "rand" && v.args?.length === 2) {
      const a = Number(v.args[0]);
      const b = Number(v.args[1]);
      if (!isNaN(a) && !isNaN(b)) {
        return a + Math.random() * (b - a);
      }
    }

    // fallback — unexpected func
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

    const evaluatedAmp = evalMaybeRandom(amp) ?? 1;
    const evaluatedFadeIn = evalMaybeRandom(fadein) ?? 0;
    const evaluatedFadeOut = evalMaybeRandom(fadeout) ?? 0;

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
      fadeIn: Number(evaluatedFadeIn),
      fadeOut: Number(evaluatedFadeOut),
      loop: Number(loop) || 1,
      toggle: false
    };

    // ⭐ AUDIO OVERLAY - show path and filename
    if (el) {
      // Create a temporary overlay that shows the played file
      const overlay = createAudioOverlay({
        anchorEl: el,
        label: `🔊 ${path}`,
        mode: "auto"
      });
      
      // Update with filename
      overlay.update(file);
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
// 🌧 audioImpulse(...) — stochastic repeating process
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

  const amp = evalMaybeRandom(params.amp) ?? 1;
  const fadeIn = evalMaybeRandom(params.fadein) ?? 0;
  const fadeOut = evalMaybeRandom(params.fadeout) ?? 0;

  // PATH + EXTENSION
  const path = params.path || "";
  const format = params.format || "wav";

  let name = file.endsWith(`.${format}`) ? file : `${file}.${format}`;
  const filename = path ? `${path}/${name}` : name;

  // ⭐ Update overlay with current filename
  if (state._overlay) {
    state._overlay.update(file);
    state._overlay.position();
  }

  // POLYPHONY
  const basePoly = params.poly === 0 ? 0 : (params.poly ?? 6);

  const playUid =
    basePoly === 1
      ? uid
      : `${uid}__${Date.now()}_${Math.floor(Math.random() * 9999)}`;

  const cue = {
    type: "cueAudio",
    src: filename,
    uid: playUid,
    amp: Math.max(0, Math.min(1, Number(amp))),
    fadeIn: Number(fadeIn),
    fadeOut: Number(fadeOut),
    loop: 1,
    toggle: false
  };

  // optional OSC mirror
  if (params.osc || params.oscaddr) {
    try {
      sendOSCMessage({
        type: "osc_audio_impulse",
        uid: playUid,
        filename,
        amp: cue.amp,
        fadeIn: cue.fadeIn,
        fadeOut: cue.fadeOut,
        addr: params.oscaddr || "/audio/client/impulse"
      });
    } catch (err) {
      console.warn("[audioImpulse OSC] failed:", err);
    }
  }

  return handleAudioCue(cue);
}



// =============================================================
// ⭐ CORRECTED handleAudioImpulseCue function
// =============================================================

export async function handleAudioImpulseCue(ast, el, opts = {}) {
  try {
    const params = ast.params || ast;

    const {
      path,
      glob,
      format = "wav",
      mode = "shuffle",

      rate = 30,       // events per minute
      jitter = 0,

      poly = 6,

      uid = `impulse-${path || "pool"}`,
      group = null
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

    // ⭐ Create overlay for audioImpulse (persistent while running)
    let overlay = null;
    if (el) {
      overlay = createAudioOverlay({
        anchorEl: el,
        label: `🌧 ${path}`,
        mode: "auto"
      });
      overlay.update("starting...");
      overlay.position();
    }

    // Build the COMPLETE state object
    const state = {
      uid,
      params: { ...params, poly },
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
      
      // ⭐ Store overlay reference for updates
      _overlay: overlay
    };

    console.log("[audioImpulse:init]", {
      uid,
      lifetime: state.lifetime,
      hasElement: !!el,
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
// ⭐ FIXED checkImpulseRegions - with proper entry tolerance
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

    // ⭐ Keep overlay positioned
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

  // ⭐ Destroy overlay when impulse stops
  if (st._overlay) {
    st._overlay.destroy();
    st._overlay = null;
  }

  audioImpulses.delete(uid);
}




export function createAudioOverlay({
  anchorEl,
  label = "🔊 audio",
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




