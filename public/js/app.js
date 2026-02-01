/*!
 * oscillaScore — Real-time SVG Score Performance Environment
 * © 2025 Rob Canning
 *
 * Licensed under the GNU General Public License v3.0
 * https://www.gnu.org/licenses/gpl-3.0.html
 *
 * Core initialization: orchestration layer connecting all modules
 */

// ===========================
// Module Imports
// ===========================

// Existing modules
import { enableLiveInspector } from "./oscillaLive.js";
import { initializeDarkModeToggle, scrollToPlayheadVisual } from "./oscillaTransport.js";
import { loadProject } from './projectLoader.js';
import { setupScore, extractScoreElements, autoInjectGroupsInScroll } from './projectScoreSetup.js';
import { registerAnimation, animationAssign } from "./cues/animation.js";
import { buildCueButtonsIn, hideAllButtonPlaceholders } from "./cues/button.js";
import { registerReuseBlocks, autoInjectUseBlocks, preloadReuseBlocksFromPages } from "./parser/preProcessReuse.js";

import {
  forward, rewind, rewindToStart,
  initializeSpeedControls, adjustSpeed, setSpeed, updateSpeedDisplay,
  sendSpeedUpdateToServer, togglePlay, togglePlayButton, startPlayback,
  pausePlayback, resumePlayback, jumpToCueId, hideControls, showControls,
  updateSeekBar, initSeekBarListeners, initializeControlsPin, initializeTopbarPin
} from './oscillaTransport.js';

import {
  startStopwatch, stopStopwatch, resetStopwatch,
  resumeStopwatch, setupStopwatchFullscreenToggle
} from './cues/timers.js';

import {
  handleCueTrigger, checkCueTriggers, parseCueParams,
  resetTriggeredCues, assignCues
} from './oscillaCueDispatcher.js';

import { handleStopCue } from './cues/stop.js';
import { handleAudioCue, handleAudioStopCue, stopAllAudio, activeAudioCues, checkImpulseRegions } from "./cues/audio.js";
import { dismissPauseCountdown, pauseDismissClickHandler, handlePauseCue } from "./cues/pause.js";
import { checkSynthRegions } from "./cues/synth.js";
import { checkSpeedForPosition, resetSpeedWatcher } from "./cues/speed.js";

// New system modules
import {
  connectWebSocket, sendSocketMessage, setSocketEnabled, getSocket,
  initSocketCallbacks
} from './system/socket.js';

import {
  initClientUI, updateClientList, setAudioMaster,
  getAudioMaster, defineAudioMasterProperty
} from './system/clients.js';

import { initUIBindings } from './system/UIBindings.js';

import { initializeSVG, applyWideScrollLayout, settleDomForPropagate } from './system/SVGInit.js';

import {
  storePathVariants, getPathVariants, ensureWindowPlayheadX, getPlayheadX
} from './system/paths.js';

import {
  initAnimationLoop, startAnimation, stopAnimation, animate
} from './system/RAF.js';

import { populateProjectMenu, getAvailableProjects } from './system/projectMenuUI.js';

import {
  openRehearsalPopup, closeRehearsalPopup, initRehearsalButton
} from './system/rehearsalUI.js';

// ===========================
// Global Window Bindings
// ===========================

// Playback control functions
window.startPlayback = startPlayback;
window.pausePlayback = pausePlayback;
window.resumePlayback = resumePlayback;

// Cue handling functions
window.handleCueTrigger = handleCueTrigger;
window.checkCueTriggers = checkCueTriggers;
window.parseCueParams = parseCueParams;
window.resetTriggeredCues = resetTriggeredCues;

// Global state
window.triggeredCues = new Set();
window.playheadX = 0;
window.estimatedPlayheadX = 0;
window.speedMultiplier = 1;
window.scoreContainer = document.getElementById('scoreContainer');

// Path utilities
window.getPlayheadX = getPlayheadX;
window.storePathVariants = storePathVariants;
window.ensureWindowPlayheadX = ensureWindowPlayheadX;

