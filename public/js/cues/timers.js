
window.autostartStopwatchCues = () => {
  if (!window.cues) return;

  for (const c of window.cues) {
    if (!c.ast || c.ast.type !== "cueStopwatch") continue;

    // trig:auto only
    const trigPair = c.ast.args?.find(p => p.type === "trig");
    const trig = (trigPair?.value || "auto").toLowerCase();
    if (trig !== "auto") continue;

    // Prevent double autostart
    if (c._autoStarted) continue;
    c._autoStarted = true;

    console.warn("[cueStopwatch] 🔁 AUTOSTART", c.id);
    handleStopwatchCue(c.ast, c.element, { fromCueTrigger: false });
  }
};




// -------------------------------------------------------
// 🚨 GLOBAL: dismiss ALL active stopwatch overlays
// -------------------------------------------------------
export function dismissAllStopwatchOverlays() {

  console.log("[STOPWATCH] ✋ Dismissing all stopwatch overlays");

  // remove any overlay nodes
  document.querySelectorAll('[id^="cue-stopwatch-"]').forEach(div => {
    if (div._intervalId) clearInterval(div._intervalId);
    div.remove();
  });

  // restore original cue visibility
  if (window.cues) {
    for (const c of window.cues) {
      if (!c.ast || c.ast.type !== "cueStopwatch") continue;

      const el = c.element;
      if (!el) continue;

      try {
        // if previously hidden by stopwatch
        if (el._stopwatchHidden) {
          el.style.display = el._stopwatchHidden.display || "";
          el.style.opacity = el._stopwatchHidden.opacity || "";
          el.style.pointerEvents = el._stopwatchHidden.pointerEvents || "";
          delete el._stopwatchHidden;
        }
      } catch(e) {
        console.warn("[STOPWATCH] failed restoring cue:", e);
      }
    }
  }
}


function restoreStopwatchCue(cueElement) {
  if (!cueElement || !cueElement._stopwatchHidden) return;

  const prev = cueElement._stopwatchHidden;
  cueElement.style.display = prev.display || "";
  cueElement.style.opacity = prev.opacity || "";
  cueElement.style.pointerEvents = prev.pointerEvents || "";

  delete cueElement._stopwatchHidden;
}




export function handleStopwatchCue(ast, cueElement = null, options = {}) {
  const { fromCueTrigger = false } = options;

  console.groupCollapsed("%c[STOPWATCH] ENTER", "color:#f55;font-weight:bold;");
  console.log("[STOPWATCH] ast:", ast);
  console.log("[STOPWATCH] cueElement:", cueElement);
  console.log("[STOPWATCH] fromCueTrigger:", fromCueTrigger);

  // -----------------------------------------
  // PARAM EXTRACTION
  // -----------------------------------------
  const params = {};
  for (const p of (ast.args || [])) {
    params[p.type] = p.value;
  }
  console.log("[STOPWATCH] raw params:", params);

  // -----------------------------------------
  // TRIGGER LOGIC
  // -----------------------------------------
  const trig = (params.trig || "auto").toLowerCase();
  console.log("[STOPWATCH] trig:", trig, "fromCueTrigger:", fromCueTrigger);

  // trig:playhead → only when crossing
  if (trig === "playhead" && !fromCueTrigger) {
    console.warn("[STOPWATCH] trig:playhead → ignoring (not from crossing)");
    console.groupEnd();
    return;
  }

  // trig:manual → only when explicitly triggered
  if (trig === "manual" && !fromCueTrigger) {
    console.warn("[STOPWATCH] trig:manual → ignoring (not from explicit trigger)");
    console.groupEnd();
    return;
  }

  // trig:auto → autostart only in PAGE mode
  if (trig === "auto" && !fromCueTrigger && window.currentMode === "scroll") {
    console.warn("[STOPWATCH] trig:auto → blocked because in scroll mode");
    console.groupEnd();
    return;
  }

  console.log("[STOPWATCH] ▶ Proceeding past trig");


  // -----------------------------------------
  // VALIDATION
  // -----------------------------------------
  if (!cueElement) {
    console.error("[STOPWATCH] ❌ ERROR: no cueElement provided");
    console.groupEnd();
    return;
  }


  // -----------------------------------------
  // PARAM NORMALIZATION
  // -----------------------------------------
  const hold        = Number(params.hold || 0);
  const followScroll = (params.scroll === true || params.scroll === "true");
  const offsetX     = Number(params.offsetX || 0);
  const sourceType  = params.source || "main";
  const styleString = params.style ? params.style.replace(/^['"]|['"]$/g, "") : null;

  console.log("[STOPWATCH] normalized:",
    { hold, followScroll, offsetX, sourceType, styleString });


  // -----------------------------------------
  // CONTAINER TARGET
  // -----------------------------------------
  const score = document.getElementById("scoreContainer");
  if (!score) {
    console.error("[STOPWATCH] ❌ No scoreContainer found");
    console.groupEnd();
    return;
  }

  // -----------------------------------------
  // POSITIONING CALCULATION
  // -----------------------------------------
  const bbox = cueElement.getBoundingClientRect();
  const containerBox = score.getBoundingClientRect();
  const scrollX = score.scrollLeft || 0;
  const scrollY = score.scrollTop  || 0;

  console.log("[STOPWATCH] bbox:", bbox);
  console.log("[STOPWATCH] containerBox:", containerBox);
  console.log("[STOPWATCH] scroll offsets:", { scrollX, scrollY });

  const x = (followScroll ? bbox.left - containerBox.left + scrollX : bbox.left) + offsetX;
  const y = (followScroll ? bbox.top  - containerBox.top  + scrollY - 10 : bbox.top - 10);

  console.log("[STOPWATCH] final coords:", { left:x, top:y });


  // -----------------------------------------
  // OVERLAY ELEMENT
  // -----------------------------------------
  const divId = `cue-stopwatch-${sourceType}`;
  let div = document.getElementById(divId);
  let startTime = Date.now();
  let intervalId;

  if (div) {
    console.warn(`[STOPWATCH] ⚡ Reusing overlay: ${divId}`);
    div.textContent = "00:00";
    div.style.opacity = "1";
    div.style.transition = "none";

    if (div._intervalId) {
      console.log("[STOPWATCH] clearing previous interval");
      clearInterval(div._intervalId);
    }
  } else {
    console.log(`[STOPWATCH] 🆕 Creating overlay: ${divId}`);

    div = document.createElement("div");
    div.id = divId;
    div.className = "cue-stopwatch-display";
    div.style.position = followScroll ? "absolute" : "fixed";
    div.style.left = `${x}px`;
    div.style.top  = `${y}px`;
    div.style.transform = "translate(0,0)";
    div.style.zIndex = "999999";

    if (styleString) {
      console.log("[STOPWATCH] Applying custom style:", styleString);
      styleString.split(";").forEach(rule => {
        const [prop, val] = (rule || "").split(":").map(s => s && s.trim());
        if (prop && val) div.style[prop] = val;
      });
    }

    if (followScroll) {
      console.log("[STOPWATCH] appended to score container");
      score.appendChild(div);
    } else {
      console.log("[STOPWATCH] appended to document.body");
      document.body.appendChild(div);
    }
  }

  console.log("[STOPWATCH] Overlay DOM node:", div);


  // -----------------------------------------
  // TIMER LOGIC
  // -----------------------------------------
  if (sourceType === "main") {
    console.log("[STOPWATCH] Mode: main — showing global stopwatch time");

    div.textContent = getStopwatchTime();
    intervalId = setInterval(() => {
      div.textContent = getStopwatchTime();
      if (followScroll) {
        const b = cueElement.getBoundingClientRect();
        const sx = score.scrollLeft || 0;
        const sy = score.scrollTop || 0;
        div.style.left = `${b.left - containerBox.left + sx + offsetX}px`;
        div.style.top  = `${b.top  - containerBox.top  + sy - 10}px`;
      }
    }, 1000);

  } else if (sourceType === "new") {
    console.log("[STOPWATCH] Mode: new — fresh stopwatch starting now");

    intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const s = String(elapsed % 60).padStart(2, "0");
      div.textContent = `${m}:${s}`;
    }, 1000);

    if (!hold) {
      console.log("[STOPWATCH] Click-to-remove enabled (no hold)");
      div.style.cursor = "pointer";
      div.onclick = () => {
        clearInterval(intervalId);
          restoreStopwatchCue(cueElement);

        div.remove();
      };
    }
  }

  div._intervalId = intervalId;
  console.log("[STOPWATCH] intervalId stored:", intervalId);


  // -----------------------------------------
  // HOLD-FOR-FADE
  // -----------------------------------------
  if (hold > 0) {
    console.log(`[STOPWATCH] Fade after ${hold}s`);
    setTimeout(() => {
      clearInterval(intervalId);
      div.style.transition = "opacity 1s ease";
      div.style.opacity = "0";
      setTimeout(() => {
        console.log("[STOPWATCH] Removing after fade");
          restoreStopwatchCue(cueElement);

        div.remove();
      }, 1000);
    }, hold * 1000);
  }


if (cueElement && !cueElement._stopwatchHidden) {
  cueElement._stopwatchHidden = {
    display: cueElement.style.display,
    opacity: cueElement.style.opacity,
    pointerEvents: cueElement.style.pointerEvents
  };
}


  // -----------------------------------------
  // HIDE ORIGINAL CUE
  // -----------------------------------------
  if (cueElement && cueElement.style) {
    cueElement.style.opacity = "0";
    cueElement.style.display = "none";
    cueElement.style.pointerEvents = "none";
    console.log("[STOPWATCH] Hid original cue placeholder");
  }

  console.groupEnd();
}







