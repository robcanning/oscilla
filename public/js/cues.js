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
  cueAudio: handleAudioCue,
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
};

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

  const { type, cueParams } = parseCueParams(cueId);
  console.log(`[parseCueParams] Final cue type: ${type}`);
  console.log(`[parseCueParams] Final cueParams:`, cueParams);

  if (!cueHandlers.hasOwnProperty(type)) {
    console.warn(`[CLIENT] No handler found for cue type: ${type}`);
    return;
  }

  const handler = cueHandlers[type];
  if (!handler) {
    console.warn(`[CLIENT] Cue type '${type}' has no defined function.`);
    return;
  }

  // Invoke the appropriate cue handler
  if (type === "cueSpeed") {
    const speed = cueParams.speed ?? cueParams.Speed ?? cueParams.choice;
    if (!speed || isNaN(speed)) {
      console.warn(`[CLIENT] Invalid or missing speed in cueSpeed: ${cueId}`);
      return;
    }
    handler(cueId, Number(speed));
  } else if (type === "cuePause") {
    const durationSec = cueParams.duration ?? cueParams.dur ?? cueParams.choice;
    const durationMs = Number(durationSec) * 1000;
    if (!durationMs || isNaN(durationMs)) {
      console.error(`[CLIENT] Invalid duration for cuePause: ${cueId}`);
      return;
    }
    handler(cueId, durationMs);
  } else if (type === "cueChoice") {
    if (cueParams.choice && cueParams.dur) {
  console.log(`[CUE] Triggering cue handler: ${type}`);
      handler(cueId, cueParams);
    } else {
      console.error(`[CLIENT] Invalid cueChoice: missing 'choice' or 'dur' param`);
    }
  } else if (type === "cuePage") {
  // --- Robustly extract everything inside cuePage(...)
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


  // Normal single page cue (legacy behaviour)
  let animDuration = Number(cueParams.dur);
  if (isNaN(animDuration) || animDuration < 0) animDuration = 0;
  const pageName = cueParams.choice || cueId.match(/cuePage\(([^)]+)\)/)?.[1];
  if (!pageName) {
    console.error(`[CLIENT] cuePage missing page name: ${cueId}`);
    return;
  }
  const animationPath = `animations/${pageName}.svg`;
  handler(cueId, animationPath, animDuration);
}

 else {
  console.log(`[CUE] Triggering cue handler: ${type}`);
    handler(cueId, cueParams);
  }

  // Mark and optionally broadcast the cue
  if (!window.triggeredCues.has(cueId)) {
    window.triggeredCues.add(cueId);
    if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN && !isRemote) {
      window.socket.send(JSON.stringify({ type: 'cueTriggered', cueId }));
      console.log(`[CLIENT] Sent cue trigger to server: ${cueId}`);
    }
  }
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
    console.log(`[DEBUG] Ignoring pause cue '${cueId}' during seeking.`);
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

// export function hidePauseCountdownUI() {
//   const pauseCountdown = document.getElementById("pause-countdown");
//   if (pauseCountdown) {
//     pauseCountdown.classList.add("hidden");
//     pauseCountdown.style.display = "none";
//     const pauseTime = document.getElementById("pause-time");
//     if (pauseTime) pauseTime.textContent = "";
//     console.log("[DEBUG] Pause countdown UI hidden.");
//   }
// }

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

  if (!isNaN(window.playheadX) && window.playheadX > 0) {
    console.log(`[DEBUG] Resuming from playheadX: ${window.playheadX}`);
  } else {
    console.error(`[ERROR] Invalid playheadX: ${window.playheadX}. Aborting resume.`);
    return;
  }

  window.updatePosition?.();
  window.updateSeekBar?.();
  window.updateStopwatch?.();

 window.isPlaying = true;
