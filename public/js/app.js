/*!
 * oscillaScore — Real-time SVG Score Performance Environment
 * © 2025 Rob Canning
 *
 * Licensed under the GNU General Public License v3.0
 * https://www.gnu.org/licenses/gpl-3.0.html
 *
 * Core initialization: cue handling, playback state, WebSocket sync,
 * and environment detection for the OscillaScore client.
 */

// ===========================
// Imports
// ===========================
import { enableLiveInspector } from "./oscillaLive.js";
import { initializeDarkModeToggle, scrollToPlayheadVisual } from "./transport.js";
import { loadProject } from './projectLoader.js';
import { setupScore, extractScoreElements, autoInjectGroupsInScroll } from './scoreSetup.js';
import { propagate } from "./oscillaPropagate.js";
import { registerAnimation, animationAssign } from "./oscillaAnimation.js";
import { initializeObserver } from "./oscillaObserver.js";
import { buildCueButtonsIn, hideAllButtonPlaceholders } from "./oscillaButton.js";
import { registerReuseBlocks, autoInjectUseBlocks, preloadReuseBlocksFromPages } from "./reuse.js";
import {
  forward, rewind, rewindToStart,
  initializeSpeedControls, adjustSpeed, setSpeed, updateSpeedDisplay,
  sendSpeedUpdateToServer, togglePlay, togglePlayButton, startPlayback,
  pausePlayback, resumePlayback, jumpToCueId, hideControls, showControls
} from './transport.js';
import {
  startStopwatch, stopStopwatch, resetStopwatch,
  resumeStopwatch, setupStopwatchFullscreenToggle
} from './oscillaTimers.js';
import {
  handleCueTrigger, checkCueTriggers, parseCueParams, resetTriggeredCues,
  handleStopCue,  handleRepeatCue, parseRepeatCueId,
  executeRepeatJump, repeatStateMap, handleRestoredRepeatState, assignCues
} from './oscillaCueDispatcher.js';
import { handleAudioCue, handleAudioStopCue, stopAllAudio, activeAudioCues } from "./oscillaAudio.js";
import { dismissPauseCountdown, pauseDismissClickHandler, handlePauseCue } from "./oscillaPause.js";

// ===========================
// Global Window Bindings
// ===========================
window.startPlayback = startPlayback;
window.pausePlayback = pausePlayback;
window.resumePlayback = resumePlayback;
window.handleCueTrigger = handleCueTrigger;
window.checkCueTriggers = checkCueTriggers;
window.parseCueParams = parseCueParams;
window.resetTriggeredCues = resetTriggeredCues;
window.triggeredCues = new Set();
window.playheadX = 0;
window.estimatedPlayheadX = 0;
window.speedMultiplier = 1;
window.scoreContainer = document.getElementById('scoreContainer');

window.getPlayheadX = function () {
  const playhead = document.getElementById("playhead");
  const scoreContainer = window.scoreContainer;
  if (!playhead || !scoreContainer) return null;
  const containerRect = scoreContainer.getBoundingClientRect();
  const playheadRect = playhead.getBoundingClientRect();
  return playheadRect.left - containerRect.left;
};

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
// SVG Initialization
// ===========================
import { destroyAllHitLabels } from "./oscillaHitLabels.js";

