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

import { makeDraggable } from "../system/uiUtils.js";
import { isDedicatedView } from "../system/oscillaView.js";
import { sendSocketMessage } from "../system/socket.js";

let panelEl = null;
let isOpen = false;
let isPicking = false;
let selectedElement = null;
let selectedTargetId = null;      // used in dedicated view (no DOM element)
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
let scoreCueIds = [];             // DSL cue expressions from the score SVG
let browseIdx = -1;               // current index in cue browser


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
    <!-- Header (drag handle) -->
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
             list="livecode-element-list"
             data-role="target-input" />
      <datalist id="livecode-element-list"></datalist>
      <button class="livecode-pick-btn" data-action="pick">pick</button>
    </div>
    <div class="livecode-target-info" data-role="target-info"></div>

    <!-- Editor -->
    <div class="livecode-editor-wrap" data-section="editor">
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

    <!-- Resize bar: editor | output -->
    <div class="livecode-resize-bar" data-resize="editor-output"></div>

    <!-- Output log -->
    <div class="livecode-output-wrap" data-section="output">
      <div class="livecode-output-header">
        output
        <button class="livecode-output-clear" data-action="clear-output">clear</button>
      </div>
      <div class="livecode-output" data-role="output"></div>
    </div>

    <!-- Resize bar: output | signals -->
    <div class="livecode-resize-bar" data-resize="output-signals"></div>

    <!-- Signal monitor -->
    <div class="livecode-signals-wrap" data-section="signals">
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
    // Ctrl+J: jump to cue browser
    if (e.ctrlKey && e.key === "j") {
      e.preventDefault();
      enterCueBrowse();
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

  // --- Draggable by header, resizable edges and section bars ---
  makeDraggable(panelEl, panelEl.querySelector(".livecode-header"));
  initSectionResize(panelEl);
  initPanelResize(panelEl);

  // --- Dedicated view: fetch element list, disable pick ---
  if (isDedicatedView()) {
    if (pickBtnEl) {
      pickBtnEl.disabled = true;
      pickBtnEl.textContent = "n/a";
      pickBtnEl.title = "Pick unavailable -- use the dropdown list";
    }
    fetchScoreElements();

    // In dedicated view, selecting from datalist sets the remote target
    targetInputEl.addEventListener("input", () => {
      const val = targetInputEl.value.trim();
      if (val) {
        selectedTargetId = val;
        if (targetInfoEl) targetInfoEl.textContent = val;
        logOutput("target: " + val, "info");
      }
    });
  }
}


// =================================================================
//  REMOTE ELEMENT LIST (dedicated view)
//  Fetches the project SVG via HTTP and extracts element IDs
//  to populate the target datalist -- no rendering, no cue init.
// =================================================================

