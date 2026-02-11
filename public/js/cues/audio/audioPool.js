// =============================================================
//  audioPool.js -- randomised pool playback
// =============================================================

import { sendOSC } from "../../system/oscillaOSCClient.js";

import {
  evalMaybeRandom,
  createAudioOverlay,
  formatAudioPoolOverlay,
  parseOverlayLevel,
  audioBufferCache,
  sharedAudioCtx,
  selectFromPool
} from "./audioShared.js";

import { handleAudioCue } from "./audioFile.js";
import {
  renderWaveform,
  getWaveform,
  updatePeaks,
  startCursor,
  resetCursor
} from "../../system/waveform.js";


// =============================================================
//  Pool cache
// =============================================================

const audioPools = window.audioPools || (window.audioPools = new Map());


// =============================================================
//  ensureAudioPool -- fetch file list from server, cache it
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
//  handleAudioPoolCue -- single hit from randomised pool
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
      oscaddr,
      waveform  // waveform target: "self" (default), "none", or element id
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

    let file = selectFromPool(pool);

    if (!file) {
      console.warn("[audioPool] Pool selection returned null:", params);
      return;
    }

    // Evaluate randomisable params
    const evaluatedAmp = evalMaybeRandom(amp) ?? 1;
    const panVal = evalMaybeRandom(params.pan) ?? 0;
    const pitchVal = evalMaybeRandom(params.pitch) ?? 1;

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

    // Polyphony control
    const poly = Number(params.poly ?? (params.overlap ? 99 : 1));

    let playUid = uid;
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
    // Suppressed when waveform is active (waveform has its own info label)
    const wfParam = waveform ?? "self";
    const wfActive = wfParam !== "none" && wfParam !== "0" && el;

    if (el && !wfActive) {
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

      setTimeout(() => {
        overlay.destroy();
      }, 1500);
    }

    // Optional OSC announcement
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

    // Fire audio playback
    await handleAudioCue(cue);

    // Waveform: update peaks to selected file, start cursor
    if (wfActive) {
      const wfUid = `wf-pool-${uid}`;
      const wfHandle = getWaveform(wfUid);
      if (wfHandle) {
        const buf = audioBufferCache.get(filename);
        if (buf) {
          updatePeaks(wfHandle, buf, filename);
          resetCursor(wfHandle);
          if (sharedAudioCtx) {
            startCursor(wfHandle, sharedAudioCtx, sharedAudioCtx.currentTime, buf.duration, pitchVal);
          }
        }
      }
    }

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


// =============================================================
//  Prime pool waveform (called during assignCues)
//  Fetches pool, decodes first file's buffer, renders waveform.
// =============================================================

export async function primePoolWaveform(ast, cueElement) {
  if (!ast || !cueElement) return;

  const params = ast.params || ast;
  const waveformParam = params.waveform ?? "self";

  if (waveformParam === "none" || waveformParam === "0") return;
  if (cueElement._poolWaveformPrimed) return;
  cueElement._poolWaveformPrimed = true;

  const svg = cueElement.ownerSVGElement;
  if (!svg) return;

  const {
    path,
    glob,
    format = "wav",
    mode = "shuffle",
    uid = `${path || "pool"}-${glob || "all"}`
  } = params;

  if (!path) return;

  try {
    const pool = await ensureAudioPool(uid, { path, glob, format, mode });
    if (!pool?.files?.length) return;

    const firstFile = pool.files[0];
    let filename = path ? `${path}/${firstFile}` : firstFile;
    if (!filename.endsWith(`.${format}`)) filename = `${filename}.${format}`;

    const ctx = sharedAudioCtx;

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

    renderWaveform(svg, waveformParam, buf, `wf-pool-${uid}`, filename, {
      element: cueElement
    });

    console.log(`[audioPool] Primed waveform for ${uid}`);
  } catch (err) {
    console.warn(`[audioPool] Waveform prime failed:`, err);
  }
}