window.animationPaused = false;
window.ignoreSyncPlayback = false;
window.togglePlayButton?.();
console.log("[DEBUG] Calling startAnimation() from resumePlayback()");
window.startAnimation?.();
window.startStopwatch?.();

  
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
    console.log("[assignCues] No assignCues(...) groups found in SVG.");
  } else {
    console.log(`[assignCues] Found ${cueGroups.length} cue group(s).`);
  }

  cueGroups.forEach(group => {
    console.log(`[assignCues] Raw group ID: '${group.id}'`);

    const baseId = group.id.split('-')[0];
    const match = baseId.match(/^assignCues\((.+)\)$/);

    if (!match) {
      console.warn(`[assignCues] Skipping malformed group ID: ${group.id}`);
      return;
    }

    const instruction = match[1].trim();
    console.log(`[assignCues] Processing group: ${group.id} with ${group.children.length} child(ren)`);

    // 1. Special case: cueOscSet(param, rnd[...] / ypos[...])
    const setMatch = instruction.match(/^cueOscSet\(([^,]+),\s*(rnd|ypos)\[([\d.]+),([\d.]+)\]\)$/);
    if (setMatch) {
      const param = setMatch[1].trim();
      const mode = setMatch[2];
      const min = parseFloat(setMatch[3]);
      const max = parseFloat(setMatch[4]);
      const bbox = group.getBBox();

      console.log(`[assignCues] → cueOscSet(${param}, ${mode}[${min}, ${max}])`);

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
        console.log(`[assignCues] [${index}] → ${child.tagName} → ${cueId}`);
      });
      return;
    }

    // 2. General case: cueOscTrigger(rnd[1,9]), etc.
    const cueMatch = instruction.match(/^([a-zA-Z][a-zA-Z0-9]*)\((rnd|ypos)\[([\d.]+),([\d.]+)\]\)$/);
    console.log(`[assignCues] cueMatch result:`, cueMatch);

    if (!cueMatch) {
      console.warn(`[assignCues] ❌ Invalid syntax: ${group.id}`);
      return;
    }

    const cueType = cueMatch[1];
    const mode = cueMatch[2];
    const min = parseFloat(cueMatch[3]);
    const max = parseFloat(cueMatch[4]);
    const bbox = group.getBBox();

    console.log(`[assignCues] → ${cueType}(${mode}[${min}, ${max}])`);

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

console.log(`[assignCues] [${index}] → ${child.tagName} → ${cueId}`);
    });
  });

  // 🔁 Additional pass: walk all children for standalone cue IDs
  function walkForCueElements(node) {
    for (const child of node.children) {
      const id = child.id;
      if (id?.startsWith("cue") && !cuesArray.some(c => c.id === id && c.element)) {
        const bbox = child.getBBox?.();
        cuesArray.push({
          id: id,
          element: child,
          triggered: false,
          ...(bbox && { x: bbox.x, width: bbox.width })
        });
        console.log(`[assignCues] ➕ Added external cue: ${id}`);
      } else if (id?.includes("cue") && !id.startsWith("cue")) {
        console.warn(`[assignCues] ⚠️ Skipped suspicious cue-like ID: ${id}`);
      }
      walkForCueElements(child); // recurse
    }
  }

  walkForCueElements(svgRoot);

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



/**
 * getSpeedForPosition(xPosition)
 * 
 * Determines the correct speed multiplier based on the nearest previous cueSpeed.
 * Used when seeking, rewinding, or jumping to a new location in the score.
 * Defaults to 1.0x if no matching cue is found.
 * 
 * @param {number} xPosition - The scroll/playhead X position
 * @returns {number} speedMultiplier
 */
export function getSpeedForPosition(xPosition) {
  const viewportOffset = window.scoreContainer?.offsetWidth / 2 || 0; // Center of the screen
  const adjustedPlayheadX = xPosition + viewportOffset;

  if (!window.speedCueMap || window.speedCueMap.length === 0) {
    console.warn("[WARNING] No speed cues exist. Defaulting to 1.0x speed.");
    return 1.0;
  }

  const lastSpeedCue = window.speedCueMap
    .filter(cue => cue.position <= adjustedPlayheadX)
    .slice(-1)[0];

  if (lastSpeedCue) {
    // console.log(`[DEBUG] ✅ Applying Speed: ${lastSpeedCue.multiplier} (From Cue at ${lastSpeedCue.position})`);
    window.speedMultiplier = lastSpeedCue.multiplier;
    window.updateSpeedDisplay?.();
    return window.speedMultiplier;
  } else {
    console.log("[DEBUG] ❗ No previous speed cue found, defaulting to 1.0");
    return 1.0;
  }
}


