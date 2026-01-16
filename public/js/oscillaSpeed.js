// speed.js

/**
 * ============================================================================
 * SPEED CUES — POSITIONAL (SVG traversal)
 * ============================================================================
 * speed(x) cues embedded in SVG are POSITION-BASED and apply INSTANTLY.
 * They NEVER ramp and NEVER broadcast during traversal.
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
  return newSpeedMap;
}

export let speedCueMap = [];

/**
 * Returns the active speed multiplier for a given X position.
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
 */

let lastCheckedSpeed = null;

export function checkSpeedForPosition() {
  if (!speedCueMap || speedCueMap.length === 0) return;
  if (!window.scoreWidth || window.playheadX == null) return;
  
  const correctSpeed = getSpeedForPosition(window.playheadX);
  
  if (correctSpeed === lastCheckedSpeed) return;
  lastCheckedSpeed = correctSpeed;
  
  if (window.speedMultiplier === correctSpeed) return;
  
  console.log(`[speedWatch] Position requires speed ${correctSpeed}, currently ${window.speedMultiplier}`);
  
  window.speedMultiplier = correctSpeed;
  window.updateSpeedDisplay?.();
  
  if (
    window.wsEnabled &&
    window.socket?.readyState === WebSocket.OPEN &&
    !window.incomingServerUpdate
  ) {
    window.socket.send(JSON.stringify({
      type: "set_speed_multiplier",
      multiplier: correctSpeed,
      source: "position_watch"
    }));
  }
}

export function resetSpeedWatcher() {
  lastCheckedSpeed = null;
}

/**
 * ============================================================================
 * SPEED RAMP ENGINE — LOCAL ONLY
 * ============================================================================
 * Ramps animate speed LOCALLY.
 * The server is updated ONLY ONCE at ramp completion.
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
 * INSTANT SPEED CHANGE (non-ramped cue)
 * ============================================================================
 */
export function handleSpeedCue(_uid, newMultiplier) {
  newMultiplier = Number(newMultiplier);
  if (!Number.isFinite(newMultiplier) || newMultiplier <= 0) return;
  if (window.speedMultiplier === newMultiplier) return;

  window.speedMultiplier = newMultiplier;
  window.updateSpeedDisplay?.();

  if (
    window.wsEnabled &&
    window.socket?.readyState === WebSocket.OPEN &&
    !window.incomingServerUpdate
  ) {
    window.socket.send(
      JSON.stringify({
        type: "set_speed_multiplier",
        multiplier: newMultiplier,
        playheadX: window.playheadX ?? null,
        t: Date.now(),
      })
    );
  }
}

/**
 * ============================================================================
 * EXECUTE cueSpeed AST (parser already supports this)
 * ============================================================================
 * This is the ONLY place ramps should be triggered from cues.
 */
export function executeSpeedCue(ast) {
  if (!ast || ast.type !== "cueSpeed") return;

  const current = Number(window.speedMultiplier ?? 1);
  let target = current;

  if (Number.isFinite(ast.add)) {
    target = current + ast.add;
  } else if (Number.isFinite(ast.value)) {
    target = ast.value;
  }

  if (!Number.isFinite(target) || target <= 0) return;

  if (Number.isFinite(ast.dur) && ast.dur > 0) {
    handleSpeedRamp(current, target, ast.dur, ast.ease);
  } else {
    handleSpeedCue(ast.uid, target);
  }
}
