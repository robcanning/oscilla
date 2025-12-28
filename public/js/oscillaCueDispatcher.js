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

// export const cueHandlers = {
//   cueSpeed: handleSpeedCue,
//   cuePause: handlePauseCue,
//   cueStop: handleStopCue,
//   cuePage: handlePageCue,
//   cueNav: handleNavCue,
//   cueAudio: handleAudioCue,
//   cueOsc: handleOscCue,
//   // cueOscTrigger: handleOscCue,
//   // cueOscValue: handleOscCue,
//   // cueOscSet: handleOscCue,
//   // cueOscRandom: handleOscCue,
//   // cueOscBurst: handleOscCue,
//   // cueOscPulse: handleOscCue,
//   // cueRepeat: handleRepeatCue,
//   // cueSeq: handleSeqCue,
// };

import { parseCueToAST } from "./oscillaParser.js";

import { handleStopwatchCue } from "./oscillaTimers.js";
import { handlePauseCue } from "./oscillaPause.js";
import { handleNavCue } from "./oscillaNav.js";
import { handleFadeCueFromAST, primeFadeTargetFromAST } from "./oscillaFade.js";
import { handleVideoCueFromAST } from "./oscillaVideo.js";
import { buildCueButtonsIn } from "./oscillaButton.js";
import { handleMetronomeCue } from "./oscillaMetro.js";
import { handleRotateCue } from "./oscillaAnimationRotate.js";
import { handleScaleCue } from "./oscillaAnimationScale.js";
import { handleO2PCue } from "./oscillaAnimationO2p.js";
import { handlePageCue } from "./oscillaPage.js";
import { handleAudioCue, handleAudioStopCue, stopAllAudio, activeAudioCues } from "./oscillaAudio.js";
import { propagate } from "./oscillaPropagate.js";
import { handleSpeedCue, handleSpeedRamp } from "./oscillaSpeed.js";
import { stopAllCueTexts } from "./oscillaText.js";
import { handleOscCue } from "./oscillaOSC.js";
import { handleOscCtrlCue } from "./oscillaOscCtrl.js";
import { handleStopCue } from "./oscillaStop.js";

// import { handleScaleCue, handleO2PCue } from "./oscillaAnim.js";

import { destroyAllHitLabels } from "./oscillaHitLabels.js";




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





function triggerNestedCues(ast, cueElement, options) {
  if (!ast || !ast.body || !Array.isArray(ast.body)) return;

  for (const childAst of ast.body) {
    if (!childAst?.type) continue;

    // propagate itself is not a cue
    if (childAst.type === "propagate") {
      triggerNestedCues(childAst, cueElement, options);
      continue;
    }

    // Trigger nested cue immediately
    handleCueTrigger(childAst, false, true, cueElement);
  }
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
  //  STEP 2: DEDUPE RULES
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
        console.error("[CUE] Could not parse cue expression:", cueId);
        return;
      }
      ast = legacy.ast;
    }
  }

  if (!ast) {
    console.error("[CueDSL] No AST resolved — cannot proceed.");
    return;
  }

  // console.log(`[CueDSL] Resolved AST Cue Type: ${ast.type}`, ast);

  // ---------------------------
  // 🚀 STEP 4: DISPATCH
  // ---------------------------
  switch (ast.type) {

    // Animation handlers
    case "cueScale": {
      handleScaleCue(ast, cueElement, { fromCueTrigger: true });
      triggerNestedCues(ast, cueElement);
      return;
    }

    case "cueRotate": {
      handleRotateCue(cueElement, ast.args, { fromCueTrigger: true });
      triggerNestedCues(ast, cueElement);
      return;
    }

    case "cueO2P": {
      handleO2PCue(cueElement, ast.args, { fromCueTrigger: true });
      triggerNestedCues(ast, cueElement);
      return;
    }

    case "cueOsc": {
      handleOscCue(ast, cueElement, { fromCueTrigger: true });
      return; // osc has no children
    }

    // case "cueOscCtrl": {
    //   handleOscCtrlCue(cueElement, ast.args, { fromCueTrigger: true });
    //   return;
    // }

    // Page navigation — ALWAYS retrigger
    case "cuePage":
    case "page":
      return handlePageCue(ast, cueElement);

    case "cueFade": return handleFadeCueFromAST(ast, cueElement);
    case "cueStopwatch": return handleStopwatchCue(ast, cueElement);
    case "cueVideo": return handleVideoCueFromAST(ast, cueElement);

    case "cueText":
    case "text":
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
  // console.log(`[cueComplete] ${type} complete → ${id}`);
  window.dispatchEvent(new CustomEvent("oscilla:cueComplete", {
    detail: { id, type, timestamp: Date.now() }
  }));
}







