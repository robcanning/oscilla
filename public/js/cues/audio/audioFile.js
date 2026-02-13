// =============================================================
//  audioFile.js -- single-file audio playback engine
//
//  handleAudioCue, handleAudioStopCue, stopAllAudio
//  primeAudioOverlay, primeWaveform
//  Global stop button handler
//
//  Polyphony:
//    Default (no poly or poly:1) -> mono, retrigger = live-update
//    poly:0  -> unlimited overlapping voices
//    poly:N  -> up to N voices (oldest stopped when at limit)
//
//    Poly voices get unique registry keys, independent audio
//    graphs, and per-voice waveform peak layers + cursors.
// =============================================================

import { sendOSC } from "../../system/oscillaOSCClient.js";
import {
  renderWaveform,
  getWaveform,
  startCursor,
  resetCursor,
  addCursor,
  removeCursor,
  addPeakLayer,
  removePeakLayer
} from "../../system/waveform.js";
import {
  sharedAudioCtx,
  audioBufferCache,
  evalMaybeRandom,
  createAudioOverlay,
  formatAudioFileOverlay,
  parseOverlayLevel,
  getReversedBuffer
} from "./audioShared.js";


// =============================================================
//  handleAudioStopCue
// =============================================================

/**
 * Stops audio cues (specific file or all)
 * Supports optional fadeOut and always clears triggeredCues + _cueInsideState.
 */
export async function handleAudioStopCue(cueId, cueParams = {}) {
  const fadeOutMs = cueParams.fadeOut ?? 120;
  const choice = cueParams.choice || cueId.match(/\(([^)]+)\)/)?.[1];

  try {
    if (choice) {
      stopAllAudio(choice, fadeOutMs);
      console.log(`[AUDIO] cueAudioStop -> ${choice}`);
    } else {
      stopAllAudio(fadeOutMs);
      console.log(`[AUDIO] cueAudioStop -> all`);
    }

    sendOSC('/cueAudio/stop', { filename: choice || 'all', fadeOutMs });
  } catch (err) {
    console.warn(`[AUDIO] Error in handleAudioStopCue:`, err);
  }
}


// =============================================================
//  handleAudioCue -- single file playback with Web Audio API
// =============================================================

