/*!
 * oscillaSystemRAF.js — RequestAnimationFrame Loop & Tick Pipelines
 * Part of oscillaScore modular architecture
 * © 2025 Rob Canning — GPLv3
 */

import { scrollToPlayheadVisual, updateSeekBar } from '../oscillaTransport.js';
import { checkCueTriggers } from '../cues/cueDispatcher.js';
import { checkImpulseRegions } from '../cues/audio.js';
import { checkSynthRegions } from '../cues/synth.js';
import { checkSpeedForPosition } from '../cues/speed.js';

// ===========================
// Animation Loop
// ===========================

/**
 * Main animation loop function
 * Handles playhead advancement, drift correction, and tick pipelines
 * @param {number} currentTime - Current timestamp from requestAnimationFrame
 */
async function animate(currentTime) {
  // Always update the frame time to avoid huge dt jumps after pauses
  let dt = window.lastAnimationFrameTime !== null
    ? (currentTime - window.lastAnimationFrameTime) / 1000
    : 0;
  window.lastAnimationFrameTime = currentTime;

  // If seeking, skip processing but KEEP the loop running
  if (window.isSeeking) {
    window.animationFrameId = requestAnimationFrame(animate);
    return;
  }

  const refWidth = window.remoteScoreWidth || window.scoreWidth;

  // Advance playhead based on time delta
  if (window.isPlaying && dt > 0 && refWidth && window.duration) {
    const effectiveDeltaMs = dt * 1000 * (window.speedMultiplier || 1);
    window.playheadX = Math.min(
      window.playheadX + (effectiveDeltaMs / window.duration) * refWidth,
      refWidth
    );

    // Drift correction — but NOT right after manual navigation (rewind/seek/jump)
    if (
      window.serverSyncPlayheadX != null &&
      !window.ignoreNextSync &&
      !window.recentlyRecalculatedPlayhead
    ) {
      const drift = window.serverSyncPlayheadX - window.playheadX;
      const driftThreshold = refWidth * 0.02; // 2% threshold for "significant" drift
      
      // TELEPORT MODE: For ANY drift correction, suppress cues to prevent cascade
      // This is crucial when clients catch up to server time
      if (Math.abs(drift) > driftThreshold) {
        // Enable teleport mode - suppresses cue triggering
        window._isTeleporting = true;
        
        // Always jump directly - no smooth interpolation that triggers cues along the way
        window.playheadX = window.serverSyncPlayheadX;
        
        // Reset cue edge tracking to prevent false triggers from position discontinuity
        window.resetCueEdgeTracking?.();
        
        // Skip cue checks for a couple frames after teleport
        window._skipTriggerFrame = Math.max(window._skipTriggerFrame || 0, 3);
        
        console.log(`[RAF] TELEPORT: drift=${drift.toFixed(1)}px, jumped to ${window.playheadX.toFixed(1)}`);
        
        // Clear teleport flag after a short delay (next frame will see it)
        requestAnimationFrame(() => { window._isTeleporting = false; });
      } else if (Math.abs(drift) > 0.5) {
        // Small drift: gentle correction without triggering cues
        // Use smaller correction factor to be less aggressive
        window.playheadX += drift * 0.5 * dt;
      }
      // else: drift is negligible, no correction needed
    }
    scrollToPlayheadVisual();
  }

  // Update elapsed time based on playhead position
  if (window.duration && window.scoreWidth) {
    window.elapsedTime = (window.playheadX / window.scoreWidth) * window.duration;
  }

  // Update the seek bar to reflect current position
  updateSeekBar?.();

  // Process cue triggers (with skip frame support)
  if (window._skipTriggerFrame > 0) {
    window._skipTriggerFrame--;
  } else {
    await checkCueTriggers?.(window.elapsedTime);
  }

  // ===========================
  // Tick Pipelines
  // ===========================

  // Region-lifetime audioImpulse watcher
  if (typeof checkImpulseRegions === "function") {
    checkImpulseRegions();
  }

  // Synth region watcher
  if (typeof checkSynthRegions === "function") {
    checkSynthRegions();
  }

  // Speed trigger watcher
  if (typeof checkSpeedForPosition === "function") {
    checkSpeedForPosition();
  }

  // Check annotation playhead triggers
  if (typeof window.checkAnnotationPlayheadTriggers === "function") {
    window.checkAnnotationPlayheadTriggers();
  }

  // Tick non-anime custom animations
  if (window.runningAnimations) {
    for (const anim of window.runningAnimations.values()) {
      if (typeof anim.tick === "function") {
        anim.tick();
      }
    }
  }

  // Schedule next frame
  window.animationFrameId = requestAnimationFrame(animate);
}

/**
 * Start the animation loop
 */
function startAnimation() {
  console.log("[RAF] startAnimation called", {
    isPlaying: window.isPlaying,
    animationPaused: window.animationPaused,
    isSeeking: window.isSeeking,
    animationFrameId: window.animationFrameId
  });

  // Don't start animation while actively seeking
  if (window.isSeeking) {
    console.log("[RAF] Skipping startAnimation - still seeking");
    return;
  }

  // Reset the animation paused flag since we're starting
  window.animationPaused = false;

  // Always ensure the animation loop is running
  // Cancel any existing frame and start fresh to avoid stale state
  if (window.animationFrameId) {
    cancelAnimationFrame(window.animationFrameId);
  }

  requestAnimationFrame((time) => {
    window.lastAnimationFrameTime = time;
    window.animationFrameId = requestAnimationFrame(animate);
  });
}

/**
 * Stop the animation loop
 * Note: This sets the paused flag but doesn't cancel RAF or change isPlaying
 * Those are handled by pausePlayback() for proper state management
 */
function stopAnimation() {
  console.log("[RAF] stopAnimation called");
  window.animationPaused = true;
}

/**
 * Initialize the animation loop with optional custom pipelines
 * @param {Object} options - Configuration options
 * @param {Function[]} options.pipelines - Array of custom tick functions
 */
export function initAnimationLoop(options = {}) {
  const { pipelines = [] } = options;

  // Store custom pipelines for use in animate loop
  window._customAnimationPipelines = pipelines;

  // Expose animation functions globally
  window.animate = animate;
  window.startAnimation = startAnimation;
  window.stopAnimation = stopAnimation;
}

// ===========================
// Exports
// ===========================

export {
  animate,
  startAnimation,
  stopAnimation
};

// Initialize immediately with default configuration
initAnimationLoop();
