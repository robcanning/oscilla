/**
 * OSCILLA SCORE SYNCHRONIZATION MODEL (TRANSFORM-BASED, DRIFT-PROOF)
 * ------------------------------------------------------------------
 * The score has a single shared coordinate system ("world space") defined by
 * `scoreWidth`, the SVG's horizontal extent in viewBox units. The playback
 * position (`playheadX`) always exists in this world coordinate space and is
 * synchronized across all clients via the server.
 *
 * One device (the first client to load the score) becomes the *visual authority*.
 * It reports its rendered pixel width of the score (`renderedWidth`). The server
 * stores this as the canonical display width for the session:
 *
 *      canonicalScale = canonicalRenderedWidth / scoreWidth
 *
 * Every client uses this exact scale, regardless of its screen size or DPI.
 * No client rescales the score based on viewport size — this avoids desync.
 *
 * Instead of scrolling the container (scrollLeft), the score is positioned using
 * GPU-accelerated transform:
 *
 *      screenX = playheadX * canonicalScale
 *      translateX = (viewportWidth / 2) - screenX
 *      scrollStage.style.transform = `translateX(${translateX}px)`
 *
 * This means:
 *   - All clients always display the *same absolute score content* at the playhead.
 *   - Different screen shapes only change how much is visible to the left/right.
 *   - No accumulation of drift, rounding error, or FPS timing differences.
 *   - Jumping, seeking, and late joins remain synchronized.
 *
 * Key Terms:
 *
 *   scoreWidth            -> Width of SVG in world / viewBox units
 *   canonicalRenderedWidth -> The pixel width reported by the first client
 *   canonicalScale        -> World -> Pixel scale shared by all clients
 *   playheadX             -> Playback position in world units
 *   scrollStage           -> The wrapper div that is translated horizontally
 *
 * The result is stable, resolution-independent, zero-drift visual synchronization.
 */


import { getSpeedForPosition, updateSpeedFromPosition } from "../cues/speed.js";
import { resetAllFadePriming } from "../cues/fade.js";
import { checkCueTriggers } from "../cues/cueDispatcher.js";
import { 
  dismissAllStopwatchOverlays, 
  startTransportTime, 
  pauseTransportTime, 
  resumeTransportTime,
  resetTransportTime 
} from "../cues/timers.js";


// ============================================================================
// SEEKING STATE
// ============================================================================

window.seekDebounceTime = 300;
window.seekingTimeout = null;

document.addEventListener('keydown', (event) => {
  if (window.oscillaTextInputActive && event.key !== "Escape") return;

  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); // Prevents page scrolling

    // Capture play state ONLY on first keypress of a seek sequence
    // (don't overwrite on subsequent keypresses while still seeking)
    if (!window.isSeeking) {
      window._wasPlayingBeforeSeek = window.isPlaying === true;
      console.log("[SEEK] Starting seek, wasPlaying:", window._wasPlayingBeforeSeek);
      
      // Pause playback during seeking (stop animation but preserve state intent)
      if (window.isPlaying) {
        window.stopAnimation?.();
        window.stopStopwatch?.();
        window.animationPaused = true;
        window.isPlaying = false; // Mark as not playing during seek
        console.log("[SEEK] Paused playback for seeking");
      }
    }

    window.isSeeking = true;

    if (event.key === 'ArrowLeft') {
      rewind();
    } else if (event.key === 'ArrowRight') {
      forward();
    }

    if (seekingTimeout) clearTimeout(seekingTimeout);

    seekingTimeout = setTimeout(() => {
      console.log("[SEEK] Seek ended, wasPlayingBeforeSeek:", window._wasPlayingBeforeSeek);
      
      window.isSeeking = false;
      window.allowCues = true;
      window.cueDisabledUntil = 0;

      checkCueTriggers();

      // Resume if was playing before seek started
      if (window._wasPlayingBeforeSeek) {
        console.log("[SEEK] Resuming playback after seek");
        window.startPlayback();
      } else {
        console.log("[SEEK] Was stopped before seek, staying stopped");
      }
      
      window._wasPlayingBeforeSeek = undefined; // Clean up

    }, seekDebounceTime);
  }
});


