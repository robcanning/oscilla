/*!
 * cueHandlers.js — Modular Cue Handling for oscillaScore
 * © 2025 Rob Canning
 *
 * Licensed under the GNU General Public License v3.0
 * https://www.gnu.org/licenses/gpl-3.0.html
 *
 * This module defines the logic for interpreting and responding to score cue events
 * within the oscillaScore system. Cue types include:
 *
 *  - cuePause, cueStop           → Playback control
 *  - cueSpeed, cueChoice         → Parameter change or user interaction
 *  - cueRepeat_*                 → Repeating sections with jump logic
 *  - cueAudio, cueOsc*           → Media and OSC triggering
 *  - cueTraverse (c-t)           → Object animation along defined points
 *  - cuePage                     → Fullscreen animated SVG overlays
 *
 * The module also manages cue state (triggeredCues), repeat state synchronization,
 * and UI updates related to pause countdowns, audio playback, and cue highlighting.
 *
 * All handlers are exportable and usable within app.js and other modules.
 */

export const cueHandlers = {
  cueSpeed: handleSpeedCue,
  cuePause: handlePauseCue,
  cueStop: handleStopCue,
  cueChoice: handleCueChoice,
  cuePage: handlePageCue,
  cueNav: handleNavCue,
  cueAudio: handleAudioCue,
  // cueAudioStop: handleAudioStopCue,
  cueVideo: handleVideoCue,
  cueP5: handleP5Cue,
  cueOsc: handleOscCue,
  cueOscTrigger: handleOscCue,
  cueOscValue: handleOscCue,
  cueOscSet: handleOscCue,
  cueOscRandom: handleOscCue,
  cueOscBurst: handleOscCue,
  cueOscPulse: handleOscCue,
  cueRepeat: handleRepeatCue,
  cueTraverse: handleTraverseCue,
  "c-t": handleTraverseCue,
  cueText: handleTextCue,
  cueSeq: handleSeqCue,
  cueGroup: handleGroupCue,


};

import { parseCueToAST } from "./parser.js";



// 🔁 Allow re-triggering of cues with the given UID or cueId
// export function resetCueTrigger(cueIdOrUid) {
//   if (!window.cuesTriggered) return;

//   const key = cueIdOrUid.trim();
//   if (window.cuesTriggered.has(key)) {
//     window.cuesTriggered.delete(key);
//     console.log(`[cueReset] ♻️ Reset cue trigger: ${key}`);
//   }
// } 

// Emulate the rewind reset: clear every gating structure we might use
export function resetCueTrigger() {
  const cleared = [];
  if (window.triggeredCues?.clear) { window.triggeredCues.clear(); cleared.push("triggeredCues"); }
  if (window.cuesTriggered?.clear) { window.cuesTriggered.clear(); cleared.push("cuesTriggered"); }
  if (window._cueInsideState?.clear) { window._cueInsideState.clear(); cleared.push("_cueInsideState"); }
  if (window._cueDebounce?.clear) { window._cueDebounce.clear(); cleared.push("_cueDebounce"); }
  console.log(`[rewindReset] cleared: ${cleared.join(", ") || "nothing"}`);
}

function waitForCueComplete(targetId, timeout = 60000) {
  return new Promise(resolve => {
    const onDone = (ev) => {
      const { id } = ev.detail || {};
      if (!id) return;
      if (id.includes(targetId)) {
        window.removeEventListener("oscilla:cueComplete", onDone);
        resolve();
      }
    };
    window.addEventListener("oscilla:cueComplete", onDone);
    // safety timeout (so it doesn't hang forever)
    setTimeout(() => {
      window.removeEventListener("oscilla:cueComplete", onDone);
      resolve();
    }, timeout);
  });
}




////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////

// cues.js (top-level or imported from parser.js)
export function parseCueParams(cueId) {
  // ----------------------------------------------------------
  // 1️⃣ New Chevrotain DSL (cue:page(...), cue:audio(...), etc.)
  // ----------------------------------------------------------
  if (cueId.startsWith("cue:")) {
    try {
      console.log("[CueDSL] 🧩 Parsing new-style cue:", cueId);
      const ast = parseCueToAST(cueId); // returns plain AST
      return { type: "cuePage", params: {}, ast }; // unified structure
    } catch (err) {
      console.error("[CueDSL] ❌ Parse failed for Chevrotain cue:", err);
      // continue to legacy fallback
    }
  }

  // ----------------------------------------------------------
  // 2️⃣ Optional JSON/experimental DSL (colon + braces form)
  // ----------------------------------------------------------
  if (cueId.includes(":") && cueId.includes("{")) {
    try {
      const result = parseCueDSL(cueId); // your older experimental parser
      console.log("[CueDSL] ✅ JSON-style DSL parsed successfully:", result);
      return result;
    } catch (err) {
      console.warn("[CueDSL] ⚠️ JSON-style DSL failed, using legacy fallback:", err);
    }
  }

  // ----------------------------------------------------------
  // 3️⃣ Fallback to legacy cue(param)_style(value) syntax
  // ----------------------------------------------------------
  return parseCueLegacy(cueId);
}


////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////

export function parseCueDSL(str) {
  // Example: cue:page(target:"page3"){dur:5,next:"page4"}
  const mainMatch = str.match(/^cue:([a-zA-Z0-9_-]+)\((.*?)\)\s*\{(.*)\}$/);
  if (!mainMatch) throw new Error("Invalid DSL structure");

  const [, type, argSection, paramSection] = mainMatch;

  // Parse args: target:"page3", loop:[...]
  const args = {};
  argSection.split(",").forEach((kv) => {
    const [k, v] = kv.split(":").map(s => s.trim());
    if (!k) return;
    args[k] = parseValue(v);
  });

  // Parse params: dur:5, next:"page4"
  const params = {};
  paramSection.split(",").forEach((kv) => {
    const [k, v] = kv.split(":").map(s => s.trim());
    if (!k) return;
    params[k] = parseValue(v);
  });

  return { type: `cue${capitalize(type)}`, args, params };
}

// Helper
function parseValue(v) {
  if (!v) return null;
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  if (!isNaN(v)) return Number(v);
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}


////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////






// 🔁 Main dispatcher function for cue triggers
export function handleCueTrigger(cueId, isRemote = false, force = false) {
  console.log(`[DEBUG] Attempting to trigger cue: ${cueId}`);

  // ⚡ Allow duplicates if cuePage is inside a playlist
  const isPagePlaylist = cueId.startsWith("cuePage(") && window.isCuePagePlaylistActive;

  if (!isPagePlaylist && window.triggeredCues?.has(cueId)) {
    console.debug("[DEBUG] Skipping already-triggered cue:", cueId);
    return;
  }

  // ✅ Mark cue as triggered
  window.triggeredCues?.add(cueId);

  // 🔍 Parse cue and get AST (if DSL)
  const parsed = parseCueParams(cueId);
  if (!parsed) {
    console.error("[CUE] ❌ Failed to parse cue:", cueId);
    return;
  }

  const { type, cueParams, params, ast } = parsed;
  console.log(`[parseCueParams] Final cue type: ${type}`);
  console.log(`[parseCueParams] Final cueParams:`, cueParams || params);

  // 🧩 Unified param reference
  const p = cueParams || params || {};

  // 🧠 NEW DSL cue:page(...) syntax via Chevrotain
  if (cueId.startsWith("cue:page")) {
    console.log("[CueDSL] 🌿 Handling new cue:page syntax...");
    if (ast) {
      return handlePageCueFromAST(ast);
    } else {
      console.warn("[CueDSL] ⚠️ No AST found for cue:page — fallback to legacy.");
    }
  }

  // ✅ Find appropriate handler
  if (!cueHandlers.hasOwnProperty(type)) {
    console.warn(`[CLIENT] No handler found for cue type: ${type}`);
    return;
  }

  const handler = cueHandlers[type];
  if (!handler) {
    console.warn(`[CLIENT] Cue type '${type}' has no defined function.`);
    return;
  }

  // -------------------------------------------------------
  //  🎚️ Specific cue type handling
  // -------------------------------------------------------

  if (type === "cueSpeed") {
    const speed = p.speed ?? p.Speed ?? p.choice;
    if (!speed || isNaN(speed)) {
      console.warn(`[CLIENT] Invalid or missing speed in cueSpeed: ${cueId}`);
      return;
    }
    handler(cueId, Number(speed));
  }

  else if (type === "cuePause") {
    const durationSec = p.duration ?? p.dur ?? p.choice;
    const durationMs = Number(durationSec) * 1000;
    if (!durationMs || isNaN(durationMs)) {
      console.error(`[CLIENT] Invalid duration for cuePause: ${cueId}`);
      return;
    }
    handler(cueId, durationMs);
  }

  else if (type === "cueChoice") {
    if (p.choice && p.dur) {
      console.log(`[CUE] Triggering cue handler: ${type}`);
      handler(cueId, p);
    } else {
      console.error(`[CLIENT] Invalid cueChoice: missing 'choice' or 'dur' param`);
    }
  }

  // -------------------------------------------------------
  //  📄 cuePage (legacy and AST-aware)
  // -------------------------------------------------------
  else if (type === "cuePage") {
    // ✅ DSL AST-based cuePage
    if (ast) {
      console.log("[CueDSL] 🧩 AST detected inside cuePage – handling via AST parser.");
      return handlePageCueFromAST(ast);
    }

    // 🧠 Legacy extraction for cuePage(...)
    const openIdx = cueId.indexOf("(");
    let inner = "";
    if (openIdx !== -1) {
      let depth = 0;
      for (let i = openIdx + 1; i < cueId.length; i++) {
        const ch = cueId[i];
        if (ch === "(") depth++;
        else if (ch === ")") {
          if (depth === 0) {
            inner = cueId.slice(openIdx + 1, i);
            break;
          } else depth--;
        }
      }
    }

    if (/^(seq|loop|rand)\(/.test(inner)) {
      console.log(`[cuePage] Detected playlist expression: ${inner}`);
      handleCuePagePlaylist(cueId, inner);
      return;
    }

    // 🧩 Normal single page cue
    let animDuration = Number(p.dur);
    if (isNaN(animDuration) || animDuration < 0) animDuration = 0;

    const pageName = p.choice || cueId.match(/cuePage\(([^)]+)\)/)?.[1];
    if (!pageName) {
      console.error(`[CLIENT] cuePage missing page name: ${cueId}`);
      return;
    }

    const animationPath = `scores/pages/${pageName}.svg`;
    handler(cueId, animationPath, animDuration, p);
  }

  // -------------------------------------------------------
  //  🧭 cueNav (or cueNavigate)
  // -------------------------------------------------------
  else if (cueId.startsWith("cueNav(") || cueId.startsWith("cueNavigate(")) {
    const parsedNav = parseNavCue(cueId);
    return handleNavCue(parsedNav);
  }

  // -------------------------------------------------------
  //  🎧 cueAudioStop
  // -------------------------------------------------------
  else if (cueId.startsWith("cueAudioStop(")) {
    const match = cueId.match(/^cueAudioStop\(([^)]+)\)/);
    const file = match?.[1]?.trim();
    if (file) {
      console.log(`[CUE] 🔻 cueAudioStop for ${file}`);
      stopAudioCue(file);
      const ev = new CustomEvent("oscilla:audio", { detail: { file, state: "stop" } });
      window.dispatchEvent(ev);
    }
    return;
  }

  // -------------------------------------------------------
  //  🎬 Fallback for other cue types
  // -------------------------------------------------------
  else {
    console.log(`[CUE] Triggering cue handler: ${type}`);
    handler(cueId, p);
  }

  // -------------------------------------------------------
  //  🌐 Mark and optionally broadcast the cue
  // -------------------------------------------------------
  if (!window.triggeredCues.has(cueId)) {
    window.triggeredCues.add(cueId);
    if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN && !isRemote) {
      window.socket.send(JSON.stringify({ type: "cueTriggered", cueId }));
      console.log(`[CLIENT] Sent cue trigger to server: ${cueId}`);
    }
  }
}


// =========================
// 🧭 Universal UID Registry
// =========================
export function registerCueUid(cueExpr, context = "unknown") {
  if (!cueExpr || typeof cueExpr !== "string") return;
  if (!window.cueRegistry) window.cueRegistry = {};

  const uidMatch = cueExpr.match(/_uid\(([^)]+)\)/);
  if (!uidMatch) return;

  const uid = uidMatch[1].trim();
  window.cueRegistry[uid] = cueExpr;

  // console.log(`[REGISTRY] ✅ Registered UID "${uid}" (${context}) → ${cueExpr}`);
}



// 🔔 Unified cue completion event emitter
export function emitCueComplete(id, type = "generic") {
  console.log(`[cueComplete] 🔚 ${type} complete → ${id}`);
  window.dispatchEvent(new CustomEvent("oscilla:cueComplete", {
    detail: { id, type, timestamp: Date.now() }
  }));
}









/**
 * cuePause — Pause Cue Handling Logic (ES Module Compatible)
 *
 * Implements pause-related cue behavior, allowing playback to be halted for a
 * fixed duration, with visual feedback and synchronized auto-resume across clients.
 *
 * === Cue Format Overview ===
 * cuePause_dur(N)[_next(cueId)]
 *
 * Parameters:
 *   dur(N)      → REQUIRED. Duration of pause in seconds (converted to ms internally).
 *   next(...)   → OPTIONAL. Cue ID to trigger immediately after pause (e.g. cueAudio, cueTraverse).
 *
 * === Responsibilities ===
 * - Interrupt playback on cue trigger
 * - Display a countdown overlay (if duration > 2s or forced)
 * - Block sync messages during pause (ignoreSyncDuringPause)
 * - Auto-resume playback after duration elapses
 * - Allow manual resume via click or Spacebar
 * - Optionally trigger a follow-up cue (`next(...)`)
 * - Broadcast pause/resume state via WebSocket to keep clients in sync
 *
 * === Functions Exported ===
 * - handlePauseCue(cueId, duration, showCountdownOverride, resumeTarget)
 *     → Main cue handler. Initiates pause, countdown, and auto-resume.
 *
 * - dismissPauseCountdown(forceNoResume = false, receivedFromServer = false)
 *     → Ends the countdown and resumes playback unless suppressed.
 *
 * - resumePlayback(receivedFromServer = false)
 *     → Restores playback and re-syncs state after pause ends.
 *
 * - preventAccidentalPauses()
 *     → Sets brief cooldown to avoid retriggering pause cues right after resume.
 *
 * - handleWebSocketSync(receivedFromServer)
 *     → Sends `resume_after_pause` event to all clients via WebSocket.
 *
 * - clearPauseTimers()
 *     → Ensures no countdown/resume timers are left running.
 *
 * - hidePauseCountdownUI()
 *     → Hides the countdown visually without triggering resume logic.
 *
 * - pauseDismissHandler()
 *     → Binds click and Spacebar to allow user-driven countdown dismissal.
 *
 * === UI Requirements ===
 * - #pause-countdown: visible overlay container (shown/hidden)
 * - #pause-time: live countdown number updated every second
 *
 * === Integration Notes ===
 * - Must be called from cue handler logic in response to `cuePause(...)`
 * - `pauseDismissHandler()` must be initialized after DOM is ready
 * - `window.isPlaying`, `startAnimation()`, `stopAnimation()`, etc., must be globally accessible
 */

export function handlePauseCue(cueId, duration, showCountdownOverride = null, resumeTarget = cueId) {
  console.log(`[DEBUG] Handling pause cue: ${cueId}, duration: ${duration}ms.`);

  window.isPaused = true;
  window.ignoreSyncPlayback = true;

  stopAnimation(); // ✅ Stops local animation
  // wiindow.stopStopwatch(); // ✅ Optional if stopwatch is linked

  // Send pause message to server to stop advancing playhead globally
  if (window.socket && window.socket.readyState === WebSocket.OPEN) {
    const pausePayload = {
      type: "pause",
      playheadX: window.playheadX,
      elapsedTime: window.elapsedTime,
    };
    console.log("[CLIENT] Sending pause message to server:", pausePayload);
    window.socket.send(JSON.stringify(pausePayload));
  }

  if (window.isSeeking) {
    // console.log(`[DEBUG] Ignoring pause cue '${cueId}' during seeking.`);
    return;
  }

  window.ignoreSyncDuringPause = true;

  window.isPlaying = false;
  window.isMusicalPause = true;

  window.stopAnimation?.();
  window.animationPaused = true;
  window.togglePlayButton?.();
  console.log("[DEBUG] Playback forcefully stopped for cuePause.");

  const pauseCountdown = document.getElementById("pause-countdown");
  const pauseTime = document.getElementById("pause-time");

  if (!pauseCountdown || !pauseTime) {
    console.error("[ERROR] pause-countdown or pause-time not found.");
    return;
  }

  const showCountdown = showCountdownOverride ?? (duration > 2000);

  if (showCountdown) {
    const targetEnd = Date.now() + duration;

    pauseCountdown.classList.remove("hidden");
    pauseCountdown.style.display = "flex";
    pauseCountdown.style.visibility = "visible";
    pauseCountdown.style.opacity = "1";

    const updateCountdown = () => {
      const remainingMs = targetEnd - Date.now();
      const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
      pauseTime.textContent = seconds;

      if (seconds <= 0) {
        clearPauseTimers();
        dismissPauseCountdown();
      }
    };

    clearPauseTimers();
    updateCountdown();
    window.pauseCountdownInterval = setInterval(updateCountdown, 1000);
    console.log("[DEBUG] Countdown interval started.");
  }

  clearTimeout(window.pauseTimeout);
  window.pauseTimeout = setTimeout(() => {
    console.log("[DEBUG] Auto-resuming after pause duration.");
    window.ignoreSyncDuringPause = false;
    dismissPauseCountdown();
    if (resumeTarget && resumeTarget !== cueId) {
      console.log(`[DEBUG] Jumping to resume target: ${resumeTarget}`);
      window.jumpToCueId?.(resumeTarget);
    }
  }, duration);
}




export function dismissPauseCountdown(forceNoResume = false, receivedFromServer = false) {
  console.log("[DEBUG] Dismissing pause countdown.");

  const pauseCountdown = document.getElementById("pause-countdown");
  if (pauseCountdown) {
    pauseCountdown.classList.add("hidden");
    pauseCountdown.style.display = "none";
  }

  const pauseTime = document.getElementById("pause-time");
  if (pauseTime) pauseTime.textContent = "";

  clearPauseTimers();

  if (forceNoResume) {
    console.log("[DEBUG] Countdown dismissed without resuming playback.");
    return;
  }

  resumePlayback(receivedFromServer);
}


