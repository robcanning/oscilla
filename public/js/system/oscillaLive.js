// oscillaLive.js -- Live Coding Console
// -----------------------------------------------
// Provides a DSL console for live-coding Oscilla scores.
// All execution goes through the existing handleCueTrigger()
// pipeline. No handler functions are imported or reimplemented.
//
// Depends on window globals (all set up by existing modules):
//   window.handleCueTrigger    -- cueDispatcher.js
//   window.parseCueToAST       -- parser.js
//   window.oscillaAnimRegistry -- animation.js
//   window.runningAnimations   -- animation.js (Map)
//   window.oscillaParamBus     -- paramBus.js
//   window.oscillaRouter       -- controlRouter.js

let panelEl = null;
let isOpen = false;
let isPicking = false;
let selectedElement = null;
let signalUnsub = null;
let signalRefreshTimer = null;

// Cached DOM refs (set during buildPanel)
let editorEl = null;
let outputEl = null;
let signalsEl = null;
let targetInputEl = null;
let targetInfoEl = null;
let pickBtnEl = null;
let signalFilterEl = null;


// =================================================================
//  PUBLIC: initLiveConsole()
//  Called once from app.js at startup. Adds the topbar button.
// =================================================================

export function initLiveConsole() {
  const actions = document.getElementById("topbar-actions");
  if (!actions) {
    console.warn("[Live] topbar-actions not found -- skipping button");
    return;
  }

  // Find the view-tools cluster to insert before it
  const viewTools = actions.querySelector(".view-tools");

  const btn = document.createElement("button");
  btn.id = "livecode-toggle";
  btn.className = "gui-button";
  btn.title = "Live Console";
  btn.textContent = ">_";
  btn.addEventListener("click", toggle);

  if (viewTools) {
    actions.insertBefore(btn, viewTools);
  } else {
    actions.appendChild(btn);
  }
}


// =================================================================
//  TOGGLE
// =================================================================

function toggle() {
  if (isOpen) {
    closePanel();
  } else {
    openPanel();
  }
}

function openPanel() {
  if (!panelEl) buildPanel();
  panelEl.style.display = "flex";
  isOpen = true;

  const btn = document.getElementById("livecode-toggle");
  if (btn) btn.classList.add("livecode-active");

  startSignalMonitor();
  editorEl?.focus();
}

function closePanel() {
  if (panelEl) panelEl.style.display = "none";
  isOpen = false;

  const btn = document.getElementById("livecode-toggle");
  if (btn) btn.classList.remove("livecode-active");

  stopPicking();
  stopSignalMonitor();
}


// =================================================================
//  BUILD PANEL
// =================================================================