// SVG initialization
window.initializeSVG = initializeSVG;
window.applyWideScrollLayout = applyWideScrollLayout;

// Animation controls
window.animate = animate;
window.startAnimation = startAnimation;
window.stopAnimation = stopAnimation;

// Project menu
window.populateProjectMenu = populateProjectMenu;

// ===========================
// Mobile Stylesheet Loader
// ===========================
if (/iPad|iPhone|Android|Mobile|Tablet/i.test(navigator.userAgent)) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/tablet.css';
  document.head.appendChild(link);
}

// ===========================
// Repeat State Management
// ===========================
let pendingRepeatStateMap = null;
window.repeatStateMap = window.repeatStateMap || {};

function handleRepeatStateUpdate(cueId, repeatData) {
  const before = { ...(window.repeatStateMap[cueId] || {}) };
  const incoming = { ...repeatData };
  
  // Remove transient properties from incoming
  delete incoming.ready;
  delete incoming.busy;
  delete incoming.jumpCooldownUntil;
  delete incoming.initialJumpDone;
  delete incoming.recovered;
  
  window.repeatStateMap[cueId] = {
    ...before,
    ...incoming,
    ready: before.ready ?? true,
    busy: before.busy ?? false,
    jumpCooldownUntil: before.jumpCooldownUntil ?? 0,
    initialJumpDone: before.initialJumpDone ?? false,
    recovered: before.recovered ?? false,
  };
}

function handleRepeatStateMapReceived(repeatStateMap) {
  pendingRepeatStateMap = repeatStateMap || {};
}

// ===========================
// Main DOMContentLoaded Handler
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  // ===========================
  // Initialize Controls & Handlers
  // ===========================
  initializeSpeedControls();
  initSeekBarListeners();
  pauseDismissClickHandler();
  initializeDarkModeToggle();
  setupStopwatchFullscreenToggle();
  
  // Initialize pin buttons for top bar and controls
  initializeControlsPin();
  initializeTopbarPin();

  // ===========================
  // Initialize System Modules
  // ===========================
  
  // Initialize socket with callbacks
  initSocketCallbacks({
    startAnimation: startAnimation,
    stopAnimation: stopAnimation,
    updateClientList: updateClientList,
    onRepeatStateUpdate: handleRepeatStateUpdate,
    onRepeatStateMapReceived: handleRepeatStateMapReceived
  });

  // Initialize client UI
  initClientUI();
  defineAudioMasterProperty();

  // Initialize UI bindings with callbacks
  initUIBindings({
    toggleCommunication: (enabled) => {
      setSocketEnabled(enabled);
    },
    toggleSplashScreen: () => window.toggleSplashScreen?.(),
    openRehearsalPopup: openRehearsalPopup,
    openPreferencesDialog: () => window.openPreferencesDialog?.()
  });

  // Initialize rehearsal marks button
  initRehearsalButton();

  // Initialize project menu
  populateProjectMenu();

  // Initialize animation loop
  initAnimationLoop();

  // ===========================
  // Global Playback State
  // ===========================
  window.duration = window.duration || 600;
  window.remoteScoreWidth = null;
  window.pixelsPerSecond = window.scoreWidth / window.duration;
  window.recentlyRecalculatedPlayhead = false;
  window.ignoreNextSync = false;
  window.lastAnimationFrameTime = null;
  window.wsEnabled = true;
  window.scoreSVG = null;
  window.seekBar = document.getElementById('seek-bar');

  // ===========================
  // Connect WebSocket
  // ===========================
  connectWebSocket();

  // ===========================
  // SVG Interactions Setup
  // ===========================
  const svgEl = document.querySelector('svg');
  if (svgEl) {
    svgEl.style.pointerEvents = 'all';
    svgEl.querySelectorAll('*').forEach(child => child.style.pointerEvents = 'all');
  }
});

// ===========================
// Exported for External Use
// ===========================
export {
  initializeSVG,
  startAnimation,
  stopAnimation,
  connectWebSocket,
  updateClientList
};