window.isSeeking = false;

/**
*  Rewinds playback to the start of the score.
* - Resets `playheadX` to 0 and ensures immediate UI update.
* - Prevents unwanted sync overrides from reverting the rewind.
* - Clears triggered cues and resets playback state.
* - Sends an updated state to the server to sync all clients.
*/

window.ignoreRewindOnStartup = false;
window.suppressSync = false;

export const rewindToStart = () => {
  console.log("[DEBUG] Rewinding to start.");

  window.playheadX = 0;
  window.elapsedTime = 0;
  
  // Reset transport time (performance timer)
  resetTransportTime();

  scrollToPlayheadVisual();
  updateSpeedFromPosition();
  
  window.updateSpeedDisplay();

  // Reset rehearsal mark navigation index
  window.resetRehearsalIndex?.();

  if (triggeredCues) {
    triggeredCues.clear();

    resetAllFadePriming();
    dismissAllStopwatchOverlays();

    window._cueInsideState?.clear();
    window.navRepeatMap?.clear();

    // Reset annotation playhead triggers
    window.resetAnnotationPlayheadTriggers?.();
  }

  suppressSync = true;

  if (window.wsEnabled && window.socket.readyState === WebSocket.OPEN) {
    window.socket.send(JSON.stringify({
      type: 'jump',
      playheadX: window.playheadX,
      elapsedTime: window.elapsedTime
    }));

    console.log("[DEBUG] Rewinding to start.");

  }

  setTimeout(() => { suppressSync = false; }, 500);
};



/**
*  Moves backward by a fixed distance on the score based on `playheadX`.
* - Ensures smooth cue retriggering after rewinding.
* - Updates UI elements and syncs with the server.
*/

export const rewind = () => {
  // Smaller increment for smoother seeking (250ms worth of movement instead of 1000ms)
  const REWIND_INCREMENT_X = (250 / window.duration) * window.scoreWidth;
  window.playheadX = Math.max(window.playheadX - REWIND_INCREMENT_X, 0);

  scrollToPlayheadVisual();

  //  Calculate `elapsedTime` based on `playheadX` for reference
  window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;

  if (triggeredCues) {
    triggeredCues.clear();
    resetAllFadePriming();
    dismissAllStopwatchOverlays();


    window._cueInsideState?.clear();
    window.navRepeatMap?.clear();

    // Reset annotation playhead triggers
    window.resetAnnotationPlayheadTriggers?.();
  }

  window.resetCueEdgeTracking();


  //  Apply and store correct speed based on the new playhead position
  updateSpeedFromPosition();

  window.updateSpeedDisplay();


  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    window.socket?.send(JSON.stringify({
      type: 'jump', playheadX: window.playheadX,
      elapsedTime: window.elapsedTime
    }));
  }

  /* Ignore the next sync broadcast — it's our own jump being echoed */
  window.ignoreNextSync = true;

  /*  Prevent server from overriding our new position for a short window */
  window.recentlyRecalculatedPlayhead = true;
  setTimeout(() => { window.recentlyRecalculatedPlayhead = false; }, 500);

};


/**
*  Moves forward by a fixed distance on the score based on `playheadX`.
* - Ensures smooth cue retriggering after advancing.
* - Updates UI elements and syncs with the server.
*/

export const forward = () => {
  // Smaller increment for smoother seeking (250ms worth of movement instead of 1000ms)
  const FORWARD_INCREMENT_X = (250 / window.duration) * window.scoreWidth;

  window.playheadX = Math.min(window.playheadX + FORWARD_INCREMENT_X, window.scoreWidth);

  scrollToPlayheadVisual();

  //  Calculate `elapsedTime` based on `playheadX` for reference
  window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;

  if (triggeredCues) {
    triggeredCues.clear(); // Ensure cues retrigger after forward
    resetAllFadePriming();
    dismissAllStopwatchOverlays();


    window._cueInsideState?.clear();
    window.navRepeatMap?.clear();
  }

  window.resetCueEdgeTracking();

  //  Apply and store correct speed based on the new playhead position
  updateSpeedFromPosition();

  window.updateSpeedDisplay();

  window.resetAnnotationPlayheadTriggers?.();

  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    window.socket?.send(JSON.stringify({
      type: 'jump', playheadX: window.playheadX,
      elapsedTime: window.elapsedTime
    }));
  }

  /* Ignore the next sync broadcast — it's our own jump being echoed */
  window.ignoreNextSync = true;

  /*  Prevent server from overriding our new position for a short window */
  window.recentlyRecalculatedPlayhead = true;
  setTimeout(() => { window.recentlyRecalculatedPlayhead = false; }, 500);

};


