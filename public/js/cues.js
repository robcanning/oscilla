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
  // cueVideo: handleVideoCue,
  // cueP5: handleP5Cue,
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
  // cueText: handleTextCue,
  cueSeq: handleSeqCue,
  // cueGroup: handleGroupCue,


};

import { parseCueToAST } from "./parser.js";
import { handleMetronomeCue } from "./metro.js";
import { handleRotateCue } from "./rotate.js";
import { handleScaleCue } from "./scale.js";

import { handleSpeedCue, handleSpeedRamp } from "./speed.js";

// import { handleScaleCue, handleO2PCue } from "./oscillaAnim.js";



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
export function parseCueParams(cueId) {
  // If caller passed an AST directly → just return it
  if (typeof cueId !== "string" && cueId?.type) {
    const ast = cueId;
    return { type: ast.type, params: ast.params || {}, ast };
  }

  // ----------------------------------------------------------
  // 1️⃣ Try Chevrotain AST Parsing (new DSL, supports pause(4), nav(A), etc.)
  // ----------------------------------------------------------
  try {
    const ast = parseCueToAST(cueId.trim());

    // Ensure param object exists
    const cueParams = ast.params || {};

    console.log("[parseCueParams] ✅ AST parsed:", ast);
    return { type: ast.type, params: cueParams, ast };
  } catch (err) {
    // AST parse failed → continue to legacy fallback
    // console.warn("[CueDSL] AST parse failed, trying legacy:", err);
  }

  // ----------------------------------------------------------
  // 2️⃣ Optional JSON/brace DSL (old experimental form)
  // ----------------------------------------------------------
  if (cueId.includes(":") && cueId.includes("{")) {
    try {
      const result = parseCueDSL(cueId);
      console.log("[CueDSL] JSON-style DSL parsed successfully:", result);
      return result;
    } catch (err) {
      console.warn("[CueDSL] JSON-style DSL failed → fallback to legacy:", err);
    }
  }

  // ----------------------------------------------------------
  // 3️⃣ Legacy cue syntax fallback (cuePause_dur(N), cuePage(x), etc.)
  // ----------------------------------------------------------
  return parseCueLegacy(cueId);
}



////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////
export function parseCueDSL(str) {
  // Example accepted:
  // cue:page(target:"page3"){dur:5,next:"page4"}
  // page(target:"page3"){dur:5,next:"page4"}
  const mainMatch = str.match(/^(?:cue:)?([a-zA-Z0-9_-]+)\((.*?)\)\s*\{(.*)\}$/);
  if (!mainMatch) throw new Error("Invalid DSL structure");

  const [, type, argSection, paramSection] = mainMatch;

  const args = {};
  argSection.split(",").forEach((kv) => {
    const [k, v] = kv.split(":").map(s => s.trim());
    if (!k) return;
    args[k] = parseValue(v);
  });

  const params = {};
  paramSection.split(",").forEach((kv) => {
    const [k, v] = kv.split(":").map(s => s.trim());
    if (!k) return;
    params[k] = parseValue(v);
  });

  return { type: `cue${capitalize(type)}`, args, params };
}

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

export function handleCueTrigger(cueExprOrAst, isRemote = false, force = false, cueElement = null) {
  console.log(`[DEBUG] Attempting to trigger cue:`, cueExprOrAst);

  // ✅ If already parsed AST is passed (e.g., from cueButton click)
  let ast = null;
  if (typeof cueExprOrAst === "object" && cueExprOrAst.type) {
    ast = cueExprOrAst;
  } else {
    // Otherwise parse as string cue expression
    const cueId = String(cueExprOrAst).trim();

    if (!window.triggeredCues) window.triggeredCues = new Set();
    if (window.triggeredCues.has(cueId) && !force) {
      console.debug("[DEBUG] Skipping already-triggered cue:", cueId);
      return;
    }
    window.triggeredCues.add(cueId);

    try {
      ast = parseCueToAST(cueId);
    } catch {
      const legacy = parseCueParams(cueId);
      if (!legacy?.ast) {
        console.error("[CUE] ❌ Could not parse cue expression:", cueId);
        return;
      }
      ast = legacy.ast;
    }
  }

  if (!ast) {
    console.error("[CueDSL] ❌ No AST resolved — cannot proceed.");
    return;
  }

  console.log(`[CueDSL] ✅ Resolved AST Cue Type: ${ast.type}`, ast);

  // ------------------------------------------------------------
  // 🚀 Dispatch by AST type — This *is* the cue system now.
  // ------------------------------------------------------------
  switch (ast.type) {


    // animation dispatchers
case "cueRotate": return handleRotateCue(cueElement, ast.args);
      case "cueScale": return handleScaleCue(ast, cueElement);
    case "cueO2P": return handleO2PCue(ast, cueElement);

    // cue dispatchers 

    case "cuePage": return handlePageCueFromAST(ast, cueElement);
    case "cueFade": return handleFadeCueFromAST(ast, cueElement);
    case "cueStopwatch": return handleStopwatchCue(ast, cueElement);
    case "cueVideo": return handleVideoCueFromAST(ast, cueElement);

    case "cueText":
      import("./text.js")
        .then(mod => mod.handleCueTextFromAST(ast, cueElement))
        .catch(err => console.error("[CueDSL] Failed to load text.js module:", err));
      return;

    case "cueMetronome":
    case "cueMetro":
      return handleMetronomeCue(ast, cueElement);

    case "cuePause": return handlePauseCue(ast, cueElement);

    case "cueSpeed": {
      const start = window.speedMultiplier ?? 1.0;
      const end = ast.value ?? start;
      const dur = ast.dur ?? null;

      if (dur && dur > 0) {
        return handleSpeedRamp(start, end, dur);
      } else {
        return handleSpeedCue(`speed(${end})`, end);
      }
    }

    case "cueStop": return handleStopCue(ast, cueElement);
    case "cueNav": return handleNavCue(ast);

    case "cueAudio": {
      // `ast` here is the parsed AST: { type:'cueAudio', src:'noise', amp:0.9, loop:1, ... }
      if (!ast || ast.type !== "cueAudio") {
        console.warn("[cueAudio] Missing/invalid AST:", ast);
        return;
      }
      console.log("[dispatch] cueAudio AST →", ast);
      return handleAudioCue(ast);   // ✅ pass AST directly
    }

    case "cueAudioStop": return stopAudioCue(ast.filename || ast.file);

    default:
      console.warn(`[CueDSL] ⚠ Unsupported cue type: ${ast.type}`);
      return;
  }
}

window.handleCueTrigger = handleCueTrigger;

// =========================
//  Universal UID Registry
// =========================
export function registerCueUid(cueExpr, context = "unknown") {
  if (!cueExpr || typeof cueExpr !== "string") return;
  if (!window.cueRegistry) window.cueRegistry = {};

  const uidMatch = cueExpr.match(/_uid\(([^)]+)\)/);
  if (!uidMatch) return;

  const uid = uidMatch[1].trim();
  window.cueRegistry[uid] = cueExpr;

  // console.log(`[REGISTRY]  Registered UID "${uid}" (${context}) → ${cueExpr}`);
}