/**
 * preloadSpeedCues()
 * 
 * Scans the score for all cueSpeed elements and populates window.speedCueMap.
 * Cues must use ID format like `speed_1.2`, `speed_0.75`, etc.
 * Used to enable accurate speed restoration during seek or jump.
 */
export function preloadSpeedCues() {
  window.speedCueMap = [];

  const elements = document.querySelectorAll('[id^="cueSpeed("]');
  elements.forEach(el => {
    const match = el.id.match(/cueSpeed\((\d+(\.\d+)?)\)/);
    if (match) {
      const speed = parseFloat(match[1]);
      const bbox = el.getBBox();
      const pos = bbox.x + bbox.width / 2;
      if (!isNaN(speed)) {
        window.speedCueMap.push({ position: pos, multiplier: speed });
      }
    }
  });

  window.speedCueMap.sort((a, b) => a.position - b.position);
  console.log("[DEBUG] Preloaded speed cues:", window.speedCueMap);
}



/**
 * cueSpeedControls.js — Keyboard & UI Speed Multiplier Control
 * Handles +/- keyboard keys and optional buttons for adjusting playback speed.
 * Syncs changes with server via WebSocket and updates on-screen display.
 */

export function initializeSpeedControls() {
  document.addEventListener("keydown", (event) => {
    if (event.key === "+" || event.key === "=") {
      adjustSpeed(0.1);
    } else if (event.key === "-") {
      adjustSpeed(-0.1);
    }
  });

  const incBtn = document.getElementById("increaseSpeed");
  const decBtn = document.getElementById("decreaseSpeed");
  const resetBtn = document.getElementById("resetSpeed");

  if (incBtn) incBtn.addEventListener("click", () => adjustSpeed(0.1));
  if (decBtn) decBtn.addEventListener("click", () => adjustSpeed(-0.1));
  if (resetBtn) resetBtn.addEventListener("click", () => setSpeed(1.0));
}

/**
 * Adjusts the global speed multiplier and updates the display.
 * @param {number} delta - Amount to increase/decrease (e.g. 0.1 or -0.1)
 */
export function adjustSpeed(delta) {
  const newSpeed = Math.max(0.5, Math.min(3.0, (window.speedMultiplier || 1) + delta));
  setSpeed(newSpeed);
}

/**
 * Sets the speed multiplier and syncs it.
 * @param {number} newSpeed - The new speed multiplier
 */
export function setSpeed(newSpeed) {
  window.speedMultiplier = parseFloat(newSpeed.toFixed(1));
  updateSpeedDisplay();
  sendSpeedUpdateToServer(window.speedMultiplier);
}

/**
 * Updates the on-screen speed display.
 */
export function updateSpeedDisplay() {
  const display = document.getElementById("speedDisplay");
  if (display) display.textContent = `${window.speedMultiplier.toFixed(1)}×`;
}

/**
 * Sends the speed to the server via WebSocket.
 * Uses `set_speed_multiplier` to match server expectations.
 */
export function sendSpeedUpdateToServer(speed) {
  if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
    console.warn("[speedControl] WebSocket not ready — skipping update.");
    return;
  }

  const message = {
    type: "set_speed_multiplier",
    multiplier: speed,
    timestamp: Date.now(),
  };

  window.socket.send(JSON.stringify(message));
  console.log("[speedControl] Sent speed update:", message);
}