// stopwatch.js — simple standalone timer
// --------------------------------------
// Provides a real-time stopwatch with Start / Pause / Reset controls.
// Does not depend on transport, elapsedTime, or any global vars.

export function initStopwatch() {
  let startTime = 0;
  let elapsed = 0;
  let timerInterval = null;

  const display = document.getElementById("stopwatch");
  const startBtn = document.getElementById("startBtn");
  const pauseBtn = document.getElementById("pauseBtn");
  const resetBtn = document.getElementById("resetBtn");

  if (!display || !startBtn || !pauseBtn || !resetBtn) {
    console.warn("[stopwatch] Missing one or more DOM elements.");
    return;
  }

  const updateDisplay = () => {
    const totalSeconds = Math.floor(elapsed / 1000);
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    display.textContent = `${minutes}:${seconds}`;
  };

  const start = () => {
    if (timerInterval) return; // already running
    startTime = Date.now() - elapsed;
    timerInterval = setInterval(() => {
      elapsed = Date.now() - startTime;
      updateDisplay();
    }, 200); // update 5× per second
  };

  const pause = () => {
    if (!timerInterval) return;
    clearInterval(timerInterval);
    timerInterval = null;
  };

  const reset = () => {
    clearInterval(timerInterval);
    timerInterval = null;
    elapsed = 0;
    updateDisplay();
  };

  startBtn.addEventListener("click", start);
  pauseBtn.addEventListener("click", pause);
  resetBtn.addEventListener("click", reset);

  updateDisplay();
  console.log("[stopwatch] Initialized");
}

export function getStopwatchTime() {
  const display = document.getElementById("stopwatch");
  return display ? display.textContent : "00:00";
}


/*!
 * stopwatch.js — Real-Time Performance Stopwatch for OscillaScore
 *
 * Tracks real elapsed time from performance start, including musical pauses (e.g. improvisation sections).
 * Automatically pauses only for non-musical interruptions such as manual stop/pause via interface.
 *
 * Usage:
 *  - startStopwatch(): begins or resumes counting time.
 *  - stopStopwatch(): halts stopwatch if pause is NOT musical.
 *  - resumeStopwatch(): resumes only after interface-controlled pause.
 *  - resetStopwatch(): resets all time tracking.
 *
 * Dependencies:
 *  - Relies on `window.isMusicalPause = true | false` to distinguish pause types.
 */

let realStartTime = null;
let accumulatedTime = 0;
let isRunning = false;
let stopwatchInterval = null;


/**
 * Starts or resumes the stopwatch.
 * This should be called when the performance begins or resumes.
 */
export function startStopwatch() {
  if (!isRunning) {
    realStartTime = Date.now();
    isRunning = true;
    requestAnimationFrame(updateStopwatch);
  }
}

/**
 * Stops the stopwatch — but only if this is a non-musical pause.
 * For musical pauses, the stopwatch keeps running.
 */

export function stopStopwatch() {
    if (window.isMusicalPause) {
      console.log("[stopwatch] Musical pause active — keeping stopwatch running.");
      return;
    }
  
    if (isRunning) {
      const now = Date.now();
      accumulatedTime += (now - realStartTime) / 1000; // ✅ capture accumulated time
      isRunning = false;
      console.log("[stopwatch] ⏸ Stopped via stopStopwatch(). Accumulated:", accumulatedTime.toFixed(2), "s");
    } else {
      // console.log("[stopwatch] ⏸ Already stopped.");
    }
  }
  
  

/**
 * Resumes stopwatch only after a non-musical interface pause.
 * Musical pauses don't require stopping/resuming — stopwatch continues uninterrupted.
 */

export function resumeStopwatch() {
    if (!isRunning && !window.isMusicalPause) {
      realStartTime = Date.now() - accumulatedTime * 1000; // ✅ restore correct base time
      isRunning = true;
      requestAnimationFrame(updateStopwatch);
    }
  }
  

/**
 * Resets all stopwatch timing.
 */
export function resetStopwatch() {
  realStartTime = null;
  accumulatedTime = 0;
  isRunning = false;
  updateDisplay(0);
}

/**
 * Internal loop: Updates stopwatch display with total elapsed real time.
 */
function updateStopwatch() {

  if (!isRunning) return;

  const realElapsed = (Date.now() - realStartTime) / 1000;
  const totalElapsed = accumulatedTime + realElapsed;
  updateDisplay(totalElapsed);
  requestAnimationFrame(updateStopwatch);
}

/**
 * Updates the DOM element with formatted time (MM:SS).
 */
function updateDisplay(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const display = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  const el = document.getElementById('stopwatch');
  if (el) el.textContent = display;
}


/**
 * Sets up fullscreen toggle behavior for the stopwatch when clicked.
 * Creates an overlay with main timer, mini timer (click to swap), and close button.
 * Supports multiple view modes: solid, blur, transparent
 * Includes countdown sequences feature
 */

// Countdown sequences storage
let countdownSequences = [];
let activeCountdown = null;
let countdownInterval = null;
let currentSequenceIndex = 0;
let isCountdownMode = false;

// Network sync disabled flag
window.auxwatchNetworkDisabled = localStorage.getItem("oscilla.auxwatchNetworkDisabled") === "true";

