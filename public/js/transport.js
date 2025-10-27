

window.seekDebounceTime = 300;
window.seekingTimeout = null;

document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); // ✅ Prevents page scrolling

    // 🟢 Capture whether playback was active before seek
    const wasPlayingBeforeSeek = window.isPlaying === true;

    window.isSeeking = true;

    if (event.key === 'ArrowLeft') {
      rewind();
    } else if (event.key === 'ArrowRight') {
      forward();
    }

    if (seekingTimeout) clearTimeout(seekingTimeout);

    seekingTimeout = setTimeout(() => {
      window.isSeeking = false;
      window.allowCues = true;
      window.cueDisabledUntil = 0;

      checkCueTriggers();

      // ✅ Always resume playback if it was running before seek
      if (wasPlayingBeforeSeek) {
        window.startPlayback(); // resume
      }

    }, seekDebounceTime);
  }
});



// end of seeking logiC ///////////////////////////////////////////////



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
* ✅ Rewinds playback to the start of the score.
* - Resets `playheadX` to 0 and ensures immediate UI update.
* - Prevents unwanted sync overrides from reverting the rewind.
* - Clears triggered cues and resets playback state.
* - Sends an updated state to the server to sync all clients.
*/

window.ignoreRewindOnStartup = false; // ✅ Prevents unnecessary resets
window.suppressSync = false;

export const rewindToStart = () => {
  console.log("[DEBUG] Rewinding to start.");

  window.playheadX = 0;
  window.elapsedTime = 0;
  // resetStopwatch(); // ✅ Reset stopwatch

  window.scoreContainer.scrollLeft = Math.max(0, window.playheadX);
  window.speedMultiplier = getSpeedForPosition(window.playheadX);
  window.updateSpeedDisplay();

  updatePosition();
  // updateSeekBar();

  if (triggeredCues) {
    triggeredCues.clear(); // ✅ Ensure cues retrigger after rewind
    window._cueInsideState?.clear();
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
* ✅ Moves backward by a fixed distance on the score based on `playheadX`.
* - Ensures smooth cue retriggering after rewinding.
* - Updates UI elements and syncs with the server.
*/

export const rewind = () => {
  const REWIND_INCREMENT_X = (1000 / duration) * window.scoreWidth; // ✅ Convert time step into X coordinate shift
  window.playheadX = Math.max(window.playheadX - REWIND_INCREMENT_X, 0);

  window.scoreContainer.scrollLeft = window.playheadX;
  // console.log(`[DEBUG] Rewind applied. Newwindow.playheadX: ${window.playheadX}`);

  // ✅ Calculate `elapsedTime` based on `playheadX` for reference
  window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;
  // console.log(`[DEBUG] Synced elapsedTime fromwindow.playheadX: ${elapsedTime}`);

  if (triggeredCues) {
    triggeredCues.clear(); // ✅ Ensure cues retrigger after rewind
    window._cueInsideState?.clear();
    // console.log("[DEBUG] Cleared triggered cues due to rewind.");
  }

  // ✅ Apply and store correct speed based on the new playhead position
  window.speedMultiplier = getSpeedForPosition(window.playheadX);
  // console.log(`[DEBUG] After rewind, applying speed: ${speedMultiplier}`);
  window.updateSpeedDisplay();

  updatePosition();
  // updateSeekBar();
  //updatestopwatch();

  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    window.socket?.send(JSON.stringify({
      type: 'jump', playheadX: window.playheadX,
      elapsedTime: window.elapsedTime
    }));
  }

  /* ✅ Ignore the next sync broadcast — it's our own jump being echoed */
  window.ignoreNextSync = true;

  /* ✅ Prevent server from overriding our new position for a short window */
  window.recentlyRecalculatedPlayhead = true;
  setTimeout(() => { window.recentlyRecalculatedPlayhead = false; }, 500);

  /* ✅ Ensure local animation keeps running if playback is active */
  if (window.isPlaying) {
    console.log("[DEBUG] Freewheel continue after seek");
    window.animationPaused = false;
    window.isSeeking = false;

    window.startAnimation?.();
    window.startStopwatch?.();
  }

};


/**
* ✅ Moves forward by a fixed distance on the score based on `playheadX`.
* - Ensures smooth cue retriggering after advancing.
* - Updates UI elements and syncs with the server.
*/

export const forward = () => {
  const FORWARD_INCREMENT_X = (1000 / duration) * window.scoreWidth; // ✅ Convert time step into X coordinate shift
  window.playheadX = Math.min(window.playheadX + FORWARD_INCREMENT_X, window.scoreWidth);

  window.scoreContainer.scrollLeft = window.playheadX;
  // console.log(`[DEBUG] Forward applied. Newwindow.playheadX: ${window.playheadX}`);

  // ✅ Calculate `elapsedTime` based on `playheadX` for reference
  window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;
  // console.log(`[DEBUG] Synced window.elapsedTime fromwindow.playheadX: ${elapsedTime}`);

  if (triggeredCues) {
    triggeredCues.clear(); // ✅ Ensure cues retrigger after forward
    window._cueInsideState?.clear();
    // console.log("[DEBUG] Cleared triggered cues due to forward.");
  }

  // ✅ Apply and store correct speed based on the new playhead position
  window.speedMultiplier = getSpeedForPosition(window.playheadX);
  // console.log(`[DEBUG] After rewind, applying speed: ${speedMultiplier}`);
  window.updateSpeedDisplay();


  updatePosition();
  // updateSeekBar();
  //updatestopwatch();


  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    window.socket?.send(JSON.stringify({
      type: 'jump', playheadX: window.playheadX,
      elapsedTime: window.elapsedTime
    }));
  }

  /* ✅ Ignore the next sync broadcast — it's our own jump being echoed */
  window.ignoreNextSync = true;

  /* ✅ Prevent server from overriding our new position for a short window */
  window.recentlyRecalculatedPlayhead = true;
  setTimeout(() => { window.recentlyRecalculatedPlayhead = false; }, 500);

  /* ✅ Ensure local animation keeps running if playback is active */
  if (window.isPlaying) {
    console.log("[DEBUG] Freewheel continue after seek");
    window.animationPaused = false;
    window.isSeeking = false;

    window.startAnimation?.();
    window.startStopwatch?.();
  }

};