/**
 *  Keyboard & UI Speed Multiplier Control
 * Handles +/- keyboard keys and optional buttons for adjusting playback speed.
 * Syncs changes with server via WebSocket and updates on-screen display.
 */

export function initializeSpeedControls() {
  document.addEventListener("keydown", (event) => {
    if (window.oscillaTextInputActive && event.key !== "Escape") return;

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
export function setSpeed(relativeMultiplier) {
  if (!window.baseSpeedMultiplier) {
    window.baseSpeedMultiplier = 1;
  }

  const actual = relativeMultiplier * window.baseSpeedMultiplier;
  window.speedMultiplier = actual;

  console.log(`[Speed] base=${window.baseSpeedMultiplier}, relative=${relativeMultiplier}, actual=${actual}`);
  
  window.updateSpeedDisplay?.();
  
  // Broadcast to server
  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    window.socket.send(JSON.stringify({
      type: "set_speed_multiplier",
      multiplier: actual,
      source: "setSpeed"
    }));
  }
}


/**
 * Updates the on-screen speed display.
 */
export function updateSpeedDisplay() {
  const display = document.getElementById("speedDisplay");
  if (display) display.textContent = `${window.speedMultiplier.toFixed(1)}x`;
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
}


window.updateSpeedDisplay = updateSpeedDisplay;
window.setSpeed = setSpeed;
window.adjustSpeed = adjustSpeed;



///////////////////////////////////////
// SEEKBAR LOGIC
///////////////////////////////////////

/**
 * Updates the seek bar position to reflect current playhead position.
 * Called from the animation loop and after manual navigation.
 */
export const updateSeekBar = () => {
  const seekBar = window.seekBar || document.getElementById('seek-bar');
  if (!seekBar) return;
  
  const duration = window.duration || 0;
  if (duration <= 0) return;
  
  const progress = (window.elapsedTime / duration) * 100;
  seekBar.value = Math.min(100, Math.max(0, progress));
};

window.updateSeekBar = updateSeekBar;



// Function to synchronize playback time
// Updates `elapsedTime` and aligns the score
// Ensures correct positioning and checks for active cues.
export const setElapsedTime = (newTime) => {
  window.elapsedTime = newTime;
  checkCueTriggers(window.elapsedTime);
};

// transport.js
export function initSeekBarListeners() {
  const seekBar = window.seekBar || document.getElementById("seek-bar");

  if (!seekBar) {
    console.warn("[transport] Seek bar not yet available, retrying in 300ms...");
    setTimeout(initSeekBarListeners, 300);
    return;
  }

  console.log("[transport] Initializing seek bar listeners.");

  // Set small step for smooth dragging (0.1% increments)
  seekBar.step = "0.1";
  seekBar.min = "0";
  seekBar.max = "100";

  //// SEEKING LOGIC ///////////////////////////////////////////

  // Starts seeking mode when the user clicks the seek bar.
  seekBar.addEventListener("mousedown", () => {
    // Capture play state ONLY on first interaction
    if (!window.isSeeking) {
      window._wasPlayingBeforeSeek = window.isPlaying === true;
      
      // Pause during seeking
      if (window.isPlaying) {
        window.stopAnimation?.();
        window.stopStopwatch?.();
        window.animationPaused = true;
        window.isPlaying = false;
      }
    }
    window.isSeeking = true;
    console.log("[CLIENT] Playback paused for seeking (mouse).");
  });


// Touch support for seek bar
seekBar.addEventListener("touchstart", () => {
  // Capture play state ONLY on first interaction
  if (!window.isSeeking) {
    window._wasPlayingBeforeSeek = window.isPlaying === true;
    
    // Pause during seeking
    if (window.isPlaying) {
      window.stopAnimation?.();
      window.stopStopwatch?.();
      window.animationPaused = true;
      window.isPlaying = false;
    }
  }
  window.isSeeking = true;
  console.log("[CLIENT] Playback paused for seeking (touch).");
}, { passive: true });

seekBar.addEventListener("touchend", (event) => {
  window.isSeeking = false;
  console.log("[CLIENT] Seeking ended (touch).");

  if (seekingTimeout) clearTimeout(seekingTimeout);
  seekingTimeout = setTimeout(() => {
    window.ignoreNextSync = true;

    if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
      window.socket.send(JSON.stringify({
        type: "jump",
        playheadX: window.playheadX,
        elapsedTime: window.elapsedTime,
      }));
    }
    
    // Resume if was playing before seek
    if (window._wasPlayingBeforeSeek) {
      window.startPlayback();
    }
    window._wasPlayingBeforeSeek = undefined;
  }, seekDebounceTime);
});



  // Updates playback time as the user moves the seek bar.
  seekBar.addEventListener("input", (event) => {
    const duration = window.duration || 0;
    if (duration <= 0) return;
    
    // Use parseFloat for smoother positioning (not integer steps)
    const percent = parseFloat(event.target.value) / 100;
    const newTime = percent * duration;
    window.elapsedTime = newTime;
    
    // Also update playheadX to stay in sync
    if (window.scoreWidth) {
      window.playheadX = percent * window.scoreWidth;
      scrollToPlayheadVisual();
    }
  });

  // Ends seeking mode and re-enables cues after debounce.

  seekingTimeout = window.seekingTimeout;

  seekBar.addEventListener("mouseup", (event) => {
    window.isSeeking = false;
    console.log("[CLIENT] Seeking ended (mouse). Applying debounce before re-enabling cues.");

    if (seekingTimeout) clearTimeout(seekingTimeout);
    seekingTimeout = setTimeout(() => {
      console.log("[CLIENT] Cue triggering re-enabled after debounce.");
      
      window.ignoreNextSync = true;

      // Send WebSocket sync to ensure all clients align
      if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
        window.socket.send(
          JSON.stringify({
            type: "jump",
            playheadX: window.playheadX,
            elapsedTime: window.elapsedTime,
          })
        );
        console.log(`[CLIENT] Sent jump message to server after seek. Elapsed Time: ${window.elapsedTime}`);
      }
      
      // Resume if was playing before seek
      if (window._wasPlayingBeforeSeek) {
        window.startPlayback();
      }
      window._wasPlayingBeforeSeek = undefined;
    }, seekDebounceTime);
  });

  console.log("[transport] Seek bar listeners attached successfully.");
}


