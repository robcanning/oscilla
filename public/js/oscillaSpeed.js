// oscillaSpeed.js

/**
 * ============================================================================
 * SPEED CUES — POSITIONAL (SVG traversal)
 * ============================================================================
 * speed(x) cues embedded in SVG are POSITION-BASED and apply INSTANTLY.
 * They represent a MULTIPLIER against the baseSpeedMultiplier from preferences.
 * 
 * Example with baseSpeedMultiplier = 0.3:
 *   - speed(1) → actual speed = 1 × 0.3 = 0.3
 *   - speed(3) → actual speed = 3 × 0.3 = 0.9
 */

/**
 * Extracts speed cues from SVG elements whose IDs are in the form:
 *   speed(1.25)
 *   speed(0.8)
 *   speed(2)
 *
 * @param {SVGElement} svgElement
 * @returns {Array<{ position: number, multiplier: number, rawId: string }>}
 */
export function extractSpeedCues(svgElement) {
  if (!svgElement) return [];

  const matches = svgElement.querySelectorAll("[id^='speed(']");
  const newSpeedMap = [];

  matches.forEach((el) => {
    const rawId = el.id;
    const match = rawId.match(/^speed\(\s*([0-9.]+)/);
    if (!match) return;

    const speedValue = parseFloat(match[1]);
    if (!Number.isFinite(speedValue)) return;

    // Absolute X position
    const bbox = el.getBBox();
    const matrix = el.getCTM();
    let x = bbox.x;
    if (matrix) x += matrix.e;

    newSpeedMap.push({
      position: x,
      multiplier: speedValue,
      rawId,
    });
  });

  newSpeedMap.sort((a, b) => a.position - b.position);
  console.log(`[speedCues] Extracted ${newSpeedMap.length} speed cues:`, newSpeedMap);
  return newSpeedMap;
}

export let speedCueMap = [];

/**
 * Updates the shared speedCueMap from external code (e.g., scoreSetup.js)
 */
export function setSpeedCueMap(newMap) {
  speedCueMap.length = 0;
  speedCueMap.push(...newMap);
  console.log(`[speedCueMap] Updated with ${speedCueMap.length} cues`);
}

/**
 * Returns the CUE speed multiplier for a given X position.
 * This is the raw value from the speed(x) cue, NOT multiplied by base.
 * Traversal changes are ALWAYS instantaneous.
 */
export function getSpeedForPosition(x) {
  if (!speedCueMap || speedCueMap.length === 0) return 1;

  let multiplier = 1;
  for (const cue of speedCueMap) {
    if (x >= cue.position) multiplier = cue.multiplier;
    else break;
  }
  return multiplier;
}


/**
 * ============================================================================
 * SPEED POSITION WATCHER — runs every frame
 * ============================================================================
 * Checks what speed should be at current playheadX and updates if needed.
 * Respects baseSpeedMultiplier from preferences.
 */
let lastCheckedCueSpeed = null;
let lastLogTime = 0;

export function checkSpeedForPosition() {
  // Guard clauses
  if (!speedCueMap || speedCueMap.length === 0) return;
  if (!window.scoreWidth || window.playheadX == null) return;
  if (window.isSeeking) return;  // Don't fight with manual seeking
  
  const cueSpeed = getSpeedForPosition(window.playheadX);
  const baseMultiplier = window.baseSpeedMultiplier || 1;
  const correctSpeed = cueSpeed * baseMultiplier;

  // Throttle logging to once per second
  const now = Date.now();
  if (now - lastLogTime > 1000) {
    console.log(`[speedWatch] pos=${window.playheadX.toFixed(0)}, cue=${cueSpeed}, base=${baseMultiplier}, actual=${correctSpeed.toFixed(2)}, current=${window.speedMultiplier?.toFixed(2)}`);
    lastLogTime = now;
  }
  
  // Only act if the CUE speed changed (not just floating point drift)
  if (cueSpeed === lastCheckedCueSpeed) {
    return;
  }
  
  lastCheckedCueSpeed = cueSpeed;
  
  // Skip if already at correct speed (with small tolerance for floating point)
  if (Math.abs(window.speedMultiplier - correctSpeed) < 0.001) return;
  
  console.log(`[speedWatch] ⚡ SPEED CHANGE: ${window.speedMultiplier?.toFixed(2)} → ${correctSpeed.toFixed(2)} (cue=${cueSpeed} × base=${baseMultiplier})`);
  
  // Update locally
  window.speedMultiplier = correctSpeed;
  window.updateSpeedDisplay?.();
  
  // Broadcast to server
  if (
    window.wsEnabled &&
    window.socket?.readyState === WebSocket.OPEN &&
    !window.incomingServerUpdate
  ) {
    window.socket.send(JSON.stringify({
      type: "set_speed_multiplier",
      multiplier: correctSpeed,
      cueSpeed: cueSpeed,
      baseMultiplier: baseMultiplier,
      source: "position_watch"
    }));
    console.log(`[speedWatch] 📡 Broadcasted speed=${correctSpeed.toFixed(2)} to server`);
  }
}

export function resetSpeedWatcher() {
  lastCheckedCueSpeed = null;
  lastLogTime = 0;
  console.log("[speedWatch] Reset");
}


/**
 * ============================================================================
 * SPEED RAMP ENGINE — LOCAL ONLY
 * ============================================================================
 * Ramps animate speed LOCALLY.
 * The server is updated ONLY ONCE at ramp completion.
 * 
 * NOTE: Ramp values are ACTUAL speeds (already multiplied by base), not cue values.
 */

let activeSpeedRamp = null;

export function handleSpeedRamp(start, end, durSec, easing = "linear") {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(durSec) ||
    durSec <= 0
  ) {
    console.warn("[cueSpeed] Invalid ramp params:", { start, end, durSec });
    return;
  }

  console.log(`[cueSpeed] Ramp start: ${start} → ${end} over ${durSec}s`);

  const startTime = performance.now();
  const durationMs = durSec * 1000;

  // Cancel any existing ramp
  activeSpeedRamp = { start, end, startTime, durationMs, easing };

  if (!window.speedRampLoopActive) {
    window.speedRampLoopActive = true;
    requestAnimationFrame(speedRampTick);
  }
}

