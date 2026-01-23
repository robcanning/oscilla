/**
 * OSCILLA SCORE SYNCHRONIZATION MODEL (TRANSFORM-BASED, DRIFT-PROOF)
 * ------------------------------------------------------------------
 * The score has a single shared coordinate system ("world space") defined by
 * `scoreWidth`, the SVG’s horizontal extent in viewBox units. The playback
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
 *   scoreWidth            → Width of SVG in world / viewBox units
 *   canonicalRenderedWidth → The pixel width reported by the first client
 *   canonicalScale        → World → Pixel scale shared by all clients
 *   playheadX             → Playback position in world units
 *   scrollStage           → The wrapper div that is translated horizontally
 *
 * The result is stable, resolution-independent, zero-drift visual synchronization.
 */


import { getSpeedForPosition, updateSpeedFromPosition } from "./oscillaSpeed.js";
import { resetAllFadePriming } from "./oscillaFade.js";
import { stopAllCueTexts } from "./oscillaText.js";
import { destroyAllHitLabels } from "./oscillaHitLabels.js";
import { dismissAllStopwatchOverlays } from "./oscillaTimers.js";


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






// const //updatestopwatch = () => {
//   // Use the accurate elapsed time without re-applying totalPauseDuration unnecessarily
//   const effectiveElapsedTime = window.elapsedTime;
//   const minutesElapsed = Math.floor(effectiveElapsedTime / 60000);
//   const secondsElapsed = Math.floor((effectiveElapsedTime % 60000) / 1000);
//   const minutesTotal = Math.floor(duration / 60000);
//   const secondsTotal = Math.floor((duration % 60000) / 1000);


//   const formattedElapsed = `${minutesElapsed}:${secondsElapsed.toString().padStart(2, '0')}`;
//   const formattedTotal = `${minutesTotal}:${secondsTotal.toString().padStart(2, '0')}`;

//   // stopwatch.textContent = `${formattedElapsed} / ${formattedTotal}`;
//   stopwatch.textContent = `${formattedElapsed}`;

//   log(LogLevel.INFO, `Stopwatch updated: Elapsed = ${formattedElapsed}, Total = ${formattedTotal}`);
// };

window.isSeeking = false;

/**
*  Rewinds playback to the start of the score.
* - Resets `playheadX` to 0 and ensures immediate UI update.
* - Prevents unwanted sync overrides from reverting the rewind.
* - Clears triggered cues and resets playback state.
* - Sends an updated state to the server to sync all clients.
*/

window.ignoreRewindOnStartup = false; //  Prevents unnecessary resets
window.suppressSync = false;