export function clearPauseTimers() {
  if (window.pauseCountdownInterval) {
    clearInterval(window.pauseCountdownInterval);
    window.pauseCountdownInterval = null;
    console.log("[DEBUG] Pause countdown timer cleared.");
  }

  if (window.pauseTimeout) {
    clearTimeout(window.pauseTimeout);
    window.pauseTimeout = null;
    console.log("[DEBUG] Pause timeout cleared.");
  }
}

/**
 * Resumes playback after pause and synchronizes across clients.
 */
export function resumePlayback(receivedFromServer = false) {
  console.log("[DEBUG] Resuming playback after countdown dismissal.");

  // ✅ Allow resuming even if playheadX = 0 (only reject NaN)
  if (!Number.isNaN(window.playheadX)) {
    console.log(`[DEBUG] Resuming from playheadX: ${window.playheadX}`);
  } else {
    console.error(`[ERROR] Invalid playheadX: ${window.playheadX}. Aborting resume.`);
    return;
  }

  // ✅ Refresh UI state
  window.updatePosition?.();
  // window.updateSeekBar?.();
  window.updateStopwatch?.();

  // ✅ Reset animation clock baseline to avoid delta jumps
  window.lastAnimationFrameTime = null;

  // ✅ Use the canonical startPlayback() for a full smooth resume
  if (typeof window.startPlayback === "function") {
    console.log("[DEBUG] Calling startPlayback() from resumePlayback()");
    window.startPlayback();
  } else {
    // fallback (legacy)
    window.isPlaying = true;
    window.animationPaused = false;
    window.ignoreSyncPlayback = false;
    window.togglePlayButton?.();
    console.log("[DEBUG] Calling startAnimation() from resumePlayback()");
    window.startAnimation?.();
    window.startStopwatch?.();
  }

  preventAccidentalPauses();
  handleWebSocketSync(receivedFromServer);
}


/**
 * Blocks accidental cue retriggers and pause loops after resume.
 */
export function preventAccidentalPauses() {
  window.ignorePauseAfterResume = true;
  console.log("[DEBUG] Pause prevention active.");

  setTimeout(() => {
    window.ignorePauseAfterResume = false;
    console.log("[DEBUG] Pause prevention expired.");
  }, 2000);

  window.pauseCooldownActive = true;
  console.log("[DEBUG] Pause cooldown activated.");

  setTimeout(() => {
    window.pauseCooldownActive = false;
    console.log("[DEBUG] Pause cooldown expired.");
  }, 3000);
}

/**
 * Sends resume_after_pause over WebSocket to sync all clients.
 */
export function handleWebSocketSync(receivedFromServer = false) {
  if (window.wsEnabled && window.socket && !receivedFromServer) {
    window.resumeReceived = true;

    if (!isNaN(window.playheadX) && window.playheadX > 0) {
      console.log(`[DEBUG] Syncing playheadX: ${window.playheadX}`);
    } else {
      console.error(`[ERROR] Invalid playheadX. Keeping last known value.`);
    }

    const message = JSON.stringify({
      type: "resume_after_pause",
      elapsedTime: window.elapsedTime,
      playheadX: window.playheadX,
    });

    console.log(`[CLIENT] Broadcasting resume_after_pause: ${message}`);
    window.socket.send(message);

    setTimeout(() => {
      window.resumeReceived = false;
    }, 1000);
  }
}

// ✅ Optional: Click-to-dismiss handler
export function pauseDismissClickHandler() {
  const pauseCountdown = document.getElementById("pause-countdown");

  if (!pauseCountdown) {
    console.error("[ERROR] pause-countdown not found.");
    return;
  }

  // ✅ Click to dismiss
  pauseCountdown.addEventListener("click", (event) => {
    console.log("[DEBUG] Pause countdown clicked. Dismissing.");
    dismissPauseCountdown(false);
    event.stopImmediatePropagation();
  });

  // ✅ Press Spacebar to dismiss
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" || event.key === " ") {
      if (!pauseCountdown.classList.contains("hidden")) {
        console.log("[DEBUG] Spacebar pressed. Dismissing pause countdown.");
        dismissPauseCountdown(false);
        event.preventDefault(); // Optional: prevent page scroll
      }
    }
  });
}






/**
 *  — Cue Repeat Logic (ES Module)
 *
 * This module implements the complete parsing, state tracking, and execution logic
 * for `cueRepeat_*` score cues, used to create looped playback sections within an
 * animated SVG score environment.
 *
 * === Cue Format Overview ===
 * cueRepeat_s_[startID][_e_[endID]]_x_[repeatCount|inf][_r_[resumeID]][_d_[f|r|p]][_a_[stop]]-[UID?]
 *
 * Parameters:
 *   s_[startID]      → REQUIRED. ID to jump to at start of each repeat loop.
 *   e_[endID]        → OPTIONAL. ID marking end of the repeat section (default = cue ID).
 *   x_[N|inf]        → REQUIRED. Number of repeats (x_2 = 2 loops = 3 total plays). Use x_inf for infinite loop.
 *   r_[resumeID]     → OPTIONAL. Jump location after final repeat (default = cue itself).
 *   d_[f|r|p]        → OPTIONAL. Direction mode:
 *                        - f = forward
 *                        - r = reverse
 *                        - p = pingpong (alternates direction)
 *   a_[stop]         → OPTIONAL. If present, playback stops after final repeat.
 *   -UID             → OPTIONAL suffix for disambiguation (ignored by logic).
 *
 * === Exports ===
 * - repeatStateMap         → Object that tracks all active repeat states by cue ID
 * - parseRepeatCueId()     → Parses a cueRepeat_* ID into a structured config object
 * - executeRepeatJump()    → Performs jump logic between repeat boundaries with timing
 * - handleRepeatCue()      → Top-level handler for triggering repeat behavior
 *
 * === Responsibilities ===
 * - Parse cueRepeat_* IDs
 * - Store per-cue repeat state (count, direction, cooldowns, active/busy flags)
 * - Pause before and after jumps for clarity and synchronization
 * - Resume playback post-jump
 * - Communicate repeat updates via WebSocket for multi-client sync
 * - Prevent retriggering with debounce and jumpCooldownUntil
 *
 * === Integration Notes ===
 * - `handleRepeatCue()` should be called when a cueRepeat_* element is triggered.
 * - The `repeatStateMap` must be shared if playback state is reset (e.g. on rewind).
 * - WebSocket sync broadcasts are triggered automatically inside `executeRepeatJump`.
 * - For client-side visual feedback, classes like "repeating" and "pulse" are toggled on elements.
 */

export const repeatStateMap = {}; // Tracks all active repeat states by cue ID

/**
 * Parses a cueRepeat_* ID into a repeat config object.
 */
export function parseRepeatCueId(rawCueId) {
  const cueId = rawCueId.trim();
  if (!cueId.startsWith("cueRepeat_")) return null;

  const base = cueId.slice("cueRepeat_".length);
  const repeat = {
    cueId,
    startId: null,
    endId: "self",
    count: null,
    isInfinite: false,
    resumeId: "self",
    direction: "f",
    action: null,
    hasUID: null,
  };

  const tokens = base.split("_");
  for (let i = 0; i < tokens.length; i += 2) {
    const tag = tokens[i];
    const val = tokens[i + 1];
    if (!val) continue;

    switch (tag) {
      case "s": repeat.startId = val; break;
      case "e": repeat.endId = val; break;
      case "x":
        if (val === "inf") {
          repeat.isInfinite = true;
          repeat.count = Infinity;
        } else {
          const n = parseInt(val, 10) - 1;
          if (!isNaN(n)) repeat.count = n;
        }
        break;
      case "r": repeat.resumeId = val; break;
      case "d": repeat.direction = val; break;
      case "a": repeat.action = val; break;
    }
  }

  if (!repeat.startId || (repeat.count === null && !repeat.isInfinite)) {
    console.warn(`[parseRepeatCueId] Invalid cueRepeat ID: ${cueId}`);
    return null;
  }

  return repeat;
}

/**
 * Handles jump logic during a repeat.
 */
export async function executeRepeatJump(repeat, cueId) {
  if (repeat.busy) {
    console.log(`[repeat] ⚠️ Already busy — skipping repeat for ${cueId}`);
    return;
  }

  repeat.busy = true;

  console.log(`[repeat] ⏸ Pausing before jump to ${repeat.startId}`);
  if (window.isPlaying) window.togglePlay?.();

  await new Promise(resolve => setTimeout(resolve, 1000));

  const jumpTarget = repeat.currentlyReversing ? repeat.endId : repeat.startId;
  const targetId = (jumpTarget === 'self') ? repeat.cueId : jumpTarget;

  console.log(`[repeat] 🔁 Jumping to ${targetId}`);
  window.jumpToCueId?.(targetId);

  repeat.ready = false;
  repeat.jumpCooldownUntil = Date.now() + 300;

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log(`[repeat] ▶️ Resuming playback after jump to ${targetId}`);
  if (!window.isPlaying) window.togglePlay?.();

  setTimeout(() => {
    repeat.ready = true;
    console.log(`[repeat] ✅ Jump complete for ${cueId}, ready for next repeat`);
  }, 300);

  repeat.busy = false;

  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    const safeRepeatData = { ...repeat };
    delete safeRepeatData.recovered;

    window.socket.send(JSON.stringify({
      type: "repeat_update",
      cueId,
      repeatData: safeRepeatData,
    }));
  }
}

/**
 * Initializes and launches a cueRepeat sequence.
 */
export async function handleRepeatCue(cueId) {
  const parsed = parseRepeatCueId(cueId);
  if (!parsed) return;

  console.log('[handleRepeatCue] 🎯 Detected cueRepeat:', parsed);

  document.getElementById("playhead")?.classList.add("repeating");
  document.getElementById("repeat-count-box")?.classList.remove("hidden");
  document.getElementById("repeat-count-box")?.classList.add("pulse");

  repeatStateMap[cueId] = {
    ...parsed,
    currentCount: 1,
    currentlyReversing: parsed.direction === 'r',
    active: true,
    directionMode: parsed.direction,
    lastTriggerTime: 0,
    ready: false,
    initialJumpDone: false,
    busy: false,
  };

  setTimeout(() => {
    repeatStateMap[cueId].ready = true;
  }, 0);

  await executeRepeatJump(repeatStateMap[cueId], cueId);
  repeatStateMap[cueId].initialJumpDone = true;
}

/**
 * handleRestoredRepeatState()
 *
 * Re-applies repeat state after reconnect or resume. This is typically called
 * after receiving a `repeat_state_map` from the server. It ensures that the
 * playback location and repeat logic are correctly re-initialized without
 * retriggering jumps unnecessarily.
 *
 * @param {Object} repeatStateMap - The map of cueId → repeat config
 * @param {Array} cues - The full list of cue objects
 */
export function handleRestoredRepeatState(repeatStateMap, cues) {
  console.log("[CLIENT] 🧠 Restoring repeat state now...", repeatStateMap);

  for (const [cueId, repeat] of Object.entries(repeatStateMap)) {
    if (!repeat || typeof repeat !== "object") {
      console.warn(`[restore] Skipping invalid repeat entry for cueId: ${cueId}`);
      continue;
    }

    if (repeat.active && !repeat.initialJumpDone) {
      console.log(`[CLIENT] ⏮ Evaluating active repeat: ${cueId}`);

      const startCue = cues.find(c => c.id === repeat.startId);
      const endCue = repeat.endId === 'self'
        ? cues.find(c => c.id === cueId)
        : cues.find(c => c.id === repeat.endId);

      if (startCue && endCue) {
        const playheadCenter = window.playheadX + (window.scoreContainer.offsetWidth / 2);
        const inRange = playheadCenter >= startCue.x && playheadCenter <= endCue.x + endCue.width;

        if (inRange) {
          console.log(`[CLIENT] 🧭 Already inside repeat range for ${cueId}. Skipping jump.`);

          repeat.initialJumpDone = true;
          repeat.ready = true;

          if (!repeat.recovered) {
            repeat.currentCount = (repeat.currentCount || 0) + 1;
          } else {
            delete repeat.recovered;
          }

          repeat.recovered = true;
          window.jumpToCueId?.(repeat.startId);

          repeatStateMap[cueId] = repeat;

          window.updateRepeatCountDisplay?.(repeat.currentCount + 1);
          document.getElementById("repeat-count-box")?.classList.remove("hidden");
          document.getElementById("repeat-count-box")?.classList.add("pulse");
          document.getElementById("playhead")?.classList.add("repeating");

        } else {
          console.log(`[CLIENT] 🔁 Outside repeat range — jumping to start for ${cueId}.`);

          repeat.ready = false;
          repeat.initialJumpDone = true;
          repeatStateMap[cueId] = repeat;

          window.executeRepeatJump?.(repeat, cueId).then(() => {
            setTimeout(() => {
              repeat.ready = true;
              repeatStateMap[cueId] = repeat;
              console.log(`[CLIENT] ✅ Repeat ${cueId} now ready to detect end cue.`);
            }, 300);
          });
        }

      } else {
        console.warn(`[CLIENT] ⚠️ Could not resolve start or end cue for ${cueId}. Skipping recovery.`);
      }
    }
  }
}


/**
 * assignCues(svgRoot)
 * ---------------------
 * Finds all <g> elements with ID format:
 *   <g id="assignCues(cueOscTrigger(rnd[1,9]))">
 *   <g id="assignCues(cueOscSet(speed, ypos[0.5,1.5]))">
 *
 * Assigns cue IDs to each child based on:
 *   - rnd[min,max]     → random float value
 *   - ypos[min,max]    → scaled vertical position
 * Also walks the entire SVG tree to catch other cue(...) elements.
 */
export function assignCues(svgRoot, cuesArray = []) {
  const cueGroups = svgRoot.querySelectorAll('g[id^="assignCues("]');
  if (!cueGroups.length) {
    // console.log("[assignCues] No assignCues(...) groups found in SVG.");
  } else {
    // console.log(`[assignCues] Found ${cueGroups.length} cue group(s).`);
  }

  cueGroups.forEach(group => {
    // console.log(`[assignCues] Raw group ID: '${group.id}'`);

    const baseId = group.id.split('-')[0];
    const match = baseId.match(/^assignCues\((.+)\)$/);

    if (!match) {
      // console.warn(`[assignCues] Skipping malformed group ID: ${group.id}`);
      return;
    }

    const instruction = match[1].trim();
    // console.log(`[assignCues] Processing group: ${group.id} with ${group.children.length} child(ren)`);

    // 1. Special case: cueOscSet(param, rnd[...] / ypos[...])
    const setMatch = instruction.match(/^cueOscSet\(([^,]+),\s*(rnd|ypos)\[([\d.]+),([\d.]+)\]\)$/);
    if (setMatch) {
      const param = setMatch[1].trim();
      const mode = setMatch[2];
      const min = parseFloat(setMatch[3]);
      const max = parseFloat(setMatch[4]);
      const bbox = group.getBBox();

      // console.log(`[assignCues] → cueOscSet(${param}, ${mode}[${min}, ${max}])`);

      Array.from(group.children).forEach((child, index) => {
        let value = mode === "rnd"
          ? Math.random() * (max - min) + min
          : (() => {
            const cy = child.getBBox().y + child.getBBox().height / 2;
            const normY = (cy - bbox.y) / bbox.height;
            return min + normY * (max - min);
          })();

        const formattedValue = Math.round(value);
        const cueId = `cueOscSet(${param},${formattedValue})`;
        child.id = cueId;

        const bbox = child.getBBox();
        cuesArray.push({
          id: cueId,
          element: child,
          triggered: false,
          x: bbox.x,
          width: bbox.width
        });
        // console.log(`[assignCues] [${index}] → ${child.tagName} → ${cueId}`);
      });
      return;
    }

    // 2. General case: cueOscTrigger(rnd[1,9]), etc.
    const cueMatch = instruction.match(/^([a-zA-Z][a-zA-Z0-9]*)\((rnd|ypos)\[([\d.]+),([\d.]+)\]\)$/);
    // console.log(`[assignCues] cueMatch result:`, cueMatch);

    if (!cueMatch) {
      // console.warn(`[assignCues] ❌ Invalid syntax: ${group.id}`);
      return;
    }

    const cueType = cueMatch[1];
    const mode = cueMatch[2];
    const min = parseFloat(cueMatch[3]);
    const max = parseFloat(cueMatch[4]);
    const bbox = group.getBBox();

    // console.log(`[assignCues] → ${cueType}(${mode}[${min}, ${max}])`);

    Array.from(group.children).forEach((child, index) => {
      let value = mode === "rnd"
        ? Math.random() * (max - min) + min
        : (() => {
          const cy = child.getBBox().y + child.getBBox().height / 2;
          const normY = (cy - bbox.y) / bbox.height;
          return min + normY * (max - min);
        })();

      const formattedValue = Number.isInteger(value) ? value : value.toFixed(3);
      const cueId = `${cueType}(${formattedValue})`;
      child.id = cueId;

      const bbox = child.getBBox();
      cuesArray.push({
        id: cueId,
        element: child,
        triggered: false,
        x: bbox.x,
        width: bbox.width
      });

      // console.log(`[assignCues] [${index}] → ${child.tagName} → ${cueId}`);
    });
  });

  // 🔁 Additional pass: walk all children for standalone cue IDs
  function walkForCueElements(node) {
    for (const child of node.children) {
      const id = child.id;

      // 🟦 SPECIAL: cueButton(...) → create HTML button and DO NOT add to cuesArray
      if (id?.startsWith("cueButton(")) {
        const parsed = parseCueButton(id);         // ← from the helper we added
        if (parsed) {
          createCueButtonForElement(child, parsed); // ← overlays button, hides SVG cue
          // console.log(`[assignCues] 🟦 Created cueButton: ${id}`);
        } else {
          // console.warn(`[assignCues] ⚠️ Failed to parse cueButton: ${id}`);
        }
        // Do NOT recurse into this child (prevents duplicate handling of its subtree)
        // and do NOT push to cuesArray (buttons are click-driven, not scroll-triggered).
        continue;
      }


      // ✅ Normal cue element handling

      if (id?.startsWith("cue") && !cuesArray.some(c => c.id === id && c.element)) {
        const bbox = child.getBBox?.();
        cuesArray.push({
          id: id,
          element: child,
          triggered: false,
          ...(bbox && { x: bbox.x, width: bbox.width })
        });
        // console.log(`[assignCues] ➕ Added external cue: ${id}`);

        registerCueUid(id, "walk");

      } else if (id?.includes("cue") && !id.startsWith("cue")) {
        // console.warn(`[assignCues] ⚠️ Skipped suspicious cue-like ID: ${id}`);
      }
      walkForCueElements(child); // recurse
    }
  }

  walkForCueElements(svgRoot);



  console.timeEnd("[initializeSVG] total");
  console.groupEnd();


  console.log(`[assignCues] ✅ Total cues assigned: ${cuesArray.length}`);
}