/**
 * Toggles playback state between play and pause.
 * - Delegates to startPlayback() or pausePlayback() for consistent logic.
 * - Ensures all flags and state updates are handled in one place.
 */
export const togglePlay = () => {
  if (window.isPlaying) {
    window.pausePlayback();
  } else {
    window.startPlayback();
  }
};


// --- PLAY / PAUSE ICONS -----------------------------

const ICON_PLAY = `
<svg viewBox="0 0 24 24" width="26" height="26"
     fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
  <polygon points="5 3 19 12 5 21 5 3"></polygon>
</svg>
`;

const ICON_PAUSE = `
<svg viewBox="0 0 24 24" width="26" height="26"
     fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round">
  <rect x="6" y="4" width="4" height="16"></rect>
  <rect x="14" y="4" width="4" height="16"></rect>
</svg>
`;


// --- UPDATE PLAY BUTTON ------------------------------

export const togglePlayButton = () => {
  const iconSlot = document.getElementById("play-icon");

  if (!iconSlot) {
    console.error("[ERROR] Play icon element not found.");
    return;
  }

  iconSlot.innerHTML = window.isPlaying ? ICON_PAUSE : ICON_PLAY;
};


document.addEventListener("DOMContentLoaded", () => {
  togglePlayButton();
});


/**
 *  Starts playback
 * - Sets all state flags
 * - Starts stopwatch + animation
 * - Syncs with server
 * - Ensures speed and seekbar are in sync
 */