async function fetchScoreElements() {
  const project = new URLSearchParams(window.location.search).get("project");
  if (!project) {
    logOutput("no ?project= in URL -- cannot fetch elements", "err");
    return;
  }

  // Matches cue DSL function-style IDs
  const CUE_RE = /^(?:cue:)?(oscCtrl|osc|controlXY|ui|video|scale|scaleXY|rotate|o2p|page|text|fade|pause|speed|audio|audioPool|audioImpulse|synth|nav|stop|stopwatch|button|metro|metronome)\s*\(/i;
  // Inkscape internal IDs to skip
  const SKIP_RE = /^(defs|metadata|namedview|base|layer|sodipodi|inkscape)\d*$/i;

  try {
    const res = await fetch(`/scores/${encodeURIComponent(project)}/score.svg`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const svgText = await res.text();

    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const datalist = panelEl.querySelector("#livecode-element-list");
    if (!datalist) return;

    datalist.innerHTML = "";

    const allEls = doc.querySelectorAll("[id]");
    const targetIds = [];
    const cueIds = [];

    for (const el of allEls) {
      const id = el.id.trim();
      if (!id || SKIP_RE.test(id)) continue;

      if (CUE_RE.test(id)) {
        cueIds.push(id);
      }
      // All non-internal elements are valid targets
      targetIds.push(id);
    }

    // Populate datalist for target autocomplete
    for (const id of targetIds) {
      const opt = document.createElement("option");
      opt.value = id;
      datalist.appendChild(opt);
    }

    // Log summary
    logOutput(`${targetIds.length} elements, ${cueIds.length} cues in ${project}`, "info");

    // Store for keyboard browsing
    scoreCueIds = cueIds;

    // Render cue entries as selectable items
    for (let i = 0; i < cueIds.length; i++) {
      const id = cueIds[i];
      const display = id.length > 80 ? id.slice(0, 77) + "..." : id;

      const line = document.createElement("div");
      line.className = "livecode-output-line livecode-cue-entry";
      line.textContent = display;
      line.dataset.cueIdx = i;
      line.dataset.fullCue = id;

      // Click to insert
      line.addEventListener("click", () => insertCueAtCursor(id));

      outputEl.appendChild(line);
    }

    if (cueIds.length) {
      logOutput("ctrl+j to browse cues, click to insert", "info");
    }

  } catch (err) {
    logOutput("fetch score failed: " + err.message, "err");
  }
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

  const needsElement = ELEMENT_CUES.test(cleaned);

  // ---------------------------------------------------------
  // Dedicated view: send via WebSocket to the score window
  // ---------------------------------------------------------
  if (isDedicatedView()) {
    let targetId = selectedTargetId || targetInputEl?.value.trim() || null;

    // If the expression itself is a known element ID from the score
    // (e.g. user picked "rotate(dur:2)" from the cue list), use it
    // as both the expression and the target.
    if (needsElement && !targetId && scoreCueIds.includes(cleaned)) {
      targetId = cleaned;
    }

    if (needsElement && !targetId) {
      logOutput("no target -- select an element first", "err");
      return;
    }

    sendSocketMessage("livecode_exec", {
      cueExpr: cleaned,
      targetId: needsElement ? targetId : null
    });
    logOutput(cleaned, "ok");
    return;
  }

  // ---------------------------------------------------------
  // Score view: local execution via handleCueTrigger
  // ---------------------------------------------------------
  const targetEl = resolveCurrentTarget();

  if (needsElement && !targetEl) {
    logOutput("no target -- pick or enter a uid first", "err");
    return;
  }

  try {
    const ast = window.parseCueToAST?.(cleaned);
    if (!ast) {
      logOutput("parse failed: " + cleaned, "err");
      return;
    }

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
//  CUE BROWSER  (Ctrl+J)
//  Navigate cue entries in the output with keyboard.
//  Arrow/j/k = navigate, Enter = insert into editor, Escape = exit.
// =================================================================

let _browseActive = false;
let _browseHandler = null;

function enterCueBrowse() {
  if (!scoreCueIds.length) {
    logOutput("no cues loaded -- open ?view=live&project=... ", "err");
    return;
  }

  _browseActive = true;
  browseIdx = 0;
  highlightBrowseEntry(0);
  logOutput("[ctrl+j] browsing cues -- arrows/j/k, enter to insert, esc to cancel", "info");

  // Capture keydown at document level so textarea doesn't eat keys
  _browseHandler = (e) => {
    if (!_browseActive) return;

    switch (e.key) {
      case "ArrowDown":
      case "j":
        e.preventDefault();
        e.stopPropagation();
        browseIdx = Math.min(browseIdx + 1, scoreCueIds.length - 1);
        highlightBrowseEntry(browseIdx);
        break;
      case "ArrowUp":
      case "k":
        e.preventDefault();
        e.stopPropagation();
        browseIdx = Math.max(browseIdx - 1, 0);
        highlightBrowseEntry(browseIdx);
        break;
      case "Enter":
        e.preventDefault();
        e.stopPropagation();
        insertCueAtCursor(scoreCueIds[browseIdx]);
        exitCueBrowse();
        break;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        exitCueBrowse();
        break;
    }
  };

  document.addEventListener("keydown", _browseHandler, true);
}

function exitCueBrowse() {
  _browseActive = false;
  browseIdx = -1;

  if (outputEl) {
    outputEl.querySelectorAll(".livecode-cue-entry.browsing")
      .forEach(el => el.classList.remove("browsing"));
  }

  if (_browseHandler) {
    document.removeEventListener("keydown", _browseHandler, true);
    _browseHandler = null;
  }

  editorEl?.focus();
}

function highlightBrowseEntry(idx) {
  if (!outputEl) return;
  const entries = outputEl.querySelectorAll(".livecode-cue-entry");
  entries.forEach(el => el.classList.remove("browsing"));

  if (entries[idx]) {
    entries[idx].classList.add("browsing");
    entries[idx].scrollIntoView({ block: "nearest" });
  }
}

function insertCueAtCursor(cueExpr) {
  if (!editorEl || !cueExpr) return;

  const start = editorEl.selectionStart;
  const end = editorEl.selectionEnd;
  const text = editorEl.value;

  editorEl.value = text.slice(0, start) + cueExpr + text.slice(end);
  editorEl.selectionStart = editorEl.selectionEnd = start + cueExpr.length;
  editorEl.focus();
}


// =================================================================
//  TARGET SELECTION
// =================================================================

function resolveTarget(idOrUid) {
  if (!idOrUid) {
    clearTarget();
    return;
  }

  // Dedicated view: no local DOM -- just store the ID string
  if (isDedicatedView()) {
    selectedTargetId = idOrUid;
    if (targetInfoEl) targetInfoEl.textContent = idOrUid;
    logOutput("target: " + idOrUid, "info");
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
  selectedTargetId = null;
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
//  SECTION RESIZE (drag bars between editor / output / signals)
// =================================================================

const SECTION_MAP = {
  "editor-output":  { above: '[data-section="editor"]',  below: '[data-section="output"]' },
  "output-signals": { above: '[data-section="output"]',  below: '[data-section="signals"]' },
};

function initSectionResize(panel) {
  panel.querySelectorAll(".livecode-resize-bar").forEach(bar => {
    bar.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const key = bar.dataset.resize;
      const mapping = SECTION_MAP[key];
      if (!mapping) return;

      const aboveEl = panel.querySelector(mapping.above);
      const belowEl = panel.querySelector(mapping.below);
      if (!aboveEl || !belowEl) return;

      const startY = e.clientY;
      const aboveH = aboveEl.getBoundingClientRect().height;
      const belowH = belowEl.getBoundingClientRect().height;

      // Lock both to explicit heights and remove flex growth
      aboveEl.style.flex = "none";
      belowEl.style.flex = "none";
      aboveEl.style.height = aboveH + "px";
      belowEl.style.height = belowH + "px";

      bar.classList.add("active");

      const onMove = (ev) => {
        const dy = ev.clientY - startY;
        const newAbove = Math.max(40, aboveH + dy);
        const newBelow = Math.max(40, belowH - dy);
        aboveEl.style.height = newAbove + "px";
        belowEl.style.height = newBelow + "px";
      };

      const onUp = () => {
        bar.classList.remove("active");
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  });
}


// =================================================================
//  PANEL RESIZE (drag any edge or corner to resize the whole panel)
// =================================================================

const MIN_W = 260;
const MIN_H = 200;

/**
 * Edge zones: each one defines which axes it resizes and
 * whether it grows from the left/top (requiring position shift).
 */
const EDGES = [
  { cls: "livecode-edge-n",  cursor: "ns-resize",   dy: -1, dx:  0, shiftY: true  },
  { cls: "livecode-edge-s",  cursor: "ns-resize",   dy:  1, dx:  0 },
  { cls: "livecode-edge-w",  cursor: "ew-resize",   dy:  0, dx: -1, shiftX: true  },
  { cls: "livecode-edge-e",  cursor: "ew-resize",   dy:  0, dx:  1 },
  { cls: "livecode-edge-nw", cursor: "nwse-resize", dy: -1, dx: -1, shiftX: true, shiftY: true },
  { cls: "livecode-edge-ne", cursor: "nesw-resize", dy: -1, dx:  1, shiftY: true  },
  { cls: "livecode-edge-sw", cursor: "nesw-resize", dy:  1, dx: -1, shiftX: true  },
  { cls: "livecode-edge-se", cursor: "nwse-resize", dy:  1, dx:  1 },
];

function initPanelResize(panel) {
  for (const edge of EDGES) {
    const el = document.createElement("div");
    el.className = "livecode-edge " + edge.cls;
    el.style.cursor = edge.cursor;
    panel.appendChild(el);

    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const rect   = panel.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startW = rect.width;
      const startH = rect.height;
      const startL = rect.left;
      const startT = rect.top;

      // Ensure left/top positioning
      panel.style.left   = startL + "px";
      panel.style.top    = startT + "px";
      panel.style.right  = "auto";
      panel.style.bottom = "auto";

      const onMove = (ev) => {
        const deltaX = ev.clientX - startX;
        const deltaY = ev.clientY - startY;

        if (edge.dx !== 0) {
          if (edge.shiftX) {
            // Growing leftward: move left edge, shrink from left
            const newW = Math.max(MIN_W, startW - deltaX);
            panel.style.width = newW + "px";
            panel.style.left  = (startL + startW - newW) + "px";
          } else {
            panel.style.width = Math.max(MIN_W, startW + deltaX) + "px";
          }
        }

        if (edge.dy !== 0) {
          if (edge.shiftY) {
            // Growing upward: move top edge, shrink from top
            const newH = Math.max(MIN_H, startH - deltaY);
            panel.style.height = newH + "px";
            panel.style.top    = (startT + startH - newH) + "px";
          } else {
            panel.style.height = Math.max(MIN_H, startH + deltaY) + "px";
          }
        }
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
      };

      document.body.style.cursor = edge.cursor;
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }
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

/**
 * Programmatically open the live console panel.
 * Used by the view router (?view=live, ?view=signals).
 */
export { openPanel as showLiveConsole };