//  Unified cue completion event emitter
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
export function handlePauseCue(ast) {
  const durationMs = (ast.dur ?? 0) * 1000;
  const resumeTarget = ast.next || null;

  // ✅ Only show countdown if NOT explicitly disabled
  const showCountdown = (ast.count !== false) && (durationMs > 2000);

  console.log(`[cuePause] ⏸ Pausing for ${durationMs}ms`, ast);

  // --- Stop playback ---
  window.isPlaying = false;
  window.isMusicalPause = true;
  window.animationPaused = true;
  window.ignoreSyncDuringPause = true;

  stopAnimation?.();
  window.togglePlayButton?.();

  // --- Server sync: freeze playhead globally ---
  if (window.socket?.readyState === WebSocket.OPEN) {
    window.socket.send(JSON.stringify({
      type: "pause",
      playheadX: window.playheadX,
      elapsedTime: window.elapsedTime
    }));
  }

  // --- Optional countdown UI ---
  const overlay = document.getElementById("pause-countdown");
  const timeEl = document.getElementById("pause-time");

  if (overlay && timeEl) {
    if (showCountdown) {
      overlay.classList.remove("hidden");
      overlay.style.display = "flex";
      const targetEnd = Date.now() + durationMs;

      const tick = () => {
        const msLeft = targetEnd - Date.now();
        const sec = Math.max(0, Math.ceil(msLeft / 1000));
        timeEl.textContent = sec;
        if (sec <= 0) {
          clearInterval(window._pauseCountdownTimer);
          overlay.classList.add("hidden");
        }
      };

      clearInterval(window._pauseCountdownTimer);
      tick();
      window._pauseCountdownTimer = setInterval(tick, 1000);
    }
  }

  // --- Resume after timeout ---
  clearTimeout(window._pauseResumeTimer);
  window._pauseResumeTimer = setTimeout(() => {
    console.log("[cuePause] ▶ Resuming playback");
    window.ignoreSyncDuringPause = false;
    window.isMusicalPause = false;

    // Hide countdown UI if present
    overlay?.classList.add("hidden");

    if (resumeTarget) {
      console.log(`[cuePause] → Triggering resume target:`, resumeTarget);
      handleCueTrigger(resumeTarget, false, true);
      return;
    }

    // Otherwise just restart the score at current playhead
    startPlayback();
  }, durationMs);
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

  // --- NEW: Fully exit pause mode if user resumes manually ---
  if (forceNoResume) {
    window.ignoreSyncDuringPause = false;
    window.isMusicalPause = false;
    console.log("[DEBUG] Manual resume: cleared pause mode.");
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
 * Respects nav(mode:scrollPaused@X) via window._resumeAfterJump.
 */
export function resumePlayback(receivedFromServer = false) {
  console.log("[DEBUG] resumePlayback called (receivedFromServer:", receivedFromServer, ")");

  // ✅ If a jump explicitly requested *paused* landing:
  if (window._resumeAfterJump === false) {
    console.log("[resumePlayback] ⏸ Staying paused due to scrollPaused mode.");

    window.isPlaying = false;
    window.animationPaused = true;
    window.isMusicalPause = true;

    // Ensure stopwatch stays stopped
    window.pauseStopwatch?.();

    // Allow normal cues to resume again later
    window.ignoreSyncDuringPause = false;

    // Clear flag so later resumes behave normally
    window._resumeAfterJump = null;
    return;
  }

  // ✅ Clear resume flag (normal scroll mode autos resume)
  if (window._resumeAfterJump === true) {
    console.log("[resumePlayback] ▶ Auto-resuming after jump.");
  }
  window._resumeAfterJump = null;

  // --- (existing code follows) ---
  console.log("[DEBUG] Resuming playback after countdown dismissal.");

  if (!Number.isNaN(window.playheadX)) {
    console.log(`[DEBUG] Resuming from playheadX: ${window.playheadX}`);
  } else {
    console.error(`[ERROR] Invalid playheadX: ${window.playheadX}. Aborting resume.`);
    return;
  }

  window.updatePosition?.();
  window.updateStopwatch?.();

  window.lastAnimationFrameTime = null;

  if (typeof window.startPlayback === "function") {
    console.log("[DEBUG] Calling startPlayback() from resumePlayback()");
    window.startPlayback();
  } else {
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
  cueGroups.forEach(group => {
    const baseId = group.id.split('-')[0];
    const match = baseId.match(/^assignCues\((.+)\)$/);
    if (!match) return;

    const instruction = match[1].trim();

    // --- cueOscSet(...) and cueType(rnd[]) omitted for clarity (unchanged) ---
  });

  // ----------------------------------------------------
  // Walk SVG to register cues & build cueButtons
  // ----------------------------------------------------
  function walk(node) {
    for (const child of node.children) {
      const id = child.id;
      if (!id || !/[()]/.test(id)) {
        walk(child);
        continue;
      }

      let ast = null;
      try { ast = parseCueToAST(id.trim()); } catch { }

      // --- ✅ Skip cueButtons here. Let buildCueButtonsIn() handle them.
      if (ast && ast.type === "cueButton") {
        walk(child);
        continue;
      }

      // --- ✅ Normal scroll-trigger cue
      if (ast && ast.type !== "cueButton") {
        const box = child.getBBox?.();
        cuesArray.push({
          id,
          ast,
          element: child,
          triggered: false,
          ...(box && { x: box.x, width: box.width })
        });
        registerCueUid(id, "walk");
      }

      walk(child);
    }
  }

  walk(svgRoot);

  // ----------------------------------------------------
  // ✅ Build cueButtons when in scroll mode
  // ----------------------------------------------------
  const scrollContainer = document.getElementById("scoreInner");
  if (scrollContainer) {
    buildCueButtonsIn(svgRoot, scrollContainer);
  }

  return cuesArray;
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




export function handleStopCue(ast) {
  console.log("[cueStop] Triggered:", ast);

  // Toggle playback:
  if (window.isPlaying) {
    window.pausePlayback();
  } else {
    window.startPlayback();
  }

  // Optional chaining: stop(next:nav(B))
  if (ast.next) {
    console.log(`[cueStop] Scheduling next cue: ${ast.next}`);
    setTimeout(() => {
      handleCueTrigger(ast.next, false, true);
    }, 50);
  }
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
    updateModeToggleUI();

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
      updateModeToggleUI();
      ps.current = null;
      resumeScrollScore();
    } else {
      console.log("[cuePage] ⏹ Playlist stopped; holding current page.");
      ps.mode = "page";
      updateModeToggleUI();

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
  updateModeToggleUI();

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
  // 4️⃣ Load SVG page (project-local only)
  // -------------------------------------------------------------
  if (!window.pagesDir) {
    console.error("[cuePage] ❌ Missing window.pagesDir — run loadProject() first.");
    return;
  }

  const projectPath = `${window.pagesDir}${pageName}.svg`;

  console.groupCollapsed(`[cuePage] 📄 Loading page: "${pageName}"`);
  console.log("🌍 Current project:", window.currentProject);
  console.log("📂 Base directory:", window.projectBase);
  console.log("📁 Pages directory:", window.pagesDir);
  console.log("📜 Full SVG path:", projectPath);

  async function fetchSvgOrThrow(path) {
    console.log(`[cuePage] 🔍 Fetching SVG from: ${path}`);
    const res = await fetch(path);
    if (!res.ok) throw new Error(`HTTP ${res.status} at ${path}`);
    const text = await res.text();
    console.log(`[cuePage] ✅ Successfully fetched SVG (${text.length} chars)`);
    return text;
  }

  let svgText;
  try {
    svgText = await fetchSvgOrThrow(projectPath);
    console.log(`[cuePage] ✅ Page loaded successfully: ${projectPath}`);
  } catch (err) {
    console.error(`[cuePage] ❌ Failed to load page "${pageName}" from: ${projectPath}`);
    console.error("Error details:", err.message);
    console.groupEnd();
    return;
  }

  console.groupEnd();

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

  // ✅ Register reusable blocks defined inside this page
  if (window.registerReuseBlocks) {
    window.registerReuseBlocks(svg);
    console.log(`[reuse] Registered local blocks in ${pageName}.svg`);
  }

  // ✅ Inject reusable blocks referenced via use(...)
  if (window.autoInjectUseBlocks) {
    window.autoInjectUseBlocks(svg);
    console.log(`[reuse] Injected use(...) blocks in ${pageName}.svg`);
  }

  // if (typeof window.registerSvgGroups === "function") {
  //   window.registerSvgGroups(svg);
  //   console.log(`[cuePage] 📦 Registered groups in ${pageName}.svg`);
  // }

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


  // Reset triggered state so page reload / revisit replays cues
  if (window.triggeredCues instanceof Set) {
    window.triggeredCues.clear();
  }

  // Auto-start any text() cue that includes autostart:true
  const autostartTextCues = svg.querySelectorAll('[id^="text("]');

  autostartTextCues.forEach(el => {
    if (/autostart\s*:\s*true/i.test(el.id)) {
      console.log("[page] ▶ Auto-starting text cue:", el.id);
      handleCueTrigger(el.id, el);   // ✅ FIX: pass the cueElement
    }
  });

  window._currentPageSvg = svg;

  // ✅ Rebuild cueButtons for this page
  const pageContainer =
    document.getElementById("singlePage-content") ||
    document.getElementById("singlePage-container");

  if (pageContainer) {
    // remove old page buttons if any
    window._activePageButtons?.forEach(btn => btn.remove?.());
    window._activePageButtons = buildCueButtonsIn(svg, pageContainer);
    console.log(`[cuePage] 🎛 Built ${window._activePageButtons.length} cueButtons for page ${pageName}`);
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


// helper
// ------------------------------------------------------------
// handleAfterAction(ast)
// ------------------------------------------------------------
// 🔍 Purpose:
//   Executes the post-cue action defined via `after:`
//   (internally normalised as `onCompletion`).
// ------------------------------------------------------------
export function handleAfterAction(ast) {
  if (!ast?.onCompletion) return;

  const raw = ast.onCompletion;
  const control = raw.control;
  const arg = raw.arg;
  const target = raw.target;

  if (!control) return;
  console.log(`[CueDSL] 🎬 Running after-action → ${control}(${arg}${target ? "@" + target : ""})`);

  try {
    // --- Case 1: mode(scroll) ---
    if ((arg === "scroll" || arg === "scrollPaused") && target) {
      console.log(`[CueDSL] ⚙️ Exiting to scroll mode at rehearsal mark: ${target}`);

      // 1️⃣ Switch to scroll mode
      handleCueTrigger(`cueNav(mode(scroll))`);

      // 2️⃣ Wait for DOM to update, then jump
      requestAnimationFrame(() => {
        const sc = document.getElementById("scoreContainer");
        if (!sc) return;

        console.log(`[CueDSL] 🎯 Jumping to rehearsal mark after page teardown: ${target}`);
        jumpToRehearsalMark(target);

        // 3️⃣ Only resume playback if not explicitly paused
        if (arg !== "scrollPaused") {
          startPlayback();
          console.log("[CueDSL] ▶ Resuming playback (scroll mode)");
        } else {
          console.log("[CueDSL] ⏸ Scroll mode entered paused");
          window.pausePlayback?.();
        }
      });
      return;
    }


    // --- Case 2: nav(scroll) ---
    if (control === "nav") {
      console.log(`[CueDSL] 🧭 Triggering cueNav(mode(${arg}))`);
      handleCueTrigger(`cueNav(mode(${arg}))`);

      if (target) {
        console.log(`[CueDSL] 🎯 Jumping to rehearsal mark: ${target}`);
        requestAnimationFrame(() => {
          jumpToRehearsalMark(target);
          startPlayback();
        });
      }
      return;
    }

    // --- Case 3: cue(page(...)) — chained cue ---
    if (control === "cue") {
      console.log(`[CueDSL] 🔗 Triggering chained cue → ${arg}`);
      handleCueTrigger(arg);
      return;
    }

    // --- Default: pass raw to handler ---
    handleCueTrigger(`${control}(${arg})`);
  } catch (err) {
    console.warn("[CueDSL] ⚠️ Failed to execute after-action:", err);
  }
}




// ------------------------------------------------------------
// handlePageCueFromAST(ast)
// ------------------------------------------------------------
// Handles cue:page(...) pattern-based ASTs.
// Supports both simple identifiers (cue:page(page1)) and full
// SuperCollider-style pattern expressions (Pseq, Prand, Pshuf...),
// including page:duration pairs and global `after:` actions.
// ------------------------------------------------------------
export async function handlePageCueFromAST(ast) {
  const commonParams = { suppressTransition: true };

  if (!ast || !ast.pattern) {
    console.warn("[CueDSL] ⚠️ Invalid or empty AST passed to handlePageCueFromAST:", ast);
    return;
  }

  console.log("[CueDSL] 🚀 Handling cue:page AST", ast);

  // ------------------------------------------------------------
  // Helper: recursively flatten pattern AST → array of pages or {page,dur} objects
  // ------------------------------------------------------------
  const expandPattern = (patternAST) => {
    if (!patternAST) return [];

    // --- Literal ---
    if (patternAST.type === "Literal") {
      const v = patternAST.value;
      if (v && typeof v === "object" && v.page) return [v];
      if (v != null && typeof v !== "object") return [v];
      return [];
    }

    // --- Identifier wrapped in Pseq ---
    if (patternAST.type === "Pseq" && patternAST.list?.length === 1 && typeof patternAST.list[0] === "string") {
      return Array(patternAST.repeats || 1).fill(patternAST.list[0]);
    }

    // --- Pattern types ---
    switch (patternAST.type) {
      case "Pseq": {
        // Filter out stray numeric literals or nulls
        const list = patternAST.list
          .flatMap(expandPattern)
          .filter(v => v && (typeof v === "string" || v.page)); // keep only pages or ids
        const reps = patternAST.repeats === "inf" ? Infinity : Number(patternAST.repeats) || 1;
        return Array.from({ length: reps }, () => list).flat();
      }
      case "Pshuf": {
        const reps = patternAST.repeats === "inf" ? 1 : Number(patternAST.repeats) || 1;
        const list = patternAST.list
          .flatMap(expandPattern)
          .filter(v => v && (typeof v === "string" || v.page));

        // Shuffle ONCE
        const shuffled = [...list].sort(() => Math.random() - 0.5);
        const out = Array.from({ length: reps }, () => shuffled).flat();
        return out;
      }

      case "Pxrand": {
        const reps = patternAST.repeats === "inf" ? 1 : Number(patternAST.repeats) || 1;
        const list = patternAST.list
          .flatMap(expandPattern)
          .filter(v => v && (typeof v === "string" || v.page));

        // Shuffle EACH REPEAT
        const out = [];
        for (let i = 0; i < reps; i++) {
          const shuffled = [...list].sort(() => Math.random() - 0.5);
          out.push(...shuffled);
        }
        return out;
      }

      case "Prand": {
        const reps = patternAST.repeats === "inf" ? Infinity : Number(patternAST.repeats) || 1;
        const list = patternAST.list
          .flatMap(expandPattern)
          .filter(v => v && (typeof v === "string" || v.page));

        const out = [];
        for (let i = 0; i < reps; i++) {
          out.push(list[Math.floor(Math.random() * list.length)]);
        }
        return out;
      }

      case "Pchoose": {
        const reps = patternAST.repeats === "inf" ? 1 : Number(patternAST.repeats) || 1;
        const list = patternAST.list
          .flatMap(expandPattern)
          .filter(v => v && (typeof v === "string" || v.page));

        const out = [];
        for (let i = 0; i < reps; i++) {
          out.push(list[Math.floor(Math.random() * list.length)]);
        }
        return out;
      }

      case "Identifier": {
        const id = patternAST.image || patternAST.value || null;
        return id ? [id] : [];
      }
      default:
        return [];
    }
  };

  // ------------------------------------------------------------
  // Expand pattern and filter out nulls
  // ------------------------------------------------------------
  const pages = expandPattern(ast.pattern).filter(x => x != null);
  console.log("[CueDSL] ▶ Page pattern expanded to:", pages);

  if (!pages.length) {
    console.warn("[CueDSL] Empty or invalid page pattern:", ast.pattern);
    return;
  }

  // ------------------------------------------------------------
  // Sequentially play through all pages
  // ------------------------------------------------------------
  const isCancelled = () =>
    window._cuePageRunning && window.pageState?.mode === "scroll";

  for (let i = 0; i < pages.length; i++) {
    if (isCancelled()) {
      console.log("[CueDSL] Sequence stopped due to mode change.");
      return;
    }

    const item = pages[i];
    const pageId = typeof item === "object" && item.page ? item.page : item;
    const durNum = typeof item === "object" && item.dur ? Number(item.dur) : 0;

    const cue = `cuePage(${pageId})_dur(${durNum})`;
    console.log(`[CueDSL] ▶ Page ${i + 1}/${pages.length} → ${cue}`);

    await handlePageCue(cue, durNum, commonParams);
  }

  console.log("[CueDSL] cuePage pattern sequence finished.");

  // ------------------------------------------------------------
  // 🧩 Run global after: clause (if present)
  // ------------------------------------------------------------
  handleAfterAction(ast);
}

/////////////////////////////////////////////////////////////////////////////////

function handleFadeCueFromAST(ast, cueElementId) {
  console.group("[cueFade] 🎛 Handling fade cue");

  const params = Object.fromEntries(ast.args.map(a => [a.type, a.value]));

  const mode = params.mode || "in";
  const dur = Number(params.dur ?? 1);
  const from = Number(params.from ?? (mode === "in" ? 0 : 1));
  const to = Number(params.to ?? (mode === "in" ? 1 : 0));
  const ease = params.ease || "linear";
  const delay = Number(params.delay ?? 0);
  const hold = Number(params.hold ?? 0); // ⏸ pause between loops
  const targetId = params.target || "self";



  function sendFadeOSC(value) {
    const oscFlag = Number(params.osc ?? 1);
    if (!window.OSC_ENABLED || !oscFlag) return;
    if (!window.wsEnabled || !window.socket || window.socket.readyState !== WebSocket.OPEN) return;

    const message = {
      type: "osc_fade",
      uid,
      value,
      timestamp: Date.now(),
    };

    window.socket.send(JSON.stringify(message));
    console.debug("[OSC] 🎚 Sent fade update:", message);
  }

  //  Resolve target: "self" defaults to element containing this cue
  let target = null;

  if (targetId === "self") {
    if (typeof cueElementId === "string") {
      target =
        document.getElementById(cueElementId) ||
        window.svgElement?.getElementById?.(cueElementId);
    } else if (cueElementId instanceof Element) {
      target = cueElementId;
    }
  } else {
    // Try HTML first, then inside the loaded SVG
    target =
      document.getElementById(targetId) ||
      window.svgElement?.getElementById?.(targetId);
  }

  //  fallback
  if (!target) {
    target =
      document.querySelector(`[data-id="${ast.type}"]`) ||
      document.getElementById("scoreContainer") ||
      window.svgElement ||
      document.body;
  }

  if (!target || !(target instanceof Element)) {
    console.warn(`[cueFade] No valid target found for ID '${targetId}', aborting.`);
    console.groupEnd();
    return;
  }

  console.log(
    `[cueFade] mode=${mode}, dur=${dur}s, hold=${hold}s, from=${from}, to=${to}, ease=${ease}, delay=${delay}s`
  );
  console.log("[cueFade] Target element:", target);

  anime.remove(target);
  target.style.opacity = from;


  //  Resolve and normalize UID once for OSC and logging
  let uid = params.uid || null;

  if (!uid) {
    // Prefer target.id if valid, otherwise fall back to cueElementId
    uid =
      target?.id ||
      cueElementId?.replace(/^cue:/, "") ||
      targetId?.replace(/^cue:/, "") ||
      "unknown";
  }

  // Sanitize for OSC address
  uid = String(uid).replace(/[^a-zA-Z0-9_\-]/g, "");


  const commonProps = {
    targets: target,
    easing: ease,
    duration: dur * 1000,
    delay: delay * 1000,
    begin: () => console.log("[cueFade] ▶ Fade begin"),
    update: anim => {
      const current = parseFloat(anim.animations?.[0]?.currentValue || 0);
      sendFadeOSC(current);
    },
    complete: () => {
      sendFadeOSC(to);
      console.log("[cueFade] ✅ Fade complete");
    },
  };



  // Switch by mode
  switch (mode) {
    case "in":
    case "out":
      anime({ ...commonProps, opacity: [from, to] });
      break;

    case "inout":
      anime({ ...commonProps, opacity: [from, to], direction: "alternate", loop: 2 });
      break;

    case "pulse": {
      const ms = dur * 1000;
      anime({
        ...commonProps,
        opacity: [from, to],
        direction: "alternate",
        loop: true,
        easing: ease || "easeInOutSine",
        duration: ms,
        endDelay: hold * 1000,
      });
      break;
    }

    case "pulseSlow":
      anime({
        ...commonProps,
        opacity: [from, to],
        direction: "alternate",
        loop: true,
        easing: "easeInOutSine",
        duration: dur * 2000,
        endDelay: hold * 1000, // ⏸ pause between each cycle
      });
      break;

    case "pulseFast":
      anime({
        ...commonProps,
        opacity: [from, to],
        direction: "alternate",
        loop: true,
        easing: "easeInOutSine",
        duration: dur * 500,
        endDelay: hold * 1000, // ⏸ pause between each cycle
      });
      break;

    case "strobe":
      anime({
        ...commonProps,
        opacity: [from, to],
        loop: true,
        direction: "alternate",
        duration: dur * 100,
        easing: "steps(2)",
        endDelay: hold * 1000, // ⏸ pause between strobes
      });
      break;

    case "blink": {
      console.log("[cueFade] ⚡ Blink mode (native setInterval + OSC)");

      const cycle = dur * 1000;
      const half = cycle / 2;
      let visible = false;

      if (target._blinkTimer) clearInterval(target._blinkTimer);

      target._blinkTimer = setInterval(() => {
        visible = !visible;
        const value = visible ? to : from;
        target.style.opacity = value;
        sendFadeOSC(value); // 🔊 send only on change
      }, half);

      const timeLimit = Number(params.time || params.hold || 0);
      if (timeLimit > 0) {
        setTimeout(() => {
          clearInterval(target._blinkTimer);
          target.style.opacity = from;
          sendFadeOSC(from);
          console.log(`[cueFade] ⏹ Blink auto-stopped after ${timeLimit}s`);
        }, timeLimit * 1000);
      }
      break;
    }

    case "stop":
      console.log(`[cueFade] ⏹ Stopping fade on target: ${target.id || target}`);
      anime.remove(target);
      clearInterval(target._blinkTimer);
      target.style.opacity = from ?? 0;
      break;

    default:
      console.warn(`[cueFade] ⚠️ Unknown fade mode: ${mode}`);
      break;
  }

  // 🕒 Optional global auto-stop (applies to any looping mode)
  const timeLimit = Number(params.time || 0);
  if (timeLimit > 0 && ["blink", "pulseSlow", "pulseFast", "strobe"].includes(mode)) {
    setTimeout(() => {
      anime.remove(target);
      clearInterval(target._blinkTimer);
      target.style.opacity = from;
      console.log(`[cueFade] ⏹ Auto-stopped after ${timeLimit}s`);
    }, timeLimit * 1000);
  }

  console.groupEnd();
}

import { getStopwatchTime } from "./stopwatch.js";

export function handleStopwatchCue(ast, cueElement = null) {
  // 1️⃣ Extract parameters
  const params = {};
  for (const p of ast.args || []) params[p.type] = p.value;

  const hold = Number(params.hold || 0);
  const followScroll = params.scroll === true || params.scroll === "true";
  const offsetX = Number(params.offsetX || 0);
  const sourceType = params.source || "main";
  const styleString = params.style ? params.style.replace(/^['"]|['"]$/g, "") : null;

  console.log("[cueStopwatch] Params →", params, "→ source:", sourceType);

  // 2️⃣ Get container + target
  const score = document.getElementById("scoreContainer");
  if (!score) return console.warn("[cueStopwatch] No score container found.");
  if (!cueElement) return console.warn("[cueStopwatch] No cueElement provided.");

  // 3️⃣ Bounding boxes
  const bbox = cueElement.getBoundingClientRect();
  const containerBox = score.getBoundingClientRect();
  const scrollX = score.scrollLeft || 0;
  const scrollY = score.scrollTop || 0;

  const x = (followScroll
    ? bbox.left - containerBox.left + scrollX
    : bbox.left) + offsetX;
  const y = (followScroll
    ? bbox.top - containerBox.top + scrollY - 10
    : bbox.top - 10);

  // 4️⃣ Choose / create the overlay
  const divId = `cue-stopwatch-${sourceType}`;
  let div = document.getElementById(divId);
  let startTime = Date.now();
  let intervalId;

  if (div) {
    // already exists → reuse
    console.log(`[cueStopwatch] Reusing existing ${divId}, resetting timer`);
    div.textContent = "00:00";
    div.style.opacity = "1";
    div.style.transition = "none";
    startTime = Date.now(); // reset
    // clear any prior interval marker
    if (div._intervalId) clearInterval(div._intervalId);
  } else {
    // create new overlay
    div = document.createElement("div");
    div.id = divId;
    div.className = "cue-stopwatch-display";
    div.style.position = followScroll ? "absolute" : "fixed";
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.style.transform = "translate(0%, -100%)";

    if (styleString) {
      styleString.split(";").forEach(rule => {
        const [prop, val] = rule.split(":").map(s => s && s.trim());
        if (prop && val) div.style[prop] = val;
      });
    }

    if (followScroll) score.appendChild(div);
    else document.body.appendChild(div);
  }

  // 5️⃣ Timer logic
  if (sourceType === "main") {
    div.textContent = getStopwatchTime();
    intervalId = setInterval(() => {
      div.textContent = getStopwatchTime();
      if (followScroll) {
        const b = cueElement.getBoundingClientRect();
        const sx = score.scrollLeft || 0;
        const sy = score.scrollTop || 0;
        div.style.left = `${b.left - containerBox.left + sx + offsetX}px`;
        div.style.top = `${b.top - containerBox.top + sy - 10}px`;
      }
    }, 1000);
  } else if (sourceType === "new") {
    intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const s = String(elapsed % 60).padStart(2, "0");
      div.textContent = `${m}:${s}`;
    }, 1000);

    if (!hold) {
      div.style.cursor = "pointer";
      div.onclick = () => {
        clearInterval(intervalId);
        div.remove();
      };
    }
  }

  // store interval for reuse clearing
  div._intervalId = intervalId;

  // 6️⃣ Auto-fade if hold > 0
  if (hold > 0) {
    setTimeout(() => {
      clearInterval(intervalId);
      div.style.transition = "opacity 1s ease";
      div.style.opacity = "0";
      setTimeout(() => div.remove(), 1000);
    }, hold * 1000);
  }

  console.log(
    `[cue:stopwatch] ⏱ source=${sourceType}, hold=${hold}s, scroll=${followScroll}, offsetX=${offsetX}`
  );
}

// ------------------------------------------------------------
//  handleVideoCueFromAST(ast, cueElement)
// ------------------------------------------------------------
// Plays a video from window.videoDir according to cue:video(...) params.
// Supported params:
// file:, size:, loop:, hold:, speed:, offsetX:, offsetY:, location:(fixed|scroll),
// target:(uid), in:, out:, fadeIn:, fadeOut:, opacity:, audio:(0|1)

export function handleVideoCueFromAST(ast, cueElement = null) {
  if (!ast?.params) return console.error("[cueVideo] ❌ Missing AST params.");

  const p = ast.params;
  if (!p.file) return console.error("[cueVideo] ❌ Missing required 'file' parameter.");

  // --- Build source path
  let fileName = p.file.trim();
  if (!fileName.match(/\.(mp4|webm|ogg)$/)) fileName += ".mp4";
  const src = `${window.videoDir}${fileName}`;

  // --- Unique key and instance control
  const key = `${p.file}_${p.target || "none"}`;
  const allowNewInstance = Boolean(p.uid) || p.new === "1" || p.new === 1;

  const existing = !allowNewInstance
    ? document.querySelector(`video[data-key="${key}"]`)
    : null;

  if (existing) {
    console.log(`[cueVideo] 🔁 Reusing existing instance for ${key}`);
    existing.currentTime = Number(p.in || 0);
    existing.playbackRate = Number(p.speed) || 1;
    existing.muted = !(p.audio === "1" || p.audio === 1 || p.audio === "true" || p.audio === true);
    existing.style.opacity = p.opacity ? Number(p.opacity) : 1;
    existing.play();
    return;
  }

  // --- Create video element
  const vid = document.createElement("video");
  vid.classList.add("cue-video");

  const vsize = p.vsize?.toLowerCase?.();
  if (vsize === "fs" || vsize === "fullscreen") {
    vid.classList.add("cue-video-fullscreen");
  }

  const uid = p.uid || `video-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
  vid.id = uid;
  vid.dataset.uid = uid;
  vid.dataset.key = key;
  vid.src = src;
  vid.autoplay = true;
  vid.playsInline = true;
  vid.muted = !(p.audio === "1" || p.audio === 1 || p.audio === "true" || p.audio === true);
  vid.controls = false;
  vid.loop = false;
  vid.playbackRate = Number(p.speed) || 1;
  vid.style.position = p.location === "fixed" ? "fixed" : "absolute";
  vid.style.cursor = "pointer";
  vid.style.zIndex = 9999;
  vid.style.border = "none";
  vid.style.opacity = p.fadeIn ? 0 : p.opacity ? Number(p.opacity) : 1;
  vid.style.transition = "opacity 0.5s ease";

  console.log(`[cueVideo] 🎬 Creating ${allowNewInstance ? "new" : "reused"} instance → ${key} (uid:${uid})`);

  // --- Geometry base
  const score = document.getElementById("scoreContainer");
  const scrollX = score?.scrollLeft || 0;
  const scrollY = score?.scrollTop || 0;
  const containerBox = score?.getBoundingClientRect?.() || { left: 0, top: 0 };

  const targetEl = p.target ? document.getElementById(p.target) : null;
  const baseEl = targetEl || cueElement;
  const offsetX = Number(p.offsetX) || 0;
  const offsetY = Number(p.offsetY) || 0;

  let x = 100, y = 100;
  if (baseEl?.getBoundingClientRect) {
    const bbox = baseEl.getBoundingClientRect();
    const centerX = bbox.left + bbox.width / 2;
    const centerY = bbox.top + bbox.height / 2;

    if (p.location === "scroll") {
      // relative to scrollable content
      x = centerX - containerBox.left + scrollX + offsetX;
      y = centerY - containerBox.top + scrollY + offsetY;
    } else {
      // fixed to viewport, preserve sign of offsets
      x = centerX + offsetX;
      y = centerY + offsetY;
    }
  }

  // --- Size and positioning
  let vidW = 320, vidH = 180;
  const size = p.size?.toLowerCase?.();

  if (size === "fs" || size === "fullscreen") {
    Object.assign(vid.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      margin: "0",
      padding: "0",
      pointerEvents: "none",
    });
    // Re-enable click handling only if explicitly requested
    if (p.clickable === "1" || p.clickable === 1) vid.style.pointerEvents = "auto";
  } else if (typeof p.size === "string" && p.size.includes("x")) {
    const [w, h] = p.size.split("x").map(Number);
    if (!isNaN(w)) vidW = w;
    if (!isNaN(h)) vidH = h;
  } else if (!isNaN(p.size)) {
    vidW = Number(p.size);
  }

  vid.width = vidW;
  vid.height = vidH;

  // Only center if not fullscreen
  if (size !== "fs" && size !== "fullscreen") {
    vid.style.left = `${x - vidW / 2}px`;
    vid.style.top = `${y - vidH / 2}px`;
  }

  // --- Append
  const container = document.getElementById("videoLayer") || document.body;
  if (p.location === "scroll" && score) score.appendChild(vid);
  else container.appendChild(vid);

  console.log(`[cueVideo] ▶️ ${src} (size:${size || `${vidW}x${vidH}`}, speed:${vid.playbackRate}x, target:${p.target || "(none)"})`);

  // --- Timing & fade parameters
  const fadeInDur = Number(p.fadeIn || 0);
  const fadeOutDur = Number(p.fadeOut || 0);
  const inTime = Number(p.in || 0);
  const outTime = Number(p.out || 0);
  const opacityTarget = Number(p.opacity || 1);
  const totalHold = p.hold ? Number(p.hold) * 1000 : null;

  let loopCount = 0;
  const maxLoops = Number(p.loop) || 1;

  // --- Cleanup
  function removeVideo() {
    try {
      vid.pause();
      if (vid._scrollHandler && score)
        score.removeEventListener("scroll", vid._scrollHandler);
      vid.remove();
      console.log(`[cueVideo] 🧹 Removed ${uid}`);
      emitCueComplete?.(uid, "cueVideo");
    } catch (err) {
      console.warn("[cueVideo] ⚠️ Error removing video:", err);
    }
  }

  // --- Scroll tracking (non-fullscreen)
  if (p.location === "scroll" && baseEl && score && size !== "fs" && size !== "fullscreen") {
    const updatePos = () => {
      const bbox = baseEl.getBoundingClientRect();
      const sx = score.scrollLeft || 0;
      const sy = score.scrollTop || 0;
      vid.style.left = `${bbox.left - containerBox.left + sx + bbox.width / 2 - vidW / 2 + offsetX}px`;
      vid.style.top = `${bbox.top - containerBox.top + sy + bbox.height / 2 - vidH / 2 + offsetY}px`;
    };
    vid._scrollHandler = updatePos;
    score.addEventListener("scroll", updatePos);
  }

  // --- Handle video timing, fades, and in/out offsets
  vid.style.visibility = "hidden"; // hide the element to prevent the first frame flash

  vid.addEventListener("loadedmetadata", () => {

    //  SEEK TO START ("in:" parameter)

    if (inTime > 0) {
      vid.pause(); // stop autoplay so we can seek safely
      vid.currentTime = inTime; // jump to desired start position in seconds

      // Wait until the seek completes before revealing or playing
      vid.addEventListener(
        "seeked",
        () => {
          vid.style.visibility = "visible"; // show the video only after the seek is complete
          vid.play(); // now begin playback from the desired inTime

          //  FADE IN

          if (fadeInDur > 0) {
            vid.style.opacity = 0;
            vid.animate([{ opacity: 0 }, { opacity: opacityTarget }], {
              duration: fadeInDur * 1000,
              fill: "forwards",
              easing: "ease-out",
            });
          } else {
            vid.style.opacity = opacityTarget; // no fade → set opacity immediately
          }

          //  FADE OUT (based on "out:" and "fadeOut:" parameters)
          // --------------------------
          if (outTime > 0) {
            // start fade out slightly before the outTime so fade completes by that time
            const fadeOutStart = Math.max((outTime - fadeOutDur) * 1000, 0);
            setTimeout(() => {
              vid.animate([{ opacity: opacityTarget }, { opacity: 0 }], {
                duration: fadeOutDur * 1000,
                fill: "forwards",
                easing: "ease-in",
              });
            }, fadeOutStart);
          }
        },
        { once: true } // ensures the event handler runs only once
      );
    }

    //  NO "in:" PARAMETER — PLAY IMMEDIATELY
    // --------------------------
    else {
      vid.style.visibility = "visible"; // show right away
      vid.play();

      // --- Fade in
      if (fadeInDur > 0) {
        vid.style.opacity = 0;
        vid.animate([{ opacity: 0 }, { opacity: opacityTarget }], {
          duration: fadeInDur * 1000,
          fill: "forwards",
          easing: "ease-out",
        });
      } else {
        vid.style.opacity = opacityTarget;
      }

      // --- Fade out
      if (outTime > 0) {
        const fadeOutStart = Math.max((outTime - fadeOutDur) * 1000, 0);
        setTimeout(() => {
          vid.animate([{ opacity: opacityTarget }, { opacity: 0 }], {
            duration: fadeOutDur * 1000,
            fill: "forwards",
            easing: "ease-in",
          });
        }, fadeOutStart);
      }
    }
  });


  // --- Looping & removal
  if (p.loop === 0 || p.loop === "0") {
    vid.loop = true;
  } else if (maxLoops > 1) {
    vid.addEventListener("ended", () => {
      loopCount++;
      if (loopCount < maxLoops) {
        vid.currentTime = inTime;
        vid.play();
      } else removeVideo();
    });
  } else {
    vid.addEventListener("ended", removeVideo);
  }

  if (totalHold && totalHold > 0) {
    setTimeout(removeVideo, totalHold);
  }

  vid.addEventListener("click", removeVideo);
}


// Kick all animations inside a standalone page SVG
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

      updateModeToggleUI();

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
      updateModeToggleUI();

      // 🧹 Clean up and load next
      window._activePageButtons?.forEach(btn => btn._destroyCueButton?.());
      window._activePageButtons = [];
      content.innerHTML = "";
      handleCueTrigger(`cuePage(${next})`);
    }, 500);
    return;
  }

  // Case: return to scrolling score (_return or popup)
  // -------------------------------------------------------------
  if (!window.isCuePagePlaylistActive && (ret || mode === "popup")) {
    window.returnToScrollingScore?.();
    return;
  }

  // Case: persistent page mode
  // -------------------------------------------------------------
  console.log("[cuePage] Holding page mode.");
  ps.mode = "page";
  updateModeToggleUI();

}

window.returnToScrollingScore = function returnToScrollingScore() {
  console.log("[cuePage] Returning to scrolling score.");

  const container = document.getElementById("singlePage-container");
  const content = document.getElementById("singlePage-content");
  const mainScore = document.getElementById("scoreInner");
  const ps = window.pageState || (window.pageState = { mode: "scroll", current: null });

  if (!container || !content) {
    console.warn("[cuePage] ⚠️ No page overlay present — just resuming scroll.");
    ps.mode = "scroll";
    updateModeToggleUI();

    ps.current = null;
    resumeScrollScore?.();
    return;
  }

  container.style.transition = "opacity 0.5s ease";
  container.style.opacity = "0";

  setTimeout(() => {
    // ✅ Remove any leftover cue buttons safely
    window._activePageButtons?.forEach(btn => btn._destroyCueButton?.());
    window._activePageButtons = [];

    container.style.display = "none";
    content.innerHTML = "";

    ps.mode = "scroll";
    updateModeToggleUI();

    ps.current = null;

    if (mainScore) {
      mainScore.style.opacity = "1";
      mainScore.style.pointerEvents = "auto";
    }

    resumeScrollScore?.();
  }, 500);
};




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

  // ✅ If we arrived here from nav(mode:scrollPaused@X)
  if (window._resumeAfterJump === false) {
    console.log("[cuePage] ⏸ Staying paused after jump (scrollPaused mode).");

    // Ensure playback remains paused
    window.isPlaying = false;
    window.animationPaused = true;
    window.isMusicalPause = true;

    // Ensure remote sync does NOT resume playback
    window.ignoreNextSync = true;

    // Ensure stopwatch is paused
    window.pauseStopwatch?.();

    // ✅ Reset so next resumeScrollScore() isn't blocked
    window._resumeAfterJump = null;
    return;
  }

  // ✅ Normal resume (mode(scroll) or general resume)
  window.ignoreNextSync = true;
  window.isPlaying = true;
  window.isMusicalPause = false;

  if (typeof window.resumePlayback === "function") {
    window.resumePlayback();
  } else if (typeof window.startPlayback === "function") {
    window.startPlayback();
  }

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

  // ✅ Reset flag so future scroll resumes behave normally
  window._resumeAfterJump = null;

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
    if (voice.filename !== filename) continue;
    try { voice.stop?.(fadeOutSec); } catch { }
    reg.delete(key);
    window.dispatchEvent(new CustomEvent("oscilla:audio", {
      detail: { uid: key, file: filename, state: "stop" }
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

  // Fade-out duration for global stop (seconds)
  const GLOBAL_FADE = 0.15;

  for (const voice of Array.from(active)) {
    try {
      // Each voice has its own stop(fadeOut)
      voice.stop?.(GLOBAL_FADE);
      active.delete(voice);

      window.dispatchEvent(new CustomEvent("oscilla:audio", {
        detail: { uid: voice.uid, state: "stop" }
      }));

      console.log(`[AUDIO] 🔻 Force-stopped ${voice.filename}`);
    } catch (err) {
      console.warn(`[AUDIO] ❌ Stop failed on ${voice.filename}:`, err);
    }
  }

  // Optional OSC network broadcast
  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    window.socket.send(JSON.stringify({
      type: "osc_audio_stopAll",
      timestamp: Date.now()
    }));
  }

  console.log("[AUDIO] ✅ All audio voices cleared.");
});




export function resetTriggeredCues() {
  if (window.triggeredCues)
    window.triggeredCues.clear();
  window._cueInsideState?.clear();
}


// window.getPlayheadX = function () {
//   const playhead = document.getElementById("playhead");
//   const scoreContainer = window.scoreContainer;
//   if (!playhead || !scoreContainer) return null;

//   const containerRect = scoreContainer.getBoundingClientRect();
//   const playheadRect = playhead.getBoundingClientRect();
//   return playheadRect.left - containerRect.left;
// };


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
  // 🔒 Global cue suppression guard (jumping, scrubbing, loading, etc.)
  if (window.suppressCueTriggers) return;

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
      handleCueTrigger(
        cue.ast,       // ✅ the real cue data for scroll-triggered cues
        false,         // isRemote
        true,          // force
        cue.element    // ✅ so UI flashes work later
      );
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


window.resetCueEdgeTracking = function () {
  window._prevCueLefts = new Map();
  window._cueInsideState = new Map();
  window.triggeredCues = new Set();
};






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

// // Robustly extract cueButton(...) inner content even if the ID has suffixes like -uid...
// function extractCueButtonInner(id) {
//   const key = "cueButton(";
//   const start = id.indexOf(key);
//   if (start === -1) return null;
//   let i = start + key.length, depth = 1;
//   for (; i < id.length; i++) {
//     const ch = id[i];
//     if (ch === "(") depth++;
//     else if (ch === ")") {
//       depth--;
//       if (depth === 0) {
//         // inner is between start+key.length and i (exclusive)
//         return id.slice(start + key.length, i);
//       }
//     }
//   }
//   return null; // unbalanced
// }






export function destroyAllCueButtons() {
  document.querySelectorAll(".oscilla-cue-button").forEach(btn => {
    try {
      btn._destroyCueButton?.();   // ✅ cancel raf, listeners, restore SVG visibility
    } catch (e) { }

    btn.remove();                  // ✅ ensure DOM cleared
  });

  console.log("[cueButtons] 🧹 Cleared all cue buttons");
}
export function buildCueButtonsIn(svgRoot, containerEl) {
  if (!svgRoot || !containerEl) return [];

  const built = [];
  const elements = svgRoot.querySelectorAll('[id^="button("]');

  console.log("[cueButton:build] Found", elements.length, "button() element(s)");

  elements.forEach(el => {
    const cueExpr = el.id.trim();
    console.log("\n[cueButton:scan] id=", cueExpr);

    let ast;
    try {
      ast = parseCueToAST(cueExpr);
    } catch (e) {
      console.warn("[cueButton] ❌ parse failed:", cueExpr, e);
      return;
    }

    console.log("[cueButton] Parsed AST:", ast);

    if (!ast || ast.type !== "cueButton") return;

    const triggerAst = ast.triggerAst || ast.trigger;
    if (!triggerAst) {
      console.warn("[cueButton] ❌ Missing triggerAst:", cueExpr);
      return;
    }

    // ✅ FIXED LABEL LOGIC (NO TEXTCONTENT, NO RAW ID FALLBACK)
    const label =
      (ast.label && ast.label.trim()) ||
      (triggerAst.uid && String(triggerAst.uid).trim()) ||
      (triggerAst.action && String(triggerAst.action).trim()) ||
      (triggerAst.page && String(triggerAst.page).trim()) ||
      "button";

    console.log("[cueButton] label resolved →", label);

    const btn = createCueButtonForElement(el, {
      triggerAst,
      label,
      opt: { ...ast.opt, containerEl }
    });

    if (btn) built.push(btn);
  });

  console.log("[cueButton:build] ✅ Finished. Total created:", built.length);
  return built;
}



export function createCueButtonForElement(cueSvgEl, { triggerAst, label = "", opt = {} }) {
  if (!triggerAst) {
    console.warn("[cueButton] ⚠ Missing triggerAst — cannot build button:", cueSvgEl?.id);
    return null;
  }
  const containerEl = opt.containerEl ||
    document.getElementById("singlePage-content") ||
    document.getElementById("scoreInner");

  if (!containerEl) {
    console.warn("[cueButton] ⚠ No container available for cueButton:", cueSvgEl?.id);
    return null;
  }

  // hide source marker
  cueSvgEl.style.visibility = "hidden";
  cueSvgEl.style.pointerEvents = "none";

  // create button
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.className = "oscilla-cue-button";

  // apply sizing
  const toPx = (v, fallback) => (v == null ? fallback : (Number.isFinite(+v) ? `${+v}px` : String(v)));
  Object.assign(btn.style, {
    position: "absolute",
    width: toPx(opt.width, "100px"),
    height: toPx(opt.height, "40px"),
    fontSize: toPx(opt.fontSize ?? 14, "14px"),
    borderRadius: toPx(opt.radius ?? 4, "4px"),
    cursor: "pointer",
    zIndex: 2000
  });

  containerEl.appendChild(btn);

  // place button
  const place = () => {
    const r = cueSvgEl.getBoundingClientRect();
    const c = containerEl.getBoundingClientRect();
    btn.style.left = `${r.left - c.left + (opt.offsetX || 0)}px`;
    btn.style.top = `${r.top - c.top + (opt.offsetY || 0)}px`;
  };
  requestAnimationFrame(place);
  window.addEventListener("resize", place);

  // handle trigger
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleCueTrigger(triggerAst, false, true, cueSvgEl);
  });

  return btn;
}



export function handleNavCue(ast) {
  const dbg = (...a) => console.log("[cueNav]", ...a);

  // --- Normalize AST (support legacy key/value) ---
  // New form: { action, target }
  // Old form: { key, value, target }  (e.g., key:"page", value:"page3")
  let action = ast.action ?? null;
  let target = ast.target ?? null;

  if (!action && ast.key) {
    if (ast.key === "mode") {
      // legacy nav(mode:scroll@X)
      action = ast.value || "scroll";
      target = ast.target ?? null;
    } else if (ast.key === "page") {
      // legacy nav(page:page3)
      action = ast.value || null; // becomes the page/rehearsal name
      target = ast.target ?? null;
    }
  }

  dbg("→", { action, target, uid: ast.uid ?? null });

  if (!action) return;   // Guard: nothing to do

  // SCROLL MODE (auto-resume)
  // ------------------------------------------------------------
  // SCROLL MODE (auto-resume)
  if (action === "scroll") {
    window._resumeAfterJump = true;

    // ✅ Leave page-mode view if active
    window.returnToScrollingScore?.();

    // ✅ Jump if target provided
    if (target) {
      window.jumpToRehearsalMark?.(target);
    }

    return;
  }

  // SCROLL MODE PAUSED (stay paused but show score)
  if (action === "scrollPaused") {
    window._resumeAfterJump = false;

    // ✅ Leave page-mode view if active
    window.returnToScrollingScore?.();

    if (target) {
      window.jumpToRehearsalMark?.(target);
    }

    // stays paused
    return;
  }

  // DIRECT PAGE / REHEARSAL JUMP
  // ------------------------------------------------------------
  if (typeof window.handleCueTrigger === "function") {
    // Treat `action` as the page/marker name
    window._resumeAfterJump = true;
    window.handleCueTrigger(`page(${action})`);
    return;
  }

  // Fallback: jump directly if no cue dispatcher is available
  window._resumeAfterJump = true;
  window.jumpToRehearsalMark?.(action);
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
  handleCueTrigger(triggerAst, false, true, cueSvgEl);
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