// ==================================
// 🚶 cueTraverse (c-t) Cue Handling
// ==================================

/**
 * Parses a cueTraverse-style ID and extracts the object ID and trigger flag.
 * @param {string} cueId - The cue ID (e.g. "cueTraverse_o(obj123)_t(1)")
 * @returns {Object|null} config - Parsed result with objId and triggerable
 */
export function parseTraverseCueId(cueId) {
  const params = { cueId, objId: null, triggerable: false };

  const objMatch = cueId.match(/[_-]o\\(([^)]+)\\)/);
  if (objMatch) params.objId = objMatch[1];

  const triggerMatch = cueId.match(/[_-]t\\(([^)]+)\\)/);
  if (triggerMatch) params.triggerable = triggerMatch[1] === "1";

  return params.objId ? params : null;
}

/**
 * Starts animation for a cueTraverse (c-t) cue.
 * Looks up an object by objId, reads its data-id, and triggers animation if _t(1).
 * Animation is triggered using the data-id as the key in all pending*Animations maps.
 * @param {Object} config - Parsed traverse config with objId and triggerable flag
 */
export function startTraverseAnimation(config) {
  if (!config || !config.objId) {
    console.warn("[startTraverseAnimation] ❌ Invalid config or missing objId");
    return;
  }

  const target = document.getElementById(config.objId);
  if (!target) {
    console.warn(`[startTraverseAnimation] ❌ No object found with id ${config.objId}`);
    return;
  }

  const dataId = target.getAttribute("data-id");
  if (!dataId) {
    console.warn(`[startTraverseAnimation] ⚠️ Object ${config.objId} missing data-id attribute`);
    return;
  }

  if (!dataId.includes("_t(1)")) {
    console.warn(`[startTraverseAnimation] ⚠️ data-id for ${config.objId} is not triggerable (_t(1) missing)`);
    return;
  }

  // 🔁 Look up in animation registry (if any)
  const pending =
    window.pendingScaleAnimations?.get(dataId) ||
    window.pendingScaleAnimations?.get(config.objId); // fallback

  if (pending) {
    console.log(`[startTraverseAnimation] ✅ Triggering deferred animation for data-id: ${dataId}`);
    pending();  // ✅ Call the stored function
    console.log(`[scale:_t] 🔴 timeline.play() called for ${dataId}`);
  } else {
    console.warn(`[startTraverseAnimation] ⚠️ No pending animation found for data-id: ${dataId}`);
  }
}

/**
 * Main cue handler for cueTraverse (c-t) cues.
 * @param {string} cueId - Full cue ID from score
 */
export async function handleTraverseCue(cueId) {
  const config = parseTraverseCueId(cueId);
  if (!config) return;

  console.log("[handleTraverseCue] 🚶 Triggered cueTraverse:", config);

  startTraverseAnimation(config);
}


// ⚡ Handles cueSpeed: updates playback speed and syncs
export function handleSpeedCue(cueId, newMultiplier) {
  newMultiplier = parseFloat(newMultiplier.toFixed(1));
  if (isNaN(newMultiplier) || newMultiplier <= 0) return;
  if (window.speedMultiplier === newMultiplier) return;

  window.speedMultiplier = newMultiplier;
  window.updateSpeedDisplay?.();

  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN && !window.incomingServerUpdate) {
    const msg = { type: "set_speed_multiplier", multiplier: newMultiplier, timestamp: Date.now() };
    window.socket.send(JSON.stringify(msg));
  }
}





export function handleStopCue(cueId = "cueStop") {
  console.log("[CLIENT] 🛑 cueStop triggered:", cueId);

  window.isPlaying ? window.pausePlayback() : window.startPlayback();

  // // Tell the server and other clients
  // if (window.socket && window.socket.readyState === WebSocket.OPEN) {
  //   window.socket.send(JSON.stringify({
  //     type: "cueStop",
  //     elapsedTime: window.elapsedTime,
  //     playheadX: window.playheadX,
  //     id: cueId
  //   }));
  // }

  console.log("[CLIENT] Playback stopped by cue:", cueId);
}







// =========================
// 🎬 cueChoice Handler Logic
// =========================

/**
 * Handles cue selection by displaying available animation choices.
 * Extracts animation files and durations dynamically from the cue ID.
 * Ensures score playback pauses when cue choices appear.
 * Applies UI changes, including background blur and animation previews.
 * Allows users to select an animation, triggering enlargement and playback.
 * Cleans up and restores UI after a selection is made.
 */
export function handleCueChoice(cueId) {
  console.log(`[DEBUG] Handling cue choice: ${cueId}`);

  setTimeout(() => {
    const gridContainer = document.getElementById("cue-choice-container");
    const header = document.getElementById("cue-choice-header");

    if (!gridContainer || !header) {
      console.error("[ERROR] cue-choice-container or header not found in HTML.");
      return;
    }

    // ✅ Restore visibility
    gridContainer.classList.remove("hidden");
    gridContainer.style.display = "flex";
    header.classList.remove("hidden");

    // ✅ Extract animation files and durations dynamically
    const animations = parseCueChoiceVariants(cueId);
    if (!animations.length) {
      console.error("[DEBUG] No valid animations found in cue namespace.");
      return;
    }

    console.log("[DEBUG] `animations` at start:", animations);

    // ✅ Ensure score pauses when the cueChoice appears
    if (window.isPlaying) {
      console.log('[DEBUG] Pausing score for cue choice.');
      window.isPlaying = false;
      window.isMusicalPause = true;

      window.stopAnimation?.();

      if (window.wsEnabled && window.socket) {
        const msg = JSON.stringify({ type: "pause", playheadX: window.playheadX, elapsedTime: window.elapsedTime });
        window.socket.send(msg);
        console.log(`[DEBUG] Sent pause message to server. Elapsed Time: ${window.elapsedTime}`);
      }
    } else {
      console.warn("[DEBUG] Score was already paused.");
    }

    // ✅ Blur all other elements except the choice grid
    document.body.querySelectorAll(':scope > *').forEach((el) => {
      if (el.id !== 'cue-choice-container' && el.id !== 'controls') {
        el.classList.add('blur-background');
      }
    });

    // ✅ Populate choices dynamically with SVG thumbnails
    animations.forEach(({ choice, dur }) => {
      console.log(`[DEBUG] Loading animation: ${choice} (${dur}s)`);

      const div = document.createElement("div");
      div.classList.add("cue-choice-item");
      div.dataset.choice = choice;
      div.textContent = `${choice} (${dur}s)`;

      const svgThumbnail = document.createElement("object");
      svgThumbnail.type = "image/svg+xml";
      svgThumbnail.data = `scores/pages/${choice}.svg`;
      svgThumbnail.classList.add("cue-choice-thumbnail");

      svgThumbnail.onload = () => {
        console.log(`[DEBUG] Successfully loaded SVG thumbnail: ${choice}`);
      };

      svgThumbnail.onerror = () => {
        console.error(`[ERROR] Failed to load SVG thumbnail: ${choice}`);
      };

      div.appendChild(svgThumbnail);

      div.addEventListener("click", () => {
        console.log(`[DEBUG] Animation ${choice} clicked. Dismissing choice grid.`);
        dismissCueChoice();
        window.handleEnlargeAnimation?.(choice, dur);
      });

      gridContainer.appendChild(div);
    });

    console.log("[DEBUG] cue-choice-container and header restored with new choices.");
  }, 200);
}

/**
 * Helper to extract choices and durations from cue ID format
 * Format: cueChoice_[choice]_dur_[duration]_...
 */
export function parseCueChoiceVariants(cueId) {
  const cueParams = cueId.split('_').slice(2); // Skip 'cueChoice'
  const animations = [];
  let i = 0;

  console.log("[DEBUG] Raw cueParams:", cueParams);

  while (i < cueParams.length) {
    const param = cueParams[i];

    if (!param || param === "dur" || !isNaN(param)) {
      console.warn(`[DEBUG] Skipping invalid param: ${param}`);
      i++;
      continue;
    }

    const file = param;
    let duration = 30;

    if (i + 2 < cueParams.length && cueParams[i + 1] === "dur" && !isNaN(cueParams[i + 2])) {
      duration = parseInt(cueParams[i + 2], 10);
      i += 2;
    }

    animations.push({ choice: file, dur: duration });
    console.log(`[DEBUG] Added animation: ${file} with duration: ${duration}`);
    i++;
  }

  console.log('[DEBUG] Final extracted animations:', animations);
  return animations;
}

/**
 * Dismisses the cue choice grid and restores UI state.
 */
export function dismissCueChoice() {
  console.log("[DEBUG] Dismissing cue choice container.");

  const gridContainer = document.getElementById("cue-choice-container");
  if (gridContainer) {
    gridContainer.classList.add("hidden");
    const choices = gridContainer.querySelectorAll(".cue-choice-item");
    choices.forEach((choice) => choice.remove());
  }

  const header = document.getElementById("cue-choice-header");
  if (header) {
    header.classList.add("hidden");
  }

  // ✅ Remove all background blur classes
  document.body.querySelectorAll(".blur-background").forEach((el) => {
    el.classList.remove("blur-background");
  });

  console.log("[DEBUG] Cue choice dismissed and reset.");
}





export function handleCuePagePlaylist(cueId, expr) {
  // --- Detect mode cleanly
  const outerMatch = expr.match(/^(loop|seq|rand)\(([\s\S]*)\)$/);
  const mode = outerMatch ? outerMatch[1] : "seq";
  let inner = outerMatch ? outerMatch[2] : expr;

  // 🧹 Defensive cleanup: strip unmatched parentheses if any
  const lastParen = inner.lastIndexOf(")");
  if (lastParen === inner.length - 1) {
    inner = inner.slice(0, -1);
  }

  // --- Split only top-level commas (ignore commas inside rand())
  const parts = splitTopLevel(inner, ",");

  const items = parts
    .map(p => parseCueItem(p.trim()))
    .filter(Boolean);

  if (!items.length) {
    console.warn("[cuePage] ⚠️ No valid playlist items parsed:", expr);
    return;
  }

  console.log(`[cuePage] ✅ Parsed playlist items (${mode}):`, items);
  runCuePagePlaylist({ mode, items });
}


/* -----------------------------------------------------------
   Helper: splitTopLevel(str, delimiter)
   Splits by commas but ignores commas inside parentheses
------------------------------------------------------------ */
function splitTopLevel(str, delimiter = ",") {
  const result = [];
  let depth = 0;
  let current = "";

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === delimiter && depth === 0) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

/* -----------------------------------------------------------
   Helper: parseCueItem(str)
   Parses page expressions, e.g.:
   - page3:5
   - rand(page0,page1,page2):2
   - rand(page0:2,page1:4)
------------------------------------------------------------ */
function parseCueItem(str) {
  if (!str) return null;

  // Handle rand(...) group
  if (str.startsWith("rand(")) {
    // Extract inner content and possible duration
    const match = str.match(/^rand\((.*)\)(?::([\d.]+))?$/);
    if (!match) return null;

    const inner = match[1];
    const groupDur = match[2] ? parseFloat(match[2]) : 0;
    const pages = splitTopLevel(inner, ",").map(x => {
      const [page, durStr] = x.split(":").map(s => s.trim());
      const dur = durStr ? parseFloat(durStr) : 0;
      return { page, dur };
    });

    return { rand: pages, dur: groupDur };
  }

  // Handle plain page:dur
  const [page, durStr] = str.split(":").map(s => s.trim());
  const dur = durStr ? parseFloat(durStr) : 0;

  if (!page) {
    console.warn("[cuePage] ⚠️ Invalid entry:", str);
    return null;
  }

  return { page, dur };
}
async function runCuePagePlaylist({ mode, items, waitFlag = false, returnFlag = false }) {
  console.log(`[cuePage] ▶ Starting playlist in mode [${mode}] with ${items.length} items`);

  // --- Global flags
  window.isCuePagePlaylistActive = true;
  window.cuePagePlaylistTimer = null;

  // --- Create or reuse global page state
  if (!window.pageState)
    window.pageState = { mode: "scroll", current: null, next: null, countdown: null };

  const ps = window.pageState;

  // --- Pause scrolling score if active
  if (ps.mode === "scroll") {
    console.log("[cuePage] 🛑 Pausing scrolling score.");
    pauseScrollScore();
    ps.mode = "page";
  }

  let index = 0;
  const total = items.length;




  async function nextStep() {
    // 🧹 Safety check: playlist stopped or popup closed
    if (!window.isCuePagePlaylistActive) {
      console.log("[cuePage] 🛑 Playlist aborted before next step.");
      clearTimeout(window.cuePagePlaylistTimer);
      window.cuePagePlaylistTimer = null;
      return;
    }

    // 🧩 Select current item
    const item = items[index];
    if (!item) {
      console.warn("[cuePage] ⚠️ Missing playlist item, stopping.");
      stopPlaylist();
      return;
    }

    // 🧠 Resolve which page to load
    let nextPage = null;
    let dur = item.dur && item.dur > 0 ? item.dur : 10;

    if (item.page) {
      // normal page
      nextPage = item.page;
    } else if (item.rand && item.rand.length) {
      // random page selection
      const randChoice = item.rand[Math.floor(Math.random() * item.rand.length)];
      if (typeof randChoice === "string") {
        nextPage = randChoice;
      } else if (typeof randChoice === "object" && randChoice.page) {
        nextPage = randChoice.page;
        if (randChoice.dur && !isNaN(randChoice.dur)) dur = randChoice.dur;
      } else {
        console.warn("[cuePage] ⚠️ Invalid rand() entry:", randChoice);
      }
      console.log(`[cuePage] 🎲 Random choice: ${nextPage} (${dur}s)`);
    } else {
      console.warn("[cuePage] ⚠️ Empty playlist entry skipped:", item);
      advanceIndex();
      return nextStep();
    }

    if (!nextPage) {
      console.warn("[cuePage] ⚠️ No valid next page; skipping.");
      advanceIndex();
      return nextStep();
    }

    console.log(`[cuePage] ▶ ${nextPage} (${dur}s) [${mode}]`);
    handleCueTrigger(`cuePage(${nextPage})_dur(${dur})`, false, true);

    advanceIndex();

    // ⏳ Schedule next step unless waiting or stopped
    if (!window.isCuePagePlaylistActive) return;

    if (waitFlag) {
      console.log("[cuePage] ⏸ Waiting indefinitely (wait=1).");
      return; // don't schedule next step
    }

    window.cuePagePlaylistTimer = setTimeout(() => {
      if (window.isCuePagePlaylistActive) nextStep();
      else stopPlaylist();
    }, dur * 1000);
  }


  function advanceIndex() {
    if (mode === "seq") index++;
    else if (mode === "loop") index = (index + 1) % total;
    else if (mode === "rand") index = Math.floor(Math.random() * total);

    // --- If we reached the end of a non-loop sequence
    if (index >= total && mode !== "loop") {
      console.log("[cuePage] ▶ Playlist finished.");
      stopPlaylist();
    }
  }

  function stopPlaylist() {
    clearTimeout(window.cuePagePlaylistTimer);
    window.cuePagePlaylistTimer = null;
    window.isCuePagePlaylistActive = false;

    // --- Resume scrolling if requested
    if (returnFlag) {
      console.log("[cuePage] ✅ Playlist completed — returning to scrolling score.");
      ps.mode = "scroll";
      ps.current = null;
      resumeScrollScore();
    } else {
      console.log("[cuePage] ⏹ Playlist stopped; holding current page.");
      ps.mode = "page";
    }
  }

  // 🚀 Start first step
  nextStep();
}







/**
 * handlePageCue(cueId, animationPath, duration)
 * ---------------------------------------------
 * State-driven single-page cue handler.
 * Supports seamless transitions between pages and controlled return
 * to the scrolling score.
 *
 * Example cues:
 *   cuePage(page0)_dur(20)_mode(page)_next(page1)
 *   cuePage(page1)_dur(10)_mode(page)
 *   cuePage(page2)_dur(15)_mode(popup)_return(1)
 *
 * HTML:
 *   <div id="singlePage-container" class="popup hidden">
 *     <div id="singlePage-content"></div>
 *     <div id="singlePage-countdown"></div>
 *   </div>
 */

