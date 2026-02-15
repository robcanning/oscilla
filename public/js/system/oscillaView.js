// oscillaView.js -- View Router
// -----------------------------------------------
// Reads the `?view=` URL parameter and configures the UI
// for dedicated single-purpose views (live console, signal
// monitor, controlXY, transport/conductor).
//
// Each view still connects via WebSocket for full sync.
// The default view (no param or `?view=score`) shows
// everything as normal.
//
// Usage:  ?view=live          Live coding console (fullscreen)
//         ?view=signals       Signal monitor only
//         ?view=controlxy     ControlXY pads only
//         ?view=transport     Conductor view (transport + time)
//         ?view=score         Default (or omit param)
//
// The project is still specified with ?project=xxx as usual.

// =================================================================
//  CONSTANTS
// =================================================================

const VALID_VIEWS = new Set([
  "score",
  "live",
  "signals",
  "controlxy",
  "transport",
]);

/**
 * Elements to hide per view.
 * Selectors listed here will be set to display:none.
 * The default "score" view hides nothing.
 */
const HIDE_MAP = {
  live: [
    "#splash",
    "#top-bar",
    "#controls",
    "#scoreContainer",
    ".project-modal",
    "#project-modal",
  ],
  signals: [
    "#splash",
    "#top-bar",
    "#controls",
    "#scoreContainer",
    ".project-modal",
    "#project-modal",
  ],
  controlxy: [
    "#splash",
    "#top-bar",
    "#controls",
    ".project-modal",
    "#project-modal",
  ],
  transport: [
    "#splash",
    "#scoreContainer",
    ".project-modal",
    "#project-modal",
  ],
};


// =================================================================
//  STATE -- parsed at module load time so isDedicatedView()
//  works immediately (before DOMContentLoaded).  URL parsing
//  doesn't need the DOM.
// =================================================================

const _params = new URLSearchParams(window.location.search);
const _raw = (_params.get("view") || "score").toLowerCase().trim();
let currentView = VALID_VIEWS.has(_raw) ? _raw : "score";


// =================================================================
//  PUBLIC API
// =================================================================

/**
 * Apply the view to the DOM.
 * Call this early in DOMContentLoaded, before other init.
 * URL is already parsed at module load time; this does the
 * DOM work (body attribute, hiding elements).
 * Returns the active view name.
 */
export function initView() {
  // Set data attribute for CSS targeting
  document.body.dataset.oscillaView = currentView;

  if (currentView === "score") return currentView;

  // Hide elements not needed for this view
  const selectors = HIDE_MAP[currentView] || [];
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach(el => {
      el.style.display = "none";
    });
  }

  console.log(`[oscillaView] Active view: ${currentView}`);
  return currentView;
}


/**
 * Returns the current view name.
 */
export function getView() {
  return currentView;
}


/**
 * Returns true if the current view is the default score view.
 */
export function isScoreView() {
  return currentView === "score";
}


/**
 * Returns true if the current view is a dedicated (non-score) view.
 */
export function isDedicatedView() {
  return currentView !== "score";
}


/**
 * Hook called after all modules are initialised.
 * Opens panels / sets up fullscreen layout for dedicated views.
 *
 * @param {Object} opts - Handles to module init functions
 * @param {Function} [opts.openLiveConsole]  - Opens the live console panel
 * @param {Function} [opts.showControlXY]    - Shows/focuses controlXY
 */
export function activateView(opts = {}) {
  if (currentView === "score") return;

  switch (currentView) {
    case "live":
      if (opts.openLiveConsole) opts.openLiveConsole();
      break;

    case "signals":
      // Open live console (the signals section is inside it)
      if (opts.openLiveConsole) opts.openLiveConsole();
      break;

    case "controlxy":
      if (opts.showControlXY) opts.showControlXY();
      break;

    case "transport":
      // Transport is already visible; nothing extra needed
      break;
  }
}
