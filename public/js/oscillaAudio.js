

// ===================
// 🎧 Audio Cue Support
// ===================

/**
 * Stops audio cues (specific file or all)
 * Supports optional fadeOut and always clears triggeredCues + _cueInsideState.
 * @param {string} cueId - e.g. "cueAudioStop(noise.wav)" or "cueAudioStop()"
 * @param {object} cueParams - e.g. { choice: "noise.wav", fadeOut: 200 }
 */
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

// =========================================================
// 🎧 handleAudioCue() — fully instrumented
// =========================================================
// ------------------------------------------------------------
// cueAudio(): play sound natively (Web Audio API)
// ------------------------------------------------------------

function normalizeAudioSource(src) {
  if (!src) return null;
  src = src.replace(/['"]/g, "").trim();
  if (/\.(wav|ogg|mp3|m4a)$/i.test(src)) return src;
  return `${src}.wav`;
}
// ============================================================
// 🎧 cueAudio — Play / Toggle / Loop with UID-scoped control
// ============================================================
// ============================================================
// 🎧 cueAudio — UID-scoped playback with pending safety,
//               proper toggle-off, and clean retrigger
//               Events: { uid, file, state: "play" | "stop" }
// ============================================================
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

