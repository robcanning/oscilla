// =============================================================
//  audioPool.js -- randomised pool playback
//
//  Manages a cached pool of audio files selected by shuffle,
//  random, or sequential modes.  Each trigger picks a file,
//  evaluates randomisable params, and delegates to handleAudioCue.
//
//  Polyphony is unlimited by default -- overlapping voices are
//  allowed and each gets its own waveform peak layer + cursor.
//
//  Waveform lifecycle:
//    prime  -> base contour hidden, preview layers for up to 5 files
//    trigger -> preview cleared, per-voice coloured layer + cursor
//    voice end -> layer + cursor removed automatically
//    last voice end -> info text hidden
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
  startCursor,
  addCursor,
  removeCursor,
  addPeakLayer,
  removePeakLayer,
  removeAllPeakLayers,
  setWaveformDirection
} from "../../system/waveform.js";


// =============================================================
//  Pool cache
// =============================================================

const audioPools = window.audioPools || (window.audioPools = new Map());


// =============================================================
//  ensureAudioPool -- fetch file list from server, cache it
//
//  Returns a pool object { files, mode, cursor } that persists
//  across triggers for the same uid.  The cursor tracks position
//  for sequential and shuffle modes.
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
//
//  Each trigger:
//    1. Selects a file from the cached pool (shuffle/rand/seq)
//    2. Evaluates randomisable params (amp, pan, speed)
//    3. Enforces poly limit (unlimited by default)
//    4. Delegates to handleAudioCue with a unique playUid
//       (always unique so it never hits the live-update path)
//    5. Adds a per-voice peak layer + cursor to the waveform
//       (both auto-removed when the voice ends)
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

    // ---------------------------------------------------------
    //  Pool: fetch file list from server (cached after first call)
    // ---------------------------------------------------------
    const pool = await ensureAudioPool(uid, { path, glob, format, mode });

    if (!pool?.files?.length) {
      console.warn("[audioPool] No matching files:", params);
      return;
    }

    // ---------------------------------------------------------
    //  File selection: advance pool cursor based on mode
    // ---------------------------------------------------------
    let file = selectFromPool(pool);

    if (!file) {
      console.warn("[audioPool] Pool selection returned null:", params);
      return;
    }

    // ---------------------------------------------------------
    //  Evaluate randomisable params (may be rand/irand exprs)
    // ---------------------------------------------------------
    const evaluatedAmp = evalMaybeRandom(amp) ?? 1;
    const panVal = evalMaybeRandom(params.pan) ?? 0;
    const speedVal = evalMaybeRandom(params.speed ?? params.pitch) ?? 1;

    // Resolve fade values -- shorthand `fade` sets both in and out
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

    // ---------------------------------------------------------
    //  Polyphony: unlimited by default, cap only if poly:N set.
    //  When at capacity, oldest voice is stopped (not skipped).
    // ---------------------------------------------------------
    const poly = Number(params.poly ?? (params.overlap ? 99 : 0));
    const polyLimit = poly > 0 ? poly : Infinity;

    // Always unique playUid -- audioPool plays a different file each
    // trigger, so it must never hit handleAudioCue's live-update
    // retrigger path (which is designed for audioFile drones).
    const playUid = `${uid}__${Date.now()}_${Math.floor(Math.random() * 9999)}`;

    // Enforce poly limit: stop oldest voice when at capacity
    const reg = window.activeAudioCues;
    if (reg && polyLimit < Infinity) {
      const activeKeys = [];
      for (const key of reg.keys()) {
        if (key === uid || key.startsWith(`${uid}__`)) {
          activeKeys.push(key);
        }
      }
      while (activeKeys.length >= polyLimit) {
        const oldest = activeKeys.shift();
        const voice = reg.get(oldest);
        try { voice?.stop?.(0.03); } catch {}
        reg.delete(oldest);
      }
    }

    // ---------------------------------------------------------
    //  Build cue object for handleAudioCue
    // ---------------------------------------------------------
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
      speed: speedVal
    };

    // ---------------------------------------------------------
    //  OVERLAY -- show filename + evaluated params
    //  Suppressed when waveform is active (info shown as SVG text)
    // ---------------------------------------------------------
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
        `speed:${speedVal.toFixed(2)}`
      ].join(" ");

      overlay.update(`${file} | ${details}`);
      overlay.position();

      setTimeout(() => {
        overlay.destroy();
      }, 1500);
    }

    // ---------------------------------------------------------
    //  OSC -- optional network announcement
    // ---------------------------------------------------------
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
          speed: cue.speed,
          addr: oscaddr || "/audio/client/pool"
        });
      } catch (err) {
        console.warn("[audioPool OSC] failed:", err);
      }
    }

    // ---------------------------------------------------------
    //  Fire audio playback via the shared audio engine
    // ---------------------------------------------------------
    await handleAudioCue(cue);

    // ---------------------------------------------------------
    //  WAVEFORM -- per-voice peak layer + cursor
    //
    //  On first trigger, preview layers (from prime) are cleared.
    //  Each voice gets a coloured peak layer and cursor, both
    //  auto-removed via oscilla:audio stop listener.
    //  Info text shows the most recently triggered file/params.
    //  When last voice ends, info text hides.
    // ---------------------------------------------------------
    if (wfActive) {
      const wfUid = `wf-pool-${uid}`;
      const wfHandle = getWaveform(wfUid);
      if (wfHandle) {
        // Update info text with resolved per-hit details
        if (wfHandle._infoText) {
          const parts = [`audioPool`, file];
          parts.push(`amp:${evaluatedAmp.toFixed(2)}`);
          parts.push(`speed:${speedVal.toFixed(2)}`);
          parts.push(`pan:${panVal.toFixed(2)}`);
          wfHandle._infoText.textContent = parts.join(" | ");
        }

        const buf = audioBufferCache.get(filename);
        if (buf) {
          setWaveformDirection(wfHandle, speedVal < 0);

          // On first live trigger, clear the primed preview layers
          // so only actual playing voices are shown
          if (!wfHandle._previewCleared) {
            wfHandle._previewCleared = true;
            removeAllPeakLayers(wfHandle);
          }

          // Show info text for active voices
          if (wfHandle._infoText) wfHandle._infoText.setAttribute("opacity", "1");

          // Add coloured peak layer for this voice
          addPeakLayer(wfHandle, buf, filename, { id: playUid });
          const layerColor = wfHandle._peakLayers?.get(playUid)?.color || "#c00";

          if (sharedAudioCtx) {
            const ctx = sharedAudioCtx;

            // Per-voice sub-cursor, colour-matched to its peak layer
            const subCursor = addCursor(wfHandle, playUid, {
              color: layerColor, width: "0.8", opacity: "0.55"
            });

            if (subCursor) {
              startCursor(subCursor, ctx, ctx.currentTime, buf.duration, speedVal);

              // Auto-remove cursor and peak layer when this voice ends
              const onStop = (e) => {
                if (e.detail?.uid === playUid && e.detail?.state === "stop") {
                  removeCursor(wfHandle, playUid);
                  removePeakLayer(wfHandle, playUid);
                  window.removeEventListener("oscilla:audio", onStop);

                  // Hide info text when no voices remain
                  const hasLayers = wfHandle._peakLayers && wfHandle._peakLayers.size > 0;
                  const hasCursors = wfHandle._cursors && wfHandle._cursors.size > 0;
                  if (!hasLayers && !hasCursors) {
                    if (wfHandle._infoText) wfHandle._infoText.setAttribute("opacity", "0");
                  }
                }
              };
              window.addEventListener("oscilla:audio", onStop);
            }
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
//
//  Creates an HTML overlay showing pool params on the score.
//  Skipped when waveform display is active (the waveform's
//  own info text serves the same purpose).
// =============================================================

export function primeAudioPoolOverlay(ast, cueElement) {
  if (!ast || !cueElement) return;

  const params = ast.params || ast;
  const overlayLevel = parseOverlayLevel(params.overlay ?? ast.overlay);
  if (overlayLevel <= 0) return;

  // Skip HTML overlay if waveform display is active (it has its own info text)
  const waveformParam = params.waveform ?? "self";
  if (waveformParam !== "none" && waveformParam !== "0") return;

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
//
//  Creates the waveform handle and renders preview layers showing
//  up to 5 files from the pool at reduced opacity.  This gives
//  a visual preview of the pool's sonic content before any
//  trigger fires.
//
//  The base contour (from renderWaveform) is hidden immediately --
//  all visible contours come from peak layers, either:
//    - preview layers (shown at prime, cleared on first trigger)
//    - per-voice layers (shown during playback, removed on voice end)
// =============================================================

const MAX_PREVIEW_LAYERS = 5;

export async function primePoolWaveform(ast, cueElement) {
  if (!ast || !cueElement) return;

  const params = ast.params || ast;
  const waveformParam = params.waveform ?? "self";

  // Skip if waveform display is disabled
  if (waveformParam === "none" || waveformParam === "0") return;

  // Prevent double-priming on the same element
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

    const ctx = sharedAudioCtx;

    // ---------------------------------------------------------
    //  Helper: fetch, decode, and cache a single pool file
    // ---------------------------------------------------------
    const loadFile = async (file) => {
      let filename = path ? `${path}/${file}` : file;
      if (!filename.endsWith(`.${format}`)) filename = `${filename}.${format}`;

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
      return { filename, buf };
    };

    // ---------------------------------------------------------
    //  Render base waveform group using the first file.
    //  This creates the SVG group, bbox, handle, and info text.
    //  The base contour itself is hidden -- only peak layers
    //  are visible (previews now, per-voice layers at runtime).
    // ---------------------------------------------------------
    const first = await loadFile(pool.files[0]);

    const infoParts = [`audioPool`, `path:${path}`];
    if (params.mode && params.mode !== "shuffle") infoParts.push(`mode:${params.mode}`);
    if (params.poly && params.poly !== 1) infoParts.push(`poly:${params.poly}`);

    const wfHandle = renderWaveform(svg, waveformParam, first.buf, `wf-pool-${uid}`, first.filename, {
      element: cueElement,
      info: infoParts.join(" | ")
    });

    if (!wfHandle) return;

    // Hide base contour -- audioPool uses peak layers exclusively
    if (wfHandle.upperLine) wfHandle.upperLine.setAttribute("opacity", "0");
    if (wfHandle.lowerLine) wfHandle.lowerLine.setAttribute("opacity", "0");

    // ---------------------------------------------------------
    //  Add preview layers for up to MAX_PREVIEW_LAYERS files.
    //  These are rendered at reduced opacity to give a visual
    //  preview of the pool contents.  Cleared on first trigger.
    // ---------------------------------------------------------
    const previewCount = Math.min(MAX_PREVIEW_LAYERS, pool.files.length);
    const previewFiles = pool.files.slice(0, previewCount);

    for (const file of previewFiles) {
      try {
        const { filename, buf } = await loadFile(file);
        addPeakLayer(wfHandle, buf, filename, {
          id: `preview-${filename}`,
          opacity: "0.25"
        });
      } catch (err) {
        console.warn(`[audioPool] Preview layer failed for ${file}:`, err);
      }
    }

    console.log(`[audioPool] Primed waveform for ${uid} with ${previewFiles.length} preview layers`);
  } catch (err) {
    console.warn(`[audioPool] Waveform prime failed:`, err);
  }
}
