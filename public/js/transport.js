  
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
    resetStopwatch(); // ✅ Reset stopwatch
  
    window.scoreContainer.scrollLeft = Math.max(0, window.playheadX);
    window.speedMultiplier = getSpeedForPosition(window.playheadX);
    window.updateSpeedDisplay();
  
    updatePosition();
    // updateSeekBar();
  
    suppressSync = true;
  
    if (window.wsEnabled && window.socket.readyState === WebSocket.OPEN) {
      window.socket.send(JSON.stringify({
        type: 'jump',
        playheadX: window.playheadX,
        elapsedTime: window.elapsedTime
      }));
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

    window.scoreContainer.scrollLeft =window.playheadX;
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
      window.socket?.send(JSON.stringify({ type: 'jump', playheadX: window.playheadX, 
        elapsedTime: window.elapsedTime }));
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

    window.scoreContainer.scrollLeft =window.playheadX;
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
      window.socket?.send(JSON.stringify({ type: 'jump', playheadX: window.playheadX, 
        elapsedTime: window.elapsedTime }));
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
   export  function pausePlayback() {
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
    
        if (window.wsEnabled &&window.socket&& socket.readyState === WebSocket.OPEN) {
          window.socket?.send(JSON.stringify({ type: 'jump', playheadX: window.playheadX, 
            elapsedTime: window.elapsedTime }));
        }
    
        updatePosition();
        // updateSeekBar();
        //updatestopwatch();
      };
    
    