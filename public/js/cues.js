/*!
 * cueHandlers.js — Modular Cue Handling for oscillaScore
 * © 2025 Rob Canning
 *
 * Licensed under the GNU General Public License v3.0
 * https://www.gnu.org/licenses/gpl-3.0.html
 *
 * This module defines the logic for interpreting and responding to score cue events
 * within the oscillaScore system. Cue types include:
 *
 *  - cuePause, cueStop           → Playback control
 *  - cueSpeed, cueChoice         → Parameter change or user interaction
 *  - cueRepeat_*                 → Repeating sections with jump logic
 *  - cueAudio, cueOsc*           → Media and OSC triggering
 *  - cueTraverse (c-t)           → Object animation along defined points
 *  - cuePage                     → Fullscreen animated SVG overlays
 *
 * The module also manages cue state (triggeredCues), repeat state synchronization,
 * and UI updates related to pause countdowns, audio playback, and cue highlighting.
 *
 * All handlers are exportable and usable within app.js and other modules.
 */

export const cueHandlers = {
  cueSpeed: handleSpeedCue,
  cuePause: handlePauseCue,
  cueStop: handleStopCue,
  cueChoice: handleCueChoice,
  cuePage: handlePageCue,
  cueNav: handleNavCue,
  cueAudio: handleAudioCue,
  cueOsc: handleOscCue,
  cueOscTrigger: handleOscCue,
  cueOscValue: handleOscCue,
  cueOscSet: handleOscCue,
  cueOscRandom: handleOscCue,
  cueOscBurst: handleOscCue,
  cueOscPulse: handleOscCue,
  cueRepeat: handleRepeatCue,
  cueTraverse: handleTraverseCue,
  "c-t": handleTraverseCue,
  cueSeq: handleSeqCue,
};

import { parseCueToAST } from "./parser.js";

import { handlePauseCue } from "./oscillaPause.js";
import { handleNavCue } from "./oscillaNav.js";
import { handleFadeCueFromAST } from "./oscillaFade.js";
import { handleVideoCueFromAST } from "./oscillaVideo.js";
import { buildCueButtonsIn } from "./oscillaButton.js";
import { handleMetronomeCue } from "./metro.js";
import { handleRotateCue } from "./rotate.js";
import { handleScaleCue } from "./scale.js";
import { handleO2PCue } from "./o2p.js";

import { handlePageCue } from "./oscillaPage.js";

import { handleAudioCue, handleAudioStopCue, stopAllAudio, activeAudioCues } from "./oscillaAudio.js";


import { propagate } from "./oscillaPropagate.js";

import { handleSpeedCue, handleSpeedRamp } from "./oscillaSpeed.js";
import { stopAllCueTexts } from "./oscillaText.js";

// import { handleScaleCue, handleO2PCue } from "./oscillaAnim.js";



// Emulate the rewind reset: clear every gating structure we might use
export function resetCueTrigger() {
  const cleared = [];
  if (window.triggeredCues?.clear) { window.triggeredCues.clear(); cleared.push("triggeredCues"); }
  if (window.cuesTriggered?.clear) { window.cuesTriggered.clear(); cleared.push("cuesTriggered"); }
  if (window._cueInsideState?.clear) { window._cueInsideState.clear(); cleared.push("_cueInsideState"); }
  if (window._cueDebounce?.clear) { window._cueDebounce.clear(); cleared.push("_cueDebounce"); }
  console.log(`[rewindReset] cleared: ${cleared.join(", ") || "nothing"}`);
}

function waitForCueComplete(targetId, timeout = 60000) {
  return new Promise(resolve => {
    const onDone = (ev) => {
      const { id } = ev.detail || {};
      if (!id) return;
      if (id.includes(targetId)) {
        window.removeEventListener("oscilla:cueComplete", onDone);
        resolve();
      }
    };
    window.addEventListener("oscilla:cueComplete", onDone);
    // safety timeout (so it doesn't hang forever)
    setTimeout(() => {
      window.removeEventListener("oscilla:cueComplete", onDone);
      resolve();
    }, timeout);
  });
}




////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////
export function parseCueParams(cueId) {
  // If caller passed an AST directly → just return it
  if (typeof cueId !== "string" && cueId?.type) {
    const ast = cueId;
    return { type: ast.type, params: ast.params || {}, ast };
  }

  // ----------------------------------------------------------
  // 1️⃣ Try Chevrotain AST Parsing (new DSL, supports pause(4), nav(A), etc.)
  // ----------------------------------------------------------
  try {
    const ast = parseCueToAST(cueId.trim());

    // Ensure param object exists
    const cueParams = ast.params || {};

    console.log("[parseCueParams] ✅ AST parsed:", ast);
    return { type: ast.type, params: cueParams, ast };
  } catch (err) {
    // AST parse failed → continue to legacy fallback
    // console.warn("[CueDSL] AST parse failed, trying legacy:", err);
  }

  // ----------------------------------------------------------
  // 2️⃣ Optional JSON/brace DSL (old experimental form)
  // ----------------------------------------------------------
  if (cueId.includes(":") && cueId.includes("{")) {
    try {
      const result = parseCueDSL(cueId);
      // console.log("[CueDSL] JSON-style DSL parsed successfully:", result);
      return result;
    } catch (err) {
      // console.warn("[CueDSL] JSON-style DSL failed → fallback to legacy:", err);
    }
  }

  // ----------------------------------------------------------
  // 3️⃣ Legacy cue syntax fallback (cuePause_dur(N), cuePage(x), etc.)
  // ----------------------------------------------------------
  return parseCueLegacy(cueId);
}



////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////
export function parseCueDSL(str) {
  // Example accepted:
  // cue:page(target:"page3"){dur:5,next:"page4"}
  // page(target:"page3"){dur:5,next:"page4"}
  const mainMatch = str.match(/^(?:cue:)?([a-zA-Z0-9_-]+)\((.*?)\)\s*\{(.*)\}$/);
  if (!mainMatch) throw new Error("Invalid DSL structure");

  const [, type, argSection, paramSection] = mainMatch;

  const args = {};
  argSection.split(",").forEach((kv) => {
    const [k, v] = kv.split(":").map(s => s.trim());
    if (!k) return;
    args[k] = parseValue(v);
  });

  const params = {};
  paramSection.split(",").forEach((kv) => {
    const [k, v] = kv.split(":").map(s => s.trim());
    if (!k) return;
    params[k] = parseValue(v);
  });

  return { type: `cue${capitalize(type)}`, args, params };
}

function parseValue(v) {
  if (!v) return null;
  if (v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1);
  if (!isNaN(v)) return Number(v);
  if (v === "true") return true;
  if (v === "false") return false;
  return v;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}