export const rewindToStart = () => {
  console.log("[DEBUG] Rewinding to start.");

  window.playheadX = 0;
  window.elapsedTime = 0;
  // resetStopwatch(); // Reset stopwatch

  scrollToPlayheadVisual();
  // window.speedMultiplier = getSpeedForPosition(window.playheadX);
  updateSpeedFromPosition();
  
  window.updateSpeedDisplay();

  // updatePosition();
  // updateSeekBar();

  if (triggeredCues) {
    triggeredCues.clear(); //  Ensure cues retrigger after rewind

    resetAllFadePriming();
    dismissAllStopwatchOverlays();

    window._cueInsideState?.clear();
    window.navRepeatMap?.clear();


    // console.log("[DEBUG] Cleared triggered cues due to rewind.");
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

  // console.log(`[DEBUG] Rewind applied. Newwindow.playheadX: ${window.playheadX}`);

  //  Calculate `elapsedTime` based on `playheadX` for reference
  window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;
  // console.log(`[DEBUG] Synced elapsedTime fromwindow.playheadX: ${elapsedTime}`);

  if (triggeredCues) {
    triggeredCues.clear(); //  Ensure cues retrigger after rewind
    resetAllFadePriming();
    dismissAllStopwatchOverlays();


    window._cueInsideState?.clear();
    window.navRepeatMap?.clear();

    // console.log("[DEBUG] Cleared triggered cues due to rewind.");
  }

  window.resetCueEdgeTracking();


  //  Apply and store correct speed based on the new playhead position
  // window.speedMultiplier = getSpeedForPosition(window.playheadX);
  updateSpeedFromPosition();

  // console.log(`[DEBUG] After rewind, applying speed: ${speedMultiplier}`);
  window.updateSpeedDisplay();


  // updatePosition();
  // updateSeekBar();
  //updatestopwatch();

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

  // NOTE: Play state resume is now handled by the keydown handler's setTimeout
  // to ensure proper state management when seeking ends

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
  // console.log(`[DEBUG] Forward applied. Newwindow.playheadX: ${window.playheadX}`);

  //  Calculate `elapsedTime` based on `playheadX` for reference
  window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;
  // console.log(`[DEBUG] Synced window.elapsedTime fromwindow.playheadX: ${elapsedTime}`);

  if (triggeredCues) {
    triggeredCues.clear(); // Ensure cues retrigger after forward
    resetAllFadePriming();
    dismissAllStopwatchOverlays();


    window._cueInsideState?.clear();
    window.navRepeatMap?.clear();

    // console.log("[DEBUG] Cleared triggered cues due to forward.");
  }

  window.resetCueEdgeTracking();

  //  Apply and store correct speed based on the new playhead position
  //window.speedMultiplier = getSpeedForPosition(window.playheadX);
  updateSpeedFromPosition();

  window.updateSpeedDisplay();

  // updatePosition();
  // updateSeekBar();
  // updatestopwatch();

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

  // NOTE: Play state resume is now handled by the keydown handler's setTimeout
  // to ensure proper state management when seeking ends

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
  // console.log("[speedControl] Sent speed update:", message);
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



// ---------------------------------------------------------
// UI interaction state (menus / hover)
// ---------------------------------------------------------
window.__oscillaMenuActive = false;


function shouldAutoHideTopbar() {
  if (window.controlsPinned) return false;
  if (window.topbarPinned) return false;
  if (window.__oscillaMenuActive) return false;
  return true;
}


let controlsTimeout; // Timer to hide controls after inactivity

export const hideControls = () => {
  console.warn("[UI] hideControls CALLED", {
    menuActive: window.__oscillaMenuActive,
    controlsPinned: window.controlsPinned,
    topbarPinned: window.topbarPinned,
    stack: new Error().stack
  });

  if (!shouldAutoHideTopbar()) {
    console.warn("[UI] hideControls BLOCKED");
    return;
  }

  const controls = document.getElementById('controls');
  const topBar = document.getElementById('top-bar');

  controls?.classList.add('dismissed');
  topBar?.classList.add('dismissed');
};




export const showControls = () => {
  const controls = document.getElementById('controls');
  const topBar = document.getElementById('top-bar');

  if (controls) controls.classList.remove('dismissed');
  if (topBar) topBar.classList.remove('dismissed');
};


window.hideControls = hideControls;

// -------------------------------------------------------------------
// 🧷 Controls Pin Toggle
// -------------------------------------------------------------------
window.controlsPinned = false;
window.topbarPinned = false;

export function initializeControlsPin() {
  const pinButton = document.getElementById("pin-controls");
  if (!pinButton) return console.warn("[UI] No #pin-controls button found.");

  pinButton.addEventListener("click", () => {
    window.controlsPinned = !window.controlsPinned;
    pinButton.classList.toggle("active", window.controlsPinned);

    if (window.controlsPinned) {
      console.log("[UI] Controls pinned — will stay visible.");
      showControls();
    } else {
      console.log("[UI] Controls unpinned — auto-hide re-enabled.");
      window.hideControlsLater(); // call the global version
    }
  });
}

export function initializeTopbarPin() {
  const btn = document.getElementById("pin-topbar");
  if (!btn) return console.warn("[UI] No #pin-topbar button found.");

  btn.addEventListener("click", () => {
    window.topbarPinned = !window.topbarPinned;
    btn.classList.toggle("active", window.topbarPinned);

    if (window.topbarPinned) {
      console.log("[UI] Top-bar pinned.");
      showControls();
    } else {
      window.hideControlsLater();
    }
  });
}

// ---------------------------------------------------------
// Unified Hide Controls Timer (respects pin state, never resets on re-call)
// ---------------------------------------------------------
// ---------------------------------------------------------
// Unified Hide Controls Timer (FIXED)
// ---------------------------------------------------------
window.hideControlsLater = function (delay = 4000) {
  clearTimeout(window._hideControlsTimer);

  window._hideControlsTimer = setTimeout(() => {

    if (!shouldAutoHideTopbar()) {
      console.log("[UI] Auto-hide suppressed (pin or menu active)");
      return;
    }

    hideControls();
    console.log("[UI] Auto-hide executed");

  }, delay);
};



// Function to synchronize playback time
// Updates `elapsedTime` and aligns the score
// Ensures correct positioning and checks for active cues.
export const setElapsedTime = (newTime) => {
  window.elapsedTime = newTime; // Update playback time
  // updatePosition(window.playheadX); // Use the correct playhead position

  checkCueTriggers(window.elapsedTime); // Recheck cues
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



import { checkCueTriggers } from "./oscillaCueDispatcher.js";

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
    `[Playback] 🎚 Applying speed multiplier: ${window.speedMultiplier} (playheadX=${window.playheadX.toFixed(
      2
    )})`
  );
  updateSpeedDisplay?.();

  // --- Initialize stopwatch + animation ---
  window.startStopwatch?.();
  window.startAnimation?.();

  // --- Animation loop kickstart ---
  if (typeof window.animate === "function") {
    cancelAnimationFrame(window.animationFrameId);
    window.animationFrameId = requestAnimationFrame(window.animate);
  }

  // --- UI sync ---
  togglePlayButton?.();
  hideControls?.();

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

  console.log("[Playback] ✅ Playback initialized");
}


// Pauses playback: sets state, stops animation + stopwatch, syncs with server
export function pausePlayback() {
  if (window.isPlaying) {
    console.log("[Playback] ⏸ Pausing playback");
    window.isPlaying = false;
    window.isMusicalPause = false;
    window.animationPaused = true;

    window.stopStopwatch?.();
    window.stopAnimation?.();
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



// ---------------------------------------------------------------------------
// Mode Toggle UI (Scroll ↔ Node/Page)
// ---------------------------------------------------------------------------
// Displays a small toggle in the top UI that shows where clicking will go next.
//   • If currently in scrolling mode → label shows "→ node"
//   • If currently in node/page mode → label shows "→ scroll"
// Clicking switches between the two modes:
//   → node : opens the first (or last-used) page view
//   → scroll : returns to the continuous scrolling score
// The label always reflects the *destination*, not the current state.
// ---------------------------------------------------------------------------

function updateModeToggleUI() {
  const el = document.getElementById("mode-toggle");
  if (!el) return;

  const ps = window.pageState;
  if (!ps) return;

  // Display where clicking will go next
  if (ps.mode === "page") {
    el.textContent = "→ scroll";   // currently in page, link goes to scroll
  } else {
    el.textContent = "→ node";     // currently in scroll, link goes to page mode
  }
}

function toggleMode() {
  const ps = window.pageState;
  if (!ps) return;

  if (ps.mode === "page") {
    // go to scroll mode
    window.returnToScrollingScore?.();
  } else {
    // go to node mode — open last or first page
    // const firstPage = Object.keys(window.pageRegistry || {})[0];
    // if (firstPage) {
    handleCueTrigger?.(`nav(home)`);
    // }
  }

  // Update label shortly after UI shift
  setTimeout(updateModeToggleUI, 50);
}

document.getElementById("mode-toggle")?.addEventListener("click", toggleMode);
window.updateModeToggleUI = updateModeToggleUI;

// -----------------------------------------------------




window.returnToScrollingScore = function returnToScrollingScore() {

  console.log("[cuePage] Returning to scrolling score.");
  stopAllCueTexts();

  destroyAllHitLabels()


  const container = document.getElementById("singlePage-container");
  const content = document.getElementById("singlePage-content");
  const mainScore = document.getElementById("scoreInner");
  const ps = window.pageState || (window.pageState = { mode: "scroll", current: null });

  if (!container || !content) {
    console.warn("[cuePage] No page overlay present — just resuming scroll.");
    ps.mode = "scroll";
    updateModeToggleUI();

    ps.current = null;
    resumeScrollScore?.();
    return;
  }

  container.style.transition = "opacity 0.5s ease";
  container.style.opacity = "0";

  setTimeout(() => {
    // Remove any leftover cue buttons safely
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
  console.log(" Resuming scrolling score...");

  // If we arrived here from nav(mode:scrollPaused@X)
  if (window._resumeAfterJump === false) {
    console.log(" ⏸ Staying paused after jump (scrollPaused mode).");

    // Ensure playback remains paused
    window.isPlaying = false;
    window.animationPaused = true;
    window.isMusicalPause = true;

    // Ensure remote sync does NOT resume playback
    window.ignoreNextSync = true;

    // Ensure stopwatch is paused
    window.pauseStopwatch?.();

    // Reset so next resumeScrollScore() isn't blocked
    window._resumeAfterJump = null;
    return;
  }

  // Normal resume (mode(scroll) or general resume)
  window.ignoreNextSync = true;
  window.isPlaying = true;
  window.isMusicalPause = false;

  if (typeof window.resumePlayback === "function") {
    window.resumePlayback();
  } else if (typeof window.startPlayback === "function") {
    window.startPlayback();
  }

  window.startStopwatch?.();

  // if (resumeReason === "scroll-mode-switch") {
  //   window.lastSyncTime = performance.now();
  //   window.lastElapsedTime = window.elapsedTime ?? 0;
  // }

  const socket = window.socket;
  if (window.wsEnabled && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "play",
      playheadX: window.playheadX,
      elapsedTime: window.elapsedTime,
    }));
  }

  // Reset flag so future scroll resumes behave normally
  window._resumeAfterJump = null;

  console.log("▶ Scroll resume complete.");
}



//////////////////////////////////////////////////
export const jumpToCueId = (id) => {
  let target = cues.find(c => c.id === id || c.id.startsWith(id + "-"))
    || document.getElementById(id);

  if (!target) {
    console.warn(`[jumpToCueId] Cue not found: ${id}`);
    return;
  }

  // Extract world-X robustly
  let targetX = 0;
  if (target.x?.baseVal) {                         // <rect>, <use>, <text>
    targetX = target.x.baseVal.value;
  } else if (target.cx?.baseVal) {                 // <circle>, <ellipse>
    targetX = target.cx.baseVal.value;
  } else if (typeof target.getAttribute === "function") {
    targetX = parseFloat(target.getAttribute("x")) || 0;
  }

  // Set world playhead
  window.playheadX = targetX;

  // Sync musical timeline
  window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;

  // Convert world → screen (centering, padding, canonicalScale)
  scrollToPlayheadVisual();

  window.ignoreNextSync = true;

  // Sync to other clients
  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    window.socket.send(JSON.stringify({
      type: "jump",
      playheadX: window.playheadX,   // send world coordinate
      elapsedTime: window.elapsedTime,
    }));
  }

  // updatePosition();
};

window.jumpToCueId = jumpToCueId;



document.addEventListener('fullscreenchange', () => {

  if (document.fullscreenElement) {
    hideControls();
  } else {
    showControls();
    clearTimeout(controlsTimeout);
  }

  // Ensurewindow.playheadX is recalculated on fullscreen change
  // recalculatePlayheadPosition(window.scoreSVG);
  // calculateMaxScrollDistance();
  requestAnimationFrame(scrollToPlayheadVisual);

  // extractScoreElements(svgElement);

})

window.dispatchEvent(new Event("resize"));
window.addEventListener('resize', () => {
  const startTime = performance.now();
  // extractScoreElements(window.scoreSVG);
  const endTime = performance.now();
  console.log(`[DEBUG] extractScoreElements executed in ${(endTime - startTime).toFixed(2)}ms`);
  console.log("[DEBUG] Extracted Score Elements. Now Checking Sync...");
  console.log("[DEBUG] Resize detected, recalculating maxScrollDistance and aligning playhead...");
  // calculateMaxScrollDistance();
});


/* ---------------------------------------------------------------------------
*  DOUBLE-TAP / DOUBLE-CLICK CONTROL TOGGLE (VERBOSE DEBUG VERSION)
*  ---------------------------------------------------------------------------
*  Purpose:
*    • Shows playback controls only after a confirmed double-tap (mobile)
*      or double-click (desktop).
*    • Ignores single taps and scroll gestures.
*    • Avoids browser [Intervention] warnings by not preventing native scroll.
*
*  Debug Output:
*    Logs every phase of touch detection to identify false triggers.
* --------------------------------------------------------------------------- */

// 🟢 Show controls immediately and restart hide timer
function showControlsAndAutoHide() {
  showControls();
  hideControlsLater();
}

(() => {
  // Track timing & motion state
  let lastTap = 0;           // timestamp of previous tap
  let touchStartY = 0;       // Y position when touch starts
  let touchMoved = false;    // did the finger move more than threshold?
  let hideTimeout = null;    // timeout to hide controls after showing

  const DOUBLE_TAP_WINDOW = 200; // ms between taps to count as double
  const MOVE_THRESHOLD = 10;     // px movement allowed before it's treated as scroll
  const SHOW_DURATION = 4000;    // ms controls stay visible

function revealControlsTemporarily() {
  showControls();

  clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    if (!window.controlsPinned && !window.topbarPinned) {
      hideControls();
      console.log("[TAP]  Hiding controls (timeout expired)");
    } else {
      console.log("[TAP] ⏸ Pin active — skipping auto-hide");
    }
  }, SHOW_DURATION);
}


  let lastTapTime = 0;
  let tapTimeout;
  const DOUBLE_TAP_MIN = 150;   // ignore ultra-fast taps
  const DOUBLE_TAP_MAX = 500;   // require second tap within 0.5 s
  const MOVE_TOLERANCE = 20;    // px

  let startX = 0, startY = 0;

  document.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
  });