export const initializeSVG = async (svgElement) => {


  await settleDomForPropagate();
  console.log("[initializeSVG] 🔧 propagate() after FULL DOM settle");
  propagate(svgElement);

  const isPageOverlay =
    svgElement.id === "pageSVG" ||
    svgElement.classList.contains("oscilla-page");

  //  HARD RESET of HTML overlays when mode changes
  if (window.isPageOverlay !== undefined &&
    window.isPageOverlay !== isPageOverlay) {

    destroyAllHitLabels(
      isPageOverlay ? "enter-page-mode" : "enter-scroll-mode"
    );
  }

  window.isPageOverlay = isPageOverlay;

  // ----- PAGE OVERLAY MODE -----
  if (isPageOverlay) {
    if (!window.pageRegistry || Object.keys(window.pageRegistry).length === 0) {
      buildPageRegistryFromDirIndex();
    }

    registerReuseBlocks(svgElement);
    autoInjectUseBlocks(svgElement);
    hideAllButtonPlaceholders(svgElement);
    window.storePathVariants(svgElement);
    animationAssign(svgElement);
    buildCueButtonsIn(svgElement, svgElement);
    initializeObserver();

    if (!window.cues) window.cues = [];
    assignCues(svgElement, window.cues);
    window.setupScore?.(svgElement);
    window.autostartStopwatchCues?.();
    window.autostartMetronomes?.();
    return;
  }

  // ----- SCROLL MODE -----
  buildPageRegistryFromDirIndex();
  refreshAllPagesMenu();
  registerReuseBlocks(svgElement);
  window.storePathVariants(svgElement);
  if (window.playheadX === undefined) window.playheadX = 0;

  requestAnimationFrame(() => {
    animationAssign(svgElement);
    initializeObserver();

    // Final paint phase - assign cues + setupScore
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const svgReady = svgElement || document.querySelector("#scoreContainer svg");
        if (!svgReady) return;
        if (!window.cues) window.cues = [];
        assignCues(svgReady, window.cues);
        window.setupScore?.(svgReady);
      });
    });

    // Wide-scroll layout
    const applyWideScrollLayout = () => {
      const cont = document.getElementById("scoreContainer");
      const svg = svgElement;
      if (!svg || !cont) return;

      Object.assign(cont.style, {
        width: "100vw", height: "100vh", overflowX: "auto", overflowY: "hidden",
        whiteSpace: "nowrap", display: "block", position: "relative",
      });
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      Object.assign(svg.style, {
        display: "inline-block", height: "100vh", width: "auto",
        maxWidth: "none", maxHeight: "100%", verticalAlign: "top",
      });
      svg.getBoundingClientRect();
    };

    window.applyWideScrollLayout = applyWideScrollLayout;
    requestAnimationFrame(() => requestAnimationFrame(applyWideScrollLayout));

    // Disable native scrolling + measure world width
    const container = window.scoreContainer;
    const svg = svgElement;
    if (!container || !svg) return;

    container.style.overflow = "hidden";
    const stopScroll = (e) => { e.preventDefault(); e.stopPropagation(); return false; };
    ["wheel", "touchmove", "gesturestart", "gesturechange", "gestureend"].forEach((ev) =>
      container.addEventListener(ev, stopScroll, { passive: false })
    );
    container.addEventListener("scroll", () => {
      if (container.scrollLeft !== 0 || container.scrollTop !== 0) {
        container.scrollLeft = 0;
        container.scrollTop = 0;
      }
    }, { passive: true });

    // Determine score width
    let width = null;
    const attrWidth = svg.getAttribute("width");
    if (attrWidth && !attrWidth.includes("%")) width = parseFloat(attrWidth);
    if (!width && svg.viewBox?.baseVal) width = svg.viewBox.baseVal.width;
    if (!width && svg.getBBox) width = svg.getBBox().width;
    window.scoreWidth = width || 40960;

    // Sync with server
    if (window.socket && window.scoreWidth) {
      window.socket.send(JSON.stringify({
        type: "score_meta",
        project: window.currentProject,
        scoreWidth: window.scoreWidth,
        renderedWidth: svg.getBoundingClientRect().width,
        duration: window.duration,
      }));
    }
  });
};

window.initializeSVG = initializeSVG;

// Helper: DOM settle for propagate
async function settleDomForPropagate() {
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await Promise.resolve();
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => setTimeout(r, 0));
}

  // propagate(svgElement);



