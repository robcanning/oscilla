// =============================================================
//  audioImpulse.js -- stochastic repeating process
// =============================================================

import {
  evalMaybeRandom,
  createAudioOverlay,
  formatAudioImpulseOverlay,
  parseOverlayLevel,
  selectFromPool,
  audioBufferCache,
  sharedAudioCtx,
  getReversedBuffer
} from "./audioShared.js";

import { handleAudioCue } from "./audioFile.js";
import { ensureAudioPool } from "./audioPool.js";
import {
  renderWaveform,
  getWaveform,
  addCursor,
  startCursor,
  resetCursor,
  removeCursor,
  removeAllCursors,
  addPeakLayer,
  removePeakLayer,
  removeAllPeakLayers,
  setWaveformDirection
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
//  Scheduling
// =============================================================

function scheduleNextImpulse(state) {
  if (state.stopped) return;

  const interval = computeInterval(state.rate, state.jitter);

  state.timer = setTimeout(async () => {
    if (state.stopped) return;

    // During seeking the RAF loop is paused and checkImpulseRegions
    // cannot police region bounds.  Skip the hit but keep scheduling
    // so the process resumes naturally once seeking ends.
    if (window.isSeeking) {
      scheduleNextImpulse(state);
      return;
    }

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

  // For region-lifetime impulses that have already been confirmed inside,
  // verify playhead is still inside the region. This prevents voice
  // accumulation during seeking/rewind when the timer keeps firing but
  // the playhead has moved outside the bounding box.
  // Skip this check until _wasInsideOnce is set -- before that, the
  // edge-crossing detector in checkCueTriggers is the authority.
  if (state.lifetime === "region" && state._regionEl && state._wasInsideOnce) {
    const playX = window.getPlayheadX?.();
    if (playX != null) {
      const rect = state._regionEl.getBoundingClientRect();
      const containerRect = window.scoreContainer?.getBoundingClientRect();
      const rectLeft = rect.left - (containerRect?.left || 0);
      const rectRight = rect.right - (containerRect?.left || 0);
      if (playX < rectLeft - 5 || playX > rectRight + 5) {
        return;
      }
    }
  }

  // Select file from pool (shared logic with audioPool)
  const file = selectFromPool(pool);
  if (!file) return;

  // Resolve base values (DSL-aware)
  const baseAmp = evalMaybeRandom(params.amp) ?? 1;
  const basePan = evalMaybeRandom(params.pan) ?? 0;
  const baseSpeed = evalMaybeRandom(params.speed ?? params.pitch) ?? 1;

  const panRandom = Number(params.panRandom ?? 0);
  const speedRandom = Number(params.speedRandom ?? params.pitchRandom ?? 0);

  // Centered per-hit randomisation
  const randAround = (base, range, min = -Infinity, max = Infinity) => {
    if (!range || range <= 0) return base;
    const delta = (Math.random() * 2 - 1) * range;
    const v = base + delta;
    return Math.max(min, Math.min(max, v));
  };

  const amp = Math.max(0, Math.min(1, baseAmp));
  const pan = randAround(basePan, panRandom, -1, 1);
  const speed = Math.max(0.01, randAround(baseSpeed, speedRandom));

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

  // Enforce polyphony limit: count active voices for this impulse
  const reg = window.activeAudioCues;
  if (reg && poly > 0) {
    const activeKeys = [];
    for (const key of reg.keys()) {
      if (key === uid || key.startsWith(`${uid}__`)) {
        activeKeys.push(key);
      }
    }
    if (activeKeys.length >= poly) {
      // At capacity -- skip this hit, wait for a voice to free up
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
    speed,
    fadeIn,
    fadeOut,
    loop: 1,
    toggle: false
  };

  await handleAudioCue(cue);

  // --- Per-hit waveform cursor and peak layer ---
  const wfHandle = state._waveformHandle;
  const ctx = window.sharedAudioCtx;
  const audioFilename = cue.src.endsWith(".wav") ? cue.src : `${cue.src}.wav`;
  const buf = audioBufferCache.get(audioFilename);

  console.log("[impulse:cursor]", {
    playUid,
    hasHandle: !!wfHandle,
    hasCtx: !!ctx,
    audioFilename,
    hasBuf: !!buf,
    cacheKeys: [...audioBufferCache.keys()],
    wfUid: `wf-impulse-${uid}`,
  });

  if (wfHandle && ctx && buf) {
    // Update info text with resolved per-hit details
    if (wfHandle._infoText) {
      const parts = [`audioImpulse`, file];
      parts.push(`amp:${amp.toFixed(2)}`);
      parts.push(`speed:${speed.toFixed(2)}`);
      parts.push(`pan:${pan.toFixed(2)}`);
      parts.push(`rate:${state.rate}`);
      if (state.jitter) parts.push(`jitter:${state.jitter}`);
      wfHandle._infoText.textContent = parts.join(" | ");
    }

    // On first live hit, clear the primed preview layers
    if (!state._primedCleared) {
      state._primedCleared = true;
      removeAllPeakLayers(wfHandle);
    }

    // Mirror waveform contours for reverse playback
    setWaveformDirection(wfHandle, speed < 0);

    // Add peak layer for this file (unique per voice)
    addPeakLayer(wfHandle, buf, audioFilename, { id: playUid });

    // Get the layer's color so cursor matches
    const layerColor = wfHandle._peakLayers?.get(playUid)?.color || "#c00";

    // Remove any existing cursor with same id (mono mode: poly=1)
    removeCursor(wfHandle, playUid);

    const subCursor = addCursor(wfHandle, playUid, {
      color: layerColor, width: "0.8", opacity: "0.6"
    });

    console.log("[impulse:cursor] addCursor result:", !!subCursor);

    if (subCursor) {
      startCursor(subCursor, ctx, ctx.currentTime, buf.duration, speed);

      // Auto-remove cursor and peak layer when this voice ends
      const onStop = (e) => {
        if (e.detail?.uid === playUid && e.detail?.state === "stop") {
          removeCursor(wfHandle, playUid);
          removePeakLayer(wfHandle, playUid);
          window.removeEventListener("oscilla:audio", onStop);
        }
      };
      window.addEventListener("oscilla:audio", onStop);
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

      pan
    } = params;

    if (!path) {
      console.warn("[audioImpulse] Missing path:", params);
      return;
    }

    // If already running, hot-update params instead of ignoring
    if (audioImpulses.has(uid)) {
      const existing = audioImpulses.get(uid);
      const oldPath = existing.params.path;
      existing.rate = Number(rate);
      existing.jitter = Number(jitter);
      existing.params = { ...existing.params, ...params, poly };

      // If path changed, invalidate pool cache and rebuild
      if (path !== oldPath) {
        const poolCache = window.audioPools;
        if (poolCache) poolCache.delete(uid);

        // Clear pool to suppress hits while rebuilding
        existing.pool = { files: [], mode: existing.pool?.mode || "shuffle", cursor: 0 };

        ensureImpulsePool(uid, { path, glob, format, mode }).then(pool => {
          if (pool?.files?.length) {
            existing.pool = pool;
            console.log(`[audioImpulse] Pool rebuilt for ${uid}: ${pool.files.length} files`);
          }
        }).catch(err => {
          console.warn(`[audioImpulse] Pool rebuild failed:`, err);
        });
      }

      // Update waveform info text
      if (existing._waveformHandle?._infoText) {
        const parts = [`audioImpulse`];
        if (path) parts.push(`path:${path}`);
        if (rate) parts.push(`rate:${rate}`);
        if (jitter) parts.push(`jitter:${jitter}`);
        if (poly) parts.push(`poly:${poly}`);
        if (pan != null && pan !== 0) parts.push(`pan:${pan}`);
        existing._waveformHandle._infoText.textContent = parts.join(" | ");
        existing._infoBase = parts.join(" | ");
      }

      console.log(`[audioImpulse] Hot-updated: ${uid}`, { rate, jitter, poly });
      return;
    }

    const pool = await ensureImpulsePool(uid, { path, glob, format, mode });

    if (!pool?.files?.length) {
      console.warn("[audioImpulse] Empty pool:", params);
      return;
    }

    // Create overlay (persistent while running) -- skip if waveform provides info
    const wfHandle = getWaveform(`wf-impulse-${uid}`);
    let overlay = null;
    if (el && !wfHandle) {
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

    // Look up primed waveform handle (from primeImpulseWaveform)
    state._waveformHandle = getWaveform(`wf-impulse-${uid}`) || null;

    // Store base info string for dynamic file updates
    const infoParts = [`audioImpulse`];
    if (path) infoParts.push(`path:${path}`);
    if (params.rate) infoParts.push(`rate:${params.rate}`);
    if (params.jitter) infoParts.push(`jitter:${params.jitter}`);
    if (params.poly) infoParts.push(`poly:${params.poly}`);
    if (params.pan != null && params.pan !== 0) infoParts.push(`pan:${params.pan}`);
    state._infoBase = infoParts.join(" | ");

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

      // Track if we've ever been inside (only after tolerance stabilises)
      if (inside && state._tickCount >= 10) {
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

  // Remove all per-hit waveform cursors and peak layers
  if (st._waveformHandle) {
    removeAllCursors(st._waveformHandle);
    removeAllPeakLayers(st._waveformHandle);
  }

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

  // Remove from map immediately so retrigger can create a fresh entry.
  // The captured `st` object keeps delayed cleanup closures working.
  audioImpulses.delete(uid);

  // Destroy overlay after fade completes
  if (st._overlay) {
    const overlay = st._overlay;
    setTimeout(() => {
      overlay?.destroy();
    }, fadeTime * 1000 + 50);
  }

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

  // Skip HTML overlay if waveform display is active (it has its own info text)
  const waveformParam = params.waveform ?? "self";
  if (waveformParam !== "none" && waveformParam !== "0") return;

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
//  Fetches pool, decodes first file's buffer, renders waveform.
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
    const pool = await ensureImpulsePool(uid, { path, glob, format, mode });
    if (!pool?.files?.length) return;

    const ctx = sharedAudioCtx;

    // Helper to fetch + decode + cache a pool file
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

    // Render base waveform group with first file (black contours)
    const first = await loadFile(pool.files[0]);
    // Build info label
    const infoParts = [`audioImpulse`];
    if (path) infoParts.push(`path:${path}`);
    if (params.rate) infoParts.push(`rate:${params.rate}`);
    if (params.jitter) infoParts.push(`jitter:${params.jitter}`);
    if (params.poly) infoParts.push(`poly:${params.poly}`);
    if (params.pan != null && params.pan !== 0) infoParts.push(`pan:${params.pan}`);

    const handle = renderWaveform(svg, waveformParam, first.buf, `wf-impulse-${uid}`, first.filename, {
      element: cueElement,
      info: infoParts.join(" | ")
    });

    if (!handle) return;

    // Pick up to 3 random files as preview layers
    const shuffled = [...pool.files].sort(() => Math.random() - 0.5);
    const previewFiles = shuffled.slice(0, Math.min(3, shuffled.length));

    for (const file of previewFiles) {
      try {
        const { filename, buf } = await loadFile(file);
        addPeakLayer(handle, buf, filename, { opacity: "0.3" });
      } catch (err) {
        console.warn(`[audioImpulse] Preview layer failed for ${file}:`, err);
      }
    }

    console.log(`[audioImpulse] Primed waveform for ${uid} with ${previewFiles.length} preview layers`);
  } catch (err) {
    console.warn(`[audioImpulse] Waveform prime failed:`, err);
  }
}