document.addEventListener("touchend", (e) => {

  //  Block global gestures while menu is active
  if (window.__oscillaMenuActive) {
    console.log("[TAP] Ignored (menu active)");
    return;
  }

  const t = e.changedTouches[0];
  const dx = Math.abs(t.clientX - startX);
  const dy = Math.abs(t.clientY - startY);
  if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) return; // it’s a scroll

  const now = Date.now();
  const delta = now - lastTapTime;

  clearTimeout(tapTimeout);

  if (delta >= DOUBLE_TAP_MIN && delta <= DOUBLE_TAP_MAX) {
    console.log("[TAP] Confirmed DOUBLE TAP");
    showControls();
    hideControlsLater();
    lastTapTime = 0; // reset
  } else {
    lastTapTime = now;
    tapTimeout = setTimeout(() => {
      lastTapTime = 0;
    }, DOUBLE_TAP_MAX + 50);
  }
});


  // -------------------------------------------------------------------------
  //  DESKTOP DOUBLE CLICK SUPPORT
  // -------------------------------------------------------------------------
  document.addEventListener("dblclick", (e) => {
    console.log("[CLICK] 🖱️ Double-click detected at", e.clientX, e.clientY);
    revealControlsTemporarily();
  });

  console.log("[UI] 🎛️ Verbose double-tap/double-click toggle initialized.");
})();