export async function handlePageCue(cueId, duration, cueParams = {}) {
  console.log(`[cuePage] Handling page cue: ${cueId}`);

  // Always ensure scrolling score is paused before page mode
  if (window.isPlaying) {
    console.log("[cuePage] 🛑 Pausing scrolling score.");
    pauseScrollScore();
  }

  // 🧹 Stop all active cueText overlays when entering page mode
  document.querySelectorAll('[id^="cueText-"]').forEach(el => el.remove());

  // -------------------------------------------------------------
  // 0️⃣ Parse parameters (self-contained)
  // -------------------------------------------------------------
  let pageName = cueId.match(/cuePage\(([\s\S]+?)\)/)?.[1]?.trim();

  if (pageName) {
    const compact = pageName.replace(/\s+/g, "");
    // 🧩 Detect and guard against single-item loops
    if (compact.startsWith("loop(")) {
      // Normalize whitespace but preserve commas and colons
      const normalized = compact
        .replace(/\s*,\s*/g, ",")  // clean spaces around commas
        .replace(/\s*:\s*/g, ":")  // clean spaces around colons
        .trim();

      // Extract inside of parentheses, even multiline
      const inner = normalized.match(/\(([\s\S]*?)\)\s*$/)?.[1];
      const innerPages = inner
        ?.split(",")
        .map(p => p.trim())
        .filter(p => p.length > 0);

      console.log("[cuePage] 🔍 Parsed inner loop pages:", innerPages);

      if (!innerPages || innerPages.length <= 1) {
        console.warn(
          `[cuePage] ⚠️ Ignoring single-item loop to avoid infinite recursion: ${pageName}`
        );
        return;
      }

      console.log("[cuePage] 🎬 Detected loop expression from pageName:", normalized);
      return handleCuePagePlaylist(cueId, normalized);
    }




    pageName = compact.replace(/\)+$/, "");
  }

  if (!pageName) {
    console.error(`[cuePage] ❌ Invalid or empty page name extracted from: ${cueId}`);
    return;
  }

  const dur = cueId.match(/_dur\(([^)]+)\)/)?.[1];
  const next = cueId.match(/_next\(([^)]+)\)/)?.[1];
  const mode = cueId.match(/_mode\(([^)]+)\)/)?.[1]?.toLowerCase() || "popup";
  const ret = cueId.match(/_return\(([^)]+)\)/)?.[1] === "1";
  const wait = cueId.match(/_wait\(([^)]+)\)/)?.[1] === "1";
  const durationSec = dur ? Number(dur) : duration || 0;


  // -------------------------------------------------------------
  // 1️⃣ Global state
  // -------------------------------------------------------------
  if (!window.pageState) {
    window.pageState = { mode: "scroll", current: null, next: null, countdown: null };
  }
  const ps = window.pageState;

  // -------------------------------------------------------------
  // 2️⃣ Pause scroll if entering page mode
  // -------------------------------------------------------------
  if (ps.mode === "scroll") {
    console.log("[cuePage] → Pausing scrolling score.");
    pauseScrollScore();
  }

  if (ps.mode === "scroll" && mode === "loop") ps.mode = "page";
  ps.mode = "page";
  ps.current = pageName;
  ps.next = next || null;

  // -------------------------------------------------------------
  // 3️⃣ Handle loop/sequence expressions
  // -------------------------------------------------------------
  if (cueParams.choice && cueParams.choice.replace(/\s+/g, "").startsWith("loop(")) {
    console.log("[cuePage] 🎬 Detected loop/sequence expression:", cueParams.choice);
    return handleCuePagePlaylist(cueId, cueParams.choice);
  }

  // -------------------------------------------------------------
  // 4️⃣ Prepare DOM
  // -------------------------------------------------------------
  const container = document.getElementById("singlePage-container");
  const content = document.getElementById("singlePage-content");
  const countdownElement = document.getElementById("singlePage-countdown");
  if (!container || !content || !countdownElement) {
    console.error("[cuePage] Missing DOM container elements.");
    return;
  }

  container.classList.remove("hidden");
  container.style.display = "flex";
  container.style.opacity = "1";
  content.innerHTML = "";


  // -------------------------------------------------------------
  // 4️⃣ Load SVG page (project-first, fallback to shared)
  // -------------------------------------------------------------
  if (cueParams.choice?.trim().startsWith("loop(")) {
    console.log("[cuePage] Detected playlist expression via cueParams.choice");
    return handleCuePagePlaylist(cueId, cueParams.choice);
  }

  if (!window.pagesDir || !window.sharedDir) {
    console.error("[cuePage] ❌ Missing directory globals — run loadProject() first.");
    return;
  }


  const projectPath = `${window.pagesDir}${pageName}.svg`;
  const sharedPath = `${window.sharedDir}pages/${pageName}.svg`;

  async function fetchSvgOrThrow(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status} at ${path}`);
    return res.text();
  }

  let svgText;
  try {
    // 1️⃣ Try project-specific SVG
    svgText = await fetchSvgOrThrow(projectPath);
    console.log(`[cuePage] ✅ Loaded project page: ${projectPath}`);
  } catch (err1) {
    console.warn(`[cuePage] ⚠️ Project page not found (${err1.message}). Trying shared path: ${sharedPath}`);
    try {
      svgText = await fetchSvgOrThrow(sharedPath);
      console.log(`[cuePage] ✅ Loaded shared page: ${sharedPath}`);
    } catch (err2) {
      console.error(`[cuePage] ❌ Failed to load both project and shared pages:
        Project: ${projectPath}
        Shared:  ${sharedPath}
        Error: ${err2.message}`);
      return;
    }
  }

  // -------------------------------------------------------------
  // 5️⃣ Inject SVG and initialize
  // -------------------------------------------------------------
  content.innerHTML = svgText;
  const svg = content.querySelector("svg");
  if (!svg) {
    console.error("[cuePage] ❌ No <svg> in loaded page.");
    return;
  }

  svg.id = "pageSVG";
  svg.classList.add("oscilla-page");
  svg.setAttribute("width", "100vw");
  svg.setAttribute("height", "100vh");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  console.log(`initialising animations in ${pageName}.svg`);
  window.initializeSVG?.(svg);

  if (typeof window.registerSvgGroups === "function") {
    window.registerSvgGroups(svg);
    console.log(`[cuePage] 📦 Registered groups in ${pageName}.svg`);
  }

  if (typeof window.propagate === "function") {
    console.log("[cuePage] ⚙️ Calling propagate() for page SVG");
    window.propagate(svg);
  }

  window.initializeRotatingObjects?.(svg);
  window.initializeScalingObjects?.(svg);
  window.initializePathFollowers?.(svg);
  window.initializeObserver?.(svg);

  console.log(`[cuePage] ✅ Loaded ${pageName}.svg`);
  startPageAnimations(svg);

  // autostart cueText with _autostart(1)
  const autostartCues = svg.querySelectorAll('[id^="cueText"][id*="_autostart(1)"]');
  autostartCues.forEach(el => {
    const cueExpr = el.id;
    console.log("[page] ▶ Auto-starting cue:", cueExpr);
    handleCueTrigger(cueExpr);
  });

  if (window.triggeredCues instanceof Set) {
    console.log("[cuePage] 🔄 Resetting triggeredCues for new page");
    window.triggeredCues.clear();
  }

  window._activePageButtons?.forEach(btn => btn._destroyCueButton?.());
  window._activePageButtons = assignCueButtonsIn(svg, container);

  window._currentPageSvg = svg;






  // 🟢 Auto-inject globally registered UI groups on page load
  if (window.groupRegistry) {
    const defaultGroups = ["mainMenu"]; // you can list others here later

    for (const groupId of defaultGroups) {
      if (window.groupRegistry[groupId]) {
        console.log(`[cueGroup] 🚀 Auto-injecting group "${groupId}" on page load`);
        try {
          handleGroupCue(`cueGroup(${groupId})`, { choice: groupId });
        } catch (err) {
          console.warn(`[cueGroup] ⚠️ Auto-inject failed for "${groupId}":`, err);
        }
      }
    }
  }

  // -------------------------------------------------------------
  // 6️⃣ Countdown and transition logic
  // -------------------------------------------------------------

  // For sequenced or loop pages, we’ll return a promise that resolves
  // when this countdown finishes.
  let pageDoneResolve = null;
  let pageDonePromise = null;
  if (cueParams?.suppressTransition || cueParams?.fromLoop) {
    pageDonePromise = new Promise((res) => (pageDoneResolve = res));
  }

  // Stop any old countdown immediately when starting a new page
  if (ps.countdown) {
    clearInterval(ps.countdown);
    ps.countdown = null;
  }

  countdownElement.style.display = "block";

  if (wait || !durationSec || durationSec <= 0) {
    countdownElement.style.display = "none";

    // countdownElement.textContent = "▶"; // visually indicate "ready / play"
    // countdownElement.style.opacity = "0.7";
    console.log("[cuePage] ⏸ No duration set — showing pause symbol.");
  } else {
    countdownElement.style.opacity = "1";
    countdownElement.textContent = durationSec;
  }

  if (!wait && durationSec > 0) {
    let timeLeft = durationSec;
    ps.countdown = setInterval(() => {
      timeLeft -= 1;
      countdownElement.textContent = timeLeft;

      if (timeLeft <= 0) {
        clearInterval(ps.countdown);
        ps.countdown = null;

        // ✅ For sequenced/looped pages: finish without transition
        if (cueParams?.suppressTransition || cueParams?.fromLoop) {
          console.log("[cuePage] ✅ Page countdown finished (sequenced) — returning control.");
          if (pageDoneResolve) pageDoneResolve();
          return;
        }

        // Normal single-page behaviour
        resolvePageTransition({ mode, next, ret });
      }
    }, 1000);
  } else {
    console.log("[cuePage] Waiting indefinitely for user trigger or external event.");
  }

  // If part of a sequence or loop, return the promise so driver can await
  return pageDonePromise;


}




/**
 * --------------------------------------------------------------------------
 * handlePageCueFromAST(ast)
 * --------------------------------------------------------------------------
 * Executes a parsed cue:page() sequence that was produced by the Chevrotain
 * CueDSL parser (see parser.js → parseCueToAST()).
 *
 * 🔹 ENTRY POINT:
 * Called from parseCueParams() or handleCueTrigger() when a cue string uses
 * the new DSL syntax:
 *
 *   cue:page(seq: page1:4,
 *                 loop(page1:3,page2:2){x:2},
 *                 rand(page1:2,page2:2,page3:2){x:4},
 *                 choose(page2,page3):3,
 *                 mode:scroll)
 *
 * The parser converts this DSL into an AST of form:
 *   { type: "cuePage", args: [ {type:"page"}, {type:"loop"}, {type:"rand"}, … ] }
 *
 * 🔹 FUNCTION FLOW:
 * 1.  Filters the AST into playbackItems (page/loop/choose/rand) and
 *     controlItems (e.g. mode:scroll).
 *
 * 2.  Sequentially iterates over playbackItems:
 *       - page  → directly loads a single page for its duration.
 *       - choose → randomly picks one from a list.
 *       - rand   → runs N random selections of its inner pages.
 *       - loop   → repeats its page sequence x times.
 *     Each call delegates to handlePageCue(), which loads the SVG page,
 *     displays its countdown, and resolves when the page finishes.
 *
 * 3.  After all playback items complete, processes controlItems:
 *       - e.g. {type:"control", name:"mode", value:"scroll"}
 *         triggers handleCueTrigger('cueNav(mode(scroll))'),
 *         switching back to scrolling-score mode.
 *
 * 4.  Finally logs completion and clears window._cuePageRunning so that
 *     isCancelled() checks work for any subsequent cues.
 *
 * 🔹 EXIT POINT:
 * When this function resolves, all cuePage sub-pages and transitions have
 * finished and control has been returned to the main score transport.
 */

export async function handlePageCueFromAST(ast) {
  const commonParams = { suppressTransition: true };

  if (!ast || !ast.args || !Array.isArray(ast.args)) {
    console.warn("[CueDSL] ⚠️ Invalid or empty AST passed to handlePageCueFromAST:", ast);
    return;
  }

  console.log("[CueDSL] 🚀 Handling cue:page AST", ast);

  const playbackItems = ast.args.filter(a => ["page", "loop", "choose", "rand"].includes(a.type));
  const controlItems = ast.args.filter(a => a.type === "control");

  const wait = ms => new Promise(r => setTimeout(r, ms));

  // Helper to check for interruption (optional, for safety)

  //  (only cancel mid-sequence, not before start)
  const isCancelled = () =>
    window._cuePageRunning && window.pageState?.mode === "scroll";

  // 1️⃣ Sequentially process all playback items
  for (const item of playbackItems) {
    if (isCancelled()) {
      console.log("[CueDSL] ⏹️ Sequence stopped due to mode change.");
      return;
    }

    // --- Simple page ---
    if (item.type === "page") {
      const cue = `cuePage(${item.name})_dur(${item.dur || 0})`;
      console.log(`[CueDSL] ▶ Page → ${cue}`);
      await handlePageCue(cue, item.dur, commonParams);
      // if (item.dur && item.dur > 0) await wait(item.dur * 1000);
    }

    // --- Random choice ---
    else if (item.type === "choose") {
      const pick = item.options[Math.floor(Math.random() * item.options.length)];
      const cue = `cuePage(${pick})_dur(${item.dur || 0})`;
      console.log(`[CueDSL] 🎲 Randomly chosen page: ${pick}`);
      await handlePageCue(cue, item.dur, commonParams);

      // if (item.dur && item.dur > 0) await wait(item.dur * 1000);
    }
    // --- Randomized sequence: rand(page1:...,page2:...){x:N} ---
    else if (item.type === "rand") {
      console.log(`[CueDSL] 🎲 Random sequence (${item.repeat || 1}x)`);

      const repeatCount = item.repeat || 1;
      for (let i = 0; i < repeatCount; i++) {
        // choose a random page each time
        const pick = item.pages[Math.floor(Math.random() * item.pages.length)];
        const cue = `cuePage(${pick.name})_dur(${pick.dur || 0})`;
        console.log(`[CueDSL] 🔀 Random pick ${i + 1}/${repeatCount} → ${cue}`);

        // trigger and await the page
        await handlePageCue(cue, pick.dur, { fromLoop: true, suppressTransition: true });
      }
    }


    // --- Loop block ---
    else if (item.type === "loop") {
      console.log(`[CueDSL] 🔁 Looping sequence x${item.repeat || 1}`);
      const repeatCount = item.repeat || 1;
      for (let i = 0; i < repeatCount; i++) {
        console.log(`[CueDSL] 🔁 Loop iteration ${i + 1}/${repeatCount}`);
        for (const pg of item.pages) {
          if (isCancelled()) return console.log("[CueDSL] ⏹️ Interrupted during loop.");
          const cue = `cuePage(${pg.name})_dur(${pg.dur || 0})`;
          console.log(`[CueDSL] ↻ Loop page → ${cue}`);

          // 🟢 Wait for this page’s own countdown to finish (promise from handlePageCue)
          await handlePageCue(cue, pg.dur, { fromLoop: true, suppressTransition: true });
        }
      }
    }

  }

  // 2️⃣ Now process control items (after playback)
  for (const ctrl of controlItems) {
    if (ctrl.name === "mode") {
      if (ctrl.value === "scroll" && ctrl.target) {
        console.log(`[CueDSL] ⚙️ Exiting to scroll mode at rehearsal mark: ${ctrl.target}`);
        handleCueTrigger(`cueNav(mode(scroll))`);
        jumpToRehearsalMark(ctrl.target); // new targeted navigation
        startPlayback();
      } else {
        console.log(`[CueDSL] ⚙️ Switching mode → ${ctrl.value}`);
        handleCueTrigger(`cueNav(mode(${ctrl.value}))`);
      }
    }

    else {
      console.warn(`[CueDSL] ⚠️ Unknown control:`, ctrl);
    }
  }

  console.log("[CueDSL] ✅ cuePage sequence finished or stopped.");
}














// -------------------------------------------------------------
// 🚀 Kick all animations inside a standalone page SVG
// -------------------------------------------------------------
function startPageAnimations(svg) {
  console.log("[cuePage] 🚀 startPageAnimations()");
  const prevDisable = window.disableObserver;
  window.disableObserver = true;

  try {
    window.initializeObjectPathPairs?.(svg);
    window.initializeRotatingObjects?.(svg);
    window.initializeScalingObjects?.(svg);
    window.detectExistingAnimations?.();
    window.startAllVisibleAnimations?.();

    if (typeof window.startRotation === "function") {
      svg.querySelectorAll('[id*="_rotate_"], [id^="obj_rotate_"]').forEach(el => {
        try { window.startRotation(el); } catch (_) { }
      });
    }
    if (typeof window.startScale === "function") {
      svg.querySelectorAll('[id^="s_"]').forEach(el => {
        try { window.startScale(el); } catch (_) { }
      });
    }

    console.log("[cuePage] ✅ Page animations started (observer disabled).");
  } finally {
    // keep observers disabled during page mode
    // window.disableObserver = prevDisable ?? false;
  }
}



export function resolvePageTransition(opts = {}) {
  const { mode, next, ret } = opts;
  console.log(
    "[resolvePageTransition]",
    "called with:",
    JSON.stringify({ mode, next, ret }),
    "pageState:", window.pageState
  );

  const ps = window.pageState;
  const container = document.getElementById("singlePage-container");
  const content = document.getElementById("singlePage-content");
  const countdown = document.getElementById("singlePage-countdown");
  const mainScore = document.getElementById("scoreContainer");

  console.log(`[resolvePageTransition] mode=${mode}, ps.mode=${ps.mode}, next=${next}`);


  if (!ps) return;
  clearInterval(ps.countdown);
  if (countdown) countdown.style.display = "none";

  // -------------------------------------------------------------
  // 1️⃣ Case: chain to next page (_next or loop)
  // -------------------------------------------------------------
  if (next) {
    console.log(`[cuePage] ⏭ Transitioning directly to next page: ${next}`);

    // If we're looping, skip fades entirely for immediate cut
    if (mode === "loop") {
      console.log("[cuePage] 🔁 Loop mode — cutting directly to next page.");
      ps.mode = "page";
      window._activePageButtons?.forEach(btn => btn._destroyCueButton?.());
      window._activePageButtons = [];
      content.innerHTML = "";
      handleCueTrigger(`cuePage(${next})`);
      return;
    }

    // Otherwise, do a fade transition
    ps.mode = "transition";
    container.style.transition = "opacity 0.5s ease";
    container.style.opacity = "0";

    // 🧩 Keep background hidden during transition
    if (mainScore) {
      mainScore.style.opacity = "0";
      mainScore.style.pointerEvents = "none";
    }

    setTimeout(() => {
      ps.mode = "page";

      // 🧹 Clean up and load next
      window._activePageButtons?.forEach(btn => btn._destroyCueButton?.());
      window._activePageButtons = [];
      content.innerHTML = "";
      handleCueTrigger(`cuePage(${next})`);
    }, 500);
    return;
  }

  // -------------------------------------------------------------
  // 2️⃣ Case: return to scrolling score (_return or popup)
  // -------------------------------------------------------------
  if (!window.isCuePagePlaylistActive && (ret || mode === "popup")) {
    console.log("[cuePage] ✅ Returning to scrolling score.");
    container.style.transition = "opacity 0.5s ease";
    container.style.opacity = "0";

    setTimeout(() => {
      window._activePageButtons?.forEach(btn => btn._destroyCueButton?.());
      window._activePageButtons = [];
      container.style.display = "none";
      content.innerHTML = "";
      ps.mode = "scroll";
      ps.current = null;

      // 🟢 Fade background back in
      if (mainScore) {
        mainScore.style.opacity = "1";
        mainScore.style.pointerEvents = "auto";
      }

      resumeScrollScore();
    }, 500);
    return;
  }

  // -------------------------------------------------------------
  // 3️⃣ Case: persistent page mode
  // -------------------------------------------------------------
  console.log("[cuePage] Holding page mode.");
  ps.mode = "page";
}


/**
 * pauseScrollScore() / resumeScrollScore()
 * ----------------------------------------
 * Encapsulate your pause/resume logic.
 */
function pauseScrollScore() {
  window.isPlaying = false;
  window.isMusicalPause = true;
  window.stopAnimation?.();

  const socket = window.socket;
  if (window.wsEnabled && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "pause",
        playheadX: window.playheadX,
        elapsedTime: window.elapsedTime,
      })
    );
  }
}
function resumeScrollScore() {
  console.log("[cuePage] ▶ Resuming scrolling score...");

  window.ignoreNextSync = true;
  window.isPlaying = true;
  window.isMusicalPause = false;

  // ✅ Restore playhead and resume instead of reinitializing
  if (typeof window.resumePlayback === "function") {
    window.resumePlayback();
  } else if (typeof window.startPlayback === "function") {
    // Fallback if resume not found
    window.startPlayback();
  }

  // ✅ Resume stopwatch
  window.startStopwatch?.();

  window.lastSyncTime = performance.now();
  window.lastElapsedTime = window.elapsedTime ?? 0;

  const socket = window.socket;
  if (window.wsEnabled && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "play",
      playheadX: window.playheadX,
      elapsedTime: window.elapsedTime,
    }));
  }

  console.log("[cuePage] ▶ Scroll resume complete.");
}



/**
 * handleOscCue(cueId, cueParams = {})
 *
 * Sends OSC messages from cue IDs of the form cueOsc*, supporting the following subtypes:
 *
 * Supported Types:
 *   - cueOscTrigger(value) → Sends a single numeric trigger
 *   - cueOscValue(value)   → Sends a named value
 *   - cueOscSet(key, value) → Sends a key-value object
 *   - cueOscRandom(min, max) → Sends a min/max pair for random value generation
 *   - cueOscBurst(count, interval) → Sends repeated messages over time
 *   - cueOscPulse(rate, duration) → Sends messages at a rate for a fixed time
 *
 * Optional OSC Address Override:
 *   Append `_addr(custom/osc/path)` to override the default path.
 *
 * Example:
 *   cueOscTrigger(1)_addr(/my/osc/path)
 */
export function handleOscCue(cueId, cueParams = {}) {
  const type = cueId.split('(')[0]; // e.g., cueOscTrigger
  const subType = type.replace(/^cueOsc/, "").toLowerCase(); // "trigger", "burst", etc.

  // 🔍 Extract optional OSC address override
  const addrMatch = cueId.match(/_addr\\(([^)]+)\\)/);
  const oscAddr = addrMatch ? addrMatch[1] : "/oscilla";

  const baseMessage = {
    type: "osc",
    subType,
    address: oscAddr,
    timestamp: Date.now()
  };

  console.log(`[cueOsc] ⚡ Handling subtype: ${subType} → ${oscAddr}`);

  switch (subType) {
    case "trigger":
    case "value": {
      const value = parseFloat(cueParams.choice ?? cueParams.value);
      if (isNaN(value)) {
        console.warn("[cueOsc] ❌ Missing or invalid value:", cueId);
        return;
      }
      baseMessage.data = value;
      window.socket?.send(JSON.stringify(baseMessage));
      console.log(`[cueOsc] 🔹 Sent value: ${value}`);
      break;
    }

    case "set": {
      const [key, val] = Object.entries(cueParams)[0] || [];
      if (!key || val === undefined) {
        console.warn("[cueOsc] ❌ Invalid set params:", cueParams);
        return;
      }
      baseMessage.data = { [key]: val };
      window.socket?.send(JSON.stringify(baseMessage));
      console.log(`[cueOsc] 🔹 Sent set: ${key} = ${val}`);
      break;
    }

    case "random": {
      const min = parseFloat(cueParams.min);
      const max = parseFloat(cueParams.max);
      if (isNaN(min) || isNaN(max)) {
        console.warn("[cueOsc] ❌ Invalid random range:", cueParams);
        return;
      }
      baseMessage.data = { min, max };
      window.socket?.send(JSON.stringify(baseMessage));
      console.log(`[cueOsc] 🔹 Sent random range: min=${min}, max=${max}`);
      break;
    }

    case "burst": {
      const count = parseInt(cueParams.count ?? cueParams.choice);
      const interval = parseInt(cueParams.interval ?? 100);
      if (!count || isNaN(interval)) {
        console.warn("[cueOsc] ❌ Invalid burst params:", cueParams);
        return;
      }
      console.log(`[cueOsc] 🔁 Sending burst: ${count} messages every ${interval}ms`);
      let sent = 0;
      const burstTimer = setInterval(() => {
        if (sent >= count) return clearInterval(burstTimer);
        window.socket?.send(JSON.stringify({ ...baseMessage }));
        sent++;
      }, interval);
      break;
    }

    case "pulse": {
      const rate = parseFloat(cueParams.rate);
      const duration = parseFloat(cueParams.duration);
      if (!rate || !duration) {
        console.warn("[cueOsc] ❌ Invalid pulse params:", cueParams);
        return;
      }
      const interval = 1000 / rate;
      const total = Math.floor(duration * rate);
      let sent = 0;
      console.log(`[cueOsc] 🌀 Sending pulse: ${total} messages at ${rate}Hz for ${duration}s`);
      const pulseTimer = setInterval(() => {
        if (sent >= total) return clearInterval(pulseTimer);
        window.socket?.send(JSON.stringify({ ...baseMessage }));
        sent++;
      }, interval);
      break;
    }

    default:
      console.warn("[cueOsc] ⚠️ Unsupported subType:", subType);
      break;
  }
}













/**
 * handleMediaCue(cueId, cueParams)
 *
 * Displays a timed media popup for one or more files (SVG, image, or video).
 * Supports optional shuffling, looping, or randomized selection.
 * Automatically pauses score playback and resumes after timeout or manual dismissal.
 *
 * Supported cue parameters:
 *   - choice: comma-separated media filenames (e.g. image1.jpg,image2.mp4)
 *   - dur: total display time (in seconds)
 *   - interval: per-item duration (in seconds); if omitted, uses dur / N
 *   - shuffle: show all items once in random order
 *   - random: pick random item repeatedly for full duration
 *   - loop: cycle through items repeatedly until duration ends
 *
 * Example cue ID:
 *   cueMedia(image1.svg,image2.jpg)_dur(10)_shuffle(1)_interval(3)
 *
 * DOM requirements:
 *   - #media-popup (container for overlay)
 *   - #media-content (content region inside popup)
 *
 * © 2025 Rob Canning | GPLv3
 */

// 📼 Media cue queue
const mediaCueQueue = [];
let isMediaPopupActive = false;

export function handleMediaCue(cueId, cueParams) {
  const rawFiles = cueParams.choice || cueParams.file;
  const totalDuration = parseFloat(cueParams.dur || 10) * 1000;
  const interval = parseFloat(cueParams.interval || 0);
  const shuffle = cueParams.shuffle == 1;
  const random = cueParams.random == 1;
  const loop = cueParams.loop == 1;

  if (!rawFiles) return console.warn("[cueMedia] No file(s) provided in cue:", cueId);
  const files = rawFiles.split(',').map(f => f.trim()).filter(Boolean);
  if (files.length === 0) return console.warn("[cueMedia] Empty media list:", cueId);

  const popup = document.getElementById('media-popup');
  const content = document.getElementById('media-content');
  if (!popup || !content) return console.error('[cueMedia] Required DOM elements missing.');

  if (window.isPlaying) {
    window.isPlaying = false;
    window.isMusicalPause = true;

    window.animationPaused = true;
    window.stopAnimation?.();
  }

  popup.classList.remove('hidden');
  content.innerHTML = '';

  const pickRandom = () => files[Math.floor(Math.random() * files.length)];
  const shuffled = shuffle ? [...files].sort(() => Math.random() - 0.5) : files;
  const displayTime = interval > 0 ? interval * 1000 : Math.floor(totalDuration / files.length);
  const queue = random ? null : loop ? [...shuffled] : shuffled.slice();

  let elapsed = 0;

  function playNext() {
    if (elapsed >= totalDuration) return dismiss();

    let file = random ? pickRandom() : queue.shift();
    if (!file) {
      if (loop) {
        queue.push(...shuffled);
        file = queue.shift();
      } else {
        return dismiss();
      }
    }

    renderMedia(file);
    elapsed += displayTime;
    setTimeout(playNext, displayTime);
  }

  function renderMedia(file) {
    const ext = file.split('.').pop().toLowerCase();
    content.innerHTML = '';
    let el;

    if (ext === 'svg') {
      el = document.createElement('object');
      el.type = 'image/svg+xml';
      el.data = `media/${file}`;
    } else if (['mp4', 'webm', 'ogg'].includes(ext)) {
      el = document.createElement('video');
      el.src = `media/${file}`;
      el.controls = true;
      el.autoplay = true;
      el.style.width = '100%';
      el.onended = () => setTimeout(playNext, 500);
    } else {
      el = document.createElement('img');
      el.src = `media/${file}`;
      el.style.maxWidth = '100%';
    }

    content.appendChild(el);
  }

  function dismiss() {
    popup.classList.add('hidden');
    content.innerHTML = '';
    if (!window.isPlaying && window.animationPaused) {
      window.isPlaying = true;
      window.animationPaused = false;
      window.startAnimation?.();
    }
  }

  popup.onclick = (e) => {
    if (e.target === popup) dismiss();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') dismiss();
  }, { once: true });

  playNext();
}



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
export function sendOSC(address, args) {
  console.log(`[OSC] → ${address}`, args);
}

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

export async function handleAudioCue(cueId, cueParams = {}) {
  try {
    // --- Shared AudioContext ---
    const ctx =
      window.sharedAudioCtx ||
      (window.sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === "suspended") await ctx.resume();

    // --- Extract filename + params ---
    const choice = cueParams.choice || cueId.match(/\(([^)]+)\)/)?.[1];
    if (!choice) return console.warn("[AUDIO] No filename in cueAudio()");


    const filenameBase = cueParams.choice?.replace(/['"]/g, "") || "";
    const filename = filenameBase.endsWith(".wav") ? filenameBase : `${filenameBase}.wav`;

    // 🔊 Load audio from project audio folder first, then fall back to shared/audio.
    // Uses `${window.audioDir}` and `${window.sharedDir}audio/` for consistent path resolution.
    const projectPath = resolveProjectPath("audio", filename);
    const sharedPath = `${window.sharedDir}audio/${filename}`;

    let url;
    try {
      const res = await fetch(projectPath, { method: "HEAD" });
      if (res.ok) {
        url = projectPath;
        console.log(`[cueAudio] ✅ Using project audio: ${url}`);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      console.warn(`[cueAudio] ⚠️ Project audio not found, trying shared: ${sharedPath}`);
      url = sharedPath;
    }


    const amp = cueParams.amp ?? 1;
    const fadeInMs = cueParams.fadeIn ?? 0;

    // --- Load / decode ---
    const res = await fetch(url);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());

    // --- Create source + gain ---
    const src = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    src.buffer = buf;
    src.connect(gainNode).connect(ctx.destination);

    // --- Fade-in ---
    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(amp, now + fadeInMs / 1000);

    // --- Start + register ---
    src.start();
    window.activeAudioCues = window.activeAudioCues || new Set();
    const voice = { src, gainNode, filename };
    window.activeAudioCues.add(voice);

    console.log(`[AUDIO] ▶️ Playing ${filename}`);

    // --- UI + OSC start ---
    window.dispatchEvent(new CustomEvent("oscilla:audio", { detail: { file: filename, state: "play" } }));
    if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
      const msg = {
        type: "osc_audio_trigger",
        filename,
        volume: amp,
        loop: 0,
        timestamp: Date.now(),
      };
      console.log("[STEP 10] Sending OSC message:", msg);
      window.socket.send(JSON.stringify(msg));
    }

    // --- When finished ---
    src.onended = () => {
      window.activeAudioCues.delete(voice);
      window.dispatchEvent(new CustomEvent("oscilla:audio", { detail: { file: filename, state: "stop" } }));
    };
  } catch (err) {
    console.error("[AUDIO] ❌ handleAudioCue error:", err);
  } finally {
    triggeredCues?.clear?.();
    window._cueInsideState?.clear?.();
  }
}


// ========================================================
// 🛑 Stop / fade-out by filename (all instances)
// ========================================================
export function stopAllAudio(filename, fadeOutSec = 1.5) {
  const ctx = sharedAudioCtx;
  const now = ctx.currentTime;

  for (const [id, entry] of activeAudioCues.entries()) {
    if (entry.filename !== filename) continue;

    const { source, gainNode } = entry;
    const current = gainNode.gain.value;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(current, now);
    gainNode.gain.linearRampToValueAtTime(0, now + fadeOutSec);

    setTimeout(() => {
      try { source.stop(); } catch { }
      activeAudioCues.delete(id);

      const ev = new CustomEvent("oscilla:audio", {
        detail: { file: filename, state: "stop" },
      });
      window.dispatchEvent(ev);
      sendAudioOscTrigger({
        cueId: `cueAudioStop(${filename})`,
        filename,
        volume: 0,
        loop: 0,
      });
      console.log(`[AUDIO] ✅ Stopped ${filename} (${id})`);
    }, fadeOutSec * 1000);
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
document.getElementById("stop-audio-button").addEventListener("click", async () => {
  console.log("[AUDIO] 🔇 Hard audio stop triggered");

  const ctx = window.sharedAudioCtx;
  const active = window.activeAudioCues;

  if (!ctx || !active || active.size === 0) {
    console.warn("[AUDIO] ⚠️ No active Web Audio cues to stop.");
    return;
  }

  const now = ctx.currentTime;
  for (const voice of Array.from(active)) {
    const { src, gainNode, filename } = voice;
    try {
      // --- Smooth 100 ms fade-out ---
      if (gainNode) {
        gainNode.gain.cancelScheduledValues(now);
        const current = gainNode.gain.value;
        gainNode.gain.setValueAtTime(current, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.1);
      }
      src.stop(now + 0.1);

      // --- UI + cue cleanup ---
      window.dispatchEvent(new CustomEvent("oscilla:audio", { detail: { file: filename, state: "stop" } }));
      window.emitCueComplete?.(filename, "cueAudio");
      window.resetCueTrigger?.(filename);
      console.log(`[AUDIO] 🔻 Stopped ${filename}`);
    } catch (err) {
      console.warn(`[AUDIO] ❌ Error stopping ${filename}:`, err);
    }
    active.delete(voice);
  }

  // --- OSC broadcast: stopAll ---
  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    const msg = { type: "osc_audio_stopAll", timestamp: Date.now() };
    window.socket.send(JSON.stringify(msg));
    console.log("[STEP 10] Sent OSC stopAll:", msg);
  }

  console.log("[AUDIO] ✅ All Web Audio cues cleared.");
});







// import anime from "animejs";

/**
 * handleTextCue(cueParams)
 * ------------------------
 * Displays timed text as an HTML overlay above the SVG score.
 */
export async function handleTextCue(cueId, cueParams = {}) {
  console.log("[handleTextCue] called:", cueId, cueParams);


  // Support old (single-param) style just in case
  if (typeof cueId === "object" && !cueParams.choice) {
    cueParams = cueId;
  }

  try {
    const clean = v => (typeof v === "string" ? v.replace(/^"|"$/g, "") : v);

    // Unescape any backslash-escaped quotes from SVG IDs
    if (typeof cueParams.choice === "string") {
      cueParams.choice = cueParams.choice.replace(/\\"/g, '"');
    }

    const {
      choice,
      speed = 1,
      deviation = 0,
      anim = "fade",
      loop = 1,
      next = null,
      pos = "center",
      style = {},
    } = Object.fromEntries(Object.entries(cueParams).map(([k, v]) => [k, clean(v)]));


    // --------------------------------------------------------
    // 🧱 CREATE / REUSE CONTAINER — now unique per cueId
    let container = document.getElementById(`cueText-${cueId}`);

    // 🧩 ensure valid node regardless of weird cueId formatting
    if (!(container instanceof HTMLElement)) {
      container = document.createElement("div");
      try {
        container.id = `cueText-${cueId}`;
      } catch {
        // fallback if cueId has invalid characters
        container.id = "cueText-temp";
      }

      const ps = window.pageState || {};
      const pageContainer = document.getElementById("singlePage-content");
      const inPageMode =
        (ps.mode === "page" || ps.mode === "playlist") &&
        pageContainer &&
        window.getComputedStyle(pageContainer).display !== "none";

      if (inPageMode && pageContainer instanceof HTMLElement) {
        pageContainer.appendChild(container);
      } else {
        document.body.appendChild(container);
      }
    }


    Object.assign(container.style, {
      position: "absolute",
      zIndex: 10000000,
      pointerEvents: "none",
      color: style.color || "black",
      fontFamily: style.font || "sans-serif",
      fontSize: (style.fontsize ? `${style.fontsize}px` : "32px"),
      textAlign: style.align || "center",
      textShadow: style.textshadow || "0 0 10px rgba(0,0,0,0.6)",
      transition: "opacity 0.3s ease",
      opacity: 1,
      background: style.bg || "transparent",
      padding: style.padding !== undefined ? `${Number(style.padding)}px` : "10px",
      borderRadius: style.radius !== undefined ? `${Number(style.radius)}px` : "8px",
      backdropFilter: style.blur ? `blur(${Number(style.blur)}px)` : "none",
    });


    // --------------------------------------------------------
    // 🎯 POSITION HANDLING (preset, coordinates, or SVG anchor)
    // --------------------------------------------------------
    const posVal = (pos || "").toString().trim();

    // 1️⃣ default: center
    let left = "50%";
    let top = "50%";
    let transform = "translate(-50%, -50%)";

    // 2️⃣ if it matches an SVG element ID, anchor to that element
    if (posVal && !["center", "top", "bottom", "left", "right"].includes(posVal.toLowerCase()) && !posVal.includes(",")) {
      const target = document.getElementById(posVal);
      if (target) {
        const svg = target.closest("svg");
        if (svg) {
          const rect = target.getBoundingClientRect();
          const svgRect = svg.getBoundingClientRect();

          // calculate center of the target element in screen coords
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;

          left = `${cx}px`;
          top = `${cy}px`;
          transform = "translate(-50%, -50%)";

          console.log(`[cueText] 🧭 Anchored to element #${posVal} at (${cx}, ${cy})`);
        }
      }
    }

    // 3️⃣ named presets
    else {
      const posLower = posVal.toLowerCase();
      if (posLower === "top") top = "10%";
      else if (posLower === "bottom") top = "90%";
      else if (posLower === "left") { left = "10%"; transform = "translate(0, -50%)"; }
      else if (posLower === "right") { left = "90%"; transform = "translate(-100%, -50%)"; }
      else if (posLower.includes(",")) {
        const [x, y] = posLower.split(",").map(s => s.trim());
        left = x.endsWith("%") ? x : `${x}px`;
        top = y.endsWith("%") ? y : `${y}px`;
      }
    }

    // apply computed styles
    Object.assign(container.style, { left, top, transform });


    // --------------------------------------------------------
    // 🧾 PARSE SOURCE (file, inline, or words[...])
    // --------------------------------------------------------
    let entries = [];
    if (Array.isArray(choice)) {
      entries = choice.map(t => ({ text: t, dur: null }));
    }


    // 🔍 Load text from project texts folder first, then fall back to shared/texts.
    // Uses `${window.textDir}` and `${window.sharedDir}texts/` for consistent path resolution.

    else if (typeof choice === "string" && choice.endsWith(".txt")) {
      // Prefer resolveProjectPath for consistency with cuePage and cueAudio
      const projectPath = resolveProjectPath("text", choice);
      const sharedPath = `${window.sharedDir}texts/${choice}`;

      let res, text;
      try {
        res = await fetch(projectPath);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        text = await res.text();
        console.log(`[cueText] ✅ Loaded text from project: ${projectPath}`);
      } catch (err1) {
        console.warn(`[cueText] ⚠️ Project text not found, trying shared: ${sharedPath}`);
        try {
          res = await fetch(sharedPath);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          text = await res.text();
          console.log(`[cueText] ✅ Loaded text from shared: ${sharedPath}`);
        } catch (err2) {
          console.error(`[cueText] ❌ Failed to load both project and shared text files:
            Project: ${projectPath}
            Shared:  ${sharedPath}
            Error: ${err2.message}`);
          return;
        }
      }

      entries = text.split(/\r?\n/).filter(Boolean).map(line => ({ text: line, dur: null }));
    }

    // 🧩 Handle inline word lists like words["a","b","c"] or single-line text strings.
    // Parses embedded word arrays into entries or wraps plain strings as single entries.
    // Ensures cueText supports both structured and literal inline text definitions.

    else if (typeof choice === "string" && choice.includes("words[")) {
      console.log("[cueText DEBUG] raw choice:", choice);
      console.log("[cueText DEBUG] typeof choice:", typeof choice);
      console.log("[cueText DEBUG] choice literal chars:", Array.from(choice).join("|"));
      entries = parseWordsSource(choice.trim());
    }
    else if (typeof choice === "string") {
      entries = [{ text: choice, dur: null }];
    }

    console.log("[cueText] parsed entries:", entries);

    if (!entries.length) {
      console.warn("[cueText] No text content found.");
      return;
    }

    // --------------------------------------------------------
    // 🎲 RANDOMIZE ORDER if requested (_random(1))
    // --------------------------------------------------------
    if (cueParams.random && Array.isArray(entries) && entries.length > 1) {
      console.log("[cueText] 🎲 Randomizing line order");
      entries.sort(() => Math.random() - 0.5);
    }

    // --------------------------------------------------------
    // ⏱️ COMPUTE DURATIONS
    // --------------------------------------------------------
    const baseDur = 1 / speed;
    const avgLen = entries.reduce((a, b) => a + b.text.length, 0) / entries.length;

    // uniform _dur from cue parameters (seconds per word)
    const uniformDur = cueParams.dur ? Number(cueParams.dur) : null;

    entries.forEach(e => {
      if (uniformDur) {
        e.dur = uniformDur;
      } else if (e.dur) {
        // keep explicit per-word duration
        return;
      } else {
        // default: length-weighted based on speed
        const lenFactor = e.text.length / avgLen;
        const weight = 1 + (lenFactor - 1) * deviation;
        e.dur = baseDur * weight;
      }
    });


    // --------------------------------------------------------
    // 🎬 ANIMATION LOOP
    // --------------------------------------------------------
    let loopCount = 0;
    let running = true;

    while (running) {
      for (let i = 0; i < entries.length; i++) {
        const { text, dur } = entries[i];
        const ms = dur * 1000;

        // 💤 handle rests
        if (text === "rest" || text === "r") {
          container.textContent = "";
          await delay(ms);
          continue;
        }

        // 🎭 ANIMATION MODES
        if (anim === "fade") {
          // total cycle = dur exactly
          const fadeTime = Math.min(ms * 0.25, 400); // fade in/out = 25% each, max 400 ms
          const holdTime = Math.max(0, ms - 2 * fadeTime);

          container.style.opacity = 0;
          container.textContent = text;

          // fade in
          await anime({
            targets: container,
            opacity: [0, 1],
            duration: fadeTime,
            easing: "easeOutQuad"
          }).finished;

          // hold visible
          await delay(holdTime);

          // fade out
          await anime({
            targets: container,
            opacity: [1, 0],
            duration: fadeTime,
            easing: "easeInQuad"
          }).finished;
        }

        else if (anim === "typewriter") {
          // ensure full text renders exactly within dur
          const perChar = ms / text.length;
          container.textContent = "";

          for (let j = 0; j < text.length; j++) {
            container.textContent += text[j];
            await delay(perChar);
          }

          // small pause before next word (so total ≈ dur)
          // optional: await delay(perChar * 2);
        }

        else {
          // plain
          container.textContent = text;
          await delay(ms);
        }
      }

      loopCount++;
      if (loop > 0 && loopCount >= loop) running = false;
    }


    // --------------------------------------------------------
    // 🧹 END ACTIONS
    // --------------------------------------------------------
    container.textContent = "";
    if (next) triggerCueById(next);

  } catch (err) {
    console.error("[cueText] Error:", err);
  }
}