// Load sequences from localStorage
function loadCountdownSequences() {
  try {
    const saved = localStorage.getItem("oscilla.countdownSequences");
    if (saved) {
      countdownSequences = JSON.parse(saved);
      // Sync to server after loading (with delay to ensure socket ready)
      syncSequencesToServer();
    }
  } catch (e) {
    console.warn("[Countdown] Failed to load sequences:", e);
  }
}

// Sync sequences to server (called on load and socket connect)
function syncSequencesToServer() {
  if (window.auxwatchNetworkDisabled) return;
  if (countdownSequences.length === 0) return;
  
  // Delay to ensure socket is ready
  const attemptSync = (retries = 5) => {
    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
      broadcastSequencesUpdate();
      console.log("[Countdown] ✅ Synced sequences to server:", countdownSequences.length);
    } else if (retries > 0) {
      setTimeout(() => attemptSync(retries - 1), 200);
    } else {
      console.warn("[Countdown] ⚠️ Could not sync sequences - socket not ready");
    }
  };
  
  attemptSync();
}

// Expose for external use (e.g., on socket connect)
window.syncCountdownSequences = syncSequencesToServer;

// Save sequences to localStorage
function saveCountdownSequences() {
  try {
    localStorage.setItem("oscilla.countdownSequences", JSON.stringify(countdownSequences));
    // Refresh the discrete controls dropdown if it exists
    if (typeof window.refreshCountdownControls === 'function') {
      window.refreshCountdownControls();
    }
    // Also refresh the fullscreen dropdown
    if (typeof window._refreshCountdownDropdown === 'function') {
      window._refreshCountdownDropdown();
    }
  } catch (e) {
    console.warn("[Countdown] Failed to save sequences:", e);
  }
}

// Export sequences as JSON file
function exportCountdownSequences() {
  const blob = new Blob([JSON.stringify(countdownSequences, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "countdown-sequences.json";
  a.click();
  URL.revokeObjectURL(url);
}

// Import sequences from JSON file
function importCountdownSequences(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      if (Array.isArray(imported)) {
        countdownSequences = imported;
        saveCountdownSequences();
        // Sync imported sequences to server
        syncSequencesToServer();
        console.log("[Countdown] Imported and synced sequences:", countdownSequences.length);
      }
    } catch (err) {
      console.error("[Countdown] Import failed:", err);
    }
  };
  reader.readAsText(file);
}

// =====================================================
// SERVER-OWNED COUNTDOWN - CLIENT JUST DISPLAYS
// =====================================================

// Send commands to server (server owns the timer)
function sendCountdownStartCue(cue) {
  console.log("[Countdown] sendCountdownStartCue:", cue, "disabled:", window.auxwatchNetworkDisabled, "socket:", window.socket?.readyState);
  if (window.auxwatchNetworkDisabled) {
    console.log("[Countdown] Network disabled, not sending");
    return;
  }
  if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
    console.log("[Countdown] Socket not ready");
    return;
  }
  
  // Ensure server has latest sequences before starting
  broadcastSequencesUpdate();
  
  window.socket.send(JSON.stringify({
    type: "countdown_start_cue",
    cue: cue
  }));
  console.log("[Countdown] Sent countdown_start_cue:", cue.name);
}

function sendCountdownStartSequence(sequenceIndex) {
  console.log("[Countdown] sendCountdownStartSequence:", sequenceIndex, "disabled:", window.auxwatchNetworkDisabled, "socket:", window.socket?.readyState);
  if (window.auxwatchNetworkDisabled) {
    console.log("[Countdown] Network disabled, not sending");
    return;
  }
  if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
    console.log("[Countdown] Socket not ready");
    return;
  }
  
  // Get the actual sequence data to send with the command
  const sequence = countdownSequences[sequenceIndex];
  if (!sequence) {
    console.warn("[Countdown] ⚠️ Sequence not found at index:", sequenceIndex);
    return;
  }
  
  // First ensure server has latest sequences
  broadcastSequencesUpdate();
  
  // Then send start command with sequence data included
  window.socket.send(JSON.stringify({
    type: "countdown_start_sequence",
    sequenceIndex: sequenceIndex,
    sequence: sequence  // Include full sequence data as backup
  }));
  console.log("[Countdown] Sent countdown_start_sequence with sequence data:", sequence.name);
}

function sendCountdownStop() {
  if (window.auxwatchNetworkDisabled) return;
  if (!window.socket || window.socket.readyState !== WebSocket.OPEN) return;
  
  window.socket.send(JSON.stringify({
    type: "countdown_stop"
  }));
}

// Broadcast sequences to server (for storage and sharing)
function broadcastSequencesUpdate() {
  if (window.auxwatchNetworkDisabled) {
    console.log("[Countdown] broadcastSequencesUpdate skipped - network disabled");
    return;
  }
  if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
    console.log("[Countdown] broadcastSequencesUpdate skipped - socket not ready");
    return;
  }
  
  console.log("[Countdown] Broadcasting sequences to server:", countdownSequences.length, "sequences");
  window.socket.send(JSON.stringify({
    type: "countdown_sequences_update",
    sequences: countdownSequences
  }));
}

// Request sequences from server
function requestSequencesFromNetwork() {
  if (window.auxwatchNetworkDisabled) return;
  if (!window.socket || window.socket.readyState !== WebSocket.OPEN) return;
  
  window.socket.send(JSON.stringify({
    type: "countdown_sequences_request"
  }));
}

// Handle incoming countdown_sequences_update message
function handleCountdownMessage(data) {
  if (data.type === "countdown_sequences_update") {
    if (window.auxwatchNetworkDisabled) return;
    if (data.sequences && Array.isArray(data.sequences)) {
      countdownSequences = data.sequences;
      saveCountdownSequences();
      console.log("[Countdown] Received sequences:", countdownSequences.length);
      // Re-render if editor is open
      const list = document.getElementById("countdown-sequences-list");
      if (list) {
        // Will be rendered by the function inside the closure
        window._renderCountdownSequences?.();
      }
      // Refresh discrete controls dropdown
      if (typeof window.refreshCountdownControls === 'function') {
        window.refreshCountdownControls();
      }
    }
  }
}

// Update display from server sync state (called from oscillaSystemSocket)
// Track previous state to detect completion
let _previousCountdownRunning = false;

function updateCountdownDisplay(countdown) {
  const stopwatchEl = document.getElementById("stopwatch");
  const mainTimeEl = document.getElementById("fullscreen-main-time");
  const mainLabelEl = document.getElementById("fullscreen-main-label");
  const miniTimeEl = document.getElementById("fullscreen-mini-time");
  const miniLabelEl = document.getElementById("fullscreen-mini-label");
  
  const isRunning = countdown && countdown.running;
  
  // Determine which display is the "Timer" (not Performance)
  // showingPerformanceTime means: main=Performance, mini=Timer
  // !showingPerformanceTime means: main=Timer, mini=Performance
  const showingPerfInMain = window._showingPerformanceTime || false;
  
  // Timer elements (where countdown should display)
  const timerTimeEl = showingPerfInMain ? miniTimeEl : mainTimeEl;
  const timerLabelEl = showingPerfInMain ? miniLabelEl : mainLabelEl;
  
  if (isRunning) {
    isCountdownMode = true;
    
    // Format time
    const min = Math.floor(countdown.remainingSec / 60);
    const sec = countdown.remainingSec % 60;
    const timeStr = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    
    // Update topbar stopwatch (always shows countdown when running)
    if (stopwatchEl) {
      stopwatchEl.textContent = timeStr;
      stopwatchEl.title = countdown.cueName || "Countdown";
    }
    
    // Update Timer display in fullscreen (whichever position it's in)
    if (timerTimeEl) timerTimeEl.textContent = timeStr;
    if (timerLabelEl) timerLabelEl.textContent = countdown.cueName || "Countdown";
    
  } else if (isCountdownMode) {
    // Countdown stopped
    isCountdownMode = false;
    
    // Reset topbar
    if (stopwatchEl) {
      stopwatchEl.title = "Stopwatch";
    }
    
    // Reset Timer label in fullscreen
    if (timerLabelEl) {
      timerLabelEl.textContent = "Timer";
    }
  }
  
  // Update play/stop button state
  if (typeof window._updateCountdownControlsPlayButton === 'function') {
    window._updateCountdownControlsPlayButton(isRunning);
  }
  
  // Detect completion (was running, now stopped)
  if (_previousCountdownRunning && !isRunning) {
    if (typeof window._handleCountdownComplete === 'function') {
      window._handleCountdownComplete();
    }
  }
  
  _previousCountdownRunning = isRunning;
}

