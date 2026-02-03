/*!
 * oscillaSystemUIBindings.js — DOM Event Wiring & UI Interactions
 * Part of oscillaScore modular architecture
 * © 2025 Rob Canning — GPLv3
 */

import { forward, rewind, rewindToStart } from '../oscillaTransport.js';
import { resetTriggeredCues } from '../cues/cueDispatcher.js';
import { resetStopwatch } from '../cues/timers.js';
import { setAnnotationMode, setAnnotationsEnabled } from '../interaction/interactionSurface.js';

// ===========================
// Module State
// ===========================
let keybindingsPopup = null;
let isCommunicationEnabled = true;

// Callbacks for cross-module communication
let onToggleCommunication = null;
let onToggleSplashScreen = null;
let onOpenRehearsalPopup = null;
let onOpenPreferencesDialog = null;

// ===========================
// Initialisation
// ===========================

/**
 * Initialise UI bindings with callbacks
 * @param {Object} callbacks - Callback functions for cross-module events
 */
export function initUIBindings(callbacks = {}) {
  onToggleCommunication = callbacks.toggleCommunication || null;
  onToggleSplashScreen = callbacks.toggleSplashScreen || null;
  onOpenRehearsalPopup = callbacks.openRehearsalPopup || null;
  onOpenPreferencesDialog = callbacks.openPreferencesDialog || null;

  // Cache DOM elements
  keybindingsPopup = document.getElementById('keybindings-popup');

  // Initialise all UI handlers
  initTransportButtons();
  initFullscreenButton();
  initWebSocketToggle();
  initKeybindingsPopup();
  initHamburgerMenu();
  initKeyboardShortcuts();
  initScoreNotesToggle();
  initAnnotationControls();
  initMiscUIHandlers();

  // Set initial UI state
  keybindingsPopup?.classList.add('hidden');
  
  const wsToggleButton = document.getElementById('ws-toggle-button');
  if (wsToggleButton) {
    wsToggleButton.style.borderColor = 'green';
  }
}

// ===========================
// Transport Buttons
// ===========================

function initTransportButtons() {
  const toggleButton = document.getElementById('toggle-button');
  const rewindButton = document.getElementById('rewind-button');
  const forwardButton = document.getElementById('forward-button');
  const rewindToZeroButton = document.getElementById('rewind-to-zero-button');

  toggleButton?.addEventListener('click', () => {
    window.isPlaying ? window.pausePlayback() : window.resumePlayback();
  });

  rewindButton?.addEventListener('click', () => {
    resetTriggeredCues();
    rewind();
  });

  forwardButton?.addEventListener('click', () => {
    resetTriggeredCues();
    forward();
  });

  rewindToZeroButton?.addEventListener('click', () => {
    resetTriggeredCues();
    rewindToStart();
    resetStopwatch();
  });
}

// ===========================
// Fullscreen
// ===========================

function initFullscreenButton() {
  const fullscreenButton = document.getElementById('fullscreen-button');
  fullscreenButton?.addEventListener('click', toggleFullscreen);
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
      .catch(err => console.error(`Fullscreen error: ${err.message}`));
  } else {
    document.exitFullscreen();
  }
}

// ===========================
// WebSocket Toggle
// ===========================

function initWebSocketToggle() {
  const wsToggleButton = document.getElementById('ws-toggle-button');
  wsToggleButton?.addEventListener('click', handleCommunicationToggle);
}

function handleCommunicationToggle() {
  const wsToggleButton = document.getElementById('ws-toggle-button');
  isCommunicationEnabled = !isCommunicationEnabled;
  
  onToggleCommunication?.(isCommunicationEnabled);
  
  wsToggleButton.style.borderColor = isCommunicationEnabled ? 'green' : 'red';
  wsToggleButton?.classList.toggle('enabled', isCommunicationEnabled);
  wsToggleButton?.classList.toggle('disabled', !isCommunicationEnabled);
}

// ===========================
// Keybindings Popup
// ===========================

function initKeybindingsPopup() {
  const closeKeybindingsButton = document.getElementById('close-keybindings');
  closeKeybindingsButton?.addEventListener('click', () => {
    keybindingsPopup?.classList.add('hidden');
  });
}

function toggleKeybindingsPopup() {
  keybindingsPopup?.classList.toggle('hidden');
}

// ===========================
// Hamburger Menu
// ===========================

function initHamburgerMenu() {
  const menu = document.querySelector("#hamburger-container sl-menu");
  
  menu?.addEventListener("sl-select", (e) => {
    const value = e.detail.item.value;

    if (value === "preferences") {
      onOpenPreferencesDialog?.();
    }

    if (value === "load") {
      document.getElementById("project-dialog")?.show();
    }
  });
}