function buildPanel() {
  panelEl = document.createElement("div");
  panelEl.id = "livecode-panel";

  panelEl.innerHTML = `
    <!-- Header -->
    <div class="livecode-header">
      <span class="livecode-header-title">live</span>
      <button class="livecode-close" data-action="close">&times;</button>
    </div>

    <!-- Target selector -->
    <div class="livecode-target">
      <span class="livecode-target-label">target</span>
      <input class="livecode-target-input"
             placeholder="uid or element id"
             spellcheck="false"
             data-role="target-input" />
      <button class="livecode-pick-btn" data-action="pick">pick</button>
    </div>
    <div class="livecode-target-info" data-role="target-info"></div>

    <!-- Editor -->
    <div class="livecode-editor-wrap">
      <textarea class="livecode-editor"
                placeholder="type DSL here...  e.g. rotate(dur:2 loop:0)"
                spellcheck="false"
                data-role="editor"></textarea>
      <div class="livecode-actions">
        <button class="livecode-run-btn" data-action="run-line">
          run line <kbd>ctrl+enter</kbd>
        </button>
        <button class="livecode-run-btn" data-action="run-all">
          run all <kbd>ctrl+shift+enter</kbd>
        </button>
      </div>
    </div>

    <!-- Output log -->
    <div class="livecode-output-wrap">
      <div class="livecode-output-header">
        output
        <button class="livecode-output-clear" data-action="clear-output">clear</button>
      </div>
      <div class="livecode-output" data-role="output"></div>
    </div>

    <!-- Signal monitor -->
    <div class="livecode-signals-wrap">
      <div class="livecode-signals-header">
        signals
        <input class="livecode-signals-filter"
               placeholder="filter..."
               spellcheck="false"
               data-role="signal-filter" />
      </div>
      <div class="livecode-signals" data-role="signals"></div>
    </div>
  `;

  document.body.appendChild(panelEl);

  // Cache refs
  editorEl       = panelEl.querySelector('[data-role="editor"]');
  outputEl       = panelEl.querySelector('[data-role="output"]');
  signalsEl      = panelEl.querySelector('[data-role="signals"]');
  targetInputEl  = panelEl.querySelector('[data-role="target-input"]');
  targetInfoEl   = panelEl.querySelector('[data-role="target-info"]');
  pickBtnEl      = panelEl.querySelector('[data-action="pick"]');
  signalFilterEl = panelEl.querySelector('[data-role="signal-filter"]');

  // Wire events
  panelEl.querySelector('[data-action="close"]')
    .addEventListener("click", closePanel);

  panelEl.querySelector('[data-action="pick"]')
    .addEventListener("click", togglePicking);

  panelEl.querySelector('[data-action="run-line"]')
    .addEventListener("click", () => executeLine(getCurrentLine()));

  panelEl.querySelector('[data-action="run-all"]')
    .addEventListener("click", executeAll);

  panelEl.querySelector('[data-action="clear-output"]')
    .addEventListener("click", clearOutput);

  // Target input: resolve on Enter
  targetInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      resolveTarget(targetInputEl.value.trim());
    }
  });

  // Editor keyboard shortcuts
  editorEl.addEventListener("keydown", (e) => {
    // Ctrl+Enter: run current line
    if (e.ctrlKey && !e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      executeLine(getCurrentLine());
    }
    // Ctrl+Shift+Enter: run all
    if (e.ctrlKey && e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      executeAll();
    }
    // Tab: insert two spaces (keep focus in textarea)
    if (e.key === "Tab") {
      e.preventDefault();
      const start = editorEl.selectionStart;
      editorEl.value =
        editorEl.value.slice(0, start) + "  " + editorEl.value.slice(start);
      editorEl.selectionStart = editorEl.selectionEnd = start + 2;
    }
  });

  // Prevent panel interactions from bubbling into the score/transport
  panelEl.addEventListener("mousedown", (e) => e.stopPropagation());
  panelEl.addEventListener("click", (e) => e.stopPropagation());
  panelEl.addEventListener("keydown", (e) => e.stopPropagation());
  panelEl.addEventListener("keyup", (e) => e.stopPropagation());
  panelEl.addEventListener("keypress", (e) => e.stopPropagation());
}


// =================================================================
//  EDITOR HELPERS
// =================================================================

function getCurrentLine() {
  if (!editorEl) return "";
  const pos = editorEl.selectionStart;
  const text = editorEl.value;
  const before = text.lastIndexOf("\n", pos - 1) + 1;
  const after = text.indexOf("\n", pos);
  return text.substring(before, after === -1 ? text.length : after);
}


// =================================================================
//  EXECUTION
//  Every line goes through the existing dispatch pipeline.
//  Animation cues need a target element; everything else is
//  elementless (synth, audio, speed, nav, osc, stop, ...).
// =================================================================