////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////
export function handleCueTrigger(cueExprOrAst, isRemote = false, force = false, cueElement = null) {
  console.log(`[DEBUG] Attempting to trigger cue:`, cueExprOrAst);

  // ---------------------------
  // 🔍 STEP 1: Normalise AST
  // ---------------------------
  let ast = null;
  let cueId = null;

  const isAstObject = typeof cueExprOrAst === "object" && cueExprOrAst.type;

  if (isAstObject) {
    ast = cueExprOrAst;
    cueId = ast.raw || ast.id || null;
  } else {
    cueId = String(cueExprOrAst).trim();
  }

  // ---------------------------
  // 🚫 STEP 2: DEDUPE RULES
  // ---------------------------
  // Buttons pass force=true → retrigger always
  // Page cues → retrigger always
  // Scroll cues → dedupe normally
  // ---------------------------

  // Page / nav cues must ALWAYS retrigger
  const isPageCue =
    cueId?.startsWith("page(") ||
    cueId?.startsWith("page:") ||
    cueId?.includes("nav(") ||
    cueId?.includes("nav:");

  if (!force && !isAstObject && !isPageCue) {
    // Initialise registry
    if (!window.triggeredCues) window.triggeredCues = new Set();

    // If already triggered, skip
    if (window.triggeredCues.has(cueId)) {
      console.debug("[DEBUG] Skipping already-triggered cue:", cueId);
      return;
    }

    // Track only non-button, non-page cues
    window.triggeredCues.add(cueId);
  }

  // ---------------------------
  // 🔍 STEP 3: Parse cue into AST if needed
  // ---------------------------
  if (!ast) {
    try {
      ast = parseCueToAST(cueId);
    } catch {
      const legacy = parseCueParams(cueId);
      if (!legacy?.ast) {
        console.error("[CUE] ❌ Could not parse cue expression:", cueId);
        return;
      }
      ast = legacy.ast;
    }
  }

  if (!ast) {
    console.error("[CueDSL] ❌ No AST resolved — cannot proceed.");
    return;
  }

  // console.log(`[CueDSL] ✅ Resolved AST Cue Type: ${ast.type}`, ast);

  // ---------------------------
  // 🚀 STEP 4: DISPATCH
  // ---------------------------
  switch (ast.type) {

    // Animation handlers
    case "cueRotate": return handleRotateCue(cueElement, ast.args, { fromCueTrigger: true });
    case "cueScale": return handleScaleCue(ast, cueElement, { fromCueTrigger: true });
    case "cueO2P": return handleO2PCue(cueElement, ast.args, { fromCueTrigger: true });

    // Page navigation — ALWAYS retrigger
    case "cuePage":
    case "page":
      return handlePageCue(ast, cueElement);

    case "cueFade": return handleFadeCueFromAST(ast, cueElement);
    case "cueStopwatch": return handleStopwatchCue(ast, cueElement);
    case "cueVideo": return handleVideoCueFromAST(ast, cueElement);

    case "cueText":
      import("./oscillaText.js")
        .then(mod => mod.handleCueTextFromAST(ast, cueElement))
        .catch(err => console.error("[CueDSL] Failed to load text.js module:", err));
      return;

    case "cueMetronome":
    case "cueMetro":
      return handleMetronomeCue(ast, cueElement);

    case "cuePause": return handlePauseCue(ast, cueElement);

    // Speed cues support ramps
    case "cueSpeed": {
      const start = window.speedMultiplier ?? 1.0;
      const end = ast.value ?? start;
      const dur = ast.dur ?? null;

      if (dur && dur > 0) {
        return handleSpeedRamp(start, end, dur);
      } else {
        return handleSpeedCue(`speed(${end})`, end);
      }
    }

    case "cueStop": return handleStopCue(ast, cueElement);

    // NAVIGATION (uses page system)
    case "cueNav": return handleNavCue(ast);

    // AUDIO
    case "cueAudio":
      if (!ast || ast.type !== "cueAudio") {
        console.warn("[cueAudio] Missing/invalid AST:", ast);
        return;
      }
      console.log("[dispatch] cueAudio AST →", ast);
      return handleAudioCue(ast);

    case "cueAudioStop":
      return stopAudioCue(ast.filename || ast.file);

    default:
      console.warn(`[CueDSL] ⚠ Unsupported cue type: ${ast.type}`);
      return;
  }
}

window.handleCueTrigger = handleCueTrigger;



// =========================
//  Universal UID Registry
// =========================
export function registerCueUid(cueExpr, context = "unknown") {
  if (!cueExpr || typeof cueExpr !== "string") return;
  if (!window.cueRegistry) window.cueRegistry = {};

  const uidMatch = cueExpr.match(/_uid\(([^)]+)\)/);
  if (!uidMatch) return;

  const uid = uidMatch[1].trim();
  window.cueRegistry[uid] = cueExpr;

  // console.log(`[REGISTRY]  Registered UID "${uid}" (${context}) → ${cueExpr}`);
}



//  Unified cue completion event emitter
export function emitCueComplete(id, type = "generic") {
  console.log(`[cueComplete] 🔚 ${type} complete → ${id}`);
  window.dispatchEvent(new CustomEvent("oscilla:cueComplete", {
    detail: { id, type, timestamp: Date.now() }
  }));
}










/**
 *  — Cue Repeat Logic (ES Module)
 *
 * This module implements the complete parsing, state tracking, and execution logic
 * for `cueRepeat_*` score cues, used to create looped playback sections within an
 * animated SVG score environment.
 *
 * === Cue Format Overview ===
 * cueRepeat_s_[startID][_e_[endID]]_x_[repeatCount|inf][_r_[resumeID]][_d_[f|r|p]][_a_[stop]]-[UID?]
 *
 * Parameters:
 *   s_[startID]      → REQUIRED. ID to jump to at start of each repeat loop.
 *   e_[endID]        → OPTIONAL. ID marking end of the repeat section (default = cue ID).
 *   x_[N|inf]        → REQUIRED. Number of repeats (x_2 = 2 loops = 3 total plays). Use x_inf for infinite loop.
 *   r_[resumeID]     → OPTIONAL. Jump location after final repeat (default = cue itself).
 *   d_[f|r|p]        → OPTIONAL. Direction mode:
 *                        - f = forward
 *                        - r = reverse
 *                        - p = pingpong (alternates direction)
 *   a_[stop]         → OPTIONAL. If present, playback stops after final repeat.
 *   -UID             → OPTIONAL suffix for disambiguation (ignored by logic).
 *
 * === Exports ===
 * - repeatStateMap         → Object that tracks all active repeat states by cue ID
 * - parseRepeatCueId()     → Parses a cueRepeat_* ID into a structured config object
 * - executeRepeatJump()    → Performs jump logic between repeat boundaries with timing
 * - handleRepeatCue()      → Top-level handler for triggering repeat behavior
 *
 * === Responsibilities ===
 * - Parse cueRepeat_* IDs
 * - Store per-cue repeat state (count, direction, cooldowns, active/busy flags)
 * - Pause before and after jumps for clarity and synchronization
 * - Resume playback post-jump
 * - Communicate repeat updates via WebSocket for multi-client sync
 * - Prevent retriggering with debounce and jumpCooldownUntil
 *
 * === Integration Notes ===
 * - `handleRepeatCue()` should be called when a cueRepeat_* element is triggered.
 * - The `repeatStateMap` must be shared if playback state is reset (e.g. on rewind).
 * - WebSocket sync broadcasts are triggered automatically inside `executeRepeatJump`.
 * - For client-side visual feedback, classes like "repeating" and "pulse" are toggled on elements.
 */

export const repeatStateMap = {}; // Tracks all active repeat states by cue ID

/**
 * Parses a cueRepeat_* ID into a repeat config object.
 */
export function parseRepeatCueId(rawCueId) {
  const cueId = rawCueId.trim();
  if (!cueId.startsWith("cueRepeat_")) return null;

  const base = cueId.slice("cueRepeat_".length);
  const repeat = {
    cueId,
    startId: null,
    endId: "self",
    count: null,
    isInfinite: false,
    resumeId: "self",
    direction: "f",
    action: null,
    hasUID: null,
  };

  const tokens = base.split("_");
  for (let i = 0; i < tokens.length; i += 2) {
    const tag = tokens[i];
    const val = tokens[i + 1];
    if (!val) continue;

    switch (tag) {
      case "s": repeat.startId = val; break;
      case "e": repeat.endId = val; break;
      case "x":
        if (val === "inf") {
          repeat.isInfinite = true;
          repeat.count = Infinity;
        } else {
          const n = parseInt(val, 10) - 1;
          if (!isNaN(n)) repeat.count = n;
        }
        break;
      case "r": repeat.resumeId = val; break;
      case "d": repeat.direction = val; break;
      case "a": repeat.action = val; break;
    }
  }

  if (!repeat.startId || (repeat.count === null && !repeat.isInfinite)) {
    console.warn(`[parseRepeatCueId] Invalid cueRepeat ID: ${cueId}`);
    return null;
  }

  return repeat;
}

/**
 * Handles jump logic during a repeat.
 */
export async function executeRepeatJump(repeat, cueId) {
  if (repeat.busy) {
    console.log(`[repeat] ⚠️ Already busy — skipping repeat for ${cueId}`);
    return;
  }

  repeat.busy = true;

  console.log(`[repeat] ⏸ Pausing before jump to ${repeat.startId}`);
  if (window.isPlaying) window.togglePlay?.();

  await new Promise(resolve => setTimeout(resolve, 1000));

  const jumpTarget = repeat.currentlyReversing ? repeat.endId : repeat.startId;
  const targetId = (jumpTarget === 'self') ? repeat.cueId : jumpTarget;

  console.log(`[repeat] 🔁 Jumping to ${targetId}`);
  window.jumpToCueId?.(targetId);

  repeat.ready = false;
  repeat.jumpCooldownUntil = Date.now() + 300;

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log(`[repeat] ▶️ Resuming playback after jump to ${targetId}`);
  if (!window.isPlaying) window.togglePlay?.();

  setTimeout(() => {
    repeat.ready = true;
    console.log(`[repeat] ✅ Jump complete for ${cueId}, ready for next repeat`);
  }, 300);

  repeat.busy = false;

  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    const safeRepeatData = { ...repeat };
    delete safeRepeatData.recovered;

    window.socket.send(JSON.stringify({
      type: "repeat_update",
      cueId,
      repeatData: safeRepeatData,
    }));
  }
}