// --------------------------------------------------------
// 🔍 SUPPORT FUNCTIONS
// --------------------------------------------------------

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function parseWordsSource(input) {

  if (!input) return [];

  // 🧹 unescape any escaped quotes from XML id parsing
  input = input.replace(/\\"/g, '"');
  console.log("[parseWordsSource DEBUG] input raw:", input);



  // Strip wrapper
  let inner = input
    .replace(/^words\[/i, "")
    .replace(/\]$/, "")
    .trim();
  console.log("[parseWordsSource DEBUG] inner string:", inner);

  // Split on commas not inside quotes
  const rawItems = inner
    .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    .map(s => s.trim())
    .filter(Boolean);

  const entries = rawItems.map(item => {
    const m = item.match(/^"?([^":]+?)"?\s*:\s*([\d.]+)?$/);
    let text, dur;

    if (m) {
      text = m[1];
      dur = m[2] ? parseFloat(m[2]) : null;
    } else {
      text = item.replace(/^"|"$/g, "").trim();
      dur = null;
    }

    if (/^r(est)?$/i.test(text)) text = "rest";
    return { text, dur };
  });

  console.log("[parseWordsSource] inner:", inner, "entries:", entries);
  return entries;
}



/**
 * handleGroupCue(cueId, cueParams)
 * --------------------------------
 * Triggered by cueGroup(groupId) cues.
 *
 * Purpose:
 *   Dynamically injects a pre-defined SVG <g> group (e.g. a menu, control panel)
 *   that was previously registered in window.groupRegistry during SVG load.
 *   The cloned group’s cueButtons are converted into interactive HTML buttons
 *   in the overlay layer (so they’re visible and clickable).
 *
 * Execution flow:
 *   1. Extracts groupId from cueGroup(...) expression.
 *   2. Looks up the original group (<g id="group-something">) from groupRegistry.
 *   3. Clones it and appends it into the current page’s SVG (#pageSVG).
 *   4. Adds a unique suffix to each cueButton(...) ID to avoid collisions.
 *   5. Calls assignCueButtonsIn(currentSvg, overlay) to build visible buttons
 *      into #singlePage-overlay based on the cloned group’s geometry.
 *   6. Propagates any animations or observers for the new elements.
 *
 * Key dependencies:
 *   • window.groupRegistry  – holds reusable <g> definitions from all loaded SVGs.
 *   • window.assignCueButtonsIn – converts <rect>/<text> cueButton placeholders
 *     into actual HTML overlay buttons (must be exposed globally).
 *   • window.propagate / window.initializeObserver – restart animations if needed.
 *
 * Result:
 *   Reusable, triggerable UI groups can be summoned anywhere in the score via
 *   cueButton(cueGroup(mainMenu)_style(...)), without duplicating SVG code.
 */



