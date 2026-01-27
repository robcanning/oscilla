/*!
 * oscillaSystemRAF.js — RequestAnimationFrame Loop & Tick Pipelines
 * Part of oscillaScore modular architecture
 * © 2025 Rob Canning — GPLv3
 */

import { scrollToPlayheadVisual, updateSeekBar } from './oscillaTransport.js';
import { checkCueTriggers } from './oscillaCueDispatcher.js';
import { checkImpulseRegions } from './oscillaAudio.js';
import { checkSynthRegions } from './oscillaSynth.js';
import { checkSpeedForPosition } from './oscillaSpeed.js';

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
      if (Math.abs(drift) > refWidth * 0.05) {
        window.playheadX = window.serverSyncPlayheadX;
      } else {
        window.playheadX += drift * 1.3 * dt;
      }
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