// ============================================================
// TOUCH-DRAG SEEK HANDLER (with momentum / inertia)
// ============================================================
// Add this to oscillaTransport.js or import as separate module.
//
// Behavior:
//   - Drag left/right to scrub through the score
//   - Release → continues with momentum, gradually slowing down
//   - Tap anywhere during momentum → stops immediately
//   - Feels like iOS scroll inertia
// ============================================================



(() => {
  const scoreArea = document.getElementById("scoreContainer");
  if (!scoreArea) {
    console.warn("[TouchSeek] #scoreContainer not found");
    return;
  }

  // --- Configuration ---
  const DRAG_THRESHOLD = 10;          // px before we consider it a drag
  const SEND_INTERVAL = 100;          // ms between WS updates
  const SEEK_END_DELAY = 300;         // ms after momentum ends before resuming playback
  const MOMENTUM_INTERVAL = 16;       // ~60fps
  
  // Momentum physics — can be overridden by preferences
  // window.touchSeekFriction and window.touchSeekStopThreshold are set by oscillaPreferences.js
  function getFriction() {
    return window.touchSeekFriction ?? 0.95;  // Higher = longer glide
  }
  function getStopThreshold() {
    return window.touchSeekStopThreshold ?? 5; // Stop when velocity drops below this
  }

  // --- State ---
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startPlayheadX = 0;
  let wasPlayingBeforeDrag = false;
  let lastSendTime = 0;
  let seekEndTimer = null;
  let hasMoved = false;

  // Velocity tracking
  let velocitySamples = [];
  let currentVelocity = 0;
  let momentumTimer = null;
  let isMomentumActive = false;

  // --- Helpers ---
  function getLocalScale() {
    if (window.localScale) return window.localScale;
    
    const svg = document.querySelector("#scrollStage svg, #scoreInner svg");
    if (!svg || !window.scoreWidth) return 1;
    
    const renderedWidth = svg.getBoundingClientRect().width;
    return renderedWidth / window.scoreWidth;
  }

  function clampPlayhead(x) {
    return Math.max(0, Math.min(x, window.scoreWidth || x));
  }

  function calculateVelocity() {
    if (velocitySamples.length < 2) return 0;

    // Use recent samples for smoother velocity
    const recent = velocitySamples.slice(-6);
    if (recent.length < 2) return 0;

    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = (last.time - first.time) / 1000;

    if (dt <= 0) return 0;

    const dx = last.x - first.x;
    const scale = getLocalScale();
    const worldDx = -dx / scale;

    return worldDx / dt;
  }

  function updatePlayheadPosition(newX, sendWs = true) {
    window.playheadX = clampPlayhead(newX);

    if (window.scoreWidth > 0) {
      window.elapsedTime = (window.playheadX / window.scoreWidth) * (window.duration || 0);
    }

    window.scrollToPlayheadVisual?.();

    if (sendWs) {
      const now = performance.now();
      if (now - lastSendTime > SEND_INTERVAL) {
        lastSendTime = now;

        if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
          window.socket.send(JSON.stringify({
            type: "jump",
            playheadX: window.playheadX,
            elapsedTime: window.elapsedTime,
            source: "touch-drag"
          }));
        }
      }
    }
  }

  function startMomentum() {
    const stopThreshold = getStopThreshold();
    
    if (Math.abs(currentVelocity) < stopThreshold) {
      finishSeeking();
      return;
    }

    isMomentumActive = true;
    console.log("[TouchSeek] 🌀 Momentum started, velocity:", currentVelocity.toFixed(1));

    let lastFrameTime = performance.now();

    function momentumFrame() {
      if (!isMomentumActive) return;

      const now = performance.now();
      const dt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      // Apply friction (read fresh each frame in case prefs change)
      currentVelocity *= getFriction();

      // Stop if too slow
      if (Math.abs(currentVelocity) < getStopThreshold()) {
        console.log("[TouchSeek] 🛑 Momentum finished");
        stopMomentum();
        finishSeeking();
        return;
      }

      // Calculate new position
      const delta = currentVelocity * dt;
      const newX = window.playheadX + delta;

      // Stop at boundaries
      if (newX <= 0) {
        updatePlayheadPosition(0);
        console.log("[TouchSeek] 🛑 Hit start boundary");
        stopMomentum();
        finishSeeking();
        return;
      }
      if (newX >= window.scoreWidth) {
        updatePlayheadPosition(window.scoreWidth);
        console.log("[TouchSeek] 🛑 Hit end boundary");
        stopMomentum();
        finishSeeking();
        return;
      }

      updatePlayheadPosition(newX);

      momentumTimer = setTimeout(momentumFrame, MOMENTUM_INTERVAL);
    }

    momentumFrame();
  }

  function stopMomentum() {
    isMomentumActive = false;
    currentVelocity = 0;
    if (momentumTimer) {
      clearTimeout(momentumTimer);
      momentumTimer = null;
    }
  }

  function finishSeeking() {
    // Send final position
    if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
      window.socket.send(JSON.stringify({
        type: "jump",
        playheadX: window.playheadX,
        elapsedTime: window.elapsedTime,
        source: "touch-drag-end"
      }));
    }

    // Reset flags after delay
    clearTimeout(seekEndTimer);
    seekEndTimer = setTimeout(() => {
      if (window.triggeredCues) {
        window.triggeredCues.clear();
        resetAllFadePriming?.();
        dismissAllStopwatchOverlays?.();
        window._cueInsideState?.clear();
        window.navRepeatMap?.clear();
      }

      window.resetCueEdgeTracking?.();
      updateSpeedFromPosition?.();
      window.updateSpeedDisplay?.();

      window.isSeeking = false;
      window.suppressCueTriggers = false;
      window.ignoreSyncPlayback = false;
      window.ignoreNextSync = true;
      window.recentlyRecalculatedPlayhead = true;

      setTimeout(() => {
        window.recentlyRecalculatedPlayhead = false;
      }, 500);

      if (wasPlayingBeforeDrag) {
        console.log("[TouchSeek] ▶️ Resuming playback");
        window.isPlaying = true;
        window.animationPaused = false;
        window.startAnimation?.();
        window.startStopwatch?.();
      }

      wasPlayingBeforeDrag = false;

    }, SEEK_END_DELAY);
  }

  // --- Start drag ---
  function onTouchStart(e) {
    // If momentum is active, stop it immediately (tap to stop)
    if (isMomentumActive) {
      console.log("[TouchSeek] 👆 Tap to stop momentum");
      stopMomentum();
      finishSeeking();
      return;
    }

    if (e.touches.length > 1) return;

    const target = e.target;
    if (target.closest("#controls, #top-bar, button, input, sl-menu, .osc-anno-editor")) {
      return;
    }

    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startPlayheadX = window.playheadX || 0;
    hasMoved = false;
    isDragging = false;

    velocitySamples = [{ x: startX, time: performance.now() }];
    currentVelocity = 0;

    wasPlayingBeforeDrag = window.isPlaying === true;
  }

  // --- During drag ---
  function onTouchMove(e) {
    if (e.touches.length > 1) {
      isDragging = false;
      return;
    }

    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    // Ignore vertical scrolling
    if (!isDragging && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > DRAG_THRESHOLD) {
      return;
    }

    // Start dragging after threshold
    if (!isDragging && Math.abs(dx) > DRAG_THRESHOLD) {
      isDragging = true;
      hasMoved = true;

      window.isSeeking = true;
      window.suppressCueTriggers = true;
      window.ignoreSyncPlayback = true;

      if (wasPlayingBeforeDrag) {
        window.stopAnimation?.();
        window.isPlaying = false;
        window.animationPaused = true;
        console.log("[TouchSeek] 🖐️ Drag started");
      }

      if (window.triggeredCues) {
        window.triggeredCues.clear();
      }
      window._cueInsideState?.clear();

      clearTimeout(seekEndTimer);
    }

    if (!isDragging) return;

    e.preventDefault();

    // Track velocity samples
    const now = performance.now();
    velocitySamples.push({ x: touch.clientX, time: now });
    while (velocitySamples.length > 10) {
      velocitySamples.shift();
    }

    // Update playhead
    const scale = getLocalScale();
    const deltaWorld = -dx / scale;
    const newPlayheadX = clampPlayhead(startPlayheadX + deltaWorld);
    
    updatePlayheadPosition(newPlayheadX);
  }

  // --- End drag ---
  function onTouchEnd(e) {
    if (!isDragging && !hasMoved) {
      return;
    }

    if (!isDragging) return;

    isDragging = false;

    // Calculate release velocity
    currentVelocity = calculateVelocity();

    console.log("[TouchSeek] 🖐️ Released, velocity:", currentVelocity.toFixed(1));

    // Start momentum or finish immediately
    startMomentum();
  }

  // --- Cancel ---
  function onTouchCancel() {
    stopMomentum();

    if (isDragging) {
      isDragging = false;
      clearTimeout(seekEndTimer);

      window.isSeeking = false;
      window.suppressCueTriggers = false;
      window.ignoreSyncPlayback = false;

      wasPlayingBeforeDrag = false;
    }
  }

  // --- Attach listeners ---
  scoreArea.addEventListener("touchstart", onTouchStart, { passive: true });
  scoreArea.addEventListener("touchmove", onTouchMove, { passive: false });
  scoreArea.addEventListener("touchend", onTouchEnd, { passive: true });
  scoreArea.addEventListener("touchcancel", onTouchCancel, { passive: true });

  console.log("[TouchSeek] ✅ Touch-drag seek with momentum initialized");
})();