/**
 * getSpeedForPosition(xPosition)
 * Determines the correct speed multiplier based on the nearest previous cueSpeed.
 * Defaults to the project's preferred speed (or 1.0 if undefined).
 */
export function getSpeedForPosition(xPosition) {
  const viewportOffset = window.scoreContainer?.offsetWidth / 2 || 0;
  const adjustedPlayheadX = xPosition + viewportOffset;
  const defaultSpeed = window.oscillaPrefs?.defaultPlaybackSpeed ?? 1.0;

  if (!window.speedCueMap || window.speedCueMap.length === 0) {
    console.warn(`[WARNING] No speed cues exist. Defaulting to project speed ${defaultSpeed}x.`);
    setSpeed(defaultSpeed);                  // ✅ syncs with server
    return defaultSpeed;
  }

  const lastSpeedCue = window.speedCueMap
    .filter(cue => cue.position <= adjustedPlayheadX)
    .slice(-1)[0];

  if (lastSpeedCue) {
    setSpeed(lastSpeedCue.multiplier);       // ✅ syncs with server
    return window.speedMultiplier;
  } else {
    console.log(`[DEBUG] ❗ No previous speed cue found, defaulting to ${defaultSpeed}x`);
    setSpeed(defaultSpeed);                  // ✅ syncs with server
    return defaultSpeed;
  }
}




