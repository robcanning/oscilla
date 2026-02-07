/**
 * TOUCH-DRAG SEEK HANDLER (with momentum / inertia)
 * --------------------------------------------------
 * Extracted from oscillaTransport.js
 *
 * Behavior:
 *   - Drag left/right to scrub through the score
 *   - Release -> continues with momentum, gradually slowing down
 *   - Tap anywhere during momentum -> stops immediately
 *   - Feels like iOS scroll inertia
 */

import { resetAllFadePriming } from "../cues/fade.js";
import { dismissAllStopwatchOverlays } from "../cues/timers.js";
import { updateSpeedFromPosition } from "../cues/speed.js";

(() => {
  const scoreArea = document.getElementById("scoreContainer");
  if (!scoreArea) {
    console.warn("[TouchSeek] #scoreContainer not found");
    return;
  }

  // --- Configuration ---
  const DRAG_THRESHOLD = 10;          // px before we consider it a drag
  const SEND_INTERVAL = 100;          // ms between WS updates
  const SEEK_END_DELAY = 300;         // ms after momentum ends before resuming playback
  const MOMENTUM_INTERVAL = 16;       // ~60fps
  
  // Momentum physics — can be overridden by preferences
  // window.touchSeekFriction and window.touchSeekStopThreshold are set by oscillaPreferences.js
  function getFriction() {
    return window.touchSeekFriction ?? 0.95;  // Higher = longer glide
  }
  function getStopThreshold() {
    return window.touchSeekStopThreshold ?? 5; // Stop when velocity drops below this
  }

  // --- State ---
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startPlayheadX = 0;
  let wasPlayingBeforeDrag = false;
  let lastSendTime = 0;
  let seekEndTimer = null;
  let hasMoved = false;

  // Velocity tracking
  let velocitySamples = [];
  let currentVelocity = 0;
  let momentumTimer = null;
  let isMomentumActive = false;

  // --- Helpers ---
  function getLocalScale() {
    if (window.localScale) return window.localScale;
    
    const svg = document.querySelector("#scrollStage svg, #scoreInner svg");
    if (!svg || !window.scoreWidth) return 1;
    
    const renderedWidth = svg.getBoundingClientRect().width;
    return renderedWidth / window.scoreWidth;
  }

  function clampPlayhead(x) {
    return Math.max(0, Math.min(x, window.scoreWidth || x));
  }

  function calculateVelocity() {
    if (velocitySamples.length < 2) return 0;

    // Use recent samples for smoother velocity
    const recent = velocitySamples.slice(-6);
    if (recent.length < 2) return 0;

    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = (last.time - first.time) / 1000;

    if (dt <= 0) return 0;

    const dx = last.x - first.x;
    const scale = getLocalScale();
    const worldDx = -dx / scale;

    return worldDx / dt;
  }

  function updatePlayheadPosition(newX, sendWs = true) {
    window.playheadX = clampPlayhead(newX);

    if (window.scoreWidth > 0) {
      window.elapsedTime = (window.playheadX / window.scoreWidth) * (window.duration || 0);
    }

    window.scrollToPlayheadVisual?.();

    if (sendWs) {
      const now = performance.now();
      if (now - lastSendTime > SEND_INTERVAL) {
        lastSendTime = now;

        if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
          window.socket.send(JSON.stringify({
            type: "jump",
            playheadX: window.playheadX,
            elapsedTime: window.elapsedTime,
            source: "touch-drag"
          }));
        }
      }
    }
  }

  function startMomentum() {
    const stopThreshold = getStopThreshold();
    
    if (Math.abs(currentVelocity) < stopThreshold) {
      finishSeeking();
      return;
    }

    isMomentumActive = true;
    console.log("[TouchSeek] Momentum started, velocity:", currentVelocity.toFixed(1));

    let lastFrameTime = performance.now();

    function momentumFrame() {
      if (!isMomentumActive) return;

      const now = performance.now();
      const dt = (now - lastFrameTime) / 1000;
      lastFrameTime = now;

      // Apply friction (read fresh each frame in case prefs change)
      currentVelocity *= getFriction();

      // Stop if too slow
      if (Math.abs(currentVelocity) < getStopThreshold()) {
        console.log("[TouchSeek] Momentum finished");
        stopMomentum();
        finishSeeking();
        return;
      }

      // Calculate new position
      const delta = currentVelocity * dt;
      const newX = window.playheadX + delta;

      // Stop at boundaries
      if (newX <= 0) {
        updatePlayheadPosition(0);
        console.log("[TouchSeek] Hit start boundary");
        stopMomentum();
        finishSeeking();
        return;
      }
      if (newX >= window.scoreWidth) {
        updatePlayheadPosition(window.scoreWidth);
        console.log("[TouchSeek] Hit end boundary");
        stopMomentum();
        finishSeeking();
        return;
      }

      updatePlayheadPosition(newX);

      momentumTimer = setTimeout(momentumFrame, MOMENTUM_INTERVAL);
    }

    momentumFrame();
  }

  function stopMomentum() {
    isMomentumActive = false;
    currentVelocity = 0;
    if (momentumTimer) {
      clearTimeout(momentumTimer);
      momentumTimer = null;
    }
  }

  function finishSeeking() {
    // Send final position
    if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
      window.socket.send(JSON.stringify({
        type: "jump",
        playheadX: window.playheadX,
        elapsedTime: window.elapsedTime,
        source: "touch-drag-end"
      }));
    }

    // Reset flags after delay
    clearTimeout(seekEndTimer);
    seekEndTimer = setTimeout(() => {
      if (window.triggeredCues) {
        window.triggeredCues.clear();
        resetAllFadePriming?.();
        dismissAllStopwatchOverlays?.();
        window._cueInsideState?.clear();
        window.navRepeatMap?.clear();
      }

      window.resetCueEdgeTracking?.();
      updateSpeedFromPosition?.();
      window.updateSpeedDisplay?.();

      window.isSeeking = false;
      window.suppressCueTriggers = false;
      window.ignoreSyncPlayback = false;
      window.ignoreNextSync = true;
      window.recentlyRecalculatedPlayhead = true;

      setTimeout(() => {
        window.recentlyRecalculatedPlayhead = false;
      }, 500);

      if (wasPlayingBeforeDrag) {
        console.log("[TouchSeek] Resuming playback");
        window.isPlaying = true;
        window.animationPaused = false;
        window.startAnimation?.();
        window.startStopwatch?.();
      }

      wasPlayingBeforeDrag = false;

    }, SEEK_END_DELAY);
  }

  // --- Start drag ---
  function onTouchStart(e) {
    // If momentum is active, stop it immediately (tap to stop)
    if (isMomentumActive) {
      console.log("[TouchSeek] Tap to stop momentum");
      stopMomentum();
      finishSeeking();
      return;
    }

    if (e.touches.length > 1) return;

    const target = e.target;
    if (target.closest("#controls, #top-bar, button, input, sl-menu, .osc-anno-editor, .controlxy-handle, .controlxy-rotation-handle")) {
      return;
    }

    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    startPlayheadX = window.playheadX || 0;
    hasMoved = false;
    isDragging = false;

    velocitySamples = [{ x: startX, time: performance.now() }];
    currentVelocity = 0;

    wasPlayingBeforeDrag = window.isPlaying === true;
  }

  // --- During drag ---
  function onTouchMove(e) {
    if (e.touches.length > 1) {
      isDragging = false;
      return;
    }

    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    // Ignore vertical scrolling
    if (!isDragging && Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > DRAG_THRESHOLD) {
      return;
    }

    // Start dragging after threshold
    if (!isDragging && Math.abs(dx) > DRAG_THRESHOLD) {
      isDragging = true;
      hasMoved = true;

      window.isSeeking = true;
      window.suppressCueTriggers = true;
      window.ignoreSyncPlayback = true;

      if (wasPlayingBeforeDrag) {
        window.stopAnimation?.();
        window.isPlaying = false;
        window.animationPaused = true;
        console.log("[TouchSeek] Drag started");
      }

      if (window.triggeredCues) {
        window.triggeredCues.clear();
      }
      window._cueInsideState?.clear();

      clearTimeout(seekEndTimer);
    }

    if (!isDragging) return;

    e.preventDefault();

    // Track velocity samples
    const now = performance.now();
    velocitySamples.push({ x: touch.clientX, time: now });
    while (velocitySamples.length > 10) {
      velocitySamples.shift();
    }

    // Update playhead
    const scale = getLocalScale();
    const deltaWorld = -dx / scale;
    const newPlayheadX = clampPlayhead(startPlayheadX + deltaWorld);
    
    updatePlayheadPosition(newPlayheadX);
  }

  // --- End drag ---
  function onTouchEnd(e) {
    if (!isDragging && !hasMoved) {
      return;
    }

    if (!isDragging) return;

    isDragging = false;

    // Calculate release velocity
    currentVelocity = calculateVelocity();

    console.log("[TouchSeek] Released, velocity:", currentVelocity.toFixed(1));

    // Start momentum or finish immediately
    startMomentum();
  }

  // --- Cancel ---
  function onTouchCancel() {
    stopMomentum();

    if (isDragging) {
      isDragging = false;
      clearTimeout(seekEndTimer);

      window.isSeeking = false;
      window.suppressCueTriggers = false;
      window.ignoreSyncPlayback = false;

      wasPlayingBeforeDrag = false;
    }
  }

  // --- Attach listeners ---
  scoreArea.addEventListener("touchstart", onTouchStart, { passive: true });
  scoreArea.addEventListener("touchmove", onTouchMove, { passive: false });
  scoreArea.addEventListener("touchend", onTouchEnd, { passive: true });
  scoreArea.addEventListener("touchcancel", onTouchCancel, { passive: true });

  console.log("[TouchSeek] Touch-drag seek with momentum initialized");
})();
