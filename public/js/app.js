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
import { setupScore, extractScoreElements, propagate, autoInjectGroupsInScroll } from './scoreSetup.js';

import {
  registerReuseBlocks,
  autoInjectUseBlocks,
  preloadReuseBlocksFromPages
} from "./reuse.js";

import {
  forward, rewind, rewindToStart, getSpeedForPosition,
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
} from './stopwatch.js';




// ===========================
// 📦 Import Cue Handlers
// ===========================

import {
  handleCueTrigger,
  checkCueTriggers,
  parseCueParams,
  resetTriggeredCues,
  handlePauseCue,
  handleStopCue,
  dismissPauseCountdown,
  pauseDismissClickHandler,
  handleAudioCue,
  activeAudioCues,
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


import { ensureRotationCSSGuard } from './anim.js';

export const initializeSVG = async (svgElement) => {


  console.group("[initializeSVG]");
  console.time("[initializeSVG] total");
  console.log("SVG element:", svgElement);
  console.log("Bounding box:", svgElement.getBoundingClientRect());


  /////////////////////////////////////////////////////////////////////////////


  window.DEBUG_COORDS = true;

  function getSVG() { return document.querySelector("#score"); }
  function getCTM() { const s = getSVG(); return s ? s.getScreenCTM() : null; }

  function svgToClientX(svgX) {
    const s = getSVG(), c = getCTM(); if (!s || !c) return null;
    const pt = s.createSVGPoint(); pt.x = svgX; pt.y = 0; return pt.matrixTransform(c).x;
  }
  function clientToSvgX(clientX) {
    const s = getSVG(), c = getCTM(); if (!s || !c) return null;
    const inv = c.inverse(); const pt = s.createSVGPoint(); pt.x = clientX; pt.y = 0;
    return pt.matrixTransform(inv).x;
  }
  function logCoord(tag, obj = {}) { if (window.DEBUG_COORDS) console.log(`[COORD] ${tag}`, obj); }



  // 🛡️ Ensure r(...) rotations use correct transform origin
  console.log("[initializeSVG]  ensureRotationCSSGuard called .");

  ensureRotationCSSGuard(svgElement);


  // 🧩 Skip global reinit for embedded page overlays
  if (svgElement?.id === "pageSVG" || svgElement?.classList.contains("oscilla-page")) {
    console.log("[initializeSVG] ⚠️ Skipping global reset for page overlay SVG.");
    window.extractScoreElements?.(svgElement);
    window.propagate?.(svgElement);
    return;
  }


  // 🔍 Ensure we received a valid SVG element before continuing
  if (!svgElement) {
    console.error("[ERROR] No SVG element provided to initializeSVG.");
    return;
  }

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


  // ✅ Apply transforms first (flatten <use> and group transforms)
  // applyInkscapeTransforms(svgElement);

  // 📦 Store global reference to the SVG for later use
  window.scoreSVG = svgElement;

  // ✅ Flatten transforms (already done here)
  // svgElement.querySelectorAll('g[transform]').forEach(flattenGroupTransform);

  // ✅ Replace <use> elements (already done here)

   assignCues(svgElement, window.cues);

  enableLiveInspector({
    startRotate,
    startScale,
    // startObj2Path
  });

  /**
   * Scan and register reusable <g> groups with reserved prefixes.
   * Stores them in window.groupRegistry for later cueGroup() recall.
   */
  function registerSvgGroups(svgRoot) {
    if (!svgRoot) return;

    // Ensure global registry exists
    window.groupRegistry = window.groupRegistry || {};

    const groupNodes = svgRoot.querySelectorAll('g[id^="group-"], g[id^="menu-"], g[id^="ui-"]');

    groupNodes.forEach((group) => {
      const groupId = group.id.replace(/^group-|^menu-|^ui-/, '');
      const clone = group.cloneNode(true);

      // Store deep clone in registry
      window.groupRegistry[groupId] = clone;

      console.log(`[groupRegistry] Registered group "${groupId}" from`, svgRoot?.baseURI || '(inline)');
    });
  }

  // // ✅ Register reusable cue groups (menus, UI clusters)
    window.cues = [];
  
registerReuseBlocks(svgElement);



  // ✅ Attach globally
  if (typeof window !== 'undefined') {
    window.registerSvgGroups = registerSvgGroups;
  }

  // 🧩 Build pathVariantsMap for o2p Case 5 animations —
  // groups related path IDs (e.g. path-9997-1,-2,…) so multi-path ghost motion works

  window.storePathVariants(svgElement)

  // preloadSpeedCues();

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

    //  Wrap the cloned content in a new rotation group
    const rotateWrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
    rotateWrapper.setAttribute("id", rotateId);
    rotateWrapper.appendChild(deepClone);

    //  Wrap the rotator in a group with the original <use>'s ID (for s_seq animation)
    const animatedGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    animatedGroup.setAttribute("id", clone.id);
    animatedGroup.appendChild(rotateWrapper);

    //  Wrap everything in a positioned group using <use>'s transform
    const positionedGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const transform = clone.getAttribute("transform");
    if (transform) {
      positionedGroup.setAttribute("transform", transform);
    }
    positionedGroup.appendChild(animatedGroup);

    //  Replace the <use> with the real structure
    clone.parentNode.insertBefore(positionedGroup, clone);
    clone.remove();

  });

  if (window.playheadX === undefined) {
    window.playheadX = 0;  // safe world origin default
  }

  // 🚀 Continue with full original animation setup
  console.log("[DEBUG] Initializing SVG element:", svgElement);

  requestAnimationFrame(() => {

    requestAnimationFrame(() => {
      window.ensureWindowPlayheadX(); // 💡 ensure valid center before any jumping logic
      initializeObjectPathPairs(svgElement);
      initializeObserver();

    });

    propagate(svgElement);
    initializeRotatingObjects(svgElement);
    initializeScalingObjects(svgElement);
    initializeObserver();



    console.log("[DEBUG] Animation setup complete. Running detection and observer.");
    detectExistingAnimations();
    observeAnimations();


    // ✅ Run setupScore and cue assignment after the SVG has fully painted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const svgReady = svgElement || document.querySelector("#scoreContainer svg");
        if (!svgReady) {
          console.warn("[initializeSVG] ⚠️ setupScore(): SVG still not found after paint.");
          return;
        }

        console.group("[initializeSVG] ✅ Final SVG paint phase");
        console.time("[initializeSVG] cue+setup total");

        // 🧩 Always ensure window.cues exists before assigning
        if (!window.cues) window.cues = [];

        console.log("[initializeSVG] Assigning cues after layout is fully ready...");
        
        assignCues(svgReady, window.cues);

        if (typeof window.setupScore === "function") {
          console.log("[initializeSVG] Running setupScore...");
          window.setupScore(svgReady);
        } else {
          console.warn("[initializeSVG] ⚠️ setupScore() not available yet.");
        }

        console.timeEnd("[initializeSVG] cue+setup total");
        console.groupEnd();
      });
    });


    // // TODO CSS IN SCROLL MODE - HEIGHT NEEDS TO BE 95% OR SOMETHING
    // // BUT THEN THE JUMP2X ETC SYNC BREAKS . NEED TO SORT ORDER OF EX
    // // PROJECT LOADER ALSO DOES CSS STUFF LIKE THIS - WHAT IS REDUNDANT?
    // // 

    // // --- Wide-scroll layout correction ---
    // const applyWideScrollLayout = () => {
    //   const cont = document.getElementById("scoreContainer");
    //   const svg = svgElement;
    //   if (!svg || !cont) return;

    //   Object.assign(cont.style, {
    //     width: "100vw",
    //     height: "100vh",
    //     overflowX: "auto",
    //     overflowY: "hidden",
    //     whiteSpace: "nowrap",
    //     display: "block",
    //     position: "relative"
    //   });

    //   svg.removeAttribute("width");
    //   svg.removeAttribute("height");
    //   Object.assign(svg.style, {
    //     display: "inline-block",
    //     height: "100vh",
    //     width: "auto",
    //     maxWidth: "none",
    //     maxHeight: "100%",
    //     verticalAlign: "top"
    //   });

    //   svg.getBoundingClientRect(); // force reflow
    //   console.log("[initializeSVG] Applied wide-scroll layout correction.");
    // };

    // window.applyWideScrollLayout = applyWideScrollLayout;



    // Wait until the SVG is *actually* inserted and painted
    requestAnimationFrame(() => {
      requestAnimationFrame(applyWideScrollLayout);
    });

    const container = window.scoreContainer;
    const svg = svgElement;

    if (!container || !svg) return;

    //  Step 2: Hard-disable native scroll BEFORE doing any measurement
    container.style.overflow = "hidden";

    //  Block wheel/touch gestures that cause momentum scroll
    const stopScroll = e => { e.preventDefault(); e.stopPropagation(); return false; };
    ["wheel", "touchmove", "gesturestart", "gesturechange", "gestureend"].forEach(ev =>
      container.addEventListener(ev, stopScroll, { passive: false })
    );

    //  Zero any scroll offsets immediately and forever
    container.addEventListener("scroll", () => {
      if (container.scrollLeft !== 0 || container.scrollTop !== 0) {
        container.scrollLeft = 0;
        container.scrollTop = 0;
      }
    }, { passive: true });

    // --- Align world coordinate width (your existing code) ---
    let width = null;
    const attrWidth = svg.getAttribute("width");
    if (attrWidth && !attrWidth.includes("%")) width = parseFloat(attrWidth);
    if (!width && svg.viewBox?.baseVal) width = svg.viewBox.baseVal.width;
    if (!width && svg.getBBox) width = svg.getBBox().width;
    window.scoreWidth = width || 40960;
    console.log(`[Oscilla] scoreWidth = ${window.scoreWidth}`);

    //  Now measure — guaranteed not polluted by scroll offsets
    if (window.socket && window.scoreWidth) {
      const renderedWidth = svg.getBoundingClientRect().width;
      const worldWidth = window.scoreWidth;

      console.log("[initializeSVG] score_meta sent to server.");
      window.socket.send(JSON.stringify({
        type: "score_meta",
        project: window.currentProject,
        scoreWidth: worldWidth,
        renderedWidth: renderedWidth,
        duration: window.duration  // ✅ send ms to server

      }));
    }

    console.log("\n [DEBUG] Page Loaded - Initial State:");

  });
};


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

