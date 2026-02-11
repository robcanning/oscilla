// =============================================================
//  audioPool.js -- randomized audio pool engine
//
//  ensureAudioPool, handleAudioPoolCue, primeAudioPoolOverlay
// =============================================================

import { sendOSC } from "../../system/oscillaOSCClient.js";
import {
  evalMaybeRandom,
  createAudioOverlay,
  formatAudioPoolOverlay,
  parseOverlayLevel
} from "./audioShared.js";
import { handleAudioCue } from "./audioFile.js";


// =============================================================
//  Pool cache
// =============================================================
const audioPools = window.audioPools || (window.audioPools = new Map());


// =============================================================
//  ensureAudioPool -- fetch and cache file list for a pool
// =============================================================
export async function ensureAudioPool(uid, params) {
  if (audioPools.has(uid)) return audioPools.get(uid);

  const { path, project } = params;

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
//  handleAudioPoolCue -- single hit from randomized pool
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

    // Evaluate randomizable params
    const evaluatedAmp = evalMaybeRandom(amp) ?? 1;
    const panVal       = evalMaybeRandom(params.pan) ?? 0;
    const pitchVal     = evalMaybeRandom(params.pitch) ?? 1;

    // Handle fade values - pass through raw for resolveFade in handleAudioCue
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
      fadeIn: fadeInVal,
      fadeOut: fadeOutVal,
      loop: Number(loop) || 1,
      toggle: false,
      pan: panVal,
      pitch: pitchVal
    };

    // OVERLAY - show filename AND evaluated params
    if (el) {
      const overlay = createAudioOverlay({
        anchorEl: el,
        label: `${path}`,
        mode: "auto"
      });

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
        sendOSC({
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
//  Prime audioPool overlay (called during assignCues)
// =============================================================
export function primeAudioPoolOverlay(ast, cueElement) {
  if (!ast || !cueElement) return;

  const params = ast.params || ast;
  const overlayLevel = parseOverlayLevel(params.overlay ?? ast.overlay);
  if (overlayLevel <= 0) return;

  if (cueElement._audioPoolOverlayPrimed) return;
  cueElement._audioPoolOverlayPrimed = true;

  const overlay = createAudioOverlay({
    anchorEl: cueElement,
    label: "audioPool",
    mode: "auto",
    track: true
  });

  if (overlay?.el) {
    const text = formatAudioPoolOverlay(params, overlayLevel);
    overlay.update(text);
    overlay.position();
    cueElement._audioPoolOverlay = overlay;
    cueElement._audioPoolOverlayLevel = overlayLevel;
  }

  console.log(`[audioPool] Primed overlay for ${params.path || ast.path}`);
}