// Expose for oscillaSystemSocket to call
window.updateCountdownDisplay = updateCountdownDisplay;

// Register message handler for sequences updates
function registerCountdownMessageHandler() {
  if (!window.socket) return;
  
  window.socket.addEventListener("message", (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "countdown_sequences_update") {
        handleCountdownMessage(data);
      }
    } catch (e) {
      // Not JSON or parse error, ignore
    }
  });
  
  console.log("[Countdown] Network handler registered");
}

// Initialize network handler when socket is ready
if (window.socket) {
  registerCountdownMessageHandler();
} else {
  const checkSocket = setInterval(() => {
    if (window.socket) {
      registerCountdownMessageHandler();
      clearInterval(checkSocket);
    }
  }, 500);
}

export function setupStopwatchFullscreenToggle() {
    window.addEventListener('DOMContentLoaded', () => {
      const stopwatch = document.getElementById("stopwatch");
      const mainContent = document.getElementById("scoreContainer");
  
      if (!stopwatch || !mainContent) {
        console.error("[ERROR] Stopwatch or scoreContainer not found.");
        return;
      }
      
      // Load saved sequences
      loadCountdownSequences();
      
      let fullscreenOverlay = null;
      let showingPerformanceTime = false; // false = rehearsal (main), true = performance (main)
      let fullscreenUpdateInterval = null;
      let countdownEditorOpen = false;
      
      // View modes: 'solid', 'blur', 'transparent'
      const viewModes = ['solid', 'blur', 'transparent'];
      let currentViewMode = 0; // Start with solid
      
      function createFullscreenOverlay() {
        const overlay = document.createElement("div");
        overlay.id = "stopwatch-fullscreen-overlay";
        overlay.className = "stopwatch-fullscreen-overlay mode-solid";
        
        // Close button (top right)
        const closeBtn = document.createElement("button");
        closeBtn.className = "fullscreen-close-btn";
        closeBtn.innerHTML = "✕";
        closeBtn.title = "Close fullscreen (Escape)";
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          exitFullscreen();
        });
        
        // View mode button (top left)
        const modeBtn = document.createElement("button");
        modeBtn.className = "fullscreen-mode-btn";
        modeBtn.id = "fullscreen-mode-btn";
        modeBtn.innerHTML = "◐";
        modeBtn.title = "Change view mode";
        modeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          cycleViewMode();
        });
        
        // Mode label
        const modeLabel = document.createElement("span");
        modeLabel.className = "fullscreen-mode-label";
        modeLabel.id = "fullscreen-mode-label";
        modeLabel.textContent = "solid";
        
        // Main time label
        const mainLabel = document.createElement("div");
        mainLabel.className = "fullscreen-main-label";
        mainLabel.id = "fullscreen-main-label";
        mainLabel.textContent = "Timer";
        
        // Main time display
        const mainTime = document.createElement("div");
        mainTime.className = "fullscreen-main-time";
        mainTime.id = "fullscreen-main-time";
        mainTime.textContent = "00:00";
        
        // Main time container (wraps label + time)
        const mainContainer = document.createElement("div");
        mainContainer.className = "fullscreen-main-container";
        mainContainer.id = "fullscreen-main-container";
        mainContainer.appendChild(mainLabel);
        mainContainer.appendChild(mainTime);
        
        // Countdown editor button (red ring) - always attached to countdown controls
        const countdownBtn = document.createElement("button");
        countdownBtn.className = "fullscreen-countdown-btn";
        countdownBtn.id = "fullscreen-countdown-btn";
        countdownBtn.title = "Edit Sequences";
        countdownBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleCountdownEditor();
        });
        
        // Mini container (clickable to swap) - for performance time initially
        const miniContainer = document.createElement("div");
        miniContainer.className = "fullscreen-mini-container";
        miniContainer.id = "fullscreen-mini-container";
        miniContainer.title = "Click to swap timers";
        miniContainer.addEventListener("click", (e) => {
          e.stopPropagation();
          swapTimers();
        });
        
        // Mini time label
        const miniLabel = document.createElement("div");
        miniLabel.className = "fullscreen-mini-label";
        miniLabel.id = "fullscreen-mini-label";
        miniLabel.textContent = "Performance";
        
        // Mini time display
        const miniTime = document.createElement("div");
        miniTime.className = "fullscreen-mini-time";
        miniTime.id = "fullscreen-mini-time";
        miniTime.textContent = "00:00";
        
        miniContainer.appendChild(miniLabel);
        miniContainer.appendChild(miniTime);
        
        // Clock container (actual time of day)
        const clockContainer = document.createElement("div");
        clockContainer.className = "fullscreen-clock-container";
        
        // Clock label
        const clockLabel = document.createElement("div");
        clockLabel.className = "fullscreen-mini-label";
        clockLabel.textContent = "Clock";
        
        // Clock time display
        const clockTime = document.createElement("div");
        clockTime.className = "fullscreen-mini-time";
        clockTime.id = "fullscreen-clock-time";
        clockTime.textContent = "00:00";
        
        clockContainer.appendChild(clockLabel);
        clockContainer.appendChild(clockTime);
        
        // =====================================================
        // COUNTDOWN CONTROLS CONTAINER (Play/Stop + Dropdown)
        // =====================================================
        const countdownControlsContainer = document.createElement("div");
        countdownControlsContainer.className = "fullscreen-countdown-controls-container";
        countdownControlsContainer.id = "fullscreen-countdown-controls";
        
        // Controls row (button + dropdown)
        const controlsRow = document.createElement("div");
        controlsRow.className = "fullscreen-countdown-controls-row";
        
        // Play/Stop button
        const playStopBtn = document.createElement("button");
        playStopBtn.id = "fullscreen-countdown-play-btn";
        playStopBtn.className = "fullscreen-countdown-play-btn";
        playStopBtn.innerHTML = "▶";
        playStopBtn.title = "Start";
        playStopBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          handlePlayStopClick();
        });
        
        // Dropdown button - just the selection text
        const dropdownBtn = document.createElement("button");
        dropdownBtn.id = "fullscreen-countdown-dropdown-btn";
        dropdownBtn.className = "fullscreen-countdown-dropdown-btn";
        dropdownBtn.innerHTML = '<span id="fullscreen-countdown-selection">—</span>';
        dropdownBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          toggleCountdownDropdown();
        });
        
        // Dropdown menu (hidden by default)
        const dropdownMenu = document.createElement("div");
        dropdownMenu.id = "fullscreen-countdown-dropdown-menu";
        dropdownMenu.className = "fullscreen-countdown-dropdown-menu hidden";
        
        controlsRow.appendChild(playStopBtn);
        controlsRow.appendChild(dropdownBtn);
        
        // Red ring button (editor toggle) - always on countdown controls
        countdownControlsContainer.appendChild(countdownBtn);
        countdownControlsContainer.appendChild(controlsRow);
        countdownControlsContainer.appendChild(dropdownMenu);
        
        // Bottom row for mini containers - now THREE equal columns
        const bottomRow = document.createElement("div");
        bottomRow.className = "fullscreen-bottom-row";
        bottomRow.appendChild(miniContainer);
        bottomRow.appendChild(clockContainer);
        bottomRow.appendChild(countdownControlsContainer);
        
        // Top controls container
        const topControls = document.createElement("div");
        topControls.className = "fullscreen-top-controls";
        topControls.appendChild(modeBtn);
        topControls.appendChild(modeLabel);
        
        // Assemble
        overlay.appendChild(topControls);
        overlay.appendChild(closeBtn);
        overlay.appendChild(mainContainer);
        overlay.appendChild(bottomRow);
        
        // Prevent clicks on overlay background from doing anything
        overlay.addEventListener("click", (e) => {
          e.stopPropagation();
        });
        
        return overlay;
      }
      
      // =====================================================
      // COUNTDOWN EDITOR
      // =====================================================
      
      function toggleCountdownEditor() {
        const existing = document.getElementById("countdown-editor");
        if (existing) {
          existing.remove();
          countdownEditorOpen = false;
          return;
        }
        countdownEditorOpen = true;
        createCountdownEditor();
      }
      
      function createCountdownEditor() {
        const editor = document.createElement("div");
        editor.id = "countdown-editor";
        editor.className = "countdown-editor";
        
        // Header
        const header = document.createElement("div");
        header.className = "countdown-editor-header";
        header.innerHTML = `<span>Countdown Sequences</span>`;
        
        const closeEditorBtn = document.createElement("button");
        closeEditorBtn.className = "countdown-editor-close";
        closeEditorBtn.innerHTML = "✕";
        closeEditorBtn.onclick = () => {
          editor.remove();
          countdownEditorOpen = false;
        };
        header.appendChild(closeEditorBtn);
        
        // Network sync checkbox row
        const syncRow = document.createElement("div");
        syncRow.className = "countdown-sync-row";
        
        const syncChk = document.createElement("input");
        syncChk.type = "checkbox";
        syncChk.id = "countdown-network-sync";
        syncChk.checked = !window.auxwatchNetworkDisabled;
        syncChk.onchange = () => {
          window.auxwatchNetworkDisabled = !syncChk.checked;
          localStorage.setItem("oscilla.auxwatchNetworkDisabled", window.auxwatchNetworkDisabled);
        };
        
        const syncLabel = document.createElement("label");
        syncLabel.htmlFor = "countdown-network-sync";
        syncLabel.textContent = "Network Sync";
        
        syncRow.appendChild(syncChk);
        syncRow.appendChild(syncLabel);
        
        // Sequences list
        const listContainer = document.createElement("div");
        listContainer.className = "countdown-editor-list";
        listContainer.id = "countdown-sequences-list";
        
        // Add sequence button
        const addSeqBtn = document.createElement("button");
        addSeqBtn.className = "countdown-add-sequence-btn";
        addSeqBtn.textContent = "+ Add Sequence";
        addSeqBtn.onclick = () => addNewSequence();
        
        // Import/Export buttons
        const ioRow = document.createElement("div");
        ioRow.className = "countdown-io-row";
        
        const exportBtn = document.createElement("button");
        exportBtn.textContent = "Export";
        exportBtn.onclick = exportCountdownSequences;
        
        const importBtn = document.createElement("button");
        importBtn.textContent = "Import";
        importBtn.onclick = () => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".json";
          input.onchange = (e) => {
            if (e.target.files[0]) {
              importCountdownSequences(e.target.files[0]);
              setTimeout(() => renderSequencesList(), 100);
            }
          };
          input.click();
        };
        
        ioRow.appendChild(exportBtn);
        ioRow.appendChild(importBtn);
        
        editor.appendChild(header);
        editor.appendChild(syncRow);
        editor.appendChild(listContainer);
        editor.appendChild(addSeqBtn);
        editor.appendChild(ioRow);
        
        document.getElementById("stopwatch-fullscreen-overlay").appendChild(editor);
        
        renderSequencesList();
      }
      
      function renderSequencesList() {
        const list = document.getElementById("countdown-sequences-list");
        if (!list) return;
        
        list.innerHTML = "";
        
        countdownSequences.forEach((seq, seqIdx) => {
          const seqEl = document.createElement("div");
          seqEl.className = "countdown-sequence";
          
          // Sequence header
          const seqHeader = document.createElement("div");
          seqHeader.className = "countdown-sequence-header";
          
          const nameInput = document.createElement("input");
          nameInput.type = "text";
          nameInput.value = seq.name || "Untitled";
          nameInput.className = "countdown-sequence-name";
          nameInput.onchange = () => {
            seq.name = nameInput.value;
            saveCountdownSequences();
          };
          
          const playSeqBtn = document.createElement("button");
          playSeqBtn.textContent = "▶";
          playSeqBtn.title = "Play sequence";
          playSeqBtn.onclick = () => startSequence(seqIdx);
          
          const deleteSeqBtn = document.createElement("button");
          deleteSeqBtn.textContent = "🗑";
          deleteSeqBtn.title = "Delete sequence";
          deleteSeqBtn.onclick = () => {
            countdownSequences.splice(seqIdx, 1);
            saveCountdownSequences();
            renderSequencesList();
          };
          
          seqHeader.appendChild(nameInput);
          seqHeader.appendChild(playSeqBtn);
          seqHeader.appendChild(deleteSeqBtn);
          
          // Loop and chain controls row
          const loopRow = document.createElement("div");
          loopRow.className = "countdown-loop-row";
          
          // Loop control
          const loopLabel = document.createElement("span");
          loopLabel.textContent = "Loop:";
          
          const loopInput = document.createElement("input");
          loopInput.type = "number";
          loopInput.value = seq.loop ?? 1;
          loopInput.min = 0;
          loopInput.className = "countdown-loop-input";
          loopInput.title = "0 = infinite, 1 = play once, 2+ = repeat";
          loopInput.onchange = () => {
            seq.loop = parseInt(loopInput.value) || 0;
            saveCountdownSequences();
            broadcastSequencesUpdate();
          };
          
          const loopHint = document.createElement("span");
          loopHint.className = "countdown-loop-hint";
          loopHint.textContent = (seq.loop === 0 || seq.loop === undefined) ? "" : (seq.loop === 0 ? "∞" : "×");
          
          // Chain to next sequence
          const chainLabel = document.createElement("span");
          chainLabel.textContent = "Then:";
          chainLabel.style.marginLeft = "10px";
          
          const chainSelect = document.createElement("select");
          chainSelect.className = "countdown-chain-select";
          chainSelect.title = "Chain to another sequence after this one";
          
          // Add "none" option
          const noneOpt = document.createElement("option");
          noneOpt.value = "";
          noneOpt.textContent = "— stop —";
          chainSelect.appendChild(noneOpt);
          
          // Add all other sequences as options
          countdownSequences.forEach((otherSeq, otherIdx) => {
            if (otherIdx !== seqIdx) {
              const opt = document.createElement("option");
              opt.value = otherIdx;
              opt.textContent = otherSeq.name || `Sequence ${otherIdx + 1}`;
              if (seq.chain === otherIdx) opt.selected = true;
              chainSelect.appendChild(opt);
            }
          });
          
          chainSelect.onchange = () => {
            const val = chainSelect.value;
            seq.chain = val === "" ? null : parseInt(val);
            saveCountdownSequences();
            broadcastSequencesUpdate();
          };
          
          loopRow.appendChild(loopLabel);
          loopRow.appendChild(loopInput);
          loopRow.appendChild(chainLabel);
          loopRow.appendChild(chainSelect);
          
          // Cues list
          const cuesContainer = document.createElement("div");
          cuesContainer.className = "countdown-cues-list";
          
          (seq.cues || []).forEach((cue, cueIdx) => {
            const cueEl = document.createElement("div");
            cueEl.className = "countdown-cue";
            
            const cueNameInput = document.createElement("input");
            cueNameInput.type = "text";
            cueNameInput.value = cue.name || "";
            cueNameInput.placeholder = "Name";
            cueNameInput.className = "countdown-cue-name";
            cueNameInput.onchange = () => {
              cue.name = cueNameInput.value;
              saveCountdownSequences();
            };
            
            const cueDurInput = document.createElement("input");
            cueDurInput.type = "number";
            cueDurInput.value = cue.seconds || 0;
            cueDurInput.placeholder = "Sec";
            cueDurInput.className = "countdown-cue-duration";
            cueDurInput.min = 1;
            cueDurInput.onchange = () => {
              cue.seconds = parseInt(cueDurInput.value) || 0;
              saveCountdownSequences();
            };
            
            const cueOnCompleteInput = document.createElement("input");
            cueOnCompleteInput.type = "text";
            cueOnCompleteInput.value = cue.onComplete || "";
            cueOnCompleteInput.placeholder = "onComplete: nav(scroll@B)";
            cueOnCompleteInput.className = "countdown-cue-oncomplete";
            cueOnCompleteInput.title = "Cue expression to trigger when this slot finishes (e.g. nav(scroll@B), ui(#layer, visible:true))";
            cueOnCompleteInput.onchange = () => {
              const val = cueOnCompleteInput.value.trim();
              cue.onComplete = val || null;
              saveCountdownSequences();
              broadcastSequencesUpdate();
            };
            
            const playCueBtn = document.createElement("button");
            playCueBtn.textContent = "▶";
            playCueBtn.title = "Play this cue only";
            playCueBtn.onclick = () => startSingleCountdown(cue);
            
            const deleteCueBtn = document.createElement("button");
            deleteCueBtn.textContent = "✕";
            deleteCueBtn.onclick = () => {
              seq.cues.splice(cueIdx, 1);
              saveCountdownSequences();
              renderSequencesList();
            };
            
            cueEl.appendChild(cueNameInput);
            cueEl.appendChild(cueDurInput);
            cueEl.appendChild(document.createTextNode("s"));
            cueEl.appendChild(cueOnCompleteInput);
            cueEl.appendChild(playCueBtn);
            cueEl.appendChild(deleteCueBtn);
            
            cuesContainer.appendChild(cueEl);
          });
          
          // Add cue button
          const addCueBtn = document.createElement("button");
          addCueBtn.className = "countdown-add-cue-btn";
          addCueBtn.textContent = "+ Add Cue";
          addCueBtn.onclick = () => {
            seq.cues = seq.cues || [];
            seq.cues.push({ name: "", seconds: 60, onComplete: null });
            saveCountdownSequences();
            renderSequencesList();
          };
          
          seqEl.appendChild(seqHeader);
          seqEl.appendChild(loopRow);
          seqEl.appendChild(cuesContainer);
          seqEl.appendChild(addCueBtn);
          
          list.appendChild(seqEl);
        });
      }
      
      function addNewSequence() {
        countdownSequences.push({
          name: "New Sequence",
          loop: 1,
          chain: null,
          cues: [{ name: "Section 1", seconds: 60, onComplete: null }]
        });
        saveCountdownSequences();
        broadcastSequencesUpdate();
        renderSequencesList();
      }
      
      // =====================================================
      // COUNTDOWN PLAYBACK - SEND COMMANDS TO SERVER
      // Server owns the timer, clients just display
      // =====================================================
      
      function startSequence(seqIdx) {
        // Send command to server - server will manage the countdown
        sendCountdownStartSequence(seqIdx);
      }
      
      function startSingleCountdown(cue) {
        // Send command to server
        sendCountdownStartCue(cue);
      }
      
      function stopCountdown() {
        sendCountdownStop();
        isCountdownMode = false;
        
        // Reset display
        const mainLabel = document.getElementById("fullscreen-main-label");
        if (mainLabel) {
          mainLabel.textContent = showingPerformanceTime ? "Performance" : "Timer";
        }
        
        updatePlayStopButton(false);
      }
      
      // =====================================================
      // DISCRETE COUNTDOWN CONTROLS (in fullscreen overlay)
      // =====================================================
      
      // State for countdown controls
      let currentSelectionType = localStorage.getItem('oscilla.countdownControls.type') || 'sequence';
      let currentSelectionIndex = parseInt(localStorage.getItem('oscilla.countdownControls.index')) || 0;
      let countdownIsRunning = false;
      let selectionIsCued = false;  // True when user selected something different from what's playing
      
      function saveControlsSelection() {
        localStorage.setItem('oscilla.countdownControls.type', currentSelectionType);
        localStorage.setItem('oscilla.countdownControls.index', currentSelectionIndex.toString());
      }
      
      function handlePlayStopClick() {
        const btn = document.getElementById('fullscreen-countdown-play-btn');
        const isShowingStop = btn && btn.innerHTML === '⏹';
        
        if (isShowingStop) {
          // Button shows stop - stop the countdown
          stopCountdown();
          selectionIsCued = false;
        } else {
          // Button shows play - start the current selection
          startCurrentSelection();
          selectionIsCued = false;  // Now playing what we selected
        }
      }
      
      function startCurrentSelection() {
        if (currentSelectionType === 'sequence') {
          if (countdownSequences[currentSelectionIndex]) {
            startSequence(currentSelectionIndex);
            console.log(`[CountdownControls] ▶ Starting sequence: ${countdownSequences[currentSelectionIndex].name}`);
          }
        } else {
          const allCues = getAllCuesFlat();
          const cue = allCues[currentSelectionIndex];
          if (cue) {
            startSingleCountdown(cue);
            console.log(`[CountdownControls] ▶ Starting cue: ${cue.name}`);
          }
        }
      }
      
      function getAllCuesFlat() {
        const cues = [];
        countdownSequences.forEach((seq, seqIdx) => {
          (seq.cues || []).forEach((cue, cueIdx) => {
            cues.push({
              ...cue,
              _seqIndex: seqIdx,
              _cueIndex: cueIdx,
              _seqName: seq.name
            });
          });
        });
        return cues;
      }
      
      function updatePlayStopButton(isPlaying) {
        countdownIsRunning = isPlaying;
        const btn = document.getElementById('fullscreen-countdown-play-btn');
        if (!btn) return;
        
        // If user has cued up a different selection, keep showing play button
        if (selectionIsCued) {
          btn.innerHTML = '▶';
          btn.title = 'Start';
          return;
        }
        
        btn.innerHTML = isPlaying ? '⏹' : '▶';
        btn.title = isPlaying ? 'Stop' : 'Start';
      }
      
      function toggleCountdownDropdown() {
        const menu = document.getElementById('fullscreen-countdown-dropdown-menu');
        if (!menu) return;
        
        if (menu.classList.contains('hidden')) {
          renderCountdownDropdown();
          menu.classList.remove('hidden');
        } else {
          menu.classList.add('hidden');
        }
      }
      
      function renderCountdownDropdown() {
        const menu = document.getElementById('fullscreen-countdown-dropdown-menu');
        if (!menu) return;
        
        menu.innerHTML = '';
        
        // Sequences section
        if (countdownSequences.length > 0) {
          const seqHeader = document.createElement('div');
          seqHeader.className = 'countdown-dropdown-header';
          seqHeader.textContent = 'Sequences';
          menu.appendChild(seqHeader);
          
          countdownSequences.forEach((seq, idx) => {
            const item = document.createElement('div');
            item.className = 'countdown-dropdown-item';
            if (currentSelectionType === 'sequence' && currentSelectionIndex === idx) {
              item.classList.add('selected');
            }
            
            const cueCount = seq.cues?.length || 0;
            const totalTime = (seq.cues || []).reduce((sum, c) => sum + (c.seconds || 0), 0);
            const timeStr = formatSecondsCompact(totalTime);
            
            item.innerHTML = `
              <span class="item-name">${seq.name || 'Unnamed'}</span>
              <span class="item-meta">${cueCount} cues · ${timeStr}</span>
            `;
            item.addEventListener('click', (e) => {
              e.stopPropagation();
              selectDropdownItem('sequence', idx);
            });
            menu.appendChild(item);
          });
        }
        
        // Individual cues section
        const allCues = getAllCuesFlat();
        if (allCues.length > 0) {
          const cueHeader = document.createElement('div');
          cueHeader.className = 'countdown-dropdown-header';
          cueHeader.textContent = 'Individual Cues';
          menu.appendChild(cueHeader);
          
          allCues.forEach((cue, idx) => {
            const item = document.createElement('div');
            item.className = 'countdown-dropdown-item';
            if (currentSelectionType === 'cue' && currentSelectionIndex === idx) {
              item.classList.add('selected');
            }
            
            item.innerHTML = `
              <span class="item-name">${cue.name || 'Unnamed'}</span>
              <span class="item-meta">${formatSecondsCompact(cue.seconds || 0)}</span>
            `;
            item.addEventListener('click', (e) => {
              e.stopPropagation();
              selectDropdownItem('cue', idx);
            });
            menu.appendChild(item);
          });
        }
        
        // Empty state
        if (countdownSequences.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'countdown-dropdown-empty';
          empty.textContent = 'No sequences. Click red ring to create.';
          menu.appendChild(empty);
        }
      }
      
      function selectDropdownItem(type, index) {
        currentSelectionType = type;
        currentSelectionIndex = index;
        saveControlsSelection();
        updateSelectionLabel();
        
        // User selected something - mark as cued (different from what may be playing)
        selectionIsCued = true;
        
        // Show play button (ready to start this selection)
        const btn = document.getElementById('fullscreen-countdown-play-btn');
        if (btn) {
          btn.innerHTML = '▶';
          btn.title = 'Start';
        }
        
        // Close dropdown
        const menu = document.getElementById('fullscreen-countdown-dropdown-menu');
        if (menu) menu.classList.add('hidden');
      }
      
      function updateSelectionLabel() {
        const label = document.getElementById('fullscreen-countdown-selection');
        if (!label) return;
        
        if (currentSelectionType === 'sequence') {
          const seq = countdownSequences[currentSelectionIndex];
          label.textContent = seq ? (seq.name || '—') : '—';
        } else {
          const allCues = getAllCuesFlat();
          const cue = allCues[currentSelectionIndex];
          label.textContent = cue ? (cue.name || '—') : '—';
        }
      }
      
      function formatSecondsCompact(totalSeconds) {
        const min = Math.floor(totalSeconds / 60);
        const sec = totalSeconds % 60;
        return `${min}:${sec.toString().padStart(2, '0')}`;
      }
      
      // Auto-advance when countdown completes
      function handleCountdownComplete() {
        // Clear cued flag - countdown stopped naturally
        selectionIsCued = false;
        
        const allCues = getAllCuesFlat();
        
        if (currentSelectionType === 'cue') {
          const nextIndex = currentSelectionIndex + 1;
          if (nextIndex < allCues.length) {
            currentSelectionIndex = nextIndex;
          } else {
            currentSelectionIndex = 0;
          }
        } else {
          const nextIndex = currentSelectionIndex + 1;
          if (nextIndex < countdownSequences.length) {
            currentSelectionIndex = nextIndex;
          } else {
            currentSelectionIndex = 0;
          }
        }
        
        saveControlsSelection();
        updateSelectionLabel();
        console.log(`[CountdownControls] 📋 Advanced to next item`);
      }
      
      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
        const controls = document.getElementById('fullscreen-countdown-controls');
        const menu = document.getElementById('fullscreen-countdown-dropdown-menu');
        if (controls && menu && !controls.contains(e.target)) {
          menu.classList.add('hidden');
        }
      });
      
      // Expose functions globally
      window._updateCountdownControlsPlayButton = updatePlayStopButton;
      window._handleCountdownComplete = handleCountdownComplete;
      window._refreshCountdownDropdown = () => {
        updateSelectionLabel();
        renderCountdownDropdown();
      };
      
      // Expose render function for external updates
      window._renderCountdownSequences = renderSequencesList;
      
      function cycleViewMode() {
        currentViewMode = (currentViewMode + 1) % viewModes.length;
        applyViewMode();
      }
      
      // Swap timers - swap which time shows in main vs mini
      function swapTimers() {
        showingPerformanceTime = !showingPerformanceTime;
        // Expose to global for updateCountdownDisplay to know which display is Timer
        window._showingPerformanceTime = showingPerformanceTime;
        updateLabels();
        updateTimes();
      }
      
      function applyViewMode() {
        const mode = viewModes[currentViewMode];
        const overlay = document.getElementById("stopwatch-fullscreen-overlay");
        const modeLabel = document.getElementById("fullscreen-mode-label");
        
        if (!overlay) return;
        
        // Remove all mode classes
        overlay.classList.remove("mode-solid", "mode-blur", "mode-transparent");
        overlay.classList.add(`mode-${mode}`);
        
        // Update label
        if (modeLabel) modeLabel.textContent = mode;
        
        // Handle score container blur - always remove unblur first
        mainContent.classList.remove("unblur-background");
        
        if (mode === 'blur') {
          mainContent.classList.add("blur-background-light");
          mainContent.classList.remove("blur-background");
        } else if (mode === 'solid') {
          mainContent.classList.add("blur-background");
          mainContent.classList.remove("blur-background-light");
        } else {
          // transparent - no blur
          mainContent.classList.remove("blur-background", "blur-background-light");
        }
        
        console.log(`[Stopwatch] View mode: ${mode}`);
      }
      
      function updateLabels() {
        const mainLabel = document.getElementById("fullscreen-main-label");
        const miniLabel = document.getElementById("fullscreen-mini-label");
        
        if (showingPerformanceTime) {
          if (mainLabel) mainLabel.textContent = "Performance";
          if (miniLabel) miniLabel.textContent = "Timer";
        } else {
          if (mainLabel) mainLabel.textContent = "Timer";
          if (miniLabel) miniLabel.textContent = "Performance";
        }
      }
      
      function updateTimes() {
        const mainTimeEl = document.getElementById("fullscreen-main-time");
        const miniTimeEl = document.getElementById("fullscreen-mini-time");
        const clockTimeEl = document.getElementById("fullscreen-clock-time");
        
        // Always update clock time
        if (clockTimeEl) {
          const now = new Date();
          const hours = now.getHours().toString().padStart(2, '0');
          const minutes = now.getMinutes().toString().padStart(2, '0');
          const seconds = now.getSeconds().toString().padStart(2, '0');
          clockTimeEl.textContent = `${hours}:${minutes}:${seconds}`;
        }
        
        const rehearsalTime = stopwatch.textContent || "00:00";
        const transportEl = document.getElementById("transport-time");
        const performanceTime = transportEl ? transportEl.textContent : "00:00";
        
        // Determine which element is Performance and which is Timer
        const perfTimeEl = showingPerformanceTime ? mainTimeEl : miniTimeEl;
        const timerTimeEl = showingPerformanceTime ? miniTimeEl : mainTimeEl;
        
        // Always update Performance time (it's playhead-linked)
        if (perfTimeEl) perfTimeEl.textContent = performanceTime;
        
        // Only update Timer if countdown is NOT active (countdown handles its own display)
        if (!isCountdownMode) {
          if (timerTimeEl) timerTimeEl.textContent = rehearsalTime;
        }
      }
      
      function enterFullscreen() {
        console.log("[DEBUG] Entering fullscreen stopwatch mode.");
        
        fullscreenOverlay = createFullscreenOverlay();
        document.body.appendChild(fullscreenOverlay);
        
        // Expose state for updateCountdownDisplay
        window._showingPerformanceTime = showingPerformanceTime;
        
        // Apply initial view mode
        applyViewMode();
        
        // Start updating times
        updateLabels();
        updateTimes();
        fullscreenUpdateInterval = setInterval(updateTimes, 200);
        
        // Initialize countdown controls
        updateSelectionLabel();
        updatePlayStopButton(countdownIsRunning);
        
        window.__stopwatchFullscreen = true;
        
        // Listen for Escape key
        document.addEventListener("keydown", escapeHandler);
      }
      
      function exitFullscreen() {
        console.log("[DEBUG] Exiting fullscreen stopwatch mode.");
        
        if (fullscreenOverlay && fullscreenOverlay.parentNode) {
          fullscreenOverlay.parentNode.removeChild(fullscreenOverlay);
          fullscreenOverlay = null;
        }
        
        if (fullscreenUpdateInterval) {
          clearInterval(fullscreenUpdateInterval);
          fullscreenUpdateInterval = null;
        }
        
        mainContent.classList.remove("blur-background", "blur-background-light");
        mainContent.classList.add("unblur-background");
        
        window.__stopwatchFullscreen = false;
        
        // Remove escape listener
        document.removeEventListener("keydown", escapeHandler);
      }
      
      function escapeHandler(e) {
        if (e.key === "Escape" && window.__stopwatchFullscreen) {
          exitFullscreen();
        }
      }
      
      // Click stopwatch to enter fullscreen
      stopwatch.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        
        if (!window.__stopwatchFullscreen) {
          enterFullscreen();
        }
      });
    });
  }

