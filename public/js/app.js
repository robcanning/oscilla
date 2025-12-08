/*!
 * oscillaScore — Real-time SVG Score Performance Environment
 * © 2025 Rob Canning
 *
 * Licensed under the GNU General Public License v3.0
 * https://www.gnu.org/licenses/gpl-3.0.html
 *
 * This file initializes the core cue handling, playback state, logging system,
 * and environment detection for the OscillaScore client.
 */

import { enableLiveInspector } from "./oscillaLive.js";

import { initializeDarkModeToggle, scrollToPlayheadVisual } from "./transport.js";
import { loadProject } from './projectLoader.js';
import { setupScore, extractScoreElements, autoInjectGroupsInScroll } from './scoreSetup.js';

import { propagate } from "./oscillaPropagate.js";

import { registerAnimation, animationAssign } from "./oscillaAnimation.js";
import { initializeObserver } from "./oscillaObserver.js";
import { buildCueButtonsIn, hideAllButtonPlaceholders } from "./oscillaButton.js";


import {
  registerReuseBlocks,
  autoInjectUseBlocks,
  preloadReuseBlocksFromPages
} from "./reuse.js";

import {
  forward, rewind, rewindToStart,
  initializeSpeedControls, adjustSpeed, setSpeed, updateSpeedDisplay,
  sendSpeedUpdateToServer, togglePlay, togglePlayButton, startPlayback,
  pausePlayback, resumePlayback, jumpToCueId, hideControls, showControls
} from './transport.js';

window.startPlayback = startPlayback;
window.pausePlayback = pausePlayback;
window.resumePlayback = resumePlayback;

import {
  startStopwatch,
  stopStopwatch,
  resetStopwatch,
  resumeStopwatch,
  setupStopwatchFullscreenToggle
} from './oscillaTimers.js';




// ===========================
// 📦 Import Cue Handlers
// ===========================

import {
  handleCueTrigger,
  checkCueTriggers,
  parseCueParams,
  resetTriggeredCues,
  handleStopCue,
  handleOscCue,
  parseTraverseCueId,
  startTraverseAnimation,
  handleTraverseCue,
  handleCueChoice,
  dismissCueChoice,
  parseCueChoiceVariants,
  handleRepeatCue,
  parseRepeatCueId,
  executeRepeatJump,
  repeatStateMap,
  handleRestoredRepeatState,
  assignCues
} from './oscillaCueDispatcher.js';

import { handleAudioCue, handleAudioStopCue, stopAllAudio, activeAudioCues } from "./oscillaAudio.js";
import { dismissPauseCountdown, pauseDismissClickHandler,  handlePauseCue } from "./oscillaPause.js";
 



// app.js
// import { ensureRotationCSSGuard } from './anim.js';

export const initializeSVG = async (svgElement) => {
  console.group("[initializeSVG]");
  console.log("→ Incoming SVG:", svgElement?.id || "(no id)");

  if (!svgElement) {
    console.warn("[initializeSVG] ❌ No SVG element provided");
    console.groupEnd();
    return;
  }



  /////////////////////////////////////////////////////////////////////////////
  // 0. Expand propagate(...) sequences before anything else
  /////////////////////////////////////////////////////////////////////////////
  await settleDomForPropagate();
  console.log("[initializeSVG] 🔧 propagate() after FULL DOM settle");
  propagate(svgElement);

  /////////////////////////////////////////////////////////////////////////////
  // 1. PAGE OVERLAY LIGHT INITIALISATION
  /////////////////////////////////////////////////////////////////////////////
  const isPageOverlay =
    svgElement.id === "pageSVG" ||
    svgElement.classList.contains("oscilla-page");

  window.isPageOverlay = isPageOverlay;

  if (isPageOverlay) {
    console.log("[initializeSVG] 🟦 Page overlay detected → light init");

    // Ensure registry exists for menus & reuse-blocks
    if (!window.pageRegistry || Object.keys(window.pageRegistry).length === 0) {
      console.log("[initializeSVG][page] 🔧 Building page registry for overlays");
      buildPageRegistryFromDirIndex();
    }



    console.log("[initializeSVG][page] 🔧 registerReuseBlocks()");
    registerReuseBlocks(svgElement);


    // Inject all use(name) placeholders NOW
    autoInjectUseBlocks(svgElement);

    hideAllButtonPlaceholders(svgElement);

    console.log("[initializeSVG][page] injecting reuse() blocks");
    console.log("[initializeSVG][page] reuse injection complete");




    console.log("[initializeSVG][page] 🔧 storePathVariants()");
    window.storePathVariants(svgElement);

    console.log("[initializeSVG][page] 🔧 animationAssign()");
    animationAssign(svgElement);

    // // ⭐ Correct final fix: rebuild *all* cueButtons after all transforms
    console.log("[initializeSVG][page] 🔧 Rebuilding cueButtons for final geometry");
    // window._activePageButtons?.forEach(btn => btn.remove?.());
    
    buildCueButtonsIn(svgElement, svgElement);  // or page content container

    // console.log("[initializeSVG][page] 🔧 initializeObserver()");
    initializeObserver();


    if (!window.cues) window.cues = [];
    console.log("[initializeSVG][page] 🔧 assignCues()");
    assignCues(svgElement, window.cues);


    console.log("[initializeSVG][page] 🔧 setupScore()");
    window.setupScore?.(svgElement);


    console.log("[initializeSVG][page] autostart stopwatch timers metronomes etc");
    window.autostartStopwatchCues();
    window.autostartMetronomes();



    console.log("[initializeSVG][page] ✅ Page overlay initialisation complete.");
    console.groupEnd();
    return;
  }

  /////////////////////////////////////////////////////////////////////////////
  // 2. SCROLL-MODE INITIALISATION
  /////////////////////////////////////////////////////////////////////////////
  console.log("[initializeSVG] 🟩 Scroll-mode initialisation");

  // Ensure registry exists BEFORE reuse.js tries to use it
  console.log("[initializeSVG] 🔧 buildPageRegistryFromDirIndex() (pre-RAF)");
  buildPageRegistryFromDirIndex();

  console.log("[initializeSVG] 🔧 refreshAllPagesMenu() (pre-RAF)");
  refreshAllPagesMenu();

  console.log("[initializeSVG] 🔧 registerReuseBlocks()");
  registerReuseBlocks(svgElement);

  console.log("[initializeSVG] 🔧 storePathVariants()");
  window.storePathVariants(svgElement);

  if (window.playheadX === undefined) {
    window.playheadX = 0;
    console.log("[initializeSVG] playheadX defaulted to 0");
  }

  /////////////////////////////////////////////////////////////////////////////
  // 2A. FIRST RAF — run animationAssign + observer
  /////////////////////////////////////////////////////////////////////////////
  requestAnimationFrame(() => {
    console.log("[initializeSVG]  animationAssign()");
    animationAssign(svgElement);

    // console.log("[initializeSVG]  initializeObserver()");
    initializeObserver();

    ///////////////////////////////////////////////////////////////////////////
    // 2B. SECOND + THIRD RAF — final paint → assign cues + setupScore
    ///////////////////////////////////////////////////////////////////////////
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const svgReady = svgElement || document.querySelector("#scoreContainer svg");
        if (!svgReady) {
          console.warn("[initializeSVG] ⚠️ setupScore(): SVG still not ready after paint");
          return;
        }

        console.group("[initializeSVG] Final SVG paint phase");
        console.time("[initializeSVG] cue+setup total");

        if (!window.cues) window.cues = [];

        console.log("[initializeSVG] 🔧 assignCues()");
        assignCues(svgReady, window.cues);

        if (typeof window.setupScore === "function") {
          console.log("[initializeSVG] 🔧 setupScore()");
          window.setupScore(svgReady);
        } else {
          console.warn("[initializeSVG] ⚠️ setupScore() missing");
        }

        console.timeEnd("[initializeSVG] cue+setup total");
        console.groupEnd();
      });
    });

    ///////////////////////////////////////////////////////////////////////////
    // 2C. Wide-scroll layout correction
    ///////////////////////////////////////////////////////////////////////////
    const applyWideScrollLayout = () => {
      const cont = document.getElementById("scoreContainer");
      const svg = svgElement;

      if (!svg || !cont) {
        console.warn("[initializeSVG] ⚠️ Wide-scroll layout skipped — missing container or SVG");
        return;
      }

      Object.assign(cont.style, {
        width: "100vw",
        height: "100vh",
        overflowX: "auto",
        overflowY: "hidden",
        whiteSpace: "nowrap",
        display: "block",
        position: "relative",
      });

      svg.removeAttribute("width");
      svg.removeAttribute("height");

      Object.assign(svg.style, {
        display: "inline-block",
        height: "100vh",
        width: "auto",
        maxWidth: "none",
        maxHeight: "100%",
        verticalAlign: "top",
      });

      svg.getBoundingClientRect();
      console.log("[initializeSVG] 🟩 Wide-scroll layout applied");
    };

    window.applyWideScrollLayout = applyWideScrollLayout;

    requestAnimationFrame(() => {
      requestAnimationFrame(applyWideScrollLayout);
    });

    ///////////////////////////////////////////////////////////////////////////
    // 2D. Disable native scrolling + measure world width + score_meta
    ///////////////////////////////////////////////////////////////////////////
    const container = window.scoreContainer;
    const svg = svgElement;

    if (!container || !svg) {
      console.warn("[initializeSVG] ⚠️ Missing container/SVG for scroll-mode setup");
      return;
    }

    container.style.overflow = "hidden";

    const stopScroll = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    ["wheel", "touchmove", "gesturestart", "gesturechange", "gestureend"].forEach((ev) =>
      container.addEventListener(ev, stopScroll, { passive: false })
    );

    container.addEventListener(
      "scroll",
      () => {
        if (container.scrollLeft !== 0 || container.scrollTop !== 0) {
          container.scrollLeft = 0;
          container.scrollTop = 0;
        }
      },
      { passive: true }
    );

    // Determine score width
    let width = null;
    const attrWidth = svg.getAttribute("width");

    if (attrWidth && !attrWidth.includes("%")) width = parseFloat(attrWidth);
    if (!width && svg.viewBox?.baseVal) width = svg.viewBox.baseVal.width;
    if (!width && svg.getBBox) width = svg.getBBox().width;

    window.scoreWidth = width || 40960;
    console.log(`[initializeSVG] 🧭 scoreWidth = ${window.scoreWidth}`);

    // Sync with server
    if (window.socket && window.scoreWidth) {
      const renderedWidth = svg.getBoundingClientRect().width;

      console.log("[initializeSVG] 🔧 Sending score_meta to server");
      window.socket.send(
        JSON.stringify({
          type: "score_meta",
          project: window.currentProject,
          scoreWidth: window.scoreWidth,
          renderedWidth: renderedWidth,
          duration: window.duration,
        })
      );
    }

    console.log("[initializeSVG] 🟩 Scroll-mode initialisation complete");
  });

  console.groupEnd();
};