/**
 *  Keyboard & UI Speed Multiplier Control
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



///////////////////////////////////////
// SEEKBAR LOGIC
// export  const updateSeekBar = () => {
//   const progress =  (window.elapsedTime / window.duration) * 100;
//   seekBar.value = progress;
// };


let controlsTimeout; // Timer to hide controls after inactivity

export const hideControls = () => {
  const controls = document.getElementById('controls');
  const topBar = document.getElementById('top-bar'); // ✅ Include top-bar

  controls.classList.add('dismissed');
  if (topBar) topBar.classList.add('dismissed'); // ✅ Hide top-bar

  console.log('Controls hidden.');
};

export const showControls = () => {
  const controls = document.getElementById('controls');
  const topBar = document.getElementById('top-bar'); // ✅ Include top-bar

  controls.classList.remove('dismissed');
  if (topBar) topBar.classList.remove('dismissed'); // ✅ Show top-bar
};

window.hideControls = hideControls;

// -------------------------------------------------------------------
// 🧷 Controls Pin Toggle
// -------------------------------------------------------------------
window.controlsPinned = false;

export function initializeControlsPin() {
  const pinButton = document.getElementById("pin-controls");
  if (!pinButton) return console.warn("[UI] ⚠️ No #pin-controls button found.");

  pinButton.addEventListener("click", () => {
    window.controlsPinned = !window.controlsPinned;
    pinButton.classList.toggle("active", window.controlsPinned);

    if (window.controlsPinned) {
      console.log("[UI] 📌 Controls pinned — will stay visible.");
      showControls();
    } else {
      console.log("[UI] 📍 Controls unpinned — auto-hide re-enabled.");
      window.hideControlsLater(); // ✅ call the global version
    }
  });
}


// ---------------------------------------------------------
// ⏳ Hide controls later — respects pin state
// ---------------------------------------------------------
// ---------------------------------------------------------
// ⏳ Unified Hide Controls Timer (respects pin state, never resets on re-call)
// ---------------------------------------------------------
window.hideControlsLater = function (delay = 4000) {
  // 🧩 if controls are pinned, block any hide timer setup entirely
  if (window.controlsPinned) {
    console.log("[UI] 📌 Controls pinned — ignoring hideControlsLater call.");
    clearTimeout(window._hideControlsTimer);
    return;
  }

  clearTimeout(window._hideControlsTimer);
  window._hideControlsTimer = setTimeout(() => {
    if (!window.controlsPinned) {
      hideControls();
      console.log("[UI] ⏳ Auto-hide executed (unpinned).");
    }
  }, delay);
};


// Function to synchronize playback time
// Updates `elapsedTime` and aligns the score
// Ensures correct positioning and checks for active cues.
export const setElapsedTime = (newTime) => {
  window.elapsedTime = newTime; // ✅ Update playback time
  updatePosition(window.playheadX); // ✅ Use the correct playhead position

  checkCueTriggers(window.elapsedTime); // ✅ Recheck cues
};

// transport.js
export function initSeekBarListeners() {
  const seekBar = window.seekBar || document.getElementById("seek-bar");

  if (!seekBar) {
    console.warn("[transport] ⚠️ Seek bar not yet available, retrying in 300ms...");
    setTimeout(initSeekBarListeners, 300);
    return;
  }

  console.log("[transport] 🎚️ Initializing seek bar listeners.");

  //// SEEKING LOGIC ///////////////////////////////////////////

  // Starts seeking mode when the user clicks the seek bar.
  seekBar.addEventListener("mousedown", () => {
    window.isSeeking = true;
    window.stopAnimation?.();
    console.log("[CLIENT] Playback paused for seeking.");
  });

  // Updates playback time as the user moves the seek bar.
  seekBar.addEventListener("input", (event) => {
    const duration = window.duration || 0;
    const newTime = (parseInt(event.target.value, 10) / 100) * duration;
    window.setElapsedTime?.(newTime);

    window.updatePosition?.(window.playheadX);
    // window.updateSeekBar?.();
  });

  // Ends seeking mode and re-enables cues after debounce.


  seekingTimeout = window.seekingTimeout;

  seekBar.addEventListener("mouseup", (event) => {
    window.isSeeking = false;
    console.log("[CLIENT] Seeking ended. Applying debounce before re-enabling cues.");

    if (seekingTimeout) clearTimeout(seekingTimeout);
    seekingTimeout = setTimeout(() => {
      console.log("[CLIENT] Cue triggering re-enabled after debounce.");
      window.isPlaying = true;
      window.isMusicalPause = false;

      window.startStopwatch?.();
      window.startAnimation?.();

      // ✅ Send WebSocket sync to ensure all clients align
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
    }, seekDebounceTime);
  });

  console.log("[transport] ✅ Seek bar listeners attached successfully.");
}



/**
 * ✅ Toggles playback state between play and pause.
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

// ✅ Updates the play/pause button UI to match playback state
export const togglePlayButton = () => {
  const playButton = document.getElementById("toggle-button");

  if (playButton) {
    playButton.innerHTML = window.isPlaying
      ? '<div class="custom-pause"></div>'
      : "▶";
  } else {
    console.error("[ERROR] Play button element not found.");
  }
};

// import { getSpeedForPosition, updateSpeedDisplay } from "./cues.js";
// import { updateSeekBar } from "./transport.js"; // safe circular import; only function refs used
// import { togglePlayButton } from "./ui.js"; // if you have a UI helper
import { checkCueTriggers } from "./cues.js";
// import { updatePosition } from "./anim.js";

/**
 * ✅ Starts playback
 * - Sets all state flags
 * - Starts stopwatch + animation
 * - Syncs with server
 * - Ensures speed and seekbar are in sync
 */