// ============================================================================
// TRANSPORT TIME (Performance Timer)
// ============================================================================
// This timer is tied to transport playback and represents total performance
// time from first play. It keeps running during musical pauses (pause cues)
// but pauses for non-musical stops (user pressing stop).
// ============================================================================

let transportTimeStarted = false;      // Has performance started?
let transportTimeStartMs = 0;          // When current run started (Date.now())
let transportTimeAccumulated = 0;      // Accumulated time from previous runs
let transportTimeRunning = false;      // Is the timer currently running?
let transportTimeIntervalId = null;    // Interval for updating display

/**
 * Format milliseconds as MM:SS or HH:MM:SS
 */
function formatTransportTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Update the transport time display
 */
function updateTransportTimeDisplay() {
  const el = document.getElementById("transport-time");
  if (!el) return;
  
  let elapsed;
  if (transportTimeRunning) {
    elapsed = transportTimeAccumulated + (Date.now() - transportTimeStartMs);
  } else {
    elapsed = transportTimeAccumulated;
  }
  
  el.textContent = formatTransportTime(elapsed);
}

/**
 * Start the transport time (called on transport play)
 * Keeps running during musical pauses (pause cues)
 */
export function startTransportTime() {
  const el = document.getElementById("transport-time");
  
  if (!transportTimeStarted) {
    // First time starting performance - reset everything
    transportTimeStarted = true;
    transportTimeAccumulated = 0;
    console.log("[TransportTime] Performance started");
  }
  
  if (!transportTimeRunning) {
    transportTimeStartMs = Date.now();
    transportTimeRunning = true;
    
    // Start update interval
    if (!transportTimeIntervalId) {
      transportTimeIntervalId = setInterval(updateTransportTimeDisplay, 200);
    }
    
    if (el) {
      el.classList.add("running");
      el.classList.remove("paused");
    }
    
    console.log("[TransportTime] Timer running");
  }
}