export function handleGroupCue(cueId, cueParams = {}) {
  // 1️⃣ Extract the group ID
  let groupId = (cueParams.choice || "").trim();
  if (!groupId) {
    const m = cueId.match(/^cueGroup\(\s*([^)]+?)\s*\)/);
    if (m && m[1]) groupId = m[1].trim();
  }

  const cut = groupId.indexOf(")_style");
  if (cut > -1) groupId = groupId.slice(0, cut);

  if (!groupId) {
    console.warn("[cueGroup] ⚠️ No valid groupId extracted from:", cueId, cueParams);
    return;
  }

  // 2️⃣ Look up the registered group
  const source = window.groupRegistry?.[groupId];
  if (!source) {
    console.warn(`[cueGroup] ⚠️ Group "${groupId}" not found in registry.`);
    return;
  }

  // 3️⃣ Clone the stored group
  const clone = source.cloneNode(true);

  // 4️⃣ Find the correct active SVG container
  const currentSvg =
    window._currentPageSvg ||
    document.querySelector('#singlePage-content svg') ||
    document.querySelector('svg#pageSVG') ||
    document.querySelector('svg#score');

  if (!currentSvg) {
    console.warn("[cueGroup] ⚠️ No valid SVG container found for group injection.");
    return;
  }

  // 5️⃣ Append and mark group
  currentSvg.appendChild(clone);
  clone.classList.add("cueButtonGroup");
  console.log(`[cueGroup] 🎨 Injected group "${groupId}" into`, currentSvg.id || "(unnamed SVG)");

  // 🪄 Give cloned cueButtons unique IDs
  const uidSuffix = `-${Date.now()}`;
  clone.querySelectorAll('[id^="cueButton"]').forEach(el => {
    el.id = `${el.id}${uidSuffix}`;
  });
  console.log(`[cueGroup] 🪄 Renamed cueButtons in "${groupId}" with suffix ${uidSuffix}`);

  // 6️⃣ Temporarily mark this group as active so we can filter later
  clone.setAttribute("data-cuegroup-active", "1");

  // 🔍 Find the correct overlay container
  const overlay =
    document.querySelector('#singlePage-overlay') ||
    document.querySelector('#singlePage-content');

  // 7️⃣ Build visible cue buttons using the overlay
  if (typeof window.assignCueButtonsIn === "function") {
    try {
      // Assign only for elements within the active group
      const built = window.assignCueButtonsIn(currentSvg, overlay);
      const filtered = built?.filter(btn =>
        btn?.id?.includes(uidSuffix)
      ) || [];

      console.log(`[cueGroup] 🧩 assignCueButtonsIn() built ${filtered.length} cueButtons for "${groupId}"`);
      window._activePageButtons = (window._activePageButtons || []).concat(filtered);
    } catch (err) {
      console.warn("[cueGroup] ⚠️ assignCueButtonsIn() failed:", err);
    }
  } else if (typeof window.assignCues === "function") {
    try {
      window.assignCues(clone, window.cues);
      console.log(`[cueGroup] 🧩 assignCues() applied to "${groupId}"`);
    } catch (err) {
      console.warn("[cueGroup] ⚠️ assignCues() failed:", err);
    }
  }

  // 8️⃣ Re-initialize observers or animations
  window.propagate?.(clone);
  window.initializeObserver?.(clone);

  // 9️⃣ Cleanup temporary flag
  clone.removeAttribute("data-cuegroup-active");

  console.log(`[cueGroup] ✅ Group "${groupId}" ready and interactive.`);
}




export function handleP5Cue(cueId, cueParams) {
  const sketch = window.p5Sketches?.[cueParams.choice];
  if (sketch) sketch();
}

// 📽️ Handles cueVideo: plays a video and hides it after
export function handleVideoCue(cueId, cueParams) {
  const player = document.getElementById("video-layer");
  if (!player) return;

  player.src = `video/${cueParams.choice}.mp4`;
  player.style.display = "block";
  console.log(`[AUDIO] Playing audio cue: ${cueId}`);
  console.log(`[VIDEO] Playing video: ${cueParams.choice}`);
  player.play();

  player.onended = () => {
    player.style.display = "none";
    player.src = "";
  };
}

export function resetTriggeredCues() {
  if (window.triggeredCues)
    window.triggeredCues.clear();
  window._cueInsideState?.clear();
}


window.getPlayheadX = function () {
  const playhead = document.getElementById("playhead");
  const scoreContainer = window.scoreContainer;
  if (!playhead || !scoreContainer) return null;

  const containerRect = scoreContainer.getBoundingClientRect();
  const playheadRect = playhead.getBoundingClientRect();
  return playheadRect.left - containerRect.left;
};


// -------------------- Cue Utilities --------------------
/**
 * checkCueTriggers()
 *
 * Called on each animation frame to evaluate whether the scrolling playhead intersects
 * with any cue elements. Triggers cue actions using `handleCueTrigger()` and manages
 * repeat cue logic (via `repeatStateMap` and `executeRepeatJump()`).
 *
 * Supports:
 * - Single-shot cue triggering (via `triggeredCues`)
 * - Repeat loops with entry/exit markers
 * - Cooldown suppression after jump events to avoid double triggers
 * - Manual playback stop or resume via cueRepeat_* directives
 */
export async function checkCueTriggers() {
  // ✅ Ensure cues are ready
  if (!Array.isArray(window.cues)) return;

  // ✅ Sync elapsed time based on current scroll position
  window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;

  // 🛑 Skip cue checks if paused, seeking, or not playing
  if (window.isSeeking || window.animationPaused || !window.isPlaying) return;

  const playheadX = window.getPlayheadX();
  if (playheadX === null) {
    console.warn("[checkCueTriggers] Could not determine playhead x position.");
    return;
  }

  // We track cue-left positions across frames (since the playhead is fixed)
  if (!window._prevCueLefts) window._prevCueLefts = new Map();
  if (!window._cueInsideState) window._cueInsideState = new Map();
  if (!window.triggeredCues) window.triggeredCues = new Set();

  const tolerance = 8; // px (tweak 5–10)
  const containerRect = window.scoreContainer.getBoundingClientRect();

  for (const cue of window.cues) {
    if (!cue?.element) continue;

    const cueRect = cue.element.getBoundingClientRect();
    const cueLeft = cueRect.left - containerRect.left;
    const cueRight = cueLeft + cueRect.width;

    const prevLeft = window._prevCueLefts.has(cue.id)
      ? window._prevCueLefts.get(cue.id)
      : undefined;

    const wasInside = window._cueInsideState.get(cue.id) || false;
    const isInside = playheadX >= cueLeft && playheadX <= cueRight;

    // Initialize previous left on first sight (prevents start/resume/seek retriggers)
    if (prevLeft === undefined) {
      window._prevCueLefts.set(cue.id, cueLeft);
      window._cueInsideState.set(cue.id, isInside);
      continue;
    }

    // Forward scroll = cues move LEFT (cueLeft decreases)
    const movingForward = cueLeft < prevLeft;

    // Trigger when the LEFT edge crosses the playhead from right -> left (with tolerance)
    const crossedLeftEdgeForward =
      movingForward &&
      prevLeft > (playheadX + tolerance) &&
      cueLeft <= (playheadX + tolerance);

    if (crossedLeftEdgeForward && !window.triggeredCues.has(cue.id)) {
      console.log(`[cueTrigger] ✅ Left-edge crossing → ${cue.id}`);
      window.handleCueTrigger?.(cue.id);
      window.triggeredCues.add(cue.id);
    }

    // Update per-cue state for next frame
    window._prevCueLefts.set(cue.id, cueLeft);
    window._cueInsideState.set(cue.id, isInside);

    // 🔁 Repeat logic — unchanged from your working version
    for (const [repeatCueId, repeat] of Object.entries(window.repeatStateMap || {})) {
      if (!repeat.active || !repeat.ready || !repeat.initialJumpDone) continue;

      let isAtRepeatEnd = false;

      if (repeat.endId === 'self') {
        const repeatCue = window.cues.find(c => c.id === repeat.cueId || c.id.startsWith(`${repeat.cueId}-`));
        if (repeatCue?.element) {
          const repeatRect = repeatCue.element.getBoundingClientRect();
          const repeatX = repeatRect.left - containerRect.left;
          const repeatEnd = repeatX + (repeatRect.width || 40);
          isAtRepeatEnd = playheadX >= repeatX && playheadX <= repeatEnd;
        }
      } else if (cue.id === repeat.endId || cue.id.startsWith(`${repeat.endId}-`)) {
        isAtRepeatEnd = true;
      }

      const now = Date.now();
      if (repeat.jumpCooldownUntil && now < repeat.jumpCooldownUntil) {
        console.log(`[repeat] ⏳ Cooldown active for ${repeatCueId}`);
        continue;
      }

      if (isAtRepeatEnd) {
        const cooldown = 500;
        if (now - repeat.lastTriggerTime < cooldown) continue;

        repeat.lastTriggerTime = now;
        repeat.currentCount++;
        window.updateRepeatCountDisplay?.(repeat.currentCount);

        console.log(`[repeat] Reached end (${repeat.endId}) for ${repeatCueId} → count: ${repeat.currentCount}`);

        if (repeat.isInfinite || repeat.currentCount < repeat.count) {
          if (repeat.directionMode === 'p') {
            repeat.currentlyReversing = !repeat.currentlyReversing;
          }

          console.log(`[repeat] Executing repeat jump for ${repeatCueId}`);
          try {
            await window.executeRepeatJump?.(repeat, repeatCueId);
          } catch (err) {
            console.error(`[repeat] ❌ Error during repeat jump (${repeatCueId}):`, err);
          }
        } else {
          repeat.active = false;
          window.hideRepeatCountDisplay?.();

          if (repeat.action === 'stop') {
            console.log(`[repeat] Repeat complete → stopping playback.`);
            window.stopAnimation?.();
            window.isPlaying = false;
            window.isMusicalPause = true;
            window.togglePlayButton?.();
          } else if (repeat.resumeId && repeat.resumeId !== 'self') {
            console.log(`[repeat] Repeat complete → jumping to ${repeat.resumeId}`);
            window.jumpToCueId?.(repeat.resumeId);
            window.isPlaying ? window.pausePlayback() : window.startPlayback();
          } else {
            console.log(`[repeat] Repeat complete → staying at current location.`);
          }
        }

        break; // 🛑 Prevent multiple repeat triggers in one frame
      }
    }
  }
}