// Helper: keep your existing “FULL DOM settle” dance
async function settleDomForPropagate() {
  // Allow DOM to stabilise before propagate begins
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  // Now safely expand propagate(...) groups
  // FULL DOM settle
  await Promise.resolve(); // flush microtasks
  await new Promise((r) => requestAnimationFrame(r)); // 1st frame
  await new Promise((r) => requestAnimationFrame(r)); // 2nd frame (children attached)
  await new Promise((r) => setTimeout(r, 0)); // defs/use resolution
}




window.addEventListener("DOMContentLoaded", () => {

});







// ===========================
//  DOM Ready Initializers
// ===========================

window.addEventListener("DOMContentLoaded", () => {
  initializeSpeedControls();
  pauseDismissClickHandler(); // Enables click/spacebar dismiss for pause UI

  // initializeControlsPin();

});

// ===========================
//  Global Window Bindings
// ===========================

window.handleCueTrigger = handleCueTrigger;
window.checkCueTriggers = checkCueTriggers;
window.parseCueParams = parseCueParams;
window.resetTriggeredCues = resetTriggeredCues;

window.triggeredCues = new Set();

let lastJumpTime = 0;

window.playheadX = 0;

window.getPlayheadX = function () {
  const playhead = document.getElementById("playhead");
  const scoreContainer = window.scoreContainer;
  if (!playhead || !scoreContainer) return null;

  const containerRect = scoreContainer.getBoundingClientRect();
  const playheadRect = playhead.getBoundingClientRect();
  return playheadRect.left - containerRect.left;
};


window.estimatedPlayheadX = 0;
window.speedMultiplier = 1;
window.scoreContainer = document.getElementById('scoreContainer');


document.addEventListener("DOMContentLoaded", () => {
  populateProjectMenu();
});



// ===========================
// 📱 Mobile Stylesheet Loader
// ===========================