export function startPlayback() {

  window._skipTriggerFrame = 2;

  if (window.isPlaying) return;

  if (window.userScrolling) {
    console.warn("[Playback] Ignored start — user still scrolling");
    return;
  }
  console.log("[Playback] Starting playback");

  // --- State setup ---
  window.isPlaying = true;
  window.isMusicalPause = false;
  window.ignoreSyncPlayback = false;
  window.animationPaused = false;
  window.isPaused = false;

  // --- Speed setup ---
  window.speedMultiplier = getSpeedForPosition(window.playheadX) * (window.baseSpeedMultiplier || 1);
  console.log(
    `[Playback] Applying speed multiplier: ${window.speedMultiplier} (playheadX=${window.playheadX.toFixed(
      2
    )})`
  );
  updateSpeedDisplay?.();

  // --- Initialize stopwatch + animation ---
  window.startStopwatch?.();
  window.startAnimation?.();
  
  // --- Start transport time (performance timer) ---
  startTransportTime();

  // --- Animation loop kickstart ---
  if (typeof window.animate === "function") {
    cancelAnimationFrame(window.animationFrameId);
    window.animationFrameId = requestAnimationFrame(window.animate);
  }

  // --- UI sync ---
  togglePlayButton?.();
  window.hideControls?.();

  // --- Cue trigger sync ---
  checkCueTriggers?.();
  dismissAllStopwatchOverlays();

  window.ignoreNextSync = true;

  // --- Network sync ---
  if (window.socket && window.socket.readyState === WebSocket.OPEN) {
    window.socket.send(
      JSON.stringify({
        type: "play",
        playheadX: window.playheadX,
        elapsedTime: window.elapsedTime,
        speed: window.speedMultiplier,
      })
    );
  }

  console.log("[Playback] Playback initialized");
}


// Pauses playback: sets state, stops animation + stopwatch, syncs with server
export function pausePlayback() {
  if (window.isPlaying) {
    console.log("[Playback] Pausing playback");
    window.isPlaying = false;
    window.isMusicalPause = false;
    window.animationPaused = true;

    window.stopStopwatch?.();
    window.stopAnimation?.();
    
    // Pause transport time on manual pause (not on musical pauses)
    pauseTransportTime();
    
    togglePlayButton();

    // Send pause message to server
    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
      window.socket.send(JSON.stringify({
        type: "pause",
        playheadX: window.playheadX,
        elapsedTime: window.elapsedTime
      }));
    }
  }
};

// Resume logic: reuse startPlayback() for consistency
export function resumePlayback() {
  console.log("[Playback] resumePlayback() called");
  window.startPlayback();
};


// ============================================================================
// COORDINATE EXTRACTION HELPER
// ============================================================================

/**
 * Get the world X coordinate of an SVG element using getBoundingClientRect.
 * This works correctly for ALL element types regardless of how they're positioned
 * (transforms, shape-inside text, nested groups, etc.)
 * 
 * @param {Element} element - The SVG element to measure
 * @param {Element} [svgElement] - Optional SVG root element (defaults to #scoreInner svg)
 * @returns {number} World X coordinate
 */
export function getWorldX(element, svgElement = null) {
  const svg = svgElement || document.querySelector("#scoreInner svg");
  if (!svg || !element) return 0;
  
  const svgRect = svg.getBoundingClientRect();
  const elRect = element.getBoundingClientRect();
  
  // Screen position relative to SVG left edge
  const screenX = elRect.x - svgRect.x;
  
  // Convert to world coordinates
  const localScale = svgRect.width / window.scoreWidth;
  return screenX / localScale;
}

/**
 * Get the world width of an SVG element
 */