function easeLinear(t) {
  return t;
}

function speedRampTick(now) {
  if (!activeSpeedRamp) {
    window.speedRampLoopActive = false;
    return;
  }

  const { start, end, startTime, durationMs } = activeSpeedRamp;
  const elapsed = now - startTime;
  let t = Math.min(elapsed / durationMs, 1);
  t = easeLinear(t);

  const value = start + (end - start) * t;

  // LOCAL UPDATE ONLY
  window.speedMultiplier = value;
  window.updateSpeedDisplay?.();

  if (t < 1) {
    requestAnimationFrame(speedRampTick);
  } else {
    // ---- RAMP COMPLETE ----
    console.log(`[cueSpeed] Ramp complete → ${end}`);

    window.speedMultiplier = end;
    window.updateSpeedDisplay?.();

    // SINGLE authoritative sync commit
    if (
      window.wsEnabled &&
      window.socket?.readyState === WebSocket.OPEN &&
      !window.incomingServerUpdate
    ) {
      window.socket.send(
        JSON.stringify({
          type: "set_speed_multiplier",
          multiplier: end,
          playheadX: window.playheadX ?? null,
          t: Date.now(),
        })
      );
    }

    activeSpeedRamp = null;
    window.speedRampLoopActive = false;
  }
}

/**
 * ============================================================================
 * INSTANT SPEED CHANGE (non-ramped cue, e.g., from cueSpeed trigger)
 * ============================================================================
 * NOTE: This receives the CUE value and multiplies by baseSpeedMultiplier
 */
export function handleSpeedCue(_uid, cueMultiplier) {
  cueMultiplier = Number(cueMultiplier);
  if (!Number.isFinite(cueMultiplier) || cueMultiplier <= 0) return;

  const baseMultiplier = window.baseSpeedMultiplier || 1;
  const actualSpeed = cueMultiplier * baseMultiplier;

  if (Math.abs(window.speedMultiplier - actualSpeed) < 0.001) return;

  console.log(`[cueSpeed] Instant change: cue=${cueMultiplier} × base=${baseMultiplier} = ${actualSpeed}`);

  window.speedMultiplier = actualSpeed;
  window.updateSpeedDisplay?.();

  if (
    window.wsEnabled &&
    window.socket?.readyState === WebSocket.OPEN &&
    !window.incomingServerUpdate
  ) {
    window.socket.send(
      JSON.stringify({
        type: "set_speed_multiplier",
        multiplier: actualSpeed,
        cueSpeed: cueMultiplier,
        baseMultiplier: baseMultiplier,
        playheadX: window.playheadX ?? null,
        t: Date.now(),
      })
    );
  }
}


/**
 * Force-update speed based on current position.
 * Called after seek/rewind/jump operations.
 */
export function updateSpeedFromPosition() {
  if (!speedCueMap || speedCueMap.length === 0) return;
  
  const cueSpeed = getSpeedForPosition(window.playheadX);
  const baseMultiplier = window.baseSpeedMultiplier || 1;
  const correctSpeed = cueSpeed * baseMultiplier;
  
  console.log(`[speedUpdate] Position ${window.playheadX?.toFixed(0)} → cue=${cueSpeed} × base=${baseMultiplier} = ${correctSpeed}`);
  
  window.speedMultiplier = correctSpeed;
  window.updateSpeedDisplay?.();
  
  // Broadcast to server
  if (window.wsEnabled && window.socket?.readyState === WebSocket.OPEN) {
    window.socket.send(JSON.stringify({
      type: "set_speed_multiplier",
      multiplier: correctSpeed,
      source: "seek_update"
    }));
  }
}


/**
 * ============================================================================
 * EXECUTE cueSpeed AST (parser already supports this)
 * ============================================================================
 * This is the ONLY place ramps should be triggered from cues.
 * Values here are CUE values (will be multiplied by base).
 */
export function executeSpeedCue(ast) {
  if (!ast || ast.type !== "cueSpeed") return;

  const baseMultiplier = window.baseSpeedMultiplier || 1;
  const currentActual = Number(window.speedMultiplier ?? baseMultiplier);
  const currentCue = currentActual / baseMultiplier; // reverse to get cue value
  
  let targetCue = currentCue;

  if (Number.isFinite(ast.add)) {
    targetCue = currentCue + ast.add;
  } else if (Number.isFinite(ast.value)) {
    targetCue = ast.value;
  }

  if (!Number.isFinite(targetCue) || targetCue <= 0) return;

  const targetActual = targetCue * baseMultiplier;

  if (Number.isFinite(ast.dur) && ast.dur > 0) {
    // Ramp operates on ACTUAL speeds
    handleSpeedRamp(currentActual, targetActual, ast.dur, ast.ease);
  } else {
    handleSpeedCue(ast.uid, targetCue);
  }
}