const isMobile = /iPad|iPhone|Android|Mobile|Tablet/i.test(navigator.userAgent);
if (isMobile) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/tablet.css';
  document.head.appendChild(link);
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("download-template-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      const link = document.createElement("a");
      link.href = "svg/template.svg";
      link.download = "template.svg";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  let pendingRepeatStateMap = null; // stores repeat state from server before cues[] are ready
  console.log('Interactive Scrolling Score Initialized.');
  const splash = document.getElementById('splash');
  const controls = document.getElementById('controls');
  const playhead = document.getElementById('playhead');
  window.recentlyRecalculatedPlayhead = false;
  const score = document.getElementById('score');

  // ------------------------------------------------------------
  // Global playback metrics
  // ------------------------------------------------------------

  window.duration = window.duration || 600; // ensure duration exists
  window.remoteScoreWidth = null; // will be filled from server if available
  window.pixelsPerSecond = window.scoreWidth / window.duration;

  window.seekBar = document.getElementById('seek-bar');
  const toggleButton = document.getElementById('toggle-button');
  const rewindButton = document.getElementById('rewind-button');
  const forwardButton = document.getElementById('forward-button');
  const rewindToZeroButton = document.getElementById('rewind-to-zero-button');
  const speedUpButton = document.getElementById('speed-up-button');
  const slowDownButton = document.getElementById('slow-down-button');
  const invertButton = document.getElementById('invert-button');
  const wsToggleButton = document.getElementById('ws-toggle-button');
  const helpButton = document.getElementById('help-button');
  const progammeNoteButton = document.getElementById('programme--button');
  let animationLoop = null; // Declare animation loop variable
  let animationFrameId = null; // Ensure global tracking of requestAnimationFrame
  let incomingServerUpdate = false;
  let ignorePauseAfterResume = false;
  window.ignoreNextSync = false;
  let pauseCooldownActive = false;
  const stopwatch = document.getElementById('stopwatch');
  const rehearsalMarksButton = document.getElementById('rehearsal-marks-button');
  const fullscreenButton = document.getElementById('fullscreen-button');
  const svgFileInput = document.getElementById('svg-file');
  let svgElement = null; // Declare globally
  window.scoreSVG = null; //  Store global reference to SVG
  const keybindingsPopup = document.getElementById('keybindings-popup');
  const closeKeybindingsButton = document.getElementById('close-keybindings');
  const closeScoreOptionsButton = document.getElementById('close-score-options');
  const SEEK_INCREMENT = 0.001; // Represents 1% of the total duration
  let animationPaused = false; // Global lock for animation state
  let maxScrollDistance = 40000; // todo GET THE VALUE FROM WIDTH
  let playbackSpeed = 1.0;
  window.lastAnimationFrameTime = null;
  window.wsEnabled = true;
  // letwindow.socket= null; // Define globally so all functions can access it
  let resumeReceived = false; //  Prevents infinite broadcast loops
  let totalPauseDuration = 0; // Tracks cumulative pause time for musical pauses
  let pauseStartTime = null; // Start time of the current musical pause
  let isManualPause = false; // Flag to differentiate manual vs. musical pause
  let resumeTimeOffset = null; // Tracks the time offset when resuming playback
  let pauseOffset = 0; // Tracks elapsed pause duration

  ///////////////////////////////////////////////////////////////

  const adjustscoreContainerHeight = () => {
    const controls = document.getElementById('controls');
    const controlsHeight = 5;
    console.log(`scoreContainer height adjusted to: ${window.scoreContainer.style.height}`);
  };



  ///////////////////////////////////////////////////////////////
  const { SVGPathData } = SVGPathCommander;



  /** ///////////////////////////////////////////////////////////////
  * Toggles the visibility of all score annotations using the "note-" namespace.
  * Queries only the SVG elements and switches between "block" and "none" display states.
  * Controlled via the  button in the GUI.
  */

  const toggleScoreNotes = () => {
    console.log("[DEBUG] Toggling visibility of score notes.");

    const svg = document.querySelector("svg");
    if (!svg) return console.error("[ERROR] SVG not found.");

    const notes = svg.querySelectorAll('[id^="note-"]');
    if (!notes.length) return console.warn("[WARNING] No note-* elements found.");

    // Check current state from the **first** note
    const currentlyVisible = notes[0].style.display !== "none";

    // Toggle display for all notes
    notes.forEach(note => {
      note.style.display = currentlyVisible ? "none" : "block";
    });

    // ✅ Button UI: green when notes are visible
    const btn = document.getElementById("toggle-notes-button");
    btn.classList.toggle("active", !currentlyVisible);

    console.log(`[DEBUG] Notes are now ${!currentlyVisible ? "visible" : "hidden"}.`);
  };

  document.getElementById("toggle-notes-button")
    .addEventListener("click", toggleScoreNotes);

  window.toggleScoreNotes = toggleScoreNotes;



  ///////////////////////////////////////////////////////////////
  // Handle Rehearsal Marks Navigation Popup

  /**
  * Opens the rehearsal mark popup.
  */
  const openRehearsalPopup = () => {
    console.log("[DEBUG] Opening rehearsal mark popup...");

    const popup = document.getElementById("rehearsal-popup");

    if (!popup) {
      console.error("[ERROR] Rehearsal popup not found.");
      return;
    }

    if (sortedMarks.length === 0) {
      console.warn("[DEBUG] No rehearsal marks found. Popup will not be shown.");
      return;
    }

    popup.classList.remove("hidden");
    popup.style.display = "flex";

    console.log("[DEBUG]  Rehearsal mark popup opened.");
  };

  /**
  *  Close popup function.
  */
  const closeRehearsalPopup = () => {
    document.getElementById("rehearsal-popup").classList.add("hidden");
  };

  //  Make it globally accessible
  window.closeRehearsalPopup = closeRehearsalPopup;

  //  Allow opening with "R" key
  document.addEventListener("keydown", (event) => {
    if (event.key.toUpperCase() === "R") {
      openRehearsalPopup();
    }
  });


  rehearsalMarksButton.addEventListener('click', () => {
    console.log("[DEBUG] Rehearsal Marks button clicked.");
    const popup = document.getElementById("rehearsal-popup");
    if (!popup) {
      console.error("[ERROR] Rehearsal popup not found.");
      return;
    }
    if (popup.classList.contains("hidden")) {
      openRehearsalPopup();
    } else {
      closeRehearsalPopup();
    }
  });

  ///////////////////////////////////////////////////////////////

  setupStopwatchFullscreenToggle();


  const clearPopupsOnInteraction = (event) => {
    // Ensure the event and event.target are valid
    if (!event || !event.target || event.target.closest("#stopwatch")) {
      console.log("[DEBUG] Ignoring stopwatch click for popup dismissal.");
      return;
    }
    const animationPopup = document.getElementById('animation-popup');
    const videoPopup = document.getElementById('video-popup');
    const audioPopup = document.getElementById('audio-popup');
    const cueChoiceContainer = document.getElementById('cue-choice-container');
    const playhead = document.getElementById('playhead');
    const playzone = document.getElementById('playzone');
    const animeJsContainer = document.getElementById('singlePage-container');
    const animeJsContent = document.getElementById('singlePage-content'); // Get the SVG container
    const popupsToClear = [animationPopup, videoPopup, audioPopup, animeJsContainer];
    let popupCleared = false;
    // Ignore clicks inside cue-choice-container or score-options-popup
    // if ((cueChoiceContainer && cueChoiceContainer.contains(event.target)) ||
    //   (scoreOptionsPopup && scoreOptionsPopup.contains(event.target))) {
    //   console.log('[DEBUG] Click inside a protected container (cue-choice-container or score-options-popup), not clearing.');
    //   return;
    // }

    // Close popups if they are active
    popupsToClear.forEach((popup) => {
      if (popup && (popup.classList.contains('active') || !popup.classList.contains('hidden'))) {
        console.log(`[DEBUG] Clearing popup: ${popup.id}`);
        popup.classList.add('hidden'); // Hide the popup
        popupCleared = true;

        //  Special handling for Anime.js popup
        if (popup.id === "singlePage-container") {
          console.log("[DEBUG] Closing Anime.js popup...");
          popup.classList.remove("active"); // Ensure it is fully hidden
          popup.style.display = "none";
          if (animeJsContent) animeJsContent.innerHTML = ""; //  Remove the loaded SVG
          console.log("[DEBUG] Anime.js popup cleared and SVG removed.");

          // Stop any active cuePage playlist timers
          if (window.isCuePagePlaylistActive) {
            console.log("[cuePage] Playlist aborted due to popup clear.");
            window.isCuePagePlaylistActive = false;
          }
          if (window.cuePagePlaylistTimer) {
            clearTimeout(window.cuePagePlaylistTimer);
            window.cuePagePlaylistTimer = null;
          }
        }
      }
    });

    if (popupCleared) {
      console.log('[CLIENT] Popups cleared on user interaction.');
      // Remove blur effect from all elements except controls
      document.body.querySelectorAll('.blur-background').forEach((element) => {
        if (!element.classList.contains('controls-container')) {
          element.classList.remove('blur-background');
        }
      });

      // Fade the score back in
      if (window.scoreContainer) window.scoreContainer.classList.remove('fade-out');
      if (window.scoreContainer) window.scoreContainer.classList.add('fade-in');
      if (playhead) playhead.classList.remove('fade-out');
      if (playhead) playhead.classList.add('fade-in');
      if (playzone) playzone.classList.remove('fade-out');
      if (playzone) playzone.classList.add('fade-in');

      // Ensure the fade-in classes are removed after the transition completes
      setTimeout(() => {
        if (window.scoreContainer) window.scoreContainer.classList.remove('fade-in');
        if (playhead) playhead.classList.remove('fade-in');
        if (playzone) playzone.classList.remove('fade-in');
      }, 1000); // Match the CSS transition duration

      // Resume playback only if the score was playing before the popup appeared
      if (!window.isPlaying) {
        window.isPlaying = true;
        window.isMusicalPause = false;
        startStopwatch();
        animationPaused = false; // Ensure animations are not paused
        startAnimation(); // Resume the animation loop
        console.log('[CLIENT] Resuming playback after popup dismissal.');
      }
    }
  };

  // document.addEventListener('mousemove', clearPopupsOnInteraction);
  // document.addEventListener('keydown', clearPopupsOnInteraction);
  // document.addEventListener('touchstart', clearPopupsOnInteraction);



  ///////START OF WEBSOCKET SETUP LOGIC ///////////////////////////////////////////

  const getWebSocketURL = async () => {
    try {
      const response = await fetch('/config'); // Fetch configuration from the server
      const config = await response.json();

      const hostname = window.location.hostname;
      const port = config.websocketPort; // Get the WebSocket port from the server config
      const fallbackIP = '167.172.165.26'; // Replace with your server IP if needed

      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        // Use localhost for development
        return `ws://localhost:${port}`;
      } else {
        // Use current hostname or fallback IP for production
        return `ws://${hostname || fallbackIP}:${port}`;
      }
    } catch (error) {
      console.error('Error fetching WebSocket config:', error);

      // Fallback to hardcoded defaults if fetching config fails
      return `ws://localhost:8001`; // Adjust fallback URL as needed
    }
  };


  /**
  * ✅ Establishes a WebSocket connection to sync state between clients.
  * Handles incoming messages for synchronization, client management, and playback control.
  * Supports automatic reconnection in case of unexpected disconnections.
  */

  let reconnectAttempts = 0;
  const MAX_RETRIES = 5;

  const connectWebSocket = async () => {
    if (!window.wsEnabled) {
      console.warn('[CLIENT] WebSocket is disabled.');
      return;
    }

    if (window.socket && window.socket.readyState === WebSocket.OPEN) {
      console.warn('[CLIENT] WebSocket is already connected.');
      return; // ✅ Prevent duplicate connections
    }

    try {
      const WS_URL = await getWebSocketURL(); // Get WebSocket URL dynamically
      console.log(`[CLIENT] Connecting to WebSocket at: ${WS_URL}`);

      const socket = new WebSocket(WS_URL);
      window.socket = socket; //  This makes it globally available
      /**
      * Event: Successfully Connected
      * Resets the reconnect counter when a connection is established.
      */
      window.socket.addEventListener('open', () => {
        console.log(`[CLIENT] WebSocket connected successfully to: ${WS_URL}`);
        reconnectAttempts = 0; //  Reset retry counter
      });

      window.socket.addEventListener("open", () => {
        console.log("[CLIENT]  WebSocket connected — requesting repeat state...");
        window.wsEnabled = true;

        window.socket.send(JSON.stringify({ type: "get_repeat_state" }));
      });

      /**
      * Event: Message Received from Server
      * Processes incoming WebSocket messages and syncs state across clients.
      */

      let recentlyJumped = false; //  New flag to prevent double jumps

      window.socket.addEventListener("message", (event) => {
        // console.log(`[DEBUG]  WebSocket Message Received: ${event.data}`);

        try {
          const data = JSON.parse(event.data);

          if (!data || typeof data !== "object") {
            console.warn("[CLIENT] Invalid WebSocket message format:", data);
            return;
          }

          // console.log(`[DEBUG] WebSocket message received:`, data);

          switch (data.type) {
            /**  Welcome Message - Assigns client name */
            case "welcome":
              console.log(`[CLIENT] Connected as: ${data.name}`);
              window.localClientName = data.name;
              console.log("[CLIENT] Assigned local client name:", data.name);
              break;

            //  Handle receiving the updated client list from the server
            case "client_list":
              updateClientList(data.clients);
              break;

            case "set_speed_multiplier":
              if (!isNaN(data.multiplier) && data.multiplier > 0) {
                const roundedMultiplier = parseFloat(data.multiplier.toFixed(1));

                console.log(`[CLIENT]  Server Speed Update Received: ${data.multiplier} (Rounded: ${roundedMultiplier})`);
                console.log(`[CLIENT]  Currentwindow.playheadX: ${window.playheadX}, Adjustedwindow.playheadX: ${window.playheadX + (window.innerWidth * 0.5)}`);

                if (speedMultiplier !== roundedMultiplier) {
                  incomingServerUpdate = true;  //  Prevent redundant updates
                  window.speedMultiplier = roundedMultiplier;
                  console.log(`[CLIENT] Speed multiplier updated from server: ${speedMultiplier}`);
                  window.updateSpeedDisplay();
                  setTimeout(() => { incomingServerUpdate = false; }, 100);  // Short delay to reset flag
                } else {
                  console.log(`[CLIENT]  Speed multiplier already set to ${speedMultiplier}. No update needed.`);
                }
              } else {
                console.warn(`[CLIENT]  Invalid speed multiplier received: ${data.multiplier}`);
              }
              break;


            /**  Pause Playback */
            case "pause":
              console.log(`[DEBUG] Processing pause request.window.playheadX=${data.playheadX}, elapsedTime=${data.elapsedTime}`);

              if (!isNaN(data.playheadX) && data.playheadX >= 0) {
                window.playheadX = data.playheadX;
                console.log(`[DEBUG] Applied server-providedwindow.playheadX: ${window.playheadX}`);
              } else {
                console.error(`[ERROR] Invalidwindow.playheadX received. Keeping last known value.`);
              }

              if (!isNaN(data.elapsedTime) && data.elapsedTime >= 0) {
                window.elapsedTime = data.elapsedTime;
              } else {
                console.error(`[ERROR] Invalid elapsedTime received: ${data.elapsedTime}`);
                return;
              }

              window.isPlaying = false;
              window.isMusicalPause = false;
              // stopStopwatch();
              stopAnimation(); //  Stop playhead movement
              togglePlayButton(); // Update UI play button
              console.log("[DEBUG] Playback paused successfully.");
              break;

            /**  Resume Playback After Pause */
            case "resume_after_pause":
              console.log(`[DEBUG] Processing resume_after_pause. window.playheadX=${data.playheadX}, elapsedTime=${data.elapsedTime}`);

              if (!isNaN(data.playheadX) && data.playheadX >= 0) {
                window.playheadX = data.playheadX;
                console.log(`[DEBUG] Applied server-provided playheadX: ${window.playheadX}`);
              } else {
                console.error(`[ERROR] Invalid playheadX received. Keeping last known value.`);
              }

              if (!isNaN(data.elapsedTime) && data.elapsedTime >= 0) {
                window.elapsedTime = data.elapsedTime;
              } else {
                console.error(`[ERROR] Invalid elapsedTime received: ${data.elapsedTime}`);
                return;
              }

              //  Prevent unwanted resume if pause logic is still active
              if (window.isMusicalPause) {
                console.warn("[DEBUG] Ignoring resume_after_pause because isMusicalPause is still true.");
                return;
              }

              window.isPlaying = true;
              startStopwatch();
              togglePlayButton();
              startAnimation();
              console.log("[DEBUG] Playback resumed successfully.");
              break;


            /**  Dismiss Pause Countdown */
            case "dismiss_pause_countdown":
              console.log("[DEBUG] Received dismiss_pause_countdown event. Hiding countdown popup.");
              dismissPauseCountdown(true, true);
              break;

            /** Update Connected Clients List */
            case "client_list":
              console.log(`[CLIENT] Connected clients: ${JSON.stringify(data.clients)}`);
              updateClientList(data.clients);
              break;

            /**  Handle Cue Pause */
            case "cuePause":
              console.log(`[CLIENT] Received cuePause. Duration: ${data.duration}ms`);

              //  Apply server-provided values BEFORE sending ack or triggering pause
              if (!isNaN(data.playheadX)) {
                window.playheadX = data.playheadX;
                // console.log(`[CLIENT] Syncedwindow.playheadX from cuePause: ${window.playheadX}`);
              }

              if (!isNaN(data.elapsedTime)) {
                window.elapsedTime = data.elapsedTime;
                // console.log(`[CLIENT] Synced window.elapsedTime from cuePause: ${elapsedTime}`);
              }

              stopAnimation();
              window.isPlaying = false;
              window.isMusicalPause = false;
              // stopStopwatch();

              animationPaused = true;
              togglePlayButton();

              if (window.wsEnabled && window.socket) {
                window.socket.send(JSON.stringify({
                  type: "cuePause_ack",
                  playheadX: window.playheadX ?? -1,
                  elapsedTime: window.elapsedTime ?? -1
                }));
                console.log(`[CLIENT] Sent cuePause_ack to server.window.playheadX=${window.playheadX}, window.elapsedTime=${elapsedTime}`);
              }

              handlePauseCue(data.id, data.duration);
              break;



            /** Handle Cue Stop */
            case "cueStop":
              console.log(`[CLIENT] Received cueStop. Elapsed Time: ${data.elapsedTime}`);
              handleStopCue(data.id || "cueStop");
              break;


            /** Handle Traverse Cue */
            case "cueTraverse":
              console.log(`[CLIENT] Received cueTraverse: ${data}`);
              handleTraverseCue(data.id || "cueTraverse");
              break;

            /**
             *  General Cue Trigger Handler
             *
             * This is called when the server broadcasts a cue that was triggered
             * (e.g., pause, audio, repeat, etc.). It ensures all clients react
             * as if they had locally intersected the cue themselves.
             */

            case "cueTriggered":
              console.log(`[CLIENT] Cue was triggered: ${data.cueId}`);
              handleCueTrigger(data.cueId, true); // mark as remote trigger
              break;

            /** Acknowledge Cue Pause */
            case "cuePause_ack":
              console.log("[CLIENT] Received cuePause_ack from another client.");
              break;

            /** Audio Cue Received */
            case "audio_cue":
              console.log(`[CLIENT] Received audio cue event: ${data.filename} at volume ${data.volume}`);
              handleAudioCue(data.cueId);
              break;




            /** Synchronize Playback State */
            case "sync": {
              const state = data.state;
              if (!state) break;

              const wasPlaying = window.isPlaying;

              // --- Shared world width
              window.scoreWidth = state.scoreWidth;

              // --- Canonical visual scale (unchanged)
              if (state.canonicalRenderedWidth) {
                window.canonicalRenderedWidth = state.canonicalRenderedWidth;
                window.canonicalScale = state.canonicalRenderedWidth / window.scoreWidth;

                const canonicalWidthPx = state.canonicalRenderedWidth;
                const inner = document.getElementById("scoreInner");
                const stage = document.getElementById("scrollStage");

                // ❗ Do NOT touch the <svg> sizing here — CSS owns it (height:100vh; width:auto)
                if (inner) {
                  inner.style.width = `${canonicalWidthPx}px`;
                  inner.style.height = "100%";
                }
                if (stage) {
                  stage.style.width = `${canonicalWidthPx}px`;
                  stage.style.height = "100%";
                }
              }

              if (state.duration && state.duration > 0) {
                window.duration = state.duration;
                // console.log(`[Sync] ⏱ duration updated from server → ${window.duration} ms`);
              }


              // --- Playback / transport state
              window.elapsedTime = state.elapsedTime;
              window.isPlaying = state.isPlaying;

              // ✅ Store authoritative world position but DO NOT APPLY IT directly
              if (state.playheadX !== undefined) {
                window.serverSyncPlayheadX = state.playheadX;
              }

              // --- Visual update
              scrollToPlayheadVisual?.();

              // --- Animation loop state
              if (window.isPlaying && !wasPlaying) {
                cancelAnimationFrame(window.animationFrameId);
                window.animationFrameId = requestAnimationFrame(window.animate);
              }

              if (!window.isPlaying && wasPlaying) {
                cancelAnimationFrame(window.animationFrameId);
              }

              break;
            }



            //  Repeat Sync Messages from Server

            /**
            *  When another client updates a repeat cycle, apply it visually.
            * - Show repeat count if active
            * - Hide when repeat finishes
            * - Keeps local UI synced even if we didn’t trigger the repeat
            */

            case "repeat_update": {
              const { cueId: updateCueId, repeatData } = data;

              const before = { ...(repeatStateMap[updateCueId] || {}) };
              const incoming = { ...repeatData };

              //  OPTIONAL: Adjust currentCount if you're testing it
              // incoming.currentCount = Math.max(0, (incoming.currentCount || 0) - 1);

              //  Volatile flags that we’ll preserve
              delete incoming.ready;
              delete incoming.busy;
              delete incoming.jumpCooldownUntil;
              delete incoming.initialJumpDone;
              delete incoming.recovered;

              const merged = {
                ...before,
                ...incoming,
                ready: before.ready ?? true,
                busy: before.busy ?? false,
                jumpCooldownUntil: before.jumpCooldownUntil ?? 0,
                initialJumpDone: before.initialJumpDone ?? false,
                recovered: before.recovered ?? false,
              };

              //  Diff before/after to log what actually changed
              const after = merged;
              const changedKeys = Object.keys(after).filter(
                key => before[key] !== after[key]
              );

              console.log(`[ repeat_update] Changed fields for ${updateCueId}:`, changedKeys);
              for (const key of changedKeys) {
                console.log(`    ${key}:`, before[key], "→", after[key]);
              }

              repeatStateMap[updateCueId] = after;
              break;
            }

            /**
            *  Restore repeat state from the server.
            * - If a repeat is active but not yet jumped on this client, perform the jump.
            * - Ensures correct positioning on reconnect.
            */

            case "repeat_state_map": {
              pendingRepeatStateMap = data.repeatStateMap || {};

              console.log("[CLIENT] 💤 Stored repeat state map — will apply after SVG/cues are ready.");
              console.log("[DEBUG] repeat_state_map keys:", Object.keys(pendingRepeatStateMap));

              // Optionally, log each entry
              for (const [cueId, repeat] of Object.entries(pendingRepeatStateMap)) {
                console.log(`[🔍 repeat_state_map] ${cueId}:`);
                for (const [key, value] of Object.entries(repeat)) {
                  console.log(`   ${key}:`, value);
                }
              }

              break;
            }


            /**  Jump to Rehearsal Mark */
            case "jump": {
              // --- Ignore our own echo ---
              if (window.ignoreNextSync) {
                console.log("[Sync] Ignoring own jump echo");
                window.ignoreNextSync = false; // reset flag immediately
                break;
              }

              // --- Ignore very recent local jumps / seeks ---
              if (window.recentlyRecalculatedPlayhead) {
                console.log("[Sync] Skipping jump (recent local recalculation)");
                break;
              }

              // --- Apply remote jump normally ---
              window.playheadX = data.playheadX;
              window.elapsedTime = data.elapsedTime ?? 0;

              //  Locally center the scroll view based on received absolute playheadX
              scrollToPlayheadVisual?.();

              lastJumpTime = now;

              console.log(`[Sync] Remote jump applied → playheadX=${window.playheadX.toFixed(1)}`);
              break;
            }


            /**  Handle Unknown Messages */
            default:
              console.warn(`[WARNING] Received unknown Webwindow.socket message:`, data);
              break;
          }
        } catch (error) {
          console.error("[CLIENT] Error processing WebSocket message:", error);
        }
      });

      /**
      *  Event: WebSocket Connection Closed
      * Attempts to reconnect if the closure was unexpected.
      */
      window.socket.addEventListener('close', (event) => {
        console.warn(`[CLIENT] WebSocket closed. Code: ${event.code}, Reason: ${event.reason || "No reason provided"}`);

        if (!event.wasClean && reconnectAttempts < MAX_RETRIES) {
          reconnectAttempts++;
          console.log(`[CLIENT] Attempting to reconnect... (${reconnectAttempts}/${MAX_RETRIES})`);
          setTimeout(connectWebSocket, 3000);
        } else {
          console.error("[CLIENT] WebSocket reconnection limit reached.");
        }
      });

      /**
      * Event: WebSocket Encountered an Error
      * Logs WebSocket errors but does not close the connection.
      */
      window.socket.addEventListener('error', (err) => {
        console.error('[CLIENT] WebSocket encountered an error:', err);
      });

    } catch (error) {
      console.error(`[CLIENT] Failed to initialize WebSocket: ${error.message}`);
    }
  };

  // Initialize WebSocket connection
  connectWebSocket();

  // END OF WEBSOCKET CONNECTION AND MESSAGE HANDLERS ///////////////////////////
  ///////////////////////////////////////////////////////////////////////////////





  // START OF CLIENT MANAGMENT LOGIC ////////////////////////////////////////////

  //  Allows users to update their displayed name by clicking the client list.
  //  Sends the updated name to the server for synchronization across clients.
  //  Ensures the local client's name is updated globally and reflected in the UI.

  window.localClientName = localStorage.getItem("clientName") || "";

  document.getElementById("client-list").addEventListener("click", () => {
    const newName = prompt("Enter your name:");

    if (newName && newName.trim() !== "") {
      console.log(`[CLIENT] Updating name to: ${newName}`);

      //  Store the name in localStorage for persistence
      localStorage.setItem("clientName", newName.trim());

      //  Send the updated name to the server
      if (window.wsEnabled && window.socket) {
        window.socket.send(JSON.stringify({ type: "update_client_name", name: newName.trim() }));
      }

      window.localClientName = newName.trim(); // Update locally stored client name
      updateClientList(clients); //  Refresh UI with updated name

    }
  });

  //  Updates the displayed client list, applying styles for local and remote clients.
  //  Ensures the local client appears in bold with `.local-client` styling.
  //  Formats names in a comma-separated manner with line breaks where necessary.


  // Updates the client list with "Online: " prefix and proper spacing.
  // Local client name is highlighted using `.local-client` styling.
  // Names are arranged 1 per line, maintaining clarity and separation.

  const updateClientList = (clientArray) => {
    window.clients = clientArray; // Store globally
    const clientListElement = document.getElementById("client-list");

    if (clientListElement) {
      const formattedNames = clientArray
        .map((name, index) => {
          const isLocal = name === window.localClientName;
          const cssClass = isLocal ? "local-client" : "remote-client";
          const separator = (index < clientArray.length - 1) ? ', ' : '';
          return `<span class="${cssClass}">${name}${separator}</span>`;
        })
        .join('');

      clientListElement.innerHTML = `<strong>Online: </strong> ${formattedNames}`;
      clientListElement.style.whiteSpace = "normal";
      clientListElement.style.wordWrap = "break-word";

      if (clientArray.length === 1 && clientArray[0] === window.localClientName) {
        isAudioMaster = true;
        updateAudioMasterUI();
        console.log("[AudioMaster] Auto-enabled: only client connected.");
      } else {
        console.log("[AudioMaster] false.");

        isAudioMaster = false;
        updateAudioMasterUI();
      }

    } else {
      console.error("[CLIENT] Client list container not found.");
    }
  };

  /**
  * Sends stored client name to the server upon connection.
  * - Ensures the stored name is sent right after connecting.
  */

  const handleClientConnected = (clientName) => {
    window.localClientName = localStorage.getItem("clientName") || clientName; //  Use stored name if available

    console.log(`[CLIENT] Connected as: ${window.localClientName}`);

    //  If a stored name exists, send it to the server
    if (window.wsEnabled && window.socket && localClientName) {
      window.socket.send(JSON.stringify({ type: "update_client_name", name: window.localClientName }));
    }
  };

  // end of client management /////////////////////////////////////////////////



  // AUDIO MASTER LOGIC 

  let isAudioMaster = false;

  Object.defineProperty(window, 'isAudioMaster', {
    get: () => isAudioMaster,
    configurable: true
  });

  function updateAudioMasterUI() {
    const button = document.getElementById("audio-master-button");
    if (isAudioMaster) {
      button.classList.add("active");
    } else {
      button.classList.remove("active");
    }
  }

  document.getElementById("audio-master-button").addEventListener("click", () => {
    isAudioMaster = !isAudioMaster;
    updateAudioMasterUI();
    console.log(`[AudioMaster] Audio Master is now: ${isAudioMaster}`);
  });


  // helper for obj2path case3

  window.ensureWindowPlayheadX = () => {
    const svg = document.querySelector("svg");
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = window.innerWidth / 2;
    pt.y = 0;

    const transformed = pt.matrixTransform(svg.getScreenCTM().inverse());
    window.playheadX = transformed.x;
    console.log(`[playheadX] Initialized from screen center: ${window.playheadX.toFixed(2)} (SVG space)`);
  };



  /**
   * storePathVariants(svgElement)
   * ---------------------------------------------------------
   * Builds and populates `window.pathVariantsMap`, which groups
   * all <path> elements in the loaded SVG that share a common base ID
   * (e.g. path-9997, path-9997-1, path-9997-2, ...).
   *
   * This registry is required by the Case 5 branch of the o2p (object-to-path)
   * animation system.  Case 5 lets a single animated object move between
   * multiple “variant” paths that represent alternate trajectories.
   * The function must therefore run once for every newly loaded or replaced
   * SVG so that all variant relationships are known before any o2p
   * animations start.
   *
   * Example:
   *   path-9997       → base path
   *   path-9997-1     → variant #1
   *   path-9997-2     → variant #2
   *
   * These will be stored as:
   *   window.pathVariantsMap["path-9997"] = [ path-9997, path-9997-1, path-9997-2 ];
   *
   * If this mapping is missing or empty, Case 5 will exit early because it
   * cannot locate alternate paths for the ghost follower animation.
   *
   * Call timing:
   *   - Immediately after the SVG is loaded and attached to the DOM
   *     (typically inside initializeSVG or setupScore)
   *   - Optionally again when cuePage or cueGroup injects new SVG content
   */


  window.pathVariantsMap = {};

  const storePathVariants = (svgElement) => {
    console.groupCollapsed("[storePathVariants]  Building pathVariantsMap");
    window.pathVariantsMap = {};

    if (!svgElement) {
      console.warn("[storePathVariants]  No SVG element provided.");
      console.groupEnd();
      return;
    }

    const allPaths = svgElement.querySelectorAll("path");
    console.log(`[storePathVariants] Found ${allPaths.length} total <path> elements in SVG.`);

    allPaths.forEach(path => {
      const id = path.id || "(no id)";
      if (!id) {
        console.warn("[storePathVariants]  Path without ID skipped.");
        return;
      }

      // Only match IDs like path-123-4 (baseID + variant)
      const match = id.match(/^path-(\d+)-(\d+)$/);
      if (!match) {
        // Non-variant paths (e.g. just "path-9997") will be ignored
        console.log(`[storePathVariants] Skipped non-variant path: ${id}`);
        return;
      }

      const baseID = id.replace(/-\d+$/, '');
      if (!window.pathVariantsMap[baseID]) window.pathVariantsMap[baseID] = [];
      window.pathVariantsMap[baseID].push(path);

      console.log(`[storePathVariants]  Registered variant ${id} → base group "${baseID}"`);
    });

    const totalGroups = Object.keys(window.pathVariantsMap).length;
    console.log(`[storePathVariants]  Completed. ${totalGroups} base groups created.`);
    console.table(
      Object.entries(window.pathVariantsMap).map(([base, paths]) => ({
        baseID: base,
        variants: paths.map(p => p.id).join(", "),
        count: paths.length,
      }))
    );

    console.groupEnd();
  };

  window.storePathVariants = storePathVariants;

  /**
   * initializeSVG(svgElement)
   * --------------------------
   * This function initializes all interactive behaviors for a loaded SVG score.
   * It performs cue assignment, transforms flattening, animation setup, and 
   * preloads timing cues like `cueSpeed(...)`. It must be called after the 
   * SVG is appended to the DOM to ensure that all elements are present and measurable.
   *
   * @param {SVGElement} svgElement - The <svg> element representing the musical score.
   */

  window.initializeSVG = initializeSVG;

  // Initializes interactive behavior for elements within the SVG.
  // Ensures all elements with an ID can register click events for user interaction.

  const initializeSvgInteractions = () => {
    // Select the main SVG element
    const svgAnimationElement = document.querySelector('svg');

    if (!svgAnimationElement) {
      console.log('[DEBUG] No SVG element found for interaction.');
      return;
    }

    // Add specific click listeners for interactive elements within the SVG
    const clickableElements = svgAnimationElement.querySelectorAll('[id]');
    clickableElements.forEach((element) => {
      element.addEventListener('click', (event) => {
        console.log(`[DEBUG] Clicked on SVG element: ${element.id}`);
        // event.stopPropagation(); // Prevent bubbling if required
        // handleSvgPopupClick(event); // Handle the popup logic or trigger relevant actions
      });
    });

    // Ensure SVG elements are interactive (in case of CSS conflicts)
    svgAnimationElement.style.pointerEvents = 'all';
    svgAnimationElement.querySelectorAll('*').forEach((child) => {
      child.style.pointerEvents = 'all';
    });

    console.log('[DEBUG] SVG interactions initialized successfully.');
  };


  initializeSvgInteractions();




  const handleSvgPopupClick = (event) => {
    // console.log(`[DEBUG] SVG Click Detected on: ${event.target.tagName}, ID: ${event.target.id}`);

    //  Skip handling if click is inside Shoelace menu or dropdown
    if (
      event.target.closest('sl-dropdown') ||
      event.target.closest('sl-menu') ||
      event.target.tagName === 'SL-MENU-ITEM'
    ) {
      console.log('[DEBUG] Click inside Shoelace dropdown, ignoring popup dismissal.');
      return;  // Don't dismiss popups
    }

    // Identify the popup to dismiss
    const popups = document.querySelectorAll('.popup');
    let popupDismissed = false;

    popups.forEach((popup) => {
      if (popup.classList.contains('active')) {
        console.log(`[DEBUG] Popup dismissed: ${popup.id}`);
        popup.classList.add('hidden');
        popup.classList.remove('active');
        popupDismissed = true;
      }
    });

    if (popupDismissed) {
      console.log('[CLIENT] Resuming playback or animation after popup dismissal.');
      window.isPlaying = true;
      window.isMusicalPause = false;
      startStopwatch();
      animationPaused = false;

      document.body.querySelectorAll('.blur-background').forEach((element) => {
        element.classList.remove('blur-background');
      });

      startAnimation();
    } else {
      // console.log('[DEBUG] No active popups found to dismiss.');
    }

    event.stopPropagation();
  };


  // // Add listeners for SVG animations
  const svgAnimationElement = document.getElementById('svg-animation');
  if (svgAnimationElement) {
    svgAnimationElement.addEventListener('click', (event) => {
      console.log(`[DEBUG] SVG animation clicked: ${event.target.id}`);
      // handleSvgPopupClick(event);
    });
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('.animation-popup')) {
      console.log(`[DEBUG] Click detected on animation popup: ${event.target.id}`);
    }
  });

  // Add global event listener for dismissing popups
  // document.addEventListener('click', (event) => {
  //   console.log(`[DEBUG] Document clicked at (${event.clientX}, ${event.clientY}) on element:`, event.target);
  //   // handleSvgPopupClick(event);
  // });


  document.addEventListener("DOMContentLoaded", function () {
    const popup = document.getElementById("singlePage-content");

    document.addEventListener("click", function (event) {
      if (popup && !popup.contains(event.target)) {
        popup.style.display = "none"; // Hide the popup when clicking outside
      }
    });

    popup.addEventListener("click", function (event) {
      event.stopPropagation(); // Prevents click inside popup from closing it
    });
  });

  async function populateProjectSelector() {
    const grid = document.getElementById("project-grid");
    const message = document.getElementById("splash-message");
    const manualEntry = document.getElementById("manual-entry");

    try {
      const response = await fetch("/scores/");
      const html = await response.text();

      // Extract folder names from directory listing (assuming simple index output)
      const regex = /href=["'](?:\.\/|\/?scores\/)?([^"'/]+)\/["']/g;
      let match;
      const projects = [];
      while ((match = regex.exec(html)) !== null) {
        const name = match[1];
        if (name !== "audio" && name !== "texts" && name !== "videos") {
          projects.push(name);
        }
      }

      if (projects.length === 0) throw new Error("No projects found.");

      message.textContent = "Choose a project to load:";
      grid.innerHTML = "";

      projects.forEach((proj) => {
        const card = document.createElement("div");
        card.className = "project-card";
        card.textContent = proj;
        card.addEventListener("click", () => {
          console.log(`[SPLASH] Loading project: ${proj}`);
          loadProject(proj);
          fadeOutSplash();
        });
        grid.appendChild(card);
      });
    } catch (err) {
      console.warn("[SPLASH] Could not fetch project list:", err);
      message.textContent = " Automatic listing failed.";
      manualEntry.style.display = "block";

      document.getElementById("manual-load-btn").addEventListener("click", () => {
        const projName = document.getElementById("manual-project-input").value.trim();
        if (projName) {
          loadProject(projName);
          fadeOutSplash();
        }
      });
    }
  }

  function fadeOutSplash() {
    const splash = document.getElementById("splash");
    splash.classList.add("fade-out");
    setTimeout(() => (splash.style.display = "none"), 800);
  }

  // Initialize splash logic
  window.addEventListener("DOMContentLoaded", populateProjectSelector);

  /**
  *  Handles real-time synchronization of playback state.
  * - Updates `playheadX`, `elapsedTime`, and playback status from the server.
  * - Prevents unnecessary UI updates when paused or seeking.
  * - Ensures smooth scrolling and accurate position tracking.
  */

  const syncState = (state) => {
    if (!state || typeof state !== "object") return;

    console.log(`[DEBUG]  WebSocket Sync Received - window.playheadX=${state.playheadX},  window.isPlaying=${state.isPlaying}, window.scoreWidth=${state.scoreWidth}`);

    if (!isNaN(state.playheadX) && state.playheadX >= 0) {
      if (!window.isSeeking) {
        window.playheadX = state.playheadX;
        scrollToPlayheadVisual();
        console.log(`[DEBUG] Updated window.scoreContainer.scrollLeft=${window.scoreContainer.scrollLeft}`);

        //  Also update window.playheadX (SVG space at center of screen)
        const svg = document.querySelector("svg");
        if (svg) {
          const svgPoint = svg.createSVGPoint();
          svgPoint.x = window.innerWidth / 2;
          svgPoint.y = 0;
          const playheadSVG = svgPoint.matrixTransform(svg.getScreenCTM().inverse());
          window.playheadX = playheadSVG.x;
          console.log(`[syncState]  Updated window.playheadX = ${window.playheadX.toFixed(2)} (SVG space)`);
        }
        console.log(`[DEBUG] Updated window.scoreContainer.scrollLeft=${window.scoreContainer.scrollLeft}`);
      } else {
        console.log("[DEBUG] Skipping window.playheadX update from syncState during seeking.");
      }
    }

    window.isPlaying = state.isPlaying;
    window.isPlaying ? startAnimation() : stopAnimation();

    if (window.wsEnabled && window.socket) {
      window.socket.send(JSON.stringify({
        type: "sync",
        state: {
          playheadX: window.playheadX,
          elapsedTime: window.elapsedTime
        }
      }));
      console.log(`[CLIENT] Sent sync update after state change: window.playheadX=${window.playheadX}, window.elapsedTime=${elapsedTime}`);
    }
  };


  /**
   * TRANSPORT PLAYBACK LOOP (Freewheeling + Smooth Server Sync Convergence)
   * -----------------------------------------------------------------------
   * This loop advances the score playhead smoothly in world-space using the
   * local animation frame rate as the timing source. Playback speed is derived
   * from:
   *
   *   - playbackSpeed (browser timer speed factor)
   *   - window.speedMultiplier (musical tempo multiplier)
   *   - window.duration (full score timeline length, ms)
   *   - window.scoreWidth (total world width of the score)
   *
   * The result is continuous, frame-accurate scrolling *without needing to
   * receive sync packets every frame*.
   *
   * Server Sync:
   *  - The server periodically sends a reference playhead position
   *    (window.serverSyncPlayheadX), but we NEVER overwrite our local playhead.
   *
   *  - Instead, we measure the *drift* between our position and the server's
   *    reference. Large drift (cue jump, resume, seek) is snapped immediately.
   *    Small drift is corrected gradually using a time-based smoothing factor,
   *    making synchronization completely invisible to the performer.
   *
   * Benefits:
   *  - No visible "catch-up" jumps when sync packets arrive.
   *  - Smooth continuous scrolling even if network updates are irregular.
   *  - Long-term sync stability between multiple clients.
   *  - Works on different screen sizes due to canonical scaling.
   *
   * This is a stable real-time score transport model:
   *   freewheel motion + low-pass drift convergence.
   */
  
  window.animate = async (currentTime) => {

  if (!window.isPlaying || window.isSeeking) return;

  // --- Compute dt ---
  let dt = 0;
  if (window.lastAnimationFrameTime !== null) {
    dt = (currentTime - window.lastAnimationFrameTime) / 1000; // seconds
  }
  window.lastAnimationFrameTime = currentTime;

  const refWidth = window.remoteScoreWidth || window.scoreWidth;

  if (dt > 0 && refWidth && window.duration) {

    const deltaMs = dt * 1000;
    const effectiveDeltaMs = deltaMs * (window.speedMultiplier || 1);

    const estimatedIncrement =
      (effectiveDeltaMs / window.duration) * refWidth;

    window.playheadX = Math.min(
      window.playheadX + estimatedIncrement,
      refWidth
    );

    // ---- drift correction ----
    if (window.serverSyncPlayheadX !== undefined && window.serverSyncPlayheadX != null) {
      const drift = window.serverSyncPlayheadX - window.playheadX;

      if (Math.abs(drift) > (refWidth * 0.05)) {
        window.playheadX = window.serverSyncPlayheadX;
      } else {
        const correctionRate = 1.3;
        window.playheadX += drift * correctionRate * dt;
      }
    }

    scrollToPlayheadVisual();
  }

  // Update elapsed time
  if (window.duration && window.scoreWidth) {
    window.elapsedTime =
      (window.playheadX / window.scoreWidth) * window.duration;
  }


  // -----------------------------------------------------------
  // 🔥 SINGLE PROTECTED TRIGGER
  // -----------------------------------------------------------
  if (window._skipTriggerFrame > 0) {
    window._skipTriggerFrame--;
  } else {
    await checkCueTriggers?.(window.elapsedTime);
  }

  window.animationFrameId = requestAnimationFrame(window.animate);
};



  //////////////////////////////////////////////////////////////////////////////
  // Manages the playback animation loop, updating position, seek bar, and cues in real-time.
  // Uses requestAnimationFrame to ensure smooth, efficient animations synchronized with screen refresh.
  // Prevents unnecessary updates when paused, seeking, or stopped to optimize performance.
  // stopAnimation() cancels the loop when playback stops, preventing redundant frame updates.

  window.startAnimation = () => {

    // console.log("[DEBUG] startAnimation check:",
    //   "animationPaused=", window.animationPaused,
    //   "animationStopped=", window.animationStopped,
    //   "isSeeking=", window.isSeeking);

    if (!window.isPlaying || window.animationPaused || window.isSeeking) {
      console.log("[DEBUG] Animation paused, stopped, or seeking, skipping start.");
      return;
    }

    if (window.animationFrameId === null) {
      requestAnimationFrame((time) => {
        window.lastAnimationFrameTime = time;
        window.animationFrameId = requestAnimationFrame(window.animate); // Track it from the start
      });
    }
  };

  window.stopAnimation = () => {
    if (window.animationFrameId !== null) {
      cancelAnimationFrame(window.animationFrameId);
      window.animationFrameId = null;
      console.log("[DEBUG] Animation frame canceled.");
    }

    window.isPlaying = false;
    window.isMusicalPause = false;
    // stopStopwatch();
  };

  let isJumpingToMark = false; // Prevents unwanted position overrides

  // ///////////////////////////////////////
  // // SEEKBAR LOGIC

  const updateSeekBar = () => {
    const progress = (window.elapsedTime / duration) * 100;
    seekBar.value = progress;
  };

  // Function to synchronize playback time
  // Updates `elapsedTime` and aligns the score
  // Ensures correct positioning and checks for active cues.
  const setElapsedTime = (newTime) => {
    window.elapsedTime = newTime; // Update playback time
    checkCueTriggers(window.elapsedTime); // Recheck cues
  };


  // REPEAT BOX COUNTER LOGIC////////

  function updateRepeatCountDisplay(count) {
    const repeatBox = document.getElementById('repeat-count-box');
    repeatBox.textContent = count;
    repeatBox.style.display = 'block';
  }

  function hideRepeatCountDisplay() {
    const repeatBox = document.getElementById('repeat-count-box');
    repeatBox.classList.add('hidden');
    repeatBox.classList.remove('pulse'); //also stop pulsing
  }

  // Early repeat escape when clicking the count box
  document.getElementById("repeat-count-box").addEventListener("click", () => {
    for (const [cueId, repeat] of Object.entries(repeatStateMap)) {
      if (repeat.active) {
        console.log(`[repeat] 🚪 Escaping repeat early: ${cueId}`);
        repeat.currentCount = repeat.count; // Mark as completed
        repeat.active = false;
        hideRepeatCountDisplay();
        document.getElementById("playhead").classList.remove("repeating");
      }
    }
  });

  const toggleWebSocket = () => {
    window.wsEnabled = !window.wsEnabled;
    console.log(`[CLIENT] WebSocket is now ${window.wsEnabled ? 'enabled' : 'disabled'}.`);

    if (!window.wsEnabled && window.socket) {
      window.socket.close();
      window.socket = null;
    } else if (window.wsEnabled) {
      connectWebSocket();
    }
  }

  wsToggleButton.textContent = window.wsEnabled ? '🌐' : '❌';

  const toggleFullscreen = () => {

    const elem = document.documentElement;
    if (!document.fullscreenElement) {
      elem.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen mode: ${err.message}`);
      });

    } else {
      document.exitFullscreen();
    }
  };

  //  Check if the reload happened due to a resize
  console.log("[DEBUG] Page loaded, ensuring playhead is properly aligned.");


  const toggleKeybindingsPopup = () => {
    const keybindingsPopup = document.getElementById('keybindings-popup');
    if (keybindingsPopup.classList.contains('hidden')) {
      console.log("[CLIENT] Showing keybindings popup.");
      keybindingsPopup.classList.remove('hidden');
    } else {
      console.log("[CLIENT] Hiding keybindings popup.");
      keybindingsPopup.classList.add('hidden');
    }
  };

  ////////  END OF UTIL //////////////////////////////////////////////

  // Event Listeners

  //  Safely attach the close button listener now that DOM is ready
  const closeBtn = document.getElementById("close-score-options");
  if (closeBtn) {
    closeBtn.addEventListener("click", (event) => {
      console.log("[DEBUG] Close button clicked.");
      event.stopPropagation();
      document.getElementById("score-options-popup").classList.add("hidden");
    });
  } else {
    // console.warn("[DEBUG] Close button not found in DOM.");
  }

  toggleButton.addEventListener('click', () => {
    window.isPlaying ? window.pausePlayback() : window.resumePlayback();
  });

  rewindButton.addEventListener('click', () => {
    resetTriggeredCues(); // Clear triggered cues
    rewind(); // Existing function to handle rewinding
  });
  forwardButton.addEventListener('click', () => {
    resetTriggeredCues(); // Clear triggered cues
    forward(); // Existing function to handle forwarding
  });
  rewindToZeroButton.addEventListener('click', () => {
    resetTriggeredCues(); // Clear triggered cues
    rewindToStart(); // Existing function to reset playback to the start
    resetStopwatch();
  });

  fullscreenButton.addEventListener('click', toggleFullscreen);

  wsToggleButton.addEventListener('click', () => {
    toggleCommunication(); // Use the toggle function for WebSocket and OSC messages
  });

  // helpButton.addEventListener('click', () => {
  //   toggleKeybindingsPopup(); // Show keybindings popup when Help button is clicked
  // });


  window.addEventListener("DOMContentLoaded", () => {
    initializeDarkModeToggle();

  });


  document.getElementById("hamburger-menu")
    .addEventListener("sl-select", e => {
      if (e.detail.item.value === "preferences") {
        openPreferencesDialog();
      }
      if (e.detail.item.value === "load") {
        document.getElementById("project-dialog").show();
      }
    });




  // Single keydown event listener
  document.addEventListener('keydown', (event) => {
    // console.log(`Key pressed: ${event.key}`);
    if (event.key === 'h' || event.key === 'H') {
      toggleKeybindingsPopup(); // Show/hide keybindings popup
    } else if (event.key === 'f' || event.key === 'F') {
      toggleFullscreen(); // Fullscreen mode
    } else if (event.key === 't' || event.key === 'T') {
      toggleSplashScreen(); // Toggle splash screen visibility
    } else if (event.key === ' ') {
      event.preventDefault(); // Prevent default browser behavior for space key
      window.isPlaying ? window.pausePlayback() : window.startPlayback();
    } else if (event.key === 'Escape') {
    }
  });

  // disable enable network elements //////////////////////////////////////////////////////

  let isCommunicationEnabled = true; // Track the state of WebSocket and OSC communication

  const toggleCommunication = () => {
    isCommunicationEnabled = !isCommunicationEnabled;

    if (!isCommunicationEnabled) {
      // Disable WebSocket
      if (window.socket) {
        window.socket.close();
        window.socket = null;
      }
      console.log('WebSocket and OSC messages are disabled.');
    } else {
      // Re-enable WebSocket
      connectWebSocket(); // Ensure you have the existing connectWebSocket function
      console.log('WebSocket and OSC messages are enabled.');
    }

    // Update button text
    // wsToggleButton.textContent = isCommunicationEnabled ? 'Disable Communication' : 'Enable Communication';
    wsToggleButton.style.borderColor = isCommunicationEnabled ? 'green' : 'red';

    // Toggle classes for border color
    if (isCommunicationEnabled) {
      wsToggleButton.classList.toggle('enabled', isCommunicationEnabled);
    } else {
      wsToggleButton.classList.toggle('disabled', !isCommunicationEnabled);
    }
  };

  if (closeKeybindingsButton) {
    closeKeybindingsButton.addEventListener('click', () => {
      keybindingsPopup.classList.add('hidden');
    });
  }


  // Initialize
  // wsToggleButton.textContent = isCommunicationEnabled ? 'Disable Communication' : 'Enable Communication';
  wsToggleButton.style.borderColor = isCommunicationEnabled ? 'green' : 'red';

  if (keybindingsPopup) {
    keybindingsPopup.classList.add('hidden');
  }


  //updatestopwatch();
  window.scoreContainer = window.scoreContainer; // Expose globally
  // toggleSplashScreen();

  console.log('// EOF');

});

