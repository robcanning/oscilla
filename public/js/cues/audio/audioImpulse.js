// =============================================================
//  audioImpulse.js -- stochastic repeating process
// =============================================================

import {
  evalMaybeRandom,
  createAudioOverlay,
  formatAudioImpulseOverlay,
  parseOverlayLevel,
  audioBufferCache
} from "./audioShared.js";
import { handleAudioCue } from "./audioFile.js";
import { ensureAudioPool } from "./audioPool.js";
import {
  renderWaveform,
  addCursor,
  startCursor,
  removeCursor,
  removeAllCursors,
  destroyWaveform,
  getWaveform
} from "../../system/waveform.js";


// =============================================================
//  Impulse state
// =============================================================

const audioImpulses = window.audioImpulses || (window.audioImpulses = new Map());
window.audioImpulses = audioImpulses;


// =============================================================
//  Interval computation
// =============================================================

function computeInterval(rate, jitter = 0) {
  if (!rate || rate <= 0) return 2.0;

  const base = 60 / rate; // events per minute -> seconds between hits

  if (!jitter || jitter <= 0) return base;

  // jitter: 0 -> stable, 1 -> fully random (0..2x)
  const min = Math.max(0.01, base * (1 - jitter));
  const max = base * (1 + jitter);

  return min + Math.random() * (max - min);
}


// =============================================================
//  Pool helper (reuses audioPool cache)
// =============================================================

async function ensureImpulsePool(uid, params) {
  return ensureAudioPool(uid, params);
}


// =============================================================
//  Waveform init -- render once using first pool file's buffer
// =============================================================

async function initImpulseWaveform(state, el, pool, params) {
  const waveformParam = params.waveform ?? "self";
  if (waveformParam === "none" || waveformParam === "0") return;
  if (!el) return;

  const svg = el.ownerSVGElement;
  if (!svg) return;

  const format = params.format || "wav";
  const firstFile = pool.files[0];
  let filename = params.path ? `${params.path}/${firstFile}` : firstFile;
  if (!filename.endsWith(`.${format}`)) filename = `${filename}.${format}`;

  try {
    const ctx =
      window.sharedAudioCtx ||
      (window.sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)());

    // Fetch + decode with caching (same pattern as audioFile)
    let buf = audioBufferCache.get(filename);
    if (!buf) {
      const projectPath = resolveProjectPath("audio", filename);
      const sharedPath  = `${window.sharedDir}audio/${filename}`;

      let resp;
      try {
        const head = await fetch(projectPath, { method: "HEAD" });
        resp = await fetch(head.ok ? projectPath : sharedPath);
      } catch {
        resp = await fetch(sharedPath);
      }

      buf = await ctx.decodeAudioData(await resp.arrayBuffer());
      audioBufferCache.set(filename, buf);
    }

    const handle = renderWaveform(svg, waveformParam, buf, `wf-${state.uid}`, filename, {
      element: el
    });

    if (handle) {
      state._waveformHandle = handle;
      console.log(`[audioImpulse] Waveform ready for ${state.uid}`);
    }
  } catch (err) {
    console.warn(`[audioImpulse] Waveform init failed:`, err);
  }
}


// =============================================================
//  Scheduling
// =============================================================

