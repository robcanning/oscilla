/**
 * TRANSPORT UI
 * ------------
 * Extracted from oscillaTransport.js
 *
 * Contains:
 *   - Controls auto-hide / show / pin toggles
 *   - Mode toggle (scroll <-> page)
 *   - returnToScrollingScore, pauseScrollScore, resumeScrollScore
 *   - Double-tap / double-click control reveal
 *   - Fullscreen / resize handlers
 *   - Dark mode toggle
 *   - Playhead / playzone visibility toggle
 */

import { scrollToPlayheadVisual } from "./oscillaTransport.js";
import { stopAllCueTexts } from "../cues/text.js";
import { destroyAllHitLabels } from "../control/o2pTouchOverlays.js";

// ---------------------------------------------------------
// UI interaction state (menus / hover)
// ---------------------------------------------------------
window.__oscillaMenuActive = false;

function shouldAutoHideControls() {
  if (window.controlsPinned) return false;
  if (window.__oscillaMenuActive) return false;
  return true;
}

function shouldAutoHideTopbar() {
  if (window.topbarPinned) return false;
  if (window.__oscillaMenuActive) return false;
  return true;
}


let controlsTimeout; // Timer to hide controls after inactivity

export const hideControls = () => {
  const controls = document.getElementById('controls');
  const topBar = document.getElementById('top-bar');

  // Hide controls if not pinned
  if (shouldAutoHideControls()) {
    controls?.classList.add('dismissed');
  }
  
  // Hide topbar if not pinned (independent of controls)
  if (shouldAutoHideTopbar()) {
    topBar?.classList.add('dismissed');
  }
};



export const showControls = () => {
  const controls = document.getElementById('controls');
  const topBar = document.getElementById('top-bar');

  if (controls) controls.classList.remove('dismissed');
  if (topBar) topBar.classList.remove('dismissed');
};


window.hideControls = hideControls;
window.showControls = showControls;

// -------------------------------------------------------------------
// Controls Pin Toggle
// -------------------------------------------------------------------
// Default to pinned, but can be overridden by preferences
window.controlsPinned = window.oscillaControlsPinned ?? true;
window.topbarPinned = window.oscillaTopbarPinned ?? true;

let _controlsPinInitialized = false;
let _topbarPinInitialized = false;

export function initializeControlsPin() {
  if (_controlsPinInitialized) {
    console.log("[UI] Controls pin already initialized, skipping.");
    return;
  }
  
  const pinButton = document.getElementById("pin-controls");
  if (!pinButton) return console.warn("[UI] No #pin-controls button found.");

  _controlsPinInitialized = true;
  
  // Set initial visual state
  pinButton.classList.toggle("active", window.controlsPinned);
  
  pinButton.addEventListener("click", () => {
    window.controlsPinned = !window.controlsPinned;
    pinButton.classList.toggle("active", window.controlsPinned);

    const controls = document.getElementById('controls');
    
    if (window.controlsPinned) {
      console.log("[UI] Controls pinned — will stay visible.");
      controls?.classList.remove('dismissed');
    } else {
      console.log("[UI] Controls unpinned — auto-hide re-enabled.");
      window.hideControlsLater();
    }
  });
  
  console.log("[UI] Controls pin initialized.");
}

export function initializeTopbarPin() {
  if (_topbarPinInitialized) {
    console.log("[UI] Topbar pin already initialized, skipping.");
    return;
  }
  
  const btn = document.getElementById("pin-topbar");
  if (!btn) return console.warn("[UI] No #pin-topbar button found.");

  _topbarPinInitialized = true;
  
  // Set initial visual state
  btn.classList.toggle("active", window.topbarPinned);
  
  btn.addEventListener("click", () => {
    window.topbarPinned = !window.topbarPinned;
    btn.classList.toggle("active", window.topbarPinned);

    const topBar = document.getElementById('top-bar');
    
    if (window.topbarPinned) {
      console.log("[UI] Top-bar pinned.");
      topBar?.classList.remove('dismissed');
    } else {
      console.log("[UI] Top-bar unpinned.");
      window.hideControlsLater();
    }
  });
  
  console.log("[UI] Topbar pin initialized.");
}

// ---------------------------------------------------------
// Unified Hide Controls Timer (respects pin state)
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