export function startPlayback() {
  if (window.isPlaying) return;

  if (window.userScrolling) {
    console.warn("[Playback] ⏳ Ignored start — user still scrolling");
    return;
  }
  console.log("[Playback] ▶️ Starting playback");

  // --- State setup ---
  window.isPlaying = true;
  window.isMusicalPause = false;
  window.ignoreSyncPlayback = false;
  window.animationPaused = false;
  window.isPaused = false;

  // --- Speed setup ---
  window.speedMultiplier = getSpeedForPosition(window.playheadX);
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
  // updateSeekBar?.(); // ✅ visually sync progress bar immediately
  updatePosition?.();

  // --- Cue trigger sync ---
  checkCueTriggers?.();

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

// ✅ Pauses playback: sets state, stops animation + stopwatch, syncs with server
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

// ✅ Resume logic: reuse startPlayback() for consistency
export function resumePlayback() {
  console.log("[Playback] 🔁 resumePlayback() called");
  window.startPlayback();
};




//////////////////////////////////////////////////

export const jumpToCueId = (id) => {
  // Try first in cues[]
  let target = cues.find(c => c.id === id || c.id.startsWith(id + "-"));

  // Fallback to global SVG search if not found in cues[]
  if (!target) {
    target = document.getElementById(id);
  }

  if (!target) {
    console.warn(`[jumpToCueId] Cue not found: ${id}`);
    return;
  }

  let targetX = target.x;
  if (typeof targetX !== 'number') {
    targetX = parseFloat(target.getAttribute('x')) || 0;
  }

  window.playheadX = targetX - (window.innerWidth / 2);
  window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;
  window.scoreContainer.scrollLeft = window.playheadX;

  console.log(`[jumpToCueId] Jumping to ${id} (window.playheadX: ${window.playheadX})`);

  if (window.wsEnabled && window.socket && socket.readyState === WebSocket.OPEN) {
    window.socket?.send(JSON.stringify({
      type: 'jump', playheadX: window.playheadX,
      elapsedTime: window.elapsedTime
    }));
  }

  updatePosition();
  // updateSeekBar();
  //updatestopwatch();
};







document.addEventListener('fullscreenchange', () => {

  if (document.fullscreenElement) {
    hideControls();
  } else {
    showControls();
    clearTimeout(controlsTimeout);
  }

  // 🔥 Ensurewindow.playheadX is recalculated on fullscreen change
  // recalculatePlayheadPosition(window.scoreSVG);
  calculateMaxScrollDistance();
  // extractScoreElements(svgElement);

});

window.dispatchEvent(new Event("resize"));
window.addEventListener('resize', () => {
  const startTime = performance.now();
  extractScoreElements(window.scoreSVG);
  const endTime = performance.now();
  console.log(`[DEBUG] ⏳ extractScoreElements executed in ${(endTime - startTime).toFixed(2)}ms`);
  console.log("[DEBUG] ✅ Extracted Score Elements. Now Checking Sync...");


  console.log("[DEBUG] Resize detected, recalculating maxScrollDistance and aligning playhead...");
  calculateMaxScrollDistance();
});

//document.addEventListener('fullscreenchange', adjustscoreContainerHeight);

// // Show controls on user interaction in fullscreen mode
// let hideControlsTimeout; // Store timeout reference

// document.addEventListener('mousemove', () => {
//   showControls(); // ✅ Show controls on mouse move

//   // ✅ Clear any existing timeout before starting a new one
//   clearTimeout(hideControlsTimeout);

//   // ✅ Set a new timeout to hide controls after 5 seconds
//   hideControlsTimeout = setTimeout(() => {
//     hideControls();
//   }, 5000);

// });// document.addEventListener('keydown', showControls);   // Show controls on key press

// // Show controls on user interaction in fullscreen mode

// document.addEventListener('mousemove', () => {
//   if (document.fullscreenElement) {
//     showControls(); // ✅ Show controls on mouse move

//     // ✅ Clear any existing timeout before starting a new one
//     clearTimeout(hideControlsTimeout);

//     // ✅ Set a new timeout to hide controls after 5 seconds
//     hideControlsTimeout = setTimeout(() => {
//       hideControls();
//     }, 5000);
//   }
// // });

// document.addEventListener('keydown', (event) => {
//   // ✅ Ignore arrow keys & spacebar when seeking or pausing
//   if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === " ") {
//     return; // ✅ Do nothing, skip showing controls
//   }

//   // ✅ Show controls for other key presses
//   showControls();

//   // ✅ Hide controls after 5 seconds
//   setTimeout(() => {
//     hideControls();
//   }, 5000);

// });





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
    console.log("[TAP] 🎛️ Showing controls (via double tap)");
    showControls();

    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      console.log("[TAP] ⏳ Hiding controls (timeout expired)");
      hideControls();
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
    const t = e.changedTouches[0];
    const dx = Math.abs(t.clientX - startX);
    const dy = Math.abs(t.clientY - startY);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) return; // it’s a scroll

    const now = Date.now();
    const delta = now - lastTapTime;

    clearTimeout(tapTimeout);

    if (delta >= DOUBLE_TAP_MIN && delta <= DOUBLE_TAP_MAX) {
      console.log("[TAP] ✅ Confirmed DOUBLE TAP");
      showControls();
      hideControlsLater();
      lastTapTime = 0; // reset
    } else {
      lastTapTime = now;
      // optional: single-tap fallback
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


/* ---------------------------------------------------------------------------
*  HYBRID SCROLL HANDLER + PLAYBACK GESTURE CONTROL
*  ---------------------------------------------------------------------------
*  • Sends throttled "jump" WS messages while user scrolls.
*  • Sends one final "jump" on scroll end.
*  • If playback is running when scroll starts, it pauses automatically.
*  • When scroll finishes, playback resumes only if it was playing before.
* --------------------------------------------------------------------------- */
/* ---------------------------------------------------------------------------
 *  HYBRID SCROLL + GESTURE PLAYBACK CONTROL  (debounced + safe resume)
 * --------------------------------------------------------------------------- */
(() => {
  const scoreArea = document.getElementById("scoreContainer");
  if (!scoreArea) return;

  const SEND_INTERVAL = 80;
  const SCROLL_THRESHOLD = 6;
  const SCROLL_END_DELAY = 80; // wait after final scroll before resume

  let lastSent = 0;
  let lastScrollPos = scoreArea.scrollLeft;
  let scrollEndTimer = null;
  let resumeTimer = null;
  let wasPlayingBeforeScroll = false;

  scoreArea.addEventListener("scroll", () => {
    if (window.programmaticScroll) return;

    const pos = scoreArea.scrollLeft;
    const delta = Math.abs(pos - lastScrollPos);
    lastScrollPos = pos;

    if (delta < SCROLL_THRESHOLD) return;

    // Pause playback when swipe begins
    if (!window.userScrolling) {
      window.userScrolling = true;
      if (window.isPlaying) {
        wasPlayingBeforeScroll = true;
        console.log("[GESTURE] 🖐️ Swipe detected — pausing playback");
        window.pausePlayback?.();
      } else {
        wasPlayingBeforeScroll = false;
      }
    }

    window.ignoreSyncPlayback = true;

    // Throttled WS jump while scrolling
    const now = performance.now();
    if (now - lastSent > SEND_INTERVAL) {
      lastSent = now;
      const scrollMax = scoreArea.scrollWidth - scoreArea.clientWidth;
      const elapsed =
        scrollMax > 0 ? (pos / scrollMax) * (window.totalDuration || 1) : 0;
      window.playheadX = pos;
      window.elapsedTime = elapsed;
      if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
        window.socket.send(
          JSON.stringify({
            type: "jump",
            playheadX: pos,
            elapsedTime: elapsed,
            source: "scroll",
          })
        );
      }
    }

    // Reset scroll-end timer
    clearTimeout(scrollEndTimer);
    scrollEndTimer = setTimeout(() => {
      if (window.programmaticScroll) return;

      const scrollMax = scoreArea.scrollWidth - scoreArea.clientWidth;
      const elapsed =
        scrollMax > 0 ? (pos / scrollMax) * (window.totalDuration || 1) : 0;
      window.playheadX = pos;
      window.elapsedTime = elapsed;

      if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
        window.socket.send(
          JSON.stringify({
            type: "jump",
            playheadX: pos,
            elapsedTime: elapsed,
            source: "scrollend",
          })
        );
        console.log("[SCROLL] 🛰️ Final jump broadcast:", pos);
      }

      // Mark scroll ended
      window.userScrolling = false;
      window.ignoreSyncPlayback = false;

      // Debounce: cancel any existing resume attempts
      clearTimeout(resumeTimer);

      if (wasPlayingBeforeScroll) {

        if (triggeredCues) {
          triggeredCues.clear(); // ✅ Ensure cues retrigger after rewind
          window._cueInsideState?.clear();
          console.log("[DEBUG] Cleared triggered cues due to rewind.");
        }

        console.log("[GESTURE] ⏳ Scroll finished — scheduling resume…");

        resumeTimer = setTimeout(() => {
          // Check again: no further scroll since we scheduled this
          if (!window.userScrolling) {
            console.log("[GESTURE] ▶️ Resuming playback after settle delay");


            window.startPlayback?.();

            wasPlayingBeforeScroll = false;
          } else {
            console.log("[GESTURE] 🚫 Resume canceled — still scrolling");
          }
        }, SCROLL_END_DELAY);
      } else {
        console.log("[GESTURE] ⏸️ Scroll finished — staying paused");
      }
    }, SCROLL_END_DELAY);
  });

  console.log("[SCROLL] ✅ Debounced scroll/gesture-playback control active");
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

// ------------------------------------------------------------

// ======================================================
// SPLASH SCREEN CONTROL
// ======================================================

function setSplashVisibility(show) {
  const splash = document.getElementById('splash');
  const scoreContainer = window.scoreContainer || document.getElementById('scoreContainer');
  const controls = document.getElementById('controls');

  if (!splash) {
    console.error('[Splash] Missing #splash element');
    return;
  }

  if (show) {
    console.log('[Splash] Showing splash screen.');
    splash.style.display = 'flex';
    splash.classList.remove('hidden');
    if (scoreContainer) scoreContainer.style.display = 'none';
    if (controls) controls.style.display = 'none';
  } else {
    console.log('[Splash] Hiding splash screen.');
    splash.style.display = 'none';
    splash.classList.add('hidden');
    if (scoreContainer) scoreContainer.style.display = 'block';
    if (controls) controls.style.display = 'flex';

    // ✅ make sure pin controls activates *after* controls are visible
    setTimeout(() => {
      if (typeof initializeControlsPin === "function") {
        console.log("[UI] Initializing pin controls after splash hide");
        initializeControlsPin();
      }
    }, 300);

    // Reinitialize SVG when showing the score
    const svgElement = document.querySelector('svg');
    if (svgElement) initializeSVG(svgElement);
  }
}


export function showSplashScreen() {
  setSplashVisibility(true);
}

export function hideSplashScreen() {
  setSplashVisibility(false);
}

export function toggleSplashScreen() {
  const splash = document.getElementById('splash');
  const isHidden = splash?.style.display === 'none' || splash?.classList.contains('hidden');
  setSplashVisibility(isHidden);
}

window.showSplashScreen = showSplashScreen;
window.hideSplashScreen = hideSplashScreen;
window.toggleSplashScreen = toggleSplashScreen;


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