window.updateSpeedDisplay = updateSpeedDisplay;
window.setSpeed = setSpeed;
window.adjustSpeed = adjustSpeed;



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
      svgThumbnail.data = `animations/${choice}.svg`;
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
export async function handlePageCue(cueId, animationPath, duration) {
  console.log(`[cuePage] Handling page cue: ${cueId}`);

  // Always ensure scrolling score is paused before page mode
  if (window.isPlaying) {
    console.log("[cuePage] 🛑 Pausing scrolling score.");
    pauseScrollScore();
  }


  // -------------------------------------------------------------
  // 0️⃣ Parse parameters (self-contained)
  // -------------------------------------------------------------
  const pageName = cueId.match(/cuePage\(([^)]+)\)/)?.[1];
  const dur = cueId.match(/_dur\(([^)]+)\)/)?.[1];
  const next = cueId.match(/_next\(([^)]+)\)/)?.[1];
  const mode = cueId.match(/_mode\(([^)]+)\)/)?.[1]?.toLowerCase() || "popup";
  const ret  = cueId.match(/_return\(([^)]+)\)/)?.[1] === "1";
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

  // Update state
  ps.mode = "page";
  ps.current = pageName;
  ps.next = next || null;

  // -------------------------------------------------------------
  // 3️⃣ Prepare DOM
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
  // 4️⃣ Load SVG page
  // -------------------------------------------------------------
  const filePath = animationPath || `animations/${pageName}.svg`;
  try {
    const response = await fetch(filePath);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const svgText = await response.text();
    content.innerHTML = svgText;
    const svg = content.querySelector("svg");
    if (!svg) throw new Error("No <svg> in loaded page.");

    svg.id = "pageSVG";
    svg.classList.add("oscilla-page");
    svg.setAttribute("width", "100vw");
    svg.setAttribute("height", "100vh");
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    // Reuse animation init logic
    window.initializeSVG?.(svg);
    window.initializeRotatingObjects?.(svg);
    window.initializeScalingObjects?.(svg);
    window.initializePathFollowers?.(svg);
    window.initializeObserver?.(svg);

    console.log(`[cuePage] ✅ Loaded ${pageName}.svg`);
  } catch (err) {
    console.error(`[cuePage] Failed to load SVG: ${err.message}`);
    return;
  }

  // -------------------------------------------------------------
  // 5️⃣ Countdown and transition logic
  // -------------------------------------------------------------
  clearInterval(ps.countdown);
  countdownElement.style.display = "block";
  countdownElement.textContent = durationSec;

  if (!wait && durationSec > 0) {
    let timeLeft = durationSec;
    ps.countdown = setInterval(() => {
      timeLeft -= 1;
      countdownElement.textContent = timeLeft;

      if (timeLeft <= 3 && next) {
        container.style.transition = "opacity 2s ease-in-out";
        container.style.opacity = "0.3";
      }

      if (timeLeft <= 0) {
        clearInterval(ps.countdown);
        ps.countdown = null;
        resolvePageTransition({ mode, next, ret });
      }
    }, 1000);
  } else {
    console.log("[cuePage] Waiting indefinitely for user trigger or external event.");
  }
}

/**
 * resolvePageTransition()
 * -----------------------
 * Called when a page duration ends or a trigger fires.
 */
function resolvePageTransition({ mode, next, ret }) {
  const ps = window.pageState;
  const container = document.getElementById("singlePage-container");
  const content = document.getElementById("singlePage-content");
  const countdown = document.getElementById("singlePage-countdown");

  if (!ps) return;
  clearInterval(ps.countdown);
  if (countdown) countdown.style.display = "none";

  // --- Case 1: chain to next page
  if (next) {
    console.log(`[cuePage] ⏭ Transitioning directly to next page: ${next}`);
    ps.mode = "transition";
    container.style.transition = "opacity 0.5s ease";
    container.style.opacity = "0";
    setTimeout(() => {
      ps.mode = "page";
      content.innerHTML = "";
      handleCueTrigger(`cuePage(${next})`);
    }, 500);
    return;
  }

  // // --- Case 2: return to scrolling score
  if (!window.isCuePagePlaylistActive && (ret || mode === "popup")) {
    console.log("[cuePage] ✅ Returning to scrolling score.");
    container.style.transition = "opacity 0.5s ease";
    container.style.opacity = "0";
    setTimeout(() => {
      container.style.display = "none";
      content.innerHTML = "";
      ps.mode = "scroll";
      ps.current = null;
      resumeScrollScore();
    }, 500);
    return;
  }


  // --- Case 3: persistent page mode
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

  // Reset playback state flags
  window.isPlaying = true;
  window.isMusicalPause = false;

  // ✅ Restart the scrolling timeline / playhead motion
  if (typeof window.startPlayback === "function") {
    
    window.isPlaying = false;      // ✅ trick: clear guard
    window.startPlayback(true);

  } else if (typeof window.startAnimation === "function") {
    // fallback if your app uses startAnimation internally
    window.startAnimation();
  } else {
    console.warn("[cuePage] ⚠️ No playback start function found.");
  }

  // ✅ Resume stopwatch / elapsed-time logic if available
  if (typeof window.startStopwatch === "function") {
    window.startStopwatch();
  }

  // ✅ Reset timing baseline for smooth interpolation
  window.lastSyncTime = performance.now();
  window.lastElapsedTime = window.elapsedTime ?? 0;

  // ✅ Notify server
  const socket = window.socket;
  if (window.wsEnabled && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "play",
        playheadX: window.playheadX,
        elapsedTime: window.elapsedTime,
      })
    );
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

