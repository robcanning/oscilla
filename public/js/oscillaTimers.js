
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
        div.remove();
      }, 1000);
    }, hold * 1000);
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
 * Applies blur effect to the score container.
 */
/**
 * Sets up fullscreen toggle behavior for the stopwatch when clicked.
 * Applies blur effect to the score container.
 */
export function setupStopwatchFullscreenToggle() {
    window.addEventListener('DOMContentLoaded', () => {
      const stopwatch = document.getElementById("stopwatch");
      const mainContent = document.getElementById("scoreContainer");
  
      if (!stopwatch || !mainContent) {
        console.error("[ERROR] Stopwatch or scoreContainer not found.");
        return;
      }
  
      stopwatch.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
  
        if (stopwatch.classList.contains("fullscreen")) {
          console.log("[DEBUG] Exiting fullscreen mode for stopwatch.");
          stopwatch.classList.remove("fullscreen");
          mainContent.classList.remove("blur-background");
          mainContent.classList.add("unblur-background");
        } else {
          console.log("[DEBUG] Entering fullscreen mode for stopwatch.");
          stopwatch.classList.add("fullscreen");
          mainContent.classList.add("blur-background");
          mainContent.classList.remove("unblur-background");
        }
      });
    });
  }
  
  