/**
 * TRANSPORT NAVIGATION
 * --------------------
 * Extracted from oscillaTransport.js
 *
 * Contains:
 *   - jumpToCueId (jump to any cue element by ID)
 *   - Rehearsal mark navigation (jump/next/prev/reset/sync)
 *   - Arrow Up/Down keyboard handlers for rehearsal marks
 *   - Fast Forward / Rewind button handlers
 */

import { getWorldX, scrollToPlayheadVisual } from "./oscillaTransport.js";
import { resetAllFadePriming } from "../cues/fade.js";
import { dismissAllStopwatchOverlays } from "../cues/timers.js";
import { updateSpeedFromPosition } from "../cues/speed.js";

// ============================================================================
// REHEARSAL MARK NAVIGATION STATE
// ============================================================================

let currentRehearsalIndex = 0;

// ============================================================================
// JUMP TO CUE BY ID
// ============================================================================

export const jumpToCueId = (id) => {
  const target = window.cues?.find(c => c.id === id || c.id.startsWith(id + "-"))
    || document.getElementById(id);

  if (!target) {
    console.warn(`[jumpToCueId] Cue not found: ${id}`);
    return;
  }

  // Get accurate world position using getBoundingClientRect
  const targetX = getWorldX(target);

  // Set world playhead
  window.playheadX = targetX;

  // Sync musical timeline
  window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;

  // Convert world -> screen (centering, padding, canonicalScale)
  scrollToPlayheadVisual();

  window.ignoreNextSync = true;

  // Sync to other clients
  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    window.socket.send(JSON.stringify({
      type: "jump",
      playheadX: window.playheadX,
      elapsedTime: window.elapsedTime,
    }));
  }

  window.resetAnnotationPlayheadTriggers?.();
};

window.jumpToCueId = jumpToCueId;

// ============================================================================
// REHEARSAL MARK NAVIGATION
// ============================================================================

/**
 * Jump to a specific rehearsal mark by name
 * @param {string} mark - The rehearsal mark name (e.g., "A", "B", "0")
 */
export function jumpToRehearsalMark(mark) {
  console.log(`[JUMP] Requested jump to rehearsal mark: ${mark}`);

  const rehearsalMarks = window.rehearsalMarks;
  if (!rehearsalMarks) {
    console.error("[JUMP] No rehearsal marks loaded.");
    return;
  }

  const entry = rehearsalMarks[mark];
  if (!entry) {
    console.error(`[JUMP] Mark "${mark}" not found.`);
    return;
  }

  // Disable cues during jump
  window.suppressCueTriggers = true;

  // Pause during teleport
  window.isPlaying = false;
  window.animationPaused = true;

  // Teleport playhead to the stored world X position
  window.playheadX = entry.x;
  
  // Sync musical timeline
  window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;
  
  scrollToPlayheadVisual();

  // Prevent drift glitch
  window.lastAnimationFrameTime = null;

  // Reset cue state
  window._prevCueLefts = new Map();
  window._cueInsideState = new Map();
  window.triggeredCues = new Set();
  
  // Reset other state
  resetAllFadePriming?.();
  dismissAllStopwatchOverlays?.();
  window.navRepeatMap?.clear();
  window.resetAnnotationPlayheadTriggers?.();
  window.resetCueEdgeTracking?.();

  // Apply speed for new position
  updateSpeedFromPosition?.();
  window.updateSpeedDisplay?.();

  // Notify server
  if (window.socket && window.socket.readyState === WebSocket.OPEN) {
    window.socket.send(JSON.stringify({ 
      type: "jump", 
      playheadX: window.playheadX,
      elapsedTime: window.elapsedTime
    }));
  }

  window.suppressCueTriggers = false;
  
  // Update current index to match the mark we jumped to
  const sortedMarks = window.sortedMarks || [];
  const newIndex = sortedMarks.indexOf(mark);
  if (newIndex !== -1) {
    currentRehearsalIndex = newIndex;
  }

  console.log(`[JUMP] Jumped to "${mark}" at playheadX: ${window.playheadX}`);
}