export const activeAudioCues = new Map();
export const maxAudioInstances = 5;

// 🔇 Stop all currently playing audio cues
export function stopAllAudio() {
  console.log("[INFO] Stopping all active audio cues.");
  activeAudioCues.forEach(({ wavesurfer }) => wavesurfer.destroy());
  activeAudioCues.clear();
}

// 🌐 Send OSC audio trigger via WebSocket
export function sendAudioOscTrigger({ cueId, filename, volume = 1, loop = 1 }) {
  if (!window.wsEnabled || !window.socket || window.socket.readyState !== WebSocket.OPEN) {
    console.error(`[ERROR] WebSocket not connected. Could not send OSC audio cue: ${cueId}`);
    return;
  }

  const message = {
    type: "osc_audio_trigger",
    filename,
    volume,
    loop,
    timestamp: Date.now(),
  };

  console.log(`[OSC] 🎧 Sending audio cue:`, message);
  window.socket.send(JSON.stringify(message));
}

// 🌫 Fade-out audio toward end of clip
export function startFadeOutBeforeEnd(wavesurfer, fadeOutSec, filename = "") {
  const duration = wavesurfer.getDuration();
  const remaining = duration - wavesurfer.getCurrentTime();
  const logLabel = filename ? ` [${filename}]` : "";

  if (fadeOutSec > remaining) {
    console.warn(`[AUDIO] Fade-out${logLabel} requested too late (only ${remaining.toFixed(2)}s left).`);
    fadeOutSec = remaining;
  }

  const targetTime = duration - fadeOutSec;
  const intervalMs = 100;
  const steps = Math.ceil((fadeOutSec * 1000) / intervalMs);
  const stepVolume = wavesurfer.getVolume() / steps;

  console.log(`[AUDIO] Starting fade-out${logLabel} over ${fadeOutSec}s`);

  const fadeInterval = setInterval(() => {
    const currentTime = wavesurfer.getCurrentTime();
    const vol = wavesurfer.getVolume();

    if (currentTime >= targetTime && vol > 0) {
      const newVol = Math.max(0, vol - stepVolume);
      wavesurfer.setVolume(newVol);
    }

    if (vol <= 0 || currentTime >= duration) {
      clearInterval(fadeInterval);
      console.log(`[AUDIO] Fade-out complete${logLabel}`);
    }
  }, intervalMs);
}