export function parseCueLegacy(cueId) {
  // Extract cue type (e.g. cuePage, cueAudio, etc.)
  const typeMatch = cueId.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  const type = typeMatch ? typeMatch[1] : null;
  if (!type) return { type: cueId, cueParams: {}, cleanedId: cueId };

  const cueParams = {};
  let rest = cueId.slice(type.length);

  // --- 🧠 Extract first parenthetical block safely (choice)
  if (rest.startsWith("(")) {
    let depth = 0;
    let endIndex = -1;
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }

    if (endIndex !== -1) {
      const inner = rest.slice(1, endIndex); // everything between ( ... )
      cueParams.choice = isNaN(inner) ? inner.trim() : parseFloat(inner);
      rest = rest.slice(endIndex + 1); // ✅ keep suffix intact (e.g. _wait(20)_next(page3))
    }
  }

  // --- ✅ Parse all suffixes, multiline-safe
  const regex = /_([a-zA-Z0-9]+)\(([\s\S]*?)\)/g;
  let match;
  while ((match = regex.exec(rest)) !== null) {
    const [, key, value] = match;

    if (key === "style") {
      const rawStyle = match[2];
      const kvRegex = /([\w-]+)\s*:\s*(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|rgba?\([^)]*\)|[^,]+))/g;
      const obj = {};
      let m;
      while ((m = kvRegex.exec(rawStyle)) !== null) {
        const kRaw = m[1].trim().toLowerCase();
        let vRaw = m[2].trim().replace(/^["']|["']$/g, "");
        if (!/^rgba?\(/i.test(vRaw) && !isNaN(vRaw) && vRaw !== "") vRaw = parseFloat(vRaw);
        obj[kRaw] = vRaw;
      }
      cueParams.style = obj;
    } else {
      // 🔧 Handle numbers and strings
      cueParams[key] = isNaN(value) ? value.trim() : parseFloat(value);
    }
  }

  return { type, cueParams, cleanedId: cueId };
}


function parseKeyValueParams(str, cueParams) {
  const regex = /_([a-zA-Z0-9]+)\(([^)]+)\)/g;
  let m;
  while ((m = regex.exec(str)) !== null) {
    const [, key, value] = m;
    cueParams[key] = isNaN(value) ? value : parseFloat(value);
  }
}


if (window.triggeredCues)
  window.triggeredCues.clear();
window._cueInsideState?.clear();

// Robustly extract cueButton(...) inner content even if the ID has suffixes like -uid...
function extractCueButtonInner(id) {
  const key = "cueButton(";
  const start = id.indexOf(key);
  if (start === -1) return null;
  let i = start + key.length, depth = 1;
  for (; i < id.length; i++) {
    const ch = id[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        // inner is between start+key.length and i (exclusive)
        return id.slice(start + key.length, i);
      }
    }
  }
  return null; // unbalanced
}






// // ------------------------------
// // cueButton: parsing (robust)
// // ------------------------------
// export function parseCueButton(cueId) {
//   const inner = extractCueButtonInner(cueId);
//   if (!inner) return null;

//   // Use your existing helper to split only top-level commas
//   const parts = splitTopLevel(inner, ",").map(s => s.trim());
//   if (parts.length < 3) {
//     console.warn("[cueButton] Not enough args. Expected at least <cueExpr>, <dimensions>, <color>.");
//     return null;
//   }

//   // 1) cue expression (can be nested)
//   const cueExpr = parts[0];
//   if (!cueExpr) return null;

//   // 2) dimensions: "WxH" or "N" (square), px only
//   const dimRaw = parts[1];
//   let width = 100, height = 100;
//   if (/^\d+(x\d+)?$/.test(dimRaw)) {
//     if (dimRaw.includes("x")) {
//       const [w, h] = dimRaw.split("x").map(n => parseInt(n, 10));
//       if (!isNaN(w) && !isNaN(h)) { width = w; height = h; }
//     } else {
//       const n = parseInt(dimRaw, 10);
//       if (!isNaN(n)) { width = n; height = n; }
//     }
//   } else {
//     console.warn(`[cueButton] Bad dimensions '${dimRaw}', using 100x100.`);
//   }

//   // 3) color: css name / hex / rgb(a)
//   const color = parts[2] || "red";

//   // 4) optional label: only if the next token does NOT start with "_"
//   let idx = 3;
//   let label = null;
//   if (parts[idx] && !parts[idx].startsWith("_")) {
//     label = parts[idx++];
//   }

//   // 5) suffix options
//   // inside parseCueButton() options object:
//   const opt = {
//     className: null,
//     repeatable: 1,
//     broadcast: 0,
//     conductorOnly: 0,
//     scrollFollow: 0,
//     offsetX: 0,
//     offsetY: 0,
//     radius: 8,
//     debounceMs: 300,
//     uid: null,
//     // NEW:
//     fontFamily: null,   // e.g. "Inter, system-ui, sans-serif"
//     fontSize: null      // number (px) or string like "16px"
//   };

//   for (; idx < parts.length; idx++) {
//     const tok = parts[idx];
//     // _key(value) format; value may contain commas (already top-level safe)
//     const m = tok.match(/^_([a-zA-Z]+)\(([\s\S]*)\)$/);
//     if (!m) continue;
//     const key = m[1].toLowerCase();
//     const val = m[2];

//     if (key === "class") opt.className = val;
//     else if (key === "repeatable") opt.repeatable = Number(val) ? 1 : 0;
//     else if (key === "broadcast")  opt.broadcast  = Number(val) ? 1 : 0;
//     else if (key === "conductor")  opt.conductorOnly = Number(val) ? 1 : 0;
//     else if (key === "scroll")     opt.scrollFollow  = Number(val) ? 1 : 0;
//     else if (key === "offset") {
//       const [x, y] = val.split(/[, ]+/).map(n => parseInt(n, 10));
//       if (!isNaN(x)) opt.offsetX = x;
//       if (!isNaN(y)) opt.offsetY = y;
//     } else if (key === "radius") {
//       const n = parseInt(val, 10); if (!isNaN(n)) opt.radius = n;
//     } else if (key === "debounce") {
//       const n = parseInt(val, 10); if (!isNaN(n)) opt.debounceMs = n;
//     } else if (key === "uid") {
//       opt.uid = String(val);
//     } else if (key === "font") {
//   opt.fontFamily = val; // keep commas/spaces (top-level split already handled)
//     } else if (key === "fontsize") {
//       const n = parseInt(val, 10);
//       opt.fontSize = Number.isFinite(n) ? n : val; // allow "16" or "16px"
//     }
//       }

//   // Label default: uid if available else cue type prefix
//   const cueTypeFallback = cueExpr.split("(")[0] || "cue";
//   const finalLabel = label || opt.uid || cueTypeFallback;

//   return { cueExpr, width, height, color, label: finalLabel, opt };
// }






export function createCueButtonForElement(cueSvgEl, parsed, containerEl = window.scoreContainer) {
  if (!cueSvgEl || !parsed || !containerEl) return null;
  const { cueExpr, opt } = parsed;

  // Hide the SVG cue element (replacement)
  cueSvgEl.style.visibility = "hidden";
  cueSvgEl.style.pointerEvents = "none";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = opt.label || "";
  btn.className = "oscilla-cue-button";
  if (opt.className) btn.classList.add(opt.className);

  // 🛑 Prevent bubbling or document-level handlers (double-tap toggle, etc.)
  btn.addEventListener("mousedown", (e) => e.preventDefault());
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation(); // ✅ stops global playback toggle or page click detectors
  });

  // Style
  Object.assign(btn.style, {
    position: "absolute",
    width: (opt.width ? `${opt.width}px` : "100px"),
    height: (opt.height ? `${opt.height}px` : "40px"),
    background: opt.color,
    border: "1px solid rgba(0,0,0,.2)",
    borderRadius: `${opt.radius}px`,
    padding: "6px 10px",
    fontWeight: opt.fontWeight || "600",
    fontSize: (opt.fontSize != null)
      ? (Number.isFinite(opt.fontSize) ? `${opt.fontSize}px` : String(opt.fontSize))
      : "14px",
    fontFamily: opt.fontFamily || "system-ui, sans-serif",
    color: opt.textColor || "",
    zIndex: "2000",
    cursor: "pointer",
    userSelect: "none",
  });

  containerEl.appendChild(btn);

  // console.log(`[createCueButtonforelement] ${cueSvgEl.id} rect=`, cueSvgEl.getBoundingClientRect(),
  //   `→ left=${btn.style.left}, top=${btn.style.top}`);


  const place = () => {
    let r = cueSvgEl.getBoundingClientRect();

    // 🕒 Check if the SVG element has real layout metrics yet
    if (r.width === 0 && r.height === 0) {
      // console.warn(`[cueButton] ⚠️ ${cueSvgEl.id} not yet laid out — deferring placement.`);

      // Wait one more animation frame, then retry once
      requestAnimationFrame(() => {
        const r2 = cueSvgEl.getBoundingClientRect();
        if (r2.width > 0 || r2.height > 0) {
          const c = containerEl.getBoundingClientRect();
          const left = r2.left - c.left + (opt.offsetX || 0);
          const top = r2.top - c.top + (opt.offsetY || 0);
          btn.style.left = `${Math.round(left)}px`;
          btn.style.top = `${Math.round(top)}px`;
          // console.log(`[cueButton] ✅ ${cueSvgEl.id} now ready (${left}, ${top})`);
        } else {
          // console.warn(`[cueButton] ❌ ${cueSvgEl.id} still 0×0 after retry — skipping placement.`);
        }
      });

      return; // prevent premature placement at (0,0)
    }

    // 🧭 Normal placement once geometry exists
    const c = containerEl.getBoundingClientRect();
    const left = r.left - c.left + (opt.offsetX || 0);
    const top = r.top - c.top + (opt.offsetY || 0);
    btn.style.left = `${Math.round(left)}px`;
    btn.style.top = `${Math.round(top)}px`;
  };

  place();

  // Follow (optional)
  let rafId = null;
  const tick = () => {
    place();
    rafId = requestAnimationFrame(tick);
  };
  if (opt.scrollFollow) rafId = requestAnimationFrame(tick);
  const onResize = () => place();
  window.addEventListener("resize", onResize);

  // Toggle logic (good for audio cues)
  // --- 🔊 Audio cue detection
  const audioMatch = /^cueAudio\(\s*([^)]+)\s*\)/i.exec(cueExpr);
  const audioFile = audioMatch?.[1]?.trim() || null;
  const stopCue = audioFile ? `cueAudioStop(${audioFile})` : null;

  // --- 💡 Active visual feedback (pulsing, flashing, etc.)
  let isVisuallyActive = false;
  const setVisualActive = (on) => {
    isVisuallyActive = !!on;
    btn.classList.toggle("oscilla-cue-button--active", isVisuallyActive);
    btn.classList.remove(
      "oscilla-cue-button--flash",
      "oscilla-cue-button--pulse",
      "oscilla-cue-button--fade"
    );
    if (isVisuallyActive) {
      if (opt.activeStyle === "flash") btn.classList.add("oscilla-cue-button--flash");
      else if (opt.activeStyle === "pulse") btn.classList.add("oscilla-cue-button--pulse");
      else if (opt.activeStyle === "fade") btn.classList.add("oscilla-cue-button--fade");
    }
  };

  // --- 🕒 Debounce
  let lastClick = 0;

  // --- 🎛️ Click handler (polyphonic-safe)
  btn.addEventListener("click", async () => {
    const now = performance.now();
    if (now - lastClick < (opt.debounceMs || 100)) return;
    lastClick = now;

    // Restrict if conductor-only
    if (opt.conductorOnly && !window.isConductor) return;

    // ✅ Ensure AudioContext is resumed
    const ac =
      window.sharedAudioCtx ||
      window.WaveSurfer?.instances?.[0]?.backend?.ac ||
      null;
    if (ac && ac.state === "suspended") {
      console.warn("[AUDIO] ⚡ AudioContext suspended — resuming.");
      try {
        await ac.resume();
        console.log("[AUDIO] ✅ AudioContext resumed.");
      } catch (err) {
        console.error("[AUDIO] ❌ Resume failed:", err);
      }
    }

    // 🟢 Fire cue immediately (polyphony allowed)
    window.handleCueTrigger?.(cueExpr, false, true);
    if (audioFile) setVisualActive(true);

    // 🟣 Broadcast (optional)
    if (opt.broadcast && window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
      window.socket.send(
        JSON.stringify({
          type: "cue_button_click",
          cueExpr,
          uid: opt.uid || null,
          timestamp: Date.now(),
        })
      );
    }
  });

  // --- 🔁 Audio engine sync (maintain visual while playing)
  const onAudio = (ev) => {
    if (!audioFile) return;
    const d = ev.detail || {};
    if (d.file !== audioFile) return;
    if (d.state === "play") setVisualActive(true);
    if (d.state === "stop") setVisualActive(false);
  };
  window.addEventListener("oscilla:audio", onAudio);


  // Cleanup
  btn._destroyCueButton = () => {
    window.removeEventListener("resize", onResize);
    window.removeEventListener("oscilla:audio", onAudio);
    if (rafId) cancelAnimationFrame(rafId);
    btn.remove();
    cueSvgEl.style.visibility = "";
    cueSvgEl.style.pointerEvents = "";
  };

  return btn;
}


export function assignCueButtonsIn(rootNode, containerEl) {
  console.log(`[assignCueButtonsIn] executing for ${rootNode.querySelectorAll('[id^="cueButton("]').length} elements`);

  if (!rootNode || !containerEl) return [];
  const created = [];

  const walk = (node) => {
    for (const child of node.children || []) {
      const id = child.id;
      if (id && id.startsWith("cueButton(")) {
        const parsed = parseCueButton(id);
        if (parsed) {
          const btn = createCueButtonForElement(child, parsed, containerEl);
          if (btn) created.push(btn);
          console.log("[assignCueButtonsIn] Created cueButton:", id);

        } else {
          console.warn("[assignCueButtonsIn] Failed to parse cueButton:", id);
        }
        continue; // don't recurse under this node
      }
      walk(child);
    }
  };

  walk(rootNode);
  return created;
}

window.assignCueButtonsIn = assignCueButtonsIn;



// Optional: WS receiver hook — call once during app init
export function installCueButtonSocketReceiver() {
  if (!window.wsEnabled || !window.socket) return;
  window.socket.addEventListener("message", (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data?.type === "cue_button_click" && data?.cueExpr) {
        // Prevent echo storms (optional: compare client IDs if you have them)
        window.handleCueTrigger?.(data.cueExpr);
      }
    } catch (e) { }
  });
}



// Extract inner of fnName(...) by counting parentheses
function extractFuncInner(str, fnName) {
  const key = fnName + "(";
  const start = str.indexOf(key);
  if (start === -1) return null;
  let i = start + key.length, depth = 1;
  for (; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return str.slice(start + key.length, i);
    }
  }
  return null;
}

// Simple boolean parser for style
function parseBool(v) {
  return /^(1|true|on|yes)$/i.test(String(v).trim());
}