// ===========================
// Main DOMContentLoaded Handler
// ===========================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize controls and handlers
  initializeSpeedControls();
  pauseDismissClickHandler();
  initializeDarkModeToggle();
  populateProjectMenu();
  setupStopwatchFullscreenToggle();
  // Template download button
  document.getElementById("download-template-btn")?.addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = "svg/template.svg";
    link.download = "template.svg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // ===========================
  // Global Playback State
  // ===========================
  let pendingRepeatStateMap = null;
  window.duration = window.duration || 600;
  window.remoteScoreWidth = null;
  window.pixelsPerSecond = window.scoreWidth / window.duration;
  window.recentlyRecalculatedPlayhead = false;
  window.ignoreNextSync = false;
  window.lastAnimationFrameTime = null;
  window.wsEnabled = true;
  window.scoreSVG = null;
  window.seekBar = document.getElementById('seek-bar');

  // DOM element references
  const toggleButton = document.getElementById('toggle-button');
  const rewindButton = document.getElementById('rewind-button');
  const forwardButton = document.getElementById('forward-button');
  const rewindToZeroButton = document.getElementById('rewind-to-zero-button');
  const wsToggleButton = document.getElementById('ws-toggle-button');
  const rehearsalMarksButton = document.getElementById('rehearsal-marks-button');
  const fullscreenButton = document.getElementById('fullscreen-button');
  const keybindingsPopup = document.getElementById('keybindings-popup');
  const closeKeybindingsButton = document.getElementById('close-keybindings');

  let animationPaused = false;
  let isCommunicationEnabled = true;
  let isAudioMaster = false;

  // ===========================
  // Score Notes Toggle
  // ===========================
  const toggleScoreNotes = () => {
    const svg = document.querySelector("svg");
    if (!svg) return;
    const notes = svg.querySelectorAll('[id^="note-"]');
    if (!notes.length) return;
    const currentlyVisible = notes[0].style.display !== "none";
    notes.forEach(note => note.style.display = currentlyVisible ? "none" : "block");
    document.getElementById("toggle-notes-button")?.classList.toggle("active", !currentlyVisible);
  };

  document.getElementById("toggle-notes-button")?.addEventListener("click", toggleScoreNotes);
  window.toggleScoreNotes = toggleScoreNotes;

  // ===========================
  // Rehearsal Marks
  // ===========================
  const openRehearsalPopup = () => {
    const popup = document.getElementById("rehearsal-popup");
    if (!popup || sortedMarks.length === 0) return;
    popup.classList.remove("hidden");
    popup.style.display = "flex";
  };

  const closeRehearsalPopup = () => document.getElementById("rehearsal-popup")?.classList.add("hidden");
  window.closeRehearsalPopup = closeRehearsalPopup;

  rehearsalMarksButton?.addEventListener('click', () => {
    const popup = document.getElementById("rehearsal-popup");
    if (!popup) return;
    popup.classList.contains("hidden") ? openRehearsalPopup() : closeRehearsalPopup();
  });

  // ===========================
  // WebSocket Setup
  // ===========================
  let reconnectAttempts = 0;
  const MAX_RETRIES = 5;

  const getWebSocketURL = async () => {
    try {
      const response = await fetch('/config');
      const config = await response.json();
      const hostname = window.location.hostname;
      const port = config.websocketPort;
      return (hostname === 'localhost' || hostname === '127.0.0.1')
        ? `ws://localhost:${port}` : `ws://${hostname}:${port}`;
    } catch { return `ws://localhost:8001`; }
  };

  const connectWebSocket = async () => {
    if (!window.wsEnabled || window.socket?.readyState === WebSocket.OPEN) return;

    try {
      const WS_URL = await getWebSocketURL();
      const socket = new WebSocket(WS_URL);
      window.socket = socket;

      socket.addEventListener('open', () => {
        console.log(`[WS] Connected to ${WS_URL}`);
        reconnectAttempts = 0;
        window.wsEnabled = true;
        socket.send(JSON.stringify({ type: "get_repeat_state" }));
      });

      socket.addEventListener("message", (event) => {
        try {
          const data = JSON.parse(event.data);
          if (!data || typeof data !== "object") return;

          switch (data.type) {
            case "welcome":
              window.localClientName = data.name;
              break;

            case "client_list":
              updateClientList(data.clients);
              break;

            case "set_speed_multiplier":
              if (!isNaN(data.multiplier) && data.multiplier > 0) {
                const rounded = parseFloat(data.multiplier.toFixed(1));
                if (window.speedMultiplier !== rounded) {
                  window.speedMultiplier = rounded;
                  window.updateSpeedDisplay?.();
                }
              }
              break;

            case "pause":
              if (!isNaN(data.playheadX) && data.playheadX >= 0) window.playheadX = data.playheadX;
              if (!isNaN(data.elapsedTime) && data.elapsedTime >= 0) window.elapsedTime = data.elapsedTime;
              window.isPlaying = false;
              window.isMusicalPause = false;
              stopAnimation();
              togglePlayButton();
              break;

            case "resume_after_pause":
              if (!isNaN(data.playheadX) && data.playheadX >= 0) window.playheadX = data.playheadX;
              if (!isNaN(data.elapsedTime) && data.elapsedTime >= 0) window.elapsedTime = data.elapsedTime;
              if (window.isMusicalPause) return;
              window.isPlaying = true;
              startStopwatch();
              togglePlayButton();
              startAnimation();
              break;

            case "dismiss_pause_countdown":
              dismissPauseCountdown(true, true);
              break;

            case "cuePause":
              if (!isNaN(data.playheadX)) window.playheadX = data.playheadX;
              if (!isNaN(data.elapsedTime)) window.elapsedTime = data.elapsedTime;
              stopAnimation();
              window.isPlaying = false;
              window.isMusicalPause = false;
              animationPaused = true;
              togglePlayButton();
              window.socket?.send(JSON.stringify({
                type: "cuePause_ack",
                playheadX: window.playheadX ?? -1,
                elapsedTime: window.elapsedTime ?? -1
              }));
              handlePauseCue(data.id, data.duration);
              break;

            case "cueStop":
              handleStopCue(data.id || "cueStop");
              break;

            case "cueTriggered":
              handleCueTrigger(data.cueId, true);
              break;

            case "cuePause_ack":
            case "cueTraverse":
              break;

            case "audio_cue":
              handleAudioCue(data.cueId);
              break;

            case "sync": {
              const state = data.state;
              if (!state) break;
              const wasPlaying = window.isPlaying;
              window.scoreWidth = state.scoreWidth;

              if (state.canonicalRenderedWidth) {
                window.canonicalRenderedWidth = state.canonicalRenderedWidth;
                window.canonicalScale = state.canonicalRenderedWidth / window.scoreWidth;
                const inner = document.getElementById("scoreInner");
                const stage = document.getElementById("scrollStage");
                if (inner) { inner.style.width = `${state.canonicalRenderedWidth}px`; inner.style.height = "100%"; }
                if (stage) { stage.style.width = `${state.canonicalRenderedWidth}px`; stage.style.height = "100%"; }
              }

              if (state.duration > 0) window.duration = state.duration;
              window.elapsedTime = state.elapsedTime;
              window.isPlaying = state.isPlaying;
              if (state.playheadX !== undefined) window.serverSyncPlayheadX = state.playheadX;
              scrollToPlayheadVisual?.();

              if (window.isPlaying && !wasPlaying) {
                cancelAnimationFrame(window.animationFrameId);
                window.animationFrameId = requestAnimationFrame(window.animate);
              }
              if (!window.isPlaying && wasPlaying) cancelAnimationFrame(window.animationFrameId);
              break;
            }

            case "repeat_update": {
              const { cueId: updateCueId, repeatData } = data;
              const before = { ...(repeatStateMap[updateCueId] || {}) };
              const incoming = { ...repeatData };
              delete incoming.ready; delete incoming.busy;
              delete incoming.jumpCooldownUntil; delete incoming.initialJumpDone; delete incoming.recovered;
              repeatStateMap[updateCueId] = {
                ...before, ...incoming,
                ready: before.ready ?? true, busy: before.busy ?? false,
                jumpCooldownUntil: before.jumpCooldownUntil ?? 0,
                initialJumpDone: before.initialJumpDone ?? false,
                recovered: before.recovered ?? false,
              };
              break;
            }

            case "repeat_state_map":
              pendingRepeatStateMap = data.repeatStateMap || {};
              break;

            case "jump":
              if (window.ignoreNextSync) { window.ignoreNextSync = false; break; }
              if (window.recentlyRecalculatedPlayhead) break;
              window.playheadX = data.playheadX;
              window.elapsedTime = data.elapsedTime ?? 0;
              scrollToPlayheadVisual?.();
              break;
          }
        } catch (error) {
          console.error("[WS] Message error:", error);
        }
      });

      socket.addEventListener('close', (event) => {
        console.warn(`[WS] Closed: ${event.code}`);
        if (!event.wasClean && reconnectAttempts < MAX_RETRIES) {
          reconnectAttempts++;
          setTimeout(connectWebSocket, 3000);
        }
      });

      socket.addEventListener('error', (err) => console.error('[WS] Error:', err));
    } catch (error) {
      console.error(`[WS] Init failed: ${error.message}`);
    }
  };

  connectWebSocket();

  // ===========================
  // Client Management
  // ===========================
  window.localClientName = localStorage.getItem("clientName") || "";

  document.getElementById("client-list")?.addEventListener("click", () => {
    const newName = prompt("Enter your name:");
    if (newName?.trim()) {
      localStorage.setItem("clientName", newName.trim());
      window.socket?.send(JSON.stringify({ type: "update_client_name", name: newName.trim() }));
      window.localClientName = newName.trim();
      updateClientList(window.clients || []);
    }
  });

  const updateClientList = (clientArray) => {
    window.clients = clientArray;
    const el = document.getElementById("client-list");
    if (!el) return;

    el.innerHTML = `<strong>Online: </strong> ${clientArray.map((name, i) => {
      const isLocal = name === window.localClientName;
      const sep = i < clientArray.length - 1 ? ', ' : '';
      return `<span class="${isLocal ? 'local-client' : 'remote-client'}">${name}${sep}</span>`;
    }).join('')}`;
    el.style.whiteSpace = "normal";
    el.style.wordWrap = "break-word";

    isAudioMaster = clientArray.length === 1 && clientArray[0] === window.localClientName;
    updateAudioMasterUI();
  };

  // ===========================
  // Audio Master
  // ===========================
  Object.defineProperty(window, 'isAudioMaster', { get: () => isAudioMaster, configurable: true });

  function updateAudioMasterUI() {
    document.getElementById("audio-master-button")?.classList.toggle("active", isAudioMaster);
  }

  document.getElementById("audio-master-button")?.addEventListener("click", () => {
    isAudioMaster = !isAudioMaster;
    updateAudioMasterUI();
  });

  // ===========================
  // Path Variants Storage
  // ===========================
  window.pathVariantsMap = {};

  const storePathVariants = (svgElement) => {
    window.pathVariantsMap = {};
    if (!svgElement) return;
    svgElement.querySelectorAll("path").forEach(path => {
      const id = path.id;
      if (!id) return;
      const match = id.match(/^path-(\d+)-(\d+)$/);
      if (!match) return;
      const baseID = id.replace(/-\d+$/, '');
      if (!window.pathVariantsMap[baseID]) window.pathVariantsMap[baseID] = [];
      window.pathVariantsMap[baseID].push(path);
    });
  };

  window.storePathVariants = storePathVariants;

  window.ensureWindowPlayheadX = () => {
    const svg = document.querySelector("svg");
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = window.innerWidth / 2;
    pt.y = 0;
    window.playheadX = pt.matrixTransform(svg.getScreenCTM().inverse()).x;
  };

  // ===========================
  // Project Selector (Splash)
  // ===========================
  async function populateProjectSelector() {
    const grid = document.getElementById("project-grid");
    const message = document.getElementById("splash-message");
    const manualEntry = document.getElementById("manual-entry");

    try {
      const html = await (await fetch("/scores/")).text();
      const regex = /href=["'](?:\.\/|\/?scores\/)?([^"'/]+)\/["']/g;
      let match;
      const projects = [];
      while ((match = regex.exec(html)) !== null) {
        const name = match[1];
        if (!["audio", "texts", "videos"].includes(name)) projects.push(name);
      }

      if (projects.length === 0) throw new Error("No projects found.");

      message.textContent = "Choose a project to load:";
      grid.innerHTML = "";

      projects.forEach((proj) => {
        const card = document.createElement("div");
        card.className = "project-card";
        card.textContent = proj;
        card.addEventListener("click", () => { loadProject(proj); fadeOutSplash(); });
        grid.appendChild(card);
      });
    } catch (err) {
      console.warn("[SPLASH] Could not fetch project list:", err);
      message.textContent = "Automatic listing failed.";
      manualEntry.style.display = "block";
      document.getElementById("manual-load-btn")?.addEventListener("click", () => {
        const projName = document.getElementById("manual-project-input").value.trim();
        if (projName) { loadProject(projName); fadeOutSplash(); }
      });
    }
  }

  function fadeOutSplash() {
    const splash = document.getElementById("splash");
    splash?.classList.add("fade-out");
    setTimeout(() => { if (splash) splash.style.display = "none"; }, 800);
  }

  populateProjectSelector();

  // ===========================
  // Animation Loop
  // ===========================
  window.animate = async (currentTime) => {
    if ( window.isSeeking) return;

    let dt = window.lastAnimationFrameTime !== null
      ? (currentTime - window.lastAnimationFrameTime) / 1000 : 0;
    window.lastAnimationFrameTime = currentTime;

    const refWidth = window.remoteScoreWidth || window.scoreWidth;

if (window.isPlaying && dt > 0 && refWidth && window.duration) {
  const effectiveDeltaMs = dt * 1000 * (window.speedMultiplier || 1);
  window.playheadX = Math.min(
    window.playheadX + (effectiveDeltaMs / window.duration) * refWidth,
    refWidth
  );
      

      // Drift correction
      if (window.serverSyncPlayheadX != null) {
        const drift = window.serverSyncPlayheadX - window.playheadX;
        if (Math.abs(drift) > refWidth * 0.05) {
          window.playheadX = window.serverSyncPlayheadX;
        } else {
          window.playheadX += drift * 1.3 * dt;
        }
      }
      scrollToPlayheadVisual();
    }

    if (window.duration && window.scoreWidth) {
      window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;
    }

    if (window._skipTriggerFrame > 0) window._skipTriggerFrame--;
    else await checkCueTriggers?.(window.elapsedTime);

    window.animationFrameId = requestAnimationFrame(window.animate);
  };

  window.startAnimation = () => {
    console.log("[RAF] startAnimation called", {
  isPlaying: window.isPlaying,
  animationPaused: window.animationPaused,
  isSeeking: window.isSeeking,
  animationFrameId: window.animationFrameId
});

  if (window.isSeeking) return;
    if (window.animationFrameId === null) {
      requestAnimationFrame((time) => {
        window.lastAnimationFrameTime = time;
        window.animationFrameId = requestAnimationFrame(window.animate);
      });
    }
  };


  window.stopAnimation = () => {
  // ❌ DO NOT cancel RAF here
  window.isPlaying = false;
  window.isMusicalPause = true;
};



  // ===========================
  // Repeat Count Display
  // ===========================
  document.getElementById("repeat-count-box")?.addEventListener("click", () => {
    for (const [cueId, repeat] of Object.entries(repeatStateMap)) {
      if (repeat.active) {
        repeat.currentCount = repeat.count;
        repeat.active = false;
        document.getElementById('repeat-count-box')?.classList.add('hidden');
        document.getElementById("playhead")?.classList.remove("repeating");
      }
    }
  });

  // ===========================
  // Utility Functions
  // ===========================
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => console.error(`Fullscreen error: ${err.message}`));
    } else {
      document.exitFullscreen();
    }
  };

  const toggleKeybindingsPopup = () => keybindingsPopup?.classList.toggle('hidden');

  const toggleCommunication = () => {
    isCommunicationEnabled = !isCommunicationEnabled;
    if (!isCommunicationEnabled) { window.socket?.close(); window.socket = null; }
    else connectWebSocket();
    wsToggleButton.style.borderColor = isCommunicationEnabled ? 'green' : 'red';
    wsToggleButton?.classList.toggle('enabled', isCommunicationEnabled);
    wsToggleButton?.classList.toggle('disabled', !isCommunicationEnabled);
  };

  // ===========================
  // Event Listeners
  // ===========================
  document.getElementById("close-score-options")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("score-options-popup")?.classList.add("hidden");
  });

  toggleButton?.addEventListener('click', () => window.isPlaying ? window.pausePlayback() : window.resumePlayback());
  rewindButton?.addEventListener('click', () => { resetTriggeredCues(); rewind(); });
  forwardButton?.addEventListener('click', () => { resetTriggeredCues(); forward(); });
  rewindToZeroButton?.addEventListener('click', () => { resetTriggeredCues(); rewindToStart(); resetStopwatch(); });
  fullscreenButton?.addEventListener('click', toggleFullscreen);
  wsToggleButton?.addEventListener('click', toggleCommunication);
  closeKeybindingsButton?.addEventListener('click', () => keybindingsPopup?.classList.add('hidden'));

  document.getElementById("hamburger-menu")?.addEventListener("sl-select", e => {
    if (e.detail.item.value === "preferences") openPreferencesDialog();
    if (e.detail.item.value === "load") document.getElementById("project-dialog")?.show();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (event) => {
    const key = event.key.toUpperCase();
    if (key === 'H') toggleKeybindingsPopup();
    else if (key === 'F') toggleFullscreen();
    else if (key === 'T') toggleSplashScreen?.();
    else if (key === 'R') openRehearsalPopup();
    else if (event.key === ' ') {
      event.preventDefault();
      window.isPlaying ? window.pausePlayback() : window.startPlayback();
    }
  });

  // Initialize UI state
  wsToggleButton.style.borderColor = 'green';
  keybindingsPopup?.classList.add('hidden');

  // SVG interactions
  const svgEl = document.querySelector('svg');
  if (svgEl) {
    svgEl.style.pointerEvents = 'all';
    svgEl.querySelectorAll('*').forEach(child => child.style.pointerEvents = 'all');
  }

  // Popup outside-click dismiss
  const popup = document.getElementById("singlePage-content");
  if (popup) {
    document.addEventListener("click", (e) => { if (!popup.contains(e.target)) popup.style.display = "none"; });
    popup.addEventListener("click", (e) => e.stopPropagation());
  }
});

// ===========================
// Project Menu Population
// ===========================
async function populateProjectMenu() {
  const submenu = document.getElementById("projects-submenu");
  if (!submenu) return;

  try {
    const text = await (await fetch("/scores/")).text();
    const projects = [...text.matchAll(/href="\/scores\/([^"\/]+)\//g)]
      .map(m => m[1]).filter(x => !x.startsWith("."));

    submenu.innerHTML = "";
    if (projects.length === 0) {
      const item = document.createElement("sl-menu-item");
      item.disabled = true;
      item.textContent = "(no projects found)";
      submenu.appendChild(item);
      return;
    }

    projects.forEach(name => {
      const item = document.createElement("sl-menu-item");
      item.textContent = name;
      item.value = `project:${name}`;
      submenu.appendChild(item);
    });

    submenu.addEventListener("sl-select", (e) => {
      const v = e.detail.item.value;
      if (v.startsWith("project:")) window.loadProject?.(v.split(":")[1], { resetOnLoad: true });
    });
  } catch (err) {
    console.error("[ProjectMenu] Error:", err);
  }
}

window.populateProjectMenu = populateProjectMenu;