/////////////////////////////////////////////////////////

function splitCueId(id) {
  if (!id || typeof id !== "string") return [];

  return id
    .split(/\)\s*(?=[a-zA-Z_][a-zA-Z0-9_-]*\s*\()/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.endsWith(")") ? s : s + ")");
}

const CUE_PREFIX_RE = /^(?:cue:)?(oscCtrl|osc|scale|scaleXY|rotate|o2p|page|text|fade|pause|speed|audio|nav|stop|stopwatch|button|metro|metronome)\s*\(/i;

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

  function walk(node) {
    for (const child of node.children) {
      const id = child.id;

      // --------------------------------------------------
      //  Fast reject: no ID or cannot possibly be a cue
      // --------------------------------------------------
      if (!id || !CUE_PREFIX_RE.test(id)) {
        walk(child);
        continue;
      }

      // --------------------------------------------------
      // 🔹 Split compound cue IDs: "osc(...) scale(...)"
      // --------------------------------------------------
      const cueExprs = splitCueId(id);

      if (!cueExprs.length) {
        walk(child);
        continue;
      }

      for (const cueExpr of cueExprs) {
        //  Safety: prefix guard per expression
        if (!CUE_PREFIX_RE.test(cueExpr)) continue;

        let ast;
        try {
          ast = parseCueToAST(cueExpr);
        } catch {
          //  Silent skip — not a cue, not an error
          continue;
        }

        if (!ast || ast.type === "cueButton") continue;

        // =========================================
        // oscCtrl is NOT a triggerable cue.
        // Register it immediately and DO NOT add
        // to window.cues.
        // =========================================
        if (ast.type === "oscCtrl") {
          try {
            handleOscCtrlCue(child, ast.args || [], { fromAssign: true });
          } catch (err) {
            console.error("[oscCtrl] failed to register:", err);
          }
          //  Do not push to cues list
          walk(child);
          continue;
        }


        // -----------------------------------
        // Pre-prime fade targets
        // -----------------------------------
        if (ast.type === "cueFade") {
          window._fadeCues.set(child, ast);
          primeFadeTargetFromAST(ast, child);
        }

        const box = child.getBBox();
        const screenX = child.getBoundingClientRect().left + box.width / 2;

        cuesArray.push({
          id: cueExpr,
          ast,
          element: child,
          triggerX: screenX,
          triggerWidth: box.width,
          triggered: false
        });

        registerCueUid(cueExpr, "walk");
      }

      // Continue walking down
      walk(child);
    }
  }

  walk(svgRoot);

  // --------------------------------------------------------
  // BUILD CUE BUTTONS — PAGE vs SCROLL MODE (unchanged)
  // --------------------------------------------------------
  if (window.isPageOverlay) {
    buildCueButtonsIn(svgRoot, svgRoot);
  } else {
    const scrollContainer = document.getElementById("scoreInner");
    if (scrollContainer) {
      buildCueButtonsIn(svgRoot, scrollContainer);
    }
  }

  console.groupEnd();
  return cuesArray;
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

window.evaluateCueIntersections = true;

export async function checkCueTriggers() {
  // Global cue suppression guard (jumping, scrubbing, loading, etc.)
  if (window.suppressCueTriggers) return;

  // Ensure cues are ready
  if (!Array.isArray(window.cues)) return;

  // Sync elapsed time based on current scroll position
  window.elapsedTime =
    (window.playheadX / window.scoreWidth) * window.duration;

  //  Skip cue checks if paused, seeking, or not playing

  if (window.isSeeking || !window.evaluateCueIntersections) return;


  const playheadX = window.getPlayheadX();
  if (playheadX === null) {
    console.warn("[checkCueTriggers] Could not determine playhead x position.");
    return;
  }

  // Persistent per-cue state
  if (!window._prevCueLefts) window._prevCueLefts = new Map();
  if (!window._cueInsideState) window._cueInsideState = new Map();
  if (!window.triggeredCues) window.triggeredCues = new Set();

  const tolerance = 8; // px

  const containerRect =
    window.scoreContainer.getBoundingClientRect();

  for (const cue of window.cues) {
    if (!cue?.element) continue;

    const cueRect = cue.element.getBoundingClientRect();
    const cueLeft = cueRect.left - containerRect.left;
    const cueRight = cueLeft + cueRect.width;

    const prevLeft = window._prevCueLefts.has(cue.id)
      ? window._prevCueLefts.get(cue.id)
      : undefined;

    const prevInside = window._cueInsideState.get(cue.id) || false;
    const isInside = playheadX >= cueLeft && playheadX <= cueRight;

    // 🔧 update state FIRST
    window._cueInsideState.set(cue.id, isInside);

    // ======================================================
    // 🔊 OSC RE-ENTRANT PLAYHEAD TRIGGER
    // ======================================================
    if (cue.ast?.type === "cueOsc") {

      if (cue._armed === undefined) cue._armed = true;
      if (cue._lastOscFire === undefined) cue._lastOscFire = 0;

      const now = performance.now();
      const COOLDOWN = 80;

      // ENTER
      if (!prevInside && isInside && cue._armed) {
        if (now - cue._lastOscFire >= COOLDOWN) {
          handleCueTrigger(cue.ast, false, true, cue.element);
          cue._armed = false;
          cue._lastOscFire = now;
          // console.log(`[osc] ENTER → ${cue.id}`);
        }
      }

      // EXIT
      if (prevInside && !isInside) {
        cue._armed = true;
        // console.log(`[osc] EXIT → rearmed ${cue.id}`);
      }
    }


    // Initialise state on first encounter
    if (prevLeft === undefined) {
      window._prevCueLefts.set(cue.id, cueLeft);
      window._cueInsideState.set(cue.id, isInside);
      continue;
    }

    // Forward scroll → cues move LEFT
    const movingForward = cueLeft < prevLeft;

    const crossedLeftEdgeForward =
      movingForward &&
      prevLeft > (playheadX + tolerance) &&
      cueLeft <= (playheadX + tolerance);

    const isRepeatNavCue =
      cue.ast?.type === "cueNav" &&
      cue.ast?.params &&
      cue.ast.params.repeats !== undefined;

    // ======================================================
    // 🎯 PRIMARY TRIGGER
    // ======================================================
    if (crossedLeftEdgeForward) {
      if (!isRepeatNavCue && window.triggeredCues.has(cue.id)) {
        // already fired → skip
      } else {
        // console.log(
        //   `[cueTrigger] ✅ Left-edge crossing → ${cue.id}`
        // );

        handleCueTrigger(
          cue.ast,
          false,      // isRemote
          true,       // force
          cue.element // UI / DOM anchor
        );

        if (!isRepeatNavCue) {
          window.triggeredCues.add(cue.id);
        }

      }
    }

    // Update state for next frame
    window._prevCueLefts.set(cue.id, cueLeft);
    window._cueInsideState.set(cue.id, isInside);


    // ======================================================
    // 🔁 REPEAT LOGIC (unchanged)
    // ======================================================
    for (const [repeatCueId, repeat] of Object.entries(
      window.repeatStateMap || {}
    )) {
      if (!repeat.active || !repeat.ready || !repeat.initialJumpDone) continue;

      let isAtRepeatEnd = false;

      if (repeat.endId === "self") {
        const repeatCue = window.cues.find(
          c => c.id === repeat.cueId || c.id.startsWith(`${repeat.cueId}-`)
        );
        if (repeatCue?.element) {
          const repeatRect =
            repeatCue.element.getBoundingClientRect();
          const repeatX =
            repeatRect.left - containerRect.left;
          const repeatEnd =
            repeatX + (repeatRect.width || 40);
          isAtRepeatEnd =
            playheadX >= repeatX && playheadX <= repeatEnd;
        }
      } else if (
        cue.id === repeat.endId ||
        cue.id.startsWith(`${repeat.endId}-`)
      ) {
        isAtRepeatEnd = true;
      }

      const now = Date.now();
      if (repeat.jumpCooldownUntil && now < repeat.jumpCooldownUntil) {
        continue;
      }

      if (isAtRepeatEnd) {
        const cooldown = 500;
        if (now - repeat.lastTriggerTime < cooldown) continue;

        repeat.lastTriggerTime = now;
        repeat.currentCount++;
        window.updateRepeatCountDisplay?.(repeat.currentCount);

        if (repeat.isInfinite || repeat.currentCount < repeat.count) {
          if (repeat.directionMode === "p") {
            repeat.currentlyReversing = !repeat.currentlyReversing;
          }

          try {
            await window.executeRepeatJump?.(
              repeat,
              repeatCueId
            );
          } catch (err) {
            console.error(
              `[repeat] ❌ Error during repeat jump (${repeatCueId}):`,
              err
            );
          }
        } else {
          repeat.active = false;
          window.hideRepeatCountDisplay?.();

          if (repeat.action === "stop") {
            window.stopAnimation?.();
            window.isPlaying = false;
            window.isMusicalPause = true;
            window.togglePlayButton?.();
          } else if (
            repeat.resumeId &&
            repeat.resumeId !== "self"
          ) {
            window.jumpToCueId?.(repeat.resumeId);
            window.isPlaying
              ? window.pausePlayback()
              : window.startPlayback();
          }
        }

        break; // prevent multiple repeat triggers in one frame
      }
    }
  }
}



window.resetCueEdgeTracking = function () {
  window._prevCueLefts = new Map();
  window._cueInsideState = new Map();
  window.triggeredCues = new Set();
};






// export function parseCueLegacy(cueId) {
//   // Extract cue type (e.g. cuePage, cueAudio, etc.)
//   const typeMatch = cueId.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
//   const type = typeMatch ? typeMatch[1] : null;
//   if (!type) return { type: cueId, cueParams: {}, cleanedId: cueId };

//   const cueParams = {};
//   let rest = cueId.slice(type.length);

//   // --- 🧠 Extract first parenthetical block safely (choice)
//   if (rest.startsWith("(")) {
//     let depth = 0;
//     let endIndex = -1;
//     for (let i = 0; i < rest.length; i++) {
//       const ch = rest[i];
//       if (ch === "(") depth++;
//       else if (ch === ")") {
//         depth--;
//         if (depth === 0) {
//           endIndex = i;
//           break;
//         }
//       }
//     }

//     if (endIndex !== -1) {
//       const inner = rest.slice(1, endIndex); // everything between ( ... )
//       cueParams.choice = isNaN(inner) ? inner.trim() : parseFloat(inner);
//       rest = rest.slice(endIndex + 1); // ✅ keep suffix intact (e.g. _wait(20)_next(page3))
//     }
//   }

//   // --- ✅ Parse all suffixes, multiline-safe
//   const regex = /_([a-zA-Z0-9]+)\(([\s\S]*?)\)/g;
//   let match;
//   while ((match = regex.exec(rest)) !== null) {
//     const [, key, value] = match;

//     if (key === "style") {
//       const rawStyle = match[2];
//       const kvRegex = /([\w-]+)\s*:\s*(("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|rgba?\([^)]*\)|[^,]+))/g;
//       const obj = {};
//       let m;
//       while ((m = kvRegex.exec(rawStyle)) !== null) {
//         const kRaw = m[1].trim().toLowerCase();
//         let vRaw = m[2].trim().replace(/^["']|["']$/g, "");
//         if (!/^rgba?\(/i.test(vRaw) && !isNaN(vRaw) && vRaw !== "") vRaw = parseFloat(vRaw);
//         obj[kRaw] = vRaw;
//       }
//       cueParams.style = obj;
//     } else {
//       // 🔧 Handle numbers and strings
//       cueParams[key] = isNaN(value) ? value.trim() : parseFloat(value);
//     }
//   }

//   return { type, cueParams, cleanedId: cueId };
// }


// function parseKeyValueParams(str, cueParams) {
//   const regex = /_([a-zA-Z0-9]+)\(([^)]+)\)/g;
//   let m;
//   while ((m = regex.exec(str)) !== null) {
//     const [, key, value] = m;
//     cueParams[key] = isNaN(value) ? value : parseFloat(value);
//   }
// }


if (window.triggeredCues)
  window.triggeredCues.clear();
window._cueInsideState?.clear();








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








/* ============================================================================
 *  Unified Delayed Start System  (start:N)
 *  -------------------------------------------------
 *  Purpose:
 *    Allows any cue-triggered animation (rotate, scale, o2p, text, video, audio)
 *    to specify start:N meaning “begin N seconds after the cue triggers.”
 *
 *  Behavior:
 *    • start:N is optional (default = immediate).
 *    • start:0 behaves as immediate.
 *    • Works for both trig:auto and trig:edge.
 *    • Delay is real-time (independent of playback speed).
 *    • Multiple calls for same cue-UID overwrite the previous pending trigger.
 *
 *  Registry:
 *    window.pendingCueStarts : Map(uid → { timeoutId, cfg, element, startFn })
 *      • Allows cancellation (on jump, mode change, rewind, etc.)
 *      • Prevents double-starts.
 *
 *  Usage:
 *    scheduleCueStart(cfg, element, () => { ...animation start... }, uid)
 *
 *  Cancellation:
 *    cancelPendingStartByUid(uid)
 *    cancelAllPendingStarts()
 *
 *  Debugging:
 *    console.table([...window.pendingCueStarts.keys()])
 *    console.log(window.pendingCueStarts)
 *
 * ============================================================================
 */

//////////////////////////////////////////////////////////////////////
// Unified delayed animation scheduling
window.pendingCueStarts ??= new Map();
/**
 * scheduleCueStart()
 * ------------------
 * Unified start:N delay mechanism for all animation cues.
 *
 * cfg.start   = delay in seconds (optional, 0 = immediate)
 * cfg._ghostClickable = true when prestate:ghostClickable was parsed
 * cfg._startBlocked   = true until user clicks
 * cfg._startCallback  = the callback invoked when user activates ghostClickable
 *
 * el        = target element for this animation
 * startFn   = callback that actually starts the animation
 * uid       = unique key identifying this animation instance
 */
// ============================================================================
// Unified delayed-start scheduler (start:N) + ghostClickable handling
// ============================================================================
// ============================================================================
// Unified delayed-start scheduler (start:N / tdelay)
// Supports:
//   - ghostClickable(ms)
//   - fadein(ms)
//   - all other prestates
//   - immediate and delayed starts
//
// RULES:
//   • If ghostClickable && delay == 0 → FADE NOW, DO NOT AUTOSTART
//   • If ghostClickable && delay > 0  → WAIT, THEN FADE, STILL DO NOT AUTOSTART
//   • Only start animation when cfg._startBlocked === false
// ============================================================================
// ============================================================================
// UPDATED scheduleCueStart — supports ghostClickable(playhead) mode
// ============================================================================
//
// Replace your scheduleCueStart in oscillaCueDispatcher.js with this version.
//
// CHANGES:
// - For ghostClickable(playhead), skip the timed fade entirely
// - Element stays invisible until playhead intersection triggers armGhostClickable()
//
// ============================================================================

window.pendingCueStarts ??= new Map();

export function scheduleCueStart(cfg, el, startFn, uid) {
  const delay = Number(cfg.start ?? 0);

  // console.log("[startScheduler] ENTER", {
  //   uid,
  //   delay,
  //   ghostClickable: cfg._ghostClickable,
  //   ghostPlayheadMode: cfg._ghostPlayheadMode,
  //   ghostDelayMs: cfg._ghostDelayMs,
  //   blocked: cfg._startBlocked,
  //   el
  // });

  // Cancel previous pending start for this uid
  if (window.pendingCueStarts.has(uid)) {
    const old = window.pendingCueStarts.get(uid);
    clearTimeout(old.timeoutId);
    window.pendingCueStarts.delete(uid);
  }

  // ========================================================================
  // GHOSTCLICKABLE(PLAYHEAD) MODE - Skip all timed fades
  // Element stays invisible until playhead intersection
  // ========================================================================
  if (cfg._ghostClickable && cfg._ghostPlayheadMode) {
    // console.log("[startScheduler] ghostClickable(playhead) → staying invisible, waiting for playhead", { uid });
    // Don't schedule anything - armGhostClickable() will be called by playhead intersection
    return;
  }

  // ========================================================================
  // GHOSTCLICKABLE WITH DELAY - Use _ghostDelayMs for arm timing
  // ========================================================================
  if (cfg._ghostClickable && cfg._ghostDelayMs > 0) {
    // console.log(`[startScheduler] ghostClickable timed → arming in ${cfg._ghostDelayMs}ms`, { uid });

    const timeoutId = setTimeout(() => {
      // console.log("[startScheduler] 🔥 ghostClickable delay done → arming", { uid });
      window.pendingCueStarts.delete(uid);

      if (typeof cfg._applyPrestateOnStart === "function") {
        cfg._applyPrestateOnStart();
      }
    }, cfg._ghostDelayMs);

    window.pendingCueStarts.set(uid, {
      timeoutId,
      cfg,
      el,
      startFn,
      createdAt: performance.now(),
    });
    return;
  }

  // ========================================================================
  // IMMEDIATE START (delay=0)
  // ========================================================================
  if (!delay || delay <= 0) {

    // ---------------- ghostClickable immediate fade ----------------
    if (cfg._ghostClickable && cfg._startBlocked) {
      // console.log("[startScheduler] ghostClickable immediate → fade to ghost only", { uid });

      if (typeof cfg._applyPrestateOnStart === "function") {
        cfg._applyPrestateOnStart();   // fade to ghostOpacity
      }

      return; // DO NOT START ANIMATION
    }

    // ---------------- normal immediate start ----------------
    // console.log("[startScheduler] Immediate start → uid:", uid);
    startFn();
    return;
  }

  // ========================================================================
  // DELAYED START (delay > 0)
  // ========================================================================
  // console.log(`[startScheduler] Scheduling start in ${delay}s → uid=${uid}`);

  const timeoutId = setTimeout(() => {

    // console.log("[startScheduler] 🔥 FIRING delayed start → uid:", uid);
    window.pendingCueStarts.delete(uid);

    // ---------------- ghostClickable delayed fade ----------------
    if (cfg._ghostClickable && cfg._startBlocked) {
      // console.log("[startScheduler] ghostClickable delay done → fade to ghost only", { uid });

      if (typeof cfg._applyPrestateOnStart === "function") {
        cfg._applyPrestateOnStart();   // fade to ghostOpacity
      }

      return; // DO NOT START ANIMATION YET
    }

    // ---------------- normal delayed start ----------------
    try {
      startFn();
    } catch (err) {
      // console.error("[startScheduler] ERROR in startFn:", err);
    }

  }, delay * 1000);

  // register pending start
  window.pendingCueStarts.set(uid, {
    timeoutId,
    cfg,
    el,
    startFn,
    createdAt: performance.now(),
  });

  // console.log("[startScheduler] stored pending", [...window.pendingCueStarts.keys()]);
}

// ============================================================================
// Cancel all pending starts
// ============================================================================
export function cancelAllPendingStarts() {
  for (const [uid, entry] of window.pendingCueStarts.entries()) {
    clearTimeout(entry.timeoutId);
  }
  window.pendingCueStarts.clear();
  // console.log("[startScheduler] All pending delayed-starts cancelled.");
}

// ============================================================================
// Cancel one pending start
// ============================================================================
export function cancelPendingStartByUid(uid) {
  const e = window.pendingCueStarts.get(uid);
  if (!e) return;
  clearTimeout(e.timeoutId);
  window.pendingCueStarts.delete(uid);
  // console.log(`[startScheduler] cancelled pending start for ${uid}`);
}


//////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////