// ------------------------------------------------------------
// 🌙 Dark Mode Utility (Console-Equivalent)
// ------------------------------------------------------------
export function applyDarkMode(on = false) {
  const html = document.documentElement;
  if (on) {
    html.style.filter = "invert(1) hue-rotate(180deg)";
    document.body.style.background = "black";
  } else {
    html.style.filter = "";
    document.body.style.background = "";
  }
  console.log(`[DarkMode] ${on ? "🌑 Enabled" : "☀️ Disabled"}`);
}

// ------------------------------------------------------------
// 🌗 Dark Mode Toggle Button
// ------------------------------------------------------------
export function initializeDarkModeToggle() {
  const invertBtn = document.getElementById("invert-button");
  if (!invertBtn) {
    console.warn("[DarkMode] ⚠️ No #invert-button found in DOM.");
    return;
  }

  invertBtn.addEventListener("click", () => {
    const active = document.documentElement.style.filter.includes("invert");
    applyDarkMode(!active);
  });

  console.log("[DarkMode] 🌗 Toggle ready.");
}



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
  const halfViewport = viewportWidth / 2;

  // Calculate ideal position (playhead centered)
  let translateX = halfViewport - worldPx;
  
  // Track if we're clamping and where the playhead should appear
  let playheadScreenX = halfViewport; // Default: center of screen
  let isClamped = false;

  // CLAMP LEFT: Don't let score shift right of left edge
  // (when playhead is near start, keep score left edge at screen left edge)
  if (translateX > 0) {
    // Playhead is in the left "unclamped" zone
    // Score stays at left edge, playhead moves from left toward center
    playheadScreenX = worldPx; // playhead position relative to screen left
    translateX = 0;
    isClamped = true;
  }

  // CLAMP RIGHT: Don't let score shift left past the end
  // (when playhead is near end, keep score right edge at screen right edge)
  const maxShiftLeft = -(localRenderedWidth - viewportWidth);
  if (translateX < maxShiftLeft && maxShiftLeft < 0) {
    // Playhead is in the right "unclamped" zone
    // Score stays at right edge, playhead moves from center toward right
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
      playheadEl.style.transform = 'translateX(-50%)'; // Center the line on that position
    } else {
      // Playhead stays centered
      playheadEl.style.left = '50%';
      playheadEl.style.transform = 'translateX(-50%)';
    }
  }
}

