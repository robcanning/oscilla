import { pausePlayback } from "./transport.js";


window.resetCueEdgeTracking = function () {
    console.log(
        "[cueDebug] resetCueEdgeTracking() called. " +
        `prevCueLefts=${window._prevCueLefts ? window._prevCueLefts.size : 0}, ` +
        `insideState=${window._cueInsideState ? window._cueInsideState.size : 0}, ` +
        `triggeredCues=${window.triggeredCues ? window.triggeredCues.size : 0}`
    );

    window._prevCueLefts = new Map();
    window._cueInsideState = new Map();
    window.triggeredCues = new Set();
    //  window.navRepeatMap = new Map();
};

import { destroyAllHitLabels } from "./oscillaHitLabels.js";

export function handleNavCue(ast) {
    
    destroyAllHitLabels();
    
    // ------------------------------------------------------------
    // Extended debug logger
    // ------------------------------------------------------------
    const dbg = (...a) => console.log("[cueNav]", ...a);
    const dbgState = (label = "") => {
        console.log(
            `[cueNavState ${label}] playheadX=${window.playheadX} ` +
            `mode=${window.currentMode} ` +
            `isPlaying=${window.isPlaying} ` +
            `_prevCueLefts=${window._prevCueLefts ? window._prevCueLefts.size : 0} ` +
            `_cueInsideState=${window._cueInsideState ? window._cueInsideState.size : 0} ` +
            `triggeredCues=${window.triggeredCues ? window.triggeredCues.size : 0}`
        );
    };

    // ------------------------------------------------------------
    // Normalization of AST
    // ------------------------------------------------------------
    let action = ast.action ?? null;
    let target = ast.target ?? null;

    if (!action && ast.key) {
        if (ast.key === "mode") {
            action = ast.value || "scroll";
            target = ast.target ?? null;
        } else if (ast.key === "page") {
            action = ast.value || null;
            target = ast.target ?? null;
        }
    }

    // ------------------------------------------------------------
    // Top-level entry debug dump
    // ------------------------------------------------------------
    dbg("→ CALL", {
        action,
        target,
        uid: ast.uid ?? null,
        playheadX: window.playheadX,
        currentMode: window.currentMode
    });

    dbgState("before");

    if (!action) {
        dbg("⚠️ Ignored: missing action");
        return;
    }




    
// ============================================================
// CASE 1 — scroll (auto-resume)
// ============================================================
if (action === "scroll") {
  dbg("CASE: scroll", { target });

  // -----------------------------------------------
  // NAV REPEAT HANDLER: nav(scroll@G, repeats:N, uid:foo)
  // -----------------------------------------------
  let repeatEntry = null;

  if (ast.uid && ast.params && ast.params.repeats !== undefined) {
    const uid = ast.uid;
    const repeats = Number(ast.params.repeats);

    if (!window.navRepeatMap) window.navRepeatMap = new Map();

    repeatEntry = window.navRepeatMap.get(uid);
    if (!repeatEntry) {
      repeatEntry = { count: 0, max: repeats };
      window.navRepeatMap.set(uid, repeatEntry);
    }

    console.log(
      `[navRepeat] BEFORE jump uid=${uid} count=${repeatEntry.count}/${repeatEntry.max}`
    );

    if (repeatEntry.count >= repeatEntry.max) {
      console.log(
        `[navRepeat] PASS-THROUGH after ${repeatEntry.count} repeats`
      );
      // After final repeat: just let playhead continue forward
      return;
    }

    repeatEntry.count++;
    window.navRepeatMap.set(uid, repeatEntry);

    console.log(
      `[navRepeat] INCREMENT → count=${repeatEntry.count}/${repeatEntry.max}`,
      Array.from(window.navRepeatMap.entries())
    );
  }

  // -----------------------------------------------
  // Mode switching
  // -----------------------------------------------
  if (window.currentMode === "page") {
    dbg("Leaving page-mode → returnToScrollingScore()");
    window.returnToScrollingScore?.();
  }

  window._resumeAfterJump = true;

  // -----------------------------------------------
  // Perform the jump
  // -----------------------------------------------
  if (target) {
    dbg(`Jumping to rehearsal mark target="${target}"`);
    window.jumpToRehearsalMark?.(target);

    // We no longer try to micromanage cue edge sets here;
    // retrigger behavior is handled in checkCueTriggers.

    // Ensure animation loop is alive and playback continues
    if (!window.isPlaying) {
      console.log("[nav] Auto-resuming playback after scroll jump");
      window.startPlayback?.();
    }

    window.animationPaused = false;
    window.requestAnimationFrame?.(window.animate);

    dbgState("after jump");
  }

  dbg("END CASE: scroll");
  dbgState("end-scroll");
  return;
}




    // ============================================================
    // CASE 2 — scrollPaused (stay paused)
    // ============================================================
    if (action === "scrollPaused") {

        dbg("CASE: scrollPaused", { target });

        // Only leave page-mode if actually in page-mode
        if (window.currentMode === "page") {
            dbg("Leaving page-mode → returnToScrollingScore()");
            window.returnToScrollingScore?.();
        }

        dbg("PausePlayback()");
        pausePlayback();

        if (target) {
            dbg(`Jumping to rehearsal mark target="${target}"`);
            window.jumpToRehearsalMark?.(target);
            dbgState("after jump");
        }

        dbg("END CASE: scrollPaused");
        dbgState("end-scrollPaused");
        return;
    }

    // ============================================================
    // CASE 3 — direct page jump OR mode(page)
    // (handleCueTrigger(page(...)))
    // ============================================================
    dbg("CASE: page-like navigation", { action, target });

    if (typeof window.handleCueTrigger === "function") {
        window._resumeAfterJump = true;
        dbg(`Calling handleCueTrigger("page(${action})")`);
        window.handleCueTrigger(`page(${action})`);
        dbgState("after direct-page");
        return;
    }

    // ============================================================
    // Fallback: treat "action" as rehearsal ID
    // ============================================================
    dbg("CASE: fallback jumpToRehearsalMark", { action });
    window._resumeAfterJump = true;
    window.jumpToRehearsalMark?.(action);
    dbgState("after fallback");
}