// Duration of score in minutes (default = 30 minutes)
// window.duration = 30;


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






  // function handleRestoredRepeatState(repeatStateMap, cues) {
  //   console.log("[CLIENT]  Restoring repeat state now...", repeatStateMap);

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
  //           console.log(`[CLIENT] Already inside repeat range for ${cueId}. Skipping jump.`);

  //           repeat.initialJumpDone = true;
  //           repeat.ready = true;

  //           if (!repeat.recovered) {
  //             repeat.currentCount = (repeat.currentCount || 0) + 1;
  //           } else {
  //             // already bumped during recovery, clear flag
  //             delete repeat.recovered;
  //           }

  //           repeat.recovered = true;
  //           jumpToCueId(repeat.startId); // Force visual re-alignment

  //           repeatStateMap[cueId] = repeat;

  //           updateRepeatCountDisplay(repeat.currentCount + 1);
  //           document.getElementById("repeat-count-box").classList.remove("hidden");
  //           document.getElementById("repeat-count-box").classList.add("pulse");
  //           document.getElementById("playhead").classList.add("repeating");


  //         } else {
  //           console.log(`[CLIENT]  Outside repeat range — jumping to start for ${cueId}.`);

  //           repeat.ready = false;
  //           repeat.initialJumpDone = true;
  //           repeatStateMap[cueId] = repeat;

  //           executeRepeatJump(repeat, cueId).then(() => {
  //             setTimeout(() => {
  //               repeat.ready = true;
  //               repeatStateMap[cueId] = repeat;
  //               console.log(`[CLIENT]  Repeat ${cueId} now ready to detect end cue.`);
  //             }, 300);
  //           });
  //         }
  //       } else {
  //         console.warn(`[CLIENT]  Could not resolve start or end cue for ${cueId}. Skipping recovery.`);
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
            case "jump":
              window.playheadX = data.playheadX;
              //  Locally center the scroll view based on received absolute playheadX
              scrollToPlayheadVisual();
              lastJumpTime = now;
              break;


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
  *  Optimized Function: checkAnimationVisibility (with state change logging)
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
      if (window.disableObserver) return; // Skip all observer logic

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
      rootMargin: "0px", //  Use full viewport width for visibility detection.
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

    //  Immediately check visibility
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

  window.lastAnimationFrameTime = null;

  window.animate = async (currentTime) => {
    // Stop animation when paused or seeking
    if (!window.isPlaying || window.isSeeking) return;

    // --- Compute dt *before* using it ---
    let dt = 0;
    if (window.lastAnimationFrameTime !== null) {
      dt = (currentTime - window.lastAnimationFrameTime) / 1000; // seconds
    }
    window.lastAnimationFrameTime = currentTime;

    const refWidth = window.remoteScoreWidth || window.scoreWidth;

    if (dt > 0 && refWidth && window.duration) {

      // --- Freewheeling scroll increment ---
      const delta = (dt * 1000) * playbackSpeed;  // restore your original scaling
      const estimatedIncrement =
        ((delta * window.speedMultiplier) / window.duration) * refWidth;

      // Advance playhead in world units
      window.playheadX = Math.min(window.playheadX + estimatedIncrement, refWidth);

      // --- Smooth drift correction from server position ---
      if (window.serverSyncPlayheadX !== undefined && window.serverSyncPlayheadX != null) {
        const drift = window.serverSyncPlayheadX - window.playheadX;

        // Large discrepancy = jump case → snap
        if (Math.abs(drift) > (refWidth * 0.05)) {
          window.playheadX = window.serverSyncPlayheadX;
        } else {
          // Small discrepancy → invisible correction
          const correctionRate = 1.4; // tune 1.2–1.7 to taste
          window.playheadX += drift * correctionRate * dt;
        }
      }

      // Apply to visual scroll
      scrollToPlayheadVisual();
    }

    // --- Update elapsed time for cue & UI systems ---
    if (window.duration && window.scoreWidth) {
      window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;
    }

    // --- Periodic visibility optimization ---
    const visibilityCheckInterval = 150;
    window.lastVisibilityCheckTime = window.lastVisibilityCheckTime || 0;
    if (currentTime - window.lastVisibilityCheckTime > visibilityCheckInterval) {
      window.checkAnimationVisibility?.();
      window.lastVisibilityCheckTime = currentTime;
    }

    // --- Cues ---
    await checkCueTriggers?.(window.elapsedTime);

    // Continue animation
    window.animationFrameId = requestAnimationFrame(window.animate);
  };


  //////////////////////////////////////////////////////////////////////////////
  // Manages the playback animation loop, updating position, seek bar, and cues in real-time.
  // Uses requestAnimationFrame to ensure smooth, efficient animations synchronized with screen refresh.
  // Prevents unnecessary updates when paused, seeking, or stopped to optimize performance.
  // stopAnimation() cancels the loop when playback stops, preventing redundant frame updates.

  window.startAnimation = () => {

    console.log("[DEBUG] startAnimation check:",
      "animationPaused=", window.animationPaused,
      "animationStopped=", window.animationStopped,
      "isSeeking=", window.isSeeking);

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