window.scrollToPlayheadVisual = scrollToPlayheadVisual;



// ============================================================================
// Playhead / Playzone Toggle Button Listener
// ============================================================================
// Add this code to oscillaUI.js (or your main app initialization)
//
// Cycles through 4 states:
//   1. "both"     → playhead + playzone visible
//   2. "playhead" → playhead only
//   3. "playzone" → playzone only  
//   4. "none"     → neither visible
// ============================================================================

/**
 * Visibility state for playhead/playzone
 * Can be: "both" | "playhead" | "playzone" | "none"
 */
let playheadVisibilityState = "both";

/**
 * Initialize the playhead toggle button listener
 * Call this once after DOM is ready
 */
export function initPlayheadToggle() {
  const btn = document.getElementById("playhead-toggle-button");
  if (!btn) {
    console.warn("[playheadToggle] Button #playhead-toggle-button not found");
    return;
  }

  btn.addEventListener("click", cyclePlayheadVisibility);
  
  // Initialize icon state
  updatePlayheadToggleIcon(btn, playheadVisibilityState);
  
  console.log("[playheadToggle] Initialized");
}

/**
 * Cycle through visibility states: both → playhead → playzone → none → both
 */
function cyclePlayheadVisibility() {
  const states = ["both", "playhead", "playzone", "none"];
  const currentIndex = states.indexOf(playheadVisibilityState);
  const nextIndex = (currentIndex + 1) % states.length;
  
  playheadVisibilityState = states[nextIndex];
  
  applyPlayheadVisibility(playheadVisibilityState);
  
  const btn = document.getElementById("playhead-toggle-button");
  if (btn) {
    btn.dataset.state = playheadVisibilityState;
    btn.title = getPlayheadToggleTitle(playheadVisibilityState);
    updatePlayheadToggleIcon(btn, playheadVisibilityState);
  }
  
  console.log(`[playheadToggle] State: ${playheadVisibilityState}`);
}