/**
 * Pause the transport time (for non-musical stops only)
 * Musical pauses (cue pauses) should NOT call this
 */
export function pauseTransportTime() {
  // Don't pause during musical pauses
  if (window.isMusicalPause) {
    console.log("[TransportTime] Musical pause - timer continues");
    return;
  }
  
  const el = document.getElementById("transport-time");
  
  if (transportTimeRunning) {
    transportTimeAccumulated += Date.now() - transportTimeStartMs;
    transportTimeRunning = false;
    
    if (el) {
      el.classList.remove("running");
      el.classList.add("paused");
    }
    
    console.log("[TransportTime] Timer paused at", formatTransportTime(transportTimeAccumulated));
  }
}

/**
 * Resume the transport time after a non-musical pause
 */
export function resumeTransportTime() {
  if (!transportTimeRunning && transportTimeStarted && !window.isMusicalPause) {
    transportTimeStartMs = Date.now();
    transportTimeRunning = true;
    
    const el = document.getElementById("transport-time");
    if (el) {
      el.classList.add("running");
      el.classList.remove("paused");
    }
    
    console.log("[TransportTime] Timer resumed");
  }
}

/**
 * Reset the transport time (for new performance)
 */
export function resetTransportTime() {
  const el = document.getElementById("transport-time");
  
  transportTimeStarted = false;
  transportTimeStartMs = 0;
  transportTimeAccumulated = 0;
  transportTimeRunning = false;
  
  if (transportTimeIntervalId) {
    clearInterval(transportTimeIntervalId);
    transportTimeIntervalId = null;
  }
  
  if (el) {
    el.textContent = "00:00";
    el.classList.remove("running", "paused");
  }
  
  console.log("[TransportTime] Timer reset");
}

/**
 * Get current transport time in milliseconds
 */
export function getTransportTimeMs() {
  if (transportTimeRunning) {
    return transportTimeAccumulated + (Date.now() - transportTimeStartMs);
  }
  return transportTimeAccumulated;
}

/**
 * Check if transport time has been started
 */
export function isTransportTimeStarted() {
  return transportTimeStarted;
}

// Expose on window for debugging and external access
window.transportTime = {
  start: startTransportTime,
  pause: pauseTransportTime,
  resume: resumeTransportTime,
  reset: resetTransportTime,
  getMs: getTransportTimeMs,
  isStarted: isTransportTimeStarted
};

// Initialize transport time display on load
if (typeof document !== 'undefined') {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateTransportTimeDisplay);
  } else {
    updateTransportTimeDisplay();
  }
}
  