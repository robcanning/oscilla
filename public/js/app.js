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

import {
  startStopwatch,
  stopStopwatch,
  resetStopwatch,
  resumeStopwatch,
  setupStopwatchFullscreenToggle
} from './stopwatch.js';


// ===========================
// 📦 Import Cue Handlers
// ===========================

import {
  handleCueTrigger,
  checkCueTriggers,
  parseCueParams,
  resetTriggeredCues,
  preloadSpeedCues,
  getSpeedForPosition,
  initializeSpeedControls,
  updateSpeedDisplay,
  setSpeed,
  adjustSpeed,
  handlePauseCue,
  dismissPauseCountdown,
  pauseDismissClickHandler,
  handleAudioCue,
  handleMediaCue,
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
  handleRestoredRepeatState
} from './cues.js';

import {
  startRotate,
  startRotation,
  startScale,
  initializeObjectPathPairs,
  parseO2PCompact,
  animateObjToPath,
  extractTagValue,
  getEasingFromId,
  applyPivotFromId,
  setTransformOriginToCenter,
  parseCompactAnimationValues,
  checkAnimationVisibility,
  initializeObserver
} from './anim.js';

// ===========================
// 🚀 DOM Ready Initializers
// ===========================



window.addEventListener("DOMContentLoaded", () => {
  initializeSpeedControls();
  pauseDismissClickHandler(); // Enables click/spacebar dismiss for pause UI
});

// ===========================
// 🌍 Global Window Bindings
// ===========================

window.handleCueTrigger = handleCueTrigger;
window.checkCueTriggers = checkCueTriggers;
window.parseCueParams = parseCueParams;
window.resetTriggeredCues = resetTriggeredCues;

window.triggeredCues = new Set();

window.playheadX = 0;
window.estimatedPlayheadX = 0;
window.speedMultiplier = 1;
window.scoreContainer = document.getElementById('scoreContainer');

// Duration of score in minutes (default = 30 minutes)
window.duration = 30;

// ===========================
// 🛠️ Logging Utilities
// ===========================

const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

let currentLogLevel = LogLevel.WARN;

const log = (level, ...messages) => {
  if (level >= currentLogLevel) {
    if (level === LogLevel.ERROR) {
      console.error(...messages);
    } else if (level === LogLevel.WARN) {
      console.warn(...messages);
    } else {
      console.log(...messages);
    }
  }
};

const setLogLevel = (level) => {
  currentLogLevel = level;
};

// Debug: show sessionStorage keys if needed
console.log("[DEBUG] sessionStorage keys:", Object.keys(sessionStorage));

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

// ===========================
// 🎧 Ensure WaveSurfer is Ready
// ===========================

const loadWaveSurfer = (callback) => {
  if (typeof WaveSurfer !== "undefined") {
    callback();
  } else {
    console.log("[INFO] Waiting for WaveSurfer.js to load...");
    setTimeout(() => loadWaveSurfer(callback), 100);
  }
};

loadWaveSurfer(() => {
  console.log("[INFO] WaveSurfer.js is loaded and ready to use.");
});