/**
 * Apply visibility to playhead and playzone elements
 */
function applyPlayheadVisibility(state) {
  // Get playhead element(s) - adjust selector as needed for your app
  const playhead = document.getElementById("playhead") 
    || document.querySelector(".playhead")
    || document.querySelector("[data-playhead]");
    
  // Get playzone element(s) - adjust selector as needed
  const playzone = document.getElementById("playzone")
    || document.querySelector(".playzone")
    || document.querySelector("[data-playzone]");

  const showPlayhead = (state === "both" || state === "playhead");
  const showPlayzone = (state === "both" || state === "playzone");

  // Apply to playhead
  if (playhead) {
    playhead.style.opacity = showPlayhead ? "" : "0";
    playhead.style.pointerEvents = showPlayhead ? "" : "none";
    // Alternative: use visibility or display
    // playhead.style.visibility = showPlayhead ? "visible" : "hidden";
  }

  // Apply to playzone
  if (playzone) {
    playzone.style.opacity = showPlayzone ? "" : "0";
    playzone.style.pointerEvents = showPlayzone ? "" : "none";
  }

  // Dispatch event for other modules to react
  window.dispatchEvent(new CustomEvent("oscilla:playheadVisibility", {
    detail: { 
      state,
      playheadVisible: showPlayhead,
      playzoneVisible: showPlayzone
    }
  }));
}