/**
 * Initializes and launches a cueRepeat sequence.
 */
export async function handleRepeatCue(cueId) {
  const parsed = parseRepeatCueId(cueId);
  if (!parsed) return;

  console.log('[handleRepeatCue] 🎯 Detected cueRepeat:', parsed);

  document.getElementById("playhead")?.classList.add("repeating");
  document.getElementById("repeat-count-box")?.classList.remove("hidden");
  document.getElementById("repeat-count-box")?.classList.add("pulse");

  repeatStateMap[cueId] = {
    ...parsed,
    currentCount: 1,
    currentlyReversing: parsed.direction === 'r',
    active: true,
    directionMode: parsed.direction,
    lastTriggerTime: 0,
    ready: false,
    initialJumpDone: false,
    busy: false,
  };

  setTimeout(() => {
    repeatStateMap[cueId].ready = true;
  }, 0);

  await executeRepeatJump(repeatStateMap[cueId], cueId);
  repeatStateMap[cueId].initialJumpDone = true;
}

/**
 * handleRestoredRepeatState()
 *
 * Re-applies repeat state after reconnect or resume. This is typically called
 * after receiving a `repeat_state_map` from the server. It ensures that the
 * playback location and repeat logic are correctly re-initialized without
 * retriggering jumps unnecessarily.
 *
 * @param {Object} repeatStateMap - The map of cueId → repeat config
 * @param {Array} cues - The full list of cue objects
 */
