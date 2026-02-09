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
import { findMarkerByName, getSortedMarkerNavPoints } from "../interaction/markers.js";

// ============================================================================
// UNIFIED NAVIGATION STATE
// ============================================================================
// Merges rehearsal marks (from SVG) and user markers (from annotation system)
// into a single sorted list of navigation points.
// Rebuilds on every navigation action — cheap (microseconds for ~50 items)
// and avoids stale-cache bugs from marker CRUD bypassing invalidation.
// ============================================================================

let currentNavIndex = 0;

/**
 * Build unified list of nav points from rehearsal marks + user markers.
 * Sorted by world X position. Called on each nav action.
 * @returns {Array<{name: string, x: number, source: "rehearsal"|"marker"}>}
 */
function getUnifiedNavPoints() {
  const points = [];

  // Rehearsal marks (from SVG parsing)
  const sortedMarks = window.sortedMarks || [];
  const rehearsalMarks = window.rehearsalMarks || {};
  for (const name of sortedMarks) {
    const entry = rehearsalMarks[name];
    if (entry) {
      points.push({ name, x: entry.x, source: "rehearsal" });
    }
  }

  // User markers (from annotation system) — only named ones (not default "m")
  const markerPoints = getSortedMarkerNavPoints();
  points.push(...markerPoints);

  // Sort all by world X position
  points.sort((a, b) => a.x - b.x);

  return points;
}

window.getUnifiedNavPoints = getUnifiedNavPoints;

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
  let targetX = null;

  // Try rehearsal marks first
  if (rehearsalMarks) {
    const entry = rehearsalMarks[mark];
    if (entry) {
      targetX = entry.x;
    }
  }

  // Fallback: search user markers by name
  if (targetX === null) {
    const marker = findMarkerByName(mark);
    if (marker) {
      targetX = marker.placement.x;
      console.log(`[JUMP] Resolved "${mark}" via user marker at x=${targetX}`);
    }
  }

  if (targetX === null) {
    console.error(`[JUMP] Mark "${mark}" not found in rehearsal marks or user markers.`);
    return;
  }

  // Disable cues during jump
  window.suppressCueTriggers = true;

  // Pause during teleport
  window.isPlaying = false;
  window.animationPaused = true;

  // Teleport playhead to the resolved world X position
  window.playheadX = targetX;
  
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
  const navPoints = getUnifiedNavPoints();
  const newIndex = navPoints.findIndex(p => p.name === mark);
  if (newIndex !== -1) {
    currentNavIndex = newIndex;
  }

  console.log(`[JUMP] Jumped to "${mark}" at playheadX: ${window.playheadX}`);
}

window.jumpToRehearsalMark = jumpToRehearsalMark;

/**
 * Jump to a specific navigation point (rehearsal mark or user marker).
 * Rehearsal marks resolve by name, markers resolve by world X position directly.
 * @param {{name: string, x: number, source: "rehearsal"|"marker"}} point
 */
function jumpToNavPoint(point) {
  if (point.source === "rehearsal") {
    // Rehearsal marks go through name-based lookup
    jumpToRehearsalMark(point.name);
  } else {
    // Markers: jump directly to world X position (avoids name collision on "m")
    jumpToWorldX(point.x);
  }
}

/**
 * Jump playhead to an exact world X position.
 * Used for marker-based navigation where name lookup isn't reliable.
 * @param {number} worldX
 */
function jumpToWorldX(worldX) {
  console.log(`[JUMP] Direct jump to worldX: ${worldX}`);

  // Disable cues during jump
  window.suppressCueTriggers = true;

  // Pause during teleport
  window.isPlaying = false;
  window.animationPaused = true;

  // Teleport playhead
  window.playheadX = worldX;

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

  console.log(`[JUMP] Jumped to worldX: ${worldX}`);
}

/**
 * Jump to the next navigation point after current playhead position
 */
export function jumpToNextRehearsalMark() {
  const navPoints = getUnifiedNavPoints();
  
  if (navPoints.length === 0) {
    console.warn("[NAV] No navigation points available.");
    return;
  }

  // Find first nav point AFTER current playhead (small tolerance to avoid getting stuck)
  const nextIdx = navPoints.findIndex(p => p.x > window.playheadX + 1);
  if (nextIdx === -1) {
    console.log("[NAV] Already past the last navigation point.");
    return;
  }

  currentNavIndex = nextIdx;
  const next = navPoints[nextIdx];
  console.log(`[NAV] Forward to: ${next.name} (${next.source}) at x=${next.x}`);
  jumpToNavPoint(next);
}

window.jumpToNextRehearsalMark = jumpToNextRehearsalMark;

/**
 * Jump to the previous navigation point before current playhead position
 */
export function jumpToPreviousRehearsalMark() {
  const navPoints = getUnifiedNavPoints();
  
  if (navPoints.length === 0) {
    console.warn("[NAV] No navigation points available.");
    return;
  }

  // Find last nav point BEFORE current playhead (small tolerance)
  let prevIdx = -1;
  for (let i = navPoints.length - 1; i >= 0; i--) {
    if (navPoints[i].x < window.playheadX - 1) {
      prevIdx = i;
      break;
    }
  }

  if (prevIdx === -1) {
    console.log("[NAV] Already before the first navigation point.");
    return;
  }

  currentNavIndex = prevIdx;
  const prev = navPoints[prevIdx];
  console.log(`[NAV] Back to: ${prev.name} (${prev.source}) at x=${prev.x}`);
  jumpToNavPoint(prev);
}

window.jumpToPreviousRehearsalMark = jumpToPreviousRehearsalMark;

/**
 * Reset navigation index (call when loading new score or rewinding to start)
 */
export function resetRehearsalIndex() {
  currentNavIndex = 0;
}

window.resetRehearsalIndex = resetRehearsalIndex;

/**
 * Sync navigation index to current playhead position
 * Useful after seeking or manual position changes
 */
export function syncRehearsalIndexToPlayhead() {
  const navPoints = getUnifiedNavPoints();
  
  if (navPoints.length === 0) return;
  
  // Find the last nav point that's at or before current playhead
  let newIndex = 0;
  for (let i = 0; i < navPoints.length; i++) {
    if (navPoints[i].x <= window.playheadX) {
      newIndex = i;
    } else {
      break;
    }
  }
  
  currentNavIndex = newIndex;
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