// ---------------------------------------------------------------------------
// Mode Toggle UI (Scroll <-> Node/Page)
// ---------------------------------------------------------------------------
// Displays a small toggle in the top UI that shows where clicking will go next.
//   - If currently in scrolling mode -> label shows "-> node"
//   - If currently in node/page mode -> label shows "-> scroll"
// Clicking switches between the two modes:
//   -> node : opens the first (or last-used) page view
//   -> scroll : returns to the continuous scrolling score
// The label always reflects the *destination*, not the current state.
// ---------------------------------------------------------------------------

function updateModeToggleUI() {
  const el = document.getElementById("mode-toggle");
  if (!el) return;

  const ps = window.pageState;
  if (!ps) return;

  // Display where clicking will go next
  if (ps.mode === "page") {
    el.textContent = "-> scroll";   // currently in page, link goes to scroll
  } else {
    el.textContent = "-> node";     // currently in scroll, link goes to page mode
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
    window.handleCueTrigger?.(`nav(home)`);
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

  destroyAllHitLabels();


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

    // Show transport controls when returning to scroll mode
    console.log("[cuePage] Showing transport for scroll mode.");
    showControls?.();

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
    console.log(" Staying paused after jump (scrollPaused mode).");

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

  console.log("Scroll resume complete.");
}


// ============================================================================
// FULLSCREEN / RESIZE HANDLERS
// ============================================================================

document.addEventListener('fullscreenchange', () => {

  if (document.fullscreenElement) {
    hideControls();
  } else {
    showControls();
    clearTimeout(controlsTimeout);
  }

  requestAnimationFrame(scrollToPlayheadVisual);
});

window.dispatchEvent(new Event("resize"));
window.addEventListener('resize', () => {
  const startTime = performance.now();
  const endTime = performance.now();
  console.log(`[DEBUG] extractScoreElements executed in ${(endTime - startTime).toFixed(2)}ms`);
  console.log("[DEBUG] Extracted Score Elements. Now Checking Sync...");
  console.log("[DEBUG] Resize detected, recalculating maxScrollDistance and aligning playhead...");
});


/* ---------------------------------------------------------------------------
*  DOUBLE-TAP / DOUBLE-CLICK CONTROL TOGGLE
*  ---------------------------------------------------------------------------
*  Purpose:
*    - Shows playback controls only after a confirmed double-tap (mobile)
*      or double-click (desktop).
*    - Ignores single taps and scroll gestures.
*    - Avoids browser [Intervention] warnings by not preventing native scroll.
* --------------------------------------------------------------------------- */

// Show controls immediately and restart hide timer
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
      console.log("[TAP] Hiding controls (timeout expired)");
    } else {
      console.log("[TAP] Pin active — skipping auto-hide");
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
  if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) return; // it's a scroll

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
    console.log("[CLICK] Double-click detected at", e.clientX, e.clientY);
    revealControlsTemporarily();
  });

  console.log("[UI] Verbose double-tap/double-click toggle initialized.");
})();


// ------------------------------------------------------------
// Dark Mode Utility
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
  console.log(`[DarkMode] ${on ? "Enabled" : "Disabled"}`);
}

// ------------------------------------------------------------
// Dark Mode Toggle Button
// ------------------------------------------------------------
export function initializeDarkModeToggle() {
  const invertBtn = document.getElementById("invert-button");
  if (!invertBtn) {
    console.warn("[DarkMode] No #invert-button found in DOM.");
    return;
  }

  invertBtn.addEventListener("click", () => {
    const active = document.documentElement.style.filter.includes("invert");
    applyDarkMode(!active);
  });

  console.log("[DarkMode] Toggle ready.");
}


// ============================================================================
// Playhead / Playzone Toggle Button Listener
// ============================================================================
// Cycles through 4 states:
//   1. "both"     -> playhead + playzone visible
//   2. "playhead" -> playhead only
//   3. "playzone" -> playzone only  
//   4. "none"     -> neither visible
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
 * Cycle through visibility states: both -> playhead -> playzone -> none -> both
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
  const playhead = document.getElementById("playhead") 
    || document.querySelector(".playhead")
    || document.querySelector("[data-playhead]");
    
  const playzone = document.getElementById("playzone")
    || document.querySelector(".playzone")
    || document.querySelector("[data-playzone]");

  const showPlayhead = (state === "both" || state === "playhead");
  const showPlayzone = (state === "both" || state === "playzone");

  if (playhead) {
    playhead.style.opacity = showPlayhead ? "" : "0";
    playhead.style.pointerEvents = showPlayhead ? "" : "none";
  }

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
// Auto-initialize playhead toggle if DOM is ready
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
