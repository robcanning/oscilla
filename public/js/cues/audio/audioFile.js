// =============================================================
//  audioFile.js -- single-file audio playback engine
//
//  handleAudioCue, handleAudioStopCue, stopAllAudio
//  primeAudioOverlay, primeWaveform
//  Global stop button handler
// =============================================================

import { sendOSC } from "../../system/oscillaOSCClient.js";
import { renderWaveform, startCursor, resetCursor } from "../../system/waveform.js";
import {
  sharedAudioCtx,
  audioBufferCache,
  evalMaybeRandom,
  createAudioOverlay,
  formatAudioFileOverlay,
  parseOverlayLevel
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
      stopAudioCue(choice, fadeOutMs);
      console.log(`[AUDIO] cueAudioStop -> ${choice}`);
    } else {
      stopAllAudio(fadeOutMs);
      console.log(`[AUDIO] cueAudioStop -> all`);
    }

    sendOSC('/cueAudio/stop', { filename: choice || 'all', fadeOutMs });
  } catch (err) {
    console.warn(`[AUDIO] Error in handleAudioStopCue:`, err);
  } finally {
    if (typeof triggeredCues !== 'undefined') triggeredCues.clear();
    if (window._cueInsideState) window._cueInsideState.clear();
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

    // PITCH -- prefer direct, fallback to params
    const pitch =
      ast.pitch !== undefined
        ? evalMaybeRandom(ast.pitch)
        : evalMaybeRandom(params.pitch) ?? 1;

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

    const effectiveDuration = buf.duration / (Number(pitch) || 1);

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

    // -------------------------------------------------------
    // WAVEFORM DISPLAY
    // Default: "self" (render into the cue element itself).
    // Use waveform:none to suppress.
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
        if (Number(pitch) !== 1) infoParts.push(`pitch:${pitch}`);
        if (panVal !== null && panVal !== 0) infoParts.push(`pan:${panVal}`);
        if (fadeIn > 0) infoParts.push(`in:${fadeIn.toFixed(1)}s`);
        if (fadeOut > 0) infoParts.push(`out:${fadeOut.toFixed(1)}s`);

        waveformHandle = renderWaveform(svg, waveformParam, buf, key, filename, {
          element: cueElement,
          info: infoParts.join(" | ")
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
      // Deactivate overlay instead of destroying (it stays for re-triggers)
      const regEntry = reg.get(key);
      if (regEntry?._overlay?.el) {
        regEntry._overlay.el.classList.remove("is-active");
      }

      // Reset waveform cursor (waveform stays as score element)
      if (waveformHandle) resetCursor(waveformHandle);

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
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(ampVal, now + fadeIn);
      } else {
        gainNode.gain.setValueAtTime(ampVal, now);
      }

      // Schedule fadeOut BEFORE the sound ends
      if (fadeOut > 0 && remaining === 1) {
        const fadeOutStartTime = now + effectiveDuration - fadeOut;

        if (fadeOutStartTime > now + fadeIn) {
          gainNode.gain.setValueAtTime(ampVal, fadeOutStartTime);
          gainNode.gain.linearRampToValueAtTime(0, now + effectiveDuration);
        } else {
          gainNode.gain.linearRampToValueAtTime(0, now + effectiveDuration);
        }
      }

      srcNode.onended = () => {
        if (stopped) {
          if (waveformHandle) resetCursor(waveformHandle);
          return cleanup();
        }
        remaining--;
        if (remaining > 0) {
          if (waveformHandle) resetCursor(waveformHandle);
          return playOne(false);
        }

        // Sound finished naturally - cleanup
        setTimeout(cleanup, 50);
      };

      srcNode.start();

      // Start waveform cursor tracking
      if (waveformHandle) {
        startCursor(waveformHandle, ctx, ctx.currentTime, buf.duration, pitch);
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
        console.log(`[audio] Reusing primed overlay for ${key}`);
      } else {
        overlay = createAudioOverlay({
          anchorEl: cueElement,
          label: key,
          mode: "auto",
          track: true
        });
      }

      if (overlay?.el) {
        overlay.el.classList.add("oscilla-audio-overlay", "is-active");
        const details = `amp:${amp} loop:${loop}${pitch !== 1 ? ` pitch:${pitch}` : ""}`;
        overlay.update(`${filename} | ${details}`);
        overlay.position();
      }
    }

    // Store overlay and waveform references in registry for cleanup
    const regEntry = reg.get(key);
    if (regEntry) {
      regEntry._overlay = overlay;
      regEntry._cueElement = cueElement;
      if (waveformHandle) regEntry._waveform = waveformHandle;
    }

    playOne(true);

  } catch (err) {
    console.error("[AUDIO] handleAudioCue error:", err);

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
    const pitch = params.pitch ?? ast.pitch ?? 1;
    const pan = params.pan ?? ast.pan;
    const fadeIn = params.fadeIn ?? ast.fadeIn ?? 0;
    const fadeOut = params.fadeOut ?? ast.fadeOut ?? 0;

    const infoParts = [filename];
    if (Number(amp) !== 1) infoParts.push(`amp:${amp}`);
    if (Number(loop) !== 1) infoParts.push(`loop:${loop === 0 ? "inf" : loop}`);
    if (Number(pitch) !== 1) infoParts.push(`pitch:${pitch}`);
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
