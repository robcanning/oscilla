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
  
  