function scheduleNextImpulse(state) {
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


// =============================================================
//  Single hit playback
// =============================================================

async function playImpulseHit(state) {
  const { uid, params, pool } = state;

  if (!pool?.files?.length) return;

  // Select file
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

  // Resolve base values (DSL-aware)
  const baseAmp = evalMaybeRandom(params.amp) ?? 1;
  const basePan = evalMaybeRandom(params.pan) ?? 0;
  const basePitch = evalMaybeRandom(params.pitch) ?? 1;

  const panRandom = Number(params.panRandom ?? 0);
  const pitchRandom = Number(params.pitchRandom ?? 0);

  // Centered per-hit randomisation
  const randAround = (base, range, min = -Infinity, max = Infinity) => {
    if (!range || range <= 0) return base;
    const delta = (Math.random() * 2 - 1) * range;
    const v = base + delta;
    return Math.max(min, Math.min(max, v));
  };

  const amp = Math.max(0, Math.min(1, baseAmp));
  const pan = randAround(basePan, panRandom, -1, 1);
  const pitch = Math.max(0.01, randAround(basePitch, pitchRandom));

  // Fade handling
  let fadeIn, fadeOut;
  if (params.fade !== undefined) {
    fadeIn = params.fade;
    fadeOut = params.fade;
  } else {
    fadeIn = params.fadein ?? 0;
    fadeOut = params.fadeout ?? 0;
  }

  // Build cue
  const filename = params.path
    ? `${params.path}/${file}`
    : file;

  const poly = Number(params.poly ?? 1);

  // Enforce voice cap: count active voices belonging to this impulse
  const reg = window.activeAudioCues;
  if (reg && poly > 0) {
    let activeCount = 0;
    for (const key of reg.keys()) {
      if (key === uid || key.startsWith(`${uid}__`)) activeCount++;
    }
    if (activeCount >= poly) {
      // At limit -- skip this hit entirely
      return;
    }
  }

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

  // Fire the audio hit
  await handleAudioCue(cue);

  // --- Multi-cursor: add a sub-cursor for this hit ---
  const wfHandle = state._waveformHandle;
  if (wfHandle) {
    const cueFilename = filename.endsWith(".wav") ? filename : `${filename}.wav`;
    const buf = audioBufferCache.get(cueFilename);

    if (buf) {
      // Enforce poly cap: evict oldest cursor if at limit
      if (wfHandle._cursors && wfHandle._cursors.size >= poly) {
        const oldest = wfHandle._cursors.keys().next().value;
        removeCursor(wfHandle, oldest);
      }

      const sub = addCursor(wfHandle, playUid, {
        color: "#c00",
        width: "0.8",
        opacity: "0.45"
      });

      if (sub) {
        const ctx = window.sharedAudioCtx;
        startCursor(sub, ctx, ctx.currentTime, buf.duration, pitch);

        // Auto-remove cursor when hit finishes naturally
        const hitMs = (buf.duration / (pitch || 1)) * 1000 + 150;
        setTimeout(() => {
          // Guard: handle may have been destroyed by stopAudioImpulse
          if (wfHandle._cursors?.has(playUid)) {
            removeCursor(wfHandle, playUid);
          }
        }, hitMs);
      }
    }
  }
}


// =============================================================
//  handleAudioImpulseCue
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

      pan,
      waveform  // waveform target: "self" (default), "none", or element id
    } = params;

    if (!path) {
      console.warn("[audioImpulse] Missing path:", params);
      return;
    }

    // If already running, ignore
    if (audioImpulses.has(uid)) {
      console.log(`[audioImpulse] Already running: ${uid}`);
      return;
    }

    const pool = await ensureImpulsePool(uid, { path, glob, format, mode });

    if (!pool?.files?.length) {
      console.warn("[audioImpulse] Empty pool:", params);
      return;
    }

    // Create overlay only when waveform is suppressed (waveform has its own SVG label)
    const waveformTarget = waveform ?? "self";
    const waveformActive = waveformTarget !== "none" && waveformTarget !== "0" && el;

    let overlay = null;
    if (el && !waveformActive) {
      overlay = createAudioOverlay({
        anchorEl: el,
        label: `${path}`,
        mode: "auto"
      });
      overlay.update("starting...");
      overlay.position();
    }

    // Build complete state object
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

    // Init waveform display (renders once, cursors added per hit)
    await initImpulseWaveform(state, el, pool, params);

    // Play first hit immediately
    playImpulseHit(state);

    // Then schedule repeating process
    scheduleNextImpulse(state);

  } catch (err) {
    console.error("[audioImpulse] error:", err);
  }
}


// =============================================================
//  checkImpulseRegions (called from RAF loop)
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

    const rectLeft = rect.left - (containerRect?.left || 0);
    const rectRight = rect.right - (containerRect?.left || 0);

    const EPS = 1.5;
    const GRACE_TICKS = 15;

    if (state._tickCount === undefined) state._tickCount = 0;
    state._tickCount++;

    const inGrace = state._tickCount < GRACE_TICKS;
    const entryTolerance = inGrace ? 50 : EPS;

    const inside = !(playX < rectLeft - entryTolerance || playX > rectRight + EPS);

    // Also check with tight tolerance (used for reliable _wasInsideOnce)
    const insideTight = !(playX < rectLeft - EPS || playX > rectRight + EPS);

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
        insideTight,
        tickCount: state._tickCount
      });

      // Exit: only after grace period AND playhead was genuinely inside
      if (!inside && !inGrace && !state.stopped && state._wasInsideOnce) {
        console.log("[ImpulseRegion:exit]", {
          uid: state.uid,
          playX,
          rectLeft,
          rectRight
        });

        state.stopped = true;
        const relTime = state.params?.release ?? state.params?.rel ?? 0.3;
        stopAudioImpulse(state.uid, relTime);
      }

      // Only mark as genuinely inside when tight tolerance confirms it
      if (insideTight) {
        state._wasInsideOnce = true;
      }
    }
  }
}


// =============================================================
//  stopAudioImpulse with release fadeout support
// =============================================================

