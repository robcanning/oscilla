const LogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

console.log("[DEBUG] sessionStorage keys:", Object.keys(sessionStorage));

let currentLogLevel = LogLevel.WARN; // Set default log level to reduce verbosity

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

// Example: To show fewer logs, set log level to WARN or ERROR
// Example: setLogLevel(LogLevel.INFO) to see more logs
const setLogLevel = (level) => {
  currentLogLevel = level;
};

const isMobile = /iPad|iPhone|Android|Mobile|Tablet/i.test(navigator.userAgent);
if (isMobile) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/tablet.css';
  document.head.appendChild(link);
}

// Ensure WaveSurfer.js is loaded before using it
const loadWaveSurfer = (callback) => {
  if (typeof WaveSurfer !== "undefined") {
    callback();
  } else {
    console.log("[INFO] Waiting for WaveSurfer.js to load...");
    setTimeout(() => loadWaveSurfer(callback), 100);
  }
};

// Use WaveSurfer only after it's available
loadWaveSurfer(() => {
  console.log("[INFO] WaveSurfer.js is loaded and ready to use.");
});



const svgscoreContainer = document.getElementById('scoreContainer'); // Ensure the SVG is wrapped in a container with this ID



document.addEventListener('DOMContentLoaded', () => {

  setLogLevel(LogLevel.WARN);

  let pendingRepeatStateMap = null; // stores repeat state from server before cues[] are ready

  console.log('Interactive Scrolling Score Initialized.');

  const splash = document.getElementById('splash');
  const scoreContainer = document.getElementById('scoreContainer');
  const controls = document.getElementById('controls');
  const playhead = document.getElementById('playhead');
  let playheadX = 0; // ✅ Ensure `playheadX` is always available globally
  let recentlyRecalculatedPlayhead = false;

  const score = document.getElementById('score');
  const scoreWidth = document.querySelector('svg')?.getAttribute('width') || 40960; // Use SVG's intrinsic width
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

  const keybindingsPopup = document.getElementById('keybindings-popup');


  const scoreOptionsPopup = document.getElementById("score-options-popup");

  document.addEventListener("DOMContentLoaded", () => {


  });


  const closeKeybindingsButton = document.getElementById('close-keybindings');
  const closeScoreOptionsButton = document.getElementById('close-score-options');
  const SEEK_INCREMENT = 0.001; // Represents 1% of the total duration

  let animationPaused = false; // Global lock for animation state
  let maxScrollDistance = 40000; // todo GET THE VALUE FROM WIDTH
  let elapsedTime = 0;
  let isPlaying = false;
  let playbackSpeed = 1.0;
  let lastAnimationFrameTime = null;
  let wsEnabled = true; // WebSocket state
  let socket = null; // Define globally so all functions can access it

  let resumeReceived = false; // ✅ Prevents infinite broadcast loops

  let totalPauseDuration = 0; // Tracks cumulative pause time for musical pauses
  let pauseStartTime = null; // Start time of the current musical pause
  let isManualPause = false; // Flag to differentiate manual vs. musical pause
  let resumeTimeOffset = null; // Tracks the time offset when resuming playback
  let pauseOffset = 0; // Tracks elapsed pause duration



  let scoreSVG = null; // ✅ Store global reference to SVG

  const svgscoreContainer = document.getElementById('scoreContainer'); // Ensure the SVG is wrapped in a container with this ID


  const adjustscoreContainerHeight = () => {
    const controls = document.getElementById('controls');
    const scoreContainer = document.getElementById('scoreContainer');
    //const controlsHeight = controls && !controls.classList.contains('hidden') ? controls.offsetHeight : 0;
    const controlsHeight = 5;

    // scoreContainer.style.height = `calc(100vh - ${controlsHeight}px)`; // Adjust height dynamically
    console.log(`scoreContainer height adjusted to: ${scoreContainer.style.height}`);
  };



  /**
  * Toggles the visibility of all score annotations using the "note-" namespace.
  * Queries only the SVG elements and switches between "block" and "none" display states.
  * Controlled via the 📝 button in the GUI.
  */

  const toggleScoreNotes = () => {
    console.log("[DEBUG] Toggling visibility of score notes.");

    const scoreSVG = document.querySelector("svg"); // Get the SVG container
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





  // Handle Rehearsal Marks Popup
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
    const scoreContainer = document.getElementById('scoreContainer');
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
      if (scoreContainer) scoreContainer.classList.remove('fade-out');
      if (scoreContainer) scoreContainer.classList.add('fade-in');
      if (playhead) playhead.classList.remove('fade-out');
      if (playhead) playhead.classList.add('fade-in');
      if (playzone) playzone.classList.remove('fade-out');
      if (playzone) playzone.classList.add('fade-in');

      // Ensure the fade-in classes are removed after the transition completes
      setTimeout(() => {
        if (scoreContainer) scoreContainer.classList.remove('fade-in');
        if (playhead) playhead.classList.remove('fade-in');
        if (playzone) playzone.classList.remove('fade-in');
      }, 1000); // Match the CSS transition duration

      // Resume playback only if the score was playing before the popup appeared
      if (!isPlaying) {
        isPlaying = true;
        animationPaused = false; // Ensure animations are not paused
        startAnimation(); // Resume the animation loop
        console.log('[CLIENT] Resuming playback after popup dismissal.');
      }
    }
  };










  // document.addEventListener('mousemove', clearPopupsOnInteraction);
  document.addEventListener('keydown', clearPopupsOnInteraction);
  document.addEventListener('touchstart', clearPopupsOnInteraction);





  function handleRestoredRepeatState(repeatStateMap, cues) {
    console.log("[CLIENT] 🧠 Restoring repeat state now...", repeatStateMap);

    for (const [cueId, repeat] of Object.entries(repeatStateMap)) {
      if (!repeat || typeof repeat !== "object") {
        console.warn(`[restore] Skipping invalid repeat entry for cueId: ${cueId}`);
        continue;
      }

      if (repeat.active && !repeat.initialJumpDone) {
        console.log(`[CLIENT] ⏮ Evaluating active repeat: ${cueId}`);

        const startCue = cues.find(c => c.id === repeat.startId);
        const endCue = repeat.endId === 'self'
          ? cues.find(c => c.id === cueId)
          : cues.find(c => c.id === repeat.endId);

        if (startCue && endCue) {
          const playheadCenter = playheadX + (scoreContainer.offsetWidth / 2);
          const inRange = playheadCenter >= startCue.x && playheadCenter <= endCue.x + endCue.width;

          if (inRange) {
            console.log(`[CLIENT] 🧭 Already inside repeat range for ${cueId}. Skipping jump.`);

            repeat.initialJumpDone = true;
            repeat.ready = true;

            if (!repeat.recovered) {
              repeat.currentCount = (repeat.currentCount || 0) + 1;
            } else {
              // already bumped during recovery, clear flag
              delete repeat.recovered;
            }

            repeat.recovered = true;
            jumpToCueId(repeat.startId); // ✅ Force visual re-alignment

            repeatStateMap[cueId] = repeat;

            updateRepeatCountDisplay(repeat.currentCount + 1);
            document.getElementById("repeat-count-box").classList.remove("hidden");
            document.getElementById("repeat-count-box").classList.add("pulse");
            document.getElementById("playhead").classList.add("repeating");


          } else {
            console.log(`[CLIENT] 🔁 Outside repeat range — jumping to start for ${cueId}.`);

            repeat.ready = false;
            repeat.initialJumpDone = true;
            repeatStateMap[cueId] = repeat;

            executeRepeatJump(repeat, cueId).then(() => {
              setTimeout(() => {
                repeat.ready = true;
                repeatStateMap[cueId] = repeat;
                console.log(`[CLIENT] ✅ Repeat ${cueId} now ready to detect end cue.`);
              }, 300);
            });
          }
        } else {
          console.warn(`[CLIENT] ⚠️ Could not resolve start or end cue for ${cueId}. Skipping recovery.`);
        }
      }
    }
  }



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

      socket = new WebSocket(WS_URL);

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
        socket.send(JSON.stringify({ type: "get_repeat_state" }));
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
                console.log(`[CLIENT] 🔍 Current PlayheadX: ${playheadX}, Adjusted PlayheadX: ${playheadX + (window.innerWidth * 0.5)}`);

                if (speedMultiplier !== roundedMultiplier) {
                  incomingServerUpdate = true;  // ✅ Prevent redundant updates
                  speedMultiplier = roundedMultiplier;
                  console.log(`[CLIENT] ✅ Speed multiplier updated from server: ${speedMultiplier}`);
                  updateSpeedDisplay();
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
              console.log(`[DEBUG] Processing pause request. playheadX=${data.playheadX}, elapsedTime=${data.elapsedTime}`);

              if (!isNaN(data.playheadX) && data.playheadX >= 0) {
                playheadX = data.playheadX;
                console.log(`[DEBUG] Applied server-provided playheadX: ${playheadX}`);
              } else {
                console.error(`[ERROR] Invalid playheadX received. Keeping last known value.`);
              }

              if (!isNaN(data.elapsedTime) && data.elapsedTime >= 0) {
                elapsedTime = data.elapsedTime;
              } else {
                console.error(`[ERROR] Invalid elapsedTime received: ${data.elapsedTime}`);
                return;
              }

              isPlaying = false;
              stopAnimation(); // ✅ Stop playhead movement
              togglePlayButton(); // ✅ Update UI play button
              console.log("[DEBUG] Playback paused successfully.");
              break;

            /** ✅ Resume Playback After Pause */
            case "resume_after_pause":
              console.log(`[DEBUG] Processing resume_after_pause. playheadX=${data.playheadX}, elapsedTime=${data.elapsedTime}`);

              if (!isNaN(data.playheadX) && data.playheadX >= 0) {
                playheadX = data.playheadX;
                console.log(`[DEBUG] Applied server-provided playheadX: ${playheadX}`);
              } else {
                console.error(`[ERROR] Invalid playheadX received. Keeping last known value.`);
              }

              if (!isNaN(data.elapsedTime) && data.elapsedTime >= 0) {
                elapsedTime = data.elapsedTime;
              } else {
                console.error(`[ERROR] Invalid elapsedTime received: ${data.elapsedTime}`);
                return;
              }

              isPlaying = true;
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
                playheadX = data.playheadX;
                console.log(`[CLIENT] Synced playheadX from cuePause: ${playheadX}`);
              }

              if (!isNaN(data.elapsedTime)) {
                elapsedTime = data.elapsedTime;
                console.log(`[CLIENT] Synced elapsedTime from cuePause: ${elapsedTime}`);
              }

              stopAnimation();
              isPlaying = false;
              animationPaused = true;
              togglePlayButton();

              if (wsEnabled && socket) {
                socket.send(JSON.stringify({
                  type: "cuePause_ack",
                  playheadX: playheadX ?? -1,
                  elapsedTime: elapsedTime ?? -1
                }));
                console.log(`[CLIENT] Sent cuePause_ack to server. playheadX=${playheadX}, elapsedTime=${elapsedTime}`);
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
                console.warn(`[WARNING] WebSocket message modifying playheadX: ${data.playheadX}`);
              }

              elapsedTime = data.state.elapsedTime;
              isPlaying = data.state.isPlaying;

              if (!recentlyRecalculatedPlayhead) {
                playheadX = data.state.playheadX;
                scoreContainer.scrollLeft = playheadX;
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


                // console.log(`[DEBUG] ✅ Applying server playheadX: ${playheadX}`);
              } else {
                console.log(`[DEBUG] 🔄 Ignoring server playheadX update to prevent override.`);
              }

              updatePosition();
              recentlyRecalculatedPlayhead = false; // Reset flag after applying the state

              updateSeekBar();
              updateStopwatch();

              if (!isNaN(data.state.speedMultiplier) && data.state.speedMultiplier > 0) {
                if (speedMultiplier !== data.state.speedMultiplier) {
                  speedMultiplier = data.state.speedMultiplier;
                  console.log(`[CLIENT] Synced speed multiplier to ${speedMultiplier}`);
                } else {
                  // console.log(`[CLIENT] Speed multiplier already set to ${speedMultiplier}. No update needed.`);
                }
              } else {
                // console.warn(`[CLIENT] Invalid or unchanged speed multiplier received: ${data.state.speedMultiplier}`);
              }

              if (isPlaying) {
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
              console.log(`[DEBUG] 🔄 Server jump received: playheadX=${data.playheadX}`);

              const now = Date.now();
              if (now - lastJumpTime < 1000) { // ✅ Ignore duplicate jumps within 1s
                console.log(`[DEBUG] 🚫 Ignoring duplicate jump from server.`);
                return;
              }

              playheadX = data.playheadX;
              scoreContainer.scrollLeft = playheadX;
              console.log(`[DEBUG] ✅ Applied Server Jump: playheadX=${playheadX}`);

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
        socket.send(JSON.stringify({ type: "update_client_name", name: newName.trim() }));
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
    clients = clientArray; // ✅ Store the latest client list globally
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
      socket.send(JSON.stringify({ type: "update_client_name", name: localClientName }));
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
    const scoreContainer = document.getElementById('scoreContainer');
    const controls = document.getElementById('controls');

    if (splash.style.display === 'none' || splash.classList.contains('hidden')) {
      console.log("[CLIENT] Showing splash screen.");
      splash.style.display = 'flex';
      splash.classList.remove('hidden');
      scoreContainer.style.display = 'none'; // Hide the score scoreContainer
      controls.style.display = 'none'; // Hide controls
    } else {
      console.log("[CLIENT] Hiding splash screen.");
      splash.style.display = 'none';
      splash.classList.add('hidden');
      scoreContainer.style.display = 'block'; // Show the score scoreContainer
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


  /**
  * Initializes and animates object-path pairs within an SVG element.
  * Supports float values for speed and dynamically extracts path IDs.
  * Calls `animateObjToPath` for each detected object-path pair.
  * Returns an array of active animations for external control if needed.
  */


  /**
   * parseO2PCompact(id)
   * --------------------
   * Parses compact o2p(...) namespace IDs and extracts animation parameters.
   * Supports direction, speed, osc, easing, and cue-trigger flags.
   *
   * Example:
   *   o2p(path-5)_dir(1)_speed(2.5)_osc(1)_ease(3)_t(1)
   *
   * @param {string} id - The element's ID or data-id attribute.
   * @returns {Object|null} Parsed config:
   *   {
   *     pathId: string,
   *     direction: number,
   *     speed: number,
   *     osc: boolean,
   *     ease: string|number|null,
   *     trigger: boolean
   *   }
   */

  window.parseO2PCompact = function (id) {
    console.log(`[DEBUG] parseO2PCompact CALLED for id: ${id}`);

    const match = id.match(/o2p\(([^)]+)\)/);
    if (!match) {
      console.warn(`[WARN] No o2p() match in id: ${id}`);
      return null;
    }

    const pathId = match[1];
    const direction = parseInt((id.match(/_dir\((\d)\)/) || [])[1] || "0", 10);
    const speed = parseFloat((id.match(/_speed\(([^)]+)\)/) || [])[1] || "1");
    const osc = parseInt((id.match(/_osc\((\d)\)/) || [])[1] || "0", 10) === 1;
    const trigger = /_t\(1\)/.test(id);

    let ease = null;
    const easeMatch = id.match(/_ease\(([^)]+)\)/);
    if (easeMatch) {
      const val = easeMatch[1];
      ease = isNaN(val) ? val : parseInt(val, 10);
    }

    const parsed = {
      pathId,
      direction,
      speed,
      osc,
      ease,
      trigger
    };

    console.log(`[DEBUG] parseO2PCompact → id: ${id}`, parsed);
    return parsed;
  };


  /**
   * initializeObjectPathPairs(svgElement, speed)
   * -------------------------------------------------------
   * Finds and animates SVG elements using legacy or compact
   * namespace formats for motion along SVG paths.
   *
   * ✅ Legacy support:
   *   - `obj2path-<pathId>_...`
   *   - `o2p-<pathId>_...`
   *
   * ✅ Compact support:
   *   - `o2p(<pathId>)_dir(<mode>)_speed(<val>)_osc(<0|1>)`
   *
   * ✅ Deferred trigger:
   *   - Any ID or data-id containing `_t(1)` will not animate
   *     immediately, but register as a cue for `cueTraverse`.
   */
  const initializeObjectPathPairs = (svgElement, speed = 10.0) => {
    const objects = Array.from(svgElement.querySelectorAll(
      '[id^="obj2path-"], [id^="o2p-"], [id^="o2p("],' +
      '[data-id^="obj2path-"], [data-id^="o2p-"], [data-id^="o2p("]'
    ));
    if (objects.length === 0) return;

    const animations = [];

    objects.forEach((object) => {
      const rawId = object.id;
      const id = object.getAttribute('data-id') || rawId;

      console.log(`[SCAN] Checking ${id}`); // 🔍 add this

      if (id.startsWith("o2p(")) {
        console.log(`[MATCH] ID starts with o2p: ${id}`); // 🔍 add this

        const config = window.parseO2PCompact(id);
        if (!config) {
          console.warn(`[o2p] ⚠️ Could not parse compact ID: ${id}`);
          return;
        }

        const path = svgElement.getElementById(config.pathId);
        if (!path) {
          console.warn(`[o2p] ⚠️ No path found with ID: ${config.pathId}`);
          return;
        }

        const easing = typeof config.ease === "string"
          ? config.ease
          : {
            0: 'linear', 1: 'easeInSine', 2: 'easeOutSine', 3: 'easeInOutSine',
            4: 'easeInBack', 5: 'easeOutBack', 6: 'easeInOutBack',
            7: 'easeInElastic', 8: 'easeOutElastic', 9: 'easeInOutElastic'
          }[config.ease] || 'easeInOutSine';

        const playAnimation = () => {
          animateObjToPath(object, path, config.speed, [], true, easing, config.osc);
        };

        if (id.includes('_t(1)')) {
          if (!window.pendingPathAnimations) window.pendingPathAnimations = new Map();
          pendingPathAnimations.set(object.id, playAnimation);
          console.log(`[o2p] ⏸️ Deferred animation registered for ${object.id}`);
        } else {
          playAnimation();
        }

        return; // skip legacy logic
      }


      // 🧱 Legacy obj2path/o2p- fallback
      const pathId = rawId
        .replace(/_(speed|spd|s)_\d+(\.\d+)?/, '')
        .replace(/_(direction|dir|d)_\d+/, '')
        .replace(/_(ease|easing|e)_\d+/, '')
        .replace(/^obj2path-/, 'path-')
        .replace(/^o2p-/, 'path-');

      const path = svgElement.getElementById(pathId);
      if (!path) return;

      const playAnimation = () => {
        animateObjToPath(object, path, parseFloat(speed), animations);
      };

      if (id.includes('_t(1)')) {
        if (!window.pendingPathAnimations) window.pendingPathAnimations = new Map();
        pendingPathAnimations.set(object.id, playAnimation);
        console.log(`[obj2path] 🔁 Deferred path animation registered for ${object.id}`);
      } else {
        playAnimation(); // Immediate start
      }
    });

    return animations;
  };




  ///////////////////////

  /**
   * Initializes all rotating SVG objects (legacy and new syntax).
   * Supports immediate start or triggerable mode via `_t(1)` in ID.
   * Uses: startRotation (legacy), startRotate (modern)
   */
  const initializeRotatingObjects = (svgElement) => {
    const rotatingObjects = Array.from(svgElement.querySelectorAll(
      '[id^="obj_rotate_"], [id^="r_"], [id*="deg["], ' +
      '[data-id^="obj_rotate_"], [data-id^="r_"], [data-id*="deg["]'
    ));


    if (rotatingObjects.length === 0) {
      console.log('[DEBUG] No rotating objects found.');
      return;
    }

    console.log(`[DEBUG] Found ${rotatingObjects.length} rotating objects.`);

    rotatingObjects.forEach((object) => {
      const rawId = object.id;
      const dataId = object.getAttribute('data-id');
      const id = dataId || rawId;  // Use data-id if present, otherwise fallback to regular id

      if (id.includes('_t(1)')) {
        if (!window.pendingRotationAnimations) window.pendingRotationAnimations = new Map();
        pendingRotationAnimations.set(id, () => {
          if (id.includes('deg[') || id.includes('alt(') || id.includes('rpm(')) {
            startRotate(object); // Modern rotation
          } else {
            startRotation(object); // Legacy rotation
          }
        });
        console.log(`[DEBUG] Deferred rotation stored for ${id}`);
        return;
      }

      if (id.includes('deg[') || id.includes('alt(') || id.includes('rpm(')) {
        startRotate(object); // Modern rotation system
      } else {
        startRotation(object); // Legacy fallback
      }
    });
  };

  /**
   * Initializes all scaling SVG objects (s_, scale, s[...]).
   * Supports deferred triggering via `_t(1)` in ID.
   */
  const initializeScalingObjects = (svgElement) => {
    // console.log('[DEBUG][scale] Initializing scaling objects.');

    const scalingObjects = Array.from(svgElement.querySelectorAll(
      '[id^="scale"], [id^="s_"], [id^="sXY_"], [id^="sX_"], [id^="sY_"],' +
      '[id*="s["], [id*="sXY["], [id*="sX["], [id*="sY["],' +
      '[data-id*="s["], [data-id*="sXY["], [data-id*="sX["], [data-id*="sY["],' +
      '[data-id^="s_seq"], [data-id^="sXY_seq"]'
    ));

    if (scalingObjects.length === 0) {
      //  console.log('[DEBUG][scale] No scaling objects found.');
      return;
    }

    //  console.log(`[DEBUG][scale] Found ${scalingObjects.length} scaling objects.`);

    scalingObjects.forEach((object) => {
      const rawId = object.id;
      const dataId = object.getAttribute('data-id');
      const id = dataId || rawId;
      //  console.log(`[scale:init] Found scale object: ${object.id}, data-id: ${object.getAttribute("data-id")}`);

      // Always call startScale — it decides whether to play or defer
      startScale(object);
    });
  };



  // ✅ extractTagValue: returns numeric or string match from underscore/parenthesis syntax
  function extractTagValue(id, tag, fallback = null) {
    const parenMatch = id.match(new RegExp(`${tag}\\(([^)]+)\\)`));
    const underscoreMatch = id.match(new RegExp(`${tag}_(\\d+(\\.\\d+)?)`));

    if (parenMatch) return isNaN(Number(parenMatch[1])) ? parenMatch[1] : parseFloat(parenMatch[1]);
    if (underscoreMatch) return isNaN(Number(underscoreMatch[1])) ? underscoreMatch[1] : parseFloat(underscoreMatch[1]);

    return fallback;
  }


  // ✅ setTransformOriginToCenter: sets transform-origin to visual center of any SVG element
  function setTransformOriginToCenter(element) {
    const bbox = element.getBBox();
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    element.style.transformOrigin = `${cx}px ${cy}px`;
  }

  // ✅ getEasingFromId: supports ease_3, ease(3), and ease[1,3,5]
  function getEasingFromId(id) {
    const easeMap = {
      '0': 'linear', '1': 'easeInSine', '2': 'easeOutSine', '3': 'easeInOutSine',
      '4': 'easeInBack', '5': 'easeOutBack', '6': 'easeInOutBack',
      '7': 'easeInElastic', '8': 'easeOutElastic', '9': 'easeInOutElastic'
    };

    const easeListMatch = id.match(/ease\[(.*?)\]/);
    const easeParenMatch = id.match(/ease\((\d+)\)/);
    const easeUnderscoreMatch = id.match(/_ease_(\d+)/);

    if (easeListMatch) {
      const options = easeListMatch[1].split(',').map(v => easeMap[v.trim()]).filter(Boolean);
      if (options.length) return () => options[Math.floor(Math.random() * options.length)];
    }
    const code = easeParenMatch?.[1] || easeUnderscoreMatch?.[1];
    return easeMap[code] || 'linear';
  }


  /**
  * Parses compact animation value sequences from an ID string, supporting both
  * fixed values and randomized value generation in bracketed namespace format.
  *
  * Supports syntax like:
  *   - s[1,2,3]
  *   - s[rnd6x0-40] or s[r6x0-40]   ← generates 6 random values between 0 and 40
  *
  * Options:
  *   - 'rnd' or 'r' prefix: defines a random sequence
  *   - 'x' after count: regenerate sequence on every animation loop (e.g. rnd6x...)
  *   - underscore or dash between min and max are supported: e.g. rnd4x10_30
  *
  * @param {string} id - The object's ID attribute.
  * @param {string} prefix - The namespace prefix to look for (e.g. 's', 'r', etc.).
  * @returns {object|null} An object with `values`, `regenerate`, and `generate` function, or null if parsing failed.
  */
  /**
   * Parses compact animation values from IDs like s[...], sXY[...], deg[...], etc.
   * Supports:
   *   - rnd(6x0-360x) → random range with regenerate
   *   - 5x1-2x        → shorthand mini-random
   *   - static values like [1,2,3]
   *   - Logs failures at each stage
   */
  function parseCompactAnimationValues(id, prefix = 's') {
    // console.log(`[parseCompact] 🧪 Testing parseCompactAnimationValues(${prefix}):`, id);

    // Normalize prefix search
    id = id.replace(/^r_/, '').replace(/^obj_rotate_/, '');

    const pattern = new RegExp(`${prefix}\\[(.*?)\\]`);
    const match = id.match(pattern);
    if (!match) {
      // console.log(`[parseCompact] ❌ No match found for prefix ${prefix} in: ${id}`);
      return null;
    }

    let raw = match[1].trim();
    // console.log(`[parseCompact] ✅ Matched ${prefix}[...] → raw: ${raw}`);

    // --- rnd(...) wrapper
    if (raw.startsWith('rnd(') && raw.endsWith(')')) {
      const inner = raw.slice(4, -1);

      const miniMatch = inner.match(/^(\d+)x(\d+(?:\.\d+)?)[-_](\d+(?:\.\d+)?)(x?)$/);
      if (miniMatch) {
        const count = parseInt(miniMatch[1]);
        const min = parseFloat(miniMatch[2]);
        const max = parseFloat(miniMatch[3]);
        const regen = miniMatch[4] === 'x';
        const generate = () => Array.from({ length: count }, () => min + Math.random() * (max - min));
        return { values: generate(), regenerate: regen, generate };
      }

      // fallback: list syntax rnd(1,2,3)
      const values = inner.split(',').map(Number).filter(n => !isNaN(n));
      const generate = () => values.sort(() => Math.random() - 0.5);
      return { values: generate(), regenerate: true, generate };
    }

    // --- legacy mini-random: 5x1-3x
    const miniMatch = raw.match(/^(\d+)x(\d+(?:\.\d+)?)[-_](\d+(?:\.\d+)?)(x?)$/);
    if (miniMatch) {
      const count = parseInt(miniMatch[1]);
      const min = parseFloat(miniMatch[2]);
      const max = parseFloat(miniMatch[3]);
      const regen = miniMatch[4] === 'x';
      const generate = () => Array.from({ length: count }, () => min + Math.random() * (max - min));
      return { values: generate(), regenerate: regen, generate };
    }

    // --- XY pair fallback: [[a,b], [c,d]]
    if (prefix === 'sXY' && raw.includes('],')) {
      try {
        const tupleVals = JSON.parse(`[${raw}]`);
        if (Array.isArray(tupleVals) && Array.isArray(tupleVals[0])) {
          return { values: tupleVals, regenerate: false };
        }
      } catch (e) {
        // console.warn(`[parseCompact] ⚠️ Failed to parse XY pair array in ${raw}`);
      }
    }

    // --- fallback: static comma-separated values
    const values = raw.split(',').map(v => {
      const parsed = Number(v);
      return isNaN(parsed) ? v : parsed;
    }).filter(v => typeof v === 'number' || Array.isArray(v));

    if (values.length) {
      // console.log(`[parseCompact] 📦 Static parsed values:`, values);
      return { values, regenerate: false };
    }

    // console.warn(`[parseCompact] ❌ Failed to extract values from raw: ${raw}`);
    return null;
  }






  // ✅ Helper: Resolves pivot_x/y(...) and pivot(x,y) with % or px

  function applyPivotFromId(object, id) {
    const bbox = object.getBBox();
    const pivotMatch = id.match(/pivot\(([^,]+),([^)]+)\)/);
    const pxRaw = extractTagValue(id, 'pivot_x', null);
    const pyRaw = extractTagValue(id, 'pivot_y', null);

    let px = pivotMatch ? pivotMatch[1].trim() : pxRaw;
    let py = pivotMatch ? pivotMatch[2].trim() : pyRaw;

    const resolvePivotValue = (val, ref) => {
      if (typeof val === 'string' && val.endsWith('%')) {
        return bbox.x + (parseFloat(val) / 100) * ref;
      }
      return parseFloat(val);
    };

    if (px !== null && py !== null) {
      const pivotX = resolvePivotValue(px, bbox.width);
      const pivotY = resolvePivotValue(py, bbox.height);
      object.style.transformOrigin = `${pivotX}px ${pivotY}px`;
    } else {
      setTransformOriginToCenter(object);
    }
  }



  /**
   * Rotates an SVG object using parameters encoded in its ID.
   *
   * Supports:
   * - alt(...) pingpong rotation
   * - deg[...] step-based rotation
   * - rpm(...) continuous rotation
   * - pivot(...) or pivot_x/y
   * - easing: ease(...) or ease[...] or ease[rnd(...)]
   * - deferred start via _t(1)
   *
   * Registered in window.runningAnimations for observer control.
   */
  function startRotate(object) {
    if (!object || !object.id) return;
    const rawId = object.id;
    const dataId = object.getAttribute('data-id');
    const id = dataId || rawId;  // Use data-id if present, otherwise fallback to regular id

    // 🛑 Triggerable mode: store and wait for cue
    if (id.includes('_t(1)')) {
      if (!window.pendingRotationAnimations) window.pendingRotationAnimations = new Map();
      pendingRotationAnimations.set(id, () => startRotate(object));
      console.log(`[rotatest] ⏸ Deferred rotation for ${id}`);
      return;
    }

    console.log(`[rotatest] Dispatching startRotate for ${id}`);
    const easing = getEasingFromId(id);

    // 1. ALT (pingpong) mode
    const altMatch = id.match(/alt\(([^)]+)\)/);
    if (altMatch) {
      const altAngle = parseFloat(altMatch[1]);
      const dir = extractTagValue(id, 'dir', 1);
      const speed = extractTagValue(id, 'speed', 1.0);
      applyPivotFromId(object, id);

      console.log(`[rotatest] ALT mode → angle=${altAngle}, dir=${dir}, speed=${speed}, easing=${easing}`);

      const anim = anime({
        targets: object,
        keyframes: [
          { rotate: `${dir >= 0 ? altAngle : -altAngle}deg` },
          { rotate: `${dir >= 0 ? -altAngle : altAngle}deg` }
        ],
        duration: speed * 1000,
        easing: typeof easing === 'function' ? easing() : easing,
        direction: 'alternate',
        loop: true,
        autoplay: true
      });

      window.runningAnimations[object.id] = {
        play: () => anim.play?.(),
        pause: () => anim.pause?.(),
        resume: () => anim.play?.(),
        wasPaused: false
      };
      return;
    }

    // 2. Step rotation via deg[]
    const degParsed = parseCompactAnimationValues(id, 'deg');

    // 3. Continuous rotation fallback
    if (!degParsed) {
      const rpm = extractTagValue(id, 'rpm', 1.0);
      const direction = extractTagValue(id, 'dir', 1);
      applyPivotFromId(object, id);

      const duration = (60 / rpm) * 1000;
      console.log(`[rotatest] CONTINUOUS mode → rpm=${rpm}, dir=${direction}, duration=${duration}ms, easing=${easing}`);

      const anim = anime({
        targets: object,
        rotate: direction >= 0 ? '+=360' : '-=360',
        duration: duration,
        easing: typeof easing === 'function' ? easing() : easing,
        loop: true,
        autoplay: true
      });

      window.runningAnimations[object.id] = {
        play: () => anim.play?.(),
        pause: () => anim.pause?.(),
        resume: () => anim.play?.(),
        wasPaused: false
      };
      return;
    }

    // 🔁 deg[...] timeline
    if (degParsed.values.length < 2) return;
    let angleValues = degParsed.values;

    const durParsed = parseCompactAnimationValues(id, 'dur');
    let pauseDurations = durParsed?.durations || [];
    const hasRegenerate = durParsed?.regenerate;
    if (hasRegenerate) object.__regenerateDurations = durParsed.generate;

    const seqDur = extractTagValue(id, 'seqdur', null);
    const rotationSpeed = extractTagValue(id, 'speed', null);

    let baseDur;
    if (seqDur) {
      baseDur = (seqDur * 1000) / (angleValues.length - 1);
      console.log(`[rotatest] Using seqdur: ${seqDur}s → step duration: ${baseDur}ms`);
    } else {
      baseDur = (rotationSpeed || 0.5) * 1000;
      console.log(`[rotatest] Using speed: ${rotationSpeed || 0.5}s → step duration: ${baseDur}ms`);
    }

    applyPivotFromId(object, id);

    const buildTimeline = (initialAngle = null) => {
      let angles = angleValues;

      if (initialAngle !== null && typeof degParsed.generate === 'function') {
        angles = [initialAngle, ...degParsed.generate()];
        angleValues = angles;
      }

      const timeline = anime.timeline({
        targets: object,
        loop: false,
        autoplay: true
      });

      for (let i = 0; i < angles.length; i++) {
        const angle = angles[i];
        const currentEasing = typeof easing === 'function' ? easing() : easing;
        timeline.add({
          rotate: `${angle}deg`,
          duration: baseDur,
          easing: currentEasing
        });

        if (i < angles.length - 1) {
          const pauseSec = pauseDurations[i % pauseDurations.length] || 1.0;
          timeline.add({ duration: pauseSec * 1000 });
        }
      }

      timeline.finished.then(() => {
        if (hasRegenerate && object.__regenerateDurations) {
          pauseDurations = object.__regenerateDurations();
        }
        const currentTransform = object.style.transform || '';
        const match = currentTransform.match(/rotate\(([-\d.]+)deg\)/);
        const lastAngle = match ? parseFloat(match[1]) : angles[angles.length - 1];
        buildTimeline(lastAngle);
      });
    };

    buildTimeline();
  }



  /**
   * startRotation(object)
   * Starts a continuous or alternate (pingpong) rotation animation on an object using Anime.js.
   * Supports RPM, custom pivot points, easing, direction, and alternate oscillation.
   * Compatible with nested group logic and unique DOM IDs.
   * Now supports `_t(1)` to defer animation until triggered externally.
   */
  const startRotation = (object) => {
    if (!object || !object.id) return;
    const rawId = object.id;
    const dataId = object.getAttribute('data-id');
    const id = dataId || rawId;  // Use data-id if present, otherwise fallback to regular id

    // 🕹 Check for triggerable mode
    if (id.includes('_t(1)')) {
      if (!window.pendingRotationAnimations) {
        window.pendingRotationAnimations = new Map();
      }
      console.log(`[rotate] ⏸ Deferred rotation for ${id}`);
      pendingRotationAnimations.set(id, () => startRotation(object));
      return;
    }

    // 🔍 Parse ID parameters
    const rpmMatch = id.match(/_rpm_([\d.]+)/);
    const rpm = rpmMatch ? parseFloat(rpmMatch[1]) : 1.0;

    const directionMatch = id.match(/_dir_(-?\d+)/);
    const direction = directionMatch ? parseInt(directionMatch[1], 10) : 1;

    const pivotXMatch = id.match(/_pivot_x_(-?\d+(\.\d+)?)/);
    const pivotYMatch = id.match(/_pivot_y_(-?\d+(\.\d+)?)/);
    const pivotX = pivotXMatch ? parseFloat(pivotXMatch[1]) : null;
    const pivotY = pivotYMatch ? parseFloat(pivotYMatch[1]) : null;

    const easingMatch = id.match(/_ease_([a-zA-Z0-9_]+)/);
    const easing = easingMatch ? easingMatch[1].replace(/_/g, '-') : 'linear';

    const alternateMatch = id.match(/_alternate_deg_([\d.]+)/);

    // 🎯 Determine transform origin
    if (pivotX !== null && pivotY !== null) {
      object.style.transformOrigin = `${pivotX}px ${pivotY}px`;
    } else {
      const bbox = object.getBBox();
      const centerX = bbox.x + bbox.width / 2;
      const centerY = bbox.y + bbox.height / 2;
      object.style.transformOrigin = `${centerX}px ${centerY}px`;
    }

    const duration = (60 / rpm) * 1000;

    let animeInstance;

    // ↔️ Alternate (pingpong) rotation
    if (alternateMatch) {
      const deg = parseFloat(alternateMatch[1]);
      const start = direction === 0 ? deg : -deg;
      const end = -start;

      animeInstance = anime({
        targets: object,
        keyframes: [
          { rotate: start },
          { rotate: end }
        ],
        duration: duration,
        easing: easing,
        direction: 'alternate',
        loop: true,
        autoplay: false // Deferred start
      });
    } else {
      // 🔁 Standard continuous rotation
      animeInstance = anime({
        targets: object,
        rotate: direction === 1 ? '+=360' : '-=360',
        duration: duration,
        easing: easing,
        loop: true,
        autoplay: false // Deferred start
      });
    }

    animeInstance.play();

    // 📦 Register in global runningAnimations map for pause/resume
    window.runningAnimations[object.id] = {
      play: () => animeInstance.play(),
      pause: () => animeInstance.pause(),
      resume: () => animeInstance.play(),
      wasPaused: false
    };

    // console.log(`[DEBUG] Started rotation for ${id}`);
  };



  const stopRotation = (object) => {
    //console.log(`[DEBUG] Stopping rotation for object: ${object.id}`);
    anime.remove(object); // Stop the Anime.js animation
  };





  /**
   * startScale(object)
   *
   * Initializes and animates SVG object scaling based on its `id` or `data-id`.
   * Supports:
   * - Uniform scale (`s[...]`)
   * - Non-uniform scale (`sXY[...]`, `sX[...]`, `sY[...]`)
   * - Randomized or regenerating sequences
   * - Legacy format `s_seq_...`
   * - Triggerable animations (`_t(1)`)
   * - Optional duration weights via `dur_...`
   * - Pivot/origin control: `_pivot_x_`, `_pivot_y_`
   * - Optional easing, looping, alternation, etc.
   *
   * Registers into `window.runningAnimations` and `window.pendingScaleAnimations` if needed.
   */

  const startScale = (object) => {
    const rawId = object.id;
    const dataId = object.getAttribute('data-id');
    const id = dataId || rawId;
    // console.log(`[scale] 🟡 Starting scale animation for ${object.id} (parsed id: ${id})`);

    const easeMap = {
      '0': 'linear', '1': 'easeInSine', '2': 'easeOutSine', '3': 'easeInOutSine',
      '4': 'easeInBack', '5': 'easeOutBack', '6': 'easeInOutBack',
      '7': 'easeInElastic', '8': 'easeOutElastic', '9': 'easeInOutElastic'
    };

    const seqDur = extractTagValue(id, 'seqdur', null);
    const easingCode = id.match(/ease_?(\d)/)?.[1];
    const easing = easeMap[easingCode] || 'linear';
    const modeRaw = id.match(/_(once|alt|bounce|pulse|pde)/)?.[1] || 'alt';
    const mode = ['pde', 'pulse', 'alt', 'bounce'].includes(modeRaw) ? 'alternate' : 'once';

    const pivotX = extractTagValue(id, 'pivot_x', null);
    const pivotY = extractTagValue(id, 'pivot_y', null);
    const bbox = object.getBBox();
    const originX = pivotX !== null ? pivotX : bbox.x + bbox.width / 2;
    const originY = pivotY !== null ? pivotY : bbox.y + bbox.height / 2;
    object.style.transformOrigin = `${originX}px ${originY}px`;

    const isXY = id.includes("sXY[");
    const isX = id.includes("sX[");
    const isY = id.includes("sY[");
    const compactPrefix = isXY ? "sXY" : isX ? "sX" : isY ? "sY" : "s";

    // console.log(`[parseCompact] 🧪 Trying parseCompactAnimationValues(${compactPrefix}): ${id}`);
    let scaleParsed = parseCompactAnimationValues(id, compactPrefix);
    let scaleValues = [];

    // ✅ Handle compact animation values
    if (scaleParsed) {
      scaleValues = scaleParsed.values;
      if (scaleParsed.regenerate) {
        object.__regenerateScaleSeq = scaleParsed.generate;
        scaleValues = scaleParsed.generate(); // Initial random set
        // console.log(`[scale] 🔁 Generated random scale values:`, scaleValues);
      }
    }

    // ✅ Legacy fallback for s_seq_...
    if (scaleValues.length === 0) {
      // console.log(`[fallback] ⏳ Trying legacy s_seq_ fallback: ${id}`);
      const legacyMatch = id.match(/s(?:eq)?_([\d._]+)/);
      if (legacyMatch) {
        scaleValues = legacyMatch[1].split('_').map(n => parseFloat(n)).filter(n => !isNaN(n));
        // console.log(`[fallback] ✅ Parsed legacy scale values:`, scaleValues);
      }
    }

    // ✅ Sanity check
    scaleValues = scaleValues.map(val => {
      if (typeof val === 'number') return val;
      if (Array.isArray(val)) return val;
      const num = parseFloat(val);
      return isNaN(num) ? 1 : num;
    });

    if (scaleValues.length === 0) {
      console.warn(`[scale] ❌ No valid scale values found for ${id}`);
      return;
    }

    const useXY = isXY || Array.isArray(scaleValues[0]);
    const steps = scaleValues.length;

    const durMatch = id.match(/dur_((?:\d+_?)+)/);
    const durParts = durMatch ? durMatch[1].split('_').map(Number) : null;
    const totalWeight = durParts ? durParts.reduce((a, b) => a + b, 0) : steps;
    const baseDur = (seqDur || 1) * 1000;
    const durations = [];

    for (let i = 0; i < steps; i++) {
      const weight = durParts ? durParts[i % durParts.length] : 1;
      durations.push((weight / totalWeight) * baseDur);
    }

    const timeline = anime.timeline({
      targets: object,
      easing: easing,
      loop: mode !== 'once',
      direction: mode === 'alternate' ? 'alternate' : 'normal',
      autoplay: false
    });

    // ✅ Add each step to the timeline
    for (let i = 0; i < steps; i++) {
      const val = scaleValues[i];
      const scaleX = useXY ? val[0] : isX ? val : val;
      const scaleY = useXY ? val[1] : isY ? val : val;

      timeline.add({
        scaleX,
        scaleY,
        duration: durations[i] || baseDur / steps,
        begin: () => console.log(`[scale] Step ${i} → scaleX(${scaleX}) scaleY(${scaleY})`)
      });
    }

    // ✅ Regenerate entire loop on finish
    if (object.__regenerateScaleSeq) {
      timeline.finished.then(() => {
        const newValues = object.__regenerateScaleSeq();
        // console.log(`[scale] 🔁 Regenerated scale sequence:`, newValues);
        requestAnimationFrame(() => startScale(object)); // full restart
      });
    }

    const key = dataId || rawId;
    const isTriggerable = id.includes('_t(1)');

    if (isTriggerable) {
      if (!window.pendingScaleAnimations) window.pendingScaleAnimations = new Map();
      pendingScaleAnimations.set(key, () => {
        console.log(`[scale] 🔴 timeline.play() called for ${key}`);
        requestAnimationFrame(() => timeline.play());
      });
      console.log(`[scale] Deferred scale stored for ${key}`);
    } else {
      timeline.play();
    }

    // ✅ Register animation hooks
    window.runningAnimations[object.id] = {
      play: () => {
        if (isTriggerable) {
          console.log(`[scale] 🚫 Skipping auto-play for triggerable ${object.id}`);
          return;
        }
        timeline.play();
      },
      pause: () => timeline.pause(),
      resume: () => {
        if (isTriggerable) {
          console.log(`[scale] 🚫 Skipping resume for triggerable ${object.id}`);
          return;
        }
        timeline.play();
      },
      wasPaused: false,
      triggerable: isTriggerable
    };
  };



  /**
   * Triggers any deferred animation attached to a short object ID via `data-id`.
   *
   * Usage:
   *   <circle id="myDot" data-id="s[1,2,1.5]_seqdur_3_ease_5_t(1)"></circle>
   *   cue: c-t_o(myDot)... will trigger the actual animation stored in `data-id`.
   *
   * Supports: rotation, scale, path-follow, and other ID-driven animations.
   * Dependencies: initializeSVG() must have scanned all animated IDs first.
   */

  function triggerDeferredAnimations(objectId) {
    const el = document.getElementById(objectId);
    if (!el) {
      console.warn(`[triggerDeferredAnimations] ⚠️ No element found for ID: ${objectId}`);
      return;
    }

    const targetId = el.getAttribute("data-id");
    if (!targetId) {
      console.warn(`[triggerDeferredAnimations] ❌ No data-id found on ${objectId}`);
      return;
    }

    const targetEl = document.getElementById(targetId);
    if (!targetEl) {
      console.warn(`[triggerDeferredAnimations] ❌ No element with ID ${targetId} found.`);
      return;
    }

    // ✅ Trigger animation start (used by scale, rotation, path-follow, etc)
    if (window.runningAnimations?.[targetId]) {
      console.log(`[triggerDeferredAnimations] ▶️ Starting animation for ${targetId}`);
      window.runningAnimations[targetId].play?.();
    } else {
      console.warn(`[triggerDeferredAnimations] ❓ No registered animation for ${targetId}`);
    }
  }






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
  let pathVariantsMap = {};

  window.loadExternalSVG = (svgSource) => {
    console.log('[svgpersist] Loading external SVG...');

    // 🟨 Base64 inline SVG
    if (svgSource.startsWith("data:image/svg+xml;base64,")) {
      console.log(`[svgpersist] Loaded base64 SVG (length: ${svgSource.length})`);
      const parser = new DOMParser();
      const svgElement = parser.parseFromString(atob(svgSource.split(",")[1]), 'image/svg+xml').documentElement;
      svgElement.id = "score";

      scoreContainer.innerHTML = '';
      scoreContainer.appendChild(svgElement);

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

        scoreContainer.innerHTML = '';
        scoreContainer.appendChild(svgElement);

        initializeSVG(svgElement);
        storePathVariants(svgElement);
      })
      .catch(err => {
        console.error('[svgpersist] ERROR loading SVG:', err);
        if (svgSource.startsWith("blob:")) {
          console.warn('[svgpersist] Fallback to draft.svg after blob failure.');
          loadExternalSVG("svg/draft.svg");
        }
      });
  };

  const storePathVariants = (svgElement) => {
    pathVariantsMap = {};
    const allPaths = svgElement.querySelectorAll("path");
    allPaths.forEach(path => {
      const id = path.id;
      if (id && id.match(/^path-\d+-\d+$/)) {
        const baseID = id.replace(/-\d+$/, '');
        if (!pathVariantsMap[baseID]) pathVariantsMap[baseID] = [];
        pathVariantsMap[baseID].push(path);
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
      loadExternalSVG("svg/draft.svg");
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







  const initializeSVG = (svgElement) => {

    if (!svgElement) {
      console.error("[ERROR] No SVG element provided to initializeSVG.");
      return;
    }

    scoreSVG = svgElement;

    console.log("calling assignCues...");
    assignCues(scoreSVG);    



    document.querySelectorAll("use").forEach(u => {
      // console.log("[DEBUG <use>]", u.id, "→", u.getAttribute("xlink:href") || u.getAttribute("href"));
    });

    //console.log("[TRANSFORM-FIX] 🔍 Starting flattening of all groups...");

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
      playheadX = 0;
      elapsedTime = 0;
      scoreContainer.scrollLeft = playheadX;
      console.log(`[DEBUG] Initial scrollLeft set to: ${scoreContainer.scrollLeft}`);

      preloadSpeedCues();

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
      updateStopwatch();
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

    // Identify the popup to dismiss
    const popups = document.querySelectorAll('.popup');
    let popupDismissed = false;

    popups.forEach((popup) => {
      if (popup.classList.contains('active')) {  // Check if popup is active
        console.log(`[DEBUG] Popup dismissed: ${popup.id}`);
        popup.classList.add('hidden');
        popup.classList.remove('active'); // Ensure it also removes active state
        popupDismissed = true;
      }
    });

    if (popupDismissed) {
      console.log('[CLIENT] Resuming playback or animation after popup dismissal.');

      // Resume playback or animation
      isPlaying = true;
      animationPaused = false;

      // Remove blur effect from all elements
      document.body.querySelectorAll('.blur-background').forEach((element) => {
        element.classList.remove('blur-background');
      });

      startAnimation(); // Restart the animation loop

    } else {
      console.log('[DEBUG] No active popups found to dismiss.');
    }

    // Prevent event propagation to avoid unwanted triggers
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

    // 🔥 Ensure playheadX is recalculated on fullscreen change
    // recalculatePlayheadPosition(scoreSVG);
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

  /////// START OF SPEED LOGIC ///////////////////////////////////////////////////

  let speedMultiplier = 1.0;

  /**
  * Handles speed cue changes by setting and synchronizing the speed multiplier.
  * Ensures speed changes are only applied when valid and different from the current value.
  * Updates the UI and sends the new speed multiplier to the server if changed manually.
  */

  const handleSpeedCue = (cueId, newMultiplier) => {
    /**
    * ✅ Processes `cueSpeed` messages from clients.
    * - Extracts and validates the speed multiplier before applying.
    * - Prevents redundant updates by checking the current speed.
    * - Sends a WebSocket message only if speed changes.
    */
    console.log(`[DEBUG] 🎯 Triggering Speed Cue: ${cueId}`);

    // ✅ Ensure multiplier is a valid positive number
    newMultiplier = parseFloat(newMultiplier.toFixed(1));
    if (isNaN(newMultiplier) || newMultiplier <= 0) {
      console.warn(`[WARNING] ❌ Invalid speed multiplier detected: ${cueId}`);
      return;
    }

    // ✅ Prevent redundant updates
    if (speedMultiplier === newMultiplier) {
      console.log(`[DEBUG] ⚠️ Speed is already set to ${speedMultiplier}. No update needed.`);
      return;
    }

    speedMultiplier = newMultiplier;
    console.log(`[DEBUG] ✅ Speed multiplier set to ${speedMultiplier}`);
    updateSpeedDisplay();

    // ✅ Send update to WebSocket only if it was not from a sync message
    if (wsEnabled && socket && socket.readyState === WebSocket.OPEN && !incomingServerUpdate) {
      const speedMessage = {
        type: "set_speed_multiplier",
        multiplier: speedMultiplier,
        timestamp: Date.now(),
      };

      socket.send(JSON.stringify(speedMessage));
      console.log(`[DEBUG] 📡 Sent speed update to server:`, speedMessage);
    }
  };


  /**
  * Determines the correct speed multiplier when seeking to a new position.
  * Finds the most recent speed cue before the playhead and applies its value.
  * Resets to the default speed (1.0) if no previous speed cue is found.
  */

  const getSpeedForPosition = (xPosition) => {

    const viewportOffset = scoreContainer.offsetWidth / 2; // ✅ Center offset
    const adjustedPlayheadX = xPosition + viewportOffset; // ✅ Align with visual playhead

    console.log(`[DEBUG] Looking for speed at adjusted position: ${adjustedPlayheadX} (Raw playheadX: ${xPosition})`);
    //console.log("[DEBUG] Current speedCueMap:", speedCueMap);

    if (speedCueMap.length === 0) {
      console.warn("[WARNING] No speed cues exist. Defaulting to 1.0x speed.");
      return 1.0;
    }

    let lastSpeedCue = speedCueMap
      .filter(cue => cue.position <= adjustedPlayheadX)
      .slice(-1)[0];

    if (lastSpeedCue) {
      console.log(`[DEBUG] ✅ Applying Speed: ${lastSpeedCue.multiplier} (From Cue at ${lastSpeedCue.position})`);

      speedMultiplier = lastSpeedCue.multiplier; // ✅ Ensure it is stored globally
      updateSpeedDisplay();

      return speedMultiplier;
    } else {
      console.log("[DEBUG] ❗ No previous speed cue found, defaulting to 1.0");
      return 1.0;
    }
  };




  /**
  * Preloads all speed cues from the score and stores them in a sorted list.
  * Extracts speed values and their positions to enable accurate speed restoration.
  * Ensures correct speed lookup when seeking by sorting cues by position.
  */

  const preloadSpeedCues = () => {
    speedCueMap = []; // Reset stored cues

    // ✅ Find all speed cues in the score
    document.querySelectorAll('[id^="speed_"]').forEach(element => {
      const cueId = element.id;
      const match = cueId.match(/speed_(\d+(\.\d+)?)/); // Support floats

      if (match) {
        const speedValue = parseFloat(match[1]);
        const cuePosition = getCuePosition(element); // Function to determine X position

        speedCueMap.push({ position: cuePosition, multiplier: speedValue });
      }
    });

    // ✅ Sort cues by position to ensure correct lookup when seeking
    speedCueMap.sort((a, b) => a.position - b.position);

    console.log("[DEBUG] Preloaded speed cues:", speedCueMap);
  };



  /**
  * Handles speed multiplier adjustments via keyboard shortcuts and UI buttons.
  * Updates the display and syncs changes with the server if WebSocket is enabled.
  */

  document.addEventListener('keydown', (event) => {
    switch (event.key) {
      case '+':
        speedMultiplier = Math.min(speedMultiplier + 0.1, 3);
        console.log(`[DEBUG] Speed multiplier increased to ${speedMultiplier}`);

        if (wsEnabled && socket) {
          socket.send(JSON.stringify({ type: 'set_speed_multiplier', multiplier: speedMultiplier }));
          console.log(`[CLIENT] Sent speed multiplier change to server: ${speedMultiplier}`);
        }
        break;

      case '-':
        speedMultiplier = Math.max(speedMultiplier - 0.1, 0.1);
        console.log(`[DEBUG] Speed multiplier decreased to ${speedMultiplier}`);

        if (wsEnabled && socket) {
          socket.send(JSON.stringify({ type: 'set_speed_multiplier', multiplier: speedMultiplier }));
          console.log(`[CLIENT] Sent speed multiplier change to server: ${speedMultiplier}`);
        }
        break;

      default:
        break;
    }
  });

  document.getElementById("increaseSpeed").addEventListener("click", () => {
    speedMultiplier = Math.min(speedMultiplier + 0.1, 3.0); // Limit to 3x speed
    updateSpeedDisplay();
  });

  document.getElementById("decreaseSpeed").addEventListener("click", () => {
    speedMultiplier = Math.max(speedMultiplier - 0.1, 0.5); // Limit to 0.5x speed
    updateSpeedDisplay();
  });

  document.getElementById("resetSpeed").addEventListener("click", () => {
    speedMultiplier = 1.0;
    updateSpeedDisplay();
  });

  function updateSpeedDisplay() {
    document.getElementById("speedDisplay").textContent = `${speedMultiplier.toFixed(1)}×`;
    sendSpeedUpdateToServer(speedMultiplier);

  }

  function sendSpeedUpdateToServer(speed) {
    if (!window.socket || socket.readyState !== WebSocket.OPEN) {
      console.warn("[WARNING] WebSocket not available. Skipping speed update.");
      return;
    }
    socket.send(JSON.stringify({ type: "speedUpdate", speed }));
  }

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
  * Adjusts playheadX proportionally to prevent scaling misalignment.
  * Uses scoreContainer width instead of viewport width for scaling calculations.
  * Rounds scrollLeft to prevent sub-pixel rendering issues.
  * Ensures smooth and precise playhead alignment after resizing.
  */

  let previousViewportWidth = scoreContainer.offsetWidth; // Track score container width
  let previousMaxScrollDistance = null; // Track last max scroll distance

  const calculateMaxScrollDistance = () => {
    const svgElement = document.querySelector('svg');

    if (!scoreContainer || !svgElement) {
      console.warn("[WARNING] Missing scoreContainer or SVG, cannot calculate maxScrollDistance.");
      return;
    }

    // Get actual rendered width of the SVG instead of viewBox
    // const svgWidth = svgElement.getBoundingClientRect().width;
    const svgWidth = svgElement.viewBox.baseVal.width;


    // Detect scale changes using scoreContainer width instead of viewport width
    const newScoreContainerWidth = scoreContainer.offsetWidth;
    const scaleRatio = newScoreContainerWidth / previousViewportWidth;

    // Update max scroll distance to the new SVG width
    maxScrollDistance = svgWidth;

    console.log(`[DEBUG] 📏 Updated maxScrollDistance: ${maxScrollDistance} (SVG Rendered Width: ${svgWidth})`);

    // Adjust playheadX using proportional scaling
    if (previousMaxScrollDistance !== null && previousMaxScrollDistance > 0) {
      let playheadPercentage = playheadX / previousMaxScrollDistance;
      playheadX = playheadPercentage * maxScrollDistance;
      console.log(`[DEBUG] 🔄 Recalculated playheadX: ${playheadX}`);
    }

    // Update stored values
    previousMaxScrollDistance = maxScrollDistance;
    previousViewportWidth = newScoreContainerWidth;

    scoreContainer.scrollLeft = playheadX;
    console.log(`[DEBUG] 🎯 Updated scoreContainer.scrollLeft: ${scoreContainer.scrollLeft}`);
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

    console.log(`[DEBUG] 🔄 WebSocket Sync Received - playheadX=${state.playheadX}, isPlaying=${state.isPlaying}, scoreWidth=${state.scoreWidth}`);

    if (!isNaN(state.playheadX) && state.playheadX >= 0) {
      if (!isSeeking) {
        playheadX = state.playheadX;
        //
        // // ✅ Ensure playheadX is properly adjusted after a screen resize
        // if (recentlyRecalculatedPlayhead) {
        //     const widthRatio = window.innerWidth / previousScreenWidth;
        //     playheadX *= widthRatio;
        //     console.log(`[DEBUG] 🔄 Adjusted playheadX after resize: ${playheadX}`);
        // }

        scoreContainer.scrollLeft = Math.max(0, playheadX);
        console.log(`[DEBUG] Updated scoreContainer.scrollLeft=${scoreContainer.scrollLeft}`);

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
        console.log(`[DEBUG] Updated scoreContainer.scrollLeft=${scoreContainer.scrollLeft}`);
      } else {
        console.log("[DEBUG] Skipping playheadX update from syncState during seeking.");
      }
    }

    isPlaying = state.isPlaying;
    isPlaying ? startAnimation() : stopAnimation();

    if (wsEnabled && socket) {
      socket.send(JSON.stringify({ type: "sync", state: { playheadX, elapsedTime } }));
      console.log(`[CLIENT] Sent sync update after state change: playheadX=${playheadX}, elapsedTime=${elapsedTime}`);
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

    if (!isPlaying || !freewheelingActive) {
      console.log("[DEBUG] Freewheeling stopped.");
      freewheelingActive = false;
      return;
    }

    const now = Date.now();
    const timeSinceLastSync = now - lastSyncTime;

    // ✅ Calculate estimated position based on playback speed
    const estimatedIncrement = ((timeSinceLastSync / 1000) * speedMultiplier) * pixelsPerSecond;
    estimatedPlayheadX = lastSyncPlayheadX + estimatedIncrement;

    // ✅ Ensure playheadX stays within valid bounds
    if (estimatedPlayheadX > scoreWidth) estimatedPlayheadX = scoreWidth;
    playheadX = estimatedPlayheadX;
    scoreContainer.scrollLeft = playheadX;

    // ✅ Auto-correct small desyncs based on server sync updates
    if (Math.abs(playheadX - serverSyncPlayheadX) > 50) {
      console.log("[DEBUG] Auto-correcting playheadX due to drift.");
      playheadX = serverSyncPlayheadX;
    }

    // ✅ Throttle debug logs to avoid spamming console
    if (now - lastDebugLog > 500) {
      console.log(`[DEBUG] Freewheeling Playhead: ${playheadX}`);
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
    const drift = serverElapsedTime - elapsedTime;

    if (Math.abs(drift) > driftThreshold) {
      //console.log([CLIENT] Correcting drift. Server: ${serverElapsedTime}, Local: ${elapsedTime}, Drift: ${drift});

      // Smoothly adjust elapsedTime using a weighted approach
      elapsedTime += drift * 0.1; // Adjust factor to balance smoothness vs speed
    }
  };




  lastAnimationFrameTime = null;

  const animate = async (currentTime) => {
    if (!isPlaying || isSeeking) {
      // console.log("[DEBUG] Animation stopped mid-frame.");
      return;
    }

    if (lastAnimationFrameTime === null) {
      lastAnimationFrameTime = currentTime;
    } else {
      const delta = (currentTime - lastAnimationFrameTime) * playbackSpeed;


      // const speedMultiplier = 2; // Double the speed

      // ✅ Predict new playheadX assuming constant playback speed
      const estimatedIncrement = ((delta * speedMultiplier) / duration) * scoreWidth;
      estimatedPlayheadX = playheadX + estimatedIncrement;

      // ✅ Ensure playheadX stays within valid bounds
      estimatedPlayheadX = Math.max(0, Math.min(estimatedPlayheadX, scoreWidth));

      playheadX = estimatedPlayheadX;
      scoreContainer.scrollLeft = playheadX;

      //console.log(`[DEBUG] Frame update - delta: ${delta}ms, estimatedPlayheadX: ${estimatedPlayheadX}, scoreContainer.scrollLeft: ${scoreContainer.scrollLeft}`);
    }

    lastAnimationFrameTime = currentTime;

    // ✅ Ensure visibility detection runs inside the frame update
    // ✅ Throttle visibility check to every 150ms
    const visibilityCheckInterval = 150;
    window.lastVisibilityCheckTime = window.lastVisibilityCheckTime || 0;

    if (currentTime - window.lastVisibilityCheckTime > visibilityCheckInterval) {
      checkAnimationVisibility();
      window.lastVisibilityCheckTime = currentTime;
    }

    // ✅ Ensure score movement matches playheadX
    updatePosition();
    updateSeekBar();
    updateStopwatch();
    await checkCueTriggers(elapsedTime);

    requestAnimationFrame(animate);
  };


  // Manages the playback animation loop, updating position, seek bar, and cues in real-time.
  // Uses requestAnimationFrame to ensure smooth, efficient animations synchronized with screen refresh.
  // Prevents unnecessary updates when paused, seeking, or stopped to optimize performance.
  // stopAnimation() cancels the loop when playback stops, preventing redundant frame updates.

  const startAnimation = () => {
    if (!isPlaying || animationPaused || isSeeking) {
      console.log("[DEBUG] Animation paused, stopped, or seeking, skipping start.");
      return;
    }

    // console.log("[DEBUG] Starting animation loop.");

    requestAnimationFrame((time) => {
      lastAnimationFrameTime = time;
      animate(time);
    });
  };


  const stopAnimation = () => {
    // console.log("[DEBUG] stopAnimation() called.");

    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      console.log("[DEBUG] Animation frame canceled.");
    } else {
      // console.warn("[WARNING] stopAnimation() called but animationFrameId was already null.");
    }

    isPlaying = false;
  };






  let isJumpingToMark = false; // ✅ Prevents unwanted position overrides












  // TODO maybe this can be removed now
  //
  // const updateAlignment = (elapsedTime) => {
  //   const svgElement = document.querySelector('#scoreContainer svg'); // Ensure correct selector
  //   if (!svgElement) {
  //     console.error("[ERROR] SVG element not found. Skipping alignment.");
  //     return; // Exit function if no SVG element
  //   }
  //   const duration = 20 * 60 * 1000; // 20 minutes in milliseconds
  //   const progress = elapsedTime / duration; // Fraction of time elapsed
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
    const progress = (elapsedTime / duration) * 100;
    seekBar.value = progress;
  };

  // Function to synchronize playback time
  // Updates `elapsedTime` and aligns the score
  // Ensures correct positioning and checks for active cues.
  const setElapsedTime = (newTime) => {
    elapsedTime = newTime; // ✅ Update playback time
    updatePosition(playheadX); // ✅ Use the correct playhead position

    checkCueTriggers(elapsedTime); // ✅ Recheck cues
  };


  //// SEEKING LOGIC ///////////////////////////////////////////

  // Starts seeking mode when the user clicks the seek bar.
  // Pauses playback to allow smooth scrubbing.
  seekBar.addEventListener('mousedown', () => {
    isSeeking = true; // ✅ Start seeking mode
    stopAnimation(); // ✅ Pause playback
    console.log("[CLIENT] Playback paused for seeking.");
  });

  // Updates playback time as the user moves the seek bar.
  // Converts percentage → time → X position for correct alignment.
  seekBar.addEventListener('input', (event) => {
    const newTime = (parseInt(event.target.value, 10) / 100) * duration; // ✅ Convert percentage to time
    setElapsedTime(newTime); // ✅ Adjust playback position

    // ✅ Real-time UI updates
    updatePosition(playheadX); // ✅ Ensure proper alignment
    updateSeekBar();
    updateStopwatch();
  });

  // Ends seeking mode and re-enables cues after debounce.
  // Sends a WebSocket `jump` message to sync all connected clients.

  let seekDebounceTime = 800; // ✅ Adjust debounce as needed
  let seekingTimeout = null;

  seekBar.addEventListener('mouseup', (event) => {
    isSeeking = false; // ✅ Stop seeking mode
    console.log("[CLIENT] Seeking ended. Applying debounce before re-enabling cues.");

    // ✅ Debounce before re-enabling cues
    if (seekingTimeout) clearTimeout(seekingTimeout);
    seekingTimeout = setTimeout(() => {
      console.log("[CLIENT] Cue triggering re-enabled after debounce.");
      isPlaying = true;
      startAnimation();

      // ✅ Send WebSocket sync to ensure all clients align
      if (wsEnabled && socket) {
        socket.send(JSON.stringify({ type: 'jump', playheadX, elapsedTime }));
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
    //console.log(`[DEBUG] Key pressed: ${event.key}`);

    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); // ✅ Prevents page scrolling

      isSeeking = true;
      // console.log(`[CLIENT] Seeking with ${event.key}, disabling cue triggering temporarily.`);

      if (event.key === 'ArrowLeft') {
        // console.log("[DEBUG] Calling rewind() from ArrowLeft.");
        rewind();
      } else if (event.key === 'ArrowRight') {
        // console.log("[DEBUG] Calling forward() from ArrowRight.");
        forward();
      }

      if (seekingTimeout) clearTimeout(seekingTimeout);
      seekingTimeout = setTimeout(() => {
        // console.log("[CLIENT] Cue triggering re-enabled after debounce (Arrow Key Seek).");
        isSeeking = false;
      }, seekDebounceTime);
    }
  });

  // end of seeking logiC ///////////////////////////////////////////////



  const updateStopwatch = () => {
    // Use the accurate elapsed time without re-applying totalPauseDuration unnecessarily
    const effectiveElapsedTime = elapsedTime;
    const minutesElapsed = Math.floor(effectiveElapsedTime / 60000);
    const secondsElapsed = Math.floor((effectiveElapsedTime % 60000) / 1000);
    const minutesTotal = Math.floor(duration / 60000);
    const secondsTotal = Math.floor((duration % 60000) / 1000);


    const formattedElapsed = `${minutesElapsed}:${secondsElapsed.toString().padStart(2, '0')}`;
    const formattedTotal = `${minutesTotal}:${secondsTotal.toString().padStart(2, '0')}`;

    // stopwatch.textContent = `${formattedElapsed} / ${formattedTotal}`;
    stopwatch.textContent = `${formattedElapsed}`;

    log(LogLevel.INFO, `Stopwatch updated: Elapsed = ${formattedElapsed}, Total = ${formattedTotal}`);
  };


  let isSeeking = false;

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

    // ✅ Ensure the playhead starts at the first position, not screen left
    playheadX = 0;
    elapsedTime = 0;


    // ✅ Instead of forcing `scrollLeft=0`, dynamically center the viewport
    scoreContainer.scrollLeft = Math.max(0, playheadX);

    console.log(`[DEBUG] After rewind -> playheadX=${playheadX}, scrollLeft=${scoreContainer.scrollLeft}`);
    console.log("[DEBUG] Rewinding to Zero...");
    console.log("[DEBUG] scoreContainer.scrollLeft before:", scoreContainer.scrollLeft);
    console.log("[DEBUG] scoreContainer offsetWidth:", scoreContainer.offsetWidth);
    console.log("[DEBUG] SVG Width:", scoreSVG.getBBox().width);
    console.log("[DEBUG] scoreContainer.scrollLeft after:", scoreContainer.scrollLeft);

    if (wsEnabled && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "jump", playheadX, elapsedTime }));
    }

    // // ✅ Apply and store correct speed based on the new playhead position
    speedMultiplier = getSpeedForPosition(playheadX);
    console.log(`[DEBUG] After rewind, applying speed: ${speedMultiplier}`);
    updateSpeedDisplay();

    updatePosition();
    updateSeekBar();
    updateStopwatch();
  };



  /**
  * ✅ Moves backward by a fixed distance on the score based on `playheadX`.
  * - Ensures smooth cue retriggering after rewinding.
  * - Updates UI elements and syncs with the server.
  */

  const rewind = () => {
    const REWIND_INCREMENT_X = (1000 / duration) * scoreWidth; // ✅ Convert time step into X coordinate shift
    playheadX = Math.max(playheadX - REWIND_INCREMENT_X, 0);

    scoreContainer.scrollLeft = playheadX;
    // console.log(`[DEBUG] Rewind applied. New playheadX: ${playheadX}`);

    // ✅ Calculate `elapsedTime` based on `playheadX` for reference
    elapsedTime = (playheadX / scoreWidth) * duration;
    // console.log(`[DEBUG] Synced elapsedTime from playheadX: ${elapsedTime}`);

    if (triggeredCues) {
      triggeredCues.clear(); // ✅ Ensure cues retrigger after rewind
      // console.log("[DEBUG] Cleared triggered cues due to rewind.");
    }

    // ✅ Apply and store correct speed based on the new playhead position
    speedMultiplier = getSpeedForPosition(playheadX);
    // console.log(`[DEBUG] After rewind, applying speed: ${speedMultiplier}`);
    updateSpeedDisplay();

    updatePosition();
    updateSeekBar();
    updateStopwatch();

    if (wsEnabled && socket) {
      socket.send(JSON.stringify({ type: "jump", playheadX, elapsedTime }));
    }
  };


  /**
  * ✅ Moves forward by a fixed distance on the score based on `playheadX`.
  * - Ensures smooth cue retriggering after advancing.
  * - Updates UI elements and syncs with the server.
  */

  const forward = () => {
    const FORWARD_INCREMENT_X = (1000 / duration) * scoreWidth; // ✅ Convert time step into X coordinate shift
    playheadX = Math.min(playheadX + FORWARD_INCREMENT_X, scoreWidth);

    scoreContainer.scrollLeft = playheadX;
    console.log(`[DEBUG] Forward applied. New playheadX: ${playheadX}`);

    // ✅ Calculate `elapsedTime` based on `playheadX` for reference
    elapsedTime = (playheadX / scoreWidth) * duration;
    console.log(`[DEBUG] Synced elapsedTime from playheadX: ${elapsedTime}`);

    if (triggeredCues) {
      triggeredCues.clear(); // ✅ Ensure cues retrigger after forward
      console.log("[DEBUG] Cleared triggered cues due to forward.");
    }

    // ✅ Apply and store correct speed based on the new playhead position
    speedMultiplier = getSpeedForPosition(playheadX);
    console.log(`[DEBUG] After rewind, applying speed: ${speedMultiplier}`);
    updateSpeedDisplay();


    updatePosition();
    updateSeekBar();
    updateStopwatch();


    if (wsEnabled && socket) {
      socket.send(JSON.stringify({ type: "jump", playheadX, elapsedTime }));
    }
  };


  const toggleHelp = () => {
    if (splash.style.display === 'none') {
      //splash.style.display = 'grid';
      scoreContainer.style.display = 'none';
      controls.style.display = 'none';
    } else {
      splash.style.display = 'none';
      scoreContainer.style.display = 'block';
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
      socket.close();
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
  //     let lastPlayheadX = playheadX;
  //     setInterval(() => {
  //         if (playheadX !== lastPlayheadX) {
  //             console.warn(`[WATCHDOG] 🚨 playheadX changed unexpectedly: ${lastPlayheadX} → ${playheadX}`);
  //             lastPlayheadX = playheadX;
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
    console.log(`[DEBUG] 🎵 PlayheadX: ${playheadX}`);
    console.log(`[DEBUG] 🎯 scoreContainer.scrollLeft: ${scoreContainer.scrollLeft}`);
    console.log(`[DEBUG] 📏 Max Scroll Distance: ${maxScrollDistance}`);
    console.log(`[DEBUG] 🖥️ Current SVG Width: ${scoreSVG?.getAttribute('width')}`);
    console.log(`[DEBUG] 🖥️ Current SVG ViewBox: ${scoreSVG?.getAttribute('viewBox')}`);

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
    // console.log(`[DEBUG] Recalculated X for Mark B: ${rehearsalMarks["B"]?.x} playheadX: ${playheadX} Screen Width: ${window.innerWidth} `);
    // console.log(`[DEBUG] Recalculated Y for Mark B: ${rehearsalMarks["B"]?.y}`);

    // Log the element count for rehearsal marks and cues
    console.log(`[DEBUG] 🎭 Number of Rehearsal Marks: ${Object.keys(rehearsalMarks).length}`);
    console.log(`[DEBUG] 🔰 Number of Cues: ${cues.length}`);

    // Log state of animation
    console.log(`[DEBUG] 🔄 Animation state: ${isPlaying ? "Playing" : "Paused"}`);
    console.log(`[DEBUG] 🧮 Elapsed Time: ${elapsedTime}`);
    console.log(`[DEBUG] 🕰️ Last animation frame time: ${lastAnimationFrameTime}`);

    // Log SVG Element states
    console.log(`[DEBUG] 🎨 SVG File: ${scoreSVG?.id || 'No SVG loaded'}`);
    console.log(`[DEBUG] 🖥️ SVG Scroll Position (scrollLeft): ${scoreContainer.scrollLeft}`);

    // Log state of WebSocket
    console.log(`[DEBUG] 🌐 WebSocket State: ${wsEnabled ? 'Enabled' : 'Disabled'}`);
    console.log(`[DEBUG] 🔗 WebSocket Connection Open: ${socket && socket.readyState === WebSocket.OPEN}`);

    // Log sync related variables
    console.log(`[DEBUG] 🕹️ Sync State - Elapsed Time: ${elapsedTime}`);
    console.log(`[DEBUG] 🔄 PlayheadX during Sync: ${playheadX}`);

    // Log viewport adjustments
    console.log(`[DEBUG] 🖥️ Fullscreen Mode: ${document.fullscreenElement ? "Enabled" : "Disabled"}`);
    console.log(`[DEBUG] 🔍 Current Screen Orientation: ${window.innerWidth > window.innerHeight ? 'Landscape' : 'Portrait'}`);

    // Log screen resizing adjustments
    console.log(`[DEBUG] 🌐 Max Scroll Distance: ${maxScrollDistance}`);
    console.log(`[DEBUG] 🎯 ScrollLeft after resize: ${scoreContainer.scrollLeft}`);

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
  // let speedCueMap = []; // ✅ Ensures speed cues are tracked globally

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

      sortedMarks = Object.entries(rehearsalMarks)
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
  * Synchronizes the scroll position of #scoreContainer with the current `playheadX`.
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

    if (isSeeking) {
      scoreContainer.scrollLeft += (playheadX - scoreContainer.scrollLeft) * 0.3;

      //   ✅ Throttled animation update during active seeking
      // if (now - lastTriggerTime > 250) {
      //   window.startAllVisibleAnimations();
      //   lastTriggerTime = now;
      // }

      return;
    }

    // Direct snap to playhead when not seeking
    if (Math.abs(scoreContainer.scrollLeft - playheadX) > 1) {
      scoreContainer.scrollLeft = playheadX;

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
  // let rehearsalMarks = {};
  // let sortedMarks = []; // ✅ Now globally available sorted marks
  // let cues = [];

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

    playheadX = x - (window.innerWidth / 2);
    scoreContainer.scrollLeft = playheadX;
    elapsedTime = (playheadX / scoreWidth) * duration;
    // window.startAllVisibleAnimations();

    console.log(`[DEBUG] Jumping to Rehearsal Mark: ${mark}, playheadX=${playheadX}`);

    if (wsEnabled && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "jump", playheadX, elapsedTime }));
    } else {
      console.warn("[WARNING] WebSocket is not open. Jump not sent.");
    }

    updatePosition();
    updateSeekBar();
    updateStopwatch();
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
  //     let currentIndex = Object.keys(rehearsalMarks).findIndex(mark => rehearsalMarks[mark].x >= playheadX);
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
    console.log(`[DEBUG] Current PlayheadX: ${playheadX}`);

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

    // 🔹 Ensure playheadX Updates Properly
    playheadX = rehearsalMarks[nextMark].x + 1; // Small offset to prevent snapping back
    jumpToRehearsalMark(nextMark);

    console.log(`[DEBUG] Updated PlayheadX: ${playheadX}`);
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

    // Update playheadX properly to prevent snapping issues
    playheadX = rehearsalMarks[nextMark].x + 1; // Small offset to prevent looping
    jumpToRehearsalMark(nextMark);

    console.log(`[DEBUG] Updated PlayheadX: ${playheadX}`);
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

    // Update playheadX properly
    playheadX = rehearsalMarks[nextMark].x + 1;
    jumpToRehearsalMark(nextMark);

    console.log(`[DEBUG] Updated PlayheadX: ${playheadX}`);
  });

  //////// END OF REHEARSAL MARK LOGIC ///////////////////////////////////////////


  /**
  * ✅ Toggles playback state between play and pause.
  * - Stores `playheadX` before pausing to prevent jump resets.
  * - Ensures animation resumes correctly after unpausing.
  */

  const togglePlay = () => {
    isPlaying = !isPlaying;
    console.log(`[DEBUG] Toggling playback. Now playing: ${isPlaying}`);

    // ✅ Apply correct speed before playing
    speedMultiplier = getSpeedForPosition(playheadX);
    console.log(`[DEBUG] Applying speed: ${speedMultiplier}`);
    updateSpeedDisplay();

    // ✅ Ensure playheadX is included in WebSocket message
    if (wsEnabled && socket && socket.readyState === WebSocket.OPEN) {
      const message = {
        type: isPlaying ? "play" : "pause",
        playheadX: playheadX, // 🔥 Include playheadX
      };

      console.log(`[DEBUG] Sending ${isPlaying ? "play" : "pause"} message:`, message);
      socket.send(JSON.stringify(message));
    }

    updatePosition();
    checkCueTriggers(); // ✅ Ensure cues are checked after speed update

    if (isPlaying) {
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
      playButton.innerHTML = isPlaying ? '<div class="custom-pause"></div>' : "▶";
      // console.log(`[DEBUG] Play button updated. isPlaying=${isPlaying}`);
    } else {
      console.error("[ERROR] Play button element not found.");
    }
  };

  //// END OF TOGGLE PLAY LOGIC  ///////////////////////////////////////////

  /**
  * checkCueTriggers()
  * Called every animation frame to evaluate whether the playhead intersects any cues.
  * Triggers associated actions (via `handleCueTrigger`) and manages repeat logic with delays.
  * Includes logic to avoid retriggers at the repeat start point right after a jump.
  */
  const checkCueTriggers = async () => {
    // ✅ Update elapsed time based on playhead position
    elapsedTime = (playheadX / scoreWidth) * duration;

    // 🛑 Skip cue checks if we’re seeking, paused, or stopped
    if (isSeeking || animationPaused || !isPlaying) {
      console.log("[DEBUG] Skipping cue checks.");
      return;
    }

    // ✅ Center correction for playhead alignment
    const playheadOffset = scoreContainer.offsetWidth / 2;
    const adjustedPlayheadX = playheadX + playheadOffset;

    // 🔁 Loop through all cues
    for (const cue of cues) {
      const cueStart = cue.x;
      const cueEnd = cueStart + cue.width;
      const isInsideCue = adjustedPlayheadX >= cueStart && adjustedPlayheadX <= cueEnd;

      // 🎯 Trigger cues if not already triggered
      if (isInsideCue && !triggeredCues.has(cue.id)) {
        console.log(`[DEBUG] Triggering Cue: ${cue.id} at X: ${cueStart}, Adjusted Playhead: ${adjustedPlayheadX}, Reported Window.innerWidth: ${window.innerWidth}`);
        handleCueTrigger(cue.id);
        triggeredCues.add(cue.id);
      }

      // 🔁 Check if cue is the end marker for a repeat
      for (const [repeatCueId, repeat] of Object.entries(repeatStateMap)) {
        // 🚫 Skip if repeat isn’t active or not ready (e.g., just jumped)
        if (!repeat.active || !repeat.ready || !repeat.initialJumpDone) continue;

        let isAtRepeatEnd = false;

        // 🧭 If endId is "self", check if playhead is on the original repeat cue itself
        if (repeat.endId === 'self') {
          const repeatCue = cues.find(c => c.id === repeat.cueId || c.id.startsWith(repeat.cueId + "-"));
          if (repeatCue) {
            const selfX = repeatCue.x;
            const selfWidth = repeatCue.width || 40;
            const selfEndX = selfX + selfWidth;
            if (adjustedPlayheadX >= selfX && adjustedPlayheadX <= selfEndX) {
              isAtRepeatEnd = true;
            }
          }
        }
        // 📍 Otherwise, match against a different cue
        else if (cue.id === repeat.endId || cue.id.startsWith(repeat.endId + "-")) {
          isAtRepeatEnd = true;
        }

        // 🧨 Skip false triggers that happen during jump cooldown (landed on start point)
        const now = Date.now();
        if (repeat.jumpCooldownUntil && now < repeat.jumpCooldownUntil) {
          console.log(`[repeat] ⏳ Skipping due to jumpCooldownUntil for ${repeatCueId}`);
          continue;
        }

        if (isAtRepeatEnd) {
          const cooldown = 500;
          if (now - repeat.lastTriggerTime < cooldown) {
            continue;
          }

          repeat.lastTriggerTime = now;

          repeat.currentCount++;
          updateRepeatCountDisplay(repeat.currentCount);
          // Add highlighting to playhead when in repeat cycle
          // document.getElementById('playhead').classList.add('repeating');
          // document.getElementById("repeat-count-box").classList.add("pulse");
          //

          console.log(`[repeat] Reached end (${repeat.endId}) for ${repeatCueId}, count: ${repeat.currentCount}`);

          if (repeat.isInfinite || repeat.currentCount < repeat.count) {
            if (repeat.directionMode === 'p') {
              repeat.currentlyReversing = !repeat.currentlyReversing;
            }

            console.log(`[repeat] ⏳ Pausing before repeat jump for ${repeatCueId}`);

            try {
              await executeRepeatJump(repeat, repeatCueId);
            } catch (err) {
              console.error(`[repeat] ❌ Error during executeRepeatJump for ${repeatCueId}:`, err);
            }

          } else {

            // ✅ All repeats complete
            repeat.active = false;
            hideRepeatCountDisplay();
            // document.getElementById('playhead').classList.remove('repeating');
            // document.getElementById("repeat-count-box").classList.add("hidden");
            // document.getElementById("repeat-count-box").classList.remove("pulse");


            if (repeat.action === 'stop') {
              stopAnimation();
              isPlaying = false;
              togglePlayButton();
              console.log(`[repeat] Repeat finished. Stopping playback.`);
            } else if (repeat.resumeId && repeat.resumeId !== 'self') {
              jumpToCueId(repeat.resumeId);
              togglePlay();
            } else {
              console.log(`[repeat] Repeat finished. Staying at current location.`);
            }
          }

          break; // ✅ Avoid multiple repeat triggers per frame
        }
      }
    }
  };



  /////////////////////////////////////////
  // STOPWATCH TO FULLSCREEN FUNCTION

  const mainContent = document.getElementById("scoreContainer"); // Main score area

  if (!stopwatch || !mainContent) {
    console.error("[ERROR] Stopwatch or scoreContainer not found.");
    return;
  }

  stopwatch.addEventListener("click", (event) => {
    event.preventDefault();  // ✅ Prevents default browser behavior
    event.stopImmediatePropagation();  // ✅ Fully stops propagation

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

  /////////////////////////////////////////


  // -- CUE HANDLERS -------------------------------

  ///////////////////////////////
  // CUE HANDLER LOGIC
  ///////////////////////////

  // these functions handle the cues embedded in the score svg
  // as objects with xml IDs in the cue_ namespace and trigger Events
  // including pauses, osc messages, animejs animations, choices popups, audio cues
  // and more to be implemented such as MIDI, video, dmx?, p5js, obj?


  // NOT SURE WHAT THIS DID MAYBE IT IS TAKEN CARE OF ELSEWHERE todo CHECK IF IT CAN BE DELETED
  // Update WebSocket to use the wrapped version
  // connectWebSocket().then(() => {
  //         if (socket) {
  //             socket.addEventListener('message', (event) => {
  //                 const data = JSON.parse(event.data);
  //                 syncState(data.state);
  //                 //console.log('WebSocket message received:', data);
  //             });
  //         } else {
  //             console.error('WebSocket is not initialized. Cannot add event listeners.');
  //         }
  //     });

  // __________________________________________


  const handleStopCue = (cueId) => {
    console.log(`[CLIENT] Handling stop cue: ${cueId}`);

    if (isPlaying) {
      console.log("[DEBUG] Pausing via togglePlay() for cuePause.");
      togglePlay();
    } else {
      console.log("[DEBUG] Already paused, ensuring animation is fully stopped.");
      isPlaying = false;
      stopAnimation();
    }
    // togglePlayButton();         // Update play/pause button visually

    // Optional: display a visual indicator
    // const pauseCountdown = document.getElementById("pause-countdown");
    // if (pauseCountdown) {
    //     pauseCountdown.textContent = "⏹";
    //     pauseCountdown.style.display = "flex";
    // }
  };



  /**
  * Handles pause cues in the score SVG, ensuring playback halts for a set duration.
  * Prevents seeking conflicts and maintains playhead position during the pause.
  * Displays a countdown timer and ensures UI visibility for pause status.
  * Stops any existing countdowns before starting a new one to avoid overlap.
  * Automatically resumes playback after the pause duration and re-enables sync.
  * Ensures WebSocket events are correctly managed to prevent unintended behavior.
  */

  // TODO: Add support for next(...) to automatically trigger another cue after pause ends.
// This allows daisy-chaining actions like cuePause(...) → cueAudio(...) or cueAnimation(...).


  const handlePauseCue = (cueId, duration, showCountdownOverride = null, resumeTarget = cueId) => {
    console.log(`[DEBUG] Handling pause cue: ${cueId}, duration: ${duration}ms.`);

    if (isSeeking) {
      console.log(`[DEBUG] Ignoring pause cue '${cueId}' during seeking.`);
      return;
    }

    ignoreSyncDuringPause = true;

    if (isPlaying) {
      togglePlay();
      console.log("[DEBUG] Pausing via togglePlay() for cuePause.");
    } else {
      isPlaying = false;
      stopAnimation();
      console.log("[DEBUG] Already paused, animation stopped.");
    }

    const pauseCountdown = document.getElementById("pause-countdown");
    const pauseTime = document.getElementById("pause-time");

    if (!pauseCountdown || !pauseTime) {
      console.error("[ERROR] pause-countdown or pause-time not found.");
      return;
    }

    const showCountdown = duration > 2000;

    if (showCountdown) {
      const targetEnd = Date.now() + duration;

      // Ensure it's visible and reset any text
      pauseCountdown.classList.remove("hidden");
      pauseCountdown.style.display = "flex";
      pauseCountdown.style.visibility = "visible";
      pauseCountdown.style.opacity = "1";

      const updateCountdown = () => {
        const remainingMs = targetEnd - Date.now();
        const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

        pauseTime.textContent = seconds;
        // console.log(`[DEBUG] Countdown tick: ${seconds}s`);

        if (seconds <= 0) {
          clearInterval(window.pauseCountdownInterval);
          window.pauseCountdownInterval = null;
          console.log("[DEBUG] Countdown finished. Dismissing popup.");
          dismissPauseCountdown();
        }
      };

      // Clear any existing timer
      if (window.pauseCountdownInterval) {
        console.log("[DEBUG] Found existing countdown timer. Clearing it.");
        clearInterval(window.pauseCountdownInterval);
        window.pauseCountdownInterval = null;
      }

      updateCountdown(); // Set first value immediately to avoid 0s
      window.pauseCountdownInterval = setInterval(updateCountdown, 1000);
      console.log("[DEBUG] Countdown interval started.");
    } else {
      console.log("[DEBUG] Skipping countdown display (duration too short).");
    }

    // Clear any previous auto-resume
    if (window.pauseTimeout) {
      clearTimeout(window.pauseTimeout);
      window.pauseTimeout = null;
      console.log("[DEBUG] Cleared previous pauseTimeout.");
    }

    window.pauseTimeout = setTimeout(() => {
      console.log("[DEBUG] Auto-resuming after pause duration.");
      ignoreSyncDuringPause = false;
      dismissPauseCountdown();
    
      if (resumeTarget && resumeTarget !== cueId) {
        console.log(`[DEBUG] Jumping to resume target: ${resumeTarget}`);
        jumpToCueId(targetId); //TODO TEST THIS FUNCTIONALITY
      }
    }, duration);
    
  };







  /**
  * dismissPauseCountdown(forceNoResume = false, receivedFromServer = false)
  *
  * Handles the dismissal of the pause countdown UI and ensures playback resumes correctly.
  * - Clears pause-related timers.
  * - Optionally resumes playback unless `forceNoResume` is true.
  * - Ensures all clients remain in sync by broadcasting over WebSocket.
  *
  * @param {boolean} forceNoResume - If true, prevents playback from resuming after countdown dismissal.
  * @param {boolean} receivedFromServer - If true, prevents rebroadcasting `resume_after_pause` if the message came from the server.
  */

  const dismissPauseCountdown = (forceNoResume = false, receivedFromServer = false) => {
    console.log("[DEBUG] Dismissing pause countdown.");

    const pauseCountdown = document.getElementById("pause-countdown");
    if (pauseCountdown) {
      pauseCountdown.classList.add("hidden");
      pauseCountdown.style.display = "none";
      console.log("[DEBUG] Pause countdown UI hidden.");
    }

    // ✅ Also clear the countdown number inside
    const pauseTime = document.getElementById("pause-time");
    if (pauseTime) pauseTime.textContent = "";

    // ✅ Ensure countdown timer is cleared properly
    if (window.pauseCountdownInterval) {
      clearInterval(window.pauseCountdownInterval);
      window.pauseCountdownInterval = null;
      console.log("[DEBUG] Pause countdown timer cleared.");
    }

    // ✅ Ensure timeout for resume is also cleared
    if (window.pauseTimeout) {
      clearTimeout(window.pauseTimeout);
      window.pauseTimeout = null;
      console.log("[DEBUG] Pause timeout cleared.");
    }

    // ✅ Prevent auto-resume if forced
    if (forceNoResume) {
      console.log("[DEBUG] Countdown dismissed without resuming playback.");
      return;
    }

    console.log("[DEBUG] Resuming playback after countdown dismissal.");

    // ✅ Broadcast to all clients via WebSocket
    if (wsEnabled && socket && !receivedFromServer) {
      console.log("[DEBUG] Sending dismiss_pause_countdown event to server.");
      socket.send(JSON.stringify({ type: "dismiss_pause_countdown" }));
    }

    // ✅ Resume playback
    isPlaying = true;
    togglePlayButton();
    startAnimation();
  };




  /**
  * hidePauseCountdownUI()
  *
  * Hides the visual countdown for pause.
  */
  const hidePauseCountdownUI = () => {
    const pauseCountdown = document.getElementById("pause-countdown");
    if (pauseCountdown) {
      pauseCountdown.classList.add("hidden");
      pauseCountdown.style.display = "none";

      const pauseTime = document.getElementById("pause-time");
      if (pauseTime) pauseTime.textContent = "";
      console.log("[DEBUG] Pause countdown UI hidden.");
    }
  };

  /**
  * clearPauseTimers()
  *
  * Clears all active timers related to pause countdown and automatic resume.
  */
  const clearPauseTimers = () => {
    if (window.pauseCountdownInterval) {
      clearInterval(window.pauseCountdownInterval);
      window.pauseCountdownInterval = null;
      console.log("[DEBUG] Pause countdown timer cleared.");
    }

    if (window.pauseTimeout) {
      clearTimeout(window.pauseTimeout);
      window.pauseTimeout = null;
      console.log("[DEBUG] Pause timeout cleared.");
    }
  };

  /**
  * resumePlayback(receivedFromServer)
  *
  * Resumes playback after countdown dismissal, unless received from another client.
  * Updates the UI and synchronizes playback.
  *
  * @param {boolean} receivedFromServer - If true, prevents rebroadcasting `resume_after_pause`.
  */
  const resumePlayback = (receivedFromServer) => {
    console.log("[DEBUG] Resuming playback after countdown dismissal.");

    // Ensure `playheadX` is valid before proceeding
    if (!isNaN(playheadX) && playheadX > 0) {
      console.log(`[DEBUG] Keeping server-provided playheadX: ${playheadX}`);
    } else {
      console.error(`[ERROR] Invalid playheadX received: ${playheadX}. Playback resume aborted.`);
      return;
    }

    // Update UI elements before playback starts
    updatePosition();
    updateSeekBar();
    updateStopwatch();

    // Set play state and start animation
    isPlaying = true;
    animationPaused = false;
    togglePlayButton();
    startAnimation();

    // Prevent accidental pauses right after resuming
    preventAccidentalPauses();

    // Synchronize playback across clients
    handleWebSocketSync(receivedFromServer);
  };

  /**
  * preventAccidentalPauses()
  *
  * Adds a short delay before allowing another pause to avoid immediate interruptions.
  */
  const preventAccidentalPauses = () => {
    ignorePauseAfterResume = true;
    console.log("[DEBUG] Pause prevention active.");

    setTimeout(() => {
      ignorePauseAfterResume = false;
      console.log("[DEBUG] Pause prevention expired.");
    }, 2000); // Block accidental pauses for 2 seconds

    // Prevent cue retriggers for a short cooldown period
    pauseCooldownActive = true;
    console.log("[DEBUG] Pause cooldown activated.");

    setTimeout(() => {
      pauseCooldownActive = false;
      console.log("[DEBUG] Pause cooldown expired. Cues can trigger again.");
    }, 3000); // Prevent retriggering for 3 seconds
  };

  /**
  * handleWebSocketSync(receivedFromServer)
  * Broadcasts a resume event over WebSocket to synchronize with other clients.
  * @param {boolean} receivedFromServer - If true, prevents rebroadcasting.
  */

  /**
  * Synchronizes playback state over WebSocket when resuming from pause.
  * Ensures the correct playhead position is maintained across clients.
  * Broadcasts a resume event to all connected clients if conditions are met.
  * Prevents duplicate resume signals by introducing a short delay.
  */

  const handleWebSocketSync = (receivedFromServer) => {
    if (wsEnabled && socket && !receivedFromServer) {
      resumeReceived = true;

      // Ensure we keep the correct playhead position
      if (!isNaN(playheadX) && playheadX > 0) {
        console.log(`[DEBUG] Keeping server-provided playheadX: ${playheadX}`);
      } else {
        console.error(`[ERROR] Invalid playheadX. Keeping last known value.`);
      }

      // Broadcast resume event
      const message = JSON.stringify({ type: "resume_after_pause", elapsedTime, playheadX });
      console.log(`[CLIENT] Broadcasting resume_after_pause to all clients: ${message}`);
      socket.send(message);

      // Prevent duplicate resume signals for a short period
      setTimeout(() => {
        resumeReceived = false;
      }, 1000);
    }
  };


  // ✅ Ensure all clients dismiss the countdown
  const pauseCountdown = document.getElementById("pause-countdown");
  if (pauseCountdown) {
    pauseCountdown.addEventListener("click", (event) => {
      console.log("[DEBUG] Pause countdown clicked. Dismissing.");
      dismissPauseCountdown(); // ✅ Ensure it is fully cleared
      event.stopImmediatePropagation(); // ✅ Prevents unwanted bubbling
    });
  } else {
    console.error("[ERROR] pause-countdown not found.");
  }

  // this is never used anywhere?
  // todo what is this for - can it be removed
  const originalSyncState = syncState; // Keep a reference to the original syncState


  // CUE REPEAT ////////////////////////
  /**
  * executeRepeatJump()
  * Handles the actual jump and timing logic when a repeat is triggered.
  * Adds pauses before and after the jump, resumes playback,
  * and sets a short cooldown to prevent retriggering at the start point.
  *
  * @param {Object} repeat - The repeat object from repeatStateMap
  * @param {string} cueId - The ID of the cueRepeat_* that triggered this jump
  */
  const executeRepeatJump = async (repeat, cueId) => {
    if (repeat.busy) {
      console.log(`[repeat] ⚠️ Already busy — skipping repeat for ${cueId}`);
      return;
    }

    repeat.busy = true;

    // ⏸ Pause playback before the jump
    console.log(`[repeat] ⏸ Pausing before jump to ${repeat.startId}`);
    if (isPlaying) togglePlay();

    // Wait before jumping
    await new Promise(resolve => setTimeout(resolve, 1000));

    const jumpTarget = repeat.currentlyReversing ? repeat.endId : repeat.startId;
    const targetId = (jumpTarget === 'self') ? repeat.cueId : jumpTarget;

    // 🔁 Jump to the designated start or end point
    console.log(`[repeat] 🔁 Jumping to ${targetId}`);
    jumpToCueId(targetId);

    // 🔒 Set a cooldown to prevent instant retriggers on landing at start
    repeat.ready = false;
    repeat.jumpCooldownUntil = Date.now() + 300; // ms of cooldown

    // Wait after the jump before resuming
    await new Promise(resolve => setTimeout(resolve, 1000));

    // ▶️ Resume playback
    console.log(`[repeat] ▶️ Resuming playback after jump to ${targetId}`);
    if (!isPlaying) togglePlay();

    // ✅ Mark repeat ready again after jump cooldown
    setTimeout(() => {
      repeat.ready = true;
      console.log(`[repeat] ✅ Jump complete for ${cueId}, ready for next repeat`);
    }, 300);

    repeat.busy = false;


    if (wsEnabled && socket?.readyState === WebSocket.OPEN) {
      // Send a cleaned copy to avoid leaking volatile flags
      const safeRepeatData = { ...repeat };
      delete safeRepeatData.recovered;

      socket.send(JSON.stringify({
        type: "repeat_update",
        cueId,
        repeatData: safeRepeatData
      }));
    }



  };



  /**
  * cueRepeat_* → A powerful musical repeat handler for looping sections of the score.
  *
  * Format:
  *   cueRepeat_s_[startID][_e_[endID]]_x_[repeatCount|inf][_r_[resumeID]][_d_[f|r|p]][_a_[stop]]-[UID?]
  *
  * Parameters:
  *   s_[startID]      → REQUIRED. ID to jump to at the start of each repeat loop.
  *   e_[endID]        → OPTIONAL. ID marking the end of the repeat section. If omitted, the cueRepeat object itself acts as the end.
  *   x_[N|inf]        → REQUIRED. Number of times to repeat the section (e.g. x_2 = 2 repeats = 3 total plays). Use x_inf for infinite loop.
  *   r_[resumeID]     → OPTIONAL. ID to jump to after the final repeat. Defaults to 'self' (the cueRepeat object itself).
  *   d_[f|r|p]        → OPTIONAL. Playback direction:
  *                        - d_f (default): forward
  *                        - d_r: reverse
  *                        - d_p: pingpong (alternate forward and backward)
  *   a_[stop]         → OPTIONAL. Stops playback at the end of the final repeat (instead of resuming).
  *   -[UID]           → OPTIONAL. UID suffix for disambiguation. Has no effect on parsing logic.
  *
  * Example:
  *   cueRepeat_s_loopA_e_loopB_x_2_r_bridge_d_p_a_stop-B12
  *     → Jump to 'loopA', repeat to 'loopB' 2 times (pingpong),
  *       then stop playback after second repeat.
  *
  *   cueRepeat_s_intro_x_3
  *     → Repeat from 'intro' to this cue’s location 3 times (forward), then continue.
  *
  * Notes:
  * - The first play is followed by N repeats → N+1 total plays.
  * - The cue only triggers once; loop detection runs independently of cue triggering.
  * - Repeat end detection is debounced to avoid multiple triggers in the same pass.
  */



  let repeatStateMap = {}; // ✅ Store all active repeat states by cue ID

  /**
  * Parses a cueRepeat_* ID into structured parameters.
  * Supports:
  *   - s_[startId]
  *   - e_[endId] (optional — defaults to self)
  *   - x_[count] or x_inf
  *   - r_[resumeId] (optional — defaults to self)
  *   - d_[f|r|p] (optional — defaults to f)
  *   - a_[stop] (optional — triggers pause after final repeat)
  * UID suffix after `-` is retained in cueId but ignored for logic.
  */

  const parseRepeatCueId = (rawCueId) => {
    const cueId = rawCueId.trim();
    console.log("[DEBUG] parseRepeatCueId loaded:", typeof parseRepeatCueId);

    if (!cueId.startsWith("cueRepeat_")) return null;

    const base = cueId.slice("cueRepeat_".length);
    const uidSuffix = null; // optional — not used in logic

    const repeat = {
      cueId,
      startId: null,
      endId: "self",
      count: null,
      isInfinite: false,
      resumeId: "self",
      direction: "f",
      action: null,
      hasUID: uidSuffix || null,
    };

    // Manually parse _key_value pairs allowing values to contain hyphens
    const tokens = base.split("_");
    console.log("repeat - Parsed tokens:", tokens);

    for (let i = 0; i < tokens.length; i += 2) {
      const tag = tokens[i];
      const val = tokens[i + 1];
      console.log(`[parseRepeatCueId] TAG: ${tag}, VALUE: ${val}`);

      if (!val) continue;

      switch (tag) {
        case "s":
          repeat.startId = val;
          break;
        case "e":
          repeat.endId = val;
          break;
        case "x":
          if (val === "inf") {
            repeat.isInfinite = true;
            repeat.count = Infinity;
          } else {
            const n = parseInt(val, 10) - 1; // FIX: parse first, then subtract
            if (!isNaN(n)) repeat.count = n;
          }
          break;
        case "r":
          repeat.resumeId = val;
          break;
        case "d":
          repeat.direction = val;
          break;
        case "a":
          repeat.action = val;
          break;
      }
    }

    // Basic validation
    const errors = [];
    if (!repeat.startId) errors.push("Missing s_ (start)");
    if (repeat.count === null && !repeat.isInfinite) errors.push("Missing or invalid x_ (count or inf)");

    if (errors.length > 0) {
      console.warn(`[parseRepeatCueId] Invalid cueRepeat ID: ${cueId}`);
      errors.forEach((e) => console.warn("  ↳", e));
      return null;
    }

    return repeat;
  };


  window.parseRepeatCueId = parseRepeatCueId;

  const handleRepeatCue = async (cueId) => {
    const parsed = parseRepeatCueId(cueId);
    if (!parsed) return;

    console.log('[handleRepeatCue] 🎯 Detected cueRepeat:', parsed);
    document.getElementById("playhead").classList.add("repeating");
    document.getElementById("repeat-count-box").classList.remove("hidden");
    document.getElementById("repeat-count-box").classList.add("pulse");


    // Initialize state
    repeatStateMap[cueId] = {
      ...parsed,
      currentCount: 1,
      currentlyReversing: parsed.direction === 'r',
      active: true,
      directionMode: parsed.direction,
      lastTriggerTime: 0,
      ready: false,
      initialJumpDone: false,
      busy: false, // 🔐 block overlapping jumps
    };

    // Allow checkCueTriggers() to see it next frame
    setTimeout(() => {
      repeatStateMap[cueId].ready = true;
    }, 0);

    // ✅ First repeat jump
    await executeRepeatJump(repeatStateMap[cueId], cueId);

    // ✅ After jump completes
    repeatStateMap[cueId].initialJumpDone = true;
  };


  window.handleRepeatCue = handleRepeatCue;
  window.repeatStateMap = repeatStateMap;



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

    playheadX = targetX - (window.innerWidth / 2);
    elapsedTime = (playheadX / scoreWidth) * duration;
    scoreContainer.scrollLeft = playheadX;

    console.log(`[jumpToCueId] Jumping to ${id} (playheadX: ${playheadX})`);

    if (wsEnabled && socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "jump", playheadX, elapsedTime }));
    }

    updatePosition();
    updateSeekBar();
    updateStopwatch();
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





  ////////////////////////////////////////////////////

  // -- handleVideoCue

  const handleVideoCue = (cueId, videoFilePath) => {
    //  log(LogLevel.INFO, Handling video cue '${cueId}' with file '${videoFilePath}'.);
    const videoPopup = document.getElementById('video-popup');
    const videoElement = document.getElementById('video-content');

    videoElement.src = videoFilePath;
    videoPopup.classList.remove('hidden');

    videoElement.onended = () => {
      //log(LogLevel.INFO, Video cue '${cueId}' completed.);
      videoPopup.classList.add('hidden');
      videoElement.src = ''; // Clear video

      isPlaying = true;
      startAnimation();
    };

    isPlaying = false;
    animationPaused = true;
    pauseStartTime = Date.now();
    videoElement.play();
  };

  // --

  const handleP5Cue = (cueId, sketchFunction) => {
    //  log(LogLevel.INFO, Handling p5.js cue '${cueId}'.);
    const p5Popup = document.getElementById('p5-popup');
    const p5Container = document.getElementById('p5-container');

    new p5(sketchFunction, p5Container);

    // Simulate a fixed duration or provide custom logic for the p5 sketch lifecycle
    const duration = 5000; // Example duration
    setTimeout(() => {
      //  log(LogLevel.INFO, p5.js cue '${cueId}' completed.);
      p5Popup.classList.add('hidden');
      p5Container.innerHTML = ''; // Clear p5 sketch

      isPlaying = true;
      animationPaused = false;
      startAnimation();
    }, duration);

    isPlaying = false;
    animationPaused = true;
    pauseStartTime = Date.now();
  };

  // --

  const handleAnimationCue = (cueId, animationFilePath, duration = 5000) => {
    console.log(`[DEBUG] Handling animation cue '${cueId}' with file '${animationFilePath}'.`);

    // Get the animation popup element
    const popup = document.getElementById('animation-popup');
    if (!popup) {
      console.error('[ERROR] Animation popup element not found!');
      return;
    }

    // Get the animation content element
    const animationContent = document.getElementById('animation-content');
    if (!animationContent) {
      console.error('[ERROR] Animation content element not found!');
      return;
    }

    // Pause playback
    if (isPlaying) {
      isPlaying = false; // Stop the score animation
      animationPaused = true; // Set animation paused flag
      stopAnimation(); // Call the function to halt playback
      console.log('[DEBUG] Playback paused for animation popup.');
    }

    // Show the popup immediately
    popup.classList.remove('hidden');
    console.log('[DEBUG] Animation popup displayed.');

    // Set the animation file and reset content
    animationContent.removeAttribute('data'); // Clear any previous animation
    animationContent.setAttribute('data', animationFilePath); // Load new animation
    console.log(`[DEBUG] Loaded animation file: ${animationFilePath}`);

    // Ensure the animation is loaded before proceeding
    animationContent.addEventListener('load', () => {
      console.log('[DEBUG] Animation content fully loaded.');

      // Access the SVG content and apply scaling
      const svgDocument = animationContent.contentDocument;
      if (svgDocument) {
        const svgElement = svgDocument.documentElement;
        if (svgElement) {
          svgElement.setAttribute('width', '100%');
          svgElement.setAttribute('height', '100%');
          svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          console.log('[DEBUG] SVG scaling attributes applied.');

          // Attach click handler to the SVG content
          svgElement.addEventListener('click', () => {
            console.log('[DEBUG] SVG content clicked inside animation popup.');
          });
        } else {
          console.error('[ERROR] Could not access the root SVG element.');
        }
      } else {
        console.error('[ERROR] Could not access SVG content from animation.');
      }
    });

    // Add click listener for dismissing the popup
    popup.addEventListener('click', (event) => {
      if (event.target === popup) {
        popup.classList.add('hidden'); // Hide the popup
        console.log('[DEBUG] Animation popup dismissed.');

        // Resume playback when the popup is dismissed
        if (!isPlaying && animationPaused) {
          isPlaying = true; // Resume the score animation
          animationPaused = false; // Clear animation paused flag
          startAnimation(); // Restart playback
          console.log('[DEBUG] Playback resumed after popup dismissal.');
        }
      }
    });

    // Automatically hide the popup after the specified duration
    setTimeout(() => {
      popup.classList.add('hidden'); // Hide the popup
      console.log(`[DEBUG] Animation popup hidden after ${duration}ms.`);

      // Resume playback if the popup is hidden automatically
      if (!isPlaying && animationPaused) {
        isPlaying = true; // Resume the score animation
        animationPaused = false; // Clear animation paused flag
        startAnimation(); // Restart playback
        console.log('[DEBUG] Playback resumed after automatic popup dismissal.');
      }
    }, duration);
  };

  window.handleAnimationCue = handleAnimationCue;


  // --

  /////////// animateObjToPath ////////////////////////////////////////////////

  /**
   * animateObjToPath()
   * ------------------
   * Animates a given SVG object along a specified path using Anime.js.
   *
   * 🔁 Supports multiple direction modes based on namespace parsing:
   *   - Case 0: Pingpong (alternate motion)
   *   - Case 1: Forward loop
   *   - Case 2: Reverse loop
   *   - Case 3: Random jumps constrained to a playzone (with pause)
   *   - Case 4: Fixed-node jumps along the path (variable durations)
   *   - Case 5: Ghost-led path switching with countdown and sync
   *
   * 🧠 Features:
   *   - Parses speed, direction, and easing from object ID
   *   - Calculates accurate transform origin
   *   - Registers all animations to `window.runningAnimations`
   *   - Supports `play()`, `pause()`, and `resume()` lifecycle hooks
   *   - Integrates with `IntersectionObserver` for pause-on-scroll efficiency
   *
   * @param {SVGElement} object - The SVG object to animate
   * @param {SVGPathElement} path - The path element to follow
   * @param {number} duration - Fallback duration (in seconds) if speed is not specified
   * @param {Array} animations - Array to push raw anime() timelines for tracking/debug
   */


  const animateObjToPath = (object, path, duration, animations) => {

    if (!Array.isArray(animations)) {
      console.warn(`[WARN] animations param was not an array. Wrapping it. ID: ${object.id}`);
      animations = [];
    }
    const effectiveId = object.getAttribute('data-id') || object.id;

    try {
      const pathMotion = anime.path(path);
      const startPoint = path.getPointAtLength(0);
      const boundingRect = path.getBBox();
      const adjustedX = startPoint.x - boundingRect.x;
      const adjustedY = startPoint.y - boundingRect.y;

      if (['circle', 'ellipse'].includes(object.tagName)) {
        object.setAttribute('cx', adjustedX);
        object.setAttribute('cy', adjustedY);
      } else if (object.tagName === 'rect') {
        const w = object.getBBox().width, h = object.getBBox().height;
        object.setAttribute('x', adjustedX - w / 2);
        object.setAttribute('y', adjustedY - h / 2);
      }

      object.style.transformOrigin = `${adjustedX}px ${adjustedY}px`;

      const speedMatch = effectiveId.match(/_(?:speed|spd|s)_(\d+(\.\d+)?)/);
      const animationSpeed = speedMatch ? parseFloat(speedMatch[1]) * 1000 : duration * 1000;

      const directionMatch = effectiveId.match(/_(?:direction|dir|d)_(\d+)/);
      let direction = directionMatch ? parseInt(directionMatch[1], 10) : 0;

      if (![0, 1, 2, 3, 4, 5].includes(direction)) direction = 0;

      const rotate = !object.id.includes('_rotate_0');
      const easingCode = parseInt((effectiveId.match(/_(?:ease|easing|e)_(\d+)/) || [])[1]) || 3;
      const easingMap = {
        0: 'linear', 1: 'easeInSine', 2: 'easeOutSine', 3: 'easeInOutSine',
        4: 'easeInBack', 5: 'easeOutBack', 6: 'easeInOutBack',
        7: 'easeInElastic', 8: 'easeOutElastic', 9: 'easeInOutElastic'
      };
      const easing = easingMap[easingCode] || 'easeInOutSine';

      switch (direction) {
        case 0: {
          const anim0 = anime({
            targets: object,
            translateX: pathMotion('x'),
            translateY: pathMotion('y'),
            rotate: rotate ? pathMotion('angle') : 0,
            duration: animationSpeed,
            easing,
            loop: true,
            direction: 'alternate',

            update: (anim) => {
              emitOSCFromPathProgress({
                path,
                progress: anim.progress,
                pathId: path.id
              });
            }
          });

          window.runningAnimations[object.id] = {
            play: () => anim0.play(),
            pause: () => anim0.pause(),
            resume: () => anim0.play(),
            wasPaused: false
          };

          animations.push(anim0);
          break;
        }

        case 1: {
          const anim1 = anime({ targets: object, translateX: pathMotion('x'), translateY: pathMotion('y'), rotate: rotate ? pathMotion('angle') : 0, duration: animationSpeed, easing, loop: true });
          window.runningAnimations[object.id] = { play: () => anim1.play(), pause: () => anim1.pause(), resume: () => anim1.play(), wasPaused: false };
          animations.push(anim1);
          break;
        }

        case 2: {
          const anim2 = anime({ targets: object, translateX: pathMotion('x'), translateY: pathMotion('y'), rotate: rotate ? pathMotion('angle') : 0, duration: animationSpeed, easing, loop: true, direction: 'reverse' });
          window.runningAnimations[object.id] = { play: () => anim2.play(), pause: () => anim2.pause(), resume: () => anim2.play(), wasPaused: false };
          animations.push(anim2);
          break;
        }
        /**
         * 🎯 Case 3 — Random Jump Animation Within Visible Path Segment
         * -------------------------------------------------------------
         * - Animates objects (typically circles or groups) by jumping to a random point
         *   along the visible portion of an assigned path.
         * - Uses Anime.js to animate position via `cx/cy` or `translateX/translateY`.
         * - Each jump occurs after a short animation and continues in a loop.
         * - Objects pause/resume when scrolled off/on screen using IntersectionObserver.
         *
         * ✅ Features:
         * - Initial placement at path start
         * - Visibility-aware sampling of points (SVG-to-screen space conversion)
         * - Integration with observer system (play/pause/resume)
         * - Object can be an <ellipse>, <circle>, or a <g> group wrapper
         *
         * 🧪 Known Issues:
         * - When multiple Case 3 objects are active simultaneously, their animations
         *   interfere, causing erratic jumping or layout glitches.
         * - Positioning via `cx/cy` works reliably when only one object is active.
         * - Using `translateX/Y` avoids some layout bugs but causes object to jump offscreen.
         * - Transform origin logic has been validated and works for other cases.
         *
         * ❌ NOT the Cause:
         * - Not due to observer logic (was disabled and glitch persisted)
         * - Not due to SVG geometry (verified shapes, r/cx/cy set correctly)
         * - Not due to DOM visibility or style (verified display/opacity/transform)
         * - Not due to case logic conflicts (case 5 and 3 operate independently)
         *
         * 📝 TODO:
         * - Investigate **multi-object transform side effects**, especially with groups.
         * - Try dedicated inner wrapper for positioning if in <g>.
         * - Isolate minimal reproducible test with 2 animated objects on same path.
         */
        case 3: {

          // console.warn(`[case3][${object.id}] 🚫 Temporarily disabled`);
          return;

          const pathLength = path.getTotalLength();
          const sampleStep = 10;

          const getVisibleTarget = () => {
            const svg = document.querySelector("svg");
            const screenCTM = svg?.getScreenCTM();
            if (!svg || !screenCTM) {
              console.warn(`[case3][${object.id}] ⚠️ SVG or CTM missing`);
              return null;
            }

            const visible = [];
            const pt = svg.createSVGPoint();
            for (let len = 0; len < pathLength; len += sampleStep) {
              const p = path.getPointAtLength(len);
              pt.x = p.x;
              pt.y = p.y;
              const screenX = pt.matrixTransform(screenCTM).x;
              if (screenX >= 0 && screenX <= window.innerWidth) visible.push(len);
            }

            if (visible.length === 0) return null;
            const chosen = visible[Math.floor(Math.random() * visible.length)];
            return path.getPointAtLength(chosen);
          };

          const JumpController = {
            running: true,
            currentAnim: null,

            placeAtStart() {
              const start = path.getPointAtLength(0);
              const bbox = object.getBBox();
              const centerX = bbox.x + bbox.width / 2;
              const centerY = bbox.y + bbox.height / 2;

              object.removeAttribute("transform");
              object.style.transform = "";
              object.style.transformOrigin = `${centerX}px ${centerY}px`;

              anime.set(object, {
                translateX: start.x - centerX,
                translateY: start.y - centerY
              });

              console.log(`[case3][${object.id}] 🧭 Init at (${start.x.toFixed(1)}, ${start.y.toFixed(1)})`);
            },

            loop() {
              if (!this.running) return;

              const target = getVisibleTarget();
              if (!target) {
                console.warn(`[case3][${object.id}] ❌ No visible point`);
                this.running = false;
                return;
              }

              const bbox = object.getBBox();
              const centerX = bbox.x + bbox.width / 2;
              const centerY = bbox.y + bbox.height / 2;

              object.style.transformOrigin = `${centerX}px ${centerY}px`;

              this.currentAnim = anime({
                targets: object,
                translateX: target.x - centerX,
                translateY: target.y - centerY,
                duration: 1000,
                easing,
                loop: false,
                complete: () => {
                  if (this.running) this.loop();
                }
              });

              console.log(`[case3][${object.id}] 🚀 Jumping to (${target.x.toFixed(1)}, ${target.y.toFixed(1)})`);
            },

            start() {
              console.log(`[case3][${object.id}] ▶️ Starting`);
              this.running = true;
              this.placeAtStart();
              this.loop();
            },

            pause() {
              this.running = false;
              if (this.currentAnim) this.currentAnim.pause();
            },

            resume() {
              if (!this.running) {
                this.running = true;
                this.loop();
              }
            }
          };

          JumpController.start();

          window.runningAnimations[object.id] = {
            play: () => JumpController.resume(),
            pause: () => JumpController.pause(),
            resume: () => JumpController.resume(),
            wasPaused: true,
            autoStart: true
          };

          observer.observe(object);
          break;
        }






        case 4: {
          const pathLen = path.getTotalLength();
          const fixedNodes = Array.from({ length: 5 }, (_, i) => path.getPointAtLength((i / 4) * pathLen));
          const getRandom = arr => arr[Math.floor(Math.random() * arr.length)];

          const controller4 = {
            running: true,
            timer: null,
            jump() {
              if (!this.running) return;
              const point = getRandom(fixedNodes);
              const anim4 = anime({
                targets: object,
                translateX: point.x,
                translateY: point.y,
                rotate: rotate ? pathMotion('angle') : 0,
                duration: getRandom([2000, 3000, 5000, 8000, 13000]),
                easing,
                autoplay: false,
                complete: () => this.timer = setTimeout(() => this.jump(), getRandom([1000, 2000, 3000, 4000]))
              });
              window.runningAnimations[object.id] = { play: () => anim4.play(), pause: () => anim4.pause(), resume: () => anim4.play(), wasPaused: false };
              observer.observe(object);
              anim4.play();
            },
            pause() { this.running = false; clearTimeout(this.timer); },
            resume() { if (!this.running) { this.running = true; this.jump(); } }
          };

          controller4.jump();
          break;
        }

        case 5: // Smoothly Animate Between Path Start Points with Ghost Leading

          // console.log(`[DEBUG] Initializing Case 5: Animating between precomputed path variants for object ${object.id}`);

          // Get the original path ID dynamically
          const originalPathID = path.id;

          // Extract basePathID while keeping the main path intact
          const basePathIDMatch = originalPathID.match(/^(path-\d+)/);
          const basePathID = basePathIDMatch ? basePathIDMatch[1] : originalPathID; // Use full ID if no match

          // console.log(`[DEBUG] Original Path ID: ${originalPathID}`);
          // console.log(`[DEBUG] Base Path ID (for variant lookup): ${basePathID}`);

          // Retrieve precomputed path variants
          const case5Paths = [...(pathVariantsMap[basePathID] || [])];

          if (!case5Paths.some(p => p.id === originalPathID)) {
            case5Paths.unshift(path);
            // console.log(`[DEBUG] Added original path '${object.id}' to variant list.`);
          }

          // console.log(`[DEBUG] Found ${case5Paths.length} total paths for '${basePathID}'.`);

          if (case5Paths.length < 2) {
            // console.warn("[DEBUG] Not enough valid path variants detected for Case 5. Aborting.");
            break;
          }

          const case5StartPositions = case5Paths.map(path => path.getPointAtLength(0));
          const case5PauseDurations = [3000, 5000, 8000, 13000, 21000, 34000];
          const animationDuration = 2000;

          let nextTargetPosition = null; // Stores the next position so the object can follow it

          // **Find the ghost object based on the main object's ID**
          const baseObjectID = object.id.split("_")[0]; // Strip speed/direction data
          const ghostID = `ghost-${baseObjectID}`;
          let ghostObject = document.getElementById(ghostID);

          // **If ghost object exists, reset only its location-related attributes**
          if (ghostObject) {
            // console.log(`[DEBUG] Resetting ghost object '${ghostID}' location.`);
            ghostObject.removeAttribute("transform");
            ghostObject.removeAttribute("cx");
            ghostObject.removeAttribute("cy");
          } else {
            // console.warn(`[DEBUG] Ghost object '${ghostID}' not found. Creating it.`);
            ghostObject = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            ghostObject.setAttribute("id", ghostID);
            ghostObject.setAttribute("r", "10");
            ghostObject.setAttribute("fill", "rgba(0,0,255,0.5)");
            ghostObject.setAttribute("stroke", "blue");
            ghostObject.setAttribute("stroke-width", "2");
            scoreSVG.appendChild(ghostObject);
          }

          // **Create a countdown text next to the ghost**
          let countdownText = document.createElementNS("http://www.w3.org/2000/svg", "text");
          countdownText.setAttribute("id", `${ghostID}-countdown`);
          countdownText.setAttribute("fill", "red");
          countdownText.setAttribute("stroke", "red");
          countdownText.setAttribute("stroke-width", "1");
          countdownText.setAttribute("font-size", "56");
          countdownText.setAttribute("text-anchor", "middle");
          scoreSVG.appendChild(countdownText);

          // Optional: test label
          let testText = document.createElementNS("http://www.w3.org/2000/svg", "text");
          testText.setAttribute("id", `${object.id}-test-label`);
          testText.setAttribute("fill", "black");
          testText.setAttribute("stroke", "black");
          testText.setAttribute("stroke-width", "1");
          testText.setAttribute("font-size", "46");
          testText.setAttribute("text-anchor", "middle");
          scoreSVG.appendChild(testText);
          testText.textContent = "TEST"; // Set text content

          /**
           * Case 5 Controller — Ghost-following randomized path jumper
           *
           * Controls a "ghost" SVG object that jumps between random precomputed path positions,
           * along with a synchronized countdown indicator and the actual animated object.
           *
           * This version is fully observer-aware:
           *   - Ghost is registered with window.runningAnimations[ghostID]
           *   - Ghost is paused/resumed based on visibility
           *   - The main object follows the ghost after randomized delays
           *   - Countdown text is updated on screen and cleared cleanly
           */

          const Case5Controller = {
            object,
            ghost: ghostObject,
            countdown: countdownText,
            initialized: false,
            running: true,
            loopTimeout: null,
            countdownInterval: null,

            loop() {
              if (!this.running) return;

              // Select new random position from precomputed variant start points
              nextTargetPosition = case5StartPositions[Math.floor(Math.random() * case5StartPositions.length)];
              const case5PauseDuration = case5PauseDurations[Math.floor(Math.random() * case5PauseDurations.length)];
              const case5PauseSeconds = Math.round(case5PauseDuration / 1000);

              // Animate ghost to new position
              anime({
                targets: this.ghost,
                cx: nextTargetPosition.x,
                cy: nextTargetPosition.y,
                duration: animationDuration,
                easing: easing
              });

              // ✅ Align main object immediately on first loop
              if (!this.initialized) {
                anime({
                  targets: this.object,
                  translateX: nextTargetPosition.x,
                  translateY: nextTargetPosition.y,
                  duration: 1,
                  easing: 'linear'
                });
                this.initialized = true;
              }


              // Move and update countdown text
              this.countdown.setAttribute("x", nextTargetPosition.x);
              this.countdown.setAttribute("y", nextTargetPosition.y - 75);
              this.countdown.textContent = `${case5PauseSeconds}`;

              let remainingTime = case5PauseDuration / 1000;
              this.countdownInterval = setInterval(() => {
                remainingTime -= 1;
                this.countdown.textContent = `${remainingTime}`;
                if (remainingTime <= 0) {
                  clearInterval(this.countdownInterval);
                  this.countdown.textContent = "";
                }
              }, 1000);

              // After delay, move main object to ghost's position
              this.loopTimeout = setTimeout(() => {
                anime({
                  targets: this.object,
                  translateX: nextTargetPosition.x,
                  translateY: nextTargetPosition.y,
                  duration: animationDuration,
                  easing: easing,
                  complete: () => {
                    if (this.running) this.loop();
                  }
                });

                anime({
                  targets: this.countdown,
                  x: nextTargetPosition.x,
                  y: nextTargetPosition.y - 75,
                  duration: animationDuration,
                  easing: easing
                });

              }, case5PauseDuration);
            },

            pause() {
              this.running = false;
              clearTimeout(this.loopTimeout);
              clearInterval(this.countdownInterval);
            },

            resume() {
              if (!this.running) {
                this.running = true;
                this.loop();
              }
            }
          };

          // 🔁 Start the initial loop
          Case5Controller.loop();

          // ✅ Register main controller
          window.runningAnimations[object.id] = Case5Controller;

          // ✅ Register ghost object with visibility-based control logic
          window.runningAnimations[ghostID] = {
            play: () => {
              if (!Case5Controller.running) Case5Controller.resume();
            },
            pause: () => {
              if (Case5Controller.running) Case5Controller.pause();
            },
            wasPaused: false
          };

          // ✅ Optionally register countdown text to ensure observer doesn't throw errors
          window.runningAnimations[`${ghostID}-countdown`] = {
            play: () => { },
            pause: () => { },
            wasPaused: false
          };

          // ✅ Observe both the main object and ghost for visibility-based control
          observer.observe(object);
          observer.observe(ghostObject);


          console.warn(`[DEBUG] Fallback pingpong animation created for object ${object.id}`);
      }
    } catch (error) {
      console.error(`[DEBUG] Error animating object ${object.id} along path ${path.id}: ${error.message}`);
    }
  };

  //////////////////////////////////////////////////////////////
  // OPEN SOUND CONTROL OSC ////////////////////////////////////
  //////////////////////////////////////////////////////////////

  window.ENABLE_OBJ2PATH_OSC = false; // 🚫 globally disable OSC for now

  // Store last sent timestamps per path
  const oscLastSent = new Map();

  // Helper: Send OSC message to server via WebSocket
  function sendObj2PathOsc(pathId, normX, normY, angle = 0) {
    if (!window.ENABLE_OBJ2PATH_OSC) return; // 👈 bail early while in testing phase

    const now = performance.now();
    const THROTTLE_MS = 100;

    if (oscLastSent.has(pathId) && now - oscLastSent.get(pathId) < THROTTLE_MS) return;
    oscLastSent.set(pathId, now);

    if (typeof socket === "undefined" || socket.readyState !== WebSocket.OPEN) {
      console.warn("[OSC] ⚠️ WebSocket not ready yet. Skipping OSC.");
      return;
    }

    const message = {
      type: "osc_obj2path",
      pathId,
      x: normX,
      y: normY,
      angle
    };

    socket.send(JSON.stringify(message));

    console.log(
      `[OSC] 🔄 Sent OSC for ${pathId} → x: ${normX.toFixed(3)}, y: ${normY.toFixed(3)}, angle: ${angle.toFixed(2)} ` +
      `/obj2path/${pathId} ${normX.toFixed(3)} ${normY.toFixed(3)} ${angle.toFixed(2)}`

    );

  }



  function emitOSCFromPathProgress({ path, progress, pathId = null }) {


    if (!path || typeof path.getTotalLength !== 'function') return;

    const length = path.getTotalLength();
    const pathProgress = progress / 100;  // 💥 Normalize to 0–1
    const point = path.getPointAtLength(pathProgress * length);

    const bbox = path.getBBox();

    const normX = (point.x - bbox.x) / bbox.width;
    const normY = (point.y - bbox.y) / bbox.height;

    const delta = 0.1;
    const ahead = path.getPointAtLength(Math.min(length, progress * length + delta));
    const angle = Math.atan2(ahead.y - point.y, ahead.x - point.x) * (180 / Math.PI);

    // console.log(`[OSC-debug] raw point: (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`);
    // console.log(`[OSC-debug] bbox: x=${bbox.x}, y=${bbox.y}, w=${bbox.width}, h=${bbox.height}`);
    // console.log(`[OSC-debug] progress: ${progress.toFixed(4)}`);


    sendObj2PathOsc(pathId || path.id, normX, normY, angle);
  }

















  ///////////// ANIMEJS CUE HANDLER ///////////////////////////

  /**
  * Handles the execution of Anime.js cues by loading and animating SVG files.
  * Displays a countdown timer and applies fade-in/out effects with blur control.
  * Parses animation parameters, including rotation and movement paths.
  * Temporarily pauses the scrolling score and resumes it after the animation ends.
  * Ensures smooth transitions and UI cleanup after the animation duration.
  * Broadcasts playback state updates over WebSocket if enabled.
  */

  const handleAnimejsCue = async (cueId, animationPath, duration) => {
    console.log(`[DEBUG] Handling anime.js cue: ${cueId}`);

    const container = document.getElementById("animejs-container");
    const content = document.getElementById("animejs-content");
    const countdownElement = document.getElementById("animejs-countdown"); // ✅ Get countdown div

    if (!container || !content) {
      console.error("[ERROR] Anime.js container or content not found.");
      return;
    }

    // Show the popup
    container.classList.add("active");
    container.style.display = "flex";
    container.style.opacity = "1";

    // ✅ Stop any previous countdown before starting a new one
    if (window.countdownInterval) {
      clearInterval(window.countdownInterval);
      window.countdownInterval = null;
      console.log("[DEBUG] Previous countdown stopped before starting a new one.");
    }

    // Start the countdown
    let timeLeft = duration;
    countdownElement.textContent = timeLeft; // ✅ Initialize countdown display
    countdownElement.style.display = "block"; // ✅ Ensure it's visible

    window.countdownInterval = setInterval(() => {
      timeLeft -= 1;
      countdownElement.textContent = timeLeft;

      // Start fading out 3 seconds before closing
      if (timeLeft === 3) {
        console.log("[DEBUG] Starting fade-out effect.");
        container.style.transition = "opacity 2.5s ease-in-out"; // Smooth fade-out
        container.style.opacity = "0";
        // ✅ Gradually remove blur over 2.5s
        document.body.querySelectorAll('.blur-background').forEach((element) => {
          element.style.transition = "filter 2.5s ease-in-out"; // Smooth transition
          element.style.filter = "blur(0px)"; // Gradually remove blur
        });
      }

      if (timeLeft <= 0) {
        clearInterval(window.countdownInterval);
        window.countdownInterval = null;
      }
    }, 1000);


    // Fetch and load the SVG directly inside #animejs-content
    try {
      const response = await fetch(animationPath);
      if (!response.ok) throw new Error("Failed to load SVG.");
      const svgText = await response.text();

      content.innerHTML = svgText; // ✅ Inject SVG directly
      const svgElement = content.querySelector("svg");

      if (svgElement) {
        console.log("[DEBUG] Setting SVG to fullscreen mode.");

        svgElement.setAttribute("width", "100vw");
        svgElement.setAttribute("height", "100vh");
        svgElement.setAttribute("preserveAspectRatio", "xMidYMid meet"); // Maintain aspect ratio
      }

      else if (!svgElement) {
        console.error("[ERROR] No SVG element found inside the animation file.");
        return;
      }

      console.log("[DEBUG] Successfully loaded SVG, initializing animations...");

      // Remove built-in SVG animations
      svgElement.querySelectorAll("animate, animateTransform").forEach((el) => el.remove());
      console.log("[DEBUG] Built-in SVG animations disabled.");

      // Handle animations
      const obj2pathObjects = Array.from(svgElement.querySelectorAll('[id^="obj2path-"]'));
      const objRotateObjects = Array.from(svgElement.querySelectorAll('[id^="obj_"]'));

      if (obj2pathObjects.length === 0 && objRotateObjects.length === 0) {
        console.error("[DEBUG] No animatable objects found. Exiting.");
        return;
      }

      // Pause scrolling score
      const wasPlaying = isPlaying;
      if (isPlaying) {
        console.log("[DEBUG] Pausing scrolling score for Anime.js cue.");
        isPlaying = false;
        stopAnimation();

        if (wsEnabled && socket) {
          socket.send(JSON.stringify({ type: "pause", playheadX, elapsedTime }));
          console.log(`[DEBUG] Sent pause message to server. Elapsed Time: ${elapsedTime}`);
        }
      }

      // Animate obj2path-* objects
      obj2pathObjects.forEach((object) => {
        const pathId = object.id
          .replace(/_speed_\d+/, "")
          .replace(/_direction_\d+/, "")
          .replace("obj2path-", "path-");

        const path = svgElement.getElementById(pathId);
        if (!path) {
          console.warn(`[DEBUG] No path found for object ID: ${object.id}, expected path ID: ${pathId}. Skipping.`);
          return;
        }

        console.log(`[DEBUG] Animating obj2path pair: object=${object.id}, path=${pathId}`);
        animateObjToPath(object, path, duration, []);
      });

      // Animate obj_*_rotate_* objects
      objRotateObjects.forEach((object) => {
        const objectId = object.id;
        if (objectId.includes("_rotate_")) {
          console.log(`[DEBUG] Processing rotation animation for object: ${objectId}`);

          // Extract rotation parameters
          const rotationMatch = objectId.match(/_rotate_(\d+)/);
          const rpm = rotationMatch ? parseInt(rotationMatch[1], 10) : 1;

          const directionMatch = objectId.match(/_dir_(\d+)/);
          const direction = directionMatch ? parseInt(directionMatch[1], 10) : 0;

          const pivotXMatch = objectId.match(/_pivot_x_(-?\d+)/);
          const pivotYMatch = objectId.match(/_pivot_y_(-?\d+)/);
          let pivotX = pivotXMatch ? parseInt(pivotXMatch[1], 10) : null;
          let pivotY = pivotYMatch ? parseInt(pivotYMatch[1], 10) : null;

          const easingMatch = effectiveId.match(/_ease_([a-zA-Z0-9_]+)/);
          const easing = easingMatch ? easingMatch[1].replace(/_/g, '-') : 'linear';

          // Calculate center point if no pivot is specified
          if (pivotX === null || pivotY === null) {
            const bbox = object.getBBox();
            pivotX = bbox.x + bbox.width / 2;
            pivotY = bbox.y + bbox.height / 2;
            console.log(`[DEBUG] Auto-calculated center for ${objectId}: (${pivotX}, ${pivotY})`);
          } else {
            console.log(`[DEBUG] Using custom pivot point for ${objectId}: (${pivotX}, ${pivotY})`);
          }

          // Apply correct transform-origin
          object.style.transformOrigin = `${pivotX}px ${pivotY}px`;

          // Apply rotation animation
          const anim = anime({
            targets: object,
            rotate: direction === 1 ? "-=360" : "+=360",
            duration: (60 / rpm) * 1000,
            easing: easing,
            loop: true,
          });

          // ✅ Register with runningAnimations for observer tracking
          if (object?.id) {
            window.runningAnimations[object.id] = {
              play: () => anim.play?.(),
              pause: () => anim.pause?.(),
              resume: () => anim.play?.(),
              wasPaused: false
            };
          }
        }
      });

    } catch (error) {
      console.error(`[ERROR] Failed to load SVG: ${error.message}`);
    }

    // Hide popup after animation duration
    setTimeout(() => {
      container.classList.remove("active");
      container.style.display = "none";
      content.innerHTML = ""; // ✅ Remove the loaded SVG
      countdownElement.style.display = "none"; // ✅ Hide countdown
      clearInterval(countdownInterval); // ✅ Ensure timer stops

      // ✅ Ensure blur effect is fully removed after fade-out
      document.body.querySelectorAll('.blur-background').forEach((element) => {
        element.style.filter = ""; // Reset filter to default
        element.classList.remove('blur-background'); // Remove blur class
      });

      console.log("[DEBUG] Blur effect fully removed after fade-out.");

      // ✅ Resume scrolling score playback
      if (!isPlaying) {
        console.log("[DEBUG] Resuming scrolling score after Anime.js popup.");
        isPlaying = true;
        animationPaused = false; // Ensure animations are not paused
        startAnimation(); // Resume the animation loop

        if (wsEnabled && socket) {
          const message = JSON.stringify({ type: "play", elapsedTime });
          console.log(`[DEBUG] Sending play message to server: ${message}`);
          socket.send(message);
        }
      }

      console.log(`[DEBUG] Anime.js popup hidden after ${duration} seconds.`);
    }, duration * 1000);
  };

  window.handleAnimejsCue = handleAnimejsCue;


  /**
  * Handles cue selection by displaying available animation choices.
  * Extracts animation files and durations dynamically from the cue ID.
  * Ensures score playback pauses when cue choices appear.
  * Applies UI changes, including background blur and animation previews.
  * Allows users to select an animation, triggering enlargement and playback.
  * Cleans up and restores UI after a selection is made.
  */

  const handleCueChoice = (cueId) => {
    console.log(`[DEBUG] Handling cue choice: ${cueId}`);

    // ✅ Reset previous cue state but do not remove the container
    //dismissCueChoice();

    // ✅ Ensure the container and header exist before modifying them
    setTimeout(() => {
      const gridContainer = document.getElementById("cue-choice-container");
      const header = document.getElementById("cue-choice-header");

      if (!gridContainer || !header) {
        console.error("[ERROR] cue-choice-container or header not found in HTML.");
        return;
      }

      // ✅ Restore visibility
      gridContainer.classList.remove("hidden");
      gridContainer.style.display = "flex"; // ✅ Ensures it's visible
      header.classList.remove("hidden");

      // ✅ Extract animation files and durations dynamically
      const parseCueNamespace = (cueId) => {
        const cueParams = cueId.split('_').slice(2);
        const animations = [];
        let i = 0;

        console.log("[DEBUG] Raw cueParams:", cueParams);

        while (i < cueParams.length) {
          const param = cueParams[i];

          // ✅ Skip invalid params
          if (!param || param === "dur" || !isNaN(param)) {
            console.warn(`[DEBUG] Skipping invalid param: ${param}`);
            i++;
            continue;
          }

          const file = param;
          let duration = 30; // Default duration

          if (i + 2 < cueParams.length && cueParams[i + 1] === "dur" && !isNaN(cueParams[i + 2])) {
            duration = parseInt(cueParams[i + 2], 10);
            i += 2; // Skip "dur" and the duration number
          }

          animations.push({ choice: file, dur: duration });
          console.log(`[DEBUG] Added animation: ${file} with duration: ${duration}`);
          i++;
        }

        console.log('[DEBUG] Final extracted animations:', animations);
        return animations;
      };

      let animations = parseCueNamespace(cueId);
      if (!animations.length) {
        console.error("[DEBUG] No valid animations found in cue namespace.");
        return;
      }

      console.log("[DEBUG] `animations` at start:", animations);

      // ✅ Ensure score pauses when the cueChoice appears
      if (isPlaying) {
        console.log('[DEBUG] Pausing score for cue choice.');
        isPlaying = false;
        stopAnimation();
        if (wsEnabled && socket) {
          socket.send(JSON.stringify({ type: 'pause', playheadX, elapsedTime }));
          console.log(`[DEBUG] Sent pause message to server. Elapsed Time: ${elapsedTime}`);
        }
      } else {
        console.warn("[DEBUG] Score was already paused, not stopping again.");
      }

      // ✅ Ensure UI changes reflect the cue choice
      //gridContainer.innerHTML = ""; // ✅ Clears previous choices

      // ✅ Blur all other elements except the choice grid
      document.body.querySelectorAll(':scope > *').forEach((element) => {
        if (element.id !== 'cue-choice-container' && element.id !== 'controls') {
          element.classList.add('blur-background');
        }
      });

      // ✅ Populate choices dynamically with SVG thumbnails
      animations.forEach(({ choice, dur }) => {
        console.log(`[DEBUG] Loading animation: ${choice} with duration: ${dur}`);

        const div = document.createElement("div");
        div.classList.add("cue-choice-item");
        div.dataset.choice = choice;
        div.textContent = `${choice} (${dur}s)`;

        // ✅ Create an SVG object to load the animation as a thumbnail
        const svgThumbnail = document.createElement("object");
        svgThumbnail.type = "image/svg+xml";
        svgThumbnail.data = `animations/${choice}.svg`; // ✅ Load SVG thumbnail
        svgThumbnail.classList.add("cue-choice-thumbnail");

        // ✅ Debugging for SVG loading
        svgThumbnail.onload = () => {
          console.log(`[DEBUG] Successfully loaded SVG thumbnail: ${choice}`);
        };

        svgThumbnail.onerror = () => {
          console.error(`[ERROR] Failed to load SVG thumbnail: ${choice}`);
        };

        div.appendChild(svgThumbnail); // ✅ Append SVG thumbnail to choice item

        div.addEventListener("click", () => {
          console.log(`[DEBUG] Animation ${choice} clicked. Dismissing choice grid.`);
          dismissCueChoice();
          handleEnlargeAnimation(choice, dur);
        });

        gridContainer.appendChild(div);
      });

      console.log("[DEBUG] cue-choice-container and header restored with new choices.");
    }, 200); // ✅ Short delay ensures element is restored before modifying
  };


  const dismissCueChoice = () => {
    console.log("[DEBUG] Dismissing cue choice container.");

    const gridContainer = document.getElementById("cue-choice-container");
    if (gridContainer) {
      gridContainer.classList.add("hidden"); // ✅ Hide instead of remove

      // ✅ Only remove dynamically created choice items, NOT the container itself
      const choices = gridContainer.querySelectorAll(".cue-choice-item");
      choices.forEach((choice) => choice.remove());
    }

    const header = document.getElementById("cue-choice-header");
    if (header) {
      header.classList.add("hidden");
    }

    // ✅ Ensure background blur is removed
    document.body.querySelectorAll(".blur-background").forEach((element) => {
      element.classList.remove("blur-background");
    });

    console.log("[DEBUG] Cue choice dismissed and reset.");
  };






  // Global map to track active audio cues
  const activeAudioCues = new Map();
  const maxAudioInstances = 5;

  const stopAllAudio = () => {
    console.log("[INFO] Stopping all active audio cues.");
    activeAudioCues.forEach(({ wavesurfer }) => wavesurfer.destroy());
    activeAudioCues.clear();
    // document.getElementById('waveform-container').style.display = 'none';
  };

  const audioseekBar = document.getElementById("seek-bar");

  if (audioseekBar) {
    audioseekBar.addEventListener("mousedown", stopAllAudio);
  } else {
    console.error("[ERROR] Seek bar element not found! Ensure 'seek-bar' exists in the DOM.");
  }







  /**
 * sendAudioOscTrigger({ cueId, filename, volume, loop })
 *
 * Sends a WebSocket message to trigger audio playback via OSC-compatible backend.
 * - Used for all cueAudio-style events that play sound files.
 * - Ensures the WebSocket is open before sending.
 * - Includes filename, volume, loop count, and timestamp in the payload.
 *
 * @param {Object} params
 * @param {string} params.cueId        - The original cue ID (used for error context/logging).
 * @param {string} params.filename     - The audio file path (including extension, e.g. "kick.wav").
 * @param {number} [params.volume=1]   - The gain level for playback (0.0 to 1.0).
 * @param {number} [params.loop=1]     - Number of times to loop (0 = infinite).
 */

  const sendAudioOscTrigger = ({ cueId, filename, volume = 1, loop = 1 }) => {
    if (!wsEnabled || !socket || socket.readyState !== WebSocket.OPEN) {
      console.error(`[ERROR] WebSocket not connected. Could not send OSC audio cue: ${cueId}`);
      return;
    }
  
    const message = {
      type: "osc_audio_trigger",
      filename,
      volume,
      loop,
      timestamp: Date.now(),
    };
  
    console.log(`[OSC] 🎧 Sending audio cue:`, message);
    socket.send(JSON.stringify(message));
  };
  
  /**
  * Handles audio cues by parsing cue IDs and playing audio with Wavesurfer.js.
  * Supports volume control, looping, fade-in, and fade-out effects.
  * Ensures only a limited number of active audio instances run at a time.
  * Stops existing instances of the same audio before playing a new one.
  * Broadcasts audio cue events over WebSocket if enabled.
  */
  
  const handleAudioCue = (cueId, cueParams) => {
    console.log(`[DEBUG] Handling audio cue: ${cueId}`);


// TODO [Audio Routing]:
// This client-side audio cue is currently played locally by any client that triggers the cue.
// This bypasses intended routing logic where only a designated "playback master" client should handle browser-based audio (e.g. via WaveSurfer.js).
// Temporary fix: block playback unless `window.isPlaybackMaster` is true.
// Proper fix: implement a server-side playback role assignment system and broadcast role states to clients.
// → Also consider a fallback for cases where no playback master is defined (e.g. solo mode).

    if (!window.isPlaybackMaster) {
      console.log(`[INFO] Skipping local audio playback: this client is not the designated playback master.`);
      return;
    }

    const supportedFormats = ['wav', 'flac', 'mp3', 'ogg', 'aac', 'm4a', 'webm'];

    // 🧱 Determine filename (required)
    const filenameBase = cueParams.file || cueParams.choice;
    if (!filenameBase) {
      console.error(`[ERROR] cueAudio requires a 'file' or 'choice' param: ${cueId}`);
      return;
    }

    // 🎧 Choose file extension
    let ext = cueParams.ext || 'wav';
    if (!supportedFormats.includes(ext)) {
      console.warn(`[WARNING] Unsupported extension '${ext}', falling back to 'wav'.`);
      ext = 'wav';
    }

    let filename;
    if (filenameBase.includes('.')) {
      // ✅ Trust filename if it already has an extension
      filename = filenameBase;
      ext = filename.split('.').pop(); // update `ext` just for info/logging
      if (!supportedFormats.includes(ext)) {
        console.warn(`[WARNING] Unsupported or unknown extension in filename: '${filename}'`);
      }
    } else {
      filename = `${filenameBase}.${ext}`;
    }

    const audioPath = `audio/${filename}`;

    // 🔊 Get volume (amp) or default to 1
    const volume = typeof cueParams.amp === 'number' ? cueParams.amp : 1;

    // 🔁 Get loop count (0 = infinite)
    const loopCount = typeof cueParams.loop === 'number' ? cueParams.loop : 1;
    const shouldLoop = loopCount === 0 ? true : loopCount;

    // 🌫 Fade values
    const fadeIn = typeof cueParams.fadein === 'number' ? cueParams.fadein : 0;
    const fadeOut = typeof cueParams.fadeout === 'number' ? cueParams.fadeout : 0;

    // 💥 Stop existing audio of same file
    if (activeAudioCues.has(filename)) {
      console.log(`[INFO] Stopping existing instance of ${filename}`);
      activeAudioCues.get(filename).wavesurfer.destroy();
      activeAudioCues.delete(filename);
    }

    // 🧱 Limit concurrent audio
    if (activeAudioCues.size >= maxAudioInstances) {
      console.warn(`[WARNING] Max audio instances reached. Skipping cue: ${filename}`);
      return;
    }

    const wavesurfer = WaveSurfer.create({
      container: "#waveform-container",
      waveColor: 'blue',
      progressColor: 'darkblue',
      backend: 'WebAudio',
      height: 50,
    });

    wavesurfer.load(audioPath);

    wavesurfer.on('ready', () => {
      console.log(`[INFO] Playing ${filename} @ volume ${volume}, loop: ${loopCount}, fade-in: ${fadeIn}s, fade-out: ${fadeOut}s`);
      wavesurfer.setVolume(0);
      wavesurfer.play();

      // 🔼 Apply fade-in
      if (fadeIn > 0) {
        let fadeStep = volume / (fadeIn * 10);
        let fadeInterval = setInterval(() => {
          let current = wavesurfer.getVolume();
          if (current + fadeStep >= volume) {
            wavesurfer.setVolume(volume);
            clearInterval(fadeInterval);
          } else {
            wavesurfer.setVolume(current + fadeStep);
          }
        }, 100);
      } else {
        wavesurfer.setVolume(volume);
      }
    });

    // 🔁 Handle looping
    let playCount = 1;
    wavesurfer.on('finish', () => {
      if (shouldLoop === true || playCount < shouldLoop) {
        console.log(`[INFO] Looping (${playCount}/${shouldLoop === true ? '∞' : shouldLoop})`);

        if (playCount === shouldLoop - 1 && fadeOut > 0) {
          console.log(`[INFO] Preparing fade-out on final loop: ${fadeOut}s`);
          startFadeOutBeforeEnd(wavesurfer, fadeOut, filename);
        }

        playCount++;
        wavesurfer.play();
      } else {
        console.log(`[INFO] Done looping ${filename}.`);
        activeAudioCues.delete(filename);
        wavesurfer.destroy();
      }
    });

    activeAudioCues.set(filename, { wavesurfer, volume });

    sendAudioOscTrigger({ cueId, filename, volume, loop: loopCount });
  };




  // if (typeof socket === "undefined" || socket === null) {
  //   console.error("[ERROR] WebSocket is not initialized. Reconnecting...");
  //   //connectWebSocket();
  // } else {
  //   socket.addEventListener("message", (event) => {
  //     try {
  //       const data = JSON.parse(event.data);
  //       if (data.type === "audio_cue") {
  //         console.log(`[CLIENT] Received audio cue event: ${data.filename} at volume ${data.volume}`);
  //         handleAudioCue(data.cueId);
  //       }
  //     } catch (error) {
  //       console.error("[ERROR] Failed to parse WebSocket message:", error);
  //     }
  //   });
  // }


  window.onload = () => {
    window.handleAudioCue = handleAudioCue;
    console.log("handleAudioCue is now available globally.");
  };




  /**
  * Handles the animation enlargement effect with Anime.js.
  * Ensures the animation container exists and applies blur effects.
  * Loads and plays the animation, then fades out and cleans up after completion.
  * Restarts the score animation loop and sends play state updates if needed.
  */

  const handleEnlargeAnimation = (file, duration) => {
    console.log(`[DEBUG] Enlarging animation using handleAnimejsCue: ${file}`);

    let container = document.getElementById("animejs-container");

    // ✅ Ensure the container exists before modifying it
    if (!container) {
      console.error("[ERROR] animejs-container not found. Creating a new one.");
      container = document.createElement("div");
      container.id = "animejs-container";
      container.classList.add("animejs-container");
      document.body.appendChild(container); // ✅ Recreate if missing
    }

    // Apply blur effect to all elements except controls and the animation container
    document.body.querySelectorAll(':scope > *').forEach((element) => {
      if (element.id !== 'animejs-container' && element.id !== 'controls') {
        element.classList.add('blur-background');
        element.classList.remove('unblur-background');
      }
    });

    container.classList.add('fade-in'); // Start with fade-in class

    //Ensure fade-in applies after rendering
    setTimeout(() => container.classList.add('active'), 10);



    // Load the animation inside the container
    handleAnimejsCue(`cueAnimejs_${file}`, `animations/${file}.svg`, duration);

    svgThumbnail.onload = () => {
      console.log(`[DEBUG] Successfully loaded SVG thumbnail: ${choice}`);

      const innerSVG = svgThumbnail.contentDocument?.querySelector("svg");
      if (innerSVG) {
        initializeSVG(innerSVG); // ✅ Triggers all animation setup
      } else {
        console.warn("[DEBUG] Could not find inner SVG in thumbnail:", svgThumbnail);
      }
    };



    // Fade-out and cleanup after animation duration
    setTimeout(() => {
      console.log(`[DEBUG] Animation ${file} duration reached. Fading out.`);
      container.classList.add('fade-out');
      container.classList.remove('active');

      // Wait for fade-out transition to complete before removing container
      container.addEventListener('transitionend', () => {
        console.log('[DEBUG] Fade-out transition completed. Removing animation container.');

        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }

        // Remove blur effect with smooth transition
        document.body.querySelectorAll('.blur-background').forEach((element) => {
          element.classList.remove('blur-background');
          element.classList.add('unblur-background');
        });

        console.log('[DEBUG] Blur effect removed.');

        // ✅ Restart the score animation after animation dismissal
        console.log('[DEBUG] Restarting score animation loop.');
        isPlaying = true;
        startAnimation();

        if (wsEnabled && socket) {
          socket.send(JSON.stringify({ type: 'play', playheadX, elapsedTime }));
          console.log(`[DEBUG] Sent play message to server. Elapsed Time: ${elapsedTime}`);
        }
      }, { once: true });
    }, duration * 1000);
  };

  window.handleCueChoice = handleCueChoice;


  window.addEventListener("load", () => {
    console.log("[DEBUG] Page reloaded, dismissing splash screen.");

    const splashScreen = document.getElementById("splash-screen");
    if (splashScreen) {
      splashScreen.style.display = "none"; // 🔥 Hide splash screen after reload
    }

  });


  // end of event handlers

  ///////////////////////////////////////////////////////

  const applyCustomAnimation = (objectId, namespace) => {

    if (namespace.includes('_scale_')) {
      startScale(object);
      return;
    }

    console.log(`[DEBUG] Applying custom animation for object: ${objectId}`);

    // Parse parameters from the namespace
    const rotationMatch = namespace.match(/_rotate_(\d+)/);
    const rpm = rotationMatch ? parseInt(rotationMatch[1], 10) : 0; // Rotations per minute

    const directionMatch = namespace.match(/_dir_(\d+)/);
    const direction = directionMatch ? parseInt(directionMatch[1], 10) : 0; // Default clockwise

    const pivotXMatch = namespace.match(/_pivot_x_(-?\d+)/);
    const pivotYMatch = namespace.match(/_pivot_y_(-?\d+)/);
    const pivotX = pivotXMatch ? parseInt(pivotXMatch[1], 10) : 0; // Default center X
    const pivotY = pivotYMatch ? parseInt(pivotYMatch[1], 10) : 0; // Default center Y

    const durationMatch = namespace.match(/_dur_(\d+)/);
    const duration = durationMatch ? parseInt(durationMatch[1], 10) * 1000 : null; // Convert seconds to ms


    const easingMatch = effectiveId.match(/_ease_([a-zA-Z0-9_]+)/);
    const easing = easingMatch ? easingMatch[1].replace(/_/g, '-') : 'linear';

    // Calculate rotation speed in milliseconds
    const rotationDuration = (60 / rpm) * 1000; // Convert RPM to milliseconds per rotation
    const loop = duration ? false : true; // Infinite loop if no duration is specified

    // Apply animation using Anime.js
    const object = document.getElementById(objectId);
    if (!object) {
      console.error(`[DEBUG] Object with ID ${objectId} not found.`);
      return;
    }

    console.log(`[DEBUG] Parsed animation parameters: RPM=${rpm}, Direction=${direction}, Pivot=(${pivotX}, ${pivotY}), Duration=${duration}, Easing=${easing}`);

    // Set pivot point for rotation
    object.style.transformOrigin = `${pivotX}px ${pivotY}px`;

    // Apply Anime.js animation
    const anim = anime({
      targets: object,
      rotate: direction === 1 ? `-=${360}` : `+=${360}`, // Counterclockwise or clockwise
      duration: rotationDuration,
      easing: easing,
      loop: loop,
      endDelay: loop ? 0 : duration, // Ends after duration if specified
    });

    // ✅ Register with runningAnimations for observer tracking
    if (object?.id) {
      // Always register for visibility/pause control
      window.runningAnimations[object.id] = {
        play: () => anim.play?.(),
        pause: () => anim.pause?.(),
        resume: () => anim.play?.(),
        wasPaused: false
      };

      // 🔁 Register deferred animation if _t(1) is in the ID or data-id
      const effectiveId = object.getAttribute('data-id') || object.id;
      if (effectiveId.includes('_t(1)')) {
        if (!window.pendingPathAnimations) window.pendingPathAnimations = new Map();
        window.pendingPathAnimations.set(object.id, () => anim.play());
        console.log(`[obj2path] 🔁 Deferred path-follow registered for ${object.id}`);
      } else {
        anim.play(); // ✅ Auto-start if not triggerable
      }
    }


  };


  /////////////////////

  const handleCustomAnimations = (svgElement) => {
    const objects = Array.from(svgElement.querySelectorAll('[id^="obj_"]'));
    objects.forEach((object) => {
      const objectId = object.id;
      applyCustomAnimation(objectId, objectId); // Use the object ID as the namespace
    });
  };

  ///////////////////////////////////////////////////////

  const handleOscCue = (cueId) => {
    /**
    * ✅ Processes `cueOsc` messages from clients.
    * - Extracts and validates the cue number before sending to OSC.
    * - Prevents duplicate triggers by tracking already sent cues.
    */
    console.log(`[DEBUG] Triggering OSC cue: ${cueId}`);

    // ✅ Extract the numeric cue number from `cueId`
    const cueNumber = parseInt(cueId.replace(/\D/g, ""), 10); // Removes non-numeric characters

    if (isNaN(cueNumber)) {
      console.warn(`[WARNING] Invalid cue number detected: ${cueId}`);
      return;
    }

    if (wsEnabled && socket && socket.readyState === WebSocket.OPEN) {
      const oscMessage = {
        type: "osc",
        subType: "trigger",
        data: cueNumber, // ✅ Now sends an integer instead of a string
        timestamp: Date.now(),
      };

      socket.send(JSON.stringify(oscMessage));
      console.log(`[DEBUG] OSC message sent:`, oscMessage);
    } else {
      console.warn(`[WARNING] WebSocket is not open. Cannot send OSC cue '${cueId}'.`);
    }
  };



  ////CUE HANDLERS //////////////////////////////////////////
  // TODO check if moving all cue stuff here breaks anything


  /**
  * resetTriggeredCues() → Clears the triggeredCues set while preserving active cueRepeat_* entries.
  *
  * Used during rewind, fast forward, or restart actions to allow regular cues to be retriggered
  * without accidentally restarting ongoing repeat loops.
  *
  * cueRepeat_* cues are preserved if their corresponding repeatStateMap entry is still active.
  * This prevents repeated re-entry into handleRepeatCue() after seeking or rewinding mid-loop.
  */

  let triggeredCues = new Set(); // ✅ Initialize it as a global Set()

  function resetTriggeredCues() {
    console.log("[resetTriggeredCues] Resetting cues, preserving active cueRepeat_*");

    const preserved = new Set();

    for (const cueId of triggeredCues) {
      if (cueId.startsWith("cueRepeat") && repeatStateMap[cueId]?.active) {
        preserved.add(cueId);
      }
    }

    triggeredCues.clear();

    for (const cueId of preserved) {
      triggeredCues.add(cueId);
    }

    console.log(`[resetTriggeredCues] Preserved ${preserved.size} active cueRepeat_* entries.`);
  }

  /**
  * handleCueTrigger(cueId) → Determines the cue type and calls the corresponding cue handler.
  * It also sends a WebSocket message to the server to notify other connected clients.
  * Related: Server-side "cueTriggered" handler (rebroadcasts the cue event for synchronization).
  */

  const cueHandlers = {
    "cueSpeed": handleSpeedCue,
    "cuePause": handlePauseCue,
    "cueStop": handleStopCue,
    "cueChoice": handleCueChoice,
    "cueAnimation": handleAnimationCue,
    "cueAnimejs": handleAnimejsCue,
    "cueAudio": handleAudioCue,
    "cueVideo": handleVideoCue,
    "cueP5": handleP5Cue,
    "cueOsc": handleOscCue,
    "cueOscTrigger": handleOscCue,
    "cueOscValue": handleOscCue,
    "cueOscSet": handleOscCue,
    "cueOscRandom": handleOscCue,
    "cueOscBurst": handleOscCue,
    "cueOscPulse": handleOscCue,
    "cueRepeat": handleRepeatCue,
    "cueTraverse": handleTraverseCue,
    "c-t": handleTraverseCue,
  };


  /**
   * Parses a cueTraverse or c-t cue using only ()-style tag values.
   * Supports:
   * - o(...) → ID of target object (required)
   * - t(1)   → mark as triggerable (optional)
   */
  function parseTraverseCueId(cueId) {
    const params = {
      cueId,
      objId: null,
      triggerable: false
    };

    // Required: o(targetId)
    const objMatch = cueId.match(/[_-]o\(([^)]+)\)/);
    if (objMatch) {
      params.objId = objMatch[1];
    }

    // Optional: t(1)
    const triggerMatch = cueId.match(/[_-]t\(([^)]+)\)/);
    if (triggerMatch) {
      params.triggerable = triggerMatch[1] === "1";
    }

    if (!params.objId) {
      console.warn("[parseTraverseCueId] ❌ Missing object target (o)");
      return null;
    }

    return params;
  }



  window.parseTraverseCueId = parseTraverseCueId;


  /**
   * Starts animation for a cueTraverse (c-t) cue.
   * Looks up an object by objId, reads its data-id, and triggers animation if _t(1).
   * Animation is triggered using the data-id as the key in all pending*Animations maps.
   */
  function startTraverseAnimation(config) {
    if (!config || !config.objId) {
      console.warn("[startTraverseAnimation] ❌ Invalid config or missing objId");
      return;
    }

    const target = document.getElementById(config.objId);
    if (!target) {
      console.warn(`[startTraverseAnimation] ❌ No object found with id ${config.objId}`);
      return;
    }

    const dataId = target.getAttribute("data-id");
    if (!dataId) {
      console.warn(`[startTraverseAnimation] ⚠️ Object ${config.objId} missing data-id attribute`);
      return;
    }

    if (!dataId.includes("_t(1)")) {
      console.warn(`[startTraverseAnimation] ⚠️ data-id for ${config.objId} is not triggerable (_t(1) missing)`);
      return;
    }

    // 🔁 Look up in any of the animation maps using data-id as the key
    const animationId = target.getAttribute("data-id");

    if (animationId.includes("_t(1)")) {
      const pending =
        window.pendingScaleAnimations?.get(animationId) ||
        window.pendingScaleAnimations?.get(config.objId); // fallback

      if (pending) {
        console.log(`[startTraverseAnimation] ✅ Triggering deferred animation for data-id: ${animationId}`);
        pending();  // ✅ Call the stored function
        console.log(`[scale:_t] 🔴 timeline.play() called for ${animationId}`);
      } else {
        console.warn(`[startTraverseAnimation] ⚠️ No pending animation found for data-id: ${animationId}`);
      }
    }
  }




  async function handleTraverseCue(cueId) {
    const config = parseTraverseCueId(cueId);
    if (!config) return;

    console.log("[handleTraverseCue] 🚶 Triggered cueTraverse:", config);

    // TODO: Animate the object
    startTraverseAnimation(config);
  }

  window.parseTraverseCueId = parseTraverseCueId;



  function parseCueParams(cueId) {
    console.log(`[parseCueParams] Raw cueId: ${cueId}`);

    // 🧹 Clean suffixes like -123, -use, -clone
    const lastParenIndex = cueId.lastIndexOf(")");
    const cleaned = lastParenIndex !== -1
      ? cueId.slice(0, lastParenIndex + 1)
      : cueId;    console.log(`[parseCueParams] Cleaned cueId: ${cleaned}`);

    // 🎯 Extract cue type (e.g. cueAudio)
    const typeMatch = cleaned.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
    const type = typeMatch ? typeMatch[1] : null;

    if (!type) {
      console.warn(`[parseCueParams] ❌ Could not extract cue type from: ${cueId}`);
      return { type: cueId, cueParams: {}, cleanedId: cleaned };
    }

    console.log(`[parseCueParams] Parsed cue type: ${type}`);

    const cueParams = {};
    const paramString = cleaned.slice(type.length);
    console.log(`[parseCueParams] Remaining param string: ${paramString}`);

    // ✅ Step 1: check if we have a leading anonymous `(value)` before any `_`
    if (paramString.startsWith('(')) {
      const leadingValueMatch = paramString.match(/^\(([^)]+)\)/);
      if (leadingValueMatch) {
        const raw = leadingValueMatch[1];
        const parsed = isNaN(raw) ? raw : parseFloat(raw);
        cueParams["choice"] = parsed;
        console.log(`[parseCueParams] Leading anonymous param → choice: ${parsed}`);

        // Remove this segment from the string
        const rest = paramString.slice(leadingValueMatch[0].length);
        parseKeyValueParams(rest, cueParams);
      } else {
        console.warn(`[parseCueParams] ⚠️ Invalid leading value format: ${paramString}`);
      }
    } else {
      // No anonymous param → parse whole string as key(value) pairs
      parseKeyValueParams(paramString, cueParams);
    }

    console.log(`[parseCueParams] Final cueParams:`, cueParams);
    return { type, cueParams, cleanedId: cleaned };
  }

  // 🧩 Helper: parse _key(value)_key(value)... string into cueParams
  function parseKeyValueParams(str, cueParams) {
    const regex = /_([a-zA-Z0-9]+)\(([^)]+)\)/g;
    let match;
    while ((match = regex.exec(str)) !== null) {
      const [, key, value] = match;
      const parsed = isNaN(value) ? value : parseFloat(value);
      cueParams[key] = parsed;
      console.log(`[parseCueParams] Keyed param: ${key} = ${parsed}`);
    }
  }









  /**
  * handleCueTrigger(cueId) → Main dispatcher for all cue types.
  *
  * Called when the playhead overlaps a cue element. Parses the cue type from the ID,
  * extracts parameters (e.g., duration, speed, choice), and invokes the appropriate
  * cue handler from the cueHandlers map.
  *
  * Handles both synchronous and asynchronous cue types. For example, cueRepeat_*
  * uses async control flow (with await and pauses) to manage jump and playback timing.
  *
  * Special handling includes:
  * - cueRepeat_*: Prevents retriggering if the repeat is already active (via repeatStateMap)
  * - cueSpeed, cuePause, cueChoice: Parses duration/speed/choice from ID segments
  *
  * After handling, the cueId is added to triggeredCues to prevent retriggering.
  * Also emits a cueTriggered message over WebSocket if wsEnabled.
  */
  const handleCueTrigger = (cueId, isRemote = false) => {
    console.log(`[DEBUG] Attempting to trigger cue: ${cueId}`);
  
    if (triggeredCues.has(cueId)) {
      console.log(`[DEBUG] Skipping already-triggered cue: ${cueId}`);
      return;
    }
  
    // ✅ Parse cueId using param(value) format
    const { type, cueParams } = parseCueParams(cueId);
  
    console.log(`[parseCueParams] Final cue type: ${type}`);
    console.log(`[parseCueParams] Final cueParams:`, cueParams);
  
    // ❗ Validate cue type exists
    if (!cueHandlers.hasOwnProperty(type)) {
      console.warn(`[CLIENT] No handler found for cue type: ${type}`);
      return;
    }
  
    // 🔁 Switch-case dispatch based on cue type
    switch (type) {
      case "cueSpeed": {
        const speed = cueParams.speed ?? cueParams.Speed ?? cueParams.choice;
        if (!speed || isNaN(speed)) {
          console.warn(`[CLIENT] ❌ Invalid or missing speed in cueSpeed: ${cueId}`);
          return;
        }
        cueHandlers[type](cueId, Number(speed));
        break;
      }
  
      case "cuePause": {
        const durationSec = cueParams.duration ?? cueParams.dur ?? cueParams.choice;
        const durationMs = Number(durationSec) * 1000;
        if (!durationMs || isNaN(durationMs)) {
          console.error(`[CLIENT] Invalid duration for cuePause: ${cueId}`);
          return;
        }
        cueHandlers[type](cueId, durationMs);
        break;
      }
  
      case "cueStop": {
        cueHandlers[type](cueId);
        break;
      }
  
      case "cueRepeat": {
        if (repeatStateMap[cueId]?.active) {
          console.log(`[repeat] ⚠️ Repeat ${cueId} already active — skipping re-trigger`);
          return;
        }
        cueHandlers[type](cueId, cueParams);
        break;
      }
  
      case "cueTraverse":
      case "c-t": {
        cueHandlers[type](cueId, cueParams);
        break;
      }
  
      case "cueChoice": {
        if (cueParams.choice && cueParams.dur) {
          cueHandlers[type](cueId, cueParams);
        } else {
          console.error(`[CLIENT] Invalid cueChoice: missing 'choice' or 'dur' param`);
        }
        break;
      }
  
      case "cueAudio": {
        if (!cueParams || (!cueParams.choice && !cueParams.file)) {
          console.error(`[CLIENT] cueAudio missing 'choice' or 'file' param: ${cueId}`);
          return;
        }
        cueHandlers[type](cueId, cueParams);
        break;
      }
  
      case "cueAnimation":
      case "cueAnimejs": {
        const animDuration = Number(cueParams.dur);
        const animationPath = `animations/${cueParams.choice}.svg`;
        if (!animDuration || isNaN(animDuration)) {
          console.error(`[CLIENT] Invalid duration for ${type}: ${cueId}`);
          return;
        }
        cueHandlers[type](cueId, animationPath, animDuration);
        break;
      }
  
      case "cueP5":
      case "cueVideo": {
        cueHandlers[type](cueId, cueParams);
        break;
      }
  
      case "cueOscTrigger":
      case "cueOscValue":
      case "cueOscSet":
      case "cueOscRandom":
      case "cueOscBurst":
      case "cueOscPulse": {
        cueHandlers[type](cueId, cueParams);
        break;
      }
  
      default: {
        console.warn(`[CLIENT] No cue handler matched for: ${type}`);
        return;
      }
    }
  
    // ✅ Only mark + broadcast if successfully handled
    if (!triggeredCues.has(cueId)) {
      triggeredCues.add(cueId);
      if (wsEnabled && socket && !isRemote) {
        socket.send(JSON.stringify({ type: 'cueTriggered', cueId }));
        console.log(`[CLIENT] Sent cue trigger to server: ${cueId}`);
      }
    } else {
      if (isRemote) {
        console.log(`[DEBUG] Cue '${cueId}' already triggered locally, but handled from server.`);
      } else {
        console.log(`[DEBUG] Cue '${cueId}' already triggered locally. No re-broadcast.`);
      }
    }
  };
  









  const p5Sketches = {

    // if (!sketchFunction) {
    //   log(LogLevel.WARN, No P5.js sketch found for '${cueId}'.);
    //   return;
    // }
    "exampleSketch": (p) => {
      p.setup = () => p.createCanvas(400, 400);
      p.draw = () => {
        p.background(220);
        p.ellipse(p.mouseX, p.mouseY, 50, 50);
      };
    }
  }
  //////////////////////////

  window.downloadTemplate = function () {
    const link = document.createElement("a");
    link.href = "svg/template.svg"; // Adjust path if needed
    link.download = "template.svg"; // Suggested filename
    link.click();
  };

  // Event Listeners



  const durationInput = document.getElementById("duration-input");

  // ✅ Set default duration after durationInput is defined
  let duration = durationInput ? parseInt(durationInput.value, 10) * 60 * 1000 : 30 * 60 * 1000;

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
  //   updateStopwatch(); // Ensure the stopwatch reflects the updated total duration
  // });

  toggleButton.addEventListener('click', togglePlay);

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
      togglePlay(); // Play/Pause score
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

    // ✅ Ignore touches on stopwatch to prevent triggering play/pause
    // if (event.target.closest("#stopwatch")) {
    //   event.stopPropagation();  // ✅ Prevents event bubbling
    //   event.preventDefault();   // ✅ Stops unintended default actions
    //     console.log("[DEBUG] Ignoring touch on stopwatch.");
    //     return;
    // }

    if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
      // Double-tap detected
      console.log("[DEBUG] Double-tap detected. Toggling play/pause.");
      togglePlay(); // Call your existing function
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
  updateStopwatch();

  window.scoreContainer = scoreContainer; // Expose globally
  window.scoreWidth = scoreWidth; // Expose globally
  window.updatePosition = updatePosition; // Expose updatePosition globally
  window.elapsedTime = elapsedTime; // Expose elapsedTime globally
  window.debug = {
    updatePosition,
    elapsedTime,
    setElapsedTime: (time) => {
      elapsedTime = time;
      updatePosition();
    },
    // calculateMaxScrollDistance,
  };

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


  console.log('// EOF');
  // window.initializeObserver = function () {
  //   console.warn("[TEST] IntersectionObserver disabled");
  // };
  //
  // window.observeAnimations = function () {
  //   console.warn("[TEST] Observation skipped");
  // };
});