/** Cue types that require a target SVG element */
const ELEMENT_CUES =
  /^(rotate|scale|scaleXY|o2p|color|colour|fade)\s*\(/i;

function executeLine(line) {
  const cleaned = line.trim();
  if (!cleaned || cleaned.startsWith("//") || cleaned.startsWith("#")) return;

  const targetEl = resolveCurrentTarget();
  const needsElement = ELEMENT_CUES.test(cleaned);

  if (needsElement && !targetEl) {
    logOutput("no target -- pick or enter a uid first", "err");
    return;
  }

  try {
    // Validate the DSL parses before dispatching
    const ast = window.parseCueToAST?.(cleaned);
    if (!ast) {
      logOutput("parse failed: " + cleaned, "err");
      return;
    }

    // Dispatch through the standard pipeline.
    // force=true bypasses dedupe so livecoded cues always fire.
    window.handleCueTrigger(cleaned, false, true, needsElement ? targetEl : null);
    logOutput(cleaned, "ok");

  } catch (err) {
    logOutput(String(err.message || err), "err");
  }
}

function executeAll() {
  if (!editorEl) return;
  const lines = editorEl.value.split("\n");
  for (const line of lines) {
    executeLine(line);
  }
}


// =================================================================
//  OUTPUT LOG
// =================================================================

function logOutput(text, type = "info") {
  if (!outputEl) return;

  const line = document.createElement("div");
  line.className = "livecode-output-line " + type;
  line.textContent = text;
  outputEl.appendChild(line);

  // Cap at 50 visible entries
  while (outputEl.children.length > 50) {
    outputEl.removeChild(outputEl.firstChild);
  }

  outputEl.scrollTop = outputEl.scrollHeight;
}

function clearOutput() {
  if (outputEl) outputEl.innerHTML = "";
}


// =================================================================
//  TARGET SELECTION
// =================================================================

function resolveTarget(idOrUid) {
  if (!idOrUid) {
    clearTarget();
    return;
  }

  // 1. Animation registry by exact uid
  const reg = window.oscillaAnimRegistry?.[idOrUid];
  if (reg?.el) {
    setTarget(reg.el, idOrUid);
    return;
  }

  // 2. DOM by id
  const el = document.getElementById(idOrUid);
  if (el) {
    setTarget(el, idOrUid);
    return;
  }

  // 3. Partial match in registry
  const keys = Object.keys(window.oscillaAnimRegistry || {});
  const match = keys.find(k => k.includes(idOrUid));
  if (match && window.oscillaAnimRegistry[match]?.el) {
    setTarget(window.oscillaAnimRegistry[match].el, match);
    if (targetInputEl) targetInputEl.value = match;
    return;
  }

  logOutput("target not found: " + idOrUid, "err");
}

function setTarget(el, label) {
  // Remove old highlight
  if (selectedElement) {
    selectedElement.classList.remove("livecode-selected");
  }

  selectedElement = el;
  el.classList.add("livecode-selected");

  // Build info string
  if (targetInfoEl) {
    const uid = el.dataset?.animUid || "";
    const cfg = el._oscillaCfg;
    const kind = cfg?.kind || "";
    const running = uid && window.runningAnimations instanceof Map
      ? window.runningAnimations.has(uid)
      : !!(uid && window.runningAnimations?.[uid]);

    let info = "<span>" + el.tagName + "</span>";
    if (el.id) info += ' id="' + escHtml(el.id) + '"';
    if (uid) info += " uid=<span>" + escHtml(uid) + "</span>";
    if (kind) info += " [" + kind + "]";
    if (running) info += " (running)";

    targetInfoEl.innerHTML = info;
  }

  logOutput("target: " + label, "info");
}

function clearTarget() {
  if (selectedElement) {
    selectedElement.classList.remove("livecode-selected");
  }
  selectedElement = null;
  if (targetInfoEl) targetInfoEl.innerHTML = "";
  if (targetInputEl) targetInputEl.value = "";
}

function resolveCurrentTarget() {
  // If input has a value but no element is selected yet, try resolving
  const inputVal = targetInputEl?.value.trim();
  if (inputVal && !selectedElement) {
    resolveTarget(inputVal);
  }
  return selectedElement;
}


// =================================================================
//  ELEMENT PICKER
// =================================================================

function togglePicking() {
  if (isPicking) {
    stopPicking();
  } else {
    startPicking();
  }
}

function startPicking() {
  isPicking = true;
  if (pickBtnEl) pickBtnEl.classList.add("picking");

  document.addEventListener("click", pickerClickHandler, true);
  document.addEventListener("mouseover", pickerHoverHandler, true);
  document.addEventListener("mouseout", pickerUnhoverHandler, true);

  logOutput("pick mode -- click an SVG element", "info");
}

function stopPicking() {
  if (!isPicking) return;
  isPicking = false;
  if (pickBtnEl) pickBtnEl.classList.remove("picking");

  document.removeEventListener("click", pickerClickHandler, true);
  document.removeEventListener("mouseover", pickerHoverHandler, true);
  document.removeEventListener("mouseout", pickerUnhoverHandler, true);

  // Clean up any lingering hover highlights
  document.querySelectorAll(".livecode-highlight").forEach(el => {
    el.classList.remove("livecode-highlight");
  });
}

function pickerClickHandler(e) {
  // Ignore clicks inside the panel
  if (panelEl?.contains(e.target)) return;

  e.preventDefault();
  e.stopPropagation();

  const el = findMeaningfulElement(e.target);
  if (!el) return;

  const uid = el.dataset?.animUid || "";
  const label = uid || el.id || el.tagName;
  if (targetInputEl) targetInputEl.value = label;
  setTarget(el, label);

  // Pre-fill editor with the DSL expression from the element's ID
  // so the user can tweak and re-execute
  if (editorEl && el.id && el.id.includes("(")) {
    editorEl.value = el.id;
    editorEl.focus();
  }

  stopPicking();
}

function pickerHoverHandler(e) {
  if (panelEl?.contains(e.target)) return;
  const el = findMeaningfulElement(e.target);
  if (el) el.classList.add("livecode-highlight");
}

function pickerUnhoverHandler(e) {
  if (panelEl?.contains(e.target)) return;
  const el = findMeaningfulElement(e.target);
  if (el) el.classList.remove("livecode-highlight");
}

/**
 * Walk up from the clicked element to find the nearest ancestor
 * with a data-anim-uid or an id. Stops at <body>.
 */
function findMeaningfulElement(el) {
  let current = el;
  while (current && current !== document.body) {
    if (current.dataset?.animUid) return current;
    if (current.id && !current.id.startsWith("livecode-")) return current;
    current = current.parentElement;
  }
  return el;
}


// =================================================================
//  SIGNAL MONITOR
//  Uses oscillaParamBus.subscribe("*", ...) for wildcard updates
//  and oscillaParamBus.snapshot() for the full picture.
//  Renders at 5 fps to avoid DOM thrash.
// =================================================================

let signalSnapshot = {};

function startSignalMonitor() {
  if (!signalUnsub && window.oscillaParamBus?.subscribe) {
    signalUnsub = window.oscillaParamBus.subscribe("*", (value, path) => {
      signalSnapshot[path] = value;
    });
  }

  if (!signalRefreshTimer) {
    signalRefreshTimer = setInterval(renderSignals, 200);
  }
}

function stopSignalMonitor() {
  if (signalUnsub) {
    signalUnsub();
    signalUnsub = null;
  }
  if (signalRefreshTimer) {
    clearInterval(signalRefreshTimer);
    signalRefreshTimer = null;
  }
}

function renderSignals() {
  if (!signalsEl) return;

  const filter = signalFilterEl?.value.trim().toLowerCase() || "";

  // Merge snapshot with current bus state
  const snap = window.oscillaParamBus?.snapshot?.("") || {};
  Object.assign(snap, signalSnapshot);

  const paths = Object.keys(snap).sort();
  const filtered = filter
    ? paths.filter(p => p.toLowerCase().includes(filter))
    : paths;

  let html = "";
  for (const path of filtered) {
    const val = snap[path];
    const display = typeof val === "number"
      ? (Number.isInteger(val) ? String(val) : val.toFixed(4))
      : String(val);

    html +=
      '<div class="livecode-signal-row">' +
      '<span class="livecode-signal-path">' + escHtml(path) + '</span>' +
      '<span class="livecode-signal-val">' + escHtml(display) + '</span>' +
      '</div>';
  }

  signalsEl.innerHTML = html;
}


// =================================================================
//  UTILITY
// =================================================================

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


// =================================================================
//  CLEANUP
// =================================================================

export function destroyLiveConsole() {
  closePanel();
  if (panelEl) {
    panelEl.remove();
    panelEl = null;
  }
  const btn = document.getElementById("livecode-toggle");
  if (btn) btn.remove();
}
