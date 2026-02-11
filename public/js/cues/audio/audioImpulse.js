// =============================================================
//  audioImpulse.js -- stochastic repeating process
// =============================================================

import {
  evalMaybeRandom,
  createAudioOverlay,
  formatAudioImpulseOverlay,
  parseOverlayLevel,
  selectFromPool
} from "./audioShared.js";

import { handleAudioCue } from "./audioFile.js";
import { ensureAudioPool } from "./audioPool.js";


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

  // Select file from pool (shared logic with audioPool)
  const file = selectFromPool(pool);
  if (!file) return;

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

  return handleAudioCue(cue);
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

      pan
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

    // Create overlay (persistent while running)
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

      // Only exit after we've been "inside" at least once
      if (!inside && !state.stopped && state._wasInsideOnce) {
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

      // Track if we've ever been inside
      if (inside) {
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

  // Clean up after fade
  setTimeout(() => {
    audioImpulses.delete(uid);
  }, fadeTime * 1000 + 100);

  console.log(`[audioImpulse] Stopping ${uid} with ${fadeTime}s release`);
}


// =============================================================
//  stopAllAudioImpulses
// =============================================================

function stopAllAudioImpulses() {
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