export function handleRestoredRepeatState(repeatStateMap, cues) {
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
        const playheadCenter = window.playheadX + (window.scoreContainer.offsetWidth / 2);
        const inRange = playheadCenter >= startCue.x && playheadCenter <= endCue.x + endCue.width;

        if (inRange) {
          console.log(`[CLIENT] 🧭 Already inside repeat range for ${cueId}. Skipping jump.`);

          repeat.initialJumpDone = true;
          repeat.ready = true;

          if (!repeat.recovered) {
            repeat.currentCount = (repeat.currentCount || 0) + 1;
          } else {
            delete repeat.recovered;
          }

          repeat.recovered = true;
          window.jumpToCueId?.(repeat.startId);

          repeatStateMap[cueId] = repeat;

          window.updateRepeatCountDisplay?.(repeat.currentCount + 1);
          document.getElementById("repeat-count-box")?.classList.remove("hidden");
          document.getElementById("repeat-count-box")?.classList.add("pulse");
          document.getElementById("playhead")?.classList.add("repeating");

        } else {
          console.log(`[CLIENT] 🔁 Outside repeat range — jumping to start for ${cueId}.`);

          repeat.ready = false;
          repeat.initialJumpDone = true;
          repeatStateMap[cueId] = repeat;

          window.executeRepeatJump?.(repeat, cueId).then(() => {
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
 * Also walks the entire SVG tree to catch other cue(...) elements.
 */
export function assignCues(svgRoot, cuesArray = []) {
  console.group("[assignCues]");
  // console.log("[assignCues] → svgRoot:", svgRoot?.id);


  // Count children for basic sanity
  // console.log("[assignCues] Child element count:", svgRoot.querySelectorAll("*").length);

  // ----------------------------------------------------
  // Handle assignCues(...) groups (unchanged logic)
  // ----------------------------------------------------
  const cueGroups = svgRoot.querySelectorAll('g[id^="assignCues("]');
  // console.log(`[assignCues] assignCues() groups found: ${cueGroups.length}`);

  cueGroups.forEach(group => {
    const baseId = group.id.split('-')[0];
    // console.log(`[assignCues] → Processing assignCues group id="${group.id}" (baseId="${baseId}")`);

    const match = baseId.match(/^assignCues\((.+)\)$/);
    if (!match) {
      // console.warn(`[assignCues] ⚠ Bad assignCues() block id="${group.id}"`);
      return;
    }
    const instruction = match[1].trim();
    // console.log(`[assignCues] assignCues() instruction:`, instruction);
    // … your original assignCues instruction logic …
  });

  // ----------------------------------------------------
  // Walk SVG to register cues & button() elements
  // ----------------------------------------------------


  function walk(node) {

    for (const child of node.children) {
      const id = child.id;

      // no id or no cue syntax → dive deeper
      if (!id || !/[()]/.test(id)) {
        walk(child);
        continue;
      }

      // --- 🔥 Ignore reuse(...) clones entirely ---
      if (/^reuse\s*\(/.test(id)) {
        // console.log(`[assignCues] ⏭ Ignoring reuse() clone id="${id}"`);
        walk(child);
        continue;
      }
      // --------------------------------------------------------
      // Skip propagate(...) because it's NOT a cue — it's a generator
      // --------------------------------------------------------
      if (/^propagate\(/.test(id.trim())) {
        // console.log("[assignCues] ⏭ Skipping propagate():", id);
        walk(child);
        continue;
      }

      let ast = null;
      try {
        ast = parseCueToAST(id.trim());
      } catch (e) {
        // console.warn("[assignCues] parse failed for:", id);
        walk(child);
        continue;
      }

      // Skip non-cue directives like use(...), propagate(...), comments, or anything that returns null
      if (!ast) {
        walk(child);
        continue;
      }

      // Skip cue buttons — they are built elsewhere
      if (ast.type === "cueButton") {
        walk(child);
        continue;
      }

      // Normal cue (including scale, rotate, o2p, etc.)
      const box = child.getBBox?.();
      cuesArray.push({
        id,
        ast,
        element: child,
        triggered: false,
        ...(box && { x: box.x, width: box.width })
      });
      registerCueUid(id, "walk");

      walk(child);
    }
  }

  // console.log("[assignCues] 🌳 Starting deep walk...");
  walk(svgRoot, 0);

  // console.log("[assignCues] Total cues registered:", cuesArray.length);

  // --------------------------------------------------------
  // BUILD CUE BUTTONS — PAGE vs SCROLL MODE
  // --------------------------------------------------------
  if (window.isPageOverlay) {
    // ------------------------------
    // PAGE OVERLAY MODE (correct!)
    // ------------------------------
    // console.log("[assignCues] Page overlay mode — building cueButtons inside overlay SVG.");

    const result = buildCueButtonsIn(svgRoot, svgRoot);
    // console.log(`[assignCues] cueButtons created in page overlay: ${result?.length}`);

  } else {
    // ------------------------------
    // SCROLL MODE
    // ------------------------------
    // console.log("[assignCues] Scroll-mode detected. Page overlay? ", window.isPageOverlay);

    const scrollContainer = document.getElementById("scoreInner");
    // console.log("[assignCues] scrollContainer:", scrollContainer);

    if (scrollContainer) {
      // console.log("[assignCues] 🛠 Building cueButtons in #scoreInner…");
      const result = buildCueButtonsIn(svgRoot, scrollContainer);
      // console.log(`[assignCues] cueButtons created: ${result?.length}`);
    } else {
      // console.warn("[assignCues] ⚠ scrollContainer not found — no cueButtons built in scroll mode.");
    }
  }

  console.groupEnd();
  return cuesArray;

}



// ==================================
// 🚶 cueTraverse (c-t) Cue Handling
// ==================================

/**
 * Parses a cueTraverse-style ID and extracts the object ID and trigger flag.
 * @param {string} cueId - The cue ID (e.g. "cueTraverse_o(obj123)_t(1)")
 * @returns {Object|null} config - Parsed result with objId and triggerable
 */
export function parseTraverseCueId(cueId) {
  const params = { cueId, objId: null, triggerable: false };

  const objMatch = cueId.match(/[_-]o\\(([^)]+)\\)/);
  if (objMatch) params.objId = objMatch[1];

  const triggerMatch = cueId.match(/[_-]t\\(([^)]+)\\)/);
  if (triggerMatch) params.triggerable = triggerMatch[1] === "1";

  return params.objId ? params : null;
}

/**
 * Starts animation for a cueTraverse (c-t) cue.
 * Looks up an object by objId, reads its data-id, and triggers animation if _t(1).
 * Animation is triggered using the data-id as the key in all pending*Animations maps.
 * @param {Object} config - Parsed traverse config with objId and triggerable flag
 */
export function startTraverseAnimation(config) {
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

  // 🔁 Look up in animation registry (if any)
  const pending =
    window.pendingScaleAnimations?.get(dataId) ||
    window.pendingScaleAnimations?.get(config.objId); // fallback

  if (pending) {
    console.log(`[startTraverseAnimation] ✅ Triggering deferred animation for data-id: ${dataId}`);
    pending();  // ✅ Call the stored function
    console.log(`[scale:_t] 🔴 timeline.play() called for ${dataId}`);
  } else {
    console.warn(`[startTraverseAnimation] ⚠️ No pending animation found for data-id: ${dataId}`);
  }
}

/**
 * Main cue handler for cueTraverse (c-t) cues.
 * @param {string} cueId - Full cue ID from score
 */

export async function handleTraverseCue(cueId) {
  const config = parseTraverseCueId(cueId);
  if (!config) return;

  console.log("[handleTraverseCue] 🚶 Triggered cueTraverse:", config);

  startTraverseAnimation(config);
}




export function handleStopCue(ast) {
  console.log("[cueStop] Triggered:", ast);
  /* Ignore the next sync broadcast — it's our own jump being echoed */
  window.ignoreNextSync = true;

  /*  Prevent server from overriding our new position for a short window */
  window.recentlyRecalculatedPlayhead = true;
  setTimeout(() => { window.recentlyRecalculatedPlayhead = false; }, 500);

  // Toggle playback:
  if (window.isPlaying) {
    window.pausePlayback();
  } else {
    window.startPlayback();
  }

  // Optional chaining: stop(next:nav(B))
  if (ast.next) {
    console.log(`[cueStop] Scheduling next cue: ${ast.next}`);
    setTimeout(() => {
      handleCueTrigger(ast.next, false, true);
    }, 50);
  }
}



// =========================
// 🎬 cueChoice Handler Logic
// =========================

/**
 * Handles cue selection by displaying available animation choices.
 * Extracts animation files and durations dynamically from the cue ID.
 * Ensures score playback pauses when cue choices appear.
 * Applies UI changes, including background blur and animation previews.
 * Allows users to select an animation, triggering enlargement and playback.
 * Cleans up and restores UI after a selection is made.
 */
export function handleCueChoice(cueId) {
  console.log(`[DEBUG] Handling cue choice: ${cueId}`);

  setTimeout(() => {
    const gridContainer = document.getElementById("cue-choice-container");
    const header = document.getElementById("cue-choice-header");

    if (!gridContainer || !header) {
      console.error("[ERROR] cue-choice-container or header not found in HTML.");
      return;
    }

    // ✅ Restore visibility
    gridContainer.classList.remove("hidden");
    gridContainer.style.display = "flex";
    header.classList.remove("hidden");

    // ✅ Extract animation files and durations dynamically
    const animations = parseCueChoiceVariants(cueId);
    if (!animations.length) {
      console.error("[DEBUG] No valid animations found in cue namespace.");
      return;
    }

    console.log("[DEBUG] `animations` at start:", animations);

    // ✅ Ensure score pauses when the cueChoice appears
    if (window.isPlaying) {
      console.log('[DEBUG] Pausing score for cue choice.');
      window.isPlaying = false;
      window.isMusicalPause = true;

      window.stopAnimation?.();

      if (window.wsEnabled && window.socket) {
        const msg = JSON.stringify({ type: "pause", playheadX: window.playheadX, elapsedTime: window.elapsedTime });
        window.socket.send(msg);
        console.log(`[DEBUG] Sent pause message to server. Elapsed Time: ${window.elapsedTime}`);
      }
    } else {
      console.warn("[DEBUG] Score was already paused.");
    }

    // ✅ Blur all other elements except the choice grid
    document.body.querySelectorAll(':scope > *').forEach((el) => {
      if (el.id !== 'cue-choice-container' && el.id !== 'controls') {
        el.classList.add('blur-background');
      }
    });

    // ✅ Populate choices dynamically with SVG thumbnails
    animations.forEach(({ choice, dur }) => {
      console.log(`[DEBUG] Loading animation: ${choice} (${dur}s)`);

      const div = document.createElement("div");
      div.classList.add("cue-choice-item");
      div.dataset.choice = choice;
      div.textContent = `${choice} (${dur}s)`;

      const svgThumbnail = document.createElement("object");
      svgThumbnail.type = "image/svg+xml";
      svgThumbnail.data = `scores/pages/${choice}.svg`;
      svgThumbnail.classList.add("cue-choice-thumbnail");

      svgThumbnail.onload = () => {
        console.log(`[DEBUG] Successfully loaded SVG thumbnail: ${choice}`);
      };

      svgThumbnail.onerror = () => {
        console.error(`[ERROR] Failed to load SVG thumbnail: ${choice}`);
      };

      div.appendChild(svgThumbnail);

      div.addEventListener("click", () => {
        console.log(`[DEBUG] Animation ${choice} clicked. Dismissing choice grid.`);
        dismissCueChoice();
        window.handleEnlargeAnimation?.(choice, dur);
      });

      gridContainer.appendChild(div);
    });

    console.log("[DEBUG] cue-choice-container and header restored with new choices.");
  }, 200);
}

/**
 * Helper to extract choices and durations from cue ID format
 * Format: cueChoice_[choice]_dur_[duration]_...
 */
export function parseCueChoiceVariants(cueId) {
  const cueParams = cueId.split('_').slice(2); // Skip 'cueChoice'
  const animations = [];
  let i = 0;

  console.log("[DEBUG] Raw cueParams:", cueParams);

  while (i < cueParams.length) {
    const param = cueParams[i];

    if (!param || param === "dur" || !isNaN(param)) {
      console.warn(`[DEBUG] Skipping invalid param: ${param}`);
      i++;
      continue;
    }

    const file = param;
    let duration = 30;

    if (i + 2 < cueParams.length && cueParams[i + 1] === "dur" && !isNaN(cueParams[i + 2])) {
      duration = parseInt(cueParams[i + 2], 10);
      i += 2;
    }

    animations.push({ choice: file, dur: duration });
    console.log(`[DEBUG] Added animation: ${file} with duration: ${duration}`);
    i++;
  }

  console.log('[DEBUG] Final extracted animations:', animations);
  return animations;
}

/**
 * Dismisses the cue choice grid and restores UI state.
 */
export function dismissCueChoice() {
  console.log("[DEBUG] Dismissing cue choice container.");

  const gridContainer = document.getElementById("cue-choice-container");
  if (gridContainer) {
    gridContainer.classList.add("hidden");
    const choices = gridContainer.querySelectorAll(".cue-choice-item");
    choices.forEach((choice) => choice.remove());
  }

  const header = document.getElementById("cue-choice-header");
  if (header) {
    header.classList.add("hidden");
  }

  // ✅ Remove all background blur classes
  document.body.querySelectorAll(".blur-background").forEach((el) => {
    el.classList.remove("blur-background");
  });

  console.log("[DEBUG] Cue choice dismissed and reset.");
}





export function handleCuePagePlaylist(cueId, expr) {
  // --- Detect mode cleanly
  const outerMatch = expr.match(/^(loop|seq|rand)\(([\s\S]*)\)$/);
  const mode = outerMatch ? outerMatch[1] : "seq";
  let inner = outerMatch ? outerMatch[2] : expr;

  // 🧹 Defensive cleanup: strip unmatched parentheses if any
  const lastParen = inner.lastIndexOf(")");
  if (lastParen === inner.length - 1) {
    inner = inner.slice(0, -1);
  }

  // --- Split only top-level commas (ignore commas inside rand())
  const parts = splitTopLevel(inner, ",");

  const items = parts
    .map(p => parseCueItem(p.trim()))
    .filter(Boolean);

  if (!items.length) {
    console.warn("[cuePage] ⚠️ No valid playlist items parsed:", expr);
    return;
  }

  console.log(`[cuePage] ✅ Parsed playlist items (${mode}):`, items);
  runCuePagePlaylist({ mode, items });
}


/* -----------------------------------------------------------
   Helper: splitTopLevel(str, delimiter)
   Splits by commas but ignores commas inside parentheses
------------------------------------------------------------ */
function splitTopLevel(str, delimiter = ",") {
  const result = [];
  let depth = 0;
  let current = "";

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === delimiter && depth === 0) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

/* -----------------------------------------------------------
   Helper: parseCueItem(str)
   Parses page expressions, e.g.:
   - page3:5
   - rand(page0,page1,page2):2
   - rand(page0:2,page1:4)
------------------------------------------------------------ */
function parseCueItem(str) {
  if (!str) return null;

  // Handle rand(...) group
  if (str.startsWith("rand(")) {
    // Extract inner content and possible duration
    const match = str.match(/^rand\((.*)\)(?::([\d.]+))?$/);
    if (!match) return null;

    const inner = match[1];
    const groupDur = match[2] ? parseFloat(match[2]) : 0;
    const pages = splitTopLevel(inner, ",").map(x => {
      const [page, durStr] = x.split(":").map(s => s.trim());
      const dur = durStr ? parseFloat(durStr) : 0;
      return { page, dur };
    });

    return { rand: pages, dur: groupDur };
  }

  // Handle plain page:dur
  const [page, durStr] = str.split(":").map(s => s.trim());
  const dur = durStr ? parseFloat(durStr) : 0;

  if (!page) {
    console.warn("[cuePage] ⚠️ Invalid entry:", str);
    return null;
  }

  return { page, dur };
}
async function runCuePagePlaylist({ mode, items, waitFlag = false, returnFlag = false }) {
  console.log(`[cuePage] ▶ Starting playlist in mode [${mode}] with ${items.length} items`);

  // --- Global flags
  window.isCuePagePlaylistActive = true;
  window.cuePagePlaylistTimer = null;

  // --- Create or reuse global page state
  if (!window.pageState)
    window.pageState = { mode: "scroll", current: null, next: null, countdown: null };

  const ps = window.pageState;

  // --- Pause scrolling score if active
  if (ps.mode === "scroll") {
    console.log("[cuePage] 🛑 Pausing scrolling score.");
    pauseScrollScore();
    ps.mode = "page";
    updateModeToggleUI();

  }

  let index = 0;
  const total = items.length;




  async function nextStep() {
    // 🧹 Safety check: playlist stopped or popup closed
    if (!window.isCuePagePlaylistActive) {
      console.log("[cuePage] 🛑 Playlist aborted before next step.");
      clearTimeout(window.cuePagePlaylistTimer);
      window.cuePagePlaylistTimer = null;
      return;
    }

    // 🧩 Select current item
    const item = items[index];
    if (!item) {
      console.warn("[cuePage] ⚠️ Missing playlist item, stopping.");
      stopPlaylist();
      return;
    }

    // 🧠 Resolve which page to load
    let nextPage = null;
    let dur = item.dur && item.dur > 0 ? item.dur : 10;

    if (item.page) {
      // normal page
      nextPage = item.page;
    } else if (item.rand && item.rand.length) {
      // random page selection
      const randChoice = item.rand[Math.floor(Math.random() * item.rand.length)];
      if (typeof randChoice === "string") {
        nextPage = randChoice;
      } else if (typeof randChoice === "object" && randChoice.page) {
        nextPage = randChoice.page;
        if (randChoice.dur && !isNaN(randChoice.dur)) dur = randChoice.dur;
      } else {
        console.warn("[cuePage] ⚠️ Invalid rand() entry:", randChoice);
      }
      console.log(`[cuePage] 🎲 Random choice: ${nextPage} (${dur}s)`);
    } else {
      console.warn("[cuePage] ⚠️ Empty playlist entry skipped:", item);
      advanceIndex();
      return nextStep();
    }

    if (!nextPage) {
      console.warn("[cuePage] ⚠️ No valid next page; skipping.");
      advanceIndex();
      return nextStep();
    }

    console.log(`[cuePage] ▶ ${nextPage} (${dur}s) [${mode}]`);
    handleCueTrigger(`cuePage(${nextPage})_dur(${dur})`, false, true);

    advanceIndex();

    // ⏳ Schedule next step unless waiting or stopped
    if (!window.isCuePagePlaylistActive) return;

    if (waitFlag) {
      console.log("[cuePage] ⏸ Waiting indefinitely (wait=1).");
      return; // don't schedule next step
    }

    window.cuePagePlaylistTimer = setTimeout(() => {
      if (window.isCuePagePlaylistActive) nextStep();
      else stopPlaylist();
    }, dur * 1000);
  }


  function advanceIndex() {
    if (mode === "seq") index++;
    else if (mode === "loop") index = (index + 1) % total;
    else if (mode === "rand") index = Math.floor(Math.random() * total);

    // --- If we reached the end of a non-loop sequence
    if (index >= total && mode !== "loop") {
      console.log("[cuePage] ▶ Playlist finished.");
      stopPlaylist();
    }
  }

  function stopPlaylist() {
    clearTimeout(window.cuePagePlaylistTimer);
    window.cuePagePlaylistTimer = null;
    window.isCuePagePlaylistActive = false;

    // --- Resume scrolling if requested
    if (returnFlag) {
      console.log("[cuePage] ✅ Playlist completed — returning to scrolling score.");
      stopAllCueTexts();
      ps.mode = "scroll";
      updateModeToggleUI();
      ps.current = null;
      resumeScrollScore();
    } else {
      console.log("[cuePage] ⏹ Playlist stopped; holding current page.");
      ps.mode = "page";
      updateModeToggleUI();

    }
  }

  // 🚀 Start first step
  nextStep();
}






import { getStopwatchTime } from "./stopwatch.js";

export function handleStopwatchCue(ast, cueElement = null) {
  // 1️⃣ Extract parameters
  const params = {};
  for (const p of ast.args || []) params[p.type] = p.value;

  const hold = Number(params.hold || 0);
  const followScroll = params.scroll === true || params.scroll === "true";
  const offsetX = Number(params.offsetX || 0);
  const sourceType = params.source || "main";
  const styleString = params.style ? params.style.replace(/^['"]|['"]$/g, "") : null;

  console.log("[cueStopwatch] Params →", params, "→ source:", sourceType);

  // 2️⃣ Get container + target
  const score = document.getElementById("scoreContainer");
  if (!score) return console.warn("[cueStopwatch] No score container found.");
  if (!cueElement) return console.warn("[cueStopwatch] No cueElement provided.");

  // 3️⃣ Bounding boxes
  const bbox = cueElement.getBoundingClientRect();
  const containerBox = score.getBoundingClientRect();
  const scrollX = score.scrollLeft || 0;
  const scrollY = score.scrollTop || 0;

  const x = (followScroll
    ? bbox.left - containerBox.left + scrollX
    : bbox.left) + offsetX;
  const y = (followScroll
    ? bbox.top - containerBox.top + scrollY - 10
    : bbox.top - 10);

  // 4️⃣ Choose / create the overlay
  const divId = `cue-stopwatch-${sourceType}`;
  let div = document.getElementById(divId);
  let startTime = Date.now();
  let intervalId;

  if (div) {
    // already exists → reuse
    console.log(`[cueStopwatch] Reusing existing ${divId}, resetting timer`);
    div.textContent = "00:00";
    div.style.opacity = "1";
    div.style.transition = "none";
    startTime = Date.now(); // reset
    // clear any prior interval marker
    if (div._intervalId) clearInterval(div._intervalId);
  } else {
    // create new overlay
    div = document.createElement("div");
    div.id = divId;
    div.className = "cue-stopwatch-display";
    div.style.position = followScroll ? "absolute" : "fixed";
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.style.transform = "translate(0%, -100%)";

    if (styleString) {
      styleString.split(";").forEach(rule => {
        const [prop, val] = rule.split(":").map(s => s && s.trim());
        if (prop && val) div.style[prop] = val;
      });
    }

    if (followScroll) score.appendChild(div);
    else document.body.appendChild(div);
  }

  // 5️⃣ Timer logic
  if (sourceType === "main") {
    div.textContent = getStopwatchTime();
    intervalId = setInterval(() => {
      div.textContent = getStopwatchTime();
      if (followScroll) {
        const b = cueElement.getBoundingClientRect();
        const sx = score.scrollLeft || 0;
        const sy = score.scrollTop || 0;
        div.style.left = `${b.left - containerBox.left + sx + offsetX}px`;
        div.style.top = `${b.top - containerBox.top + sy - 10}px`;
      }
    }, 1000);
  } else if (sourceType === "new") {
    intervalId = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const m = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const s = String(elapsed % 60).padStart(2, "0");
      div.textContent = `${m}:${s}`;
    }, 1000);

    if (!hold) {
      div.style.cursor = "pointer";
      div.onclick = () => {
        clearInterval(intervalId);
        div.remove();
      };
    }
  }

  // store interval for reuse clearing
  div._intervalId = intervalId;

  // 6️⃣ Auto-fade if hold > 0
  if (hold > 0) {
    setTimeout(() => {
      clearInterval(intervalId);
      div.style.transition = "opacity 1s ease";
      div.style.opacity = "0";
      setTimeout(() => div.remove(), 1000);
    }, hold * 1000);
  }

  console.log(
    `[cue:stopwatch] ⏱ source=${sourceType}, hold=${hold}s, scroll=${followScroll}, offsetX=${offsetX}`
  );
}



window.returnToScrollingScore = function returnToScrollingScore() {

  console.log("[cuePage] Returning to scrolling score.");
  stopAllCueTexts();

  const container = document.getElementById("singlePage-container");
  const content = document.getElementById("singlePage-content");
  const mainScore = document.getElementById("scoreInner");
  const ps = window.pageState || (window.pageState = { mode: "scroll", current: null });

  if (!container || !content) {
    console.warn("[cuePage] ⚠️ No page overlay present — just resuming scroll.");
    ps.mode = "scroll";
    updateModeToggleUI();

    ps.current = null;
    resumeScrollScore?.();
    return;
  }

  container.style.transition = "opacity 0.5s ease";
  container.style.opacity = "0";

  setTimeout(() => {
    // ✅ Remove any leftover cue buttons safely
    window._activePageButtons?.forEach(btn => btn._destroyCueButton?.());
    window._activePageButtons = [];

    container.style.display = "none";
    content.innerHTML = "";

    ps.mode = "scroll";
    updateModeToggleUI();

    ps.current = null;

    if (mainScore) {
      mainScore.style.opacity = "1";
      mainScore.style.pointerEvents = "auto";
    }

    resumeScrollScore?.();
  }, 500);
};




/**
 * pauseScrollScore() / resumeScrollScore()
 * ----------------------------------------
 * Encapsulate your pause/resume logic.
 */
function pauseScrollScore() {
  window.isPlaying = false;
  window.isMusicalPause = true;
  window.stopAnimation?.();

  const socket = window.socket;
  if (window.wsEnabled && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(
      JSON.stringify({
        type: "pause",
        playheadX: window.playheadX,
        elapsedTime: window.elapsedTime,
      })
    );
  }
}

function resumeScrollScore() {
  console.log(" Resuming scrolling score...");

  // ✅ If we arrived here from nav(mode:scrollPaused@X)
  if (window._resumeAfterJump === false) {
    console.log(" ⏸ Staying paused after jump (scrollPaused mode).");

    // Ensure playback remains paused
    window.isPlaying = false;
    window.animationPaused = true;
    window.isMusicalPause = true;

    // Ensure remote sync does NOT resume playback
    window.ignoreNextSync = true;

    // Ensure stopwatch is paused
    window.pauseStopwatch?.();

    // ✅ Reset so next resumeScrollScore() isn't blocked
    window._resumeAfterJump = null;
    return;
  }

  // ✅ Normal resume (mode(scroll) or general resume)
  window.ignoreNextSync = true;
  window.isPlaying = true;
  window.isMusicalPause = false;

  if (typeof window.resumePlayback === "function") {
    window.resumePlayback();
  } else if (typeof window.startPlayback === "function") {
    window.startPlayback();
  }

  window.startStopwatch?.();
  
if (resumeReason === "scroll-mode-switch") {
    window.lastSyncTime = performance.now();
    window.lastElapsedTime = window.elapsedTime ?? 0;
}

  const socket = window.socket;
  if (window.wsEnabled && socket?.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({
      type: "play",
      playheadX: window.playheadX,
      elapsedTime: window.elapsedTime,
    }));
  }

  // ✅ Reset flag so future scroll resumes behave normally
  window._resumeAfterJump = null;

  console.log("▶ Scroll resume complete.");
}



/**
 * handleOscCue(cueId, cueParams = {})
 *
 * Sends OSC messages from cue IDs of the form cueOsc*, supporting the following subtypes:
 *
 * Supported Types:
 *   - cueOscTrigger(value) → Sends a single numeric trigger
 *   - cueOscValue(value)   → Sends a named value
 *   - cueOscSet(key, value) → Sends a key-value object
 *   - cueOscRandom(min, max) → Sends a min/max pair for random value generation
 *   - cueOscBurst(count, interval) → Sends repeated messages over time
 *   - cueOscPulse(rate, duration) → Sends messages at a rate for a fixed time
 *
 * Optional OSC Address Override:
 *   Append `_addr(custom/osc/path)` to override the default path.
 *
 * Example:
 *   cueOscTrigger(1)_addr(/my/osc/path)
 */
export function handleOscCue(cueId, cueParams = {}) {
  const type = cueId.split('(')[0]; // e.g., cueOscTrigger
  const subType = type.replace(/^cueOsc/, "").toLowerCase(); // "trigger", "burst", etc.

  // 🔍 Extract optional OSC address override
  const addrMatch = cueId.match(/_addr\\(([^)]+)\\)/);
  const oscAddr = addrMatch ? addrMatch[1] : "/oscilla";

  const baseMessage = {
    type: "osc",
    subType,
    address: oscAddr,
    timestamp: Date.now()
  };

  console.log(`[cueOsc] ⚡ Handling subtype: ${subType} → ${oscAddr}`);

  switch (subType) {
    case "trigger":
    case "value": {
      const value = parseFloat(cueParams.choice ?? cueParams.value);
      if (isNaN(value)) {
        console.warn("[cueOsc] ❌ Missing or invalid value:", cueId);
        return;
      }
      baseMessage.data = value;
      window.socket?.send(JSON.stringify(baseMessage));
      console.log(`[cueOsc] 🔹 Sent value: ${value}`);
      break;
    }

    case "set": {
      const [key, val] = Object.entries(cueParams)[0] || [];
      if (!key || val === undefined) {
        console.warn("[cueOsc] ❌ Invalid set params:", cueParams);
        return;
      }
      baseMessage.data = { [key]: val };
      window.socket?.send(JSON.stringify(baseMessage));
      console.log(`[cueOsc] 🔹 Sent set: ${key} = ${val}`);
      break;
    }

    case "random": {
      const min = parseFloat(cueParams.min);
      const max = parseFloat(cueParams.max);
      if (isNaN(min) || isNaN(max)) {
        console.warn("[cueOsc] ❌ Invalid random range:", cueParams);
        return;
      }
      baseMessage.data = { min, max };
      window.socket?.send(JSON.stringify(baseMessage));
      console.log(`[cueOsc] 🔹 Sent random range: min=${min}, max=${max}`);
      break;
    }

    case "burst": {
      const count = parseInt(cueParams.count ?? cueParams.choice);
      const interval = parseInt(cueParams.interval ?? 100);
      if (!count || isNaN(interval)) {
        console.warn("[cueOsc] ❌ Invalid burst params:", cueParams);
        return;
      }
      console.log(`[cueOsc] 🔁 Sending burst: ${count} messages every ${interval}ms`);
      let sent = 0;
      const burstTimer = setInterval(() => {
        if (sent >= count) return clearInterval(burstTimer);
        window.socket?.send(JSON.stringify({ ...baseMessage }));
        sent++;
      }, interval);
      break;
    }

    case "pulse": {
      const rate = parseFloat(cueParams.rate);
      const duration = parseFloat(cueParams.duration);
      if (!rate || !duration) {
        console.warn("[cueOsc] ❌ Invalid pulse params:", cueParams);
        return;
      }
      const interval = 1000 / rate;
      const total = Math.floor(duration * rate);
      let sent = 0;
      console.log(`[cueOsc] 🌀 Sending pulse: ${total} messages at ${rate}Hz for ${duration}s`);
      const pulseTimer = setInterval(() => {
        if (sent >= total) return clearInterval(pulseTimer);
        window.socket?.send(JSON.stringify({ ...baseMessage }));
        sent++;
      }, interval);
      break;
    }

    default:
      console.warn("[cueOsc] ⚠️ Unsupported subType:", subType);
      break;
  }
}



export function resetTriggeredCues() {
  if (window.triggeredCues)
    window.triggeredCues.clear();
  window._cueInsideState?.clear();
}


// window.getPlayheadX = function () {
//   const playhead = document.getElementById("playhead");
//   const scoreContainer = window.scoreContainer;
//   if (!playhead || !scoreContainer) return null;

//   const containerRect = scoreContainer.getBoundingClientRect();
//   const playheadRect = playhead.getBoundingClientRect();
//   return playheadRect.left - containerRect.left;
// };


// -------------------- Cue Utilities --------------------
/**
 * checkCueTriggers()
 *
 * Called on each animation frame to evaluate whether the scrolling playhead intersects
 * with any cue elements. Triggers cue actions using `handleCueTrigger()` and manages
 * repeat cue logic (via `repeatStateMap` and `executeRepeatJump()`).
 *
 * Supports:
 * - Single-shot cue triggering (via `triggeredCues`)
 * - Repeat loops with entry/exit markers
 * - Cooldown suppression after jump events to avoid double triggers
 * - Manual playback stop or resume via cueRepeat_* directives
 */
export async function checkCueTriggers() {
  // 🔒 Global cue suppression guard (jumping, scrubbing, loading, etc.)
  if (window.suppressCueTriggers) return;

  // ✅ Ensure cues are ready
  if (!Array.isArray(window.cues)) return;

  // ✅ Sync elapsed time based on current scroll position
  window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;

  // 🛑 Skip cue checks if paused, seeking, or not playing
  if (window.isSeeking || window.animationPaused || !window.isPlaying) return;

  const playheadX = window.getPlayheadX();
  if (playheadX === null) {
    console.warn("[checkCueTriggers] Could not determine playhead x position.");
    return;
  }

  // We track cue-left positions across frames (since the playhead is fixed)
  if (!window._prevCueLefts) window._prevCueLefts = new Map();
  if (!window._cueInsideState) window._cueInsideState = new Map();
  if (!window.triggeredCues) window.triggeredCues = new Set();

  const tolerance = 8; // px (tweak 5–10)
  
  const containerRect = window.scoreContainer.getBoundingClientRect();

  for (const cue of window.cues) {
    if (!cue?.element) continue;

    const cueRect = cue.element.getBoundingClientRect();
    const cueLeft = cueRect.left - containerRect.left;
    const cueRight = cueLeft + cueRect.width;

    const prevLeft = window._prevCueLefts.has(cue.id)
      ? window._prevCueLefts.get(cue.id)
      : undefined;

    const wasInside = window._cueInsideState.get(cue.id) || false;
    const isInside = playheadX >= cueLeft && playheadX <= cueRight;

    // Initialize previous left on first sight (prevents start/resume/seek retriggers)
    if (prevLeft === undefined) {
      window._prevCueLefts.set(cue.id, cueLeft);
      window._cueInsideState.set(cue.id, isInside);
      continue;
    }

    // Forward scroll = cues move LEFT (cueLeft decreases)
    const movingForward = cueLeft < prevLeft;

    // Trigger when the LEFT edge crosses the playhead from right -> left (with tolerance)
    const crossedLeftEdgeForward =
      movingForward &&
      prevLeft > (playheadX + tolerance) &&
      cueLeft <= (playheadX + tolerance);

    if (crossedLeftEdgeForward && !window.triggeredCues.has(cue.id)) {
      console.log(`[cueTrigger] ✅ Left-edge crossing → ${cue.id}`);
      handleCueTrigger(
        cue.ast,       // ✅ the real cue data for scroll-triggered cues
        false,         // isRemote
        true,          // force
        cue.element    // ✅ so UI flashes work later
      );
      window.triggeredCues.add(cue.id);
    }

    // Update per-cue state for next frame
    window._prevCueLefts.set(cue.id, cueLeft);
    window._cueInsideState.set(cue.id, isInside);

    // 🔁 Repeat logic — unchanged from your working version
    for (const [repeatCueId, repeat] of Object.entries(window.repeatStateMap || {})) {
      if (!repeat.active || !repeat.ready || !repeat.initialJumpDone) continue;

      let isAtRepeatEnd = false;

      if (repeat.endId === 'self') {
        const repeatCue = window.cues.find(c => c.id === repeat.cueId || c.id.startsWith(`${repeat.cueId}-`));
        if (repeatCue?.element) {
          const repeatRect = repeatCue.element.getBoundingClientRect();
          const repeatX = repeatRect.left - containerRect.left;
          const repeatEnd = repeatX + (repeatRect.width || 40);
          isAtRepeatEnd = playheadX >= repeatX && playheadX <= repeatEnd;
        }
      } else if (cue.id === repeat.endId || cue.id.startsWith(`${repeat.endId}-`)) {
        isAtRepeatEnd = true;
      }

      const now = Date.now();
      if (repeat.jumpCooldownUntil && now < repeat.jumpCooldownUntil) {
        console.log(`[repeat] ⏳ Cooldown active for ${repeatCueId}`);
        continue;
      }

      if (isAtRepeatEnd) {
        const cooldown = 500;
        if (now - repeat.lastTriggerTime < cooldown) continue;

        repeat.lastTriggerTime = now;
        repeat.currentCount++;
        window.updateRepeatCountDisplay?.(repeat.currentCount);

        console.log(`[repeat] Reached end (${repeat.endId}) for ${repeatCueId} → count: ${repeat.currentCount}`);

        if (repeat.isInfinite || repeat.currentCount < repeat.count) {
          if (repeat.directionMode === 'p') {
            repeat.currentlyReversing = !repeat.currentlyReversing;
          }

          console.log(`[repeat] Executing repeat jump for ${repeatCueId}`);
          try {
            await window.executeRepeatJump?.(repeat, repeatCueId);
          } catch (err) {
            console.error(`[repeat] ❌ Error during repeat jump (${repeatCueId}):`, err);
          }
        } else {
          repeat.active = false;
          window.hideRepeatCountDisplay?.();

          if (repeat.action === 'stop') {
            console.log(`[repeat] Repeat complete → stopping playback.`);
            window.stopAnimation?.();
            window.isPlaying = false;
            window.isMusicalPause = true;
            window.togglePlayButton?.();
          } else if (repeat.resumeId && repeat.resumeId !== 'self') {
            console.log(`[repeat] Repeat complete → jumping to ${repeat.resumeId}`);
            window.jumpToCueId?.(repeat.resumeId);
            window.isPlaying ? window.pausePlayback() : window.startPlayback();
          } else {
            console.log(`[repeat] Repeat complete → staying at current location.`);
          }
        }

        break; // 🛑 Prevent multiple repeat triggers in one frame
      }
    }
  }
}


window.resetCueEdgeTracking = function () {
  window._prevCueLefts = new Map();
  window._cueInsideState = new Map();
  window.triggeredCues = new Set();
};






export function parseCueLegacy(cueId) {
  // Extract cue type (e.g. cuePage, cueAudio, etc.)
  const typeMatch = cueId.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
  const type = typeMatch ? typeMatch[1] : null;
  if (!type) return { type: cueId, cueParams: {}, cleanedId: cueId };

  const cueParams = {};
  let rest = cueId.slice(type.length);

  // --- 🧠 Extract first parenthetical block safely (choice)
  if (rest.startsWith("(")) {
    let depth = 0;
    let endIndex = -1;
    for (let i = 0; i < rest.length; i++) {
      const ch = rest[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }

    if (endIndex !== -1) {
      const inner = rest.slice(1, endIndex); // everything between ( ... )
      cueParams.choice = isNaN(inner) ? inner.trim() : parseFloat(inner);
      rest = rest.slice(endIndex + 1); // ✅ keep suffix intact (e.g. _wait(20)_next(page3))
    }
  }

  // --- ✅ Parse all suffixes, multiline-safe
  const regex = /_([a-zA-Z0-9]+)\(([\s\S]*?)\)/g;
  let match;
  while ((match = regex.exec(rest)) !== null) {
    const [, key, value] = match;

    if (key === "style") {
      const rawStyle = match[2];
      const kvRegex = /([\w-]+)\s*:\s*(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|rgba?\([^)]*\)|[^,]+))/g;
      const obj = {};
      let m;
      while ((m = kvRegex.exec(rawStyle)) !== null) {
        const kRaw = m[1].trim().toLowerCase();
        let vRaw = m[2].trim().replace(/^["']|["']$/g, "");
        if (!/^rgba?\(/i.test(vRaw) && !isNaN(vRaw) && vRaw !== "") vRaw = parseFloat(vRaw);
        obj[kRaw] = vRaw;
      }
      cueParams.style = obj;
    } else {
      // 🔧 Handle numbers and strings
      cueParams[key] = isNaN(value) ? value.trim() : parseFloat(value);
    }
  }

  return { type, cueParams, cleanedId: cueId };
}


function parseKeyValueParams(str, cueParams) {
  const regex = /_([a-zA-Z0-9]+)\(([^)]+)\)/g;
  let m;
  while ((m = regex.exec(str)) !== null) {
    const [, key, value] = m;
    cueParams[key] = isNaN(value) ? value : parseFloat(value);
  }
}


if (window.triggeredCues)
  window.triggeredCues.clear();
window._cueInsideState?.clear();








/**
 * handleSeqCue(cueId, cueParams)
 * ------------------------------
 * Sequences existing cues (#ids or UIDs) one after another.
 * Supports overlaps, waits, and parallel cues.
 *
 * Example:
 * cueSeq(#a1, #t2:+2, wait(1), #p3:-1)
 */
/**
 * handleSeqCue(cueSeq)
 * --------------------
 * Sequences multiple cues (by UID or expression).
 * Supports waits, random choice, offsets, looping, and parallel cues.
 */
export async function handleSeqCue(cueId, cueParams = {}) {
  try {
    console.log("[handleSeqCue] called:", cueId, cueParams);

    const { choice, loop = 1, speed = 1, next = null } = cueParams;
    if (!choice) return console.warn("[cueSeq] Missing sequence list");

    const steps = parseCueSeqList(choice);
    if (!steps.length) return console.warn("[cueSeq] No valid steps parsed");

    console.log("[cueSeq] ▶ Parsed sequence:", steps);

    // A safety flag to stop sequence early (e.g., on user stop)
    window._seqAbort = false;

    // 🌀 Main loop over sequence passes
    for (let round = 0; loop <= 0 || round < loop; round++) {
      console.log(`[cueSeq] 🔁 Sequence pass ${round + 1}`);

      for (const step of steps) {
        if (window._seqAbort) {
          console.warn("[cueSeq] ⚠️ Sequence aborted.");
          return;
        }

        // 💤 WAIT step
        if (step.type === "wait") {
          console.log(`[cueSeq] ⏱️ Waiting ${step.value}s`);
          await delay(step.value * 1000 / speed);
          continue;
        }

        // 🎲 RANDOM CHOICE
        if (step.type === "choose") {
          const pick = step.options[Math.floor(Math.random() * step.options.length)];
          console.log(`[cueSeq] 🎲 Random choice → ${pick}`);
          await triggerCueByRef(pick);
          continue;
        }

        // 🎬 NORMAL CUE STEP
        if (step.type === "cue") {
          console.log(`[cueSeq] 🎬 Trigger cue ${step.target} (offset ${step.offset}s)`);

          // Offset <0 = overlap (start before previous cue ends)
          if (step.offset < 0) {
            triggerCueByRef(step.target);
            await delay(Math.abs(step.offset * 1000 / speed));
          }
          // Offset >0 = delay start
          else if (step.offset > 0) {
            await delay(step.offset * 1000 / speed);
            triggerCueByRef(step.target);
          }
          // Offset = 0 = immediate / parallel start
          else {
            triggerCueByRef(step.target);
          }

          // Only wait for completion if not parallel (":0" or step.parallel flag)
          if (!step.parallel) {
            console.log(`[cueSeq] 🕒 Waiting for ${step.target} to complete`);
            await waitForCueCompletion(step.target);
          } else {
            console.log(`[cueSeq] ⚡ Parallel cue, continuing immediately`);
          }
        }
      }
    }

    console.log("[cueSeq] ✅ Sequence complete.");
    if (next) triggerCueById(next);

  } catch (err) {
    console.error("[cueSeq] Error:", err);
  }
}

function waitForCueCompletion(targetId, timeout = 60000) {
  return new Promise(resolve => {
    const listener = (ev) => {
      const { id, type } = ev.detail || {};
      if (!id) return;
      // Match either by UID, filename, or partial
      if (id.includes(targetId) || targetId.includes(id)) {
        console.log(`[waitForCueCompletion] ✅ ${id} (${type}) completed`);
        window.removeEventListener("oscilla:cueComplete", listener);
        resolve();
      }
    };
    window.addEventListener("oscilla:cueComplete", listener);
    setTimeout(() => {
      window.removeEventListener("oscilla:cueComplete", listener);
      console.warn(`[waitForCueCompletion] ⚠️ Timeout waiting for ${targetId}`);
      resolve();
    }, timeout);
  });
}


/**
 * parseCueSeqList()
 * -----------------
 * Parses the inner contents of cueSeq(...), e.g. "#a1, wait(2), #b1:+1"
 */
function parseCueSeqList(str) {
  if (!str) return [];
  str = str.replace(/^cueSeq\(/i, "").replace(/\)$/, "").trim();

  const parts = splitTopLevel(str, ",");
  const steps = [];

  for (let raw of parts) {
    raw = raw.trim();
    if (!raw) continue;

    if (/^wait\(/i.test(raw)) {
      const val = parseFloat(raw.match(/\(([^)]+)\)/)?.[1]) || 0;
      steps.push({ type: "wait", value: val });
    } else if (/^choose\[/i.test(raw)) {
      const inner = raw.replace(/^choose\[/i, "").replace(/\]$/, "");
      const style = splitTopLevel(inner, ",").map(s => s.trim());
      steps.push({ type: "choose", options: style });
    } else {
      // Regular cue reference, possibly with offset (:N)
      const match = raw.match(/^(#?[A-Za-z0-9_\-]+)(?::([+\-]?\d+(\.\d+)?))?$/);
      if (match) {
        const target = match[1];
        const offset = parseFloat(match[2]) || 0;
        const parallel = match[2] === "0";
        steps.push({ type: "cue", target, offset, parallel });
      }
    }
  }

  return steps;
}

/**
 * triggerCueByRef(target)
 * -----------------------
 * Resolves and triggers an existing cue by id or UID reference.
 */
// 🔍 Trigger cue by UID or element reference
export function triggerCueByRef(ref, extraParams = {}) {
  if (!ref) return console.warn("[cueSeq] ⚠️ Empty ref passed to triggerCueByRef");

  let expr = null;

  // 1️⃣ Try direct registry lookup
  if (window.cueRegistry && window.cueRegistry[ref]) {
    expr = window.cueRegistry[ref];
    console.log(`[cueSeq] 🔗 Resolved UID "${ref}" → ${expr}`);
  }

  // 2️⃣ Try if ref starts with "#" (strip it and retry)
  if (!expr && ref.startsWith("#")) {
    const id = ref.slice(1);
    if (window.cueRegistry && window.cueRegistry[id]) {
      expr = window.cueRegistry[id];
      console.log(`[cueSeq] 🔗 Resolved #UID "${id}" → ${expr}`);
    }
  }

  // 3️⃣ Fallback: try direct SVG element ID
  if (!expr) {
    const el = document.getElementById(ref.startsWith("#") ? ref.slice(1) : ref);
    if (el) expr = el.id;
  }

  // 4️⃣ Still nothing?
  if (!expr) {
    console.warn(`[cueSeq] ❌ Cue not found: ${ref}`);
    return;
  }

  // 🧠 Trigger it
  console.log(`[cueSeq] 🎬 Triggering resolved cue: ${expr}`);
  handleCueTrigger(triggerAst, false, true, cueSvgEl);
}


// /**
//  * waitForCueCompletion()
//  * ----------------------
//  * Future placeholder — currently just a delay fallback.
//  * Later this will listen for cue-specific completion events.
//  */
// async function waitForCueCompletion(ref) {
//   // TODO: implement real completion tracking
//   await delay(1000); // fallback 1s per cue
// }