export function getWorldWidth(element, svgElement = null) {
  const svg = svgElement || document.querySelector("#scoreInner svg");
  if (!svg || !element) return 0;
  
  const svgRect = svg.getBoundingClientRect();
  const elRect = element.getBoundingClientRect();
  const localScale = svgRect.width / window.scoreWidth;
  return elRect.width / localScale;
}

window.getWorldX = getWorldX;
window.getWorldWidth = getWorldWidth;


//////////////////////////////////////////////////////////////////////////
function savePlayheadPosition() {
  if (window.playheadX != null && window.currentProject) {
    localStorage.setItem(
      `oscilla_lastPos_${window.currentProject}`,
      window.playheadX
    );
    console.log(`[AutoSave] Saved playheadX = ${window.playheadX} for ${window.currentProject}`);
  }
}

window.addEventListener('beforeunload', savePlayheadPosition);
window.addEventListener('pagehide', savePlayheadPosition);

window.viewOrigin = window.viewOrigin || 'left'; // 'center' | 'left'
export function scrollToPlayheadVisual() {
  const container = window.scoreContainer;
  const stage = document.getElementById("scrollStage");
  if (!container || !stage) return;

  // Get the actual SVG element
  const svg = stage.querySelector("svg") || document.querySelector("#scoreInner svg");
  if (!svg || !window.scoreWidth) return;

  container.scrollLeft = 0;
  container.scrollTop = 0;

  // Use LOCAL rendered width — allows each client to scale independently
  const localRenderedWidth = svg.getBoundingClientRect().width;
  if (localRenderedWidth <= 0) return;
  
  const localScale = localRenderedWidth / window.scoreWidth;
  
  // Store for other systems that might need it
  window.localScale = localScale;
  window.localRenderedWidth = localRenderedWidth;

  const worldPx = window.playheadX * localScale;
  const viewportWidth = container.clientWidth;

  // Use configurable offset ratio (default 0.5 = center)
  // Set by playheadOffset.js — drag handle or preferences
  const offsetRatio = window.playheadOffsetRatio ?? 0.5;
  const targetScreenX = viewportWidth * offsetRatio;

  // Calculate ideal position (playhead at offset position)
  let translateX = targetScreenX - worldPx;
  
  // Track if we're clamping and where the playhead should appear
  let playheadScreenX = targetScreenX; // Default: offset position
  let isClamped = false;

  // CLAMP LEFT: Don't let score shift right of left edge
  // (when playhead is near start, keep score left edge at screen left edge)
  if (translateX > 0) {
    // Playhead is in the left "unclamped" zone
    // Score stays at left edge, playhead moves from left toward offset
    playheadScreenX = worldPx; // playhead position relative to screen left
    translateX = 0;
    isClamped = true;
  }

  // CLAMP RIGHT: Don't let score shift left past the end
  // (when playhead is near end, keep score right edge at screen right edge)
  const maxShiftLeft = -(localRenderedWidth - viewportWidth);
  if (translateX < maxShiftLeft && maxShiftLeft < 0) {
    // Playhead is in the right "unclamped" zone
    // Score stays at right edge, playhead moves from offset toward right
    const distanceFromEnd = localRenderedWidth - worldPx;
    playheadScreenX = viewportWidth - distanceFromEnd;
    translateX = maxShiftLeft;
    isClamped = true;
  }

  stage.style.transform = `translate3d(${translateX}px, 0, 0)`;
  
  // Position the playhead indicator
  const playheadEl = document.getElementById("playhead");
  if (playheadEl) {
    if (isClamped) {
      // Move playhead to its actual screen position
      playheadEl.style.left = `${playheadScreenX}px`;
      playheadEl.style.transform = 'translateX(-50%)';
    } else {
      // Playhead stays at configured offset position
      playheadEl.style.left = `${offsetRatio * 100}%`;
      playheadEl.style.transform = 'translateX(-50%)';
    }
  }
}

window.scrollToPlayheadVisual = scrollToPlayheadVisual;


// ============================================================================
// Window exports for cross-module access
// ============================================================================

window.startPlayback = startPlayback;
window.pausePlayback = pausePlayback;
window.resumePlayback = resumePlayback;
window.togglePlay = togglePlay;
window.rewindToStart = rewindToStart;