export function parseCueButton(cueId) {



  //console.log("\n[parseCueButton] called with:", cueId);

  // 1) pull inner of cueButton(...)
  const inner = extractFuncInner(cueId, "cueButton");
  if (!inner) {
    //console.warn("[parseCueButton] ❌ extractFuncInner failed for cueButton()");
    return null;
  }
  //console.log("[parseCueButton] inner:", inner);
  registerCueUid(cueId, "button");

  // 2) try to find _style(...) INSIDE inner (preferred form)
  let cueExpr = inner.trim();
  let styleInner = null;

  // PASS 1 — Detect inner cue _style(...) (like inside cueText)
  const lastInnerStyle = inner.lastIndexOf("_style(");
  if (lastInnerStyle !== -1) {
    // find closing parenthesis for this _style(
    let depth = 0, endIndex = -1;
    for (let i = lastInnerStyle; i < inner.length; i++) {
      const ch = inner[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }

    // if the _style ends BEFORE the final parenthesis of the cueButton(...)
    // treat it as inner cue _style — leave intact
    const lastParen = inner.lastIndexOf(")");
    if (endIndex !== -1 && endIndex < lastParen) {
      cueExpr = inner.trim(); // keep cue intact
    }
  }

  // PASS 2 — Detect outer button _style(...) (after cueText(...))
  const outerStart = cueId.lastIndexOf("_style(");
  if (outerStart !== -1) {
    const sub = cueId.slice(outerStart);
    styleInner = extractFuncInner(sub, "_style");
    if (outerStart > cueId.lastIndexOf(")")) {
      // cleanly remove outer style from cueExpr
      cueExpr = cueId.slice(0, outerStart).trim();
    }
  }

  // console.log("[parseCueButton] cueExpr:", cueExpr);
  // console.log("[parseCueButton] styleInner:", styleInner);



  // 3) if not found, try OUTSIDE (i.e., after ")")
  if (!styleInner) {
    const outerStart = cueId.lastIndexOf("_style(");
    if (outerStart !== -1) {
      const outerSub = cueId.slice(outerStart);             // slice from that _style(
      styleInner = extractFuncInner(outerSub, "_style");      // contents
      // cueExpr remains as 'inner'
      console.log("[parseCueButton] ⚠️ _style found OUTSIDE cueButton(...) — supported but consider moving it inside.");
    }
  }

  // console.log("[parseCueButton] cueExpr:", cueExpr);
  // console.log("[parseCueButton] styleInner:", styleInner);

  if (!cueExpr) {
    // console.warn("[parseCueButton] ⚠️ Missing cue expression in:", cueId);
    return null;
  }

  // 4) defaults
  const opt = {
    width: 100, height: 50,
    color: "#222", textColor: null,
    label: null, fontFamily: null, fontSize: null, fontWeight: null,
    radius: 8, offsetX: 0, offsetY: 0,
    debounceMs: 300,
    toggle: false, activeStyle: "none",
    className: null, uid: null,
    broadcast: 0, conductorOnly: 0, scrollFollow: 0,
  };

  // 5) parse key:value pairs
  if (styleInner) {
    let kvs;
    try {
      kvs = splitTopLevel(styleInner, ",");
    } catch (err) {
      // console.error("[parseCueButton] splitTopLevel failed; fallback split:", err);
      kvs = styleInner.split(/,(?![^()]*\))/);
    }

    // console.log("[parseCueButton] splitTopLevel result:", kvs);

    kvs.forEach(kvRaw => {
      const kv = kvRaw.trim(); if (!kv) return;
      const ix = kv.indexOf(":"); if (ix < 0) return;
      const key = kv.slice(0, ix).trim().toLowerCase();
      let val = kv.slice(ix + 1).trim().replace(/^["']|["']$/g, "");
      // console.log(`[parseCueButton] kv → key: "${key}" val: "${val}"`);

      switch (key) {
        case "size": {
          if (/^\d+(x\d+)?$/.test(val)) {
            if (val.includes("x")) {
              const [w, h] = val.split("x").map(Number);
              if (!isNaN(w) && !isNaN(h)) { opt.width = w; opt.height = h; }
            } else {
              const n = Number(val);
              if (!isNaN(n)) { opt.width = n; opt.height = n; }
            }
          }
          break;
        }
        case "color": opt.color = val; break;
        case "textcolor": opt.textColor = val; break;
        case "label": opt.label = val; break;
        case "font": opt.fontFamily = val; break;
        case "fontsize": opt.fontSize = /^\d+(\.\d+)?$/.test(val) ? Number(val) : val; break;
        case "fontweight": opt.fontWeight = val; break;
        case "radius": if (!isNaN(+val)) opt.radius = +val; break;
        case "offset": {
          const [x, y] = val.split(/[, ]+/);
          if (!isNaN(+x)) opt.offsetX = +x;
          if (!isNaN(+y)) opt.offsetY = +y;
          break;
        }
        case "debounce": if (!isNaN(+val)) opt.debounceMs = +val; break;
        case "toggle": opt.toggle = /^(1|true|on|yes)$/i.test(val); break;
        case "active": opt.activeStyle = val.toLowerCase(); break;
        case "class": opt.className = val; break;
        case "uid": opt.uid = val; break;
        case "broadcast": opt.broadcast = /^(1|true|on|yes)$/i.test(val) ? 1 : 0; break;
        case "conductor": opt.conductorOnly = /^(1|true|on|yes)$/i.test(val) ? 1 : 0; break;
        case "scroll": opt.scrollFollow = /^(1|true|on|yes)$/i.test(val) ? 1 : 0; break;
        default:
        // console.warn("[parseCueButton] ⚠️ Unhandled key:", key, "=", val);
      }
    });
  } else {
    // console.warn("[parseCueButton] ⚠️ No _style(...) found in:", cueId);
  }

  const uidMatch =
    cueExpr.match(/_uid\(([^)]+)\)/) ||
    cueId.match(/_uid\(([^)]+)\)/);

  const uid = opt._uid || (uidMatch ? uidMatch[1] : null);

  if (uid) {
    opt.label = opt.label || uid.trim();
    opt._uid = uid.trim(); // ✅ store it explicitly too
  } else {
    const type = cueExpr.split("(")[0] || "cue";
    opt.label = opt.label || type.replace(/^cue/, "").trim();
  }

  // ✅ Register UID safely here — cueExpr is now guaranteed to exist
  try {
    let innerCue = cueExpr;
    const innerMatch = cueExpr.match(/cueButton\s*\(\s*([^)]+)\s*\)/);
    if (innerMatch) innerCue = innerMatch[1].trim();

    registerCueUid(innerCue, "button");
  } catch (err) {
    // console.warn("[parseCueButton] ⚠️ UID registration failed:", err);
  }


  // console.log("[parseCueButton] ✅ Parsed result:", { cueExpr, opt });
  return { cueExpr, opt };
}





// ---- parser
export function parseNavCue(id) {
  const inner = extractFuncInner(id, "cueNav") || extractFuncInner(id, "cueNavigate");
  if (!inner) return null;

  // first token is the action at top level; optional arg in (...) after it
  // e.g. "goto(page3)" or "exit" or "stopAndTrigger(cuePage(...))"
  const parts = splitTopLevel(inner, ","); // safe, though usually 1 part
  const actionExpr = parts[0].trim();

  // action(arg?) pattern
  const m = actionExpr.match(/^([a-zA-Z]+)(?:\(([\s\S]*)\))?$/);
  if (!m) return null;

  const action = m[1];
  const argExpr = m[2] ? m[2].trim() : null; // may itself be a full cue expression

  return { action: action.toLowerCase(), argExpr };
}



// ---- handler (instrumented)
export async function handleNavCue(parsed) {
  const { cueId, cueParams } = parsed;

  if (!parsed) return;
  const { action, argExpr } = parsed;

  // ---- tiny debug helper
  const dbg = (...a) => { if (window.DEBUG_NAV !== false) console.log("[cueNav]", ...a); };
  const now = () => Math.round(performance.now());

  // helpers (adapt to your actual page API names)
  const exitPageMode = () => {
    dbg("exitPageMode() start", { pageState: window.pageState?.mode });
    const r =
      window.exitPageMode?.() ||
      window.setPageMode?.(false) ||
      window.closePageOverlay?.();
    dbg("exitPageMode() done", { pageState: window.pageState?.mode });
    return r;
  };

  const stopPlaylist = () => {
    dbg("stopPlaylist() start", {
      isCuePagePlaylistActive: window.isCuePagePlaylistActive,
      hasTimer: !!window.cuePagePlaylistTimer,
    });

    // Preferred API (if you have it)
    const r = window.stopCuePagePlaylist?.() || window.pageController?.stop?.();

    // Fallback: hard stop
    if (window.cuePagePlaylistTimer) {
      clearTimeout(window.cuePagePlaylistTimer);
      window.cuePagePlaylistTimer = null;
      dbg("cleared cuePagePlaylistTimer");
    }
    if (window.isCuePagePlaylistActive) {
      window.isCuePagePlaylistActive = false;
      dbg("set isCuePagePlaylistActive = false");
    }
    if (window.pageState) {
      window.pageState.mode = "page"; // keep current page visible
      dbg("set pageState.mode = 'page'");
    }

    // NEW: clear any other guards your scheduler may check
    window.cuePageCountdownActive = false;
    window.cuePageTransitioning = false;
    window.cuePageHold = false;   // if you track waits/holds explicitly
    window.cuePageNextDue = 0;       // if you compare times for next hop

    dbg("stopPlaylist() done");
    return r;
  };

  const gotoPage = (pid, cueParams = {}) => {
    if (window.isCuePagePlaylistActive) stopPlaylist();

    // ✅ Build suffixes dynamically from cueParams
    const durSuffix = cueParams.dur ? `_dur(${cueParams.dur})` : "_wait(1)";
    const nextSuffix = cueParams.next ? `_next(${cueParams.next})` : "";

    const target = `cuePage(${pid})${durSuffix}${nextSuffix}`;
    dbg("goto→trigger:", target);

    try {
      window.handleCueTrigger?.(target, false, true);
    } catch (e) {
      console.error("[cueNav] goto trigger failed:", target, e);
    }
  };


  const nextPage = () => { dbg("nextPage()"); return window.nextPage?.() || window.pageController?.next?.(); };
  const prevPage = () => { dbg("prevPage()"); return window.prevPage?.() || window.pageController?.prev?.(); };
  const restartPlaylist = () => { dbg("restartPlaylist()"); return window.restartCuePagePlaylist?.() || window.pageController?.restart?.(); };

  const triggerCueExpr = (expr, label = "trigger") => {
    dbg(`${label}:`, expr);
    try {
      window.handleCueTrigger?.(expr);
    } catch (e) {
      console.error("[cueNav] trigger failed:", expr, e);
    }
  };

  // small delay helper to avoid race conditions switching modes
  const afterTick = (fn, label = "afterTick") => {
    const t = now();
    dbg(`${label} scheduled (+30ms)`);
    setTimeout(() => { dbg(`${label} firing (~${now() - t}ms)`); fn(); }, 30);
  };

  dbg("→ action:", action, "arg:", argExpr, {
    pageState: window.pageState?.mode,
    isCuePagePlaylistActive: window.isCuePagePlaylistActive,
    hasTimer: !!window.cuePagePlaylistTimer,
  });

  switch (action) {
    case "exit":
      exitPageMode();
      break;

    case "stop":
      stopPlaylist();
      break;

    case "next":
      nextPage();
      break;

    case "prev":
      prevPage();
      break;

    case "restart":
      restartPlaylist();
      break;

    case "goto": {
      if (!argExpr) {
        dbg("goto() missing arg");
        break;
      }

      // ✅ Extract dur / next directly from parsed.cueParams
      const dur = cueParams?.dur;
      const next = cueParams?.next;

      // ✅ Use defaults if not provided
      const durSuffix = dur ? `_dur(${dur})` : "_wait(1)";
      const nextSuffix = next ? `_next(${next})` : "";

      const target = `cuePage(${argExpr})${durSuffix}${nextSuffix}`;
      dbg("goto→trigger:", target);

      try {
        window.handleCueTrigger?.(target, false, true);
      } catch (e) {
        console.error("[cueNav] goto trigger failed:", target, e);
      }
      break;
    }


    case "trigger":
      if (!argExpr) { dbg("trigger() missing arg"); break; }
      triggerCueExpr(argExpr, "trigger()");
      break;

    case "stopandtrigger":
      stopPlaylist();
      if (argExpr) afterTick(() => triggerCueExpr(argExpr, "stopAndTrigger→trigger"));
      break;

    case "exitandtrigger":
      exitPageMode();
      if (argExpr) afterTick(() => triggerCueExpr(argExpr, "exitAndTrigger→trigger"));
      break;

    case "replace":
      stopPlaylist();
      exitPageMode();
      if (argExpr) afterTick(() => triggerCueExpr(argExpr, "replace→trigger"));
      break;


    case "mode":
      if (!argExpr) {
        dbg("mode() missing arg");
        break;
      }

      if (argExpr === "scroll") {
        dbg("→ Switching to scroll mode");

        const ps = window.pageState;
        const container = document.getElementById("singlePage-container");
        const content = document.getElementById("singlePage-content");

        if (container && content) {
          // fade out and hide the overlay
          container.style.transition = "opacity 0.5s ease";
          container.style.opacity = "0";
          setTimeout(() => {
            container.style.display = "none";
            content.innerHTML = "";
            if (window._activePageButtons) {
              window._activePageButtons.forEach(btn => btn._destroyCueButton?.());
              window._activePageButtons = [];
            }
            if (ps) {
              ps.mode = "scroll";
              ps.current = null;
            }
            window.resumeScrollScore?.();
            dbg("✅ Returned to scroll mode");
          }, 500);
        } else {
          dbg("⚠️ No container found; forcing resumeScrollScore()");
          window.resumeScrollScore?.();
          if (ps) ps.mode = "scroll";
        }
      }

      else if (argExpr === "page") {
        dbg("→ Switching to page mode placeholder (future)");
        // optionally: trigger cuePage(...) manually if desired
      }

      else {
        console.warn("[cueNav] Unknown mode argument:", argExpr);
      }
      break;


    default:
      console.warn("[cueNav] Unknown action:", action, "arg:", argExpr);
  }

  dbg("✓ done", { action, argExpr, pageState: window.pageState?.mode, isCuePagePlaylistActive: window.isCuePagePlaylistActive });
}





/**
 * handleSeqCue(cueId, cueParams)
 * ------------------------------
 * Sequences existing cues (#ids or UIDs) one after another.
 * Supports overlaps, waits, and parallel cues.
 *
 * Example:
 * cueSeq(#a1, #t2:+2, wait(1), #p3:-1)
 */
/**
 * handleSeqCue(cueSeq)
 * --------------------
 * Sequences multiple cues (by UID or expression).
 * Supports waits, random choice, offsets, looping, and parallel cues.
 */
export async function handleSeqCue(cueId, cueParams = {}) {
  try {
    console.log("[handleSeqCue] called:", cueId, cueParams);

    const { choice, loop = 1, speed = 1, next = null } = cueParams;
    if (!choice) return console.warn("[cueSeq] Missing sequence list");

    const steps = parseCueSeqList(choice);
    if (!steps.length) return console.warn("[cueSeq] No valid steps parsed");

    console.log("[cueSeq] ▶ Parsed sequence:", steps);

    // A safety flag to stop sequence early (e.g., on user stop)
    window._seqAbort = false;

    // 🌀 Main loop over sequence passes
    for (let round = 0; loop <= 0 || round < loop; round++) {
      console.log(`[cueSeq] 🔁 Sequence pass ${round + 1}`);

      for (const step of steps) {
        if (window._seqAbort) {
          console.warn("[cueSeq] ⚠️ Sequence aborted.");
          return;
        }

        // 💤 WAIT step
        if (step.type === "wait") {
          console.log(`[cueSeq] ⏱️ Waiting ${step.value}s`);
          await delay(step.value * 1000 / speed);
          continue;
        }

        // 🎲 RANDOM CHOICE
        if (step.type === "choose") {
          const pick = step.options[Math.floor(Math.random() * step.options.length)];
          console.log(`[cueSeq] 🎲 Random choice → ${pick}`);
          await triggerCueByRef(pick);
          continue;
        }

        // 🎬 NORMAL CUE STEP
        if (step.type === "cue") {
          console.log(`[cueSeq] 🎬 Trigger cue ${step.target} (offset ${step.offset}s)`);

          // Offset <0 = overlap (start before previous cue ends)
          if (step.offset < 0) {
            triggerCueByRef(step.target);
            await delay(Math.abs(step.offset * 1000 / speed));
          }
          // Offset >0 = delay start
          else if (step.offset > 0) {
            await delay(step.offset * 1000 / speed);
            triggerCueByRef(step.target);
          }
          // Offset = 0 = immediate / parallel start
          else {
            triggerCueByRef(step.target);
          }

          // Only wait for completion if not parallel (":0" or step.parallel flag)
          if (!step.parallel) {
            console.log(`[cueSeq] 🕒 Waiting for ${step.target} to complete`);
            await waitForCueCompletion(step.target);
          } else {
            console.log(`[cueSeq] ⚡ Parallel cue, continuing immediately`);
          }
        }
      }
    }

    console.log("[cueSeq] ✅ Sequence complete.");
    if (next) triggerCueById(next);

  } catch (err) {
    console.error("[cueSeq] Error:", err);
  }
}

function waitForCueCompletion(targetId, timeout = 60000) {
  return new Promise(resolve => {
    const listener = (ev) => {
      const { id, type } = ev.detail || {};
      if (!id) return;
      // Match either by UID, filename, or partial
      if (id.includes(targetId) || targetId.includes(id)) {
        console.log(`[waitForCueCompletion] ✅ ${id} (${type}) completed`);
        window.removeEventListener("oscilla:cueComplete", listener);
        resolve();
      }
    };
    window.addEventListener("oscilla:cueComplete", listener);
    setTimeout(() => {
      window.removeEventListener("oscilla:cueComplete", listener);
      console.warn(`[waitForCueCompletion] ⚠️ Timeout waiting for ${targetId}`);
      resolve();
    }, timeout);
  });
}


/**
 * parseCueSeqList()
 * -----------------
 * Parses the inner contents of cueSeq(...), e.g. "#a1, wait(2), #b1:+1"
 */
function parseCueSeqList(str) {
  if (!str) return [];
  str = str.replace(/^cueSeq\(/i, "").replace(/\)$/, "").trim();

  const parts = splitTopLevel(str, ",");
  const steps = [];

  for (let raw of parts) {
    raw = raw.trim();
    if (!raw) continue;

    if (/^wait\(/i.test(raw)) {
      const val = parseFloat(raw.match(/\(([^)]+)\)/)?.[1]) || 0;
      steps.push({ type: "wait", value: val });
    } else if (/^choose\[/i.test(raw)) {
      const inner = raw.replace(/^choose\[/i, "").replace(/\]$/, "");
      const style = splitTopLevel(inner, ",").map(s => s.trim());
      steps.push({ type: "choose", options: style });
    } else {
      // Regular cue reference, possibly with offset (:N)
      const match = raw.match(/^(#?[A-Za-z0-9_\-]+)(?::([+\-]?\d+(\.\d+)?))?$/);
      if (match) {
        const target = match[1];
        const offset = parseFloat(match[2]) || 0;
        const parallel = match[2] === "0";
        steps.push({ type: "cue", target, offset, parallel });
      }
    }
  }

  return steps;
}

/**
 * triggerCueByRef(target)
 * -----------------------
 * Resolves and triggers an existing cue by id or UID reference.
 */
// 🔍 Trigger cue by UID or element reference
export function triggerCueByRef(ref, extraParams = {}) {
  if (!ref) return console.warn("[cueSeq] ⚠️ Empty ref passed to triggerCueByRef");

  let expr = null;

  // 1️⃣ Try direct registry lookup
  if (window.cueRegistry && window.cueRegistry[ref]) {
    expr = window.cueRegistry[ref];
    console.log(`[cueSeq] 🔗 Resolved UID "${ref}" → ${expr}`);
  }

  // 2️⃣ Try if ref starts with "#" (strip it and retry)
  if (!expr && ref.startsWith("#")) {
    const id = ref.slice(1);
    if (window.cueRegistry && window.cueRegistry[id]) {
      expr = window.cueRegistry[id];
      console.log(`[cueSeq] 🔗 Resolved #UID "${id}" → ${expr}`);
    }
  }

  // 3️⃣ Fallback: try direct SVG element ID
  if (!expr) {
    const el = document.getElementById(ref.startsWith("#") ? ref.slice(1) : ref);
    if (el) expr = el.id;
  }

  // 4️⃣ Still nothing?
  if (!expr) {
    console.warn(`[cueSeq] ❌ Cue not found: ${ref}`);
    return;
  }

  // 🧠 Trigger it
  console.log(`[cueSeq] 🎬 Triggering resolved cue: ${expr}`);
  window.handleCueTrigger?.(expr, false, true, extraParams);
}


// /**
//  * waitForCueCompletion()
//  * ----------------------
//  * Future placeholder — currently just a delay fallback.
//  * Later this will listen for cue-specific completion events.
//  */
// async function waitForCueCompletion(ref) {
//   // TODO: implement real completion tracking
//   await delay(1000); // fallback 1s per cue
// }