document.addEventListener('DOMContentLoaded', () => {
  setLogLevel(LogLevel.WARN);
  let suppressSync = false;
  let pendingRepeatStateMap = null; // stores repeat state from server before cues[] are ready
  console.log('Interactive Scrolling Score Initialized.');
  const splash = document.getElementById('splash');
  const controls = document.getElementById('controls');
  const playhead = document.getElementById('playhead');
  // let playheadX = 0; // ✅ Ensure `playheadX` is always available globally
  window.recentlyRecalculatedPlayhead = false;
  const score = document.getElementById('score');
  window.scoreWidth = document.querySelector('svg')?.getAttribute('width') || 40960; // Use SVG's intrinsic width
  const seekBar = document.getElementById('seek-bar');
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
  let animationLoop = null; // ✅ Declare animation loop variable
  let animationFrameId = null; // ✅ Ensure global tracking of requestAnimationFrame
  let incomingServerUpdate = false;
  let ignorePauseAfterResume = false;
  let pauseCooldownActive = false;
  const stopwatch = document.getElementById('stopwatch');
  const rehearsalMarksButton = document.getElementById('rehearsal-marks-button');
  const fullscreenButton = document.getElementById('fullscreen-button');
  // const durationInput = document.getElementById('duration-input');
  const svgFileInput = document.getElementById('svg-file');
  let svgElement = null; // Declare globally
  window.scoreSVG = null; // ✅ Store global reference to SVG
  const keybindingsPopup = document.getElementById('keybindings-popup');
  const scoreOptionsPopup = document.getElementById("score-options-popup");
  const closeKeybindingsButton = document.getElementById('close-keybindings');
  const closeScoreOptionsButton = document.getElementById('close-score-options');
  const SEEK_INCREMENT = 0.001; // Represents 1% of the total duration
  let animationPaused = false; // Global lock for animation state
  let maxScrollDistance = 40000; // todo GET THE VALUE FROM WIDTH
  let playbackSpeed = 1.0;
  window.lastAnimationFrameTime = null;
  let wsEnabled = true; // WebSocket state
  let socket = null; // Define globally so all functions can access it
  let resumeReceived = false; // ✅ Prevents infinite broadcast loops
  let totalPauseDuration = 0; // Tracks cumulative pause time for musical pauses
  let pauseStartTime = null; // Start time of the current musical pause
  let isManualPause = false; // Flag to differentiate manual vs. musical pause
  let resumeTimeOffset = null; // Tracks the time offset when resuming playback
  let pauseOffset = 0; // Tracks elapsed pause duration



///////////////////////////////////////////////////////////////

  const adjustscoreContainerHeight = () => {
    const controls = document.getElementById('controls');
    // const scoreContainer = document.getElementById('scoreContainer');
    //const controlsHeight = controls && !controls.classList.contains('hidden') ? controls.offsetHeight : 0;
    const controlsHeight = 5;
    // scoreContainer.style.height = `calc(100vh - ${controlsHeight}px)`; // Adjust height dynamically
    console.log(`scoreContainer height adjusted to: ${window.scoreContainer.style.height}`);
  };

///////////////////////////////////////////////////////////////


  /** ///////////////////////////////////////////////////////////////
  * Toggles the visibility of all score annotations using the "note-" namespace.
  * Queries only the SVG elements and switches between "block" and "none" display states.
  * Controlled via the 📝 button in the GUI.
  */

  const toggleScoreNotes = () => {
    console.log("[DEBUG] Toggling visibility of score notes.");

    window.scoreSVG = document.querySelector("svg"); // Get the SVG container
    if (!scoreSVG) {
      console.error("[ERROR] SVG score not found.");
      return;
    }

    const notes = scoreSVG.querySelectorAll('[id^="note-"]'); // Query only within the SVG
    if (notes.length === 0) {
      console.warn("[WARNING] No score notes found in SVG.");
      return;
    }

    notes.forEach(note => {
      note.style.display = note.style.display === "none" ? "block" : "none";
    });

    console.log(`[DEBUG] Toggled ${notes.length} score notes.`);
  };

  document.getElementById("toggle-notes-button").addEventListener("click", toggleScoreNotes);




  ///////////////////////////////////////////////////////////////
  // Handle Rehearsal Marks Navigation Popup
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

  //
  // // Function to adjust layout dynamically
  // const updateControlLayout = () => {
  //   const controls = document.getElementById('controls');
  //   if (window.innerWidth > window.innerHeight) {
  //     // Landscape Mode: One Row
  //     controls.style.flexWrap = 'nowrap';
  //   } else {
  //     // Portrait Mode: Allow Wrapping
  //     controls.style.flexWrap = 'wrap';
  //   }
  // };
  //
  // window.addEventListener('resize', updateControlLayout);



  // let triggeredCues = new Set(); // ✅ Initialize it as a global Set()
  //
  // const resetTriggeredCues = () => {
  //   console.log("[DEBUG] Resetting all triggered cues.");
  //   triggeredCues.clear(); // Clear the set so cues can trigger again
  // };
  //



  setupStopwatchFullscreenToggle();



  /**
  * ✅ Function: Dismiss the Splash Screen
  */
  function dismissSplashScreen() {
    const splashScreen = document.getElementById("main-splash-screen");
    if (splashScreen) {
      splashScreen.style.display = "none";
      console.log("[DEBUG] Splash screen dismissed.");
    }
  }

  /**
  * ✅ Ensure Splash Screen is Visible on Load
  */
  window.onload = () => {
    const splashScreen = document.getElementById("main-splash-screen");
    if (splashScreen) splashScreen.style.display = "flex";
  };


  // /**
  // * ✅ Function: Hide Splash Screen and Load Selected Score
  // */
  function loadScore(scoreFile) {
    console.log(`[DEBUG] Loading score: ${scoreFile}`);
    document.getElementById("main-splash-screen").style.display = "none"; // Hide splash
    initializeScore(scoreFile); // Existing function to load a score
  }


  const clearPopupsOnInteraction = (event) => {
    //controls.classList.add("hidden"); // Ensure they stay hidden
    // Ensure the event and event.target are valid
    if (!event || !event.target || event.target.closest("#stopwatch")) {
      console.log("[DEBUG] Ignoring stopwatch click for popup dismissal.");
      return;
    }
    //console.log("[DEBUG] Document clicked:", event.target);
    const animationPopup = document.getElementById('animation-popup');
    const videoPopup = document.getElementById('video-popup');
    const audioPopup = document.getElementById('audio-popup');
    const scoreOptionsPopup = document.getElementById('score-options-popup');
    const cueChoiceContainer = document.getElementById('cue-choice-container');
    // const scoreContainer = document.getElementById('scoreContainer');
    const playhead = document.getElementById('playhead');
    const playzone = document.getElementById('playzone');
    const animeJsContainer = document.getElementById('animejs-container');
    const animeJsContent = document.getElementById('animejs-content'); // Get the SVG container
    const popupsToClear = [animationPopup, videoPopup, audioPopup, animeJsContainer];
    let popupCleared = false;
    // Ignore clicks inside cue-choice-container or score-options-popup
    if ((cueChoiceContainer && cueChoiceContainer.contains(event.target)) ||
      (scoreOptionsPopup && scoreOptionsPopup.contains(event.target))) {
      console.log('[DEBUG] Click inside a protected container (cue-choice-container or score-options-popup), not clearing.');
      return;
    }

    // Close popups if they are active
    popupsToClear.forEach((popup) => {
      if (popup && (popup.classList.contains('active') || !popup.classList.contains('hidden'))) {
        console.log(`[DEBUG] Clearing popup: ${popup.id}`);
        popup.classList.add('hidden'); // Hide the popup
        popupCleared = true;

        // ✅ Special handling for Anime.js popup
        if (popup.id === "animejs-container") {
          console.log("[DEBUG] Closing Anime.js popup...");
          popup.classList.remove("active"); // Ensure it is fully hidden
          popup.style.display = "none";
          if (animeJsContent) animeJsContent.innerHTML = ""; // ✅ Remove the loaded SVG
          console.log("[DEBUG] Anime.js popup cleared and SVG removed.");
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
  document.addEventListener('keydown', clearPopupsOnInteraction);
  document.addEventListener('touchstart', clearPopupsOnInteraction);





  // function handleRestoredRepeatState(repeatStateMap, cues) {
  //   console.log("[CLIENT] 🧠 Restoring repeat state now...", repeatStateMap);

  //   for (const [cueId, repeat] of Object.entries(repeatStateMap)) {
  //     if (!repeat || typeof repeat !== "object") {
  //       console.warn(`[restore] Skipping invalid repeat entry for cueId: ${cueId}`);
  //       continue;
  //     }

  //     if (repeat.active && !repeat.initialJumpDone) {
  //       console.log(`[CLIENT] ⏮ Evaluating active repeat: ${cueId}`);

  //       const startCue = cues.find(c => c.id === repeat.startId);
  //       const endCue = repeat.endId === 'self'
  //         ? cues.find(c => c.id === cueId)
  //         : cues.find(c => c.id === repeat.endId);

  //       if (startCue && endCue) {
  //         const playheadCenter =window.playheadX + (window.scoreContainer.offsetWidth / 2);
  //         const inRange = playheadCenter >= startCue.x && playheadCenter <= endCue.x + endCue.width;

  //         if (inRange) {
  //           console.log(`[CLIENT] 🧭 Already inside repeat range for ${cueId}. Skipping jump.`);

  //           repeat.initialJumpDone = true;
  //           repeat.ready = true;

  //           if (!repeat.recovered) {
  //             repeat.currentCount = (repeat.currentCount || 0) + 1;
  //           } else {
  //             // already bumped during recovery, clear flag
  //             delete repeat.recovered;
  //           }

  //           repeat.recovered = true;
  //           jumpToCueId(repeat.startId); // ✅ Force visual re-alignment

  //           repeatStateMap[cueId] = repeat;

  //           updateRepeatCountDisplay(repeat.currentCount + 1);
  //           document.getElementById("repeat-count-box").classList.remove("hidden");
  //           document.getElementById("repeat-count-box").classList.add("pulse");
  //           document.getElementById("playhead").classList.add("repeating");


  //         } else {
  //           console.log(`[CLIENT] 🔁 Outside repeat range — jumping to start for ${cueId}.`);

  //           repeat.ready = false;
  //           repeat.initialJumpDone = true;
  //           repeatStateMap[cueId] = repeat;

  //           executeRepeatJump(repeat, cueId).then(() => {
  //             setTimeout(() => {
  //               repeat.ready = true;
  //               repeatStateMap[cueId] = repeat;
  //               console.log(`[CLIENT] ✅ Repeat ${cueId} now ready to detect end cue.`);
  //             }, 300);
  //           });
  //         }
  //       } else {
  //         console.warn(`[CLIENT] ⚠️ Could not resolve start or end cue for ${cueId}. Skipping recovery.`);
  //       }
  //     }
  //   }
  // }



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
    if (!wsEnabled) {
      console.warn('[CLIENT] WebSocket is disabled.');
      return;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
      console.warn('[CLIENT] WebSocket is already connected.');
      return; // ✅ Prevent duplicate connections
    }

    try {
      const WS_URL = await getWebSocketURL(); // Get WebSocket URL dynamically
      console.log(`[CLIENT] Connecting to WebSocket at: ${WS_URL}`);

      const socket = new WebSocket(WS_URL);
      window.socket = socket; // ✅ This makes it globally available
      /**
      * ✅ Event: Successfully Connected
      * Resets the reconnect counter when a connection is established.
      */
      socket.addEventListener('open', () => {
        console.log(`[CLIENT] WebSocket connected successfully to: ${WS_URL}`);
        reconnectAttempts = 0; // ✅ Reset retry counter
      });

      socket.addEventListener("open", () => {
        console.log("[CLIENT] 🌐 WebSocket connected — requesting repeat state...");
        window.socket.send(JSON.stringify({ type: "get_repeat_state" }));
      });

      /**
      * ✅ Event: Message Received from Server
      * Processes incoming WebSocket messages and syncs state across clients.
      */

      let recentlyJumped = false; // ✅ New flag to prevent double jumps

      socket.addEventListener("message", (event) => {
        // console.log(`[DEBUG] 🌐 WebSocket Message Received: ${event.data}`);

        try {
          const data = JSON.parse(event.data);

          if (!data || typeof data !== "object") {
            console.warn("[CLIENT] Invalid WebSocket message format:", data);
            return;
          }

          // console.log(`[DEBUG] WebSocket message received:`, data);

          switch (data.type) {
            /** ✅ Welcome Message - Assigns client name */
            case "welcome":
              console.log(`[CLIENT] Connected as: ${data.name}`);
              break;

            // ✅ Handle receiving the updated client list from the server
            case "client_list":
              updateClientList(data.clients);
              break;

            case "set_speed_multiplier":
              if (!isNaN(data.multiplier) && data.multiplier > 0) {
                const roundedMultiplier = parseFloat(data.multiplier.toFixed(1));

                console.log(`[CLIENT] 🔄 Server Speed Update Received: ${data.multiplier} (Rounded: ${roundedMultiplier})`);
                console.log(`[CLIENT] 🔍 Currentwindow.playheadX: ${window.playheadX}, Adjustedwindow.playheadX: ${window.playheadX + (window.innerWidth * 0.5)}`);

                if (speedMultiplier !== roundedMultiplier) {
                  incomingServerUpdate = true;  // ✅ Prevent redundant updates
                  window.speedMultiplier = roundedMultiplier;
                  console.log(`[CLIENT] ✅ Speed multiplier updated from server: ${speedMultiplier}`);
                  window.updateSpeedDisplay();
                  setTimeout(() => { incomingServerUpdate = false; }, 100);  // ✅ Short delay to reset flag
                } else {
                  console.log(`[CLIENT] ⚠️ Speed multiplier already set to ${speedMultiplier}. No update needed.`);
                }
              } else {
                console.warn(`[CLIENT] ❌ Invalid speed multiplier received: ${data.multiplier}`);
              }
              break;


            /** ✅ Pause Playback */
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
              stopStopwatch();
              stopAnimation(); // ✅ Stop playhead movement
              togglePlayButton(); // ✅ Update UI play button
              console.log("[DEBUG] Playback paused successfully.");
              break;

            /** ✅ Resume Playback After Pause */
            case "resume_after_pause":
              console.log(`[DEBUG] Processing resume_after_pause.window.playheadX=${data.playheadX}, elapsedTime=${data.elapsedTime}`);

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

               window.isPlaying = true;
               window.isMusicalPause = false;
              startStopwatch();
              togglePlayButton();
              startAnimation();
              console.log("[DEBUG] Playback resumed successfully.");
              break;

            /** ✅ Dismiss Pause Countdown */
            case "dismiss_pause_countdown":
              console.log("[DEBUG] Received dismiss_pause_countdown event. Hiding countdown popup.");
              dismissPauseCountdown(true, true);
              break;

            /** ✅ Update Connected Clients List */
            case "client_list":
              console.log(`[CLIENT] Connected clients: ${JSON.stringify(data.clients)}`);
              updateClientList(data.clients);
              break;

            /** ✅ Handle Cue Pause */
            case "cuePause":
              console.log(`[CLIENT] Received cuePause. Duration: ${data.duration}ms`);

              // ✅ Apply server-provided values BEFORE sending ack or triggering pause
              if (!isNaN(data.playheadX)) {
               window.playheadX = data.playheadX;
                console.log(`[CLIENT] Syncedwindow.playheadX from cuePause: ${window.playheadX}`);
              }

              if (!isNaN(data.elapsedTime)) {
                window.elapsedTime = data.elapsedTime;
                console.log(`[CLIENT] Synced window.elapsedTime from cuePause: ${elapsedTime}`);
              }

              stopAnimation();
               window.isPlaying = false;
               window.isMusicalPause = false;
              stopStopwatch();
              animationPaused = true;
              togglePlayButton();

              if (wsEnabled && socket) {
                window.socket.send(JSON.stringify({
                  type: "cuePause_ack",
                  playheadX:window.playheadX ?? -1,
                  elapsedTime: window.elapsedTime ?? -1
                }));
                console.log(`[CLIENT] Sent cuePause_ack to server.window.playheadX=${window.playheadX}, window.elapsedTime=${elapsedTime}`);
              }

              handlePauseCue(data.id, data.duration);
              break;




            /** ✅ Handle Cue Stop */
            case "cueStop":
              console.log(`[CLIENT] Received cueStop. Elapsed Time: ${data.elapsedTime}`);
              handleStopCue(data.id || "cueStop");
              break;

            /** ✅ Handle Traverse Cue */
            case "cueTraverse":
              console.log(`[CLIENT] Received cueTraverse: ${data}`);
              handleTraverseCue(data.id || "cueTraverse");
              break;

            /**
             * ✅ General Cue Trigger Handler
             *
             * This is called when the server broadcasts a cue that was triggered
             * (e.g., pause, audio, repeat, etc.). It ensures all clients react
             * as if they had locally intersected the cue themselves.
             */

            case "cueTriggered":
              console.log(`[CLIENT] Cue was triggered: ${data.cueId}`);
              handleCueTrigger(data.cueId, true); // ✅ mark as remote trigger
              break;

            /** ✅ Acknowledge Cue Pause */
            case "cuePause_ack":
              console.log("[CLIENT] Received cuePause_ack from another client.");
              break;

            /** ✅ Audio Cue Received */
            case "audio_cue":
              console.log(`[CLIENT] Received audio cue event: ${data.filename} at volume ${data.volume}`);
              handleAudioCue(data.cueId);
              break;

            /** ✅ Synchronize Playback State */
            case "sync":
              if (suppressSync) {
                console.warn(`[WARNING] Ignoring sync message to prevent overriding rewind.`);
                return;
              }

              if (data.playheadX) {
                console.warn(`[WARNING] WebSocket message modifyingwindow.playheadX: ${data.playheadX}`);
              }

              window.elapsedTime = data.state.elapsedTime;
               window.isPlaying = data.state.isPlaying;

              if (!window.recentlyRecalculatedPlayhead) {
               window.playheadX = data.state.playheadX;
                window.scoreContainer.scrollLeft = window.playheadX;
                // console.log("[DEBUG] ⏳ Waiting for WebSocket Sync...");
                // console.log("[DEBUG] 🛠️ Calling extractScoreElements...");
                // if (!svgElement) {
                //     console.warn("[WARNING] ❌ extractScoreElements skipped: SVG not ready. Retrying...");
                //     setTimeout(() => {
                //         if (svgElement) {
                //             console.log("[DEBUG] ✅ SVG is now ready. Extracting...");
                //             const startTime = performance.now();
                //             extractScoreElements(svgElement);
                //             const endTime = performance.now();
                //             console.log(`[DEBUG] ⏳ extractScoreElements executed in ${(endTime - startTime).toFixed(2)}ms`);
                //             console.log("[DEBUG] ✅ Extracted Score Elements. Now Checking Sync...");
                //         } else {
                //             console.error("[ERROR] ❌ SVG still not ready after retry. Investigate further.");
                //         }
                //     }, 100);  // Small delay to wait for SVG to be ready
                // } else {
                //   const startTime = performance.now();
                //   extractScoreElements(svgElement);
                //   const endTime = performance.now();
                //   console.log(`[DEBUG] ⏳ extractScoreElements executed in ${(endTime - startTime).toFixed(2)}ms`);
                //   console.log("[DEBUG] ✅ Extracted Score Elements. Now Checking Sync...");
                // }

                // const startTime = performance.now();
                // extractScoreElements(svgElement);
                // const endTime = performance.now();
                // console.log(`[DEBUG] ⏳ extractScoreElements executed in ${(endTime - startTime).toFixed(2)}ms`);
                // console.log("[DEBUG] ✅ Extracted Score Elements. Now Checking Sync...");


                // console.log(`[DEBUG] ✅ Applying serverwindow.playheadX: ${window.playheadX}`);
              } else {
                console.log(`[DEBUG] 🔄 Ignoring serverwindow.playheadX update to prevent override.`);
              }

              updatePosition();
              window.recentlyRecalculatedPlayhead = false; // Reset flag after applying the state

              updateSeekBar();
              //updatestopwatch();

              if (!isNaN(data.state.speedMultiplier) && data.state.speedMultiplier > 0) {
                if (speedMultiplier !== data.state.speedMultiplier) {
                  window.speedMultiplier = data.state.speedMultiplier;
                  console.log(`[CLIENT] Synced speed multiplier to ${speedMultiplier}`);
                } else {
                  // console.log(`[CLIENT] Speed multiplier already set to ${speedMultiplier}. No update needed.`);
                }
              } else {
                // console.warn(`[CLIENT] Invalid or unchanged speed multiplier received: ${data.state.speedMultiplier}`);
              }

              if (window.isPlaying) {
                //console.debug("[CLIENT] Resuming playback after sync.");
                // ✅ Only start animation if the function is defined
                if (typeof animate === "function" && animationFrameId === null) {
                  //console.debug("[CLIENT] Starting animation loop.");
                  requestAnimationFrame(animate);
                } else if (animationFrameId === null) {
                  console.warn("[CLIENT] Cannot start animation: `animate` is not defined.");
                }
              } else {
                // console.log("[CLIENT] Paused after sync.");
                stopAnimation();
              }

              ignoreRewindOnStartup = true;
              break;

            //  🔁 Repeat Sync Messages from Server

            /**
            * 🔁 When another client updates a repeat cycle, apply it visually.
            * - Show repeat count if active
            * - Hide when repeat finishes
            * - Keeps local UI synced even if we didn’t trigger the repeat
            */

            case "repeat_update": {
              const { cueId: updateCueId, repeatData } = data;

              const before = { ...(repeatStateMap[updateCueId] || {}) };
              const incoming = { ...repeatData };

              // 🔍 OPTIONAL: Adjust currentCount if you're testing it
              // incoming.currentCount = Math.max(0, (incoming.currentCount || 0) - 1);

              // 🛑 Volatile flags that we’ll preserve
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

              // 🧪 Diff before/after to log what actually changed
              const after = merged;
              const changedKeys = Object.keys(after).filter(
                key => before[key] !== after[key]
              );

              console.log(`[🔬 repeat_update] Changed fields for ${updateCueId}:`, changedKeys);
              for (const key of changedKeys) {
                console.log(`    ${key}:`, before[key], "→", after[key]);
              }

              repeatStateMap[updateCueId] = after;
              break;
            }




            /**
            * 🔁 Restore repeat state from the server.
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


            /** ✅ Jump to Rehearsal Mark */
            case "jump":
              console.log(`[DEBUG] 🔄 Server jump received:window.playheadX=${data.playheadX}`);

              const now = Date.now();
              if (now - lastJumpTime < 1000) { // ✅ Ignore duplicate jumps within 1s
                console.log(`[DEBUG] 🚫 Ignoring duplicate jump from server.`);
                return;
              }

             window.playheadX = data.playheadX;
              window.scoreContainer.scrollLeft =window.playheadX;
              console.log(`[DEBUG] ✅ Applied Server Jump:window.playheadX=${window.playheadX}`);

              lastJumpTime = now; // ✅ Update the last jump timestamp
              break;

            case "sync":
              console.log(`[DEBUG] 🔄 Received sync message, ignoring jump.`);
              break;
            /** ❌ Handle Unknown Messages */
            default:
              console.warn(`[WARNING] Received unknown WebSocket message:`, data);
              break;
          }
        } catch (error) {
          console.error("[CLIENT] Error processing WebSocket message:", error);
        }
      });

      /**
      * ✅ Event: WebSocket Connection Closed
      * Attempts to reconnect if the closure was unexpected.
      */
      socket.addEventListener('close', (event) => {
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
      * ✅ Event: WebSocket Encountered an Error
      * Logs WebSocket errors but does not close the connection.
      */
      socket.addEventListener('error', (err) => {
        console.error('[CLIENT] WebSocket encountered an error:', err);
      });

    } catch (error) {
      console.error(`[CLIENT] Failed to initialize WebSocket: ${error.message}`);
    }
  };

  // Initialize WebSocket connection
  connectWebSocket();

  // END OF WEBSOCKET CONNECTION AND MESSAGE HANDLERS ///////////////////////////





  // START OF CLIENT MANAGMENT LOGIC ////////////////////////////////////////////

  //  Allows users to update their displayed name by clicking the client list.
  //  Sends the updated name to the server for synchronization across clients.
  //  Ensures the local client's name is updated globally and reflected in the UI.

  let localClientName = localStorage.getItem("clientName") || "";

  document.getElementById("client-list").addEventListener("click", () => {
    const newName = prompt("Enter your name:");

    if (newName && newName.trim() !== "") {
      console.log(`[CLIENT] Updating name to: ${newName}`);

      // ✅ Store the name in localStorage for persistence
      localStorage.setItem("clientName", newName.trim());

      // ✅ Send the updated name to the server
      if (wsEnabled && socket) {
        window.socket.send(JSON.stringify({ type: "update_client_name", name: newName.trim() }));
      }

      localClientName = newName.trim(); // ✅ Update locally stored client name
      updateClientList(clients); // ✅ Refresh UI with updated name

    }
  });

  //  Updates the displayed client list, applying styles for local and remote clients.
  //  Ensures the local client appears in bold with `.local-client` styling.
  //  Formats names in a comma-separated manner with line breaks where necessary.


  // ✅ Updates the client list with "Online: " prefix and proper spacing.
  // ✅ Local client name is highlighted using `.local-client` styling.
  // ✅ Names are arranged 1 per line, maintaining clarity and separation.

  const updateClientList = (clientArray) => {
    window.clients = clientArray; // ✅ Store the latest client list globally
    const clientListElement = document.getElementById("client-list");

    if (clientListElement) {
      const formattedNames = clients
        .map((name, index) => {
          const isLocal = name === localClientName; // ✅ Detect local client
          const cssClass = isLocal ? "local-client" : "remote-client";
          const separator = (index % 1 === 0 && index < clients.length - 1) ? ',  ' : ''; // ✅ Add commas correctly
          return `<span class="${cssClass}">${name}${separator}</span>`;
        })
        .join('');

      // ✅ Prepend "Online: " and ensure wrapping behavior
      clientListElement.innerHTML = `<strong>Online: </strong> ${formattedNames}`;
      clientListElement.style.whiteSpace = "normal";
      clientListElement.style.wordWrap = "break-word"; // ✅ Prevent overflow issues
    } else {
      console.error("[CLIENT] Client list container not found.");
    }
  };

  /**
  * ✅ Sends stored client name to the server upon connection.
  * - Ensures the stored name is sent right after connecting.
  */

  const handleClientConnected = (clientName) => {
    localClientName = localStorage.getItem("clientName") || clientName; // ✅ Use stored name if available

    console.log(`[CLIENT] Connected as: ${localClientName}`);

    // ✅ If a stored name exists, send it to the server
    if (wsEnabled && socket && localClientName) {
      window.socket.send(JSON.stringify({ type: "update_client_name", name: localClientName }));
    }
  };

  // end of client management /////////////////////////////////////////////////



  // SPLASH SCREEN LOGIC //////////////////////////////////////////////////////

  const fadeToBlack = () => {
    const overlay = document.getElementById('black-overlay');
    if (!overlay) {
      console.error('[ERROR] Black overlay element not found!');
      return;
    }

    overlay.style.opacity = '1'; // Make the overlay visible
    console.log('[DEBUG] Fade-to-black triggered.');
  };

  splash.addEventListener('click', (event) => {
    event.stopPropagation(); // Prevent clicks on child elements from blocking
    console.log("[CLIENT] Splash screen clicked.");
    toggleSplashScreen();
  });

  function toggleSplashScreen() {
    console.log("[CLIENT] toggleSplashScreen() called.");

    const splash = document.getElementById('splash');
    // const scoreContainer = document.getElementById('scoreContainer');
    const controls = document.getElementById('controls');

    if (splash.style.display === 'none' || splash.classList.contains('hidden')) {
      console.log("[CLIENT] Showing splash screen.");
      splash.style.display = 'flex';
      splash.classList.remove('hidden');
      window.scoreContainer.style.display = 'none'; // Hide the score window.scoreContainer
      controls.style.display = 'none'; // Hide controls
    } else {
      console.log("[CLIENT] Hiding splash screen.");
      splash.style.display = 'none';
      splash.classList.add('hidden');
      window.scoreContainer.style.display = 'block'; // Show the score scoreContainer
      controls.style.display = 'flex'; // Show controls

      // Ensure scoreContainer size is recalculated
      // adjustscoreContainerHeight();

      // Reinitialize SVG to ensure proper scaling
      const svgElement = document.querySelector('svg');
      if (svgElement) {
        initializeSVG(svgElement);
      } else {
        console.warn("[CLIENT] No SVG element found in scoreContainer during splash toggle.");
      }
    }
  }
  // END OF SPLASH SCREEEN TOGGLE ////////////////////////////////////////////////////

  // helper for obj2path case3

  window.ensureWindowPlayheadX = () => {
    const svg = document.querySelector("svg");
    if (!svg) return;

    const pt = svg.createSVGPoint();
    pt.x = window.innerWidth / 2;
    pt.y = 0;

    const transformed = pt.matrixTransform(svg.getScreenCTM().inverse());
    window.playheadX = transformed.x;
    console.log(`[playheadX] 📍 Initialized from screen center: ${window.playheadX.toFixed(2)} (SVG space)`);
  };

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
 */
function assignCues(svgRoot) {
  const cueGroups = svgRoot.querySelectorAll('g[id^="assignCues("]');
  if (!cueGroups.length) {
    console.log("[assignCues] No assignCues(...) groups found in SVG.");
    return;
  }

  console.log(`[assignCues] Found ${cueGroups.length} cue group(s).`);

  cueGroups.forEach(group => {
    console.log(`[assignCues] Raw group ID: '${group.id}'`);

    const match = group.id.match(/^assignCues\((.+)\)$/);
    if (!match) {
      console.warn(`[assignCues] Skipping malformed group ID: ${group.id}`);
      return;
    }

    const instruction = match[1].trim();
    console.log(`[assignCues] Processing group: ${group.id} with ${group.children.length} child(ren)`);

    // ------------------------------------------
    // 1. Special case: cueOscSet(param, rnd[...] / ypos[...])
    // ------------------------------------------
    const setMatch = instruction.match(/^cueOscSet\(([^,]+),\s*(rnd|ypos)\[([\d.]+),([\d.]+)\]\)$/);
    if (setMatch) {
      const param = setMatch[1].trim();
      const mode = setMatch[2];
      const min = parseFloat(setMatch[3]);
      const max = parseFloat(setMatch[4]);

      console.log(`[assignCues] → cueOscSet(${param}, ${mode}[${min}, ${max}])`);

      const bbox = group.getBBox();

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

        if (typeof cues !== "undefined" && Array.isArray(cues)) {
          cues.push({ id: cueId, element: child, triggered: false });
        }

        console.log(`[assignCues] [${index}] → ${child.tagName} → ${cueId}`);
      });
      return;
    }

    // ------------------------------------------
    // 2. General case: cueOscTrigger, cueOscValue, cueOscRandom, etc.
    // ------------------------------------------
    console.log(`[assignCues] Evaluating instruction: '${instruction}'`);

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

    console.log(`[assignCues] → ${cueType}(${mode}[${min}, ${max}])`);

    const bbox = group.getBBox();

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

      if (typeof cues !== "undefined" && Array.isArray(cues)) {
        cues.push({ id: cueId, element: child, triggered: false });
      }

      console.log(`[assignCues] [${index}] → ${child.tagName} → ${cueId}`);
    });
  });
}
















  //////////////////////////////////////////////////////
  // Ensures Anime.js animations are detected and tracked dynamically
  // Pauses animations when they are not visible and resumes them when they reappear
  // Supports path-based (obj2path-*), rotation (obj_*_rotate_*), and other Anime.js animations
  // Uses Intersection Observer to optimize performance by stopping off-screen animations
  // Ensures the observer starts only after animations are fully initialized

  window.runningAnimations = {}; // Store active animations globally

  // Function to detect and track existing animations (including rotation)
  window.detectExistingAnimations = function () {
    console.log("[DEBUG] Checking currently running Anime.js animations...");

    anime.running.forEach(anim => {
      anim.animatables.forEach(animatable => {
        const target = animatable.target;
        if (target && target.getAttribute) {
          const id = target.getAttribute("id");

          // Ensure we track both path-based and rotation-based animations
          if (id && (id.startsWith('obj2path') || id.startsWith('obj_') || id.includes('_rotate_'))) {
            if (!window.runningAnimations[id]) {
              // console.log("[DEBUG] Tracking new animation for: " + id);
              window.runningAnimations[id] = anim;
            }
          }
        }
      });
    });

    // console.log("[DEBUG] Updated running animations:", Object.keys(window.runningAnimations));
  };

  /**
  * ✅ Optimized Function: checkAnimationVisibility (with state change logging)
  *
  * - Checks both the object and its associated path for visibility.
  * - If the path is visible but the object is off-screen, the animation **continues**.
  * - Logs when an animation starts playing for the first time.
  * - Logs when an animation pauses for the first time after it has been playing.
  * - Uses `window.runningAnimations` to manage active animations.
  * - Removes redundant event listeners and interval (handled elsewhere in app.js).
  */

  window.checkAnimationVisibility = function () {
    Object.entries(window.runningAnimations).forEach(([id, instance]) => {
      const el = document.getElementById(id);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0;

      if (isVisible) {
        if (instance.wasPaused) {
          // console.log(`[CHECK] ${id} became visible — resuming`);
          if (typeof instance.resume === "function") instance.resume();
          else if (typeof instance.play === "function") instance.play();
          instance.wasPaused = false;
        }
      } else {
        if (!instance.wasPaused) {
          // console.log(`[CHECK] ${id} is off-screen — pausing`);
          if (typeof instance.pause === "function") instance.pause();
          instance.wasPaused = true;
        }
      }
    });
  };


  window.initializeObserver = function () {
    if (window.observer) window.observer.disconnect();

    window.observer = new IntersectionObserver((entries) => {
      if (window.disableObserver) return; // 🔥 Skip all observer logic

      for (const entry of entries) {
        const el = entry.target;
        const id = el.id;
        const instance = window.runningAnimations[id];

        if (!instance) continue;

        if (entry.isIntersecting) {
          if (instance.wasPaused || instance.autoStart) {
            if (typeof instance.resume === "function") instance.resume();
            else if (typeof instance.play === "function") instance.play();
            // console.log(`[OBSERVER] ${id} entered view — resumed`);
            instance.wasPaused = false;
            instance.autoStart = false;
          }
        } else {
          if (typeof instance.pause === "function") instance.pause();
          instance.wasPaused = true;
          // console.log(`[OBSERVER] ${id} left view — paused`);
        }
      }
    }, {
      root: null,
      threshold: 0.01,
      rootMargin: "0px", // ✅ Use full viewport width for visibility detection.
      // This ensures that any object visually inside the screen 
      // (not just near the center) will trigger IntersectionObserver.
      // Narrow values like "-45%" were previously used to simulate a 
      // central "playhead zone", but caused false negatives on pause, 
      // reload, or cue jumps. Defaulting to full view is more robust.    
    });


    // Global OBSERVER DISABLE for dubugging
    // window.disableObserver = true;

    Object.entries(window.runningAnimations).forEach(([id, instance]) => {
      const el = document.getElementById(id);
      if (el instanceof Element) {
        window.observer.observe(el);
      }
    });

    // ✅ Immediately check visibility
    requestAnimationFrame(() => {
      window.checkAnimationVisibility();
    });
  };

  window.startAllVisibleAnimations = () => {
    console.log(`[DEBUG] Checking ${Object.keys(window.runningAnimations).length} animations for visibility`);

    Object.entries(window.runningAnimations).forEach(([id, instance]) => {
      const el = document.getElementById(id);

      if (!el) {
        console.warn(`[MISSING] No DOM element for ${id}`);
        return;
      }

      const rect = el.getBoundingClientRect();
      const isVisible =
        rect.top < window.innerHeight &&
        rect.bottom > 0 &&
        rect.left < window.innerWidth &&
        rect.right > 0;

      // console.log(`[CHECK] ${id}: visible=${isVisible}, rect=${JSON.stringify(rect)}`);

      if (isVisible) {
        // console.log(`[FORCE PLAY] ${id}`);
        if (typeof instance.resume === "function") {
          instance.resume();
          // console.log(`[DEBUG] Called resume() on ${id}`);
        } else if (typeof instance.play === "function") {
          instance.play();
          // console.log(`[DEBUG] Called play() on ${id}`);
        } else {
          console.warn(`[WARN] No resume() or play() method on ${id}`);
        }
      }
    });
  };

  // Function to apply observer and visibility tracking
  window.observeAnimations = function () {
    if (!window.observer) {
      window.initializeObserver();
    }

    document.querySelectorAll(window.ANIM_SELECTOR).forEach((element) => {
      const id = element.id;
      if (window.runningAnimations[id]) {
        window.observer.observe(element);
        console.log(`[DEBUG] Observer attached to: ${id}`);
      } else {
        console.warn(`[SKIPPED] ${id} exists but has no registered animation.`);
      }
    });
  };

  // // Function to wait for animations to be initialized before starting detection
  function waitForAnimationsToInitialize() {
    //console.log("[DEBUG] Waiting for animations to initialize...");

    const checkAnimations = setInterval(() => {
      if (anime.running.length > 0) { // Ensure at least one animation is running
        //      console.log("[DEBUG] Animations are initialized. Running detection and observer.");
        clearInterval(checkAnimations);

        detectExistingAnimations();
        observeAnimations();
      }
    }, 500);
  }



















  ////// SVG LOADING LOGIC ///////////////////////////////////////////////

  // Loads an external SVG file and adds it to the scoreContainer, replacing any existing SVG.
  // Aligns the playhead correctly at the start of the score
  // Runs `rewindToStart()` with a slight delay to finalize alignment after loading.
  /**
   * ✅ Enhanced SVG loader with session persistence
   *
   * - Uploads work using blob URLs.
   * - Keeps track of current score using sessionStorage.
   * - Falls back to draft.svg if nothing is set or session is new.
   */

  /**
   * ✅ SVG Loading & Session Persistence Logic
   * - Supports uploading custom SVG scores
   * - Automatically restores the last uploaded score using sessionStorage
   * - Falls back to "svg/draft.svg" if session or blob is unavailable
   */
  /**
   * svgpersist: SVG Loading & Session Persistence Logic
   * - Lets users upload custom SVG scores during a session.
   * - Remembers the last uploaded score using sessionStorage.
   * - Falls back to "svg/draft.svg" if session data or blob is invalid.
   */

  // [svgpersist] 🧠 Rationale: store uploaded SVG as base64 string so it survives page reloads.
  // - Avoids relying on Blob URLs, which expire after tab close.
  // - sessionStorage keeps it for the session; use localStorage if you want cross-session persistence.

  // [svgpersist] 🧠 Using base64 to persist SVG across page reloads during the same session.
  // - Avoids expired Blob URLs
  // - sessionStorage holds a data URL encoded from the user's uploaded SVG

  // [svgpersist] Full SVG persistence and upload logic
  window.pathVariantsMap = {};

  window.loadExternalSVG = (svgSource) => {
    console.log('[svgpersist] Loading external SVG...');

    // 🟨 Base64 inline SVG
    if (svgSource.startsWith("data:image/svg+xml;base64,")) {
      console.log(`[svgpersist] Loaded base64 SVG (length: ${svgSource.length})`);
      const parser = new DOMParser();
      const svgElement = parser.parseFromString(atob(svgSource.split(",")[1]), 'image/svg+xml').documentElement;
      svgElement.id = "score";

      window.scoreContainer.innerHTML = '';
      window.scoreContainer.appendChild(svgElement);

      initializeSVG(svgElement);
      storePathVariants(svgElement);
      return;
    }

    // 🟦 External fetch (e.g., svg/draft.svg or blob:)
    fetch(svgSource)
      .then(response => response.text())
      .then(svgText => {
        const parser = new DOMParser();
        const svgElement = parser.parseFromString(svgText, 'image/svg+xml').documentElement;
        svgElement.id = "score";

        window.scoreContainer.innerHTML = '';
        window.scoreContainer.appendChild(svgElement);

        initializeSVG(svgElement);

        storePathVariants(svgElement);
      })
      .catch(err => {
        console.error('[svgpersist] ERROR loading SVG:', err);
        if (svgSource.startsWith("blob:")) {
          console.warn('[svgpersist] Fallback to draft.svg after blob failure.');
          loadExternalSVG("svg/help.svg");
        }
      });
  };

  const storePathVariants = (svgElement) => {
    window.pathVariantsMap = {};
    const allPaths = svgElement.querySelectorAll("path");
    allPaths.forEach(path => {
      const id = path.id;
      if (id && id.match(/^path-\d+-\d+$/)) {
        const baseID = id.replace(/-\d+$/, '');
        if (!window.pathVariantsMap[baseID]) window.pathVariantsMap[baseID] = [];
        window.pathVariantsMap[baseID].push(path);
      }
    });
  };

  // [svgpersist] Initialize score from sessionStorage on load
  const initializeScore = () => {
    const savedBase64 = sessionStorage.getItem("scoreBase64");

    if (savedBase64) {
      console.log('[svgpersist] Restoring previous base64 SVG.');
      loadExternalSVG(savedBase64);
    } else {
      console.log('[svgpersist] No saved SVG found. Loading default draft.svg.');
      loadExternalSVG("svg/help.svg");
    }
  };

  
  initializeScore(); // ⬅️ Make sure this runs outside any event listener

  // [svgpersist] Upload and persist new SVG to sessionStorage
  document.getElementById("upload-score").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return alert("Please select a file.");

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result;
      sessionStorage.setItem("scoreBase64", base64);
      console.log(`[svgpersist] New SVG uploaded. Persisted length: ${base64.length}`);
      loadExternalSVG(base64);
    };
    reader.readAsDataURL(file);
  });


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

const initializeSVG = (svgElement) => {

  // 🔍 Ensure we received a valid SVG element before continuing
  if (!svgElement) {
    console.error("[ERROR] No SVG element provided to initializeSVG.");
    return;
  }

  // 📦 Store global reference to the SVG for later use
  window.scoreSVG = svgElement;

  // 🧠 Assign cue IDs dynamically (e.g. from assignCues(...) groups)
  // This must happen before any cue parsing or trigger handling
  console.log("calling assignCues...");
  assignCues(window.scoreSVG);    

  // ⚡ Preload timing cues like cueSpeed(...) once they exist in the DOM
  preloadSpeedCues();


    const flattenPathTranslate = (path, dx, dy) => {
      const d = path.getAttribute('d');
      if (!d) {
        //console.warn(`[TRANSFORM-FIX] Skipped path with no 'd': ${path.id}`);
        return;
      }

      if (typeof SVGPathCommander === 'undefined') {
        //console.error("[TRANSFORM-FIX] ❌ SVGPathCommander not loaded. Please include it via CDN.");
        return;
      }

      try {
        const shape = new SVGPathCommander(d);
        shape.transform({ translate: [dx, dy] });
        const newD = shape.toString();
        path.setAttribute('d', newD);

        // console.debug(`[TRANSFORM-FIX] ✅ Translated path: ${path.id}`);
        // console.debug(`[TRANSFORM-FIX] d before: ${d}`);
        // console.debug(`[TRANSFORM-FIX] d after:  ${newD}`);
      } catch (err) {
        // console.warn(`[TRANSFORM-FIX] ❌ Failed to translate path ${path.id}`, err);
      }
    };

    const applyTranslationToShape = (el, dx, dy) => {
      const tag = el.tagName.toLowerCase();

      if (tag === 'path') {
        flattenPathTranslate(el, dx, dy);
      } else if (tag === 'rect' || tag === 'use') {
        const x = parseFloat(el.getAttribute('x') || 0);
        const y = parseFloat(el.getAttribute('y') || 0);
        el.setAttribute('x', x + dx);
        el.setAttribute('y', y + dy);
        // console.debug(`[TRANSFORM-FIX] Moved <${tag}> ${el.id || ''} to (${x + dx}, ${y + dy})`);
      } else if (tag === 'circle' || tag === 'ellipse') {
        const cx = parseFloat(el.getAttribute('cx') || 0);
        const cy = parseFloat(el.getAttribute('cy') || 0);
        el.setAttribute('cx', cx + dx);
        el.setAttribute('cy', cy + dy);
        // console.debug(`[TRANSFORM-FIX] Moved <${tag}> ${el.id || ''} to (${cx + dx}, ${cy + dy})`);
      } else if (tag === 'line') {
        ['x1', 'y1', 'x2', 'y2'].forEach(attr => {
          const val = parseFloat(el.getAttribute(attr) || 0);
          el.setAttribute(attr, val + (attr.startsWith('x') ? dx : dy));
        });
        // console.debug(`[TRANSFORM-FIX] Moved <line> ${el.id || ''}`);
      } else if (tag === 'polyline' || tag === 'polygon') {
        const points = el.getAttribute('points') || '';
        const newPoints = points
          .trim()
          .split(/\s+/)
          .map(pair => {
            const [px, py] = pair.split(',').map(Number);
            return `${px + dx},${py + dy}`;
          })
          .join(' ');
        el.setAttribute('points', newPoints);
        // console.debug(`[TRANSFORM-FIX] Moved <${tag}> ${el.id || ''}`);
      } else if (tag === 'g') {
        Array.from(el.children).forEach(child => applyTranslationToShape(child, dx, dy));
      } else {
        // console.debug(`[TRANSFORM-FIX] Skipped unsupported element: <${tag}> ${el.id || ''}`);
      }
    };

    const flattenGroupTransform = (group) => {
      const transform = group.getAttribute('transform');
      if (!transform || !transform.startsWith("translate")) return;

      const match = /translate\((-?\d+(\.\d+)?)[ ,]?(-?\d+(\.\d+)?)?\)/.exec(transform);
      if (!match) {
        // console.warn(`[TRANSFORM-FIX] Could not parse transform on group: ${group.id}`);
        return;
      }

      const dx = parseFloat(match[1]);
      const dy = parseFloat(match[3] || 0);

      // console.log(`[TRANSFORM-FIX] 📦 Flattening group ${group.id} with translate(${dx}, ${dy})`);

      Array.from(group.children).forEach(child => applyTranslationToShape(child, dx, dy));
      group.removeAttribute('transform');
      // console.log(`[TRANSFORM-FIX] ✅ Removed transform from group: ${group.id}`);
    };

    // Flatten all group transforms
    svgElement.querySelectorAll('g[transform]').forEach(flattenGroupTransform);

    // Handle all <use> clones
    const useElements = svgElement.querySelectorAll('use');


    useElements.forEach(clone => {
      // Skip <use> if it is already inside a <g id^="obj_rotate_">
      if (clone.closest('[id^="obj_rotate_"]')) {
        // console.log(`[SKIP] Skipping <use id="${clone.id}"> because it's already wrapped`);
        return;
      }

      const href = clone.getAttribute('xlink:href') || clone.getAttribute('href');
      if (!href) return;

      const refId = href.replace(/^#/, '');
      const original = svgElement.querySelector(`#${CSS.escape(refId)}`);
      if (!original) return;

      // Clone the original
      const deepClone = original.cloneNode(true);
      deepClone.removeAttribute("transform"); // prevent double-transform



      // Generate a unique obj_rotate_* ID
      const uidMatch = clone.id.match(/uid(\d+)/);
      const uid = uidMatch ? uidMatch[1] : Math.floor(Math.random() * 10000);
      const rpm = (Math.random() * 2 + 0.5).toFixed(2);
      const dir = Math.random() > 0.5 ? 1 : -1;
      const rotateId = `obj_rotate_rpm_${rpm}_dir_${dir}_ease_easeInOutSine-${uid}`;

      // 🌀 Wrap the cloned content in a new rotation group
      const rotateWrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
      rotateWrapper.setAttribute("id", rotateId);
      rotateWrapper.appendChild(deepClone);

      // 🎯 Wrap the rotator in a group with the original <use>'s ID (for s_seq animation)
      const animatedGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      animatedGroup.setAttribute("id", clone.id);
      animatedGroup.appendChild(rotateWrapper);

      // 📦 Wrap everything in a positioned group using <use>'s transform
      const positionedGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      const transform = clone.getAttribute("transform");
      if (transform) {
        positionedGroup.setAttribute("transform", transform);
      }
      positionedGroup.appendChild(animatedGroup);

      // 💥 Replace the <use> with the real structure
      clone.parentNode.insertBefore(positionedGroup, clone);
      clone.remove();

      // console.debug(`[TRANSFORM-FIX] ✅ Replaced <use id="${clone.id}"> with obj_rotate=${rotateId} and transform="${transform}"`);
    });

    // 🚀 Continue with full original animation setup
    console.log("[DEBUG] Initializing SVG element:", svgElement);

    requestAnimationFrame(() => {
     window.playheadX = 0;
      window.elapsedTime = 0;
      window.scoreContainer.scrollLeft =window.playheadX;
      console.log(`[DEBUG] Initial scrollLeft set to: ${window.scoreContainer.scrollLeft}`);


      requestAnimationFrame(() => {
        window.ensureWindowPlayheadX(); // 💡 ensure valid center before any jumping logic
        initializeObjectPathPairs(svgElement);
        initializeObserver();

      });

      // initializeObjectTargetPairs(svgElement, 10); // Optional
      initializeRotatingObjects(svgElement);
      initializeScalingObjects(svgElement);
      // requestAnimationFrame(() => {
      //   window.startAllVisibleAnimations();
      // });

      initializeObserver();


      console.log("[DEBUG] Animation setup complete. Running detection and observer.");
      detectExistingAnimations();
      observeAnimations();

      console.log("[DEBUG] 🛠️ Calling extractScoreElements...");
      const startTime = performance.now();
      extractScoreElements(svgElement);
      const endTime = performance.now();
      console.log(`[DEBUG] ⏳ extractScoreElements executed in ${(endTime - startTime).toFixed(2)}ms`);
      console.log("[DEBUG] ✅ Extracted Score Elements. Now Checking Sync...");

      console.log("[CLIENT] 🤖 Finished extractScoreElements. Checking for pending repeat state...");

      tryApplyPendingRepeatState();

      if (pendingRepeatStateMap) {
        console.log("[CLIENT] 🔁 Applying stored repeat state map after cues loaded.");
        handleRestoredRepeatState(pendingRepeatStateMap, cues);
        pendingRepeatStateMap = null;
      }


      console.log("\n🚀 [DEBUG] Page Loaded - Initial State:");
      logState("Initial Load");

      updateSeekBar();
      //updatestopwatch();
      toggleScoreNotes();

      setTimeout(() => {
        // rewindToStart(); // Optional
      }, 100);
    });
  };




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
        event.stopPropagation(); // Prevent bubbling if required
        handleSvgPopupClick(event); // Handle the popup logic or trigger relevant actions
      });
    });

    // Ensure SVG elements are interactive (in case of CSS conflicts)
    svgAnimationElement.style.pointerEvents = 'all';
    svgAnimationElement.querySelectorAll('*').forEach((child) => {
      child.style.pointerEvents = 'all';
    });

    console.log('[DEBUG] SVG interactions initialized successfully.');
  };


  // TODO: USE THIS FEATURE
  // Call this function to initialize
  initializeSvgInteractions();


  const handleSvgPopupClick = (event) => {
    console.log(`[DEBUG] SVG Click Detected on: ${event.target.tagName}, ID: ${event.target.id}`);
  
    // ✅ Skip handling if click is inside Shoelace menu or dropdown
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
      console.log('[DEBUG] No active popups found to dismiss.');
    }
  
    event.stopPropagation();
  };
  



  // // Add listeners for SVG animations
  const svgAnimationElement = document.getElementById('svg-animation');
  if (svgAnimationElement) {
    svgAnimationElement.addEventListener('click', (event) => {
      console.log(`[DEBUG] SVG animation clicked: ${event.target.id}`);
      handleSvgPopupClick(event);
    });
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('.animation-popup')) {
      console.log(`[DEBUG] Click detected on animation popup: ${event.target.id}`);
    }
  });

  // Add global event listener for dismissing popups
  document.addEventListener('click', (event) => {
    console.log(`[DEBUG] Document clicked at (${event.clientX}, ${event.clientY}) on element:`, event.target);
    handleSvgPopupClick(event);
  });



  document.addEventListener("DOMContentLoaded", function () {
    const popup = document.getElementById("animejs-content");

    document.addEventListener("click", function (event) {
      if (popup && !popup.contains(event.target)) {
        popup.style.display = "none"; // Hide the popup when clicking outside
      }
    });

    popup.addEventListener("click", function (event) {
      event.stopPropagation(); // Prevents click inside popup from closing it
    });
  });


  let controlsTimeout; // Timer to hide controls after inactivity

  const hideControls = () => {
    const controls = document.getElementById('controls');
    const topBar = document.getElementById('top-bar'); // ✅ Include top-bar

    controls.classList.add('dismissed');
    if (topBar) topBar.classList.add('dismissed'); // ✅ Hide top-bar

    console.log('Controls hidden.');
  };

  const showControls = () => {
    const controls = document.getElementById('controls');
    const topBar = document.getElementById('top-bar'); // ✅ Include top-bar

    controls.classList.remove('dismissed');
    if (topBar) topBar.classList.remove('dismissed'); // ✅ Show top-bar
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
    extractScoreElements(svgElement);
    const endTime = performance.now();
    console.log(`[DEBUG] ⏳ extractScoreElements executed in ${(endTime - startTime).toFixed(2)}ms`);
    console.log("[DEBUG] ✅ Extracted Score Elements. Now Checking Sync...");


    console.log("[DEBUG] Resize detected, recalculating maxScrollDistance and aligning playhead...");
    calculateMaxScrollDistance();
  });

  //document.addEventListener('fullscreenchange', adjustscoreContainerHeight);
  // Show controls on user interaction in fullscreen mode
  let hideControlsTimeout; // Store timeout reference

  document.addEventListener('mousemove', () => {
    showControls(); // ✅ Show controls on mouse move

    // ✅ Clear any existing timeout before starting a new one
    clearTimeout(hideControlsTimeout);

    // ✅ Set a new timeout to hide controls after 5 seconds
    hideControlsTimeout = setTimeout(() => {
      hideControls();
    }, 5000);

  });// document.addEventListener('keydown', showControls);   // Show controls on key press

  // Show controls on user interaction in fullscreen mode

  document.addEventListener('mousemove', () => {
    if (document.fullscreenElement) {
      showControls(); // ✅ Show controls on mouse move

      // ✅ Clear any existing timeout before starting a new one
      clearTimeout(hideControlsTimeout);

      // ✅ Set a new timeout to hide controls after 5 seconds
      hideControlsTimeout = setTimeout(() => {
        hideControls();
      }, 5000);
    }
  });

  document.addEventListener('keydown', (event) => {
    // ✅ Ignore arrow keys & spacebar when seeking or pausing
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === " ") {
      return; // ✅ Do nothing, skip showing controls
    }

    // ✅ Show controls for other key presses
    showControls();

    // ✅ Hide controls after 5 seconds
    setTimeout(() => {
      hideControls();
    }, 5000);

  });

  // /////// START OF SPEED LOGIC ///////////////////////////////////////////////////

  // window.speedMultiplier = 1.0;

  // /**
  // * Handles speed cue changes by setting and synchronizing the speed multiplier.
  // * Ensures speed changes are only applied when valid and different from the current value.
  // * Updates the UI and sends the new speed multiplier to the server if changed manually.
  // */

  // const handleSpeedCue = (cueId, newMultiplier) => {
  //   /**
  //   * ✅ Processes `cueSpeed` messages from clients.
  //   * - Extracts and validates the speed multiplier before applying.
  //   * - Prevents redundant updates by checking the current speed.
  //   * - Sends a WebSocket message only if speed changes.
  //   */
  //   console.log(`[DEBUG] 🎯 Triggering Speed Cue: ${cueId}`);

  //   // ✅ Ensure multiplier is a valid positive number
  //   newMultiplier = parseFloat(newMultiplier.toFixed(1));
  //   if (isNaN(newMultiplier) || newMultiplier <= 0) {
  //     console.warn(`[WARNING] ❌ Invalid speed multiplier detected: ${cueId}`);
  //     return;
  //   }

  //   // ✅ Prevent redundant updates
  //   if (speedMultiplier === newMultiplier) {
  //     console.log(`[DEBUG] ⚠️ Speed is already set to ${speedMultiplier}. No update needed.`);
  //     return;
  //   }

  //   window.speedMultiplier = newMultiplier;
  //   console.log(`[DEBUG] ✅ Speed multiplier set to ${speedMultiplier}`);
  //   window.updateSpeedDisplay();

  //   // ✅ Send update to WebSocket only if it was not from a sync message
  //   if (wsEnabled && socket && socket.readyState === WebSocket.OPEN && !incomingServerUpdate) {
  //     const speedMessage = {
  //       type: "set_speed_multiplier",
  //       multiplier: window.speedMultiplier,
  //       timestamp: Date.now(),
  //     };

  //     window.socket.send(JSON.stringify(speedMessage));
  //     console.log(`[DEBUG] 📡 Sent speed update to server:`, speedMessage);
  //   }
  // };


  // // /**
  // // * Determines the correct speed multiplier when seeking to a new position.
  // // * Finds the most recent speed cue before the playhead and applies its value.
  // // * Resets to the default speed (1.0) if no previous speed cue is found.
  // // */

  // // const getSpeedForPosition = (xPosition) => {

  // //   const viewportOffset = window.scoreContainer.offsetWidth / 2; // ✅ Center offset
  // //   const adjustedPlayheadX = xPosition + viewportOffset; // ✅ Align with visual playhead

  // //   console.log(`[DEBUG] Looking for speed at adjusted position: ${adjustedPlayheadX} (window.playheadX: ${xPosition})`);
  // //   //console.log("[DEBUG] Current speedCueMap:", speedCueMap);

  // //   if (speedCueMap.length === 0) {
  // //     console.warn("[WARNING] No speed cues exist. Defaulting to 1.0x speed.");
  // //     return 1.0;
  // //   }

  // //   let lastSpeedCue = speedCueMap
  // //     .filter(cue => cue.position <= adjustedPlayheadX)
  // //     .slice(-1)[0];

  // //   if (lastSpeedCue) {
  // //     console.log(`[DEBUG] ✅ Applying Speed: ${lastSpeedCue.multiplier} (From Cue at ${lastSpeedCue.position})`);

  // //     window.speedMultiplier = lastSpeedCue.multiplier; // ✅ Ensure it is stored globally
  // //     window.updateSpeedDisplay();

  // //     return window.speedMultiplier;
  // //   } else {
  // //     console.log("[DEBUG] ❗ No previous speed cue found, defaulting to 1.0");
  // //     return 1.0;
  // //   }
  // // };




  // // /**
  // // * Preloads all speed cues from the score and stores them in a sorted list.
  // // * Extracts speed values and their positions to enable accurate speed restoration.
  // // * Ensures correct speed lookup when seeking by sorting cues by position.
  // // */

  // // const preloadSpeedCues = () => {
  // //   speedCueMap = []; // Reset stored cues

  // //   // ✅ Find all speed cues in the score
  // //   document.querySelectorAll('[id^="speed_"]').forEach(element => {
  // //     const cueId = element.id;
  // //     const match = cueId.match(/speed_(\d+(\.\d+)?)/); // Support floats

  // //     if (match) {
  // //       const speedValue = parseFloat(match[1]);
  // //       const cuePosition = getCuePosition(element); // Function to determine X position

  // //       speedCueMap.push({ position: cuePosition, multiplier: speedValue });
  // //     }
  // //   });

  // //   // ✅ Sort cues by position to ensure correct lookup when seeking
  // //   speedCueMap.sort((a, b) => a.position - b.position);

  // //   console.log("[DEBUG] Preloaded speed cues:", speedCueMap);
  // // };



  // /**
  // * Handles speed multiplier adjustments via keyboard shortcuts and UI buttons.
  // * Updates the display and syncs changes with the server if WebSocket is enabled.
  // */

  // document.addEventListener('keydown', (event) => {
  //   switch (event.key) {
  //     case '+':
  //       window.speedMultiplier = Math.min(speedMultiplier + 0.1, 3);
  //       console.log(`[DEBUG] Speed multiplier increased to ${speedMultiplier}`);

  //       if (wsEnabled && socket) {
  //         window.socket.send(JSON.stringify({ type: 'set_speed_multiplier', multiplier: window.speedMultiplier }));
  //         console.log(`[CLIENT] Sent speed multiplier change to server: ${speedMultiplier}`);
  //       }
  //       break;

  //     case '-':
  //       window.speedMultiplier = Math.max(speedMultiplier - 0.1, 0.1);
  //       console.log(`[DEBUG] Speed multiplier decreased to ${speedMultiplier}`);

  //       if (wsEnabled && socket) {
  //         window.socket.send(JSON.stringify({ type: 'set_speed_multiplier', multiplier: window.speedMultiplier }));
  //         console.log(`[CLIENT] Sent speed multiplier change to server: ${speedMultiplier}`);
  //       }
  //       break;

  //     default:
  //       break;
  //   }
  // });

  // document.getElementById("increaseSpeed").addEventListener("click", () => {
  //   window.speedMultiplier = Math.min(speedMultiplier + 0.1, 3.0); // Limit to 3x speed
  //   window.updateSpeedDisplay();
  // });

  // document.getElementById("decreaseSpeed").addEventListener("click", () => {
  //   window.speedMultiplier = Math.max(speedMultiplier - 0.1, 0.5); // Limit to 0.5x speed
  //   window.updateSpeedDisplay();
  // });

  // document.getElementById("resetSpeed").addEventListener("click", () => {
  //   window.speedMultiplier = 1.0;
  //   window.updateSpeedDisplay();
  // });

  // function window.updateSpeedDisplay() {
  //   document.getElementById("speedDisplay").textContent = `${speedMultiplier.toFixed(1)}×`;
  //   sendSpeedUpdateToServer(speedMultiplier);

  // }

  // function sendSpeedUpdateToServer(speed) {
  //   if (!window.socket || window.socket.readyState !== WebSocket.OPEN) {
  //     console.warn("[WARNING] WebSocket not available. Skipping speed update.");
  //     return;
  //   }
  //   window.socket?.send(JSON.stringify({ type: "speedUpdate", speed }));
  // }

  /////// END OF SPEED LOGIC /////////////////////////////////////////////////////




  svgFileInput.addEventListener('change', (event) => {
    console.log('SVG file input change detected.');
    const file = event.target.files[0];
    if (file && file.type === 'image/svg+xml') {
      const reader = new FileReader();

      reader.onload = (e) => {
        console.log('SVG file loaded. Passing to external loader...');
        loadExternalSVG(e.target.result);
      };

      reader.onerror = (err) => {
        console.error('Error reading file:', err);
      };

      reader.readAsDataURL(file); // Read file as Data URL
    } else {
      console.error('Invalid file type. Please upload an SVG.');
    }
  });


  ///////////////////////////////////////////////////////////////////////////////

  /**
  * Dynamically recalculates the max scrollable distance of the score.
  * Uses the actual rendered width of the SVG to ensure accuracy.
  * Adjustswindow.playheadX proportionally to prevent scaling misalignment.
  * Uses window.scoreContainer width instead of viewport width for scaling calculations.
  * Rounds scrollLeft to prevent sub-pixel rendering issues.
  * Ensures smooth and precise playhead alignment after resizing.
  */

  let previousViewportWidth = window.scoreContainer.offsetWidth; // Track score container width
  let previousMaxScrollDistance = null; // Track last max scroll distance

  const calculateMaxScrollDistance = () => {
    const svgElement = document.querySelector('svg');

    if (!window.scoreContainer || !svgElement) {
      console.warn("[WARNING] Missing scoreContainer or SVG, cannot calculate maxScrollDistance.");
      return;
    }

    // Get actual rendered width of the SVG instead of viewBox
    // const svgWidth = svgElement.getBoundingClientRect().width;
    const svgWidth = svgElement.viewBox.baseVal.width;


    // Detect scale changes using scoreContainer width instead of viewport width
    const newScoreContainerWidth = window.scoreContainer.offsetWidth;
    const scaleRatio = newScoreContainerWidth / previousViewportWidth;

    // Update max scroll distance to the new SVG width
    maxScrollDistance = svgWidth;

    console.log(`[DEBUG] 📏 Updated maxScrollDistance: ${maxScrollDistance} (SVG Rendered Width: ${svgWidth})`);

    // Adjustwindow.playheadX using proportional scaling
    if (previousMaxScrollDistance !== null && previousMaxScrollDistance > 0) {
      let playheadPercentage =window.playheadX / previousMaxScrollDistance;
     window.playheadX = playheadPercentage * maxScrollDistance;
      console.log(`[DEBUG] 🔄 Recalculatedwindow.playheadX: ${window.playheadX}`);
    }

    // Update stored values
    previousMaxScrollDistance = maxScrollDistance;
    previousViewportWidth = newScoreContainerWidth;

    window.scoreContainer.scrollLeft =window.playheadX;
    console.log(`[DEBUG] 🎯 Updated window.scoreContainer.scrollLeft: ${window.scoreContainer.scrollLeft}`);
  };

  ///////////////////////////////////////////////////////////////////////////////




  /**
  * ✅ Handles real-time synchronization of playback state.
  * - Updates `playheadX`, `elapsedTime`, and playback status from the server.
  * - Prevents unnecessary UI updates when paused or seeking.
  * - Ensures smooth scrolling and accurate position tracking.
  */

  const syncState = (state) => {
    if (!state || typeof state !== "object") return;

    console.log(`[DEBUG] 🔄 WebSocket Sync Received - window.playheadX=${state.playheadX},  window.isPlaying=${state.isPlaying}, window.scoreWidth=${state.scoreWidth}`);

    if (!isNaN(state.playheadX) && state.playheadX >= 0) {
      if (!window.isSeeking) {
        window.playheadX = state.playheadX;
        //
        // // ✅ Ensure window.playheadX is properly adjusted after a screen resize
        // if (window.recentlyRecalculatedPlayhead) {
        //     const widthRatio = window.innerWidth / previousScreenWidth;
        //     window.playheadX *= widthRatio;
        //     console.log(`[DEBUG] 🔄 Adjusted window.playheadX after resize: ${window.playheadX}`);
        // }

        window.scoreContainer.scrollLeft = Math.max(0, window.playheadX);
        console.log(`[DEBUG] Updated window.scoreContainer.scrollLeft=${window.scoreContainer.scrollLeft}`);

        // ✅ Also update window.playheadX (SVG space at center of screen)
        const svg = document.querySelector("svg");
        if (svg) {
          const svgPoint = svg.createSVGPoint();
          svgPoint.x = window.innerWidth / 2;
          svgPoint.y = 0;
          const playheadSVG = svgPoint.matrixTransform(svg.getScreenCTM().inverse());
          window.playheadX = playheadSVG.x;
          console.log(`[syncState] 🧭 Updated window.playheadX = ${window.playheadX.toFixed(2)} (SVG space)`);
        }
        console.log(`[DEBUG] Updated window.scoreContainer.scrollLeft=${window.scoreContainer.scrollLeft}`);
      } else {
        console.log("[DEBUG] Skipping window.playheadX update from syncState during seeking.");
      }
    }

     window.isPlaying = state.isPlaying;
     window.isPlaying ? startAnimation() : stopAnimation();

    if (wsEnabled && socket) {
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
  * ✅ Freewheeling: Smoothly estimates `playheadX` between sync updates.
  * - Runs continuously on `requestAnimationFrame()`.
  * - Uses last sync position and estimated playback speed.
  * - Keeps UI smoothly animating even if no sync update is received.
  */

  const estimatePlayheadPosition = () => {
    console.log(`[DEBUG] estimatePlayheadPosition() running at ${Date.now()}`);

    if (!window.isPlaying || !freewheelingActive) {
      console.log("[DEBUG] Freewheeling stopped.");
      freewheelingActive = false;
      return;
    }

    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTime;

    // ✅ Calculate estimated position based on playback speed
    const estimatedIncrement = ((timeSinceLastSync / 1000) * window.speedMultiplier) * pixelsPerSecond;
    window.estimatedPlayheadX = lastSyncPlayheadX + estimatedIncrement;

    // ✅ Ensure window.playheadX stays within valid bounds
    if (window.estimatedPlayheadX > window.scoreWidth) window.estimatedPlayhe4adX = window.scoreWidth;
    window.playheadX =window.estimatedPlayheadX;
    window.scoreContainer.scrollLeft = window.playheadX;

    // ✅ Auto-correct small desyncs based on server sync updates
    if (Math.abs(window.playheadX - serverSyncPlayheadX) > 50) {
      console.log("[DEBUG] Auto-correcting window.playheadX due to drift.");
      window.playheadX = serverSyncPlayheadX;
    }

    // ✅ Throttle debug logs to avoid spamming console
    if (now - lastDebugLog > 500) {
      console.log(`[DEBUG] Freewheeling Playhead: ${window.playheadX}`);
      lastDebugLog = now;
    }

    // ✅ Keep freewheeling running
    requestAnimationFrame(estimatePlayheadPosition);
  };






  /**
  * ✅ Wrapped `syncState()` to prevent sync updates during manual pause.
  * - Ensures user-initiated pauses are not overridden by server sync messages.
  */
  const wrappedSyncState = (state) => {
    if (ignoreSyncDuringPause) {
      console.log("[CLIENT] Ignoring sync during pause.");
      return;
    }
    syncState(state);
  };



  //TODO maybe no longer needed
  const correctDrift = (serverElapsedTime) => {
    const driftThreshold = 50; // Allowable drift in milliseconds
    const drift = serverElapsedTime - window.elapsedTime;

    if (Math.abs(drift) > driftThreshold) {
      //console.log([CLIENT] Correcting drift. Server: ${serverElapsedTime}, Local: ${elapsedTime}, Drift: ${drift});

      // Smoothly adjust window.elapsedTime using a weighted approach
      window.elapsedTime += drift * 0.1; // Adjust factor to balance smoothness vs speed
    }
  };


  window.lastAnimationFrameTime = null;

  window.animate = async (currentTime) => {
    if (!window.isPlaying || window.isSeeking) {
      // console.log("[DEBUG] Animation stopped mid-frame.");
      return;
    }

    if (window.lastAnimationFrameTime === null) {
      window.lastAnimationFrameTime = currentTime;
    } else {
      const delta = (currentTime - window.lastAnimationFrameTime) * playbackSpeed;


      // const window.speedMultiplier = 2; // Double the speed

      // ✅ Predict new window.playheadX assuming constant playback speed
      const estimatedIncrement = ((delta * window.speedMultiplier) / window.duration) * window.scoreWidth;
      window.estimatedPlayheadX = window.playheadX + estimatedIncrement;

      // ✅ Ensure window.playheadX stays within valid bounds
      window.estimatedPlayheadX = Math.max(0, Math.min(window.estimatedPlayheadX, window.scoreWidth));

      window.playheadX = window.estimatedPlayheadX;
      window.scoreContainer.scrollLeft =window.playheadX;

      //console.log(`[DEBUG] Frame update - delta: ${delta}ms,window.estimatedPlayheadX: ${estimatedPlayheadX}, window.scoreContainer.scrollLeft: ${window.scoreContainer.scrollLeft}`);
    }

    window.lastAnimationFrameTime = currentTime;

    // ✅ Ensure visibility detection runs inside the frame update
    // ✅ Throttle visibility check to every 150ms
    const visibilityCheckInterval = 150;
    window.lastVisibilityCheckTime = window.lastVisibilityCheckTime || 0;

    if (currentTime - window.lastVisibilityCheckTime > visibilityCheckInterval) {
      window.checkAnimationVisibility();
      window.lastVisibilityCheckTime = currentTime;
    }

    // ✅ Ensure score movement matcheswindow.playheadX
    updatePosition();
    updateSeekBar();
    //updatestopwatch();
    await checkCueTriggers (window.elapsedTime);

    requestAnimationFrame(animate);
  };


  // Manages the playback animation loop, updating position, seek bar, and cues in real-time.
  // Uses requestAnimationFrame to ensure smooth, efficient animations synchronized with screen refresh.
  // Prevents unnecessary updates when paused, seeking, or stopped to optimize performance.
  // stopAnimation() cancels the loop when playback stops, preventing redundant frame updates.

  window.startAnimation = () => {
    if (!window.isPlaying || window.animationPaused || window.isSeeking) {
      console.log("[DEBUG] Animation paused, stopped, or seeking, skipping start.");
      return;
    }
  
    requestAnimationFrame((time) => {
      window.lastAnimationFrameTime = time;
      animate(time);
    });
  };
  
  window.stopAnimation = () => {
    if (window.animationFrameId !== null) {
      cancelAnimationFrame(window.animationFrameId);
      window.animationFrameId = null;
      console.log("[DEBUG] Animation frame canceled.");
    }
  
    window.isPlaying = false;
    window.isMusicalPause = false;
    stopStopwatch();
  };
  




  let isJumpingToMark = false; // ✅ Prevents unwanted position overrides












  // TODO maybe this can be removed now
  //
  // const updateAlignment =  (window.elapsedTime) => {
  //   const svgElement = document.querySelector('#window.scoreContainer svg'); // Ensure correct selector
  //   if (!svgElement) {
  //     console.error("[ERROR] SVG element not found. Skipping alignment.");
  //     return; // Exit function if no SVG element
  //   }
  //   const duration = 20 * 60 * 1000; // 20 minutes in milliseconds
  //   const progress = window.elapsedTime / duration; // Fraction of time elapsed
  //   const scorePosition = maxScrollDistance * progress; // Position in pixels
  //
  //   // Scale the offset correction dynamically
  //   const baseOffset = -43; // Observed correction at 30 seconds
  //   const scaledOffset = baseOffset * (scorePosition / (maxScrollDistance * (30000 / duration))); // Scaled
  //
  //   const newLeft = -scorePosition + window.innerWidth / 2 + scaledOffset; // Centering with correction
  //   svgElement.style.transform = `translateX(${newLeft}px)`; // Apply alignment
  //   //console.log(`Elapsed Time: ${elapsedTime}, TranslateX: ${newLeft}px`);
  // };

  ///////////////////////////////////////
  // SEEKBAR LOGIC

  const updateSeekBar = () => {
    const progress =  (window.elapsedTime / duration) * 100;
    seekBar.value = progress;
  };

  // Function to synchronize playback time
  // Updates `elapsedTime` and aligns the score
  // Ensures correct positioning and checks for active cues.
  const setElapsedTime = (newTime) => {
    window.elapsedTime = newTime; // ✅ Update playback time
    updatePosition(window.playheadX); // ✅ Use the correct playhead position

    checkCueTriggers(window.elapsedTime); // ✅ Recheck cues
  };


  //// SEEKING LOGIC ///////////////////////////////////////////

  // Starts seeking mode when the user clicks the seek bar.
  // Pauses playback to allow smooth scrubbing.
  seekBar.addEventListener('mousedown', () => {
    window.isSeeking = true; // ✅ Start seeking mode
    stopAnimation(); // ✅ Pause playback
    console.log("[CLIENT] Playback paused for seeking.");
  });

  // Updates playback time as the user moves the seek bar.
  // Converts percentage → time → X position for correct alignment.
  seekBar.addEventListener('input', (event) => {
    const newTime = (parseInt(event.target.value, 10) / 100) * duration; // ✅ Convert percentage to time
    setElapsedTime(newTime); // ✅ Adjust playback position

    // ✅ Real-time UI updates
    updatePosition(window.playheadX); // ✅ Ensure proper alignment
    updateSeekBar();
    //updatestopwatch();
  });

  // Ends seeking mode and re-enables cues after debounce.
  // Sends a WebSocket `jump` message to sync all connected clients.

  let seekDebounceTime = 300; // ✅ Adjust debounce as needed
  let seekingTimeout = null;

  seekBar.addEventListener('mouseup', (event) => {
    window.isSeeking = false; // ✅ Stop seeking mode
    console.log("[CLIENT] Seeking ended. Applying debounce before re-enabling cues.");

    // ✅ Debounce before re-enabling cues
    if (seekingTimeout) clearTimeout(seekingTimeout);
    seekingTimeout = setTimeout(() => {
      console.log("[CLIENT] Cue triggering re-enabled after debounce.");
       window.isPlaying = true;
       window.isMusicalPause = false;
      startStopwatch();
      startAnimation();

      // ✅ Send WebSocket sync to ensure all clients align
      if (wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
        window.socket?.send(JSON.stringify({ type: 'jump', playheadX: window.playheadX, 
          elapsedTime: window.elapsedTime }));
        console.log(`[CLIENT] Sent jump message to server after seek. Elapsed Time: ${elapsedTime}`);
      }
    }, seekDebounceTime); // ✅ Wait before enabling cues
  });

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


  // 🔁 Early repeat escape when clicking the count box
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


  function tryApplyPendingRepeatState(retries = 5) {
    if (pendingRepeatStateMap && cues.length > 0) {
      console.log("[CLIENT] 🔁 Deferred repeat state applied!");
      handleRestoredRepeatState(pendingRepeatStateMap, cues);
      pendingRepeatStateMap = null;
    } else if (retries > 0) {
      console.log("[CLIENT] ⏳ Waiting to apply repeat state...");
      setTimeout(() => tryApplyPendingRepeatState(retries - 1), 300);
    } else {
      console.warn("[CLIENT] ❌ Gave up on applying repeat state — cues not ready.");
    }
  }

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

  let ignoreRewindOnStartup = false; // ✅ Prevents unnecessary resets
  let suppressSync = false;

  const rewindToStart = () => {
    console.log("[DEBUG] Rewinding to start.");
  
    window.playheadX = 0;
    window.elapsedTime = 0;
    resetStopwatch(); // ✅ Reset stopwatch
  
    window.scoreContainer.scrollLeft = Math.max(0, window.playheadX);
    window.speedMultiplier = getSpeedForPosition(window.playheadX);
    window.updateSpeedDisplay();
  
    updatePosition();
    updateSeekBar();
  
    suppressSync = true;
  
    if (wsEnabled && window.socket.readyState === WebSocket.OPEN) {
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

  const rewind = () => {
    const REWIND_INCREMENT_X = (1000 / duration) * window.scoreWidth; // ✅ Convert time step into X coordinate shift
   window.playheadX = Math.max(window.playheadX - REWIND_INCREMENT_X, 0);

    window.scoreContainer.scrollLeft =window.playheadX;
    // console.log(`[DEBUG] Rewind applied. Newwindow.playheadX: ${window.playheadX}`);

    // ✅ Calculate `elapsedTime` based on `playheadX` for reference
    window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;
    // console.log(`[DEBUG] Synced elapsedTime fromwindow.playheadX: ${elapsedTime}`);

    if (triggeredCues) {
      triggeredCues.clear(); // ✅ Ensure cues retrigger after rewind
      // console.log("[DEBUG] Cleared triggered cues due to rewind.");
    }

    // ✅ Apply and store correct speed based on the new playhead position
    window.speedMultiplier = getSpeedForPosition(window.playheadX);
    // console.log(`[DEBUG] After rewind, applying speed: ${speedMultiplier}`);
    window.updateSpeedDisplay();

    updatePosition();
    updateSeekBar();
    //updatestopwatch();

    if (wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
      window.socket?.send(JSON.stringify({ type: 'jump', playheadX: window.playheadX, 
        elapsedTime: window.elapsedTime }));
    }
  };


  /**
  * ✅ Moves forward by a fixed distance on the score based on `playheadX`.
  * - Ensures smooth cue retriggering after advancing.
  * - Updates UI elements and syncs with the server.
  */

  const forward = () => {
    const FORWARD_INCREMENT_X = (1000 / duration) * window.scoreWidth; // ✅ Convert time step into X coordinate shift
   window.playheadX = Math.min(window.playheadX + FORWARD_INCREMENT_X, window.scoreWidth);

    window.scoreContainer.scrollLeft =window.playheadX;
    console.log(`[DEBUG] Forward applied. Newwindow.playheadX: ${window.playheadX}`);

    // ✅ Calculate `elapsedTime` based on `playheadX` for reference
    window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;
    console.log(`[DEBUG] Synced window.elapsedTime fromwindow.playheadX: ${elapsedTime}`);

    if (triggeredCues) {
      triggeredCues.clear(); // ✅ Ensure cues retrigger after forward
      console.log("[DEBUG] Cleared triggered cues due to forward.");
    }

    // ✅ Apply and store correct speed based on the new playhead position
    window.speedMultiplier = getSpeedForPosition(window.playheadX);
    console.log(`[DEBUG] After rewind, applying speed: ${speedMultiplier}`);
    window.updateSpeedDisplay();


    updatePosition();
    updateSeekBar();
    //updatestopwatch();


    if (wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
      window.socket?.send(JSON.stringify({ type: 'jump', playheadX: window.playheadX, 
        elapsedTime: window.elapsedTime }));
    }
  };


  const toggleHelp = () => {
    if (splash.style.display === 'none') {
      //splash.style.display = 'grid';
      window.scoreContainer.style.display = 'none';
      controls.style.display = 'none';
    } else {
      splash.style.display = 'none';
      window.scoreContainer.style.display = 'block';
      controls.style.display = 'flex';
    }
  };

  const invertColors = () => {
    document.body.classList.toggle('inverted');
    console.log('Color scheme inverted.');
  };

  const toggleWebSocket = () => {
    wsEnabled = !wsEnabled;
    console.log(`[CLIENT] WebSocket is now ${wsEnabled ? 'enabled' : 'disabled'}.`);

    if (!wsEnabled && socket) {
      window.socket.close();
      socket = null;
    } else if (wsEnabled) {
      connectWebSocket();
    }

    wsToggleButton.textContent = wsEnabled ? 'Disable WebSocket' : 'Enable WebSocket';
  };


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

  /**
  * ✅ Ensures the playhead remains correctly aligned after a window resize or fullscreen toggle.
  * - Uses `playheadX` directly instead of recalculating from elapsedTime.
  * - Locks `scrollLeft` strictly to `playheadX`.
  * - Temporarily suppresses `syncState()` updates to prevent overrides.
  */

  // const watchPlayheadX = () => {
  //     let lastPlayheadX =window.playheadX;
  //     setInterval(() => {
  //         if (window.playheadX !== lastPlayheadX) {
  //             console.warn(`[WATCHDOG] 🚨window.playheadX changed unexpectedly: ${lastPlayheadX} → ${window.playheadX}`);
  //             lastPlayheadX =window.playheadX;
  //         }
  //     }, 50); // Check every 50ms
  // };
  // watchPlayheadX();

  // ✅ Check if the reload happened due to a resize
  console.log("[DEBUG] Page loaded, ensuring playhead is properly aligned.");

  const splashScreen = document.getElementById("splash");
  if (splashScreen) {
    splashScreen.style.display = "none"; // 🔥 Hide splash screen
  }

  const logState = () => {
    console.log(`[DEBUG] 📏 Screen Width: ${window.innerWidth}`);
    console.log(`[DEBUG] 🎵window.playheadX: ${window.playheadX}`);
    console.log(`[DEBUG] 🎯 window.scoreContainer.scrollLeft: ${window.scoreContainer.scrollLeft}`);
    console.log(`[DEBUG] 📏 Max Scroll Distance: ${maxScrollDistance}`);
    console.log(`[DEBUG] 🖥️ Current SVG Width: ${window.scoreSVG?.getAttribute('width')}`);
    console.log(`[DEBUG] 🖥️ Current SVG ViewBox: ${window.scoreSVG?.getAttribute('viewBox')}`);

    // Log the transformation matrix for the SVG elements
    console.log(`[DEBUG] Transform Matrix of first rehearsal mark: ${getMatrixString(rehearsalMarks["B"])}`);

    // Log extracted rehearsal marks' coordinates (B, C, D...)
    console.log(`[DEBUG] 📍 Rehearsal Marks Coordinates:`);
    for (const [key, value] of Object.entries(rehearsalMarks)) {
      // console.log(`[DEBUG]  ${key}: X=${value.x}, Y=${value.y}`);
    }

    // Log array of rehearsal marks for debugging
    // console.log(`[DEBUG] 🎭 Rehearsal Marks Array:`, Object.entries(rehearsalMarks));

    // Log extracted cue positions
    // console.log(`[DEBUG] 🔰 Cue Positions:`);
    cues.forEach(cue => {
      // console.log(`[DEBUG] Cue ${cue.id}: X=${cue.x}, Width=${cue.width}`);
    });

    // Track scaling adjustments
    // console.log(`[DEBUG] Scaling Factor (scaleX): ${rehearsalMarks["B"]?.scale || 1}`);
    // console.log(`[DEBUG] Recalculated X for Mark B: ${rehearsalMarks["B"]?.x}window.playheadX: ${window.playheadX} Screen Width: ${window.innerWidth} `);
    // console.log(`[DEBUG] Recalculated Y for Mark B: ${rehearsalMarks["B"]?.y}`);

    // Log the element count for rehearsal marks and cues
    console.log(`[DEBUG] 🎭 Number of Rehearsal Marks: ${Object.keys(rehearsalMarks).length}`);
    console.log(`[DEBUG] 🔰 Number of Cues: ${cues.length}`);

    // Log state of animation
    console.log(`[DEBUG] 🔄 Animation state: ${window.isPlaying ? "Playing" : "Paused"}`);
    console.log(`[DEBUG] 🧮 Elapsed Time: ${elapsedTime}`);
    console.log(`[DEBUG] 🕰️ Last animation frame time: ${window.lastAnimationFrameTime}`);

    // Log SVG Element states
    console.log(`[DEBUG] 🎨 SVG File: ${window.scoreSVG?.id || 'No SVG loaded'}`);
    console.log(`[DEBUG] 🖥️ SVG Scroll Position (scrollLeft): ${window.scoreContainer.scrollLeft}`);

    // Log state of WebSocket
    console.log(`[DEBUG] 🌐 WebSocket State: ${wsEnabled ? 'Enabled' : 'Disabled'}`);
    console.log(`[DEBUG] 🔗 WebSocket Connection Open: ${socket && socket.readyState === WebSocket.OPEN}`);

    // Log sync related variables
    console.log(`[DEBUG] 🕹️ Sync State - Elapsed Time: ${elapsedTime}`);
    console.log(`[DEBUG] 🔄window.playheadX during Sync: ${window.playheadX}`);

    // Log viewport adjustments
    console.log(`[DEBUG] 🖥️ Fullscreen Mode: ${document.fullscreenElement ? "Enabled" : "Disabled"}`);
    console.log(`[DEBUG] 🔍 Current Screen Orientation: ${window.innerWidth > window.innerHeight ? 'Landscape' : 'Portrait'}`);

    // Log screen resizing adjustments
    console.log(`[DEBUG] 🌐 Max Scroll Distance: ${maxScrollDistance}`);
    console.log(`[DEBUG] 🎯 ScrollLeft after resize: ${window.scoreContainer.scrollLeft}`);

    // Log status of paused elements
    console.log(`[DEBUG] 🚦 Is Animation Paused? ${animationPaused ? "Yes" : "No"}`);
    console.log(`[DEBUG] ⏸️ Animation Frame Id: ${animationFrameId || 'None'}`);

    // Log playback speed
    console.log(`[DEBUG] 🏃 Playback Speed Multiplier: ${playbackSpeed}`);

  };

  // Utility function to get the matrix string for debugging
  const getMatrixString = (mark) => {
    if (!mark || !mark.matrix) return "No matrix data";
    // return `scaleX: ${mark.matrix.a}, translateX: ${mark.matrix.e}`;
  };



  // Ensure the popup starts hidden
  scoreOptionsPopup.classList.add('hidden');
  console.log('Score Options popup initialized as hidden');

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

  const toggleScoreOptionsPopup = () => {
    const scoreOptionsPopup = document.getElementById('score-options-popup');
    if (scoreOptionsPopup.classList.contains('hidden')) {
      console.log("[CLIENT] Showing score options popup.");
      scoreOptionsPopup.classList.remove('hidden');
    } else {
      console.log("[CLIENT] Hiding score options popup.");
      scoreOptionsPopup.classList.add('hidden');
    }
  };




  const toggleScoreNotesPopup = () => {
    const toggleScoreNotesPopup = document.getElementById('score-notes-popup');
    if (toggleScoreNotesPopup.classList.contains('hidden')) {
      console.log("[CLIENT] Showing score notes.");
      toggleScoreNotesPopup.classList.remove('hidden');
    } else {
      console.log("[CLIENT] Hiding score notes.");
      toggleScoreNotesPopup.classList.add('hidden');
    }
  };



  const toggleProgrammeNotePopup = () => {
    const programmeNotePopup = document.getElementById('programme-popup');
    if (programmeNotePopup.classList.contains('hidden')) {
      console.log("[CLIENT] Showing score options popup.");
      programmeNotePopup.classList.remove('hidden');
    } else {
      console.log("[CLIENT] Hiding ProgrammeNotePopup.");
      programmeNotePopup.classList.add('hidden');
    }
  };

  ////////  END OF UTIL //////////////////////////////////////////////




  // Set this to true for debugging
  const debugMode = true;


  /**
  * Extracts rehearsal marks and cue positions from the score SVG.
  * Converts their positions to absolute coordinates for accurate playback control.
  * Calls `preloadSpeedCues()` to ensure speed cues are available from the start.
  * Logs detailed debug information for troubleshooting position and scaling issues.
  */

  // Global variables to store the extracted positions
  let rehearsalMarks = {};
  let cues = [];
  let speedCueMap = []; // ✅ Ensures speed cues are tracked globally

  const extractScoreElements = (svgElement) => {
    if (!svgElement) {
      console.error("[ERROR] extractScoreElements called without a valid SVG element.");
      return;
    }

    console.log("[DEBUG] 🔍 Extracting rehearsal marks and cues from SVG.");

    let newRehearsalMarks = {}; // ✅ Store new extracted marks to prevent unnecessary resets
    let newCues = [];

    // ✅ Select all relevant elements
    const elements = svgElement.querySelectorAll(
      "[id^='rehearsal_'], [id^='cue'], [id^='anchor-'], [id^='label-']"
    );
    if (elements.length === 0) {
      console.warn("[WARNING] No rehearsal marks or cues found in SVG.");
      return;
    }

    elements.forEach((element) => {
      const bbox = element.getBBox();
      const matrix = element.getCTM();
      let absoluteX = bbox.x;
      if (matrix) {
        absoluteX += matrix.e;
      }

      if (element.id.startsWith("rehearsal_")) {
        const id = element.id.replace("rehearsal_", "");
        newRehearsalMarks[id] = { x: absoluteX };
        // console.log(`[DEBUG] 🎯 Rehearsal Mark Stored: ${id}, Position: (${absoluteX})`);
      } else if (element.id.startsWith("cue") || element.id.startsWith("s_") || element.id.startsWith("anchor-")) {
        // console.log(`[DEBUG] Processing cue: ${element.id}`);
        newCues.push({ id: element.id, x: absoluteX, width: bbox.width });
        // console.log(`[DEBUG] 🎯 Cue Stored: ${element.id}, X: ${absoluteX}, Width: ${bbox.width}`);
      }
    });

    // ✅ Update global variables only if new marks are found
    if (Object.keys(newRehearsalMarks).length > 0) {
      rehearsalMarks = newRehearsalMarks;
      // console.log("[DEBUG] ✅ Rehearsal marks updated.");
      // ✅ Store sorted rehearsal marks globally for all handlers to use

      if (Object.keys(newRehearsalMarks).length > 0) {
        rehearsalMarks = Object.fromEntries(
          Object.entries(newRehearsalMarks).sort((a, b) => a[1].x - b[1].x)
        );

        // console.log("[DEBUG] ✅ Global `rehearsalMarks` sorted:", rehearsalMarks);
      }

      window.sortedMarks = Object.entries(rehearsalMarks)
        .sort((a, b) => a[1].x - b[1].x)
        .map(([mark]) => mark);

      // console.log("[DEBUG] 🎭 Final sorted rehearsal marks:", sortedMarks);

    }

    //

    if (newCues.length > 0) {
      cues = newCues;
      console.log("[DEBUG] ✅ Cues updated.");
    }

    // ✅ Only set `speedCueMap` if it's empty (first-time loading)
    if (speedCueMap.length === 0) {
      console.log("[DEBUG] Loading speed cues for the first time.");

      elements.forEach((element) => {
        if (element.id.startsWith("cueSpeed_")) {
          const bbox = element.getBBox();
          const matrix = element.getCTM();
          let absoluteX = bbox.x;
          if (matrix) {
            absoluteX += matrix.e;
          }

          const match = element.id.match(/cueSpeed_([\d.]+)/);
          if (match) {
            const speedValue = parseFloat(match[1]);
            speedCueMap.push({ position: absoluteX, multiplier: speedValue });
            // console.log(`[DEBUG] Stored speed cue -> Position: ${absoluteX}, Speed: ${speedValue}`);
          }
        }
      });

      // ✅ Ensure `speedCueMap` is always sorted for correct lookups
      speedCueMap.sort((a, b) => a.position - b.position);
      console.log("[DEBUG] Final sorted speed cues:", speedCueMap);
    }

    // ✅ Call button creation only if rehearsal marks exist
    if (Object.keys(rehearsalMarks).length > 0) {
      createRehearsalMarkButtons();
    }
    window.cues = cues;

  };

  //////  end of extract score elements  /////////////////////////////////////////

  /**
  * ✅ updatePosition
  * Synchronizes the scroll position of #window.scoreContainer with the current `playheadX`.
  *
  * - Smoothly follows the playhead while seeking (fast forward/rewind).
  * - Snaps directly to `playheadX` when not seeking (e.g., on pause, jump).
  * - Minimizes DOM writes (avoids flickering from redundant updates).
  * - Throttles `startAllVisibleAnimations()` to avoid overload during seeking.
  */

  // ✅ Prevents automatic scroll updates when true (e.g., manual drag, custom control)
  let suppressViewportUpdates = false;

  // ✅ Stores the scroll position at the moment of pause — used to "hold" the view steady
  let lastPausedPlayheadX = 0;

  // ✅ Used to throttle animation restarts — avoid flooding during continuous scroll
  let lastTriggerTime = 0;

  /**
  * Main scroll update function — called during playback / interaction loop
  */
  const updatePosition = () => {
    const now = performance.now();

    if (window.isSeeking) {
      window.scoreContainer.scrollLeft += (window.playheadX - window.scoreContainer.scrollLeft) * 0.3;

      //   ✅ Throttled animation update during active seeking
      // if (now - lastTriggerTime > 250) {
      //   window.startAllVisibleAnimations();
      //   lastTriggerTime = now;
      // }

      return;
    }

    // Direct snap to playhead when not seeking
    if (Math.abs(window.scoreContainer.scrollLeft -window.playheadX) > 1) {
      window.scoreContainer.scrollLeft =window.playheadX;

      // ✅ Throttled animation update during jump or resume
      // if (now - lastTriggerTime > 250) {
      //   window.startAllVisibleAnimations();
      //   lastTriggerTime = now;
      // }
    }
  };





  // Rehearsal mark logic ////////////////////////////////////////////////////////

  /**
  * ✅ Dynamically generates and updates rehearsal mark buttons.
  * - Clears existing buttons before creating new ones to prevent duplication.
  * - Sorts rehearsal marks by position to maintain correct order in the UI.
  * - Ensures buttons correctly trigger `jumpToRehearsalMark()` when clicked.
  */
  // Global variables
  //  let rehearsalMarks = {};
   let sortedMarks = []; // ✅ Now globally available sorted marks
  //  let cues = [];

  /**
  * ✅ Dynamically generates and updates rehearsal mark buttons.
  */
  // Global variables

  /**
  * ✅ Dynamically generates and updates rehearsal mark buttons.
  */
  let lastRenderedMarks = "";

  const createRehearsalMarkButtons = () => {
    console.log("[DEBUG] Creating rehearsal mark buttons...");

    const container = document.getElementById("rehearsal-mark-container");
    if (!container) {
      console.error("[ERROR] Rehearsal mark container not found.");
      return;
    }

    const markEntries = Object.entries(rehearsalMarks);
    if (markEntries.length === 0) {
      console.warn("[WARNING] No rehearsal marks found.");
      return;
    }

    // ✅ Convert rehearsalMarks to a string for comparison
    const currentMarks = JSON.stringify(markEntries);
    if (currentMarks === lastRenderedMarks) {
      console.log("[DEBUG] No changes in rehearsal marks. Skipping re-render.");
      return;
    }

    // ✅ Save the current state to prevent unnecessary re-renders
    lastRenderedMarks = currentMarks;

    container.innerHTML = ""; // ✅ Clear existing buttons only when needed

    // ✅ Sort marks by X position **(Global Update)**
    markEntries.sort((a, b) => a[1].x - b[1].x);
    sortedMarks = markEntries.map(([mark]) => mark); // ✅ Store globally

    console.log("[DEBUG] 🎭 Final Sorted Rehearsal Marks:", sortedMarks);

    let rowContainer = null;
    const buttonsPerRow = 4;

    markEntries.forEach(([mark, position], index) => {
      if (index % buttonsPerRow === 0) {
        rowContainer = document.createElement("div");
        rowContainer.classList.add("rehearsal-row");
        container.appendChild(rowContainer);
      }

      const button = document.createElement("button");
      button.textContent = mark;
      button.classList.add("rehearsal-button");
      button.addEventListener("click", () => jumpToRehearsalMark(mark));

      rowContainer.appendChild(button);
    });

    console.log("[DEBUG] ✅ Rehearsal mark buttons created successfully.");
  };

  /**
  * ✅ Opens the rehearsal mark popup.
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

    console.log("[DEBUG] ✅ Rehearsal mark popup opened.");
  };

  /**
  * ✅ Close popup function.
  */
  const closeRehearsalPopup = () => {
    document.getElementById("rehearsal-popup").classList.add("hidden");
  };

  // ✅ Make it globally accessible
  window.closeRehearsalPopup = closeRehearsalPopup;

  // ✅ Allow opening with "R" key
  document.addEventListener("keydown", (event) => {
    if (event.key.toUpperCase() === "R") {
      openRehearsalPopup();
    }
  });

  /**
  * ✅ Jumps to a specified rehearsal mark.
  */
  const jumpToRehearsalMark = (mark) => {
    if (!rehearsalMarks[mark]) {
      console.error(`[ERROR] Rehearsal Mark "${mark}" not found.`);
      return;
    }

    const { x } = rehearsalMarks[mark];

   window.playheadX = x - (window.innerWidth / 2);
    window.scoreContainer.scrollLeft =window.playheadX;
    window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;
    // window.startAllVisibleAnimations();

    console.log(`[DEBUG] Jumping to Rehearsal Mark: ${mark},window.playheadX=${window.playheadX}`);

    if (wsEnabled && window.socket.readyState === WebSocket.OPEN) {
      window.socket?.send(JSON.stringify({ type: 'jump', playheadX: window.playheadX, 
        elapsedTime: window.elapsedTime }));
    } else {
      console.warn("[WARNING] WebSocket is not open. Jump not sent.");
    }

    updatePosition();
    updateSeekBar();
    //updatestopwatch();
  };

  /**
  * ✅ Keyboard Navigation for Rehearsal Marks.
  */
  // document.addEventListener('keydown', (event) => {
  //     if (sortedMarks.length === 0) {
  //         console.warn("[WARNING] No rehearsal marks available for navigation.");
  //         return;
  //     }
  //
  //     let currentIndex = Object.keys(rehearsalMarks).findIndex(mark => rehearsalMarks[mark].x >=window.playheadX);
  //
  //     if (event.key === "ArrowUp") {
  //         if (currentIndex < sortedMarks.length - 1) {
  //             jumpToRehearsalMark(sortedMarks[currentIndex + 1]);
  //         } else {
  //             console.log("[DEBUG] Already at the last rehearsal mark.");
  //         }
  //     } else if (event.key === "ArrowDown") {
  //         if (currentIndex > 0) {
  //             jumpToRehearsalMark(sortedMarks[currentIndex - 1]);
  //         } else {
  //             console.log("[DEBUG] Already at the first rehearsal mark.");
  //         }
  //     }
  // });


  let currentIndex = 0; // Track the current rehearsal mark index

  document.addEventListener('keydown', (event) => {
    if (!["ArrowUp", "ArrowDown"].includes(event.key)) return; // Only handle up/down keys

    if (sortedMarks.length === 0) {
      console.warn("[WARNING] No rehearsal marks available for navigation.");
      return;
    }

    console.log(`\n[DEBUG] Key Pressed: ${event.key}`);
    console.log(`[DEBUG] Current Index Before Move: ${currentIndex} (${sortedMarks[currentIndex]})`);
    console.log(`[DEBUG] Currentwindow.playheadX: ${window.playheadX}`);

    // 🔹 Move Up or Down in the Index Directly
    if (event.key === "ArrowUp" && currentIndex < sortedMarks.length - 1) {
      currentIndex++;
    } else if (event.key === "ArrowDown" && currentIndex > 0) {
      currentIndex--;
    } else {
      console.log("[DEBUG] Already at the first or last rehearsal mark.");
      return;
    }

    let nextMark = sortedMarks[currentIndex];

    console.log(`[DEBUG] Jumping to: ${nextMark} (Index: ${currentIndex})`);
    console.log(`[DEBUG] Next Mark X Position: ${rehearsalMarks[nextMark].x}`);

    // 🔹 Ensurewindow.playheadX Updates Properly
   window.playheadX = rehearsalMarks[nextMark].x + 1; // Small offset to prevent snapping back
    jumpToRehearsalMark(nextMark);

    console.log(`[DEBUG] Updatedwindow.playheadX: ${window.playheadX}`);
  });


  /**
  * ✅ Fast-forward & Rewind Buttons (Now using the fixed index approach)
  */

  document.getElementById('fast-forward-button').addEventListener('click', () => {
    if (sortedMarks.length === 0) {
      console.warn("[WARNING] No rehearsal marks available for navigation.");
      return;
    }

    console.log(`\n[DEBUG] Fast Forward Clicked`);
    console.log(`[DEBUG] Current Index Before Move: ${currentIndex} (${sortedMarks[currentIndex]})`);

    // Move up in the index directly
    if (currentIndex < sortedMarks.length - 1) {
      currentIndex++;
    } else {
      console.log("[DEBUG] Already at the last rehearsal mark.");
      return;
    }

    let nextMark = sortedMarks[currentIndex];

    console.log(`[DEBUG] Jumping to: ${nextMark} (Index: ${currentIndex})`);
    console.log(`[DEBUG] Next Mark X Position: ${rehearsalMarks[nextMark].x}`);

    // Updatewindow.playheadX properly to prevent snapping issues
   window.playheadX = rehearsalMarks[nextMark].x + 1; // Small offset to prevent looping
    jumpToRehearsalMark(nextMark);

    console.log(`[DEBUG] Updatedwindow.playheadX: ${window.playheadX}`);
  });

  document.getElementById('fast-rewind-button').addEventListener('click', () => {
    if (sortedMarks.length === 0) {
      console.warn("[WARNING] No rehearsal marks available for navigation.");
      return;
    }

    console.log(`\n[DEBUG] Fast Rewind Clicked`);
    console.log(`[DEBUG] Current Index Before Move: ${currentIndex} (${sortedMarks[currentIndex]})`);

    // Move down in the index directly
    if (currentIndex > 0) {
      currentIndex--;
    } else {
      console.log("[DEBUG] Already at the first rehearsal mark.");
      return;
    }

    let nextMark = sortedMarks[currentIndex];

    console.log(`[DEBUG] Jumping to: ${nextMark} (Index: ${currentIndex})`);
    console.log(`[DEBUG] Next Mark X Position: ${rehearsalMarks[nextMark].x}`);

    // Updatewindow.playheadX properly
   window.playheadX = rehearsalMarks[nextMark].x + 1;
    jumpToRehearsalMark(nextMark);

    console.log(`[DEBUG] Updatedwindow.playheadX: ${window.playheadX}`);
  });

  //////// END OF REHEARSAL MARK LOGIC ///////////////////////////////////////////


  /**
  * ✅ Toggles playback state between play and pause.
  * - Stores `playheadX` before pausing to prevent jump resets.
  * - Ensures animation resumes correctly after unpausing.
  */

  const togglePlay = () => {
     window.isPlaying = !window.isPlaying;
    console.log(`[DEBUG] Toggling playback. Now playing: ${window.isPlaying}`);

    // ✅ Apply correct speed before playing
    window.speedMultiplier = getSpeedForPosition(window.playheadX);
    console.log(`[DEBUG] Applying speed: ${speedMultiplier}`);
    window.updateSpeedDisplay();

    // ✅ Ensurewindow.playheadX is included in WebSocket message
    if (wsEnabled && socket && socket.readyState === WebSocket.OPEN) {
      const message = {
        type:  window.isPlaying ? "play" : "pause",
       playheadX:window.playheadX, // 🔥 Includewindow.playheadX
      };

      console.log(`[DEBUG] Sending ${window.isPlaying ? "play" : "pause"} message:`, message);
      window.socket?.send(JSON.stringify(message));
    }

    updatePosition();
    checkCueTriggers(); // ✅ Ensure cues are checked after speed update

    if (window.isPlaying) {
      startAnimation();
      togglePlayButton();
      hideControls();
      // startAllVisibleAnimations();

    } else {
      stopAnimation();
      togglePlayButton();

    }
  };

  // TOGGLES THE PLAY BUTTON TO MATCH THE STATE //

  const togglePlayButton = () => {
    const playButton = document.getElementById("toggle-button");

    if (playButton) {
      playButton.innerHTML =  window.isPlaying ? '<div class="custom-pause"></div>' : "▶";
      // console.log(`[DEBUG] Play button updated.  window.isPlaying=${isPlaying}`);
    } else {
      console.error("[ERROR] Play button element not found.");
    }
  };

  window.startPlayback = function startPlayback() {
    if (!window.isPlaying) {
      window.isPlaying = true;
      window.isMusicalPause = false;
      startStopwatch();
      startAnimation();
      togglePlayButton();
      console.log("[Playback] ▶️ Playback started.");
    }
  };
  
  window.pausePlayback = function pausePlayback() {
    if (window.isPlaying) {
      window.isPlaying = false;
      window.isMusicalPause = false;
      stopStopwatch();
      stopAnimation();
      togglePlayButton();
      console.log("[Playback] ⏸ Playback paused.");
    }
  };


  //// END OF TOGGLE PLAY LOGIC  ///////////////////////////////////////////

  // /**
  // * checkCueTriggers()
  // * Called every animation frame to evaluate whether the playhead intersects any cues.
  // * Triggers associated actions (via `handleCueTrigger`) and manages repeat logic with delays.
  // * Includes logic to avoid retriggers at the repeat start point right after a jump.
  // */
  // const checkCueTriggers = async () => {
  //   // ✅ Update elapsed time based on playhead position
  //   window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;

  //   // 🛑 Skip cue checks if we’re seeking, paused, or stopped
  //   if (window.isSeeking || animationPaused || !window.isPlaying) {
  //     console.log("[DEBUG] Skipping cue checks.");
  //     return;
  //   }

  //   // ✅ Center correction for playhead alignment
  //   const playheadOffset = window.scoreContainer.offsetWidth / 2;
  //   const adjustedPlayheadX =window.playheadX + playheadOffset;

  //   // 🔁 Loop through all cues
  //   for (const cue of cues) {
  //     const cueStart = cue.x;
  //     const cueEnd = cueStart + cue.width;
  //     const isInsideCue = adjustedPlayheadX >= cueStart && adjustedPlayheadX <= cueEnd;

  //     // 🎯 Trigger cues if not already triggered
  //     if (isInsideCue && !triggeredCues.has(cue.id)) {
  //       console.log(`[DEBUG] Triggering Cue: ${cue.id} at X: ${cueStart}, Adjusted Playhead: ${adjustedPlayheadX}, Reported Window.innerWidth: ${window.innerWidth}`);
  //       handleCueTrigger(cue.id);
  //       triggeredCues.add(cue.id);
  //     }

  //     // 🔁 Check if cue is the end marker for a repeat
  //     for (const [repeatCueId, repeat] of Object.entries(repeatStateMap)) {
  //       // 🚫 Skip if repeat isn’t active or not ready (e.g., just jumped)
  //       if (!repeat.active || !repeat.ready || !repeat.initialJumpDone) continue;

  //       let isAtRepeatEnd = false;

  //       // 🧭 If endId is "self", check if playhead is on the original repeat cue itself
  //       if (repeat.endId === 'self') {
  //         const repeatCue = cues.find(c => c.id === repeat.cueId || c.id.startsWith(repeat.cueId + "-"));
  //         if (repeatCue) {
  //           const selfX = repeatCue.x;
  //           const selfWidth = repeatCue.width || 40;
  //           const selfEndX = selfX + selfWidth;
  //           if (adjustedPlayheadX >= selfX && adjustedPlayheadX <= selfEndX) {
  //             isAtRepeatEnd = true;
  //           }
  //         }
  //       }
  //       // 📍 Otherwise, match against a different cue
  //       else if (cue.id === repeat.endId || cue.id.startsWith(repeat.endId + "-")) {
  //         isAtRepeatEnd = true;
  //       }

  //       // 🧨 Skip false triggers that happen during jump cooldown (landed on start point)
  //       const now = Date.now();
  //       if (repeat.jumpCooldownUntil && now < repeat.jumpCooldownUntil) {
  //         console.log(`[repeat] ⏳ Skipping due to jumpCooldownUntil for ${repeatCueId}`);
  //         continue;
  //       }

  //       if (isAtRepeatEnd) {
  //         const cooldown = 500;
  //         if (now - repeat.lastTriggerTime < cooldown) {
  //           continue;
  //         }

  //         repeat.lastTriggerTime = now;

  //         repeat.currentCount++;
  //         updateRepeatCountDisplay(repeat.currentCount);
  //         // Add highlighting to playhead when in repeat cycle
  //         // document.getElementById('playhead').classList.add('repeating');
  //         // document.getElementById("repeat-count-box").classList.add("pulse");
  //         //

  //         console.log(`[repeat] Reached end (${repeat.endId}) for ${repeatCueId}, count: ${repeat.currentCount}`);

  //         if (repeat.isInfinite || repeat.currentCount < repeat.count) {
  //           if (repeat.directionMode === 'p') {
  //             repeat.currentlyReversing = !repeat.currentlyReversing;
  //           }

  //           console.log(`[repeat] ⏳ Pausing before repeat jump for ${repeatCueId}`);

  //           try {
  //             await executeRepeatJump(repeat, repeatCueId);
  //           } catch (err) {
  //             console.error(`[repeat] ❌ Error during executeRepeatJump for ${repeatCueId}:`, err);
  //           }

  //         } else {

  //           // ✅ All repeats complete
  //           repeat.active = false;
  //           hideRepeatCountDisplay();
  //           // document.getElementById('playhead').classList.remove('repeating');
  //           // document.getElementById("repeat-count-box").classList.add("hidden");
  //           // document.getElementById("repeat-count-box").classList.remove("pulse");


  //           if (repeat.action === 'stop') {
  //             stopAnimation();
  //              window.isPlaying = false;
  //             togglePlayButton();
  //             console.log(`[repeat] Repeat finished. Stopping playback.`);
  //           } else if (repeat.resumeId && repeat.resumeId !== 'self') {
  //             jumpToCueId(repeat.resumeId);
  //             togglePlay();
  //           } else {
  //             console.log(`[repeat] Repeat finished. Staying at current location.`);
  //           }
  //         }

  //         break; // ✅ Avoid multiple repeat triggers per frame
  //       }
  //     }
  //   }
  // };



  // this is never used anywhere?
  // todo what is this for - can it be removed
  // const originalSyncState = syncState; // Keep a reference to the original syncState


  //////////////////////////////////////////////////

  const jumpToCueId = (id) => {
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

    if (wsEnabled && socket && socket.readyState === WebSocket.OPEN) {
      window.socket?.send(JSON.stringify({ type: 'jump', playheadX: window.playheadX, 
        elapsedTime: window.elapsedTime }));
    }

    updatePosition();
    updateSeekBar();
    //updatestopwatch();
  };



  // ANIMATION POPUP LOGIC
  // -----------------------------------------------
  // todo maybe all make obsolete by animejs

  const openAnimationPopup = (triggerId) => {
    // Extract animation settings from the namespace
    const namespace = triggerId.split('_');
    const svgFilename = namespace.find((ns) => ns.startsWith('file_'))?.replace('file_', '') || 'default.svg';
    const duration = parseInt(namespace.find((ns) => ns.startsWith('dur_'))?.replace('dur_', '').replace('s', '')) * 1000 || 30000;
    const loopSetting = namespace.find((ns) => ns.startsWith('loop_'))?.replace('loop_', '') || 1;

    // Access popup elements
    const popup = document.getElementById('animation-popup');
    const content = document.getElementById('animation-content');

    // Show popup
    popup.classList.add('active');
    popup.classList.remove('hidden');

    // Load the SVG dynamically
    content.innerHTML = `<object id="animated-svg" data="${svgFilename}" type="image/svg+xml"></object>`;

    // Wait for SVG to load
    const svgObject = document.getElementById('animated-svg');
    svgObject.onload = () => {
      const svgDoc = svgObject.contentDocument;
      const paths = svgDoc.querySelectorAll('path[id^="path-"]');
      const objects = svgDoc.querySelectorAll('[id^="obj2path-"]');

      // Animate objects along paths using Anime.js
      objects.forEach((obj) => {
        const pathId = obj.id.split('_')[0].replace('obj2path-', '');
        const path = svgDoc.getElementById(pathId);
        if (!path) return;

        // Extract object settings from namespace
        const objNamespace = obj.id.split('_');
        const objDuration = parseInt(objNamespace.find((ns) => ns.startsWith('dur_'))?.replace('dur_', '').replace('s', '')) * 1000 || duration;
        const objLoop = objNamespace.find((ns) => ns.startsWith('loop_'))?.replace('loop_', '') || loopSetting;
        const rotate = objNamespace.includes('rotate') ? true : false;

        // Get the TRUE start point of the path
        const pathStart = path.getPointAtLength(0);

        // Get object's bounding box (for alignment correction)
        const objBBox = obj.getBBox();
        const objHeight = objBBox.height;
        const objWidth = objBBox.width;

        // **New: Compute the Y-offset correction**
        const yOffsetCorrection = pathStart.y - (objBBox.y + objHeight / 2);
        const xOffsetCorrection = pathStart.x - (objBBox.x + objWidth / 2);

        console.log(`[DEBUG] Fixing ${obj.id}: PathStart(y=${pathStart.y}), ObjBBox(height=${objHeight}), OffsetApplied=${yOffsetCorrection}`);

        // ✅ Apply precomputed offsets directly in Anime.js keyframes
        const anim = anime({
          targets: obj,
          keyframes: [
            {
              translateX: (el) => anime.path(path)('x')(el) - xOffsetCorrection,
              translateY: (el) => anime.path(path)('y')(el) - yOffsetCorrection,
            }
          ],
          rotate: rotate ? anime.path(path)('angle') : undefined,
          duration: objDuration,
          easing: 'easeInOutQuad',
          loop: objLoop === 'infinite' ? true : parseInt(objLoop),
        });

        // ✅ Register with runningAnimations for observer tracking
        if (obj?.id) {
          window.runningAnimations[obj.id] = anim;
        }

      });

    };


    // Close popup on click
    popup.addEventListener('click', () => {
      popup.classList.remove('active');
      popup.classList.add('hidden');
      content.innerHTML = ''; // Clear content
    });

    // Automatically close popup after animation ends
    setTimeout(() => {
      popup.classList.remove('active');
      popup.classList.add('hidden');
      content.innerHTML = ''; // Clear content
    }, duration);
  };

  window.openAnimationPopup = openAnimationPopup; // Ensure global access

  document.addEventListener('keydown', (event) => {
    switch (event.key) {
      case '1': anime.pause(); break; // Pause animations
      case '2': anime.play(); break;  // Resume animations
      case '0': document.getElementById('animation-popup').click(); break; // Close popup
    }
  });


  // // 🟡 Make loadAndClose globally accessible to HTML
  window.loadAndClose = function (svgPath) {
    loadExternalSVG(svgPath);
    document.getElementById("score-options-popup").classList.add("hidden");
  };

  // 🟡 Make handleFileUploadAndClose globally accessible to HTML
  window.handleFileUploadAndClose = function () {
    const fileInput = document.getElementById("svg-file");
    const file = fileInput.files[0];

    if (!file) return;

    const blobURL = URL.createObjectURL(file);
    sessionStorage.setItem("scoreURL", blobURL);
    loadExternalSVG(blobURL);
    document.getElementById("score-options-popup").classList.add("hidden");
  };





  // Event Listeners

  const durationInput = document.getElementById("duration-input");

  // ✅ Set default duration after durationInput is defined
  window.duration = durationInput
  ? parseInt(durationInput.value, 10) * 60 * 1000
  : 30 * 60 * 1000;

  if (scoreOptionsPopup) {
    scoreOptionsPopup.addEventListener("click", (event) => {
      console.log("[DEBUG] Click inside score-options-popup, stopping propagation.");
      event.stopPropagation();
    });
  } else {
    console.error("[DEBUG] score-options-popup not found.");
  }

  if (durationInput) {
    durationInput.addEventListener("change", (event) => {
      const newDuration = parseFloat(event.target.value);
      if (!isNaN(newDuration)) {
        duration = newDuration * 60 * 1000; // ✅ store in ms
        console.log(`[DEBUG] Updated duration to ${newDuration} minutes.`);
      }
    });
  } else {
    console.warn("[DEBUG] #duration-input not found in DOM.");
  }

  // ✅ Safely attach the close button listener now that DOM is ready
  const closeBtn = document.getElementById("close-score-options");
  if (closeBtn) {
    closeBtn.addEventListener("click", (event) => {
      console.log("[DEBUG] Close button clicked.");
      event.stopPropagation();
      document.getElementById("score-options-popup").classList.add("hidden");
    });
  } else {
    console.warn("[DEBUG] Close button not found in DOM.");
  }

  // TODO uncomment and fix fixme

  // durationInput.addEventListener('input', () => {
  //   duration = parseInt(durationInput.value, 10) * 60 * 1000;
  //   //console.log(Duration updated to ${durationInput.value} minutes (${duration} milliseconds).);
  //   calculateMaxScrollDistance();
  //   updatePosition();
  //   //updatestopwatch(); // Ensure the stopwatch reflects the updated total duration
  // });

  toggleButton.addEventListener('click', () => {
    window.isPlaying ? window.pausePlayback() : window.startPlayback();
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
  invertButton.addEventListener('click', invertColors);
  wsToggleButton.addEventListener('click', () => {
    toggleCommunication(); // Use the toggle function for WebSocket and OSC messages
    // wsToggleButton.textContent = isCommunicationEnabled ? 'Disable Communication' : 'Enable Communication';
  });

  helpButton.addEventListener('click', () => {
    toggleKeybindingsPopup(); // Show keybindings popup when Help button is clicked
  });


  function showProgrammeNote() {
    const programmePopup = document.getElementById('programme-popup');
    if (programmePopup) {
      programmePopup.classList.remove('hidden');
    } else {
      console.warn("[CLIENT] Programme popup not found.");
    }
  }

  function showScoreNotes() {
    const scoreNotesPopup = document.getElementById('score-notes-popup');
    if (scoreNotesPopup) {
      scoreNotesPopup.classList.remove('hidden');
    } else {
      console.warn("[CLIENT] Score notes popup not found.");
    }
  }


  // detect mobile for buttons or text on title page
  function isMobileDevice() {
    return /Mobi|Android|iPhone/i.test(navigator.userAgent);
  }

  if (isMobileDevice()) {
    document.querySelector('.instructions').style.display = 'none';
    document.getElementById('action-buttons').style.display = 'flex';
  }

  // Single keydown event listener
  document.addEventListener('keydown', (event) => {
    // console.log(`Key pressed: ${event.key}`);
    if (event.key === 'h' || event.key === 'H') {
      toggleKeybindingsPopup(); // Show/hide keybindings popup
    } else if (event.key === 's' || event.key === 'S') {
      toggleScoreOptionsPopup(); // Show/hide score options popup
    } else if (event.key === 'f' || event.key === 'F') {
      toggleFullscreen(); // Fullscreen mode
    } else if (event.key === 't' || event.key === 'T' || event.key === 'Enter') {
      toggleSplashScreen(); // Toggle splash screen visibility
    } else if (event.key === ' ') {
      event.preventDefault(); // Prevent default browser behavior for space key
      window.isPlaying ? window.pausePlayback() : window.startPlayback();
     // Play/Pause score
      // } else if (event.key === 'r' || event.key === 'R') {
      //     rewindToStart(); // Rewind to start
    } else if (event.key === 'p' || event.key === 'P') {
      toggleProgrammeNotePopup(); // Show/hide program note popup
    } else if (event.key === 'n' || event.key === 'N') {
      toggleScoreNotesPopup(); // Show/hide score notes popup
    } else if (event.key === 'Escape') {
      // toggleCommunication(); // Enable/disable WebSocket/OSC communication
    }
  });

  // window.addEventListener('resize', () => {
  //   calculateMaxScrollDistance();
  //   updatePosition();
  // });

  // Detect double-tap to toggle pause/play
  let lastTap = 0; // Timestamp of the last tap

  document.addEventListener('touchstart', (event) => {
    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - lastTap;

    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // Double-tap detected
      console.log("[DEBUG] Double-tap detected. Toggling play/pause.");
      window.isPlaying ? window.pausePlayback() : window.startPlayback();
    }

    lastTap = currentTime; // Update the lastTap timestamp
  }, { passive: false });

  let startX = 0; // Start X position of the touch
  let isSwiping = false; // Whether a swipe is in progress
  let holdInterval = null; // Interval for swipe-and-hold

  const SWIPE_THRESHOLD = 50; // Minimum swipe distance to detect as a gesture

  const startMoving = (direction) => {
    if (direction === 'left') {
      rewind(); // Move left
    } else if (direction === 'right') {
      forward(); // Move right
    }
  };

  const stopMoving = () => {
    clearInterval(holdInterval); // Stop the continuous movement
    holdInterval = null;
  };

  // Attach touch event listeners
  const scoreArea = document.getElementById('scoreContainer'); // Replace with your element ID

  scoreArea.addEventListener('touchstart', (event) => {
    startX = event.touches[0].clientX; // Record the starting X position
    isSwiping = true; // Indicate a swipe is in progress
    stopMoving(); // Stop any existing swipe-and-hold action
  });

  scoreArea.addEventListener('touchmove', (event) => {
    if (!isSwiping) return;

    const currentX = event.touches[0].clientX;
    const deltaX = currentX - startX;

    if (Math.abs(deltaX) > SWIPE_THRESHOLD) {
      const direction = deltaX > 0 ? 'left' : 'right';
      //  console.log(Swipe detected: ${direction});

      // Start swipe-and-hold behavior
      if (!holdInterval) {
        holdInterval = setInterval(() => startMoving(direction), 100); // Adjust interval speed as needed
      }
    }
  });

  scoreArea.addEventListener('touchend', () => {
    isSwiping = false; // Reset swipe state
    stopMoving(); // Stop swipe-and-hold action
  });


  // disable enable network elements //////////////////////////////////////////////////////

  let isCommunicationEnabled = true; // Track the state of WebSocket and OSC communication

  const toggleCommunication = () => {
    isCommunicationEnabled = !isCommunicationEnabled;

    if (!isCommunicationEnabled) {
      // Disable WebSocket
      if (socket) {
        socket.close();
        socket = null;
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

  if (closeScoreOptionsButton) {
    closeScoreOptionsButton.addEventListener('click', () => {
      scoreOptionsPopup.classList.add('hidden');
    });
  }

  // Initialize

  // wsToggleButton.textContent = isCommunicationEnabled ? 'Disable Communication' : 'Enable Communication';
  wsToggleButton.style.borderColor = isCommunicationEnabled ? 'green' : 'red';

  if (keybindingsPopup) {
    keybindingsPopup.classList.add('hidden');
  }

  if (scoreOptionsPopup) {
    scoreOptionsPopup.classList.add('hidden');
  }

  // calculateMaxScrollDistance();
  updatePosition();
  //updatestopwatch();

  window.scoreContainer = window.scoreContainer; // Expose globally
  window.updatePosition = updatePosition; // Expose updatePosition globally


  console.log('// EOF');

});