export function stopAudioImpulse(uid, releaseSec = 0) {
  const st = audioImpulses.get(uid);
  if (!st) return;

  st.stopped = true;

  // Stop scheduling new hits
  if (st.timer) {
    clearTimeout(st.timer);
    st.timer = null;
  }

  // Get release time from params if not provided
  const fadeTime = releaseSec || st.params?.release || st.params?.rel || 0.3;

  // Fade out any currently playing audio from this impulse
  const reg = window.activeAudioCues;
  if (reg && fadeTime > 0) {
    for (const [key, voice] of reg.entries()) {
      if (key === uid || key.startsWith(`${uid}__`)) {
        try {
          voice.stop?.(fadeTime);
        } catch (e) {
          console.warn(`[audioImpulse] fadeout failed for ${key}:`, e);
        }
      }
    }
  }

  // Destroy overlay after fade completes
  if (st._overlay) {
    setTimeout(() => {
      st._overlay?.destroy();
      st._overlay = null;
    }, fadeTime * 1000 + 50);
  }

  // Clean up waveform cursors immediately, destroy waveform after fade
  if (st._waveformHandle) {
    const wfHandle = st._waveformHandle;
    const wfUid = `wf-${uid}`;
    removeAllCursors(wfHandle);
    st._waveformHandle = null;
    setTimeout(() => {
      // Only destroy if this handle is still the active one for this uid
      // (a retrigger may have created a new waveform with the same uid)
      const current = getWaveform(wfUid);
      if (!current || current === wfHandle) {
        destroyWaveform(wfUid);
      }
    }, fadeTime * 1000 + 50);
  }

  // Remove from map immediately so retrigger can create a fresh entry.
  // The captured `st` object keeps delayed cleanup closures working.
  audioImpulses.delete(uid);

  console.log(`[audioImpulse] Stopping ${uid} with ${fadeTime}s release`);
}


// =============================================================
//  stopAllAudioImpulses
// =============================================================

export function stopAllAudioImpulses() {
  if (!window.audioImpulses) return;

  for (const uid of window.audioImpulses.keys()) {
    stopAudioImpulse(uid);
  }
}

window.stopAllAudioImpulses = stopAllAudioImpulses;


// =============================================================
//  Prime audioImpulse overlay (called during assignCues)
// =============================================================

export function primeAudioImpulseOverlay(ast, cueElement) {
  if (!ast || !cueElement) return;

  const params = ast.params || ast;
  const overlayLevel = parseOverlayLevel(params.overlay ?? ast.overlay);
  if (overlayLevel <= 0) return;

  if (cueElement._audioImpulseOverlayPrimed) return;
  cueElement._audioImpulseOverlayPrimed = true;

  const overlay = createAudioOverlay({
    anchorEl: cueElement,
    label: "audioImpulse",
    mode: "auto",
    track: true
  });

  if (overlay?.el) {
    const text = formatAudioImpulseOverlay(params, overlayLevel);
    overlay.update(text);
    overlay.position();
    cueElement._audioImpulseOverlay = overlay;
    cueElement._audioImpulseOverlayLevel = overlayLevel;
  }

  console.log(`[audioImpulse] Primed overlay for ${params.path || ast.path}`);
}


// =============================================================
//  Prime impulse waveform (called during assignCues)
//  Async -- fetches pool file list, decodes first file's buffer,
//  renders waveform into the score SVG before playback.
// =============================================================

export async function primeImpulseWaveform(ast, cueElement) {
  if (!ast || !cueElement) return;

  const params = ast.params || ast;
  const waveformParam = params.waveform ?? "self";

  if (waveformParam === "none" || waveformParam === "0") return;
  if (cueElement._impulseWaveformPrimed) return;
  cueElement._impulseWaveformPrimed = true;

  const svg = cueElement.ownerSVGElement;
  if (!svg) return;

  const {
    path,
    glob,
    format = "wav",
    mode = "shuffle",
    uid = `impulse-${path || "pool"}`
  } = params;

  if (!path) return;

  try {
    const pool = await ensureAudioPool(uid, { path, glob, format, mode });
    if (!pool?.files?.length) return;

    const firstFile = pool.files[0];
    let filename = path ? `${path}/${firstFile}` : firstFile;
    if (!filename.endsWith(`.${format}`)) filename = `${filename}.${format}`;

    const ctx =
      window.sharedAudioCtx ||
      (window.sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)());

    let buf = audioBufferCache.get(filename);
    if (!buf) {
      const projectPath = resolveProjectPath("audio", filename);
      const sharedPath = `${window.sharedDir}audio/${filename}`;

      let resp;
      try {
        const head = await fetch(projectPath, { method: "HEAD" });
        resp = await fetch(head.ok ? projectPath : sharedPath);
      } catch {
        resp = await fetch(sharedPath);
      }

      buf = await ctx.decodeAudioData(await resp.arrayBuffer());
      audioBufferCache.set(filename, buf);
    }

    renderWaveform(svg, waveformParam, buf, `wf-${uid}`, filename, {
      element: cueElement
    });

    console.log(`[audioImpulse] Primed waveform for ${uid}`);
  } catch (err) {
    console.warn(`[audioImpulse] Waveform prime failed:`, err);
  }
}