export async function handleAudioCue(ast, cueElement = null) {
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
      pan,
      params = {}
    } = ast || {};

    // OVERLAY -- check for overlay flag
    const overlayFlag = Number(ast.overlay ?? params.overlay ?? 0);

    // SPEED (playback rate) -- prefer "speed", fall back to legacy "pitch"
    const speed =
      ast.speed !== undefined
        ? evalMaybeRandom(ast.speed)
        : ast.pitch !== undefined
          ? evalMaybeRandom(ast.pitch)
          : evalMaybeRandom(params.speed ?? params.pitch) ?? 1;

    // PAN -- prefer direct, fallback to params
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

    // ---------------------------------------------------------
    // POLYPHONY
    //
    // Default (no poly or poly:1): mono -- retrigger updates the
    // existing voice in place (live-update path).
    //
    // poly:0  -> unlimited overlapping voices
    // poly:N  -> up to N overlapping voices (oldest stopped)
    //
    // When poly is active, each trigger gets a unique registry
    // key so it never hits the toggle/live-update paths.
    // ---------------------------------------------------------
    const polyRaw = ast.poly ?? params.poly;
    const polyNum = polyRaw != null ? Number(polyRaw) : 1;
    const polyActive = polyNum !== 1;     // 0 = unlimited, >1 = capped
    const polyLimit = polyNum === 0 ? Infinity : polyNum;
    const baseUid = key;                  // original uid for voice counting

    // In poly mode: unique key per trigger, skip toggle/retrigger
    let voiceKey = key;
    if (polyActive) {
      voiceKey = `${key}__${Date.now()}_${Math.floor(Math.random() * 9999)}`;

      // Enforce poly limit: stop oldest voice when at capacity
      const reg = (window.activeAudioCues ||= new Map());
      if (polyLimit < Infinity) {
        const activeKeys = [];
        for (const k of reg.keys()) {
          if (k === baseUid || k.startsWith(`${baseUid}__`)) {
            activeKeys.push(k);
          }
        }
        while (activeKeys.length >= polyLimit) {
          const oldest = activeKeys.shift();
          const voice = reg.get(oldest);
          try { voice?.stop?.(0.03); } catch {}
          reg.delete(oldest);
        }
      }
    }

    const filename = src.endsWith(".wav") ? src : `${src}.wav`;

    // DON'T convert to Number yet - let resolveFade handle percentage strings
    if (fade !== undefined) {
      fadeIn = fade;
      fadeOut = fade;
    }
    fadeIn = fadeIn ?? 0;
    fadeOut = fadeOut ?? 0;

    const reg = (window.activeAudioCues ||= new Map());

    // ---------------------------------------------------------
    // MONO MODE: toggle and live-update paths
    // Skipped entirely in poly mode (voiceKey is always unique)
    // ---------------------------------------------------------
    if (!polyActive) {
      // toggle handling
      if (toggle && reg.has(voiceKey)) {
        const v = reg.get(voiceKey);
        try { v?.stop?.(fadeOut); } catch { }
        reg.delete(voiceKey);
        window.dispatchEvent(new CustomEvent("oscilla:audio", {
          detail: { uid: voiceKey, file: filename, state: "stop" }
        }));
        return;
      }

      // retrigger -- live-update if voice supports it
      if (!toggle && reg.has(voiceKey)) {
        const v = reg.get(voiceKey);
        if (v?.update) {
          v.update({ amp, speed, pan: panVal, fadeIn, fadeOut, loop, src, in: ast.in ?? params.in, out: ast.out ?? params.out });
          console.log(`[audio] Hot-updated: ${voiceKey}`);
          return;
        }
        try { v?.stop?.(Math.min(fadeOut, 0.03)); } catch { }
        reg.delete(voiceKey);
      }
    }

    let replaceStop = () => { };
    reg.set(voiceKey, { uid: voiceKey, filename, stop: (sec) => replaceStop(sec), _pending: true });

    window.dispatchEvent(new CustomEvent("oscilla:audio", {
      detail: { uid: voiceKey, file: filename, state: "play" }
    }));

    // fetch -- with buffer caching
    const projectPath = resolveProjectPath("audio", filename);
    const sharedPath = `${window.sharedDir}audio/${filename}`;

    let buf = audioBufferCache.get(filename);
    if (!buf) {
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

    const effectiveDuration = buf.duration / (Math.abs(Number(speed)) || 1);

    // Use enhanced resolveFade with effectiveDuration
    fadeIn = resolveFade(fadeIn, effectiveDuration, 0);
    fadeOut = resolveFade(fadeOut, effectiveDuration, 0);

    // Clamp to never exceed duration
    fadeIn = Math.min(fadeIn, effectiveDuration);
    fadeOut = Math.min(fadeOut, effectiveDuration);



    function resolveFade(v, effectiveDuration, fallback = 0) {
      if (v == null) return fallback;

      // CASE 1: funcCall with percentage or numeric args
      if (typeof v === "object" && v.type === "funcCall" && (v.name === "rand" || v.name === "irand")) {
        const [argA, argB] = v.args || [];

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

        console.log(`[resolveFade] ${v.name}(${argA}, ${argB}) -> ${result.toFixed(3)}s (duration: ${effectiveDuration.toFixed(2)}s)`);
        return result;
      }

      // CASE 2: Percentage string (e.g. "50%")
      if (typeof v === "string" && v.trim().endsWith("%")) {
        const pct = Number(v.replace("%", "").trim()) / 100;
        return isNaN(pct) ? fallback : effectiveDuration * pct;
      }

      // CASE 3: Object with .value (e.g. from parser)
      if (typeof v === "object" && v.value !== undefined) {
        return resolveFade(v.value, effectiveDuration, fallback);
      }

      // CASE 4: Plain number (seconds)
      const num = Number(v);
      return isNaN(num) ? fallback : num;
    }


    console.log("[cueAudio] resolved fades", {
      fadeIn,
      fadeOut,
      effectiveDuration,
      speed
    });

    // -------------------------------------------------------
    // WAVEFORM DISPLAY
    // Default: "self" (render into the cue element itself).
    // Use waveform:none to suppress.
    //
    // Mono mode: single cursor on the waveform handle.
    // Poly mode: per-voice coloured peak layer + sub-cursor,
    //   auto-removed when the voice ends.
    // -------------------------------------------------------
    const waveformParam = ast.waveform ?? params.waveform ?? "self";
    let waveformHandle = null;

    if (waveformParam !== "none" && waveformParam !== "0" && cueElement) {
      const svg = cueElement.ownerSVGElement;
      if (svg) {
        // Build info label from cue params
        const infoParts = [filename];
        if (Number(amp) !== 1) infoParts.push(`amp:${amp}`);
        if (Number(loop) !== 1) infoParts.push(`loop:${loop === 0 ? "inf" : loop}`);
        if (Number(speed) !== 1) infoParts.push(`speed:${speed}`);
        if (panVal !== null && panVal !== 0) infoParts.push(`pan:${panVal}`);
        if (fadeIn > 0) infoParts.push(`in:${fadeIn.toFixed(1)}s`);
        if (fadeOut > 0) infoParts.push(`out:${fadeOut.toFixed(1)}s`);
        if (polyActive) infoParts.push(`poly:${polyNum === 0 ? "inf" : polyNum}`);

        // Always use baseUid (key) for waveform handle — shared across voices
        waveformHandle = renderWaveform(svg, waveformParam, buf, key, filename, {
          element: cueElement,
          info: infoParts.join(" | ")
        });
      }
    }

    // If no cueElement (e.g. live console), reuse existing waveform by uid
    if (!waveformHandle && waveformParam !== "none" && waveformParam !== "0") {
      waveformHandle = getWaveform(key) || null;
    }

    // ---------------------------------------------------------
    // POLY WAVEFORM: per-voice peak layer + sub-cursor
    // ---------------------------------------------------------
    let polyVoiceCursor = null;

    if (polyActive && waveformHandle && buf) {
      // Add coloured peak layer for this voice
      addPeakLayer(waveformHandle, buf, filename, { id: voiceKey });
      const layerColor = waveformHandle._peakLayers?.get(voiceKey)?.color || "#c00";

      if (ctx) {
        polyVoiceCursor = addCursor(waveformHandle, voiceKey, {
          color: layerColor, width: "0.8", opacity: "0.55"
        });
      }
    }
    // -------------------------------------------------------

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

    // Mutable params -- playOne reads these, update() writes them
    const live = {
      amp: Number(amp) || 1,
      speed: Number(speed) || 1,
      pan: panVal,
      fadeIn,
      fadeOut,
      buf,              // swappable on file change
      filename,         // current filename for display
      in: Number(ast.in ?? params.in ?? 0),    // start offset in seconds
      out: 0            // end point in seconds (0 = full file)
    };
    // Resolve 'out' -- 0 means full buffer
    if (ast.out !== undefined || params.out !== undefined) {
      live.out = Number(ast.out ?? params.out);
    }

    const stop = (dur = live.fadeOut) => {
      stopped = true;
      const now = ctx.currentTime;

      try {
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0, now + dur);
      } catch { }

      try { srcNode?.stop(now + dur + 0.01); } catch { }
    };

    const update = (p) => {
      const now = ctx.currentTime;
      const ramp = 0.05; // 50ms smooth ramp

      // Immediate: amp
      if (p.amp !== undefined) {
        live.amp = Math.max(0, Math.min(1, Number(p.amp) || 0));
        try {
          gainNode.gain.cancelScheduledValues(now);
          gainNode.gain.setValueAtTime(gainNode.gain.value, now);
          gainNode.gain.linearRampToValueAtTime(live.amp, now + ramp);
        } catch { }
      }

      // Immediate: pan
      if (p.pan !== undefined && p.pan !== null) {
        live.pan = Math.max(-1, Math.min(1, Number(p.pan) || 0));
        if (panNode) {
          try {
            panNode.pan.cancelScheduledValues(now);
            panNode.pan.setValueAtTime(panNode.pan.value, now);
            panNode.pan.linearRampToValueAtTime(live.pan, now + ramp);
          } catch { }
        } else {
          // Create pan node if one didn't exist
          panNode = new StereoPannerNode(ctx, { pan: live.pan });
          gainNode.disconnect();
          gainNode.connect(panNode).connect(ctx.destination);
        }
      }

      // Speed: immediate ramp if direction unchanged, deferred on direction flip
      // Accept both "speed" and legacy "pitch"
      const newSpeed = p.speed ?? p.pitch;
      if (newSpeed !== undefined) {
        const oldSpeed = live.speed;
        live.speed = Number(newSpeed) || 1;
        const absSpeed = Math.abs(live.speed);
        const sameDirection = (oldSpeed > 0 && live.speed > 0) || (oldSpeed < 0 && live.speed < 0);

        if (sameDirection && srcNode) {
          // Same direction -- ramp abs rate immediately
          try {
            srcNode.playbackRate.cancelScheduledValues(now);
            srcNode.playbackRate.setValueAtTime(srcNode.playbackRate.value, now);
            srcNode.playbackRate.linearRampToValueAtTime(absSpeed, now + ramp);
          } catch { }
        }
        // Direction change: takes effect on next loop (needs buffer swap)
      }

      // Deferred: fades (applied on next loop iteration)
      // Compute current effective duration for fade resolution
      const curSegment = ((live.out > 0 && live.out <= live.buf.duration) ? live.out : live.buf.duration) - (live.in || 0);
      const curEffDur = curSegment / (Math.abs(live.speed) || 1);

      if (p.fadeIn !== undefined) live.fadeIn = resolveFade(p.fadeIn, curEffDur, 0);
      if (p.fadeOut !== undefined) live.fadeOut = resolveFade(p.fadeOut, curEffDur, 0);

      // Loop control: set remaining iterations
      // loop:0 = infinite, loop:1 = finish after current, loop:N = N more
      if (p.loop !== undefined) {
        const newLoop = Number(p.loop);
        if (newLoop === 0) {
          remaining = Infinity;
        } else {
          remaining = Math.max(1, newLoop);
        }
      }

      // Deferred: in/out points (applied on next loop iteration)
      if (p.in !== undefined) live.in = Math.max(0, Number(p.in) || 0);
      if (p.out !== undefined) live.out = Math.max(0, Number(p.out) || 0);

      // Deferred: file change (fetch+decode, swap on next loop)
      if (p.src !== undefined) {
        const newSrc = String(p.src);
        const newFilename = newSrc.endsWith(".wav") ? newSrc : `${newSrc}.wav`;
        if (newFilename !== live.filename) {
          // Async fetch -- don't block
          (async () => {
            try {
              let newBuf = audioBufferCache.get(newFilename);
              if (!newBuf) {
                const projectPath = resolveProjectPath("audio", newFilename);
                const sharedPath = `${window.sharedDir}audio/${newFilename}`;
                let resp;
                try {
                  const head = await fetch(projectPath, { method: "HEAD" });
                  resp = await fetch(head.ok ? projectPath : sharedPath);
                } catch {
                  resp = await fetch(sharedPath);
                }
                newBuf = await ctx.decodeAudioData(await resp.arrayBuffer());
                audioBufferCache.set(newFilename, newBuf);
              }
              live.buf = newBuf;
              live.filename = newFilename;
              console.log(`[audio] File queued for next loop: ${newFilename}`);
            } catch (err) {
              console.warn(`[audio] File change failed:`, err);
            }
          })();
        }
      }

      // Update waveform info text
      if (waveformHandle?._infoText) {
        const parts = [live.filename];
        if (live.amp !== 1) parts.push(`amp:${live.amp.toFixed(2)}`);
        if (remaining !== 1) parts.push(`loop:${remaining === Infinity ? "inf" : remaining}`);
        if (live.speed !== 1) parts.push(`speed:${live.speed.toFixed(2)}`);
        if (live.pan !== null && live.pan !== 0) parts.push(`pan:${live.pan.toFixed(2)}`);
        if (live.in > 0) parts.push(`in:${live.in.toFixed(2)}s`);
        if (live.out > 0) parts.push(`out:${live.out.toFixed(2)}s`);
        if (live.fadeIn > 0) parts.push(`fade-in:${live.fadeIn.toFixed(1)}s`);
        if (live.fadeOut > 0) parts.push(`fade-out:${live.fadeOut.toFixed(1)}s`);
        waveformHandle._infoText.textContent = parts.join(" | ");
      }

      console.log(`[audio] Live update ${key}:`, live);
    };

    replaceStop = stop;
    reg.set(voiceKey, { uid: voiceKey, filename, stop, update: polyActive ? null : update, gainNode, panNode, srcNode, _live: live });

    const cleanup = () => {
      // Deactivate overlay instead of destroying (it stays for re-triggers)
      const regEntry = reg.get(voiceKey);
      if (regEntry?._overlay?.el) {
        regEntry._overlay.el.classList.remove("is-active");
      }

      // Waveform cleanup: mono vs poly
      if (polyActive && waveformHandle) {
        // Poly: remove this voice's cursor and peak layer
        removeCursor(waveformHandle, voiceKey);
        removePeakLayer(waveformHandle, voiceKey);
      } else if (waveformHandle) {
        // Mono: reset the shared cursor
        resetCursor(waveformHandle);
      }

      if (reg.get(voiceKey)?.stop === stop) reg.delete(voiceKey);
      try { gainNode.disconnect(); } catch { }
      try { panNode?.disconnect(); } catch { }
      srcNode = null;

      window.dispatchEvent(new CustomEvent("oscilla:audio", {
        detail: { uid: voiceKey, file: live.filename, state: "stop" }
      }));
    };

    const playOne = (first) => {
      srcNode = ctx.createBufferSource();

      // Read from live params (updated by live console)
      const curSpeed = live.speed;
      const curAmp = live.amp;
      const curFadeIn = first ? live.fadeIn : 0;
      const curFadeOut = live.fadeOut;
      const reverse = curSpeed < 0;
      const absSpeed = Math.abs(curSpeed) || 1;

      // For reverse: use a reversed copy of the buffer, play with positive rate
      const activeBuf = reverse
        ? getReversedBuffer(ctx, live.buf, live.filename + "__rev")
        : live.buf;
      srcNode.buffer = activeBuf;

      // In/out points (relative to original buffer direction)
      const inPoint = Math.max(0, live.in || 0);
      const endPoint = (live.out > 0 && live.out <= live.buf.duration)
        ? live.out
        : live.buf.duration;
      const segmentDuration = Math.max(0.01, endPoint - inPoint);
      const iterDuration = segmentDuration / absSpeed;

      // For reversed buffer, flip in/out offsets
      const startOffset = reverse
        ? live.buf.duration - endPoint
        : inPoint;

      try {
        srcNode.playbackRate.value = absSpeed;
      } catch { }

      srcNode.connect(gainNode);

      const now = ctx.currentTime;

      // Schedule the entire envelope upfront
      gainNode.gain.cancelScheduledValues(now);

      if (first && curFadeIn > 0) {
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(curAmp, now + Math.min(curFadeIn, iterDuration));
      } else {
        gainNode.gain.setValueAtTime(curAmp, now);
      }

      // Schedule fadeOut BEFORE the sound ends
      if (curFadeOut > 0 && remaining === 1) {
        const clampedFadeOut = Math.min(curFadeOut, iterDuration);
        const fadeOutStartTime = now + iterDuration - clampedFadeOut;

        if (fadeOutStartTime > now + curFadeIn) {
          gainNode.gain.setValueAtTime(curAmp, fadeOutStartTime);
          gainNode.gain.linearRampToValueAtTime(0, now + iterDuration);
        } else {
          gainNode.gain.linearRampToValueAtTime(0, now + iterDuration);
        }
      }

      srcNode.onended = () => {
        if (stopped) {
          if (!polyActive && waveformHandle) resetCursor(waveformHandle);
          return cleanup();
        }
        remaining--;
        if (remaining > 0) {
          if (!polyActive && waveformHandle) resetCursor(waveformHandle);
          return playOne(false);
        }

        // Sound finished naturally - cleanup
        setTimeout(cleanup, 50);
      };

      srcNode.start(0, startOffset, segmentDuration);

      // Start waveform cursor tracking
      // Waveform contour is always displayed normally (not mirrored).
      // Reverse playback is conveyed by the cursor moving right-to-left
      // (startCursor handles this via negative speed).
      if (polyActive && polyVoiceCursor) {
        startCursor(polyVoiceCursor, ctx, ctx.currentTime, segmentDuration, live.speed);
      } else if (waveformHandle) {
        startCursor(waveformHandle, ctx, ctx.currentTime, segmentDuration, live.speed);
      }
    };

    // -------------------------------------------------------
    // OVERLAY SUPPORT
    // Suppressed when waveform is active (info shown as SVG text)
    // -------------------------------------------------------
    let overlay = null;
    if (cueElement && overlayFlag > 0 && !waveformHandle) {
      if (cueElement._audioOverlay) {
        overlay = cueElement._audioOverlay;
        console.log(`[audio] Reusing primed overlay for ${voiceKey}`);
      } else {
        overlay = createAudioOverlay({
          anchorEl: cueElement,
          label: voiceKey,
          mode: "auto",
          track: true
        });
      }

      if (overlay?.el) {
        overlay.el.classList.add("oscilla-audio-overlay", "is-active");
        const details = `amp:${live.amp} loop:${loop}${live.speed !== 1 ? ` speed:${live.speed}` : ""}`;
        overlay.update(`${filename} | ${details}`);
        overlay.position();
      }
    }

    // Store overlay and waveform references in registry for cleanup
    const regEntry = reg.get(voiceKey);
    if (regEntry) {
      regEntry._overlay = overlay;
      regEntry._cueElement = cueElement;
      if (waveformHandle) regEntry._waveform = waveformHandle;
    }

    playOne(true);

  } catch (err) {
    console.error("[AUDIO] handleAudioCue error:", err);

    try {
      const errKey = ast?.uid?.trim();
      const src = ast?.src;
      const file = src ? (src.endsWith(".wav") ? src : `${src}.wav`) : undefined;
      if (errKey && window.activeAudioCues?.has(errKey)) {
        window.activeAudioCues.delete(errKey);
        window.dispatchEvent(new CustomEvent("oscilla:audio", {
          detail: { uid: errKey, file, state: "stop" }
        }));
      }
    } catch { }
  }
}