window.jumpToRehearsalMark = jumpToRehearsalMark;

/**
 * Jump to the next rehearsal mark
 */
export function jumpToNextRehearsalMark() {
  const sortedMarks = window.sortedMarks || [];
  
  if (sortedMarks.length === 0) {
    console.warn("[NAV] No rehearsal marks available.");
    return;
  }

  if (currentRehearsalIndex < sortedMarks.length - 1) {
    currentRehearsalIndex++;
    const nextMark = sortedMarks[currentRehearsalIndex];
    console.log(`[NAV] Forward to: ${nextMark} (Index: ${currentRehearsalIndex})`);
    jumpToRehearsalMark(nextMark);
  } else {
    console.log("[NAV] Already at the last rehearsal mark.");
  }
}

window.jumpToNextRehearsalMark = jumpToNextRehearsalMark;

/**
 * Jump to the previous rehearsal mark
 */
export function jumpToPreviousRehearsalMark() {
  const sortedMarks = window.sortedMarks || [];
  
  if (sortedMarks.length === 0) {
    console.warn("[NAV] No rehearsal marks available.");
    return;
  }

  if (currentRehearsalIndex > 0) {
    currentRehearsalIndex--;
    const prevMark = sortedMarks[currentRehearsalIndex];
    console.log(`[NAV] Back to: ${prevMark} (Index: ${currentRehearsalIndex})`);
    jumpToRehearsalMark(prevMark);
  } else {
    console.log("[NAV] Already at the first rehearsal mark.");
  }
}

window.jumpToPreviousRehearsalMark = jumpToPreviousRehearsalMark;

/**
 * Reset rehearsal index (call when loading new score or rewinding to start)
 */
export function resetRehearsalIndex() {
  currentRehearsalIndex = 0;
}

window.resetRehearsalIndex = resetRehearsalIndex;

/**
 * Sync rehearsal index to current playhead position
 * Useful after seeking or manual position changes
 */
export function syncRehearsalIndexToPlayhead() {
  const sortedMarks = window.sortedMarks || [];
  const rehearsalMarks = window.rehearsalMarks || {};
  
  if (sortedMarks.length === 0) return;
  
  // Find the last mark that's at or before current playhead
  let newIndex = 0;
  for (let i = 0; i < sortedMarks.length; i++) {
    const mark = sortedMarks[i];
    const markX = rehearsalMarks[mark]?.x || 0;
    if (markX <= window.playheadX) {
      newIndex = i;
    } else {
      break;
    }
  }
  
  currentRehearsalIndex = newIndex;
}

window.syncRehearsalIndexToPlayhead = syncRehearsalIndexToPlayhead;

// ============================================================================
// REHEARSAL MARK KEYBOARD NAVIGATION (Arrow Up/Down)
// ============================================================================

document.addEventListener('keydown', (event) => {
  if (window.oscillaTextInputActive && event.key !== "Escape") return;
  
  if (!["ArrowUp", "ArrowDown"].includes(event.key)) return;
  
  event.preventDefault();
  
  if (event.key === "ArrowUp") {
    jumpToNextRehearsalMark();
  } else if (event.key === "ArrowDown") {
    jumpToPreviousRehearsalMark();
  }
});

// ============================================================================
// FAST FORWARD / REWIND BUTTON HANDLERS
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  const fastForwardBtn = document.getElementById('fast-forward-button');
  const fastRewindBtn = document.getElementById('fast-rewind-button');
  
  if (fastForwardBtn) {
    fastForwardBtn.addEventListener('click', () => {
      console.log("[NAV] Fast Forward clicked");
      jumpToNextRehearsalMark();
    });
  }
  
  if (fastRewindBtn) {
    fastRewindBtn.addEventListener('click', () => {
      console.log("[NAV] Fast Rewind clicked");
      jumpToPreviousRehearsalMark();
    });
  }
});