// 🎧 Main cue handler for audio playback
export function handleAudioCue(cueId, cueParams) {
  console.log(`[DEBUG] Handling audio cue: ${cueId}`);

  if (!window.isAudioMaster) {
    console.log(`[INFO] Skipping local audio playback: not the designated playback master.`);
    return;
  }

  const supportedFormats = ['wav', 'flac', 'mp3', 'ogg', 'aac', 'm4a', 'webm'];
  const filenameBase = cueParams.file || cueParams.choice;
  if (!filenameBase) {
    console.error(`[ERROR] cueAudio requires a 'file' or 'choice' param: ${cueId}`);
    return;
  }

  let ext = cueParams.ext || 'wav';
  if (!supportedFormats.includes(ext)) {
    console.warn(`[WARNING] Unsupported extension '${ext}', falling back to 'wav'.`);
    ext = 'wav';
  }

  let filename;
  if (filenameBase.includes('.')) {
    filename = filenameBase;
    ext = filename.split('.').pop();
  } else {
    filename = `${filenameBase}.${ext}`;
  }

  const audioPath = `audio/${filename}`;
  const volume = typeof cueParams.amp === 'number' ? cueParams.amp : 1;
  const loopCount = typeof cueParams.loop === 'number' ? cueParams.loop : 1;
  const shouldLoop = loopCount === 0 ? true : loopCount;
  const fadeIn = typeof cueParams.fadein === 'number' ? cueParams.fadein : 0;
  const fadeOut = typeof cueParams.fadeout === 'number' ? cueParams.fadeout : 0;

  if (activeAudioCues.has(filename)) {
    console.log(`[INFO] Stopping existing instance of ${filename}`);
    activeAudioCues.get(filename).wavesurfer.destroy();
    activeAudioCues.delete(filename);
  }

  if (activeAudioCues.size >= maxAudioInstances) {
    console.warn(`[WARNING] Max audio instances reached. Skipping cue: ${filename}`);
    return;
  }

  const wavesurfer = WaveSurfer.create({
    container: "#waveform-container",
    waveColor: 'blue',
    progressColor: 'darkblue',
    backend: 'WebAudio',
    height: 50,
  });

  wavesurfer.load(audioPath);

  wavesurfer.on('ready', () => {
    console.log(`[INFO] Playing ${filename} @ vol ${volume}, loop: ${loopCount}, fade-in: ${fadeIn}s`);
    wavesurfer.setVolume(0);
    wavesurfer.play();

    if (fadeIn > 0) {
      const fadeStep = volume / (fadeIn * 10);
      const fadeInterval = setInterval(() => {
        const current = wavesurfer.getVolume();
        if (current + fadeStep >= volume) {
          wavesurfer.setVolume(volume);
          clearInterval(fadeInterval);
        } else {
          wavesurfer.setVolume(current + fadeStep);
        }
      }, 100);
    } else {
      wavesurfer.setVolume(volume);
    }
  });

  let playCount = 1;
  wavesurfer.on('finish', () => {
    if (shouldLoop === true || playCount < shouldLoop) {
      console.log(`[INFO] Looping ${filename} (${playCount}/${shouldLoop === true ? '∞' : shouldLoop})`);

      if (playCount === shouldLoop - 1 && fadeOut > 0) {
        console.log(`[INFO] Preparing fade-out for ${filename}`);
        startFadeOutBeforeEnd(wavesurfer, fadeOut, filename);
      }

      playCount++;
      wavesurfer.play();
    } else {
      console.log(`[INFO] Done looping ${filename}`);
      activeAudioCues.delete(filename);
      wavesurfer.destroy();
    }
  });

  activeAudioCues.set(filename, { wavesurfer, volume });
  sendAudioOscTrigger({ cueId, filename, volume, loop: loopCount });
}
window.sendAudioOscTrigger = sendAudioOscTrigger;

document.getElementById("stop-audio-button").addEventListener("click", () => {
  console.log("[AUDIO] 🔇 Hard audio stop triggered");

  if (activeAudioCues && activeAudioCues.size > 0) {
    for (const [filename, { wavesurfer }] of activeAudioCues.entries()) {
      try {
        console.log(`[AUDIO] 🔻 Stopping: ${filename}`);
        wavesurfer.pause();
        wavesurfer.stop();  
        wavesurfer.destroy();
      } catch (err) {
        console.warn(`[AUDIO] ❌ Error stopping ${filename}:`, err);
      }
    }

    activeAudioCues.clear();
    console.log("[AUDIO] ✅ All audio cues cleared.");
  } else {
    console.warn("[AUDIO] ⚠️ No active audio cues to stop.");
  }
});







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

export function parseCueParams(cueId) {
  // Extract cue type (e.g. cuePage, cueAudio, etc.)
  const typeMatch = cueId.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  const type = typeMatch ? typeMatch[1] : null;
  if (!type) return { type: cueId, cueParams: {}, cleanedId: cueId };

  const cueParams = {};
  let rest = cueId.slice(type.length);

  // --- 🧠 Handle first parenthetical block safely (choice)
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
      rest = rest.slice(endIndex + 1); // remaining suffix (e.g. _dur(10)_uid(abc))
    }
  }

  // --- Parse remaining _key(value) pairs
  const regex = /_([a-zA-Z0-9]+)\(([^)]+)\)/g;
  let match;
  while ((match = regex.exec(rest)) !== null) {
    const [, key, value] = match;
    cueParams[key] = isNaN(value) ? value.trim() : parseFloat(value);
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
    