// =============================================================
//  stopAllAudio -- Global fade-out stop (filename scoped)
// =============================================================
export function stopAllAudio(filename, fadeOutSec = 1.0) {
  const ctx = window.sharedAudioCtx;
  const reg = window.activeAudioCues;
  if (!ctx || !reg) return;

  for (const [key, voice] of reg) {
    if (filename && voice.filename !== filename) continue;

    try { voice.stop?.(fadeOutSec); } catch { }

    reg.delete(key);

    window.dispatchEvent(new CustomEvent("oscilla:audio", {
      detail: { uid: key, file: voice.filename, state: "stop" }
    }));
  }
}


// =============================================================
//  Global stop button handler
// =============================================================
document.getElementById("stop-audio-button")?.addEventListener("click", () => {
  console.log("[AUDIO] Global STOP triggered");

  // 1. Stop all impulse processes (via window global to avoid circular import)
  window.stopAllAudioImpulses?.();

  // 2. Stop all active audio voices
  const active = window.activeAudioCues;
  if (!active || active.size === 0) {
    console.warn("[AUDIO] No active voices.");
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
//  Prime audio overlay (called during assignCues)
// =============================================================
export function primeAudioOverlay(ast, cueElement) {
  if (!ast || !cueElement) return;

  const params = ast.params || ast;
  const overlayLevel = parseOverlayLevel(params.overlay ?? ast.overlay);
  if (overlayLevel <= 0) return;

  if (cueElement._audioOverlayPrimed) return;
  cueElement._audioOverlayPrimed = true;

  const overlay = createAudioOverlay({
    anchorEl: cueElement,
    label: "audioFile",
    mode: "auto",
    track: true
  });

  if (overlay?.el) {
    const text = formatAudioFileOverlay(params, overlayLevel);
    overlay.update(text);
    overlay.position();
    cueElement._audioOverlay = overlay;
    cueElement._audioOverlayLevel = overlayLevel;
  }

  console.log(`[audio] Primed audioFile overlay`);
}


// =============================================================
//  Prime waveform display (called during assignCues)
//  Async -- fetches and decodes audio buffer, then renders
//  waveform into the score SVG so it is visible before playback.
//  Default target is "self" (the cue element itself).
// =============================================================
export async function primeWaveform(ast, cueElement) {
  if (!ast || !cueElement) return;

  const params = ast.params || ast;
  const waveformParam = ast.waveform ?? params.waveform ?? "self";

  // Suppress waveform if explicitly disabled
  if (waveformParam === "none" || waveformParam === "0") return;

  // Avoid double-priming
  if (cueElement._waveformPrimed) return;
  cueElement._waveformPrimed = true;

  const src = ast.src ?? params.src;
  if (!src) return;

  const filename = src.endsWith(".wav") ? src : `${src}.wav`;
  const uid = ast.uid ?? params.uid ?? src;

  try {
    const ctx =
      window.sharedAudioCtx ||
      (window.sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)());

    // Fetch + decode with caching
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

    // Build info label from AST params
    const amp = params.amp ?? ast.amp ?? 1;
    const loop = params.loop ?? ast.loop ?? 1;
    const speed = params.speed ?? params.pitch ?? ast.speed ?? ast.pitch ?? 1;
    const pan = params.pan ?? ast.pan;
    const fadeIn = params.fadeIn ?? ast.fadeIn ?? 0;
    const fadeOut = params.fadeOut ?? ast.fadeOut ?? 0;

    const infoParts = [filename];
    if (Number(amp) !== 1) infoParts.push(`amp:${amp}`);
    if (Number(loop) !== 1) infoParts.push(`loop:${loop === 0 ? "inf" : loop}`);
    if (Number(speed) !== 1) infoParts.push(`speed:${speed}`);
    if (pan != null && Number(pan) !== 0) infoParts.push(`pan:${pan}`);
    if (Number(fadeIn) > 0) infoParts.push(`in:${fadeIn}s`);
    if (Number(fadeOut) > 0) infoParts.push(`out:${fadeOut}s`);

    // Render into score SVG
    const svg = cueElement.ownerSVGElement;
    if (svg) {
      renderWaveform(svg, waveformParam, buf, uid, filename, {
        element: cueElement,
        info: infoParts.join(" | ")
      });
      console.log(`[audio] Primed waveform for ${uid} -> ${waveformParam}`);
    }
  } catch (err) {
    console.warn(`[audio] Waveform prime failed for ${filename}:`, err);
  }
}