/**
 * Update the toggle button icon to reflect current state
 */
function updatePlayheadToggleIcon(btn, state) {
  const lineEl = btn.querySelector("#playhead-icon-line");
  const zoneEl = btn.querySelector("#playhead-icon-zone");

  if (!lineEl || !zoneEl) return;

  switch (state) {
    case "both":
      lineEl.style.opacity = "1";
      zoneEl.style.opacity = "0.3";
      break;
    case "playhead":
      lineEl.style.opacity = "1";
      zoneEl.style.opacity = "0";
      break;
    case "playzone":
      lineEl.style.opacity = "0.2";
      zoneEl.style.opacity = "0.5";
      break;
    case "none":
      lineEl.style.opacity = "0.2";
      zoneEl.style.opacity = "0";
      break;
  }
}

/**
 * Get tooltip text for current state
 */
function getPlayheadToggleTitle(state) {
  switch (state) {
    case "both":     return "Showing: Playhead + Playzone (click to cycle)";
    case "playhead": return "Showing: Playhead only (click to cycle)";
    case "playzone": return "Showing: Playzone only (click to cycle)";
    case "none":     return "Showing: Neither (click to cycle)";
    default:         return "Toggle playhead/playzone visibility";
  }
}

/**
 * Programmatically set visibility state
 * @param {"both"|"playhead"|"playzone"|"none"} state 
 */
export function setPlayheadVisibility(state) {
  const validStates = ["both", "playhead", "playzone", "none"];
  if (!validStates.includes(state)) {
    console.warn(`[playheadToggle] Invalid state: ${state}`);
    return;
  }
  
  playheadVisibilityState = state;
  applyPlayheadVisibility(state);
  
  const btn = document.getElementById("playhead-toggle-button");
  if (btn) {
    btn.dataset.state = state;
    btn.title = getPlayheadToggleTitle(state);
    updatePlayheadToggleIcon(btn, state);
  }
}

/**
 * Get current visibility state
 * @returns {"both"|"playhead"|"playzone"|"none"}
 */
export function getPlayheadVisibility() {
  return playheadVisibilityState;
}

// ============================================================================
// CSS for the button states (add to your stylesheet)
// ============================================================================
/*
.gui-grid-2x3 {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 4px;
}


*/


// ============================================================================
// Auto-initialize if DOM is ready
// ============================================================================
console.log("[playheadToggle] Script loaded, readyState:", document.readyState);

if (document.readyState === "loading") {
  console.log("[playheadToggle] DOM still loading, adding DOMContentLoaded listener");
  document.addEventListener("DOMContentLoaded", () => {
    console.log("[playheadToggle] DOMContentLoaded fired, calling initPlayheadToggle()");
    initPlayheadToggle();
  });
} else {
  // DOM already loaded, init immediately (but defer to next tick)
  console.log("[playheadToggle] DOM already ready, scheduling init on next tick");
  setTimeout(() => {
    console.log("[playheadToggle] Next tick, calling initPlayheadToggle()");
    initPlayheadToggle();
  }, 0);
}