// ===========================
// Keyboard Shortcuts
// ===========================

function initKeyboardShortcuts() {
  document.addEventListener(
    "keydown",
    (event) => {
      // Block all shortcuts while typing in editor
      if (window.oscillaTextInputActive && event.key !== "Escape") {
        event.stopPropagation();
        return;
      }

      const key = event.key.toUpperCase();

      if (key === "H") toggleKeybindingsPopup();
      else if (key === "F") toggleFullscreen();
      else if (key === "T") onToggleSplashScreen?.();
      else if (key === "R") onOpenRehearsalPopup?.();
      else if (event.key === " ") {
        event.preventDefault();
        window.isPlaying
          ? window.pausePlayback()
          : window.startPlayback();
      }
    },
    true
  );
}

// ===========================
// Score Notes Toggle
// ===========================

function initScoreNotesToggle() {
  document.getElementById("toggle-notes-button")?.addEventListener("click", toggleScoreNotes);
  window.toggleScoreNotes = toggleScoreNotes;
}

function toggleScoreNotes() {
  const notes = document.querySelectorAll("svg [id^='note']");
  if (!notes.length) return;

  const currentlyVisible = notes[0].style.display !== "none";

  notes.forEach(note => {
    note.style.display = currentlyVisible ? "none" : "";
  });

  document
    .getElementById("toggle-notes-button")
    ?.classList.toggle("active", !currentlyVisible);
}

// ===========================
// Annotation Controls
// ===========================

let annotationMode = false;
let annotationsVisible = true;

function initAnnotationControls() {
  const btn = document.getElementById("annotation-toggle");
  if (!btn) return;

  btn.addEventListener("click", () => {
    annotationMode = !annotationMode;
    setAnnotationMode(annotationMode);
    console.log("[annotations] mode:", annotationMode);
  });

  // Global toggle (for preferences)
  window.toggleAnnotations = (on) => {
    annotationsVisible = on;
    setAnnotationsEnabled(on);
  };

  // React to authoritative state changes
  window.addEventListener("oscilla:annotation-mode", (e) => {
    const active = e.detail.active;
    btn.classList.toggle("active", active);
  });
}

// ===========================
// Miscellaneous UI Handlers
// ===========================

function initMiscUIHandlers() {
  // Close score options popup
  document.getElementById("close-score-options")?.addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("score-options-popup")?.classList.add("hidden");
  });

  // Template download button
  document.getElementById("download-template-btn")?.addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = "svg/template.svg";
    link.download = "template.svg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  // SVG interactions
  const svgEl = document.querySelector('svg');
  if (svgEl) {
    svgEl.style.pointerEvents = 'all';
    svgEl.querySelectorAll('*').forEach(child => child.style.pointerEvents = 'all');
  }

  // Popup outside-click dismiss
  // NOTE: Only hide singlePage-content for actual popup dismissals,
  // NOT when in page mode or clicking transport bars
  const popup = document.getElementById("singlePage-content");
  if (popup) {
    document.addEventListener("click", (e) => {
      // Don't hide if we're in page mode (independent view)
      if (window.pageState?.mode === "page" || window._independentPageView) {
        return;
      }
      
      // Don't hide if clicking on transport bars or their children
      const topBar = document.getElementById("top-bar");
      const controls = document.getElementById("controls");
      if (topBar?.contains(e.target) || controls?.contains(e.target)) {
        return;
      }
      
      // Don't hide if clicking on any UI controls
      if (e.target.closest('.gui-button, .gui-bar, .gui-cluster, sl-menu, sl-dropdown')) {
        return;
      }
      
      // Only hide if clicking truly outside
      if (!popup.contains(e.target)) {
        popup.style.display = "none";
      }
    });
    popup.addEventListener("click", (e) => e.stopPropagation());
  }

  // Repeat count box click handler
  document.getElementById("repeat-count-box")?.addEventListener("click", () => {
    for (const [cueId, repeat] of Object.entries(window.repeatStateMap || {})) {
      if (repeat.active) {
        repeat.currentCount = repeat.count;
        repeat.active = false;
        document.getElementById('repeat-count-box')?.classList.add('hidden');
        document.getElementById("playhead")?.classList.remove("repeating");
      }
    }
  });
}

// ===========================
// Exports for External Use
// ===========================

export { toggleFullscreen, toggleKeybindingsPopup, toggleScoreNotes };
